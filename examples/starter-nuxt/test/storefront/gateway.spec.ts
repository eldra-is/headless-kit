import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import type { EldraClient } from '@eldrajs/sdk';
import { createGatewayStorefront } from '../../app/storefront/gateway';
import type { StorefrontCollectionSelector, StorefrontRoute } from '../../app/storefront/types';

/**
 * `createGatewayStorefront` has no spec of its own yet — this covers what D2/D3 touch: the route
 * it is handed is exactly the route a block reads back (`storefront.route`, never a copy), and
 * `catalog.collectionProducts` maps the gateway's real response shape, including the currently
 * unmapped `facets` (see that function's own comment in `gateway.ts` — the contract has no
 * facets/aggregations field on this endpoint today, checked against
 * `packages/sdk/src/__tests__/fixtures/{web-gateway.json,contract.ts}`).
 */
function fakeRoute(): StorefrontRoute {
  return {
    productHandle: null,
    collectionHandle: null,
    orderToken: null,
    query: null,
    page: 1,
    sort: null,
    columns: null,
    filters: {},
    setQuery: () => {},
  };
}

/** What a call recorder hands back: the client, plus what the gateway asked it. */
interface ClientCalls {
  client: EldraClient;
  productSlugs: string[];
  collectionQueries: Array<Record<string, unknown>>;
  collectionProductQueries: Array<Record<string, unknown>>;
  productListQueries: Array<Record<string, unknown>>;
}

/** A client whose collection list answers with `collections` — the by-id path's
 *  only source of a slug — and records every call, so a test can prove the
 *  products request was never made for an id nothing matched. */
function recordingClient(
  collections: Array<{ id: string; slug: string }> = [],
  options: {
    product?: Record<string, unknown>;
    products?: (query: Record<string, unknown>) => Array<Record<string, unknown>>;
  } = {}
): ClientCalls {
  const productSlugs: string[] = [];
  const collectionQueries: Array<Record<string, unknown>> = [];
  const collectionProductQueries: Array<Record<string, unknown>> = [];
  const productListQueries: Array<Record<string, unknown>> = [];
  const meta = { page: 1, pageSize: 24, total: 0, totalPages: 0, rows: 0 };
  const client = {
    catalog: {
      listCollections: async (query: Record<string, unknown>) => {
        collectionQueries.push(query);
        return {
          data: collections.map((item) => ({ ...item, title: item.slug, productCount: 0 })),
        };
      },
      listCollectionProducts: async (slug: string, query: Record<string, unknown>) => {
        productSlugs.push(slug);
        collectionProductQueries.push(query);
        return { data: [], meta };
      },
      getProduct: async () => options.product ?? { id: 'p1', slug: 'merino-crew-sweater' },
      listProducts: async (query: Record<string, unknown>) => {
        productListQueries.push(query);
        return { data: options.products?.(query) ?? [], meta };
      },
    },
  } as unknown as EldraClient;
  return {
    client,
    productSlugs,
    collectionQueries,
    collectionProductQueries,
    productListQueries,
  };
}

/** One product list row, in the gateway's own shape. */
function listRow(slug: string): Record<string, unknown> {
  return {
    id: slug,
    slug,
    title: slug,
    status: 'ACTIVE',
    minPrice: 1000,
    maxPrice: 1000,
    totalVariants: 1,
  };
}

function fakeClient(): EldraClient {
  return {
    catalog: {
      listCollectionProducts: async () => ({
        data: [
          {
            id: 'merino-crew-sweater::oat::m',
            slug: 'merino-crew-sweater',
            title: 'Merino crew sweater',
            status: 'ACTIVE',
            minPrice: 9600,
            maxPrice: 9600,
            totalVariants: 1,
          },
        ],
        meta: {
          page: 1,
          pageSize: 24,
          total: 1,
          totalPages: 1,
          rows: 1,
          hasNext: false,
          hasPrev: false,
        },
      }),
    },
  } as unknown as EldraClient;
}

/** Drains the microtask queue far enough for a `StorefrontResult` to have
 *  resolved — including the by-id path, which awaits a collection lookup before
 *  the products request. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

describe('createGatewayStorefront', () => {
  it('hands back the caller-provided route unchanged — the same object a block reads', () => {
    const route = fakeRoute();
    const storefront = createGatewayStorefront(fakeClient(), { route });
    expect(storefront.route).toBe(route);
  });

  it('collectionProducts maps the gateway response and documents the missing facets field as []', async () => {
    const storefront = createGatewayStorefront(fakeClient(), { route: fakeRoute() });
    const collection = ref<StorefrontCollectionSelector | null>({ slug: 'winter-knitwear' });
    const opts = ref({ page: 1, pageSize: 24 });
    const result = storefront.catalog.collectionProducts(collection, opts);
    await settle();

    expect(result.error.value).toBeNull();
    expect(result.data.value).toEqual({
      items: [
        expect.objectContaining({
          handle: 'merino-crew-sweater',
          title: 'Merino crew sweater',
          url: '/products/merino-crew-sweater',
          price: { amount: 9600, compareAt: null, from: false },
          stock: 'in',
          available: true,
        }),
      ],
      total: 1,
      facets: [],
    });
  });

  /**
   * Every URL in a search response is gateway-supplied. `mapSearchResponse` used to write
   * `result.targetUrl ?? '#'` into the product/journal/page rows, so a result with no destination
   * became a card linking to nowhere (M10) and any URL the gateway returned reached the DOM
   * unchecked while every CMS-authored href in the theme was gated by `safeHref` (I1). It now
   * drops a result whose `targetUrl` does not survive `safeHref`.
   */
  it('search drops results whose targetUrl is missing or unsafe, and never emits a "#" link', async () => {
    const client = {
      catalog: {
        search: async () => ({
          total: 5,
          results: [
            { id: 'p1', kind: 'PRODUCT', title: 'Good product', targetUrl: '/products/good' },
            { id: 'p2', kind: 'PRODUCT', title: 'No link product' },
            {
              id: 'p3',
              kind: 'PRODUCT',
              title: 'Unsafe product',
              targetUrl: 'javascript:alert(1)',
            },
            {
              id: 'e1',
              kind: 'CMS_ENTRY',
              title: 'Good story',
              targetUrl: '/journal/good',
              breadcrumb: 'Journal',
            },
            { id: 'e2', kind: 'CMS_ENTRY', title: 'No link story' },
            { id: 's1', kind: 'CMS_SCHEMA', title: 'Good page', targetUrl: '/pages/good' },
            { id: 's2', kind: 'CMS_SCHEMA', title: 'Unsafe page', targetUrl: '//evil.example/x' },
          ],
        }),
      },
    } as unknown as EldraClient;

    const storefront = createGatewayStorefront(client, { route: fakeRoute() });
    const result = storefront.search.run(ref('linen'));
    await settle();

    const response = result.data.value!;
    expect(response.products.map((product) => product.title)).toEqual(['Good product']);
    expect(response.products[0]!.url).toBe('/products/good');
    expect(response.articles.map((article) => article.title)).toEqual(['Good story']);
    expect(response.pages.map((page) => page.title)).toEqual(['Good page']);
    expect(response.pages[0]!.path).toBe('/pages/good');

    const everyHref = [
      ...response.products.map((product) => product.url),
      ...response.articles.map((article) => article.href),
      ...response.pages.map((page) => page.href),
    ];
    expect(everyHref).not.toContain('#');
    expect(everyHref.some((href) => href.startsWith('javascript:'))).toBe(false);
  });

  it('collectionProducts resolves null for no collection at all, without calling the client', async () => {
    const storefront = createGatewayStorefront(fakeClient(), { route: fakeRoute() });
    const collection = ref<StorefrontCollectionSelector | null>(null);
    const opts = ref({ page: 1, pageSize: 24 });
    const result = storefront.catalog.collectionProducts(collection, opts);
    await settle();
    expect(result.data.value).toBeNull();
    expect(result.error.value).toBeNull();
  });

  /**
   * A `reference` field stores the collection's id, and a depth-0 read or a page
   * builder draft overlay carries nothing else — so the gateway has to find the
   * slug itself. There is no by-id collection route, so it filters the list.
   */
  it('collectionProducts resolves a collection id to its slug through the list filter', async () => {
    const id = '2f1b8d54-0d3a-4a6f-9a0b-7f6c1d2e3a01';
    const calls = recordingClient([{ id, slug: 'winter-knitwear' }]);
    const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });
    const collection = ref<StorefrontCollectionSelector | null>({ id });
    const opts = ref({ page: 1, pageSize: 24 });
    const result = storefront.catalog.collectionProducts(collection, opts);
    await settle();

    expect(calls.collectionQueries).toEqual([{ limit: 1, filter: [`id:eq:${id}`] }]);
    expect(calls.productSlugs).toEqual(['winter-knitwear']);
    expect(result.error.value).toBeNull();
    expect(result.data.value).toEqual({ items: [], total: 0, facets: [] });
  });

  /**
   * Every token below is `[groupIndex:]field:op:value` against a field the
   * endpoint filters on — the grammar and the field set the SDK's contract
   * fixture documents. The two the theme used to send (`slug:a,b` and
   * `relatedTo:<handle>`) were neither, and the gateway answered 400.
   */
  it('byHandles asks for the whole set in one `in` token, and only for active products', async () => {
    const calls = recordingClient([], {
      products: () => [listRow('merino-crew-sweater'), listRow('stoneware-mug')],
    });
    const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });
    const result = storefront.catalog.byHandles(ref(['merino-crew-sweater', 'stoneware-mug']));
    await settle();

    expect(calls.productListQueries).toEqual([
      { pageSize: 2, filter: ['slug:in:merino-crew-sweater,stoneware-mug', 'status:eq:ACTIVE'] },
    ]);
    expect(result.data.value?.map((item) => item.handle)).toEqual([
      'merino-crew-sweater',
      'stoneware-mug',
    ]);
  });

  it('byHandles drops a handle that cannot survive the token grammar, and asks for nothing at all when none can', async () => {
    const calls = recordingClient([], { products: () => [listRow('stoneware-mug')] });
    const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });
    storefront.catalog.byHandles(ref(['a,b', 'stoneware-mug']));
    await settle();
    expect(calls.productListQueries[0]?.filter).toEqual([
      'slug:in:stoneware-mug',
      'status:eq:ACTIVE',
    ]);

    const empty = recordingClient();
    const emptyStore = createGatewayStorefront(empty.client, { route: fakeRoute() });
    const result = emptyStore.catalog.byHandles(ref(['x:y']));
    await settle();
    expect(empty.productListQueries).toEqual([]);
    expect(result.data.value).toEqual([]);
  });

  it('related asks for the current product’s category and leaves the product itself out', async () => {
    const calls = recordingClient([], {
      product: { id: 'p1', slug: 'merino-crew-sweater', categoryId: 'cat-knitwear' },
      products: () => [listRow('merino-crew-sweater'), listRow('lambswool-scarf')],
    });
    const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });
    const result = storefront.catalog.related(ref('merino-crew-sweater'), 4);
    await settle();

    expect(calls.productListQueries).toEqual([
      {
        pageSize: 5,
        sort: ['-createdAt'],
        filter: ['status:eq:ACTIVE'],
        categoryId: 'cat-knitwear',
      },
    ]);
    expect(result.data.value?.map((item) => item.handle)).toEqual(['lambswool-scarf']);
  });

  it('related falls back to the newest active products when the product has no category', async () => {
    const calls = recordingClient([], {
      product: { id: 'p1', slug: 'merino-crew-sweater' },
      products: () => [listRow('lambswool-scarf')],
    });
    const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });
    const result = storefront.catalog.related(ref('merino-crew-sweater'), 4);
    await settle();

    expect(calls.productListQueries).toEqual([
      { pageSize: 5, sort: ['-createdAt'], filter: ['status:eq:ACTIVE'] },
    ]);
    expect(calls.productListQueries[0]).not.toHaveProperty('categoryId');
    expect(result.data.value?.map((item) => item.handle)).toEqual(['lambswool-scarf']);
  });

  it('related falls back again when the category has nothing else in it', async () => {
    const calls = recordingClient([], {
      product: { id: 'p1', slug: 'merino-crew-sweater', categoryId: 'cat-knitwear' },
      products: (query) =>
        query.categoryId === undefined
          ? [listRow('stoneware-mug')]
          : [listRow('merino-crew-sweater')],
    });
    const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });
    const result = storefront.catalog.related(ref('merino-crew-sweater'), 4);
    await settle();

    expect(calls.productListQueries.map((query) => query.categoryId)).toEqual([
      'cat-knitwear',
      undefined,
    ]);
    expect(result.data.value?.map((item) => item.handle)).toEqual(['stoneware-mug']);
  });

  it('collectionProducts sends a sort field the endpoint knows, and no facet filter at all', async () => {
    const calls = recordingClient();
    const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });
    const collection = ref<StorefrontCollectionSelector | null>({ slug: 'winter-knitwear' });
    const opts = ref({
      page: 1,
      pageSize: 24,
      sort: 'price-asc',
      filters: { category: ['knitwear'], price: ['20-80'] },
    });
    storefront.catalog.collectionProducts(collection, opts);
    await settle();

    expect(calls.collectionProductQueries).toEqual([{ page: 1, pageSize: 24, sort: ['minPrice'] }]);
    expect(calls.collectionProductQueries[0]).not.toHaveProperty('filter');
  });

  it('collectionProducts sends no sort for the collection’s own order, or one it cannot express', async () => {
    for (const sort of ['featured', 'best-selling']) {
      const calls = recordingClient();
      const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });
      const collection = ref<StorefrontCollectionSelector | null>({ slug: 'winter-knitwear' });
      storefront.catalog.collectionProducts(collection, ref({ page: 1, pageSize: 24, sort }));
      await settle();
      expect(calls.collectionProductQueries).toEqual([{ page: 1, pageSize: 24, sort: undefined }]);
    }
  });

  it('collectionProducts resolves nothing — never an error — for an id the gateway cannot match', async () => {
    // A gateway that ignores the filter token answers with some other
    // collection; matching the id back is what keeps that from loading the
    // wrong collection's products.
    const calls = recordingClient([
      { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', slug: 'something-else' },
    ]);
    const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });
    const collection = ref<StorefrontCollectionSelector | null>({
      id: '2f1b8d54-0d3a-4a6f-9a0b-7f6c1d2e3a01',
    });
    const opts = ref({ page: 1, pageSize: 24 });
    const result = storefront.catalog.collectionProducts(collection, opts);
    await settle();

    expect(calls.productSlugs).toEqual([]);
    expect(result.data.value).toBeNull();
    expect(result.error.value).toBeNull();
  });

  it('collectionProducts asks for a slug directly, with no collection lookup', async () => {
    const calls = recordingClient();
    const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });
    const collection = ref<StorefrontCollectionSelector | null>({ slug: 'winter-knitwear' });
    const opts = ref({ page: 1, pageSize: 24 });
    storefront.catalog.collectionProducts(collection, opts);
    await settle();

    expect(calls.collectionQueries).toEqual([]);
    expect(calls.productSlugs).toEqual(['winter-knitwear']);
  });
});
