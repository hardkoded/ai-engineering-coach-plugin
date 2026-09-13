/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Guards the ways this fork deliberately differs from `microsoft/AI-Engineering-Coach`.
 * A merge from upstream can silently undo any of these — upstream still ships the VS Code
 * extension — and most would fail at runtime rather than at build time. See the
 * "Syncing from upstream" section of AGENTS.md. */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const srcRoot = path.join(repoRoot, 'src');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

/* Tests are excluded from every scan below: this file names the very patterns it forbids. */
const files = sourceFiles(srcRoot)
  .map(f => ({ path: path.relative(repoRoot, f), text: fs.readFileSync(f, 'utf8') }))
  .filter(f => !f.path.includes('.test.'));

describe('no VS Code coupling', () => {
  it('imports the vscode module nowhere', () => {
    const offenders = files
      .filter(f => /from 'vscode'|require\('vscode'\)/.test(f.text))
      .map(f => f.path);
    expect(offenders).toEqual([]);
  });

  it('keeps the deleted extension host deleted', () => {
    const revived = [
      'src/extension.ts',
      'src/summary-export-vscode.ts',
      'src/webview/panel.ts',
      'src/webview/panel-html.ts',
      'src/webview/panel-sidebar.ts',
      'src/webview/panel-cache.ts',
      'src/webview/panel-llm.ts',
      'src/chat',
      'src/mcp',
      '.vscodeignore',
      'README.extension.md',
      'scripts/package-readme-swap.mjs',
    ].filter(p => fs.existsSync(path.join(repoRoot, p)));
    expect(revived).toEqual([]);
  });

  it('declares no extension manifest fields', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as Record<string, unknown>;
    const forbidden = ['main', 'contributes', 'activationEvents', 'capabilities', 'publisher', 'icon', 'categories'];
    expect(forbidden.filter(key => key in pkg)).toEqual([]);
    expect((pkg.engines as Record<string, string>).vscode).toBeUndefined();

    const deps = { ...(pkg.devDependencies as object), ...(pkg.dependencies as object) };
    expect(Object.keys(deps).filter(d => d.includes('vscode'))).toEqual([]);
    expect(Object.keys(pkg.scripts as object).filter(s => s === 'package' || s.startsWith('vscode:'))).toEqual([]);
  });
});

describe('harness names come from the shared constants', () => {
  /* Parsers emit `Claude` and `Codex`. Upstream compares against the display names in
   * several places, which silently matches nothing.
   *
   * `parser-harnesses.ts` is exempt: its `EXTERNAL_HARNESSES[].name` is a collector label
   * used in progress output, not a `Session.harness` value. That overload is what made the
   * original bugs easy to write, so the exemption is narrow and deliberate. */
  it('uses no display-name literals outside the constants module', () => {
    const exempt = ['src/core/constants.ts', 'src/core/parser-harnesses.ts'];
    const offenders = files
      .filter(f => !exempt.includes(f.path))
      .filter(f => /'Claude Code'|'Codex CLI'|'VS Code Insiders'/.test(f.text))
      .map(f => f.path);
    expect(offenders).toEqual([]);
  });

  it('documents the harness field with a value a parser actually emits', () => {
    const schema = fs.readFileSync(path.join(srcRoot, 'core/dsl/schema.ts'), 'utf8');
    const harnessLine = schema.split('\n').find(l => l.includes("name: 'harness'")) ?? '';
    expect(harnessLine).toContain('"Claude"');
  });
});

describe('the language model is reached through the provider', () => {
  it('routes every feature through LlmProvider, never a vendor API', () => {
    const offenders = files
      .filter(f => /vscode\.lm|LanguageModelChatMessage|selectChatModels/.test(f.text))
      .map(f => f.path);
    expect(offenders).toEqual([]);
  });

  it('keeps the request service and rule compiler provider-driven', () => {
    for (const file of ['webview/panel-request-service.ts', 'core/rule-compiler.ts', 'webview/panel-rpc.ts']) {
      expect(fs.readFileSync(path.join(srcRoot, file), 'utf8')).toMatch(/LlmProvider/);
    }
  });

  it('replies through a host-neutral sink', () => {
    const shared = fs.readFileSync(path.join(srcRoot, 'webview/panel-shared.ts'), 'utf8');
    expect(shared).toMatch(/export interface ResponseSink/);
    expect(shared).not.toMatch(/vscode\.Webview/);
  });

  it('offers the CLI as a host', () => {
    expect(fs.readFileSync(path.join(srcRoot, 'webview/capabilities.ts'), 'utf8')).toMatch(/'canvas' \| 'cli'/);
  });
});
