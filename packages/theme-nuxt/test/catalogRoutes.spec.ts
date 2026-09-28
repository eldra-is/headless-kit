import { describe, expect, it } from 'vitest';
import { EldraClientError, type CatalogDoc, type EldraClient } from '@eldrajs/theme-core';
import {
  catalogTemplateRoutes,
  projectCatalogEntry,
  type CatalogRouteKind,
} from '../src/runtime/catalog';
import { EMPTY_ELDRA_ROUTE, resolveEldraRoute } from '../src/runtime/resolveRoute';

const SCHEMAS = { pageSchema: 'page', routeTemplateSchema: 'route-template' };

const PRODUCT_TEMPLATE = {
  id: 'rt-product',
  data: {
    title: 'Product template',
    routePattern: '/products/:slug',
    schemaApiId: 'catalog:product',
    slugField: 'slug',
  },
};

const COLLECTION_TEMPLATE = {
  id: 'rt-collection',
  data: {
    title: 'Collection template',
    routePattern: '/collections/:slug',
    schemaApiId: 'catalog:collection',
    slugField: 'slug',
  },
};

const MERINO_CREW = {
  id: 'prod-merino',
  slug: 'merino-crew',
  title: 'Merino crew',
  status: 'ACTIVE',
  description: { type: 'doc', content: [] },
  categoryId: 'cat-knitwear',
  tags: ['wool', 'winter'],
  mediaLinks: [
    { assetId: 'a2', url: 'https://cdn.example.test/2.jpg', altText: 'Back', sortOrder: 2 },
    { assetId: 'a1', url: 'https://cdn.example.test/1.jpg', altText: 'Front', sortOrder: 1 },
  ],
  variants: [
    {
      id: 'v1',
      sku: 'MC-S',
      price: 12900,
      compareAtPrice: 15900,
      status: 'ACTIVE',
      optionValues: [{ id: 'ov1', name: 'Small', optionId: 'o1', optionValueId: 'ovv1' }],
    },
  ],
};

const WINTER_EDIT = {
  id: 'col-winter',
  slug: 'the-winter-edit',
  title: 'The winter edit',
  description: 'Cold-weather picks',
  productCount: 24,
  image: { assetId: 'a9', url: 'https://cdn.example.test/winter.jpg', altText: 'Snow' },
  sortMode: 'MANUAL',
};

function listPage(data: CatalogDoc[], page: number, hasNext: boolean) {
  return {
    data,
    meta: {
      hasNext,
      hasPrev: page > 1,
      page,
      pageSize: 100,
      rows: data.length,
      total: 0,
      totalPages: 0,
    },
  };
}

interface ClientCalls {
  paths: string[];
  queries: Array<Record<string, unknown> | undefined>;
}

function stubClient(
  handlers: {
    entries?: Record<string, unknown[]>;
    entry?: Record<string, unknown>;
    getProduct?: (slug: string) => unknown;
    getCollection?: (slug: string) => unknown;
    listProducts?: (page: number) => ReturnType<typeof listPage>;
    listCollections?: (page: number) => ReturnType<typeof listPage>;
  } = {}
): { client: EldraClient; calls: ClientCalls } {
  const calls: ClientCalls = { paths: [], queries: [] };
  const record = (path: string, query?: Record<string, unknown>): void => {
    calls.paths.push(path);
    calls.queries.push(query);
  };
  const notFound = (path: string): never => {
    throw new EldraClientError(404, 'Not Found', path);
  };
  const client = {
    async getEntries(schemaApiId: string, query?: Record<string, unknown>) {
      record(`/cms/v1/schema/${schemaApiId}/entry`, query);
      const data = handlers.entries?.[schemaApiId];
      if (data === undefined) notFound(`/cms/v1/schema/${schemaApiId}/entry`);
      return listPage(data as CatalogDoc[], 1, false);
    },
    async getEntry(schemaApiId: string, entryId: string, query?: Record<string, unknown>) {
      record(`/cms/v1/schema/${schemaApiId}/entry/${entryId}`, query);
      const doc = handlers.entry?.[entryId];
      if (doc === undefined) notFound(`/cms/v1/schema/${schemaApiId}/entry/${entryId}`);
      return doc;
    },
    async getEntryByUniqueField(schemaApiId: string, fieldId: string, value: string) {
      record(`/cms/v1/schema/${schemaApiId}/entry/unique/${fieldId}/${value}`);
      throw new Error('the CMS unique-field endpoint must not be used for a catalog template');
    },
    catalog: {
      async getProduct(slug: string, query?: Record<string, unknown>) {
        record(`/catalog/v1/products/${slug}`, query);
        const doc = handlers.getProduct?.(slug);
        if (doc === undefined) notFound(`/catalog/v1/products/${slug}`);
        return doc;
      },
      async getCollection(slug: string, query?: Record<string, unknown>) {
        record(`/catalog/v1/collections/${slug}`, query);
        const doc = handlers.getCollection?.(slug);
        if (doc === undefined) notFound(`/catalog/v1/collections/${slug}`);
        return doc;
      },
      async listProducts(query?: Record<string, unknown>) {
        record('/catalog/v1/products/list', query);
        return handlers.listProducts?.(Number(query?.page ?? 1)) ?? listPage([], 1, false);
      },
      async listCollections(query?: Record<string, unknown>) {
        record('/catalog/v1/collections', query);
        return handlers.listCollections?.(Number(query?.page ?? 1)) ?? listPage([], 1, false);
      },
    },
  } as unknown as EldraClient;
  return { client, calls };
}

describe('catalog-backed route resolution', () => {
  it('loads a product by slug through the catalog, never the CMS entry endpoint', async () => {
    const { client, calls } = stubClient({
      entries: { page: [], 'route-template': [PRODUCT_TEMPLATE] },
      entry: { 'rt-product': PRODUCT_TEMPLATE },
      getProduct: (slug) => (slug === 'merino-crew' ? MERINO_CREW : undefined),
    });

    const resolved = await resolveEldraRoute(client, SCHEMAS, '/products/merino-crew', 'is');

    expect(resolved.catalog).toEqual({ kind: 'product', slug: 'merino-crew' });
    expect(resolved.page).toBeNull();
    expect(resolved.template?.id).toBe('rt-product');
    expect(resolved.entry?.id).toBe('prod-merino');
    expect(resolved.entry?.data.title).toBe('Merino crew');
    expect(calls.paths).toContain('/catalog/v1/products/merino-crew');
    expect(calls.paths.some((path) => path.includes('/entry/unique/'))).toBe(false);
  });

  it('passes the runtime locale to the catalog read', async () => {
    const { client, calls } = stubClient({
      entries: { page: [], 'route-template': [PRODUCT_TEMPLATE] },
      entry: { 'rt-product': PRODUCT_TEMPLATE },
      getProduct: () => MERINO_CREW,
    });

    await resolveEldraRoute(client, SCHEMAS, '/products/merino-crew', 'is');

    const index = calls.paths.indexOf('/catalog/v1/products/merino-crew');
    expect(calls.queries[index]).toEqual({ locale: 'is' });
  });

  it('renders the not-found shell when the catalog does not know the slug', async () => {
    const { client } = stubClient({
      entries: { page: [], 'route-template': [PRODUCT_TEMPLATE] },
      entry: { 'rt-product': PRODUCT_TEMPLATE },
      getProduct: () => undefined,
    });

    const resolved = await resolveEldraRoute(client, SCHEMAS, '/products/gone', undefined);

    expect(resolved).toEqual(EMPTY_ELDRA_ROUTE);
    expect(resolved.catalog).toBeNull();
  });

  it('resolves a collection template by slug', async () => {
    const { client, calls } = stubClient({
      entries: { page: [], 'route-template': [COLLECTION_TEMPLATE] },
      entry: { 'rt-collection': COLLECTION_TEMPLATE },
      getCollection: (slug) => (slug === 'the-winter-edit' ? WINTER_EDIT : undefined),
    });

    const resolved = await resolveEldraRoute(
      client,
      SCHEMAS,
      '/collections/the-winter-edit',
      undefined
    );

    expect(resolved.catalog).toEqual({ kind: 'collection', slug: 'the-winter-edit' });
    expect(resolved.entry?.data.productCount).toBe(24);
    expect(calls.paths).toContain('/catalog/v1/collections/the-winter-edit');
  });

  it('rethrows a non-404 catalog failure so the theme can show its error branch', async () => {
    const { client } = stubClient({
      entries: { page: [], 'route-template': [PRODUCT_TEMPLATE] },
      entry: { 'rt-product': PRODUCT_TEMPLATE },
      getProduct: () => {
        throw new EldraClientError(503, 'Service Unavailable', '/catalog/v1/products/merino-crew');
      },
    });

    await expect(
      resolveEldraRoute(client, SCHEMAS, '/products/merino-crew', undefined)
    ).rejects.toThrow('503');
  });
});

describe('catalog projections', () => {
  it('maps a product response onto the documented binding paths', () => {
    expect(projectCatalogEntry('product', MERINO_CREW)).toEqual({
      id: 'prod-merino',
      data: {
        slug: 'merino-crew',
        title: 'Merino crew',
        description: { type: 'doc', content: [] },
        status: 'ACTIVE',
        categoryId: 'cat-knitwear',
        tags: ['wool', 'winter'],
        variants: [
          {
            sku: 'MC-S',
            price: 12900,
            compareAtPrice: 15900,
            optionValues: [{ id: 'ov1', name: 'Small', optionId: 'o1', optionValueId: 'ovv1' }],
          },
        ],
        images: [
          { url: 'https://cdn.example.test/1.jpg', alt: 'Front' },
          { url: 'https://cdn.example.test/2.jpg', alt: 'Back' },
        ],
      },
    });
  });

  it('maps a collection response onto the documented binding paths', () => {
    expect(projectCatalogEntry('collection', WINTER_EDIT)).toEqual({
      id: 'col-winter',
      data: {
        slug: 'the-winter-edit',
        title: 'The winter edit',
        description: 'Cold-weather picks',
        productCount: 24,
        image: { url: 'https://cdn.example.test/winter.jpg', alt: 'Snow' },
      },
    });
  });

  it('keeps every documented path present when the response omits optional fields', () => {
    const entry = projectCatalogEntry('product', { id: 'p1', slug: 'bare', title: 'Bare' });
    expect(entry?.data).toEqual({
      slug: 'bare',
      title: 'Bare',
      description: null,
      status: '',
      categoryId: null,
      tags: [],
      variants: [],
      images: [],
    });
  });

  it('refuses a response with no id rather than inventing an entry', () => {
    expect(projectCatalogEntry('product', { slug: 'no-id', title: 'No id' })).toBeNull();
  });
});

describe('catalog prerender listing', () => {
  const routesFor = async (
    kind: CatalogRouteKind,
    pattern: string,
    handlers: Parameters<typeof stubClient>[0],
    warnings: string[] = []
  ) => {
    const { client, calls } = stubClient(handlers);
    const paths = await catalogTemplateRoutes({
      client,
      kind,
      pattern,
      warn: (message) => warnings.push(message),
    });
    return { paths, calls };
  };

  it('pages through every active product at page size 100', async () => {
    const product = (index: number) => ({
      id: `p${index}`,
      slug: `product-${index}`,
      title: `Product ${index}`,
      status: 'ACTIVE',
    });
    const pages = [
      listPage(
        Array.from({ length: 100 }, (_, i) => product(i)),
        1,
        true
      ),
      listPage(
        Array.from({ length: 100 }, (_, i) => product(100 + i)),
        2,
        true
      ),
      listPage(
        Array.from({ length: 50 }, (_, i) => product(200 + i)),
        3,
        false
      ),
    ];
    const { paths, calls } = await routesFor('product', '/products/:slug', {
      listProducts: (page) => pages[page - 1] ?? listPage([], page, false),
    });

    expect(paths).toHaveLength(250);
    expect(paths[0]).toBe('/products/product-0');
    expect(paths.at(-1)).toBe('/products/product-249');
    expect(calls.queries.filter((query) => query?.pageSize === 100)).toHaveLength(3);
    expect(calls.queries[0]?.filter).toEqual(['status:eq:ACTIVE']);
  });

  it('skips a product whose slug cannot become a route and names it in the warning', async () => {
    const warnings: string[] = [];
    const { paths } = await routesFor(
      'product',
      '/products/:slug',
      {
        listProducts: () =>
          listPage(
            [
              { id: 'p1', slug: 'good', title: 'Good', status: 'ACTIVE' },
              { id: 'p2', slug: '', title: 'Empty slug', status: 'ACTIVE' },
              { id: 'p3', slug: 'nested/slug', title: 'Nested', status: 'ACTIVE' },
            ],
            1,
            false
          ),
      },
      warnings
    );

    expect(paths).toEqual(['/products/good']);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('[eldra] skipped /products/');
    expect(warnings[0]).toContain('""');
    expect(warnings[1]).toContain('nested/slug');
  });

  it('leaves out a product the catalog reports as inactive', async () => {
    const { paths } = await routesFor('product', '/products/:slug', {
      listProducts: () =>
        listPage(
          [
            { id: 'p1', slug: 'live', title: 'Live', status: 'ACTIVE' },
            { id: 'p2', slug: 'draft', title: 'Draft', status: 'DRAFT' },
          ],
          1,
          false
        ),
    });

    expect(paths).toEqual(['/products/live']);
  });

  it('adds one route per active collection', async () => {
    const { paths, calls } = await routesFor('collection', '/collections/:slug', {
      listCollections: () =>
        listPage(
          [
            { id: 'c1', slug: 'the-winter-edit', title: 'Winter', productCount: 3 },
            { id: 'c2', slug: 'new-in', title: 'New in', productCount: 9 },
          ],
          1,
          false
        ),
    });

    expect(paths).toEqual(['/collections/the-winter-edit', '/collections/new-in']);
    expect(calls.paths).toEqual(['/catalog/v1/collections']);
  });

  it('stops paging when the gateway keeps claiming another page but serves none', async () => {
    const { paths, calls } = await routesFor('product', '/products/:slug', {
      listProducts: (page) => listPage(page === 1 ? [{ id: 'p1', slug: 'one' }] : [], page, true),
    });

    expect(paths).toEqual(['/products/one']);
    expect(calls.paths).toHaveLength(2);
  });
});
