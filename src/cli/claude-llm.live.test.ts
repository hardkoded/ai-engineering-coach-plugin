/* Live check against the real `claude` binary. Skipped when it is not installed. */
import { describe, it, expect } from 'vitest';
import { ClaudeCliProvider } from './claude-llm';
import { user } from '../core/llm/provider';

const provider = ClaudeCliProvider.detect();
const live = provider ? describe : describe.skip;

live('ClaudeCliProvider (live)', () => {
  it('returns text', { timeout: 120_000 }, async () => {
    const out = await (provider as ClaudeCliProvider).call([user('Reply with exactly: OK')]);
    expect(out.trim()).toContain('OK');
  });

  it('returns parsed JSON for a schema', { timeout: 120_000 }, async () => {
    const out = await (provider as ClaudeCliProvider).callJson<{ ok: boolean }>(
      [user('Is 2 greater than 1?')],
      { name: 'answer', schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } },
    );
    expect(out.ok).toBe(true);
  });
});
