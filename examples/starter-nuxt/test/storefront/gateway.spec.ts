import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import type { EldraClient } from '@eldrajs/sdk';
import { createGatewayStorefront } from '../../app/storefront/gateway';
import type { StorefrontRoute } from '../../app/storefront/types';

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

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createGatewayStorefront', () => {
  it('hands back the caller-provided route unchanged — the same object a block reads', () => {
    const route = fakeRoute();
    const storefront = createGatewayStorefront(fakeClient(), { route });
    expect(storefront.route).toBe(route);
  });

  it('collectionProducts maps the gateway response and documents the missing facets field as []', async () => {
    const storefront = createGatewayStorefront(fakeClient(), { route: fakeRoute() });
    const handle = ref<string | null>('winter-knitwear');
    const opts = ref({ page: 1, pageSize: 24 });
    const result = storefront.catalog.collectionProducts(handle, opts);
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

  it('collectionProducts resolves null for no collection handle, without calling the client', async () => {
    const storefront = createGatewayStorefront(fakeClient(), { route: fakeRoute() });
    const handle = ref<string | null>(null);
    const opts = ref({ page: 1, pageSize: 24 });
    const result = storefront.catalog.collectionProducts(handle, opts);
    await settle();
    expect(result.data.value).toBeNull();
    expect(result.error.value).toBeNull();
  });
});
