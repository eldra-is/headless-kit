import type { CatalogDoc, EldraClient, EntryDoc } from '@eldrajs/theme-core';
import type { LinkTargetInfo } from '@eldrajs/theme-core/links';
import { buildCategoryTree } from './catalog';
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
 * The category read is skipped entirely by a reader that does not offer one.
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
  // `listCategories` is optional on the reader: one that does not have it
  // resolves no category targets, and those links render without a destination
  // exactly as they do where no route template serves them.
  //
  // **Categories are read whole, once**, rather than in `id:in:` chunks like the
  // other two: a category's destination is its *canonical path*, and a path can
  // only be built from the row's ancestors — which a chunked read keyed on the
  // wanted ids throws away. The list is a handful of rows and the gateway serves
  // the tree as a whole anyway, so this costs one request and makes a category
  // link resolve under a catch-all route template (`/categories/:path*`) instead
  // of rendering as text.
  const listCategories = client.catalog.listCategories?.bind(client.catalog);
  const wantedCategories = byType.get('category') ?? [];
  if (listCategories !== undefined && wantedCategories.length > 0) {
    reads.push(readCategoriesInto(targets, wantedCategories, listCategories, locale));
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

/**
 * The wanted categories as targets carrying their **canonical path** — the slug
 * chain from the root, joined with `/`, which is what a catch-all category route
 * is addressed by (`@eldrajs/theme-core`'s `LinkTargetInfo.path`).
 *
 * The whole list is paged in and the tree is built from all of it; only the
 * wanted ids are then stored, so a gateway that serves more than was asked for
 * cannot put its catalogue into the page's payload. A row the tree cannot place
 * — a missing field, or a parent the list does not hold — is left unknown rather
 * than given a path over the gap, because such a path addresses a different
 * category. A failed read leaves every one of them unknown, the same way the
 * chunked reads do: those links render unlinked.
 */
async function readCategoriesInto(
  into: Map<string, LinkTargetInfo>,
  wanted: readonly string[],
  listCategories: NonNullable<EldraClient['catalog']['listCategories']>,
  locale?: string
): Promise<void> {
  const ids = new Set(wanted);
  const docs: CatalogDoc[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const list = await listCategories({ ...localeQuery(locale), page, pageSize: PAGE_SIZE });
      docs.push(...list.data);
      if (list.meta?.hasNext !== true || list.data.length === 0) break;
    }
  } catch {
    // Left unknown on purpose: the links pointing here render unlinked.
    return;
  }
  for (const node of buildCategoryTree(docs).values()) {
    if (!ids.has(node.id) || into.has(`category:${node.id}`)) continue;
    into.set(`category:${node.id}`, { ...toTargetInfo(node.raw), path: node.path });
  }
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
