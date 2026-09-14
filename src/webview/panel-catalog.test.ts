/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* The catalog is scraped from HTML, so the site can break it at any time — and did: it
 * renamed the item element from `<article>` to `<div>`, which silently emptied Skill Finder.
 * These fixtures are trimmed from the real pages, old shape and new. */

import { describe, it, expect } from 'vitest';
import { parseCatalogPage } from './panel-catalog';

/** Current markup: a `<div>`, attributes before `data-path`, nested `<div>`s inside. */
const CURRENT = `
<div class="resource-grid">
<div class="resource-item" role="listitem" data-path="skills/acquire-codebase-knowledge/SKILL.md" data-skill-id="acquire-codebase-knowledge">
      <a class="resource-preview" href="/skill/acquire-codebase-knowledge/">
        <div class="resource-info">
          <div class="resource-title">Acquire Codebase Knowledge</div>
          <div class="resource-description">Use this skill when the user asks to map a codebase.</div>
          <span class="tag tag-category">Documentation</span>
        </div>
      </a>
</div>
<div class="resource-item" role="listitem" data-path="skills/second-thing/SKILL.md" data-skill-id="second-thing">
      <div class="resource-info">
        <div class="resource-title">Second Thing</div>
        <div class="resource-description">Another one &amp; its description.</div>
      </div>
</div>
</div>`;

/** The shape the parser was originally written against. */
const LEGACY = `
<article class="resource-item" data-path="skills/legacy/SKILL.md">
  <div class="resource-title">Legacy Item</div>
  <div class="resource-description">Old markup still parses.</div>
  <span class="tag-category">Testing</span>
</article>`;

describe('parseCatalogPage', () => {
  it('parses the current div-based markup', () => {
    const items = parseCatalogPage(CURRENT, 'skills', 'skill');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      kind: 'skill',
      title: 'Acquire Codebase Knowledge',
      description: 'Use this skill when the user asks to map a codebase.',
      category: 'Documentation',
      path: 'skills/acquire-codebase-knowledge/SKILL.md',
    });
    expect(items[1].title).toBe('Second Thing');
  });

  it('does not truncate an item at the first nested closing div', () => {
    // The bug a naive `<article>` → `<div>` swap would have introduced.
    const [first] = parseCatalogPage(CURRENT, 'skills', 'skill');
    expect(first.description).not.toBe('');
    expect(first.category).toBe('Documentation');
  });

  it('still parses the legacy article markup', () => {
    const items = parseCatalogPage(LEGACY, 'skills', 'skill');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Legacy Item');
  });

  it('skips items with no title rather than emitting blanks', () => {
    const items = parseCatalogPage('<div class="resource-item" data-path="a/b.md"></div>', 'skills', 'skill');
    expect(items).toEqual([]);
  });

  it('returns nothing for a page with no items', () => {
    expect(parseCatalogPage('<html><body>nope</body></html>', 'skills', 'skill')).toEqual([]);
  });
});
