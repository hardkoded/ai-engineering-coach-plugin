/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Host capability detection.
 *
 * The dashboard runs in three hosts: the VS Code extension (full local agent, can
 * call the language model), the Copilot app canvas, and the standalone CLI.
 * Features that need a language model are gated on `llm`. */

import { rpc } from './shared';

/** Non-VS-Code hosts that embed the dashboard bundle. */
export type DashboardHostKind = 'canvas' | 'cli';

export interface HostCapabilities {
  host: 'vscode' | DashboardHostKind;
  llm: boolean;
}

let caps: HostCapabilities = { host: 'vscode', llm: true };

export async function loadCapabilities(): Promise<void> {
  try {
    const result = await rpc<Partial<HostCapabilities>>('getCapabilities');
    if (result && typeof result === 'object') {
      const host = result.host === 'canvas' || result.host === 'cli' ? result.host : 'vscode';
      caps = { host, llm: result.llm !== false };
    }
  } catch {
    /* keep the default full-capability profile */
  }
}

export function capabilities(): HostCapabilities {
  return caps;
}

export function llmAvailable(): boolean {
  return caps.llm;
}

/** Short note shown next to greyed-out, agent-dependent features. The advice
 *  differs per host: a CLI user has no VS Code to open. */
export function llmUnavailableNote(): string {
  return caps.host === 'cli'
    ? 'Not available in the CLI — this feature needs the VS Code language model.'
    : 'Open in VS Code with the local Copilot agent to use this.';
}
