/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Dashboard host: serves the dashboard webview assets and bridges the webview RPC
 * contract over HTTP so the same bundle that runs inside VS Code also runs as a
 * Copilot app canvas or a standalone CLI. Runs in a plain Node process (no
 * `vscode` module) and answers pure RPC handlers directly. Agent-dependent
 * methods (LLM generation, skill triage) return a graceful error because there
 * is no local language model outside VS Code. */

import * as fs from 'fs';
import * as path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { Analyzer } from '../core/analyzer';
import { findLogsDirs, parseAllLogsAsyncDetailed, type LoadProgress, type ParseResult } from '../core/parser';
import type { DashboardHostKind } from '../webview/capabilities';
import type { DateFilter } from '../core/types/session-types';
import { getRpcHandler, setLlmProvider } from '../webview/panel-rpc';
import { PanelRequestService } from '../webview/panel-request-service';
import type { LlmProvider } from '../core/llm/provider';
import type { ResponseSink } from '../webview/panel-shared';
import { getDashboardShellHtml } from '../webview/dashboard-shell';

/** Parses every log directory into the normalized session model. Injectable so the
 *  CLI can fork a child process with a larger heap instead of parsing in-process. */
export type ParseAllFn = (logsDirs: string[], onProgress?: (p: LoadProgress) => void) => Promise<ParseResult>;

export interface CanvasHostOptions {
  /** Absolute path to the built `dist` directory (contains `webview/app.js` + `webview/styles.css`). */
  distDir: string;
  /** Name of the repo/folder the canvas was opened in; scopes the initial "Current" workspace filter. */
  repoName?: string;
  /** Which non-VS-Code host is embedding the dashboard. Reported through `getCapabilities`. */
  host?: DashboardHostKind;
  /** Overrides the in-process parse. Defaults to `parseAllLogsAsyncDetailed`. */
  parseAll?: ParseAllFn;
  /** Writes the summary export. Without it the Share page's export button is a no-op stub. */
  exportSummary?: (analyzer: Analyzer, filter?: DateFilter) => Promise<{ ok: boolean; cancelled?: boolean; folder?: string }>;
  /** Language model for the generative features. Without one they report themselves unavailable. */
  llm?: LlmProvider | null;
}

export interface CanvasHost {
  handle(req: IncomingMessage, res: ServerResponse): void;
  start(): void;
  dispose(): void;
}

type RequestEnvelope = { id?: unknown; method?: unknown; params?: unknown };

/* Methods that need a language model. With a provider installed they run through the
 * request service; without one they report themselves unavailable so the greyed-out UI
 * has something to say and no caller hangs. */
const WORKSPACE_SCANS = new Set<string>([
  'getWorkspaceDeps',
  'getSdlcToolAnalysis',
  'getSdlcRepoScan',
  'getSdlcGitHubData',
]);

const AGENT_ONLY = new Set<string>([
  'createSkill',
  'generateSkillContent',
  'generateLearningQuiz',
  'generateLearningResources',
  'generateCodeComparison',
  'generateDidYouKnow',
  'installSkill',
  'installCatalogItem',
  'triageSkills',
  'discoverCatalog',
  'triageCatalog',
  'reviewContextFiles',
  'explainOccurrence',
  'generateRule',
]);

/* Host-only methods backed by VS Code services. Return empty-but-valid shapes so
 * the still-visible pages render in a degraded state instead of erroring. */
const HOST_STUBS: Record<string, () => unknown> = {
  exportSummary: () => ({ ok: false, cancelled: true }),
  loadModelBudgets: () => ({}),
  saveModelBudgets: () => ({ ok: true }),
  showOutput: () => ({ ok: true }),
  // Opens the rule-trust review UI, which is a VS Code command. Outside VS Code
  // `rule-loader` already treats personal rules as trusted, so there is nothing to review.
  reviewLocalRules: () => ({ ok: false, error: 'Rule review is only available in the VS Code extension.' }),
};

/* Generation can take a while through a CLI-backed model; cap it so the UI never hangs. */
const REQUEST_SERVICE_TIMEOUT_MS = 300_000;

const NO_LLM = 'No language model available. Install the Claude Code CLI and make sure `claude` is on your PATH.';

const MIME: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

export function createCanvasHost(options: CanvasHostOptions): CanvasHost {
  const webviewDir = path.join(options.distDir, 'webview');
  const sseClients = new Set<ServerResponse>();

  let analyzer: Analyzer | undefined;
  let parseResult: ParseResult | undefined;
  let lastProgress: LoadProgress | undefined;
  let ready = false;
  let started = false;
  const currentWorkspace = options.repoName ?? '';
  const hostKind: DashboardHostKind = options.host ?? 'canvas';
  const llm = options.llm ?? null;
  setLlmProvider(llm);
  const exportSummary = options.exportSummary ?? (async () => ({ ok: false, cancelled: true }));

  /* The request service replies through a sink rather than returning, because it was built
   * to post into a webview. One pending promise per call bridges it to request/response. */
  let nextRequestId = 0;
  const pending = new Map<string, (data: unknown) => void>();
  const sink: ResponseSink = {
    post(id, data) { pending.get(id)?.(data); pending.delete(id); },
    event(method, data) { broadcast({ type: 'event', method, data }); },
  };
  /* Always constructed: several of its handlers are plain workspace scans that need no
   * model. The model-backed ones are gated separately and never reach this stand-in. */
  const unavailableLlm: LlmProvider = {
    call: () => Promise.reject(new Error(NO_LLM)),
    callJson: () => Promise.reject(new Error(NO_LLM)),
  };
  const requestService = new PanelRequestService(sink, () => analyzer, () => parseResult, llm ?? unavailableLlm, exportSummary);

  /** Returns a promise when the request service owns the method, otherwise null. */
  function runThroughRequestService(method: string, params: Record<string, unknown>): Promise<unknown> | null {
    const id = `host-${nextRequestId++}`;
    let accepted = false;
    const result = new Promise<unknown>(resolve => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ error: 'The language model did not respond in time.' });
      }, REQUEST_SERVICE_TIMEOUT_MS);
      pending.set(id, data => { clearTimeout(timer); resolve(data); });
      accepted = requestService.tryHandle({ type: 'request', id, method: method as never, params });
      if (!accepted) {
        clearTimeout(timer);
        pending.delete(id);
      }
    });
    return accepted ? result : null;
  }
  const parseAll: ParseAllFn = options.parseAll ?? (async (dirs, onProgress) => (await parseAllLogsAsyncDetailed(dirs, onProgress)).result);

  function broadcast(payload: unknown): void {
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of sseClients) {
      try { client.write(line); } catch { /* client gone */ }
    }
  }

  function sendJson(res: ServerResponse, body: unknown): void {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  }

  function sendStatus(res: ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
    res.end(message);
  }

  function isJsonRpcRequest(req: IncomingMessage): boolean {
    const contentType = req.headers['content-type'];
    return typeof contentType === 'string' && contentType.split(';', 1)[0].trim().toLowerCase() === 'application/json';
  }

  function isAllowedRpcOrigin(req: IncomingMessage): boolean {
    const host = req.headers.host;
    if (typeof host !== 'string') return false;
    let hostUrl: URL;
    try {
      hostUrl = new URL(`http://${host}`);
    } catch {
      return false;
    }
    if (hostUrl.hostname !== '127.0.0.1') return false;

    const origin = req.headers.origin;
    if (origin === undefined) return true;
    if (typeof origin !== 'string') return false;
    try {
      return new URL(origin).host === hostUrl.host;
    } catch {
      return false;
    }
  }

  function dispatchRpc(method: string, params: Record<string, unknown>): unknown {
    if (method === 'getCapabilities') return { host: hostKind, llm: llm !== null };
    if (method === 'exportSummary' && options.exportSummary) {
      if (!ready || !analyzer) return { error: 'Data is still loading.' };
      return options.exportSummary(analyzer, params.filter as DateFilter | undefined);
    }
    if (method in HOST_STUBS) return HOST_STUBS[method]();
    if (WORKSPACE_SCANS.has(method)) {
      const scanned = runThroughRequestService(method, params);
      if (scanned) return scanned;
      return { deps: [], mcpServers: [], repos: [] };
    }
    if (AGENT_ONLY.has(method)) {
      if (!llm) return { error: NO_LLM };
      if (!ready || !analyzer || !parseResult) return { error: 'Data is still loading.' };
      // Most generative methods live in the request service; `generateRule` and
      // `explainOccurrence` are in the shared handler table, so fall through for those.
      const handled = runThroughRequestService(method, params);
      if (handled) return handled;
    }

    if (!ready || !analyzer || !parseResult) return { error: 'Data is still loading.' };

    const handler = getRpcHandler(method);
    if (!handler) return { error: `Unknown method: ${method}` };
    return handler(analyzer, parseResult, params);
  }

  function handleRpc(req: IncomingMessage, res: ServerResponse): void {
    if (!isJsonRpcRequest(req)) {
      sendStatus(res, 415, 'Unsupported Media Type');
      return;
    }
    if (!isAllowedRpcOrigin(req)) {
      sendStatus(res, 403, 'Forbidden');
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      let id = '';
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as RequestEnvelope;
        id = typeof body.id === 'string' ? body.id : '';
        const method = typeof body.method === 'string' ? body.method : '';
        const params = (body.params && typeof body.params === 'object' ? body.params : {}) as Record<string, unknown>;

        const result = dispatchRpc(method, params);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).then(
            (data) => sendJson(res, { type: 'response', id, data }),
            (error: unknown) => sendJson(res, { type: 'response', id, data: { error: error instanceof Error ? error.message : 'Internal error' } }),
          );
        } else {
          sendJson(res, { type: 'response', id, data: result });
        }
      } catch (error: unknown) {
        sendJson(res, { type: 'response', id, data: { error: error instanceof Error ? error.message : 'Bad request' } });
      }
    });
  }

  function handleEvents(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    if (lastProgress) res.write(`data: ${JSON.stringify({ type: 'progress', ...lastProgress })}\n\n`);
    if (ready) res.write(`data: ${JSON.stringify({ type: 'dataReady', currentWorkspace })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  }

  function serveAsset(res: ServerResponse, file: string): void {
    let data: Buffer;
    try {
      data = fs.readFileSync(file);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  }

  function handle(req: IncomingMessage, res: ServerResponse): void {
    const url = (req.url ?? '/').split('?')[0];

    if (req.method === 'POST' && url === '/rpc') return handleRpc(req, res);
    if (url === '/events') return handleEvents(req, res);
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(getCanvasHtml(llm !== null));
      return;
    }
    if (url === '/app.js') return serveAsset(res, path.join(webviewDir, 'app.js'));
    if (url === '/app.js.map') return serveAsset(res, path.join(webviewDir, 'app.js.map'));
    if (url === '/styles.css') return serveAsset(res, path.join(webviewDir, 'styles.css'));

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }

  function start(): void {
    if (started) return;
    started = true;
    void (async () => {
      try {
        const dirs = findLogsDirs();
        const result = await parseAll(dirs, (p) => {
          lastProgress = p;
          broadcast({ type: 'progress', ...p });
        });
        parseResult = result;
        analyzer = new Analyzer(result.sessions, result.editLocIndex, result.workspaces);
        ready = true;
        broadcast({ type: 'dataReady', currentWorkspace });
        try {
          await analyzer.warmUp();
        } catch { /* warm-up is best effort */ }
      } catch (error: unknown) {
        broadcast({ type: 'progress', phase: -1, pct: 0, detail: error instanceof Error ? error.message : 'Failed to load sessions' });
      }
    })();
  }

  function dispose(): void {
    for (const client of sseClients) {
      try { client.end(); } catch { /* already closed */ }
    }
    sseClients.clear();
  }

  return { handle, start, dispose };
}

function getCanvasHtml(hasLlm: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Engineer Coach</title>
<style>${CANVAS_THEME_VARS}</style>
<link href="/styles.css" rel="stylesheet">
<script>${BRIDGE_SHIM}</script>
</head>
<body>
${getDashboardShellHtml({ includeSkillFinder: hasLlm, includeLevelUp: hasLlm })}
<script src="/app.js"></script>
</body>
</html>`;
}

/* Dark palette for the `--vscode-*` custom properties the bundled CSS reads.
 * Without VS Code these would fall back to per-rule defaults; defining them
 * once keeps the canvas visually consistent. */
const CANVAS_THEME_VARS = `:root{
--vscode-font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
--vscode-font-size:13px;
--vscode-editor-font-family:'SF Mono',Monaco,Menlo,Consolas,monospace;
--vscode-editor-background:#0d1117;
--vscode-foreground:#e6edf3;
--vscode-descriptionForeground:#8b949e;
--vscode-widget-border:#30363d;
--vscode-sideBar-background:#0d1117;
--vscode-input-background:#161b22;
--vscode-progressBar-background:#1f6feb;
--vscode-button-background:#238636;
--vscode-button-foreground:#ffffff;
--vscode-button-hoverBackground:#2ea043;
--vscode-errorForeground:#f85149;
--vscode-textLink-foreground:#58a6ff;
--vscode-textCodeBlock-background:#161b22;
--vscode-scrollbarSlider-background:#30363d80;
--vscode-scrollbarSlider-hoverBackground:#484f58;
--vscode-charts-orange:#db6d28;
--vscode-testing-iconPassed:#3fb950;
}
html,body{height:100%;margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);}`;

/* Stands in for the VS Code webview bridge. `acquireVsCodeApi` must exist before
 * app.js runs. RPC requests become POSTs to /rpc; responses, progress, and
 * dataReady arrive via SSE and are re-dispatched as window message events so the
 * unchanged webview message listener handles them. */
const BRIDGE_SHIM = `(function(){
var STATE_KEY='ai-engineer-coach-canvas-state';
function dispatch(data){window.dispatchEvent(new MessageEvent('message',{data:data}));}
var api={
postMessage:function(msg){
if(!msg||msg.type!=='request')return;
if(msg.method==='openExternal'){
var url=msg.params&&msg.params.url;
try{
if(typeof url==='string'&&url.toLowerCase().startsWith('https://')){
var safe=true;
for(var i=0;i<url.length;i++){var code=url.charCodeAt(i);if(code<=31||code===127){safe=false;break;}}
var parsed=safe&&new URL(url);
if(parsed&&parsed.protocol==='https:'&&parsed.hostname&&!parsed.username&&!parsed.password)window.open(parsed.href,'_blank','noopener');
}
}catch(e){}
dispatch({type:'response',id:msg.id,data:{ok:true}});
return;
}
fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:msg.id,method:msg.method,params:msg.params})})
.then(function(r){return r.json();})
.then(function(env){dispatch(env);})
.catch(function(e){dispatch({type:'response',id:msg.id,data:{error:String(e&&e.message||e)}});});
},
getState:function(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'null');}catch(e){return null;}},
setState:function(s){try{localStorage.setItem(STATE_KEY,JSON.stringify(s));}catch(e){}return s;}
};
window.acquireVsCodeApi=function(){return api;};
var es=new EventSource('/events');
es.onmessage=function(e){try{dispatch(JSON.parse(e.data));}catch(err){}};
})();`;
