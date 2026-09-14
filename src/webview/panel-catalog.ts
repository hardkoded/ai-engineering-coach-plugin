/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { readTextWithByteLimit } from './fetch-utils';
import { warnCore } from '../core/log';

export const CATALOG_BASE = 'https://awesome-copilot.github.com';

const CATALOG_PAGE_MAX_BYTES = 5 * 1024 * 1024;

export interface RawCatalogItem {
  kind: 'skill' | 'agent' | 'instruction' | 'hook';
  id: string;
  title: string;
  description: string;
  category: string;
  path: string;
  url: string;
}

let catalogCache: RawCatalogItem[] | undefined;
let catalogPromise: Promise<RawCatalogItem[]> | undefined;

/** Remove HTML tags iteratively until stable (avoids incomplete sanitization). */
function stripHtml(text: string): string {
  let prev = text;
   
  while (true) {
    const next = prev.replaceAll(/<[^>]*>/g, '');
    if (next === prev) return next;
    prev = next;
  }
}

async function fetchCatalogPage(slug: string, kind: RawCatalogItem['kind']): Promise<RawCatalogItem[]> {
  const url = `${CATALOG_BASE}/${slug}/`;
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) return [];
  const html = await readTextWithByteLimit(response, CATALOG_PAGE_MAX_BYTES, 'Catalog page too large');

  const items = parseCatalogPage(html, slug, kind);
  if (items.length === 0 && html.includes('resource-item')) {
    // The markup changed shape rather than the page being empty. Say so: a silent zero here
    // reads to the user as "no skills found" and hides a scraper that needs updating.
    warnCore('panel-catalog', `catalog page "${slug}" has resource-item markup this parser does not recognize`);
  }
  return items;
}

/* Split on the opening tag rather than matching a closing one. The site has already renamed
 * the element once (`<article>` to `<div>`), and a non-greedy match to `</div>` would stop at
 * the first nested div and truncate every item. */
export function parseCatalogPage(html: string, slug: string, kind: RawCatalogItem['kind']): RawCatalogItem[] {
  const items: RawCatalogItem[] = [];
  const openTag = /<[a-z][a-z0-9-]*\b[^>]*\bclass="[^"]*\bresource-item\b[^"]*"[^>]*>/gi;

  const opens: Array<{ tag: string; start: number; end: number }> = [];
  let found: RegExpExecArray | null;
  while ((found = openTag.exec(html)) !== null) {
    opens.push({ tag: found[0], start: found.index, end: found.index + found[0].length });
  }

  for (const [index, open] of opens.entries()) {
    const block = html.slice(open.end, opens[index + 1]?.start ?? html.length);

    const pathMatch = open.tag.match(/\bdata-path="([^"]*)"/);
    if (!pathMatch) continue;
    const path = pathMatch[1];

    const titleMatch = block.match(/class="[^"]*\bresource-title\b[^"]*"[^>]*>([\s\S]*?)</);
    const descMatch = block.match(/class="[^"]*\bresource-description\b[^"]*"[^>]*>([\s\S]*?)<\//);
    const categoryMatch = block.match(/tag-category[^"]*"[^>]*>([^<]*)</);

    const title = titleMatch ? titleMatch[1].trim() : '';
    const description = descMatch ? stripHtml(descMatch[1].trim()) : '';
    const category = categoryMatch ? categoryMatch[1].trim() : '';

    if (!title) continue;

    items.push({
      kind,
      id: `${kind}:${path}`,
      title,
      description,
      category,
      path,
      url: `${CATALOG_BASE}/${slug}/#${path.split('/').pop()?.replace(/\.[^.]+$/, '') || ''}`,
    });
  }

  return items;
}

export async function getCatalogItems(): Promise<RawCatalogItem[]> {
  if (catalogCache) return catalogCache;
  if (!catalogPromise) {
    catalogPromise = (async () => {
      // `/hooks/` 404s — the catalog dropped that page. The `hook` kind stays in the type
      // so existing installs keep rendering; nothing produces one any more.
      const [skills, agents, instructions] = await Promise.all([
        fetchCatalogPage('skills', 'skill'),
        fetchCatalogPage('agents', 'agent'),
        fetchCatalogPage('instructions', 'instruction'),
      ]);
      catalogCache = [...skills, ...agents, ...instructions];
      catalogPromise = undefined;
      return catalogCache;
    })();
  }
  return catalogPromise;
}

export function clearCatalogCache(): void {
  catalogCache = undefined;
  catalogPromise = undefined;
}