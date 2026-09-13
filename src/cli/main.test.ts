/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { toDateStr } from '../core/helpers';
import { parseArgs, sinceToFromDate } from './main';

describe('sinceToFromDate', () => {
  it('converts a day count to the day key the analyzer filters on', () => {
    expect(sinceToFromDate('30d', new Date('2026-09-13T12:00:00Z'))).toBe('2026-08-14');
    expect(sinceToFromDate('1d', new Date('2026-01-01T12:00:00Z'))).toBe('2025-12-31');
  });

  /* The analyzer keys days off local time. Building the cutoff from `toISOString()` slipped
   * the window by a day for anyone west of UTC. Asserted against `toDateStr` so the test
   * means the same thing in every timezone CI might run in. */
  it('agrees with the analyzer day key it is compared against', () => {
    for (const hourUtc of [0, 2, 6, 12, 18, 23]) {
      const now = new Date(Date.UTC(2026, 8, 13, hourUtc, 30));
      expect(sinceToFromDate('30d', now)).toBe(toDateStr(now.getTime() - 30 * 86_400_000));
    }
  });

  it('rejects anything that is not a day count', () => {
    for (const bad of ['', '30', '2w', 'yesterday', '-5d']) {
      expect(() => sinceToFromDate(bad)).toThrow(/number of days/);
    }
  });
});

describe('parseArgs', () => {
  it('defaults to serving on a free port with a browser', () => {
    expect(parseArgs([])).toEqual({ command: 'serve', port: 0, open: true, logsDirs: [], json: false, filter: {} });
  });

  it('recognizes the report subcommand and its filters', () => {
    const options = parseArgs(['report', '--json', '--harness', 'Claude', '--workspace', 'ws-1']);
    expect(options).toMatchObject({
      command: 'report',
      json: true,
      filter: { harness: 'Claude', workspaceId: 'ws-1' },
    });
  });

  it('collects repeated --logs-dir values as absolute paths', () => {
    const options = parseArgs(['--logs-dir', 'a', '--logs-dir', 'b']);
    expect(options).not.toBe('help');
    if (options === 'help') return;
    expect(options.logsDirs).toHaveLength(2);
    expect(options.logsDirs.every(d => d.startsWith('/'))).toBe(true);
  });

  it('returns help for -h and --help', () => {
    expect(parseArgs(['-h'])).toBe('help');
    expect(parseArgs(['report', '--help'])).toBe('help');
  });

  it('rejects a bad port', () => {
    for (const bad of ['70000', '-1', 'abc']) {
      expect(() => parseArgs(['--port', bad])).toThrow(/--port/);
    }
  });

  it('rejects flags that need a value but got none', () => {
    expect(() => parseArgs(['--harness'])).toThrow(/--harness/);
    expect(() => parseArgs(['--logs-dir'])).toThrow(/--logs-dir/);
  });

  it('rejects an unknown argument instead of ignoring it', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument/);
  });
});
