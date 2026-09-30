import type { CatalogDoc, EldraClient, EntryDoc } from '@eldrajs/theme-core';
import type { LinkTargetInfo } from '@eldrajs/theme-core/links';
import { localeQuery } from './locale';

/** One `id:in:` token stays well inside a URL length the gateway accepts and
 * keeps one response small — the same chunk the storefront's own batched reads
 * use. */
const CHUNK_SIZE = 50;

/** Enough for the chunk above in one page, whatever the gateway's default is. */
const PAGE_SIZE = 100;

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
 * One batched read per type, never one per link: products and collections by an
 * `id:in:` filter in chunks, categories in one unpaginated read (the tree has no
 * id filter and is small), entries one read per schema the site routes. A read
 * that fails leaves those targets unknown rather than throwing — a link whose
 * target cannot be resolved renders unlinked, exactly as a deleted target does,
 * and one failing catalog read must not take a whole page down.
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
      readInto(
        targets,
        'product',
        async (query) =>
          (await client.catalog.listProducts({ ...query, filter: [idFilter(chunk)] })).data
      )
    );
  }
  for (const chunk of chunks(byType.get('collection'))) {
    reads.push(
      readInto(
        targets,
        'collection',
        async (query) =>
          (await client.catalog.listCollections({ ...query, filter: [idFilter(chunk)] })).data
      )
    );
  }
  if ((byType.get('category') ?? []).length > 0) {
    reads.push(
      readInto(
        targets,
        'category',
        async (query) => (await client.catalog.listCategories(query)).data
      )
    );
  }
  if ((byType.get('entry') ?? []).length > 0) {
    for (const schemaApiId of sources.entrySchemaApiIds ?? []) {
      for (const chunk of chunks(byType.get('entry'))) {
        reads.push(
          readInto(targets, 'entry', async (query) => {
            const list = await client.getEntries(schemaApiId, {
              ...query,
              depth: 0,
              filter: [idFilter(chunk)],
            });
            return list.data.map((entry) => ({ ...entry.data, id: entry.id, schemaApiId }));
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

  async function readInto(
    into: Map<string, LinkTargetInfo>,
    type: string,
    read: (query: { locale?: string; pageSize: number }) => Promise<CatalogDoc[]>
  ): Promise<void> {
    try {
      const docs = await read({ ...localeQuery(locale), pageSize: PAGE_SIZE });
      for (const doc of docs) {
        const id = text(doc.id);
        // Never overwrite: the first schema that claims an entry id wins, and a
        // later empty read cannot blank a target already found.
        if (id !== '' && !into.has(`${type}:${id}`)) into.set(`${type}:${id}`, toTargetInfo(doc));
      }
    } catch {
      // Left unknown on purpose: the links pointing here render unlinked.
    }
  }
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
