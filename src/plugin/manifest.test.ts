/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { PLUGIN_SCHEMA_ID, validateManifest, validatePlugin, validateSkill, parseFrontmatter } from './manifest';

const repoRoot = path.resolve(__dirname, '..', '..');

function manifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ $schema: PLUGIN_SCHEMA_ID, name: 'valid-name', ...overrides });
}

describe('this repository as an Agent Plugin', () => {
  it('conforms to the Agent Plugins and Agent Skills specs', () => {
    expect(validatePlugin(repoRoot)).toEqual([]);
  });
});

describe('validateManifest', () => {
  it('accepts the minimal manifest the spec defines', () => {
    expect(validateManifest(manifest())).toEqual([]);
  });

  it('requires the canonical $schema identifier', () => {
    expect(validateManifest(JSON.stringify({ name: 'x' }))).toContainEqual(expect.stringContaining('$schema'));
    expect(validateManifest(manifest({ $schema: 'https://example.com/other.json' })))
      .toContainEqual(expect.stringContaining('$schema'));
  });

  it('rejects unknown top-level fields, because the schema is closed', () => {
    expect(validateManifest(manifest({ skills: ['./skills'] })))
      .toContainEqual('unknown top-level field "skills"');
  });

  it('enforces the name pattern', () => {
    for (const bad of ['Upper', '-lead', 'trail-', 'double--hyphen', 'dot..dot', '']) {
      expect(validateManifest(manifest({ name: bad })).length).toBeGreaterThan(0);
    }
    for (const good of ['a', 'ai-engineering-coach-plugin', 'com.example.thing']) {
      expect(validateManifest(manifest({ name: good }))).toEqual([]);
    }
  });

  it('reports malformed JSON instead of throwing', () => {
    expect(validateManifest('{ nope')).toHaveLength(1);
  });

  it('type-checks the optional metadata fields', () => {
    expect(validateManifest(manifest({ version: 1 }))).toContainEqual('version must be a string');
    expect(validateManifest(manifest({ keywords: 'ai' }))).toContainEqual('keywords must be an array of strings');
    expect(validateManifest(manifest({ author: { nickname: 'x' } }))).toContainEqual('unknown author field "nickname"');
  });
});

describe('validateSkill', () => {
  const skill = (body: string) => `---\n${body}\n---\n\n# Title\n`;

  it('accepts a minimal skill whose name matches its directory', () => {
    expect(validateSkill('deploy', skill('name: deploy\ndescription: Ships it. Use when deploying.'))).toEqual([]);
  });

  it('requires the name to match the directory name', () => {
    expect(validateSkill('deploy', skill('name: ship\ndescription: x')))
      .toContainEqual(expect.stringContaining('must match the directory name'));
  });

  it('rejects frontmatter fields the Agent Skills spec does not define', () => {
    expect(validateSkill('deploy', skill('name: deploy\ndescription: x\nwhen_to_use: y')))
      .toContainEqual('deploy: unknown frontmatter field "when_to_use"');
  });

  it('requires a non-empty description', () => {
    expect(validateSkill('deploy', skill('name: deploy'))).toContainEqual(expect.stringContaining('description is required'));
  });

  it('caps description at 1024 characters', () => {
    const long = 'x'.repeat(1025);
    expect(validateSkill('deploy', skill(`name: deploy\ndescription: ${long}`)))
      .toContainEqual(expect.stringContaining('at most 1024 characters'));
  });

  it('reports missing frontmatter rather than throwing', () => {
    expect(validateSkill('deploy', '# Just markdown\n')).toHaveLength(1);
  });
});

describe('parseFrontmatter', () => {
  it('folds continuation lines into the field above them', () => {
    const fields = parseFrontmatter('---\ndescription: one\n  two\nname: x\n---\n');
    expect(fields?.description).toBe('one two');
    expect(fields?.name).toBe('x');
  });

  it('returns null when there is no frontmatter block', () => {
    expect(parseFrontmatter('# nope')).toBeNull();
  });
});
