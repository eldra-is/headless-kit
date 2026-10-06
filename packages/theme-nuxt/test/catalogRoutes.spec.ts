import { describe, expect, it } from 'vitest';
import { EldraClientError, type CatalogDoc, type EldraClient } from '@eldrajs/theme-core';
import {
  buildCategoryTree,
  catalogDocRoutes,
  listCatalogDocs,
  projectCatalogEntry,
  projectCategoryNode,
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

const CATEGORY_TEMPLATE = {
  id: 'rt-category',
  data: {
    title: 'Category template',
    routePattern: '/categories/:path*',
    schemaApiId: 'catalog:category',
    slugField: 'path',
  },
};

/**
 * The category list as `GET /catalog/v1/categories` answers it: one row per category, a tree by
 * `parentId`, no trail anywhere. Two roots, one of them three levels deep, which is what makes a
 * nested canonical path testable.
 */
const CATEGORIES = [
  { id: 'cat-car', slug: 'billinn', title: 'Bílinn', parentId: null },
  { id: 'cat-seats', slug: 'bilstolar', title: 'Bílstólar', parentId: 'cat-car' },
  { id: 'cat-baby', slug: 'barnasaeti', title: 'Barnasæti', parentId: 'cat-seats' },
  { id: 'cat-mats', slug: 'mottur', title: 'Mottur', parentId: 'cat-car' },
  { id: 'cat-home', slug: 'heimilid', title: 'Heimilið', parentId: null },
];

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
    listCategories?: ((page: number) => ReturnType<typeof listPage>) | null;
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
      // `null` stands for a reader that predates the method: the key is dropped
      // entirely, so `client.catalog.listCategories` is `undefined`.
      ...(handlers.listCategories === null
        ? {}
        : {
            async listCategories(query?: Record<string, unknown>) {
              record('/catalog/v1/categories', query);
              return (
                handlers.listCategories?.(Number(query?.page ?? 1)) ??
                listPage(CATEGORIES, 1, false)
              );
            },
          }),
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

  /**
   * The whole point of the catch-all: a nested category is resolved by walking the path's segments
   * down the tree, and the route context carries both halves — the leaf's slug for a surface that
   * filters by one category, the canonical path for a link back to this page.
   */
  it('resolves a nested category by walking the canonical path down the tree', async () => {
    const { client, calls } = stubClient({
      entries: { page: [], 'route-template': [CATEGORY_TEMPLATE] },
      entry: { 'rt-category': CATEGORY_TEMPLATE },
    });

    const resolved = await resolveEldraRoute(
      client,
      SCHEMAS,
      '/categories/billinn/bilstolar/barnasaeti',
      undefined
    );

    expect(resolved.catalog).toEqual({
      kind: 'category',
      slug: 'barnasaeti',
      path: 'billinn/bilstolar/barnasaeti',
    });
    expect(resolved.entry?.id).toBe('cat-baby');
    expect(resolved.entry?.data.ancestors).toEqual([
      { slug: 'billinn', title: 'Bílinn', path: 'billinn' },
      { slug: 'bilstolar', title: 'Bílstólar', path: 'billinn/bilstolar' },
    ]);
    expect(resolved.entry?.data.children).toEqual([]);
    expect(calls.paths).toContain('/catalog/v1/categories');
  });

  /**
   * **Canonical only, no redirects** (the cross-repo contract): a leaf on its own, a wrong parent
   * and a trailing extra segment are each the not-found shell rather than a redirect to the page
   * the visitor probably meant.
   */
  it.each([
    ['a leaf without its ancestors', '/categories/bilstolar'],
    ['a wrong parent', '/categories/heimilid/bilstolar'],
    ['a trailing extra segment', '/categories/billinn/bilstolar/nope'],
    ['the bare prefix', '/categories'],
  ])('answers the not-found shell for %s', async (_label, path) => {
    const { client } = stubClient({
      entries: { page: [], 'route-template': [CATEGORY_TEMPLATE] },
      entry: { 'rt-category': CATEGORY_TEMPLATE },
    });

    expect(await resolveEldraRoute(client, SCHEMAS, path, undefined)).toEqual(EMPTY_ELDRA_ROUTE);
  });

  it('resolves no category at all through a reader that has no listCategories', async () => {
    const { client } = stubClient({
      entries: { page: [], 'route-template': [CATEGORY_TEMPLATE] },
      entry: { 'rt-category': CATEGORY_TEMPLATE },
      listCategories: null,
    });

    expect(await resolveEldraRoute(client, SCHEMAS, '/categories/billinn', undefined)).toEqual(
      EMPTY_ELDRA_ROUTE
    );
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
    // The same two calls `module.ts`'s `prerender:routes` makes, in the same
    // order — it lists once per kind and maps per template, so there is no
    // list-and-map helper to call instead.
    const docs = await listCatalogDocs(client, kind);
    const paths = catalogDocRoutes(kind, docs, pattern, (message) => warnings.push(message));
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

describe('category tree', () => {
  it('keys every placeable category by its canonical path, root slug first', () => {
    expect([...buildCategoryTree(CATEGORIES).keys()]).toEqual([
      'billinn',
      'billinn/bilstolar',
      'billinn/bilstolar/barnasaeti',
      'billinn/mottur',
      'heimilid',
    ]);
  });

  it('places a category with its ancestors and its direct children only', () => {
    const node = buildCategoryTree(CATEGORIES).get('billinn/bilstolar')!;
    expect(node.id).toBe('cat-seats');
    expect(node.ancestors).toEqual([{ slug: 'billinn', title: 'Bílinn', path: 'billinn' }]);
    expect(node.children).toEqual([
      { slug: 'barnasaeti', title: 'Barnasæti', path: 'billinn/bilstolar/barnasaeti' },
    ]);
    // The root's children are its own, never its grandchildren.
    expect(buildCategoryTree(CATEGORIES).get('billinn')!.children).toEqual([
      { slug: 'bilstolar', title: 'Bílstólar', path: 'billinn/bilstolar' },
      { slug: 'mottur', title: 'Mottur', path: 'billinn/mottur' },
    ]);
  });

  /**
   * A row with no slug cannot be spelled into a path and a row whose parent the list does not hold
   * cannot have a canonical path at all — a path built over that gap would address a different
   * category — so both are dropped, and dropping a parent drops its subtree with it. A missing
   * **title** is not one of those: it follows the projection's standing rule and reads as `''`,
   * because a category the merchant really has must still have its page.
   */
  it('drops a row it cannot place, and the subtree under it', () => {
    const tree = buildCategoryTree([
      { id: 'a', slug: 'a', title: 'A', parentId: null },
      { id: 'b', slug: '', title: 'No slug', parentId: 'a' },
      { id: 'c', slug: 'c', title: '', parentId: 'a' },
      { id: 'd', slug: 'd', title: 'D', parentId: 'gone' },
      { id: 'e', slug: 'e', title: 'E', parentId: 'b' },
    ]);
    expect([...tree.keys()]).toEqual(['a', 'a/c']);
    expect(tree.get('a')!.children).toEqual([{ slug: 'c', title: '', path: 'a/c' }]);
  });

  it('stops rather than hangs on a parent cycle', () => {
    const tree = buildCategoryTree([
      { id: 'x', slug: 'x', title: 'X', parentId: 'y' },
      { id: 'y', slug: 'y', title: 'Y', parentId: 'x' },
      { id: 'z', slug: 'z', title: 'Z', parentId: null },
    ]);
    expect([...tree.keys()]).toEqual(['z']);
  });

  it('lets the first row win a duplicate path', () => {
    const tree = buildCategoryTree([
      { id: 'first', slug: 'dup', title: 'First', parentId: null },
      { id: 'second', slug: 'dup', title: 'Second', parentId: null },
    ]);
    expect(tree.size).toBe(1);
    expect(tree.get('dup')!.id).toBe('first');
  });
});

describe('category projection', () => {
  it('always carries the binding paths a template addresses', () => {
    const node = buildCategoryTree(CATEGORIES).get('billinn/mottur')!;
    expect(projectCategoryNode(node)).toEqual({
      id: 'cat-mats',
      data: {
        slug: 'mottur',
        title: 'Mottur',
        path: 'billinn/mottur',
        ancestors: [{ slug: 'billinn', title: 'Bílinn', path: 'billinn' }],
        children: [],
      },
    });
  });

  /**
   * `description` and `productCount` are the two fields the catalog category model may not have at
   * all, so they are carried only when the read carried them: a key invented here would bind a
   * template to an empty value on every site whose categories have neither.
   */
  it('carries description and productCount only when the read did', () => {
    const tree = buildCategoryTree([
      {
        id: 'cat-rich',
        slug: 'rich',
        title: 'Rich',
        parentId: null,
        description: { type: 'doc', content: [] },
        productCount: 12,
      },
    ]);
    expect(projectCategoryNode(tree.get('rich')!).data).toEqual({
      slug: 'rich',
      title: 'Rich',
      path: 'rich',
      ancestors: [],
      children: [],
      description: { type: 'doc', content: [] },
      productCount: 12,
    });
  });
});

describe('category prerender listing', () => {
  const categoryRoutes = async (
    docs: Array<Record<string, unknown>>,
    warnings: string[] = []
  ): Promise<{ paths: string[]; calls: ClientCalls }> => {
    const { client, calls } = stubClient({ listCategories: () => listPage(docs, 1, false) });
    const listed = await listCatalogDocs(client, 'category');
    return {
      paths: catalogDocRoutes('category', listed, '/categories/:path*', (message) =>
        warnings.push(message)
      ),
      calls,
    };
  };

  /** One route per canonical path — which is the only path the category route answers. */
  it('adds one prerendered route per canonical category path', async () => {
    const { paths, calls } = await categoryRoutes(CATEGORIES);
    expect(paths).toEqual([
      '/categories/billinn',
      '/categories/billinn/bilstolar',
      '/categories/billinn/bilstolar/barnasaeti',
      '/categories/billinn/mottur',
      '/categories/heimilid',
    ]);
    expect(calls.paths).toEqual(['/catalog/v1/categories']);
  });

  it('encodes a non-ASCII slug the same way the matcher reads it back', async () => {
    const { paths } = await categoryRoutes([
      { id: 'a', slug: 'bílinn', title: 'Bílinn', parentId: null },
      { id: 'b', slug: 'bílstólar', title: 'Bílstólar', parentId: 'a' },
    ]);
    expect(paths).toEqual([
      '/categories/b%C3%ADlinn',
      '/categories/b%C3%ADlinn/b%C3%ADlst%C3%B3lar',
    ]);
  });

  it('generates nothing for a reader with no listCategories', async () => {
    const { client } = stubClient({ listCategories: null });
    expect(await listCatalogDocs(client, 'category')).toEqual([]);
  });
});
