/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* The launcher is normally reached through a symlink, because that is how a skill gets
 * installed into an agent's skills directory. Resolving the plugin root from the logical
 * path walked out of the plugin entirely and ran npm in the agent's config directory. */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const launcher = path.resolve(__dirname, '..', '..', 'skills', 'ai-engineering-coach', 'scripts', 'coach.sh');
const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
});

/** A miniature plugin whose "CLI" just echoes the arguments it was handed. */
function makePluginTree(): { root: string; skillDir: string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'coach-plugin-')));
  tempDirs.push(root);
  fs.writeFileSync(path.join(root, 'plugin.json'), '{}');
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'cli.cjs'), 'console.log("ARGS:" + process.argv.slice(2).join(","));\n');

  const skillDir = path.join(root, 'skills', 'ai-engineering-coach');
  fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
  const copied = path.join(skillDir, 'scripts', 'coach.sh');
  fs.copyFileSync(launcher, copied);
  fs.chmodSync(copied, 0o755);
  return { root, skillDir };
}

function run(script: string, args: string[], cwd: string): string {
  return execFileSync(script, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

describe('coach.sh plugin root resolution', () => {
  it('runs the bundled CLI when invoked directly', () => {
    const { root, skillDir } = makePluginTree();
    const output = run(path.join(skillDir, 'scripts', 'coach.sh'), ['report', '--json'], root);
    expect(output.trim()).toBe('ARGS:report,--json');
  });

  it('still finds the plugin root through an installed symlink', () => {
    const { skillDir } = makePluginTree();
    const installDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'coach-install-')));
    tempDirs.push(installDir);
    const link = path.join(installDir, 'ai-engineering-coach');
    fs.symlinkSync(skillDir, link);

    const output = run(path.join(link, 'scripts', 'coach.sh'), ['report'], os.tmpdir());
    expect(output.trim()).toBe('ARGS:report');
  });

  it('refuses to run npm somewhere else when the script is copied out of the plugin', () => {
    const stray = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'coach-stray-')));
    tempDirs.push(stray);
    const copied = path.join(stray, 'a', 'b', 'c', 'coach.sh');
    fs.mkdirSync(path.dirname(copied), { recursive: true });
    fs.copyFileSync(launcher, copied);
    fs.chmodSync(copied, 0o755);

    expect(() => run(copied, [], stray)).toThrow(/no plugin.json|Command failed/);
  });
});
