import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { createEldraClient, type EldraClient, type EldraHttpRequest } from '@eldrajs/sdk';
import { createGatewayStorefront } from '../../app/storefront/gateway';
import type { StorefrontCollectionSelector, StorefrontRoute } from '../../app/storefront/types';

/**
 * `createGatewayStorefront`'s own spec: the route it is handed is exactly the route a block reads
 * back (`storefront.route`, never a copy), `catalog.collectionProducts` maps the gateway's real
 * response shape, and — since the endpoint filters on `id`/`slug`/`status`/`createdAt` only, with
 * no facets/aggregations field on the response (checked against
 * `packages/sdk/src/__tests__/fixtures/{web-gateway.json,contract.ts}`) — it applies the shopper's
 * facets itself, over the results it fetched (`app/storefront/facets.ts`).
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

  it('collectionProducts maps the gateway response, with no facet the rows can answer', async () => {
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
   * Every token below is `[groupIndex:]field:op:value` — the shape the SDK's
   * contract fixture documents — against a field the deployed gateway filters
   * on (the fixture documents the shape only, not the field or operator set).
   * The two the theme used to send (`slug:a,b` and `relatedTo:<handle>`) were
   * neither, and the gateway answered 400.
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

  /**
   * The tests above assert the query object the theme builds; this one asserts
   * the URL the SDK turns it into, because that is where the tokens were being
   * lost: `filter` is the gateway's one repeatable parameter, and a
   * comma-joined `filter=a,b` ran two tokens into one that the gateway then
   * read as a single, malformed filter.
   */
  it('reaches the gateway as one filter parameter per token', async () => {
    const urls: string[] = [];
    const client = createEldraClient({
      apiBaseUrl: 'https://api.example.test/api',
      orgId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      httpClient: (async (request: EldraHttpRequest) => {
        urls.push(request.url);
        return { data: [], meta: { page: 1, pageSize: 24, total: 0, totalPages: 0, rows: 0 } };
      }) as never,
    });
    const storefront = createGatewayStorefront(client, { route: fakeRoute() });
    storefront.catalog.byHandles(ref(['merino-crew-sweater', 'stoneware-mug']));
    await settle();

    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]!).searchParams.getAll('filter')).toEqual([
      'slug:in:merino-crew-sweater,stoneware-mug',
      'status:eq:ACTIVE',
    ]);
    expect(urls[0]!.match(/filter=/g)).toHaveLength(2);
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
  /**
   * `volatileByIds` — the batched read the prerender/refresh contract is built on
   * (`app/storefront/volatile.ts`, `types.ts`'s `StorefrontResult` doc comment). It is asserted at
   * the URL the SDK actually sends, not just the query object, for the same reason `byHandles` is:
   * `filter` is the gateway's one repeatable parameter, and a comma-joined pair of tokens is a
   * single malformed filter rather than two.
   */
  it('volatileByIds asks for one chunk per 50 ids, one `id:in:` token each', async () => {
    const urls: string[] = [];
    const client = createEldraClient({
      apiBaseUrl: 'https://api.example.test/api',
      orgId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      httpClient: (async (request: EldraHttpRequest) => {
        urls.push(request.url);
        return { data: [], meta: { page: 1, pageSize: 50, total: 0, totalPages: 0, rows: 0 } };
      }) as never,
    });
    const storefront = createGatewayStorefront(client, { route: fakeRoute() });
    const ids = Array.from({ length: 51 }, (_unused, index) => `id-${index + 1}`);
    await storefront.catalog.volatileByIds(ids);

    expect(urls).toHaveLength(2);
    const filters = urls.map((url) => new URL(url).searchParams.getAll('filter'));
    expect(filters[0]).toEqual([`id:in:${ids.slice(0, 50).join(',')}`]);
    expect(filters[1]).toEqual(['id:in:id-51']);
    // One `filter=` per chunk, and nothing else narrowing the read.
    for (const url of urls) expect(url.match(/filter=/g)).toHaveLength(1);
  });

  /**
   * Availability is one of the values being refreshed, so the read must *not* filter the
   * catalogue down to what is buyable: a product that has just gone inactive has to come back
   * saying so, not vanish from the answer the way a product the request could not see would.
   */
  it('volatileByIds does not filter by status, and maps price/availability like a card', async () => {
    const calls = recordingClient([], {
      products: () => [
        {
          ...listRow('merino-crew-sweater'),
          id: 'p-1',
          minPrice: 79,
          maxPrice: 96,
          compareAtPrice: 128,
        },
        { ...listRow('lambswool-scarf'), id: 'p-2', status: 'DRAFT' },
      ],
    });
    const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });
    const snapshots = await storefront.catalog.volatileByIds(['p-1', 'p-2']);

    expect(calls.productListQueries).toEqual([{ pageSize: 2, filter: ['id:in:p-1,p-2'] }]);
    expect(snapshots).toEqual([
      {
        id: 'p-1',
        price: { amount: 79, compareAt: 128, from: true },
        available: true,
        stock: 'in',
      },
      {
        id: 'p-2',
        price: { amount: 1000, compareAt: null, from: false },
        available: false,
        stock: 'out',
      },
    ]);
    // No `inventory` key at all: the products list carries none, and absent means "unknown".
    for (const snapshot of snapshots) expect('inventory' in snapshot).toBe(false);
  });

  it('volatileByIds makes no request for an empty page, or for ids the token grammar cannot carry', async () => {
    const calls = recordingClient();
    const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });

    expect(await storefront.catalog.volatileByIds([])).toEqual([]);
    expect(calls.productListQueries).toEqual([]);

    // Every id unusable: asking without the token would read the whole catalogue.
    expect(await storefront.catalog.volatileByIds(['a,b', 'x:y'])).toEqual([]);
    expect(calls.productListQueries).toEqual([]);
  });

  /**
   * The facet pass over the gateway's own results (`app/storefront/facets.ts`).
   *
   * The endpoint filters on `id`/`slug`/`status`/`createdAt` only, so every facet the block sends
   * used to be dropped on the floor: `?minPrice=50&maxPrice=150` reached the gateway as a plain
   * paged read and the $48 bowl stayed on screen, under a URL, chips and an active-filter row that
   * all claimed otherwise. The same pass the demo runs now runs over the fetched page.
   */
  describe('collectionProducts applies the shopper’s facets client-side', () => {
    /** A collection of `prices.length` products, `$<price>` each, paged the way the gateway pages. */
    function pagedClient(prices: number[]): {
      client: EldraClient;
      queries: Array<{ page: number; pageSize: number }>;
    } {
      const queries: Array<{ page: number; pageSize: number }> = [];
      const client = {
        catalog: {
          listCollectionProducts: async (_slug: string, query: Record<string, unknown>) => {
            const page = (query.page as number | undefined) ?? 1;
            const pageSize = (query.pageSize as number | undefined) ?? 24;
            queries.push({ page, pageSize });
            const start = (page - 1) * pageSize;
            const rows = prices.slice(start, start + pageSize).map((price, index) => ({
              id: `p${start + index}`,
              slug: `p${start + index}`,
              title: `Product ${start + index}`,
              status: 'ACTIVE',
              minPrice: price,
              maxPrice: price,
              totalVariants: 1,
            }));
            return {
              data: rows,
              meta: {
                page,
                pageSize,
                total: prices.length,
                totalPages: Math.ceil(prices.length / pageSize),
                rows: rows.length,
                hasNext: start + rows.length < prices.length,
                hasPrev: page > 1,
              },
            };
          },
        },
      } as unknown as EldraClient;
      return { client, queries };
    }

    /** Long enough for the filtered path's sequential page reads to have all resolved. */
    async function drain(): Promise<void> {
      for (let i = 0; i < 400; i += 1) await Promise.resolve();
    }

    async function load(
      client: EldraClient,
      opts: { page: number; pageSize: number; sort?: string; filters?: Record<string, string[]> }
    ) {
      const storefront = createGatewayStorefront(client, { route: fakeRoute() });
      const result = storefront.catalog.collectionProducts(
        ref<StorefrontCollectionSelector | null>({ slug: 'the-winter-edit' }),
        ref(opts)
      );
      await drain();
      expect(result.error.value).toBeNull();
      return result.data.value!;
    }

    it('drops the $48 product a 50–150 range excludes and keeps the $50 one, with a filtered total', async () => {
      const { client, queries } = pagedClient([48, 50, 150, 151]);
      const data = await load(client, { page: 1, pageSize: 24, filters: { price: ['50-150'] } });

      expect(data.items.map((item) => item.price.amount)).toEqual([50, 150]);
      expect(data.total).toBe(2);
      // One page held the whole collection, so nothing more was asked for.
      expect(queries).toEqual([{ page: 1, pageSize: 24 }]);
    });

    it('reads past page one when the first page is full and a filter is set', async () => {
      // 30 products: 24 on page one (four of them under the floor), 6 on page two (two under it).
      const prices = Array.from({ length: 30 }, (_, i) => (i % 6 === 0 ? 10 : 100));
      const { client, queries } = pagedClient(prices);
      const data = await load(client, { page: 1, pageSize: 24, filters: { price: ['50-'] } });

      expect(queries).toEqual([
        { page: 1, pageSize: 24 },
        { page: 2, pageSize: 24 },
      ]);
      // 25 of the 30 are $100 — the count a shopper sees, and more than one gateway page holds.
      expect(data.total).toBe(25);
      expect(data.items).toHaveLength(24);
      expect(data.items.every((item) => item.price.amount === 100)).toBe(true);
    });

    it('pages the filtered set itself, so page two is the filtered items 25 and up', async () => {
      const prices = Array.from({ length: 30 }, (_, i) => (i % 6 === 0 ? 10 : 100));
      const { client } = pagedClient(prices);
      const data = await load(client, { page: 2, pageSize: 24, filters: { price: ['50-'] } });

      expect(data.total).toBe(25);
      expect(data.items.map((item) => item.handle)).toEqual(['p29']);
    });

    it('stops at the documented 200-item scan cap rather than walking a whole catalogue', async () => {
      const { client, queries } = pagedClient(Array.from({ length: 1000 }, () => 100));
      const data = await load(client, { page: 1, pageSize: 24, filters: { price: ['50-'] } });

      // ceil(200 / 24) reads, and not one more.
      expect(queries).toHaveLength(9);
      expect(queries.at(-1)).toEqual({ page: 9, pageSize: 24 });
      expect(data.total).toBe(200);
      expect(data.items).toHaveLength(24);
    });

    it('leaves the unfiltered read exactly as it was: one page, the gateway’s own total', async () => {
      const { client, queries } = pagedClient(Array.from({ length: 1000 }, () => 100));
      const data = await load(client, { page: 1, pageSize: 24 });

      expect(queries).toEqual([{ page: 1, pageSize: 24 }]);
      expect(data.items).toHaveLength(24);
      expect(data.total).toBe(1000);
    });

    it('treats an empty filter bag as no filter at all', async () => {
      const { client, queries } = pagedClient(Array.from({ length: 100 }, () => 100));
      const data = await load(client, { page: 1, pageSize: 24, filters: { colour: [] } });

      expect(queries).toEqual([{ page: 1, pageSize: 24 }]);
      expect(data.total).toBe(100);
    });

    /**
     * A facet the product list cannot answer (`category`, `option:*` carry no attributes on a list
     * row) must not empty the grid — `facets.ts`'s "unknown, not unmatched" rule, seen from here.
     */
    it('shows the collection unfiltered for a facet the gateway’s rows cannot answer', async () => {
      const { client } = pagedClient([48, 50, 150]);
      const data = await load(client, {
        page: 1,
        pageSize: 24,
        filters: { 'option:size': ['m'], category: ['ceramics'] },
      });

      expect(data.items).toHaveLength(3);
      expect(data.total).toBe(3);
    });

    it('keeps the sort the gateway applied across the pages it scanned', async () => {
      const prices = Array.from({ length: 30 }, (_, i) => 10 + i);
      const { client, queries } = pagedClient(prices);
      const data = await load(client, {
        page: 1,
        pageSize: 24,
        sort: 'price-asc',
        filters: { price: ['20-'] },
      });

      expect(queries).toHaveLength(2);
      // $10–$39 across two gateway pages; the floor keeps $20 and up, still ascending.
      expect(data.items.map((item) => item.price.amount)).toEqual(
        Array.from({ length: 20 }, (_, i) => 20 + i)
      );
    });
  });

  /**
   * The add payload. `productId` and `variantId` are two different ids, and the gateway's cart
   * service resolves them as a pair (one lookup of "this variant, of this product"): a pair that
   * does not exist answers 500, which is what sending the variant id as both did. The detail
   * mapping is the other half of the same fact — `productId` from the product, `variantId` from its
   * first buyable variant — so this asserts both, together, since either alone would pass while the
   * add stayed broken.
   */
  it('cart.add sends the product id and the variant id as the two different ids they are', async () => {
    const addItemInputs: Array<Record<string, unknown>> = [];
    const client = {
      catalog: {
        getProduct: async () => ({
          id: 'prod-merino',
          slug: 'merino-crew-sweater',
          title: 'Merino crew sweater',
          status: 'ACTIVE',
          variants: [{ id: 'var-oat-m', status: 'ACTIVE', price: 96 }],
        }),
      },
      cart: {
        addItem: async (input: Record<string, unknown>) => {
          addItemInputs.push(input);
          return {
            id: 'cart-1',
            currency: 'USD',
            items: [
              {
                id: 'line-1',
                productId: 'prod-merino',
                variantId: 'var-oat-m',
                title: 'Merino crew sweater',
                price: 96,
                quantity: 2,
              },
            ],
            totals: { subtotal: 192, discount: 0, taxAmount: 0, total: 192 },
          };
        },
      },
      checkout: { handoffUrl: () => 'https://checkout.example/cart-1' },
    } as unknown as EldraClient;

    const storefront = createGatewayStorefront(client, { route: fakeRoute() });
    const result = storefront.catalog.product(ref('merino-crew-sweater'));
    await settle();

    const product = result.data.value;
    expect(product?.productId).toBe('prod-merino');
    expect(product?.variantId).toBe('var-oat-m');

    await storefront.cart.add({
      productId: product!.productId,
      variantId: product!.variantId,
      quantity: 2,
    });

    expect(addItemInputs).toEqual([
      { cartId: undefined, productId: 'prod-merino', variantId: 'var-oat-m', quantity: 2 },
    ]);
    // And the line that comes back carries both halves, so Undo can re-add exactly this pair.
    expect(storefront.cart.lines.value).toEqual([
      expect.objectContaining({ productId: 'prod-merino', variantId: 'var-oat-m' }),
    ]);
  });

  it('every result carries an empty `revalidating` set — the prerender contract’s resting state', async () => {
    const storefront = createGatewayStorefront(fakeClient(), { route: fakeRoute() });
    const result = storefront.catalog.collectionProducts(
      ref<StorefrontCollectionSelector | null>({ slug: 'winter-knitwear' }),
      ref({ page: 1, pageSize: 24 })
    );
    await settle();
    expect(result.revalidating.value.size).toBe(0);
  });
});
