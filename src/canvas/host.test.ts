/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* The host backs both the Copilot canvas and the CLI. The canvas passes no host options,
 * so the defaults have to keep reporting what they always reported. */

import { describe, it, expect } from 'vitest';
import { createCanvasHost } from './host';

function rpc(host: ReturnType<typeof createCanvasHost>, method: string): Promise<Record<string, unknown>> {
  return new Promise(resolve => {
    const chunks: string[] = [];
    const req = {
      method: 'POST',
      url: '/rpc',
      headers: { 'content-type': 'application/json', host: '127.0.0.1:0' },
      on(event: string, cb: (chunk?: Buffer) => void) {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ id: '1', method, params: {} })));
        if (event === 'end') cb();
      },
    };
    const res = {
      writeHead() { /* ignored */ },
      end(body: string) { chunks.push(body); resolve(JSON.parse(chunks.join('')) as Record<string, unknown>); },
    };
    host.handle(req as never, res as never);
  });
}

describe('createCanvasHost defaults', () => {
  it('reports the canvas host when no host kind is given', async () => {
    const host = createCanvasHost({ distDir: '/tmp/nonexistent-dist' });
    const response = await rpc(host, 'getCapabilities');
    expect(response.data).toEqual({ host: 'canvas', llm: false });
    host.dispose();
  });

  it('reports the CLI host when asked', async () => {
    const host = createCanvasHost({ distDir: '/tmp/nonexistent-dist', host: 'cli' });
    const response = await rpc(host, 'getCapabilities');
    expect(response.data).toEqual({ host: 'cli', llm: false });
    host.dispose();
  });

  it('answers showOutput and reviewLocalRules instead of rejecting them as unknown', async () => {
    const host = createCanvasHost({ distDir: '/tmp/nonexistent-dist', host: 'cli' });
    for (const method of ['showOutput', 'reviewLocalRules']) {
      const { error } = (await rpc(host, method)).data as { error?: string };
      expect(error ?? '').not.toMatch(/Unknown method/);
    }
    host.dispose();
  });

  it('leaves exportSummary stubbed when the embedder provides no writer', async () => {
    const host = createCanvasHost({ distDir: '/tmp/nonexistent-dist' });
    expect((await rpc(host, 'exportSummary')).data).toEqual({ ok: false, cancelled: true });
    host.dispose();
  });
});
