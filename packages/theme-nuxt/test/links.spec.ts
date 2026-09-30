import { describe, expect, it } from 'vitest';
import { EldraClientError, type CatalogDoc, type EldraClient } from '@eldrajs/theme-core';
import { collectLinkTargets } from '../src/runtime/links';
import { resolveEldraRoute } from '../src/runtime/resolveRoute';

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
    expect(targets.get('category:cat-1')).toEqual({ slug: 'tableware', title: 'Tableware' });
    // One read each, however many links named the same collection.
    expect(paths.filter((path) => path === '/catalog/v1/collections')).toHaveLength(1);
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
