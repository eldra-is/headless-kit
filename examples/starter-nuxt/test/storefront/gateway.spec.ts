import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  createEldraClient,
  EldraHttpError,
  type EldraClient,
  type EldraHttpRequest,
} from '@eldrajs/sdk';
import { createGatewayStorefront } from '../../app/storefront/gateway';
import type {
  CatalogFacets,
  StorefrontCollectionSelector,
  StorefrontRoute,
} from '../../app/storefront/types';

/**
 * `createGatewayStorefront`'s own spec: the route it is handed is exactly the route a block reads
 * back (`storefront.route`, never a copy), `catalog.collectionProducts` maps the gateway's real
 * response shape, and the shopper's facets go out as the catalog list's own query parameters —
 * `minPrice`/`maxPrice`, `categoryId`, `availability`, `option`, `facets=true` (contract 3.7.0,
 * `packages/sdk/src/__tests__/fixtures/{web-gateway.json,contract.ts}`) — with the response's
 * `facets` read back as the view type the filter panel draws from.
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
  /** One entry per `GET /catalog/v1/categories` — the read a category slug becomes an id through. */
  categoryReads: number[];
}

/** A client whose collection list answers with `collections` — the by-id path's
 *  only source of a slug — and records every call, so a test can prove the
 *  products request was never made for an id nothing matched. */
function recordingClient(
  collections: Array<{ id: string; slug: string }> = [],
  options: {
    product?: Record<string, unknown>;
    products?: (query: Record<string, unknown>) => Array<Record<string, unknown>>;
    /** The store's whole category list, which is how a `category` slug becomes a `categoryId`. */
    categories?: Array<{ id: string; slug: string }>;
  } = {}
): ClientCalls {
  const productSlugs: string[] = [];
  const collectionQueries: Array<Record<string, unknown>> = [];
  const collectionProductQueries: Array<Record<string, unknown>> = [];
  const productListQueries: Array<Record<string, unknown>> = [];
  const categoryReads: number[] = [];
  const meta = { page: 1, pageSize: 24, total: 0, totalPages: 0, rows: 0 };
  const client = {
    catalog: {
      listCategories: async () => {
        categoryReads.push(categoryReads.length + 1);
        return (options.categories ?? []).map((row) => ({ ...row, title: row.slug }));
      },
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
    categoryReads,
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

/**
 * A store selling in krónur, which is the currency every assertion below that is not *about* the
 * minor-unit conversion is written in: ISK has no minor unit, so a price parameter and the facets'
 * own span read as the same number the shopper typed. `USD_COMMERCE` is the other half of that
 * pair, where a hundred-fold mistake is visible.
 */
const ISK_COMMERCE = { currency: 'ISK', taxInclusivePricing: true, defaultTaxRate: 0.24 };
const USD_COMMERCE = { currency: 'USD', taxInclusivePricing: false, defaultTaxRate: 0 };

function fakeClient(): EldraClient {
  return {
    catalog: {
      listCollectionProducts: async () => ({
        facets: {
          price: { min: 9600, max: 9600 },
          categories: [{ id: 'cat-1', slug: 'knitwear', title: 'Knitwear', count: 1 }],
          collections: [],
          availability: { in_stock: 1, out_of_stock: 0 },
          options: [
            {
              key: 'colour',
              name: 'Colour',
              values: [{ value: 'oat', label: 'Oat', count: 1, swatch: '#d8cbb0' }],
            },
          ],
        },
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

  it('collectionProducts maps the gateway response, facets and all', async () => {
    const storefront = createGatewayStorefront(fakeClient(), {
      route: fakeRoute(),
      commerce: ISK_COMMERCE,
    });
    const collection = ref<StorefrontCollectionSelector | null>({ slug: 'winter-knitwear' });
    const opts = ref({ page: 1, pageSize: 24 });
    const result = storefront.catalog.collectionProducts(collection, opts);
    await settle();

    expect(result.error.value).toBeNull();
    expect(result.data.value).toEqual({
      // The one source a collection's own product list cannot narrow by, declared rather than
      // dropped so the panel can stop offering it (`COLLECTION_SCOPE_UNFILTERABLE`).
      unfilterable: ['collection'],
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
      // The response's own `facets`, not a derivation: the terms carry the catalog ids a
      // `categoryId` filter needs, the option values keep their labels and swatches, and the price
      // span is the store's own (krónur here, so minor and major read alike — the conversion has
      // its own test).
      facets: {
        price: { min: 9600, max: 9600 },
        categories: [{ id: 'cat-1', slug: 'knitwear', title: 'Knitwear', count: 1 }],
        collections: [],
        availability: { in_stock: 1, out_of_stock: 0 },
        options: [
          {
            key: 'colour',
            name: 'Colour',
            values: [{ value: 'oat', label: 'Oat', count: 1, swatch: '#d8cbb0' }],
          },
        ],
      },
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
        listProducts: async () => ({ data: [], meta: {} }),
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

  /**
   * The search index is built over the platform's own documents, and a document with no public
   * route can only be named by its authoring URL — a `/cms/…` path. Those survive `safeHref` (they
   * are ordinary site paths), so without a rule of their own they reached the modal and the results
   * page as rows that take a shopper out of the shop and onto a path the site serves no file for.
   * Core only returns routable results now; this is the theme refusing to depend on that.
   */
  it('search drops a result whose destination is an authoring path', async () => {
    const client = {
      catalog: {
        listProducts: async () => ({ data: [], meta: {} }),
        search: async () => ({
          total: 6,
          results: [
            { id: 'p1', kind: 'PRODUCT', title: 'Routable product', targetUrl: '/products/good' },
            { id: 'p2', kind: 'PRODUCT', title: 'Authored product', targetUrl: '/cms/products/p2' },
            { id: 'e1', kind: 'CMS_ENTRY', title: 'Routable story', targetUrl: '/journal/good' },
            { id: 'e2', kind: 'CMS_ENTRY', title: 'Authored story', targetUrl: '/cms/entries/e2' },
            { id: 's1', kind: 'CMS_SCHEMA', title: 'Routable page', targetUrl: '/pages/good' },
            // The prefix itself, with nothing under it: a path the theme cannot route either.
            { id: 's2', kind: 'CMS_SCHEMA', title: 'Authoring root', targetUrl: '/cms' },
          ],
        }),
      },
    } as unknown as EldraClient;

    const storefront = createGatewayStorefront(client, { route: fakeRoute() });
    const result = storefront.search.run(ref('linen'));
    await settle();

    const response = result.data.value!;
    expect(response.products.map((product) => product.title)).toEqual(['Routable product']);
    expect(response.articles.map((article) => article.title)).toEqual(['Routable story']);
    expect(response.pages.map((page) => page.title)).toEqual(['Routable page']);
    const everyHref = [
      ...response.products.map((product) => product.url),
      ...response.articles.map((article) => article.href),
      ...response.pages.map((page) => page.href),
    ];
    expect(everyHref.some((href) => href.startsWith('/cms'))).toBe(false);
    // A path that merely *contains* the word is a real storefront route and must survive.
    expect(response.pages[0]!.href).toBe('/pages/good');
  });

  /**
   * A search result carries no money at all, so the mapping has nothing to write but
   * `{ amount: 0 }` — and a zero that reached a card rendered as the store's own zero amount, a
   * real price formatted in the store's currency and wrong. The products a search found are priced
   * from the catalogue by the same batched `id:in:` read the volatile refresh uses, before the
   * response is published.
   */
  it('search prices its products from a batched products-list read, in one request', async () => {
    const productListQueries: Array<Record<string, unknown>> = [];
    const client = {
      catalog: {
        listProducts: async (query: Record<string, unknown>) => {
          productListQueries.push(query);
          return {
            data: [
              {
                id: 'p1',
                slug: 'merino-crew-sweater',
                title: 'Merino crew sweater',
                status: 'ACTIVE',
                minPrice: 9600,
                maxPrice: 9600,
                compareAtPrice: 12000,
                totalVariants: 1,
                thumbnail: { assetId: 'a-1', url: 'https://cdn.example/merino.jpg' },
              },
              {
                id: 'p2',
                slug: 'linen-tea-towels-pair',
                title: 'Linen tea towels',
                status: 'ARCHIVED',
                minPrice: 2400,
                // A price *range*: `mapProductListItem` marks it `from: true` ("From $24.00").
                maxPrice: 3600,
                totalVariants: 3,
              },
            ],
            meta: {},
          };
        },
        search: async () => ({
          total: 2,
          results: [
            // Two ids per row on purpose: `id` is the index row, `sourceId` the catalog product.
            {
              id: 'row-1',
              sourceId: 'p1',
              kind: 'PRODUCT',
              title: 'Merino',
              targetUrl: '/products/a',
            },
            {
              id: 'row-2',
              sourceId: 'p2',
              kind: 'PRODUCT',
              title: 'Towels',
              targetUrl: '/products/b',
            },
          ],
        }),
      },
    } as unknown as EldraClient;

    const storefront = createGatewayStorefront(client, { route: fakeRoute() });
    const result = storefront.search.run(ref('linen'));
    await settle();

    const products = result.data.value!.products;
    // The whole snapshot, `from` included: on this path the merge is the product's *first* price,
    // not a refresh of one already on screen, so dropping the range marker would turn a
    // "From $24.00" product into an exact $24.00 one.
    expect(products.map((product) => product.price)).toEqual([
      { amount: 9600, compareAt: 12000, from: false },
      { amount: 2400, compareAt: null, from: true },
    ]);
    // Availability rides along, which is what lets the suggestion list rank sold-out items last.
    expect(products.map((product) => product.available)).toEqual([true, false]);
    expect(products.map((product) => product.stock)).toEqual(['in', 'out']);

    // And the thumbnail, which a search result carries no more of than it carries a price: without
    // it every product suggestion drew the "no image" placeholder beside its title.
    expect(products[0]!.featuredImage).toEqual({
      src: 'https://cdn.example/merino.jpg',
      alt: 'Merino crew sweater',
    });
    expect(products[1]!.featuredImage).toBeNull();

    // The title and the destination stay the index's: the title is what the query matched and what
    // the panel highlights, and the href is the already-sanitised `targetUrl`.
    expect(products.map((product) => [product.title, product.url])).toEqual([
      ['Merino', '/products/a'],
      ['Towels', '/products/b'],
    ]);

    // One request for both ids, through the one repeatable `id:in:` token — never a read per row.
    expect(productListQueries).toHaveLength(1);
    expect(productListQueries[0]!.filter).toEqual(['id:in:p1,p2']);
  });

  /**
   * The contract this read lives or dies by, and the one that shipped wrong: a search result carries
   * **two** ids, and only one of them is a catalog product.
   *
   * `id` names the search-index row; `sourceId` names the document the row is about. The enrichment
   * sent `id`, so every deployed search issued `products/list?filter=id:in:<index row id>`, got
   * `{"data":[],"total":0}` back, and rendered every suggestion and every search result card with no
   * price and no thumbnail — a request that looked perfectly healthy in the network panel. Asserted
   * on the filter token itself rather than on the rendered price, because that is the sentence that
   * has to be right and an empty price renders as nothing at all.
   */
  it('asks the catalogue by sourceId, never by the search row id', async () => {
    const productListQueries: Array<Record<string, unknown>> = [];
    const client = {
      catalog: {
        listProducts: async (query: Record<string, unknown>) => {
          productListQueries.push(query);
          return { data: [], meta: {} };
        },
        search: async () => ({
          total: 2,
          results: [
            {
              id: '784f3236-5419-4e0f-ba0f-9929a0a69e23',
              sourceId: '43e660a0-4d43-4af1-8a31-591d7aaa1253',
              kind: 'PRODUCT',
              title: 'Ash glaze mug',
              targetUrl: '/products/ash-glaze-mug',
            },
            // A row with no `sourceId` at all is asked about by nothing — never by its own id.
            { id: 'row-2', kind: 'PRODUCT', title: 'Orphan', targetUrl: '/products/orphan' },
          ],
        }),
      },
    } as unknown as EldraClient;

    const storefront = createGatewayStorefront(client, { route: fakeRoute() });
    const result = storefront.search.run(ref('mug'));
    await settle();

    expect(productListQueries).toHaveLength(1);
    expect(productListQueries[0]!.filter).toEqual(['id:in:43e660a0-4d43-4af1-8a31-591d7aaa1253']);
    // The row's own id is the row's key and nothing else; the catalogue has never heard of it.
    expect(JSON.stringify(productListQueries)).not.toContain(
      '784f3236-5419-4e0f-ba0f-9929a0a69e23'
    );
    expect(result.data.value!.products.map((product) => product.productId)).toEqual([
      '43e660a0-4d43-4af1-8a31-591d7aaa1253',
      '',
    ]);
  });

  /** A gateway refusal, in the shape `@eldrajs/sdk` raises it. */
  function httpError(status: number): EldraHttpError {
    return new EldraHttpError({ status, statusText: 'Service Unavailable' } as Response, null);
  }

  /** A search whose products the pricing read answers with `onPricing`. */
  function searchWithPricing(onPricing: () => Promise<unknown>): EldraClient {
    return {
      catalog: {
        listProducts: onPricing,
        search: async () => ({
          total: 1,
          results: [
            {
              id: 'row-1',
              sourceId: 'p1',
              kind: 'PRODUCT',
              title: 'Merino',
              targetUrl: '/products/a',
            },
          ],
        }),
      },
    } as unknown as EldraClient;
  }

  /**
   * A pricing read that cannot answer must not cost the shopper the results themselves — and must
   * not cost them a *wrong* price either. The product keeps its row with `price: null`, which the
   * suggestion panel renders without a price; a zero would have been formatted as the store's own
   * "$0.00", which is the defect this whole path exists to avoid.
   */
  it.each([
    ['the gateway refuses', () => Promise.reject(httpError(503))],
    ['the network never completes', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('search keeps its results, unpriced, when %s', async (_name, onPricing) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const storefront = createGatewayStorefront(searchWithPricing(onPricing), {
        route: fakeRoute(),
      });
      const result = storefront.search.run(ref('linen'));
      await settle();

      expect(result.error.value).toBeNull();
      const products = result.data.value!.products;
      expect(products.map((product) => product.title)).toEqual(['Merino']);
      expect(products.map((product) => product.price)).toEqual([null]);
      // Not a silent degradation: a page where every row lost its price has to be diagnosable.
      expect(warn).toHaveBeenCalledWith(
        '[eldra] search results could not be priced:',
        expect.any(String)
      );
    } finally {
      warn.mockRestore();
    }
  });

  /**
   * A found id the catalogue read simply did not return — a stale index, a product deleted since it
   * was written. `applyVolatileSnapshots` leaves an unmatched item exactly as it was, so the row has
   * to arrive unpriced rather than carrying a placeholder the consumers would format.
   */
  it('leaves a product the pricing read did not answer about unpriced', async () => {
    const client = {
      catalog: {
        listProducts: async () => ({ data: [], meta: {} }),
        search: async () => ({
          total: 1,
          results: [
            {
              id: 'row-1',
              sourceId: 'gone',
              kind: 'PRODUCT',
              title: 'Discontinued mug',
              targetUrl: '/products/a',
            },
          ],
        }),
      },
    } as unknown as EldraClient;

    const storefront = createGatewayStorefront(client, { route: fakeRoute() });
    const result = storefront.search.run(ref('mug'));
    await settle();

    expect(result.data.value!.products.map((product) => product.price)).toEqual([null]);
  });

  /**
   * The other half of the narrowed `catch`: a bug in this file must surface as an error rather than
   * as a page that quietly lost every price. `RangeError` stands in for one — it is neither an
   * `EldraHttpError`, an abort, nor the `TypeError` `fetch` rejects with.
   */
  it('does not swallow a programming error from the pricing read', async () => {
    const storefront = createGatewayStorefront(
      searchWithPricing(() => Promise.reject(new RangeError('filter grammar is wrong'))),
      { route: fakeRoute() }
    );
    const result = storefront.search.run(ref('linen'));
    await settle();

    expect(result.error.value).toBe('filter grammar is wrong');
    expect(result.data.value).toBeNull();
  });

  /** No products in the response: nothing to price, so nothing is asked for. */
  it('search makes no pricing request when it found no products', async () => {
    const productListQueries: Array<Record<string, unknown>> = [];
    const client = {
      catalog: {
        listProducts: async (query: Record<string, unknown>) => {
          productListQueries.push(query);
          return { data: [], meta: {} };
        },
        search: async () => ({
          total: 1,
          results: [{ id: 's1', kind: 'CMS_SCHEMA', title: 'Shipping', targetUrl: '/pages/x' }],
        }),
      },
    } as unknown as EldraClient;

    const storefront = createGatewayStorefront(client, { route: fakeRoute() });
    const result = storefront.search.run(ref('shipping'));
    await settle();

    expect(result.data.value!.pages).toHaveLength(1);
    expect(productListQueries).toEqual([]);
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
    // No `facets` on the answer — a gateway that cannot describe its scope — so none is invented:
    // the panel then draws the groups it can fill without values (`StorefrontCollectionProducts`).
    expect(result.data.value).toEqual({ items: [], total: 0, unfilterable: ['collection'] });
    expect(result.data.value).not.toHaveProperty('facets');
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

  it('collectionProducts sends a sort field the endpoint knows, never a filter token', async () => {
    const calls = recordingClient([], { categories: [{ id: 'cat-1', slug: 'knitwear' }] });
    const storefront = createGatewayStorefront(calls.client, {
      route: fakeRoute(),
      commerce: ISK_COMMERCE,
    });
    const collection = ref<StorefrontCollectionSelector | null>({ slug: 'winter-knitwear' });
    const opts = ref({
      page: 1,
      pageSize: 24,
      sort: 'price-asc',
      filters: { category: ['knitwear'], price: ['20-80'] },
    });
    storefront.catalog.collectionProducts(collection, opts);
    await settle();

    // The facets are their own parameters now; `filter` stays the `field:op:value` vocabulary and
    // carries none of them.
    expect(calls.collectionProductQueries).toEqual([
      {
        page: 1,
        pageSize: 24,
        sort: ['minPrice'],
        minPrice: 20,
        maxPrice: 80,
        categoryId: ['cat-1'],
        facets: true,
      },
    ]);
    expect(calls.collectionProductQueries[0]).not.toHaveProperty('filter');
  });

  it('collectionProducts sends no sort for the collection’s own order, or one it cannot express', async () => {
    for (const sort of ['featured', 'best-selling']) {
      const calls = recordingClient();
      const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });
      const collection = ref<StorefrontCollectionSelector | null>({ slug: 'winter-knitwear' });
      storefront.catalog.collectionProducts(collection, ref({ page: 1, pageSize: 24, sort }));
      await settle();
      expect(calls.collectionProductQueries).toEqual([
        { page: 1, pageSize: 24, sort: undefined, facets: true },
      ]);
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
   * **The shopper's facets, as the catalog list's own query parameters** (contract 3.7.0).
   *
   * Every one of them used to be dropped on the floor: the endpoint filtered on
   * `id`/`slug`/`status`/`createdAt` only, so `?price=50-150` reached the gateway as a plain paged
   * read, the $48 bowl stayed on screen, and the kit filtered a 200-product window client-side to
   * cover for it. These are the parameters that replaced all of that, asserted at the URL the SDK
   * actually sends rather than at the query object — `categoryId` and `option` are repeatable
   * (`explode: true`), and a comma-joined pair is one value the catalogue has never heard of.
   */
  describe('collectionProducts sends the shopper’s facets as query parameters', () => {
    const ORG = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const BASE = 'https://api.example.test/api';
    const CATEGORIES = [
      { id: 'cat-ceramics', slug: 'ceramics', title: 'Ceramics' },
      { id: 'cat-textiles', slug: 'textiles', title: 'Textiles' },
    ];

    /** A real `@eldrajs/sdk` client over a recorded transport, so the query string is the one a
     *  deployed site would send — repeatable parameters, encoding and all. */
    function httpRecorder(): { client: EldraClient; urls: string[] } {
      const urls: string[] = [];
      const client = createEldraClient({
        apiBaseUrl: BASE,
        orgId: ORG,
        httpClient: (async (request: EldraHttpRequest) => {
          urls.push(request.url);
          if (request.url.includes('/catalog/v1/categories')) return CATEGORIES;
          return { data: [], meta: { page: 1, pageSize: 24, total: 0, totalPages: 0, rows: 0 } };
        }) as never,
      });
      return { client, urls };
    }

    /** Long enough for the category lookup *and* the list read to have both resolved. */
    async function drain(): Promise<void> {
      for (let i = 0; i < 200; i += 1) await Promise.resolve();
    }

    async function urlsFor(
      filters: Record<string, string[]>,
      commerce = USD_COMMERCE
    ): Promise<string[]> {
      const { client, urls } = httpRecorder();
      const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce });
      storefront.catalog.collectionProducts(
        ref<StorefrontCollectionSelector | null>({ slug: 'the-winter-edit' }),
        ref({ page: 1, pageSize: 24, filters })
      );
      await drain();
      return urls;
    }

    /** The list read's query, by parameter — `getAll`, because three of them repeat. */
    async function paramsFor(
      filters: Record<string, string[]>,
      commerce = USD_COMMERCE
    ): Promise<URLSearchParams> {
      const urls = await urlsFor(filters, commerce);
      return new URL(urls.at(-1)!).searchParams;
    }

    it('sends every filter at once, in one request the gateway can answer', async () => {
      const urls = await urlsFor({
        price: ['50-150'],
        category: ['ceramics', 'textiles'],
        'option:colour': ['oat', 'clay'],
        'option:size': ['m'],
        availability: ['in_stock'],
      });

      // The category slugs are resolved first — the one read that buys every `categoryId` this
      // storefront will ever need — and then the collection's products, filtered.
      expect(urls).toEqual([
        `${BASE}/catalog/v1/categories`,
        `${BASE}/catalog/v1/collections/the-winter-edit/products` +
          '?page=1&pageSize=24&minPrice=5000&maxPrice=15000' +
          '&categoryId=cat-ceramics&categoryId=cat-textiles&availability=in_stock' +
          '&option=colour%3Aoat&option=colour%3Aclay&option=size%3Am&facets=true',
      ]);
    });

    /**
     * The URL carries whole major units, the parameters minor ones — the same units as the
     * `facets.price` span they are counted over. Reading the shopper's 50 as 50 cents is a
     * hundred-fold error on every two-decimal store, and skipping the conversion on a store with no
     * minor unit is the same error the other way.
     */
    it('converts the price range to the store currency’s minor units', async () => {
      const usd = await paramsFor({ price: ['50-150'] });
      expect(usd.get('minPrice')).toBe('5000');
      expect(usd.get('maxPrice')).toBe('15000');

      const isk = await paramsFor({ price: ['50-150'] }, ISK_COMMERCE);
      expect(isk.get('minPrice')).toBe('50');
      expect(isk.get('maxPrice')).toBe('150');
    });

    it('sends one bound when the shopper set one, and neither for a range that is not a number', async () => {
      const floor = await paramsFor({ price: ['50-'] });
      expect(floor.get('minPrice')).toBe('5000');
      expect(floor.has('maxPrice')).toBe(false);

      const ceiling = await paramsFor({ price: ['-150'] });
      expect(ceiling.has('minPrice')).toBe(false);
      expect(ceiling.get('maxPrice')).toBe('15000');

      const nonsense = await paramsFor({ price: ['cheap-ish'] });
      expect(nonsense.has('minPrice')).toBe(false);
      expect(nonsense.has('maxPrice')).toBe(false);
    });

    /**
     * Both boxes ticked is every product, so it is no filter at all: sending it would make the
     * platform spend a cross-service stock read to exclude nothing, and would turn a page that
     * cannot read stock into an error for no reason. One box is sent in the platform's own
     * spelling, which the retired hyphenated one folds into.
     */
    it('sends one availability value, never both, and never an unknown one', async () => {
      expect((await paramsFor({ availability: ['in_stock'] })).get('availability')).toBe(
        'in_stock'
      );
      expect((await paramsFor({ availability: ['out-of-stock'] })).get('availability')).toBe(
        'out_of_stock'
      );
      expect(
        (await paramsFor({ availability: ['in_stock', 'out_of_stock'] })).has('availability')
      ).toBe(false);
      expect((await paramsFor({ availability: ['backorder'] })).has('availability')).toBe(false);
    });

    /**
     * The lookup's answer belongs to every read, not to the one that asked first, so it is not tied
     * to a read's abort signal: a shopper ticking a second category while the first read is still in
     * flight aborts that read, and a lookup that aborted with it would reject in the hands of the
     * read that replaced it — an error over a page whose filter was perfectly answerable.
     */
    it('does not abort the category lookup with the read that started it', async () => {
      const calls = recordingClient([], { categories: CATEGORIES });
      let aborted = 0;
      const client = {
        catalog: {
          ...(calls.client as unknown as { catalog: Record<string, unknown> }).catalog,
          listCategories: async (_query: unknown, context?: { signal?: AbortSignal }) => {
            if (context?.signal !== undefined) aborted += 1;
            calls.categoryReads.push(calls.categoryReads.length + 1);
            return CATEGORIES.map((row) => ({ ...row, title: row.slug }));
          },
        },
      } as unknown as EldraClient;
      const storefront = createGatewayStorefront(client, { route: fakeRoute() });
      const opts = ref({ page: 1, pageSize: 24, filters: { category: ['ceramics'] } });
      const result = storefront.catalog.collectionProducts(
        ref<StorefrontCollectionSelector | null>({ slug: 'the-winter-edit' }),
        opts
      );
      // A second gesture before the first read has answered, which is what aborts the first.
      opts.value = { page: 1, pageSize: 24, filters: { category: ['textiles'] } };
      await settle();

      expect(aborted).toBe(0);
      expect(result.error.value).toBeNull();
      expect(calls.collectionProductQueries.at(-1)?.categoryId).toEqual(['cat-textiles']);
    });

    it('reads the store’s categories once, however many slugs are ticked', async () => {
      const calls = recordingClient([], { categories: CATEGORIES });
      const storefront = createGatewayStorefront(calls.client, {
        route: fakeRoute(),
        commerce: USD_COMMERCE,
      });
      const opts = ref({ page: 1, pageSize: 24, filters: { category: ['ceramics'] } });
      storefront.catalog.collectionProducts(
        ref<StorefrontCollectionSelector | null>({ slug: 'the-winter-edit' }),
        opts
      );
      await settle();
      opts.value = { page: 1, pageSize: 24, filters: { category: ['ceramics', 'textiles'] } };
      await settle();

      expect(calls.categoryReads).toHaveLength(1);
      expect(calls.collectionProductQueries.map((query) => query.categoryId)).toEqual([
        ['cat-ceramics'],
        ['cat-ceramics', 'cat-textiles'],
      ]);
    });

    it('never reads the categories for a request that filters on none', async () => {
      const calls = recordingClient([], { categories: CATEGORIES });
      const storefront = createGatewayStorefront(calls.client, { route: fakeRoute() });
      storefront.catalog.collectionProducts(
        ref<StorefrontCollectionSelector | null>({ slug: 'the-winter-edit' }),
        ref({ page: 1, pageSize: 24, filters: { 'option:colour': ['oat'] } })
      );
      await settle();

      expect(calls.categoryReads).toEqual([]);
      expect(calls.collectionProductQueries[0]).toEqual({
        page: 1,
        pageSize: 24,
        sort: undefined,
        option: ['colour:oat'],
        facets: true,
      });
    });

    /**
     * A slug this store has no category for — a stale shared link, a category since unpublished —
     * is left out rather than sent as something the catalogue would read as a different filter, and
     * a request left with nothing to filter on is the request an unfiltered page makes. That is the
     * storefront's standing "unknown, not unmatched" rule: a filter nothing can honour must not
     * empty a shopper's grid.
     */
    it('drops a category slug the store does not have', async () => {
      const mixed = await paramsFor({ category: ['ceramics', 'knitwear'] });
      expect(mixed.getAll('categoryId')).toEqual(['cat-ceramics']);

      const unknown = await paramsFor({ category: ['knitwear'] });
      expect(unknown.has('categoryId')).toBe(false);
      expect(unknown.get('facets')).toBe('true');
    });

    /**
     * There is no `collectionId` parameter on a collection's own product list: the scope already
     * *is* one collection, and the parameter is an OR, so a second id would widen the scope rather
     * than narrow it. The `collections` facet is still answered and still honest — it names the
     * other collections these products are in — but the platform does not read the intersection
     * yet, so nothing is sent for it (`docs/starter-kit.md`).
     */
    it('sends nothing for a collection filter, and says the scope cannot narrow by it', async () => {
      const params = await paramsFor({ collection: ['the-autumn-edit'], 'option:colour': ['oat'] });
      expect(params.has('collectionId')).toBe(false);
      expect(params.getAll('option')).toEqual(['colour:oat']);

      // Declared, not silently dropped: the panel hides the group rather than offering a filter
      // that moves the chips and the URL and leaves the grid as it was.
      const storefront = createGatewayStorefront(httpRecorder().client, { route: fakeRoute() });
      const result = storefront.catalog.collectionProducts(
        ref<StorefrontCollectionSelector | null>({ slug: 'the-winter-edit' }),
        ref({ page: 1, pageSize: 24 })
      );
      await drain();
      expect(result.data.value?.unfilterable).toEqual(['collection']);
    });

    it('asks for facets on an unfiltered read too, so the panel has groups to draw', async () => {
      const urls = await urlsFor({});
      expect(urls).toEqual([
        `${BASE}/catalog/v1/collections/the-winter-edit/products?page=1&pageSize=24&facets=true`,
      ]);
    });
  });

  /**
   * The response's `facets` object as the view type the panel reads (`CatalogFacets`).
   *
   * One conversion and one omission carry it: the platform counts its price span in the same minor
   * units as the parameters it is filtered by, while every money field in `types.ts` is major; and
   * an absent `availability` means stock could not be read at all, which is not two zeroes.
   */
  describe('collectionProducts reads the response’s facets', () => {
    const FACETS = {
      price: { min: 2400, max: 16400 },
      categories: [{ id: 'cat-1', slug: 'ceramics', title: 'Ceramics', count: 12 }],
      collections: [{ id: 'col-1', slug: 'the-winter-edit', title: 'The winter edit', count: 48 }],
      availability: { in_stock: 44, out_of_stock: 4 },
      options: [
        {
          key: 'colour',
          name: 'Colour',
          values: [
            { value: 'oat', label: 'Oat', count: 9, swatch: '#d8cbb0' },
            { value: 'clay', label: 'Clay', count: 0 },
          ],
        },
      ],
    };

    function clientWithFacets(facets: unknown): EldraClient {
      return {
        catalog: {
          listCollectionProducts: async () => ({
            data: [],
            meta: { page: 1, pageSize: 24, total: 0, totalPages: 0, rows: 0 },
            ...(facets === undefined ? {} : { facets }),
          }),
        },
      } as unknown as EldraClient;
    }

    async function facetsFor(
      facets: unknown,
      commerce = USD_COMMERCE
    ): Promise<CatalogFacets | undefined> {
      const storefront = createGatewayStorefront(clientWithFacets(facets), {
        route: fakeRoute(),
        commerce,
      });
      const result = storefront.catalog.collectionProducts(
        ref<StorefrontCollectionSelector | null>({ slug: 'the-winter-edit' }),
        ref({ page: 1, pageSize: 24 })
      );
      await settle();
      expect(result.error.value).toBeNull();
      return result.data.value?.facets;
    }

    it('converts the price span to major units and passes the counts through', async () => {
      expect(await facetsFor(FACETS)).toEqual({
        // $24–$164, from the platform's own 2400–16400 minor units.
        price: { min: 24, max: 164 },
        categories: [{ id: 'cat-1', slug: 'ceramics', title: 'Ceramics', count: 12 }],
        collections: [
          { id: 'col-1', slug: 'the-winter-edit', title: 'The winter edit', count: 48 },
        ],
        availability: { in_stock: 44, out_of_stock: 4 },
        options: [
          {
            key: 'colour',
            name: 'Colour',
            values: [
              { value: 'oat', label: 'Oat', count: 9, swatch: '#d8cbb0' },
              { value: 'clay', label: 'Clay', count: 0 },
            ],
          },
        ],
      });

      // The same span on a store with no minor unit is the same number, not a hundredth of it.
      expect((await facetsFor(FACETS, ISK_COMMERCE))?.price).toEqual({ min: 2400, max: 16400 });
    });

    it('leaves availability out when the platform could not read stock', async () => {
      const { availability: _omitted, ...noStock } = FACETS;
      const facets = await facetsFor(noStock);

      expect(facets).not.toHaveProperty('availability');
      expect(facets?.availability).toBeUndefined();
      // Every other family still arrives: only the one the platform could not count is missing.
      expect(facets?.categories).toHaveLength(1);
      expect(facets?.options[0]?.values).toHaveLength(2);
    });

    it('answers no facets at all for a gateway that sent none', async () => {
      expect(await facetsFor(undefined)).toBeUndefined();
      expect(await facetsFor(null)).toBeUndefined();
    });

    /**
     * The live shape when the scope minus the price filter holds nothing: the platform omits `price`
     * entirely (its own contract note says to read an absent key as absent, never as a zero), and so
     * does this mapping — a 0–0 span is a dead track labelled in the store's currency, and writing
     * one would also wipe the panel's "widest span seen for this collection" fallback, which exists
     * for exactly this answer.
     */
    it('leaves the price span out when the platform could not span the scope', async () => {
      const facets = await facetsFor({ availability: { in_stock: 0, out_of_stock: 0 } });

      expect(facets).not.toHaveProperty('price');
      expect(facets?.price).toBeUndefined();
      expect(facets?.availability).toEqual({ in_stock: 0, out_of_stock: 0 });
      // The arrays the platform also omits read as empty, which is what its contract says to do.
      expect(facets?.categories).toEqual([]);
      expect(facets?.collections).toEqual([]);
      expect(facets?.options).toEqual([]);
    });

    it('falls back to the stable key or slug for a field the response leaves out', async () => {
      const facets = await facetsFor({
        price: {},
        categories: [{ slug: 'ceramics', count: 2 }],
        options: [{ key: 'size', values: [{ value: 'm' }] }],
      });

      expect(facets?.price).toEqual({ min: 0, max: 0 });
      expect(facets?.categories).toEqual([
        { id: 'ceramics', slug: 'ceramics', title: 'ceramics', count: 2 },
      ]);
      expect(facets?.collections).toEqual([]);
      expect(facets?.options).toEqual([
        { key: 'size', name: 'size', values: [{ value: 'm', label: 'm', count: 0 }] },
      ]);
    });
  });

  /**
   * **A filtered read that fails keeps the page the shopper is looking at.**
   *
   * The platform refuses an `availability` filter it cannot answer rather than quietly dropping it —
   * an unfiltered page would read to a shopper like a shop with nothing out of stock — so this is
   * the one filter that can turn a working grid into an error. The grid's own answer is already the
   * right one: the error is reported and the last good page stays on screen
   * (`blocks/collection-grid` draws the toast, never an empty grid).
   */
  it('reports a failed filtered read and keeps the last good page', async () => {
    let reads = 0;
    const client = {
      catalog: {
        listCollectionProducts: async () => {
          reads += 1;
          if (reads > 1) {
            throw new EldraHttpError(
              { status: 503, statusText: 'Service Unavailable' } as Response,
              { detail: 'inventory is unreachable' }
            );
          }
          return {
            data: [
              {
                id: 'p1',
                slug: 'ash-glaze-mug',
                title: 'Ash glaze mug',
                status: 'ACTIVE',
                minPrice: 42,
                maxPrice: 42,
                totalVariants: 1,
              },
            ],
            meta: { page: 1, pageSize: 24, total: 1, totalPages: 1, rows: 1 },
          };
        },
      },
    } as unknown as EldraClient;
    const storefront = createGatewayStorefront(client, {
      route: fakeRoute(),
      commerce: ISK_COMMERCE,
    });
    const opts = ref<{
      page: number;
      pageSize: number;
      filters?: Record<string, string[]>;
    }>({ page: 1, pageSize: 24 });
    const result = storefront.catalog.collectionProducts(
      ref<StorefrontCollectionSelector | null>({ slug: 'the-winter-edit' }),
      opts
    );
    await settle();
    expect(result.data.value?.items.map((item) => item.handle)).toEqual(['ash-glaze-mug']);

    opts.value = { page: 1, pageSize: 24, filters: { availability: ['in_stock'] } };
    await settle();

    expect(result.error.value).toBe('Web Studio request failed with 503 Service Unavailable');
    expect(result.data.value?.items.map((item) => item.handle)).toEqual(['ash-glaze-mug']);
    expect(result.pending.value).toBe(false);
  });

  /** The category lookup is part of the filtered read, so its failure is the read's failure — not a
   *  request that silently drops the category the chips say is applied. */
  it('reports a failed category lookup rather than dropping the filter', async () => {
    const client = {
      catalog: {
        listCategories: async () => {
          throw new Error('categories are unreachable');
        },
        listCollectionProducts: async () => ({
          data: [],
          meta: { page: 1, pageSize: 24, total: 0, totalPages: 0, rows: 0 },
        }),
      },
    } as unknown as EldraClient;
    const storefront = createGatewayStorefront(client, { route: fakeRoute() });
    const result = storefront.catalog.collectionProducts(
      ref<StorefrontCollectionSelector | null>({ slug: 'the-winter-edit' }),
      ref({ page: 1, pageSize: 24, filters: { category: ['ceramics'] } })
    );
    await settle();

    expect(result.error.value).toBe('categories are unreachable');
    expect(result.data.value).toBeNull();
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
   * The product page's stock comes from inventory, not from the variant's publication status. A
   * published variant with nothing on the shelf used to read "In stock, ready to ship" next to an
   * Add to cart the cart service then refused for stock — the page and the cart disagreeing about
   * the same product.
   */
  describe('the product page reads stock from inventory', () => {
    function productClient(
      availability: unknown,
      options: { variants?: Array<Record<string, unknown>> } = {}
    ): { client: EldraClient; requests: unknown[] } {
      const requests: unknown[] = [];
      const client = {
        catalog: {
          getProduct: async () => ({
            id: 'prod-merino',
            slug: 'merino-crew-sweater',
            title: 'Merino crew sweater',
            status: 'ACTIVE',
            options: [
              {
                key: 'size',
                name: 'Size',
                values: [
                  { id: 'ov-m', key: 'm', name: 'M' },
                  { id: 'ov-l', key: 'l', name: 'L' },
                ],
              },
            ],
            variants: options.variants ?? [
              {
                id: 'var-m',
                status: 'ACTIVE',
                price: 96,
                optionValues: [{ id: 'x', name: 'M', optionId: 'size', optionValueId: 'ov-m' }],
              },
              {
                id: 'var-l',
                status: 'ACTIVE',
                price: 96,
                optionValues: [{ id: 'y', name: 'L', optionId: 'size', optionValueId: 'ov-l' }],
              },
            ],
          }),
        },
        inventory: {
          availability: async (items: unknown) => {
            requests.push(items);
            if (availability instanceof Error) throw availability;
            return availability;
          },
        },
      } as unknown as EldraClient;
      return { client, requests };
    }

    async function read(client: EldraClient) {
      const storefront = createGatewayStorefront(client, { route: fakeRoute() });
      const result = storefront.catalog.product(ref('merino-crew-sweater'));
      await settle();
      return result.data.value;
    }

    it('asks about every variant at once, with no location id', async () => {
      const { client, requests } = productClient({
        items: [
          { variantId: 'var-m', available: true, allowBackorder: false, availableQuantity: 4 },
          { variantId: 'var-l', available: true, allowBackorder: false, availableQuantity: 9 },
        ],
      });
      await read(client);
      // One bulk call, and no `locationId`: an item without one resolves the org's default location.
      expect(requests).toEqual([[{ variantId: 'var-m' }, { variantId: 'var-l' }]]);
    });

    it('keeps the first in-stock variant as the one to buy', async () => {
      const { client } = productClient({
        items: [
          { variantId: 'var-m', available: true, allowBackorder: false, availableQuantity: 2 },
          { variantId: 'var-l', available: true, allowBackorder: false, availableQuantity: 9 },
        ],
      });
      const product = await read(client);
      expect(product?.stock).toBe('in');
      expect(product?.variantId).toBe('var-m');
    });

    /**
     * `inventory` is the count of the variant the buy box is *selling*, and the mapping can only
     * speak for the one it chose — not for whichever the shopper picks in the picker. So a product
     * with options reports no count rather than labelling M's two units "only 2 left in L"; a product
     * with one thing to buy reports it, which is where the low-stock line comes from.
     */
    it('reports a unit count only when there is one variant it can belong to', async () => {
      const withOptions = productClient({
        items: [
          { variantId: 'var-m', available: true, allowBackorder: false, availableQuantity: 2 },
          { variantId: 'var-l', available: true, allowBackorder: false, availableQuantity: 9 },
        ],
      });
      expect((await read(withOptions.client))?.inventory).toBeNull();

      const single = productClient(
        {
          items: [
            { variantId: 'var-only', available: true, allowBackorder: false, availableQuantity: 2 },
          ],
        },
        { variants: [{ id: 'var-only', status: 'ACTIVE', price: 96 }] }
      );
      const product = await read(single.client);
      expect(product?.inventory).toBe(2);
      expect(product?.variantId).toBe('var-only');
      expect(product?.stock).toBe('in');
    });

    it('reads sold out for a published variant with nothing on the shelf', async () => {
      const { client } = productClient({
        items: [
          { variantId: 'var-m', available: false, allowBackorder: false, availableQuantity: 0 },
          { variantId: 'var-l', available: false, allowBackorder: false, availableQuantity: 0 },
        ],
      });
      const product = await read(client);
      expect(product?.stock).toBe('out');
      // Both option values are unbuyable, so the pickers say so too (spec: struck through, ", sold
      // out" in the accessible name) instead of offering a choice that cannot be fulfilled.
      expect(product?.options[0]?.values.map((value) => value.available)).toEqual([false, false]);
    });

    it('opens on the first variant that can be bought, not the first published one', async () => {
      const { client } = productClient({
        items: [
          { variantId: 'var-m', available: false, allowBackorder: false, availableQuantity: 0 },
          { variantId: 'var-l', available: true, allowBackorder: false, availableQuantity: 5 },
        ],
      });
      const product = await read(client);
      expect(product?.variantId).toBe('var-l');
      expect(product?.stock).toBe('in');
      expect(product?.options[0]?.values.map((value) => value.available)).toEqual([false, true]);
    });

    it('reads back-order for a variant that is out but takes orders anyway', async () => {
      const { client } = productClient({
        items: [
          { variantId: 'var-m', available: false, allowBackorder: true, availableQuantity: 0 },
          { variantId: 'var-l', available: false, allowBackorder: true, availableQuantity: 0 },
        ],
      });
      const product = await read(client);
      expect(product?.stock).toBe('preorder');
    });

    /**
     * Fail-soft, three ways: the read threw, the read answered about nothing, and the read answered
     * about other variants. Each keeps the page exactly as it was before inventory was consulted —
     * a store that has not set stock up, or a service that is down, must not read sold out.
     */
    it('keeps the status-derived stock when inventory cannot answer', async () => {
      for (const answer of [
        new Error('inventory unavailable'),
        { items: [] },
        { items: null },
        {
          items: [
            {
              variantId: 'var-other',
              available: false,
              allowBackorder: false,
              availableQuantity: 0,
            },
          ],
        },
      ]) {
        const { client } = productClient(answer);
        const product = await read(client);
        expect(product?.stock).toBe('in');
        expect(product?.inventory).toBeNull();
        expect(product?.variantId).toBe('var-m');
        expect(product?.options[0]?.values.map((value) => value.available)).toEqual([true, true]);
      }
    });

    it('reads sold out for a product whose variants are all unpublished, inventory or not', async () => {
      const { client } = productClient(new Error('down'), {
        variants: [{ id: 'var-m', status: 'DRAFT', price: 96 }],
      });
      const product = await read(client);
      expect(product?.stock).toBe('out');
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
      checkout: { url: async () => 'https://checkout.example/cart-1' },
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

  /**
   * **Every merchant-written answer is read in the page's own language.** A page served under a
   * locale prefix renders its CMS content in that locale; if the catalog, search and order reads
   * did not carry it too, a visitor on `/is-IS/products/x` would read Icelandic page copy around a
   * product whose own title, description and option names were the default language's. The rule is
   * applied by wrapping the client once (`withContentLocale`), not per call site, so a read added
   * later cannot forget it — which is exactly what this asserts: a *handful* of reads driven here,
   * and `locale` on all of them.
   */
  it('sends the active content locale on every catalog, search and order read', async () => {
    const queries: Array<{ what: string; query: Record<string, unknown> | undefined }> = [];
    const record =
      (what: string) =>
      async (...args: unknown[]) => {
        queries.push({ what, query: args.at(-2) as Record<string, unknown> | undefined });
        return { data: [], meta: { page: 1, pageSize: 24, total: 0, totalPages: 0, rows: 0 } };
      };
    const client = {
      catalog: {
        getProduct: async (_slug: string, query?: Record<string, unknown>) => {
          queries.push({ what: 'getProduct', query });
          return { id: 'p1', slug: 'merino-crew-sweater', variants: [] };
        },
        getCollection: async (_slug: string, query?: Record<string, unknown>) => {
          queries.push({ what: 'getCollection', query });
          return { id: 'c1', slug: 'winter-knitwear', title: 'Winter', productCount: 0 };
        },
        listCollectionProducts: record('listCollectionProducts'),
        listProducts: record('listProducts'),
        search: async (_q: string, query?: Record<string, unknown>) => {
          queries.push({ what: 'search', query });
          return { query: 'mug', total: 0, results: [] };
        },
      },
      orders: {
        get: async (_token: string, query?: Record<string, unknown>) => {
          queries.push({ what: 'orders.get', query });
          return { id: 'o1', orderNumber: 1, status: 'PAID', items: [], totals: {} };
        },
      },
      inventory: {
        availability: async () => ({ items: [] }),
      },
    } as unknown as EldraClient;

    const storefront = createGatewayStorefront(client, {
      route: fakeRoute(),
      locale: () => 'is-IS',
    });
    storefront.catalog.product(ref('merino-crew-sweater'));
    storefront.catalog.collection(ref('winter-knitwear'));
    storefront.catalog.collectionProducts(
      ref<StorefrontCollectionSelector | null>({ slug: 'winter-knitwear' }),
      ref({ page: 1, pageSize: 24 })
    );
    storefront.catalog.byHandles(ref(['merino-crew-sweater']));
    storefront.search.run(ref('mug'));
    storefront.orders.current(ref('token-1'));
    await settle();

    expect(queries.length).toBeGreaterThanOrEqual(6);
    for (const { what, query } of queries) {
      expect(query?.locale, `${what} sent ${JSON.stringify(query)}`).toBe('is-IS');
    }
  });

  it('sends no locale at all on a single-locale store, exactly as it always did', async () => {
    // The overwhelming majority of stores, and every story and mapping spec. An empty `?locale=`
    // is a locale the gateway answers with 400, so "no locale" has to mean no key.
    const { client, collectionProductQueries } = recordingClient();
    const storefront = createGatewayStorefront(client, { route: fakeRoute() });
    storefront.catalog.collectionProducts(
      ref<StorefrontCollectionSelector | null>({ slug: 'winter-knitwear' }),
      ref({ page: 1, pageSize: 24 })
    );
    await settle();

    expect(collectionProductQueries.length).toBeGreaterThan(0);
    for (const query of collectionProductQueries) expect(query).not.toHaveProperty('locale');
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
