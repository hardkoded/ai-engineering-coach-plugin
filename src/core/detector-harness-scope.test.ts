/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Rules marked `requiresIdeContext` read request fields that only an IDE harness records.
 * They must score the sessions that can populate those fields, not every session in view. */

import { describe, it, expect } from 'vitest';
import { Session, SessionRequest } from './types';
import { runDetectors, providesIdeContext } from './detector-registry';

function makeReq(id: string, overrides: Partial<SessionRequest> = {}): SessionRequest {
  return {
    requestId: id,
    timestamp: Date.now(),
    messageText: 'Refactor the authentication module to use JWT tokens with refresh capability.',
    responseText: 'Here is the implementation.',
    isCanceled: false,
    agentName: '',
    agentMode: 'agent',
    modelId: 'gpt-4.1',
    toolsUsed: ['edit'],
    editedFiles: ['src/a.ts'],
    referencedFiles: ['src/a.ts'],
    slashCommand: '',
    variableKinds: {},
    customInstructions: [],
    skillsUsed: [],
    firstProgress: 100,
    totalElapsed: 500,
    messageLength: 80,
    responseLength: 60,
    userCode: [],
    aiCode: [],
    toolConfirmations: [],
    promptTokens: null,
    completionTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    compaction: null,
    todoSnapshot: null,
    workType: 'feature',
    ...overrides,
  };
}

function makeSess(harness: string, requests: SessionRequest[]): Session {
  return {
    sessionId: `sess-${harness}-${requests[0].requestId}`,
    workspaceId: `ws-${harness}`,
    workspaceName: 'my-project',
    location: 'panel',
    harness,
    creationDate: Date.now() - 3600000,
    lastMessageDate: Date.now(),
    requestCount: requests.length,
    requests,
  };
}

describe('providesIdeContext', () => {
  it('accepts the VS Code harnesses and Xcode', () => {
    for (const harness of ['Local Agent', 'Local Agent (Insiders)', 'Local Agent (Server)', 'Xcode']) {
      expect(providesIdeContext(harness)).toBe(true);
    }
  });

  it('rejects terminal agents, which never populate the IDE-only fields', () => {
    for (const harness of ['Claude', 'Codex', 'OpenCode', 'GitHub Copilot CLI', 'GitHub Copilot App']) {
      expect(providesIdeContext(harness)).toBe(false);
    }
  });
});

describe('IDE-only rules in the all-harnesses view', () => {
  /* `parser-shared.ts` hardcodes `slashCommand: ''` for every terminal harness, so
   * mixing Claude requests into the corpus used to drag the usage rate to zero and
   * trigger `no-slash-commands` no matter how the VS Code sessions actually looked. */
  /* The Claude side has to outweigh the IDE side for the pooled usage rate to fall
   * under the 2% threshold — which is exactly what a terminal-first user's data
   * looks like. 25 IDE requests all using a slash command, against 1500 that
   * structurally cannot record one. */
  const ideReqs = Array.from({ length: 25 }, (_, i) => makeReq(`ide-${i}`, { slashCommand: '/fix' }));
  const claudeReqs = Array.from({ length: 1500 }, (_, i) => makeReq(`claude-${i}`));

  it('does not fire when the IDE sessions themselves are clean', () => {
    const sessions = [makeSess('Local Agent', ideReqs), makeSess('Claude', claudeReqs)];
    const patterns = runDetectors([...ideReqs, ...claudeReqs], sessions, false);
    expect(patterns.find(p => p.id === 'no-slash-commands')).toBeUndefined();
  });

  it('still fires when the IDE sessions are the ones at fault', () => {
    const badIdeReqs = Array.from({ length: 30 }, (_, i) => makeReq(`ide-${i}`));
    const sessions = [makeSess('Local Agent', badIdeReqs), makeSess('Claude', claudeReqs)];
    const patterns = runDetectors([...badIdeReqs, ...claudeReqs], sessions, false);
    expect(patterns.find(p => p.id === 'no-slash-commands')).toBeDefined();
  });

  it('reports nothing for a machine with only terminal-agent sessions', () => {
    const sessions = [makeSess('Claude', claudeReqs)];
    const patterns = runDetectors(claudeReqs, sessions, false);
    expect(patterns.find(p => p.id === 'no-slash-commands')).toBeUndefined();
    expect(patterns.find(p => p.id === 'no-custom-instructions')).toBeUndefined();
  });
});
