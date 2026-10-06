import { describe, expect, it, vi } from 'vitest';
import { EldraClientError, type CatalogDoc, type EldraClient } from '@eldrajs/theme-core';
import { collectLinkTargets } from '../src/runtime/links';
import {
  collectDocumentTargetKeys,
  MAX_TARGET_WALK_DEPTH,
  resolveEldraRoute,
} from '../src/runtime/resolveRoute';

const SCHEMAS = { pageSchema: 'page', routeTemplateSchema: 'route-template' };

const COLLECTION_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const ARTICLE_ID = '44444444-4444-4444-8444-444444444444';

const COLLECTION_TEMPLATE = {
  id: 'rt-collection',
  data: {
    routePattern: '/collections/:slug',
    schemaApiId: 'catalog:collection',
    slugField: 'slug',
  },
};
const ARTICLE_TEMPLATE = {
  id: 'rt-article',
  data: { routePattern: '/journal/:slug', schemaApiId: 'article', slugField: 'slug' },
};

const HOME = { id: 'p-home', data: { slug: 'home' } };

function listPage(data: CatalogDoc[]) {
  return {
    data,
    meta: {
      hasNext: false,
      hasPrev: false,
      page: 1,
      pageSize: 100,
      rows: data.length,
      total: data.length,
      totalPages: 1,
    },
  };
}

interface Handlers {
  entries?: Record<string, unknown[]>;
  entry?: Record<string, unknown>;
  listProducts?: (query: Record<string, unknown>) => unknown;
  listCollections?: (query: Record<string, unknown>) => unknown;
  listCategories?: (query: Record<string, unknown>) => unknown;
}

function stubClient(handlers: Handlers = {}): { client: EldraClient; paths: string[] } {
  const paths: string[] = [];
  const client = {
    async getEntries(schemaApiId: string, query?: Record<string, unknown>) {
      paths.push(`/cms/v1/schema/${schemaApiId}/entry`);
      const data = handlers.entries?.[schemaApiId];
      if (data === undefined) {
        throw new EldraClientError(404, 'Not Found', `/cms/v1/schema/${schemaApiId}/entry`);
      }
      const filter = (query?.filter as string[] | undefined) ?? [];
      const ids = filter
        .filter((token) => token.startsWith('id:in:'))
        .flatMap((token) => token.slice('id:in:'.length).split(','));
      const rows =
        ids.length === 0 ? data : data.filter((item) => ids.includes((item as { id: string }).id));
      return listPage(rows as CatalogDoc[]);
    },
    async getEntry(schemaApiId: string, entryId: string) {
      paths.push(`/cms/v1/schema/${schemaApiId}/entry/${entryId}`);
      const doc = handlers.entry?.[entryId];
      if (doc === undefined) {
        throw new EldraClientError(404, 'Not Found', `/cms/v1/schema/${schemaApiId}/entry`);
      }
      return doc;
    },
    async getEntryByUniqueField() {
      throw new Error('not used here');
    },
    catalog: {
      async listProducts(query: Record<string, unknown> = {}) {
        paths.push('/catalog/v1/products/list');
        return handlers.listProducts?.(query) ?? listPage([]);
      },
      async listCollections(query: Record<string, unknown> = {}) {
        paths.push('/catalog/v1/collections');
        return handlers.listCollections?.(query) ?? listPage([]);
      },
      async listCategories(query: Record<string, unknown> = {}) {
        paths.push('/catalog/v1/categories');
        return handlers.listCategories?.(query) ?? listPage([]);
      },
      async getProduct() {
        throw new Error('not used here');
      },
      async getCollection() {
        throw new Error('not used here');
      },
    },
  } as unknown as EldraClient;
  return { client, paths };
}

describe('collectLinkTargets', () => {
  it('reads one batch per type, and keys what it finds by type and id', async () => {
    const { client, paths } = stubClient({
      listProducts: () => listPage([{ id: PRODUCT_ID, slug: 'ash-glaze-mug', title: 'Ash mug' }]),
      listCollections: () => listPage([{ id: COLLECTION_ID, slug: 'knitwear', title: 'Knitwear' }]),
      listCategories: () => listPage([{ id: 'cat-1', slug: 'tableware', name: 'Tableware' }]),
    });

    const targets = await collectLinkTargets(client, [
      `collection:${COLLECTION_ID}`,
      `product:${PRODUCT_ID}`,
      'category:cat-1',
      `collection:${COLLECTION_ID}`,
    ]);

    expect(targets.get(`product:${PRODUCT_ID}`)).toEqual({
      slug: 'ash-glaze-mug',
      title: 'Ash mug',
    });
    expect(targets.get(`collection:${COLLECTION_ID}`)).toEqual({
      slug: 'knitwear',
      title: 'Knitwear',
    });
    // The category tree carries `name`, not `title`.
    expect(targets.get('category:cat-1')).toEqual({
      slug: 'tableware',
      title: 'Tableware',
      // A root's canonical path is its own slug.
      path: 'tableware',
    });
    // One read each, however many links named the same collection.
    expect(paths.filter((path) => path === '/catalog/v1/collections')).toHaveLength(1);
  });

  it('resolves no category target through a reader that has no listCategories', async () => {
    // The method is optional on the interface, so an older hand-written reader
    // still satisfies it: its category links render without a destination, the
    // same answer as a category no route template serves.
    const { client, paths } = stubClient({
      listCollections: () => listPage([{ id: COLLECTION_ID, slug: 'knitwear' }]),
    });
    delete (client.catalog as { listCategories?: unknown }).listCategories;

    const targets = await collectLinkTargets(client, [
      'category:cat-1',
      `collection:${COLLECTION_ID}`,
    ]);

    expect(targets.has('category:cat-1')).toBe(false);
    expect(paths).toEqual(['/catalog/v1/collections']);
  });

  it('asks the catalog only for the types the links actually name', async () => {
    const { client, paths } = stubClient({
      listCollections: () => listPage([{ id: COLLECTION_ID, slug: 'knitwear' }]),
    });
    await collectLinkTargets(client, [`collection:${COLLECTION_ID}`]);
    expect(paths).toEqual(['/catalog/v1/collections']);
  });

  it('reads an entry through each schema the site routes, and carries the schema back', async () => {
    const { client } = stubClient({
      entries: { article: [{ id: ARTICLE_ID, data: { slug: 'carding-wool', title: 'Carding' } }] },
    });
    const targets = await collectLinkTargets(client, [`entry:${ARTICLE_ID}`], undefined, {
      entrySchemaApiIds: ['article'],
    });
    expect(targets.get(`entry:${ARTICLE_ID}`)).toEqual({
      slug: 'carding-wool',
      title: 'Carding',
      schemaApiId: 'article',
    });
  });

  it("fills a page target from the site's own page list, with no extra read", async () => {
    const { client, paths } = stubClient();
    const targets = await collectLinkTargets(client, ['page:p-about'], undefined, {
      pages: [{ id: 'p-about', data: { slug: 'about', title: 'About us' } }],
    });
    expect(targets.get('page:p-about')).toEqual({ slug: 'about', title: 'About us' });
    expect(paths).toEqual([]);
  });

  it('pages to the end of a read, so a target past the first page still resolves', async () => {
    // A read that stopped at one page would lose every target past it, and a
    // lost target renders exactly like a deleted one.
    const ids = Array.from({ length: 40 }, (_, index) => `cat-${index}`);
    const page = (rows: string[], hasNext: boolean, number: number) => ({
      data: rows.map((id) => ({ id, slug: id })),
      meta: {
        hasNext,
        hasPrev: number > 1,
        page: number,
        pageSize: 20,
        rows: rows.length,
        total: ids.length,
        totalPages: 2,
      },
    });
    const { client, paths } = stubClient({
      listCategories: (query) =>
        Number(query.page ?? 1) === 1
          ? page(ids.slice(0, 20), true, 1)
          : page(ids.slice(20), false, 2),
    });

    const targets = await collectLinkTargets(
      client,
      ids.map((id) => `category:${id}`)
    );

    expect(targets.get('category:cat-39')).toEqual({ slug: 'cat-39', path: 'cat-39' });
    expect(targets.size).toBe(40);
    expect(paths.filter((path) => path === '/catalog/v1/categories')).toHaveLength(2);
  });

  it('reads the whole category tree and keeps only the ids it wants', async () => {
    // The tree is read whole on purpose — a category's destination is its
    // canonical path, which can only be built from its ancestors — so only the
    // wanted ids are stored, or every other row would land in the page's
    // payload.
    const { client } = stubClient({
      listCategories: () =>
        listPage([
          { id: 'cat-wanted', slug: 'tableware' },
          { id: 'cat-everything-else', slug: 'noise' },
        ]),
    });
    const targets = await collectLinkTargets(client, ['category:cat-wanted']);
    expect([...targets.keys()]).toEqual(['category:cat-wanted']);
  });

  /**
   * **A category target carries its canonical path**, which is what a catch-all category route
   * (`/categories/:path*`) is addressed by: a chunked read keyed on the wanted ids alone would
   * discard the ancestors the path is built from, and the link would resolve to the leaf slug —
   * a 404 on a canonical-only route. A row the tree cannot place carries no path rather than one
   * built over the gap.
   */
  it("fills a category target's canonical path from the tree", async () => {
    const { client } = stubClient({
      listCategories: () =>
        listPage([
          { id: 'cat-car', slug: 'billinn', title: 'Bílinn' },
          { id: 'cat-seats', slug: 'bilstolar', title: 'Bílstólar', parentId: 'cat-car' },
          { id: 'cat-orphan', slug: 'orphan', title: 'Orphan', parentId: 'gone' },
        ]),
    });

    const targets = await collectLinkTargets(client, ['category:cat-seats', 'category:cat-orphan']);

    expect(targets.get('category:cat-seats')).toEqual({
      slug: 'bilstolar',
      title: 'Bílstólar',
      path: 'billinn/bilstolar',
    });
    expect(targets.has('category:cat-orphan')).toBe(false);
  });

  it('leaves a target unknown when its read fails, rather than throwing', async () => {
    const { client } = stubClient({
      listCollections: () => {
        throw new EldraClientError(500, 'Server Error', '/catalog/v1/collections');
      },
      listProducts: () => listPage([{ id: PRODUCT_ID, slug: 'ash-glaze-mug' }]),
    });

    const targets = await collectLinkTargets(client, [
      `collection:${COLLECTION_ID}`,
      `product:${PRODUCT_ID}`,
    ]);

    expect(targets.has(`collection:${COLLECTION_ID}`)).toBe(false);
    // The other read still landed: one failure costs only its own links.
    expect(targets.get(`product:${PRODUCT_ID}`)).toEqual({ slug: 'ash-glaze-mug' });
  });
});

describe('collectDocumentTargetKeys', () => {
  /** A link value buried `levels` objects deep in a block's data. */
  function nested(levels: number): Record<string, unknown> {
    let value: unknown = { kind: 'collection', target: { _type: 'collection', id: COLLECTION_ID } };
    for (let i = 0; i < levels; i += 1) value = { nested: [value] };
    return { id: 'e1', data: { blocks: [{ id: 'b', data: { field: value } }] } } as never;
  }

  it('reaches a link far deeper than any block grammar allows', () => {
    // Composite nesting caps at 5, each level costs two steps here, and the
    // document adds its own envelope on top — a walk that gave up at 8 missed
    // a link inside a composite inside a list.
    const warn = vi.fn();
    expect(collectDocumentTargetKeys(nested(20) as never, warn)).toEqual([
      `collection:${COLLECTION_ID}`,
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('says so when it gives up, rather than silently dropping the target', () => {
    const warn = vi.fn();
    const keys = collectDocumentTargetKeys(nested(MAX_TARGET_WALK_DEPTH) as never, warn);
    expect(keys).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('renders without a destination');
    expect(warn.mock.calls[0]![0]).toContain('e1');
  });
});

describe('resolveEldraRoute — the link context', () => {
  const homePage = {
    id: 'p-home',
    data: {
      slug: 'home',
      blocks: [
        {
          id: 'b-nav',
          data: {
            links: [
              {
                kind: 'collection',
                target: { _type: 'collection', id: COLLECTION_ID },
                children: [{ kind: 'url', url: '/journal' }],
              },
            ],
          },
        },
      ],
    },
  };

  it('fills pages, templates and the targets the blocks name', async () => {
    const { client } = stubClient({
      entries: { page: [HOME], 'route-template': [COLLECTION_TEMPLATE, ARTICLE_TEMPLATE] },
      entry: { 'p-home': homePage },
      listCollections: () => listPage([{ id: COLLECTION_ID, slug: 'knitwear', title: 'Knitwear' }]),
    });

    const resolved = await resolveEldraRoute(client, SCHEMAS, '/');

    expect(resolved.links.pages.map((page) => page.id)).toEqual(['p-home']);
    expect(resolved.links.templates.map((template) => template.id)).toEqual([
      'rt-collection',
      'rt-article',
    ]);
    expect(resolved.links.targets.get(`collection:${COLLECTION_ID}`)).toEqual({
      slug: 'knitwear',
      title: 'Knitwear',
    });
  });

  it('reads no targets for a page whose blocks name none', async () => {
    const plainPage = { id: 'p-home', data: { slug: 'home', blocks: [{ id: 'b', data: {} }] } };
    const { client, paths } = stubClient({
      entries: { page: [HOME], 'route-template': [COLLECTION_TEMPLATE] },
      entry: { 'p-home': plainPage },
    });

    const resolved = await resolveEldraRoute(client, SCHEMAS, '/');

    expect(resolved.links.targets.size).toBe(0);
    expect(paths.some((path) => path.startsWith('/catalog/'))).toBe(false);
  });

  it('still resolves the page when the target read fails — the link renders unlinked', async () => {
    const { client } = stubClient({
      entries: { page: [HOME], 'route-template': [COLLECTION_TEMPLATE] },
      entry: { 'p-home': homePage },
      listCollections: () => {
        throw new EldraClientError(503, 'Unavailable', '/catalog/v1/collections');
      },
    });

    const resolved = await resolveEldraRoute(client, SCHEMAS, '/');

    expect(resolved.page?.id).toBe('p-home');
    expect(resolved.links.targets.size).toBe(0);
  });

  it('carries an empty link context on the not-found route', async () => {
    const { client } = stubClient({ entries: { page: [], 'route-template': [] } });
    const resolved = await resolveEldraRoute(client, SCHEMAS, '/nope');
    expect(resolved.links).toEqual({ pages: [], templates: [], targets: new Map() });
  });
});
