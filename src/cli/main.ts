/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Standalone CLI: serves the dashboard over localhost with no VS Code and no Copilot app.
 * Reuses the same host that backs the Copilot canvas, so the webview bundle, the RPC
 * contract, and the origin checks are shared. Parsing runs in a forked child with a larger
 * heap because a terminal-agent log directory can reach several GB. */

import * as http from 'http';
import * as path from 'path';
import { fork, spawn, type ChildProcess, type ForkOptions } from 'child_process';
import * as fs from 'fs';
import { createCanvasHost, type ParseAllFn } from '../canvas/host';
import { parseAllLogsViaWorker } from '../core/parser-worker-host';
import { findLogsDirs, parseAllLogsAsyncDetailed } from '../core/parser';
import { Analyzer } from '../core/analyzer';
import {
  buildSummaryExportFromAnalyzer,
  getSummaryExportFilenames,
  renderSummaryJson,
  renderSummaryMarkdown,
} from '../core/summary-export';
import type { DateFilter } from '../core/types/session-types';
import { ClaudeCliProvider } from './claude-llm';

interface CliOptions {
  command: 'serve' | 'report';
  port: number;
  open: boolean;
  logsDirs: string[];
  json: boolean;
  filter: DateFilter;
}

const USAGE = `ai-engineer-coach — analyze your local AI coding sessions

Usage:
  ai-engineer-coach [options]          Open the dashboard in a browser
  ai-engineer-coach report [options]   Print a summary to stdout

Options:
  --port <n>           Port to listen on (default: a free port)
  --no-open            Do not open a browser
  --logs-dir <path>    Extra VS Code or Xcode log directory (repeatable). Claude,
                       Codex and OpenCode logs are always found automatically.
  --json               report: emit JSON instead of Markdown
  --since <n>d         report: only sessions from the last n days
  --harness <name>     report: only this harness, e.g. Claude
  --workspace <id>     report: only this workspace id
  -h, --help           Show this help
`;

/** Turns `30d` into the `YYYY-MM-DD` day key the analyzer filters on. The analyzer derives
 *  its keys from local time (`toDateStr`), so this has to as well or the window slips a day. */
export function sinceToFromDate(value: string, now = new Date()): string {
  const match = /^(\d+)d$/.exec(value);
  if (!match) throw new Error('--since takes a number of days, like 30d');
  const from = new Date(now.getTime() - Number(match[1]) * 86_400_000);
  const month = `${from.getMonth() + 1}`.padStart(2, '0');
  const day = `${from.getDate()}`.padStart(2, '0');
  return `${from.getFullYear()}-${month}-${day}`;
}

export function parseArgs(argv: string[]): CliOptions | 'help' {
  const options: CliOptions = { command: 'serve', port: 0, open: true, logsDirs: [], json: false, filter: {} };
  const args = [...argv];
  if (args[0] === 'report') {
    options.command = 'report';
    args.shift();
  }
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') return 'help';
    else if (arg === '--no-open') options.open = false;
    else if (arg === '--json') options.json = true;
    else if (arg === '--since') options.filter.fromDate = sinceToFromDate(args[++i] ?? '');
    else if (arg === '--harness') {
      const value = args[++i];
      if (!value) throw new Error('--harness needs a name');
      options.filter.harness = value;
    } else if (arg === '--workspace') {
      const value = args[++i];
      if (!value) throw new Error('--workspace needs an id');
      options.filter.workspaceId = value;
    } else if (arg === '--port') {
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || value < 0 || value > 65535) throw new Error(`--port needs a number between 0 and 65535`);
      options.port = value;
    } else if (arg === '--logs-dir') {
      const value = args[++i];
      if (!value) throw new Error('--logs-dir needs a path');
      options.logsDirs.push(path.resolve(value));
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

/* Parse workers outlive `server.close()` unless we kill them, so a SIGTERM during a cold
 * parse would otherwise orphan a child holding a multi-GB heap. */
const parseWorkers = new Set<ChildProcess>();

/* `report` writes its document to stdout, so every diagnostic has to go to stderr —
 * including the parse worker's, which inherits our stdio by default. */
function trackedFork(quietStdout: boolean): typeof fork {
  return ((modulePath: string | URL, args?: readonly string[], options?: ForkOptions) => {
    const child = fork(modulePath, args ?? [], quietStdout
      ? { ...options, stdio: ['ignore', process.stderr, process.stderr, 'ipc'] }
      : options);
    parseWorkers.add(child);
    child.once('exit', () => parseWorkers.delete(child));
    return child;
  }) as typeof fork;
}

/** Only a failure to *start* a child is worth retrying in-process. A worker that died of
 *  OOM already retried at a higher heap ceiling, and re-parsing the same corpus in our own
 *  heap would just fail again after restarting the progress bar from zero. */
function cannotStartWorker(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /child process parsing is unavailable|failed to start parse worker/i.test(message);
}

/* Prefers the forked worker so a multi-GB parse gets its own heap. The worker resolves
 * `parse-worker.js` next to the running bundle, which holds for `dist/cli.cjs`. */
function createParseAll(extraDirs: string[], quietStdout = false): ParseAllFn {
  return async (logsDirs, onProgress) => {
    const dirs = [...logsDirs, ...extraDirs];
    try {
      return await parseAllLogsViaWorker(dirs, onProgress, { fork: trackedFork(quietStdout) });
    } catch (error: unknown) {
      if (!cannotStartWorker(error)) throw error;
      return (await parseAllLogsAsyncDetailed(dirs, onProgress)).result;
    }
  };
}

/** Routes the stdout-bound console methods to stderr for the duration of a report. */
function keepStdoutClean(): void {
  const toStderr = (...parts: unknown[]): void => { process.stderr.write(`${parts.join(' ')}\n`); };
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
}

/* The VS Code host opens a folder picker here. A CLI has no picker, so the files land
 * in the directory the CLI was started from and the path goes back to the UI. */
async function exportSummaryToCwd(
  analyzer: Analyzer,
  filter?: DateFilter,
): Promise<{ ok: boolean; folder?: string }> {
  const generatedAt = new Date();
  const report = buildSummaryExportFromAnalyzer(analyzer, filter, generatedAt);
  const names = getSummaryExportFilenames(generatedAt);
  const folder = process.cwd();
  await fs.promises.writeFile(path.join(folder, names.markdown), renderSummaryMarkdown(report), 'utf8');
  await fs.promises.writeFile(path.join(folder, names.json), renderSummaryJson(report), 'utf8');
  return { ok: true, folder };
}

function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  const args = process.platform === 'win32' ? ['', url] : [url];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true, shell: process.platform === 'win32' });
    // ENOENT arrives as an event, not a throw, and an unhandled 'error' would take the
    // whole CLI down on a headless box with no opener installed.
    child.on('error', () => { /* the URL is already printed */ });
    child.unref();
  } catch {
    /* the URL is already printed; opening a browser is best effort */
  }
}

/* Writes the summary to stdout so an agent can read it without a browser. Progress
 * goes to stderr to keep stdout a clean document that can be piped. */
async function runReport(options: CliOptions): Promise<number> {
  keepStdoutClean();
  const parseAll = createParseAll(options.logsDirs, true);
  const result = await parseAll(findLogsDirs(), p => {
    process.stderr.write(`\rParsing… ${Math.round(p.pct)}%${' '.repeat(20)}`);
  });
  process.stderr.write('\r');

  const analyzer = new Analyzer(result.sessions, result.editLocIndex, result.workspaces);
  const report = buildSummaryExportFromAnalyzer(analyzer, options.filter);
  process.stdout.write(options.json ? renderSummaryJson(report) : renderSummaryMarkdown(report));
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  let options: CliOptions | 'help';
  try {
    options = parseArgs(argv);
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 1;
  }
  if (options === 'help') {
    process.stdout.write(USAGE);
    return 0;
  }

  if (options.command === 'report') return runReport(options);

  const host = createCanvasHost({
    distDir: __dirname,
    repoName: path.basename(process.cwd()),
    host: 'cli',
    parseAll: createParseAll(options.logsDirs),
    exportSummary: exportSummaryToCwd,
    // Absent `claude`, the generative features report themselves unavailable instead of hanging.
    llm: ClaudeCliProvider.detect(),
  });
  host.start();

  const server = http.createServer((req, res) => host.handle(req, res));
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, '127.0.0.1', resolve);
    });
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code;
    host.dispose();
    process.stderr.write(code === 'EADDRINUSE'
      ? `Port ${options.port} is already in use. Pass a different --port, or omit it to pick a free one.\n`
      : `Could not listen on port ${options.port}: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;
  const url = `http://127.0.0.1:${port}/`;
  process.stdout.write(`AI Engineer Coach — ${url}\nParsing sessions… the dashboard fills in as data loads. Ctrl+C to stop.\n`);
  if (options.open) openBrowser(url);

  const shutdown = (): void => {
    host.dispose();
    for (const child of parseWorkers) child.kill();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return new Promise<number>(() => { /* runs until interrupted */ });
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    code => { if (code !== 0) process.exit(code); },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
