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
}

/** A client whose collection list answers with `collections` — the by-id path's
 *  only source of a slug — and records every call, so a test can prove the
 *  products request was never made for an id nothing matched. */
function recordingClient(collections: Array<{ id: string; slug: string }> = []): ClientCalls {
  const productSlugs: string[] = [];
  const collectionQueries: Array<Record<string, unknown>> = [];
  const client = {
    catalog: {
      listCollections: async (query: Record<string, unknown>) => {
        collectionQueries.push(query);
        return {
          data: collections.map((item) => ({ ...item, title: item.slug, productCount: 0 })),
        };
      },
      listCollectionProducts: async (slug: string) => {
        productSlugs.push(slug);
        return { data: [], meta: { page: 1, pageSize: 24, total: 0, totalPages: 0, rows: 0 } };
      },
    },
  } as unknown as EldraClient;
  return { client, productSlugs, collectionQueries };
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
