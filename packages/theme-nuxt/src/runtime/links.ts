import type { CatalogDoc, EldraClient, EntryDoc } from '@eldrajs/theme-core';
import type { LinkTargetInfo } from '@eldrajs/theme-core/links';
import { localeQuery } from './locale';

/** One `id:in:` token stays well inside a URL length the gateway accepts and
 * keeps one response small — the same chunk the storefront's own batched reads
 * use. */
const CHUNK_SIZE = 50;

/** Enough for the chunk above in one page, whatever the gateway's default is. */
const PAGE_SIZE = 100;

/** A read that claims a successor forever would loop forever; a hundred pages
 * of a hundred is far past anything a link set can name. */
const MAX_PAGES = 100;

export interface LinkTargetSources {
  /**
   * The CMS schemas an `entry` target may belong to. A link target carries
   * `_type: "entry"` and not its schema, so the schemas worth reading are the
   * ones the site has a route template for — an entry no template serves has no
   * href to resolve to anyway.
   */
  entrySchemaApiIds?: readonly string[];
  /**
   * The site's own pages, which route resolution has already listed. A page's
   * path comes from that list rather than from a lookup, so this only supplies
   * the title a blank label falls back to — no extra read.
   */
  pages?: readonly EntryDoc[];
}

/**
 * What the site knows about every object its links point at, keyed
 * `${_type}:${id}` — the key `linkTargetKeys` produces.
 *
 * One batched read per type, never one per link: products, collections and
 * categories by an `id:in:` filter in chunks, entries one read per schema the
 * site routes, each paged to the end rather than to the first hundred rows.
 * Only the ids that were asked for are kept, so a gateway that ignores the
 * filter cannot put its whole catalogue into the page's payload. A read that
 * fails leaves those targets unknown rather than throwing — a link whose target
 * cannot be resolved renders unlinked, exactly as a deleted target does, and one
 * failing catalog read must not take a whole page down.
 */
export async function collectLinkTargets(
  client: EldraClient,
  keys: readonly string[],
  locale?: string,
  sources: LinkTargetSources = {}
): Promise<Map<string, LinkTargetInfo>> {
  const targets = new Map<string, LinkTargetInfo>();
  const byType = groupIdsByType(keys);
  const reads: Array<Promise<void>> = [];

  for (const chunk of chunks(byType.get('product'))) {
    reads.push(
      readInto(targets, 'product', chunk, async (query) =>
        toPage(await client.catalog.listProducts({ ...query, filter: [idFilter(chunk)] }))
      )
    );
  }
  for (const chunk of chunks(byType.get('collection'))) {
    reads.push(
      readInto(targets, 'collection', chunk, async (query) =>
        toPage(await client.catalog.listCollections({ ...query, filter: [idFilter(chunk)] }))
      )
    );
  }
  for (const chunk of chunks(byType.get('category'))) {
    reads.push(
      readInto(targets, 'category', chunk, async (query) =>
        toPage(await client.catalog.listCategories({ ...query, filter: [idFilter(chunk)] }))
      )
    );
  }
  if ((byType.get('entry') ?? []).length > 0) {
    for (const schemaApiId of sources.entrySchemaApiIds ?? []) {
      for (const chunk of chunks(byType.get('entry'))) {
        reads.push(
          readInto(targets, 'entry', chunk, async (query) => {
            const list = await client.getEntries(schemaApiId, {
              ...query,
              depth: 0,
              filter: [idFilter(chunk)],
            });
            return {
              data: list.data.map((entry) => ({ ...entry.data, id: entry.id, schemaApiId })),
              hasNext: list.meta?.hasNext === true,
            };
          })
        );
      }
    }
  }

  for (const id of byType.get('page') ?? []) {
    const page = (sources.pages ?? []).find((candidate) => candidate.id === id);
    if (page !== undefined) targets.set(`page:${id}`, toTargetInfo({ ...page.data, id }));
  }

  await Promise.all(reads);
  return targets;

  /**
   * One chunk's worth of targets, read a page at a time until the gateway says
   * there is no successor. Paging is not optional: a read that stopped at one
   * page would silently lose every target past it, and a lost target renders
   * exactly like a deleted one.
   *
   * `wanted` is the chunk's own ids. Only those are stored, so a gateway that
   * ignores the `id:in:` filter — the category tree is served as a whole today
   * — cannot put its entire catalogue into the page's prerendered payload.
   */
  async function readInto(
    into: Map<string, LinkTargetInfo>,
    type: string,
    wanted: readonly string[],
    read: (query: {
      locale?: string;
      page: number;
      pageSize: number;
    }) => Promise<{ data: CatalogDoc[]; hasNext: boolean }>
  ): Promise<void> {
    const ids = new Set(wanted);
    try {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const result = await read({ ...localeQuery(locale), page, pageSize: PAGE_SIZE });
        for (const doc of result.data) {
          const id = text(doc.id);
          // Never overwrite: the first schema that claims an entry id wins, and
          // a later empty read cannot blank a target already found.
          if (id === '' || !ids.has(id) || into.has(`${type}:${id}`)) continue;
          into.set(`${type}:${id}`, toTargetInfo(doc));
        }
        // A page that claims a successor but serves nothing would loop forever.
        if (!result.hasNext || result.data.length === 0) return;
      }
    } catch {
      // Left unknown on purpose: the links pointing here render unlinked.
    }
  }
}

/** A catalog list response as the pager reads it. */
function toPage(list: { data: CatalogDoc[]; meta?: { hasNext?: boolean } }): {
  data: CatalogDoc[];
  hasNext: boolean;
} {
  return { data: list.data, hasNext: list.meta?.hasNext === true };
}

function idFilter(ids: readonly string[]): string {
  return `id:in:${ids.join(',')}`;
}

/** The distinct ids per `_type`, in first-seen order. A malformed key
 *  contributes nothing. */
function groupIdsByType(keys: readonly string[]): Map<string, string[]> {
  const byType = new Map<string, string[]>();
  for (const key of keys) {
    const separator = key.indexOf(':');
    if (separator <= 0) continue;
    const type = key.slice(0, separator);
    const id = key.slice(separator + 1);
    if (id === '') continue;
    const ids = byType.get(type);
    if (ids === undefined) byType.set(type, [id]);
    else if (!ids.includes(id)) ids.push(id);
  }
  return byType;
}

function chunks(ids: readonly string[] | undefined): string[][] {
  const result: string[][] = [];
  for (let start = 0; start < (ids ?? []).length; start += CHUNK_SIZE) {
    result.push((ids ?? []).slice(start, start + CHUNK_SIZE));
  }
  return result;
}

function toTargetInfo(doc: CatalogDoc): LinkTargetInfo {
  const info: LinkTargetInfo = {};
  const slug = text(doc.slug);
  if (slug !== '') info.slug = slug;
  const title = text(doc.title) !== '' ? text(doc.title) : text(doc.name);
  if (title !== '') info.title = title;
  const schemaApiId = text(doc.schemaApiId);
  if (schemaApiId !== '') info.schemaApiId = schemaApiId;
  return info;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
