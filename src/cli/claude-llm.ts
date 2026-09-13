/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Language-model provider backed by the Claude Code CLI.
 *
 * Uses the `claude` binary the user has already authenticated, so there is no API key to
 * configure and nothing new to store. Every call is one headless turn with tools disabled:
 * these are text transformations over the user's own data, not agentic work. */

import { execFile, execFileSync } from 'child_process';
import {
  JSON_RETRY_NUDGE,
  flattenMessages,
  redactMessages,
  schemaInstruction,
  type LlmMessage,
  type LlmProvider,
} from '../core/llm/provider';
import { parseLlmJson, type JsonSchemaSpec } from '../core/llm/schemas';
import { runtimeDebug } from '../core/runtime-debug';

const MAX_RETRIES = 2;
const TIMEOUT_MS = 120_000;
/** Generous: prompts embed transcripts and rule bodies. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

interface ClaudeCliResult {
  result?: unknown;
  is_error?: boolean;
  subtype?: string;
}

export class ClaudeCliProvider implements LlmProvider {
  constructor(private readonly binary = 'claude', private readonly model = 'haiku') {}

  /** Returns a provider only when the CLI is actually runnable, so callers can degrade. */
  static detect(binary = 'claude'): ClaudeCliProvider | null {
    try {
      execFileSync(binary, ['--version'], { stdio: 'ignore', timeout: 15_000 });
      return new ClaudeCliProvider(binary);
    } catch {
      return null;
    }
  }

  private run(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        this.binary,
        ['-p', '--output-format', 'json', '--max-turns', '1', '--allowed-tools', '', '--model', this.model],
        { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: 'utf8' },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`claude CLI failed: ${stderr.trim() || error.message}`));
            return;
          }
          let payload: ClaudeCliResult;
          try {
            payload = JSON.parse(stdout) as ClaudeCliResult;
          } catch {
            reject(new Error('claude CLI returned output that was not JSON'));
            return;
          }
          if (payload.is_error) {
            reject(new Error(`claude CLI reported an error: ${payload.subtype ?? 'unknown'}`));
            return;
          }
          if (typeof payload.result !== 'string') {
            reject(new Error('claude CLI returned no result text'));
            return;
          }
          resolve(payload.result);
        },
      );
      child.stdin?.end(prompt);
    });
  }

  async call(messages: LlmMessage[]): Promise<string> {
    const prompt = flattenMessages(redactMessages(messages));
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.run(prompt);
      } catch (error: unknown) {
        lastError = error;
        runtimeDebug('claude-llm', 'call-failed', `attempt=${attempt + 1} ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('claude CLI call failed');
  }

  async callJson<T>(messages: LlmMessage[], schema?: JsonSchemaSpec): Promise<T> {
    const safe = redactMessages(messages);
    const base = schema ? [...safe, { role: 'user' as const, text: schemaInstruction(schema) }] : safe;

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // A parse failure earns one explicit nudge; repeating it every attempt just wastes turns.
      const messagesForAttempt = attempt === 0 ? base : [...base, { role: 'user' as const, text: JSON_RETRY_NUDGE }];
      try {
        const text = await this.run(flattenMessages(messagesForAttempt));
        try {
          return JSON.parse(text.trim()) as T;
        } catch {
          return parseLlmJson<T>(text);
        }
      } catch (error: unknown) {
        lastError = error;
        runtimeDebug('claude-llm', 'json-call-failed',
          `schema=${schema?.name ?? 'none'} attempt=${attempt + 1} ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('claude CLI JSON call failed');
  }
}
