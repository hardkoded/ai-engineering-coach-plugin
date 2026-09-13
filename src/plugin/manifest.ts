/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Validation for the Agent Plugins manifest and the Agent Skills bundled with it.
 * Specs: https://agent-plugins.org/ and https://agentskills.io/specification
 * Kept as code rather than a JSON-schema dependency so `npm run check` catches drift
 * offline — clients are forbidden from fetching the schema at load time anyway. */

import * as fs from 'fs';
import * as path from 'path';

export const PLUGIN_SCHEMA_ID = 'https://agent-plugins.org/schemas/1.1.0/plugin.schema.json';

/** Closed set of top-level manifest fields. Anything else is a schema violation. */
const MANIFEST_FIELDS = new Set([
  '$schema', 'name', 'version', 'description', 'author',
  'homepage', 'repository', 'license', 'keywords', 'extensions',
]);

const AUTHOR_FIELDS = new Set(['name', 'email', 'url']);

/** Agent Skills frontmatter fields. `name` and `description` are required. */
const SKILL_FIELDS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);

/* Shared by both specs: 1-64 chars, lowercase alphanumeric and hyphens, no leading,
 * trailing or consecutive hyphens. The plugin name additionally allows dots. */
const SKILL_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const PLUGIN_NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateManifest(raw: string): string[] {
  const errors: string[] = [];
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch (error: unknown) {
    return [`plugin.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (!isRecord(manifest)) return ['plugin.json must contain a top-level object'];

  for (const key of Object.keys(manifest)) {
    if (!MANIFEST_FIELDS.has(key)) errors.push(`unknown top-level field "${key}"`);
  }
  if (manifest.$schema !== PLUGIN_SCHEMA_ID) errors.push(`$schema must be "${PLUGIN_SCHEMA_ID}"`);

  const name = manifest.name;
  if (typeof name !== 'string' || name.length === 0) errors.push('name is required and must be a non-empty string');
  else if (name.length > 64) errors.push('name must be at most 64 characters');
  else if (!PLUGIN_NAME.test(name)) errors.push(`name "${name}" does not match the required pattern`);

  for (const key of ['version', 'description', 'homepage', 'repository', 'license'] as const) {
    if (key in manifest && typeof manifest[key] !== 'string') errors.push(`${key} must be a string`);
  }
  if ('keywords' in manifest && (!Array.isArray(manifest.keywords) || manifest.keywords.some(k => typeof k !== 'string'))) {
    errors.push('keywords must be an array of strings');
  }
  if ('author' in manifest) {
    if (!isRecord(manifest.author)) errors.push('author must be an object');
    else for (const key of Object.keys(manifest.author)) {
      if (!AUTHOR_FIELDS.has(key)) errors.push(`unknown author field "${key}"`);
    }
  }
  if ('extensions' in manifest && !isRecord(manifest.extensions)) errors.push('extensions must be an object');
  return errors;
}

/** Minimal frontmatter reader: enough for the flat scalar fields the spec defines. */
export function parseFrontmatter(markdown: string): Record<string, string> | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (!match) return null;
  const fields: Record<string, string> = {};
  let current = '';
  for (const line of match[1].split(/\r?\n/)) {
    const keyed = /^([A-Za-z][A-Za-z0-9_-]*):\s?(.*)$/.exec(line);
    if (keyed && !line.startsWith(' ')) {
      current = keyed[1];
      fields[current] = keyed[2].trim();
    } else if (current && line.trim()) {
      // Folded continuation line, or a nested mapping under `metadata`.
      fields[current] = `${fields[current]} ${line.trim()}`.trim();
    }
  }
  return fields;
}

export function validateSkill(dirName: string, markdown: string): string[] {
  const errors: string[] = [];
  const fields = parseFrontmatter(markdown);
  if (!fields) return [`${dirName}: SKILL.md has no YAML frontmatter`];

  for (const key of Object.keys(fields)) {
    if (!SKILL_FIELDS.has(key)) errors.push(`${dirName}: unknown frontmatter field "${key}"`);
  }

  const name = fields.name;
  if (!name) errors.push(`${dirName}: name is required`);
  else {
    if (name !== dirName) errors.push(`${dirName}: name "${name}" must match the directory name`);
    if (name.length > 64) errors.push(`${dirName}: name must be at most 64 characters`);
    if (!SKILL_NAME.test(name) || name.includes('--')) errors.push(`${dirName}: name "${name}" does not match the required pattern`);
  }

  const description = fields.description;
  if (!description) errors.push(`${dirName}: description is required and must be non-empty`);
  else if (description.length > 1024) errors.push(`${dirName}: description must be at most 1024 characters (is ${description.length})`);

  if (fields.compatibility && fields.compatibility.length > 500) {
    errors.push(`${dirName}: compatibility must be at most 500 characters`);
  }
  return errors;
}

/** Validates the manifest plus every skill discoverable under `skills/`. */
export function validatePlugin(pluginRoot: string): string[] {
  const manifestPath = path.join(pluginRoot, 'plugin.json');
  if (!fs.existsSync(manifestPath)) return ['plugin.json is missing from the plugin root'];

  const errors = validateManifest(fs.readFileSync(manifestPath, 'utf8'));

  const skillsDir = path.join(pluginRoot, 'skills');
  if (!fs.existsSync(skillsDir)) return errors;
  if (!fs.statSync(skillsDir).isDirectory()) return [...errors, 'skills exists but is not a directory'];

  // Only immediate children count as skills; clients must not search deeper.
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      errors.push(`${entry.name}: directory under skills/ has no SKILL.md`);
      continue;
    }
    errors.push(...validateSkill(entry.name, fs.readFileSync(skillFile, 'utf8')));
  }
  return errors;
}
