import { onServerPrefetch } from 'vue';
import { describe, expect, it } from 'vitest';
import type { EldraClient } from '@eldrajs/sdk';
import ProductDetail from '../blocks/product-detail/Block.vue';
import productDetailMock from '../blocks/product-detail/mock.json';
import {
  createGatewayStorefront,
  type StorefrontPrerenderHandle,
  type StorefrontRuntime,
} from '../app/storefront/gateway';
import { STOREFRONT_KEY, type StorefrontRoute } from '../app/storefront/types';
import { renderBlockToString } from './support/renderSsr';

/**
 * The prerender, end to end: the commerce block a `/products/<slug>` page is built around, server
 * rendered against the **gateway** storefront (not the demo catalogue every other block spec
 * uses), with the storefront runtime doing what the plugin's does on the server — start the read
 * under its key and make the render wait for it.
 *
 * That waiting is the whole change. Before it, `createGatewayResult`'s plain `watch(…, { immediate:
 * true })` was never awaited by anything, so `nuxi generate` wrote the *skeleton* into the HTML and
 * every product page flashed it before hydration refetched the same values. This asserts the
 * opposite from the outside: the price and the stock line are in the markup, and the loading state
 * is not — which is what a visitor sees on a cold, JavaScript-still-parsing first paint.
 *
 * A real `nuxi generate` cannot assert it: `test/starter.spec.ts`'s run has no gateway
 * credentials, so it prerenders `/` and the not-found shell, and no commerce block is rendered by
 * it at all. This is the same render path (`vue/server-renderer`, `onServerPrefetch`) one step
 * closer in.
 */

function fakeRoute(handle: string): StorefrontRoute {
  return {
    productHandle: handle,
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

/**
 * What `app/plugins/eldra-storefront.ts` hands the gateway on the server, minus Nuxt: start the
 * load, make the component's render wait for it (`useAsyncData` registers exactly this hook), and
 * keep the value under its key — the payload a prerendered page ships to the browser.
 */
function serverRuntime(payload: Record<string, unknown>): StorefrontRuntime {
  return {
    prerender<T>(key: string, load: () => Promise<T | null>): StorefrontPrerenderHandle<T> {
      const settled = load().then(
        (data) => {
          payload[key] = data;
          return { data, error: null };
        },
        (caught: unknown) => ({ data: null, error: (caught as Error).message })
      );
      onServerPrefetch(() => settled);
      return { hydrated: null, settled };
    },
  };
}

/** The gateway's own JSON for the product the page is about. */
function productResponse(): Record<string, unknown> {
  return {
    id: 'p-1',
    slug: 'merino-crew-sweater',
    title: 'Merino crew sweater',
    status: 'ACTIVE',
    variants: [{ id: 'v-1', sku: 'MCS-OAT-M', price: 96, status: 'ACTIVE' }],
    description: { text: 'Extra-fine Merino, knitted in Biella.' },
  };
}

function gatewayClient(): EldraClient {
  return {
    catalog: {
      getProduct: async () => productResponse(),
      listProducts: async () => ({
        data: [],
        meta: { page: 1, pageSize: 24, total: 0, totalPages: 0, rows: 0 },
      }),
    },
  } as unknown as EldraClient;
}

describe('a prerendered product page', () => {
  it('renders the price and the stock line into the HTML, and no loading state', async () => {
    const payload: Record<string, unknown> = {};
    const storefront = createGatewayStorefront(gatewayClient(), {
      route: fakeRoute('merino-crew-sweater'),
      runtime: serverRuntime(payload),
    });

    const html = await renderBlockToString(
      ProductDetail,
      { id: 'product-detail-1', data: { ...productDetailMock, productHandle: '' } },
      { [STOREFRONT_KEY]: storefront }
    );

    expect(html).toContain('Merino crew sweater');
    expect(html).toContain('$96.00');
    expect(html).toContain('In stock, ready to ship');
    // The state this whole change exists to remove from a prerendered page.
    expect(html).not.toContain('Loading…');
  });

  it('leaves the product in the page payload, keyed by the read that produced it', async () => {
    const payload: Record<string, unknown> = {};
    const storefront = createGatewayStorefront(gatewayClient(), {
      route: fakeRoute('merino-crew-sweater'),
      runtime: serverRuntime(payload),
    });

    await renderBlockToString(
      ProductDetail,
      { id: 'product-detail-1', data: { ...productDetailMock, productHandle: '' } },
      { [STOREFRONT_KEY]: storefront }
    );

    // The same key the hydrating browser reads back, so it paints this value instead of refetching
    // it (`test/storefront/gatewayPrerender.spec.ts` asserts that half).
    const product = payload['storefront:catalog.product:["merino-crew-sweater"]'] as {
      title: string;
      price: { amount: number };
    };
    expect(product.title).toBe('Merino crew sweater');
    expect(product.price.amount).toBe(96);
  });
});
