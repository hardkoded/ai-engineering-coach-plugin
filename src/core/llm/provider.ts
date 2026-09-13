/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Host-neutral language-model interface.
 *
 * Feature code builds `LlmMessage`s and calls a provider; it never names a vendor. The
 * provider owns transport, retries, and secret redaction — redaction lives there so no
 * call site can forget it, which is the failure mode that previously leaked transcripts. */

import { redactSecrets } from '../redact-secrets';
import type { JsonSchemaSpec } from './schemas';

export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  text: string;
}

export interface LlmProvider {
  /** Free-form completion. */
  call(messages: LlmMessage[]): Promise<string>;
  /** Completion parsed as JSON, optionally constrained by a schema. */
  callJson<T>(messages: LlmMessage[], schema?: JsonSchemaSpec): Promise<T>;
}

export function system(text: string): LlmMessage {
  return { role: 'system', text };
}

export function user(text: string): LlmMessage {
  return { role: 'user', text };
}

export function assistant(text: string): LlmMessage {
  return { role: 'assistant', text };
}

/** Strips credential-shaped substrings from every message before it leaves the machine. */
export function redactMessages(messages: LlmMessage[]): LlmMessage[] {
  return messages.map(message => ({ ...message, text: redactSecrets(message.text) }));
}

/** Renders a conversation as plain text, for providers that take a single prompt. */
export function flattenMessages(messages: LlmMessage[]): string {
  if (messages.length === 1) return messages[0].text;
  return messages
    .map(m => (m.role === 'user' ? m.text : `[${m.role}]\n${m.text}`))
    .join('\n\n');
}

/** Nudge appended after a provider returns something that is not valid JSON. */
export const JSON_RETRY_NUDGE =
  'Your previous response was not valid JSON. Respond ONLY with a valid JSON object or array, no markdown fences, no commentary.';

/** Instruction appended when a provider cannot enforce a schema natively. */
export function schemaInstruction(schema: JsonSchemaSpec): string {
  return `Respond ONLY with a JSON value matching this JSON Schema named "${schema.name}". No markdown fences, no commentary.\n${JSON.stringify(schema.schema)}`;
}
