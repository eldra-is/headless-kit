import { describe, expect, it } from 'vitest';
import type { EldraClient } from '@eldrajs/sdk';
import { createGatewayStorefront } from '../../app/storefront/gateway';
import type { StorefrontRoute } from '../../app/storefront/types';

/**
 * `createGatewayStorefront(...).cart` — the gateway-backed `CartOps` (`createGatewayCartOps` in
 * `gateway.ts`) — had no spec of its own: `cart.spec.ts` proves `createCartStore`'s engine against
 * a hand-written fake `CartOps`, and `gateway.spec.ts` covers catalog/search mapping only. That gap
 * is what let a store with no `checkoutUrl` configured fail every add: `client.checkout.handoffUrl`
 * throws "Missing checkout URL…" when neither the call nor the client options carry one (see
 * `packages/sdk/src/client.ts`), and `remember()` called it unconditionally after every successful
 * add — and synchronously at cart-ops creation, for a remembered cart id, too.
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

/** A fake in-memory `localStorage` so `createCartSession` (gateway.ts) has somewhere to read/write
 *  the remembered cart id without a real browser — `createCartSession` looks up `globalThis.
 *  localStorage` itself, so this is installed there rather than passed in. */
function fakeLocalStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
}

/** The real live cart shape (see the gateway's own `RawCart`/`RawCartItem`): one line, ISK. */
function liveCartResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    currency: 'ISK',
    expiresAt: '2026-10-08T00:00:00.000Z',
    id: '03302070-0000-4000-8000-000000000000',
    items: [
      {
        id: '2f51a73d-0000-4000-8000-000000000000',
        price: 28,
        productId: '43e660a0-0000-4000-8000-000000000000',
        quantity: 1,
        thumbnail: {
          altTextTranslations: { 'en-US': 'Ash glaze mug' },
          assetId: 'a1a1a1a1-0000-4000-8000-000000000000',
          url: 'https://example.com/ash-glaze-mug.jpg',
        },
        title: 'Ash glaze mug',
        variantId: '7646176b-0000-4000-8000-000000000000',
      },
    ],
    orgId: 'org-1',
    requiresShipping: true,
    totals: { discount: 0, subtotal: 28, taxAmount: 5, total: 28 },
    updatedAt: '2026-10-08T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

/** Mirrors `@eldrajs/sdk`'s own `handoffUrl`: throws when nothing supplies a checkout base URL. */
function fakeHandoffUrl(checkoutBaseUrl: string | undefined) {
  return ({ cartId, checkoutUrl }: { cartId: string; checkoutUrl?: string }) => {
    const resolved = checkoutUrl ?? checkoutBaseUrl;
    if (!resolved) {
      throw new Error(
        'Missing checkout URL. Pass checkoutUrl to createEldraClient() or to handoffUrl().'
      );
    }
    return `${resolved.replace(/\/$/, '')}/checkout/org-1/${cartId}`;
  };
}

function fakeClient(checkoutBaseUrl: string | undefined): EldraClient {
  return {
    cart: {
      addItem: async () => liveCartResponse(),
      get: async () => liveCartResponse(),
    },
    checkout: {
      handoffUrl: fakeHandoffUrl(checkoutBaseUrl),
    },
  } as unknown as EldraClient;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createGatewayStorefront().cart (gateway-backed CartOps)', () => {
  it('add() succeeds with no checkoutUrl configured: the line is stored and checkoutUrl stays null', async () => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage();
    const client = fakeClient(undefined);
    const { cart } = createGatewayStorefront(client, { route: fakeRoute() });
    await settle();

    const failure = await cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });

    expect(failure).toBeNull();
    expect(cart.lines.value).toHaveLength(1);
    expect(cart.lines.value[0]?.title).toBe('Ash glaze mug');
    expect(cart.checkoutUrl.value).toBeNull();
    expect(globalThis.localStorage.getItem('eldra.cartId')).toBe(
      '03302070-0000-4000-8000-000000000000'
    );
  });

  it('add() sets checkoutUrl when a checkout base URL is configured', async () => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage();
    const client = fakeClient('https://checkout.example.com');
    const { cart } = createGatewayStorefront(client, {
      route: fakeRoute(),
      checkoutUrl: 'https://checkout.example.com',
    });
    await settle();

    const failure = await cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });

    expect(failure).toBeNull();
    expect(cart.checkoutUrl.value).toBe(
      'https://checkout.example.com/checkout/org-1/03302070-0000-4000-8000-000000000000'
    );
  });

  it('init with a remembered cart id and no checkoutUrl does not throw', async () => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage({
      'eldra.cartId': '03302070-0000-4000-8000-000000000000',
    });
    const client = fakeClient(undefined);

    const { cart } = createGatewayStorefront(client, { route: fakeRoute() });
    await settle();

    expect(cart.lastFailure.value).toBeNull();
    expect(cart.checkoutUrl.value).toBeNull();
    expect(cart.lines.value).toHaveLength(1);
  });
});
