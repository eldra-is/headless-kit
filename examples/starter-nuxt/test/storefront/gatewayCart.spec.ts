import { describe, expect, it, vi } from 'vitest';
import type { EldraClient } from '@eldrajs/sdk';
import { createGatewayStorefront } from '../../app/storefront/gateway';
import type { StorefrontRoute } from '../../app/storefront/types';

/**
 * `createGatewayStorefront(...).cart` — the gateway-backed `CartOps` (`createGatewayCartOps` in
 * `gateway.ts`) — had no spec of its own: `cart.spec.ts` proves `createCartStore`'s engine against
 * a hand-written fake `CartOps`, and `gateway.spec.ts` covers catalog/search mapping only. That gap
 * is what let the checkout hand-off fail every add, back when the theme had to carry a checkout
 * base URL and `remember()` built the URL synchronously from it.
 *
 * The hand-off is the platform's now: `client.checkout.url({ cartId })` reads where checkout lives
 * from the platform's own config and so resolves *after* the mutation it followed. Two things have
 * to hold, and neither is visible in a synchronous assertion: Check out appears once that resolves
 * (after an add, and after a cart restored from a remembered id), and a platform that publishes no
 * checkout — or a read that fails — costs the cart nothing but the button.
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

/**
 * Mirrors `@eldrajs/sdk`'s own `checkout.url`: asynchronous, because the base URL comes from the
 * platform's config, and rejecting — with the SDK's own message — when the platform published none.
 * `'unreachable'` stands for the read itself failing, which the SDK reports the same way.
 */
function fakeCheckoutUrl(platform: string | null | 'unreachable') {
  return async ({ cartId }: { cartId: string }) => {
    if (platform === 'unreachable') throw new Error('gateway unreachable');
    if (platform === null) {
      throw new Error('The platform did not publish a checkout URL (GET /platform/v1/config).');
    }
    return `${platform.replace(/\/$/, '')}/checkout/org-1/${cartId}`;
  };
}

function fakeClient(platform: string | null | 'unreachable'): EldraClient {
  return {
    cart: {
      addItem: async () => liveCartResponse(),
      get: async () => liveCartResponse(),
    },
    checkout: {
      url: fakeCheckoutUrl(platform),
    },
  } as unknown as EldraClient;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createGatewayStorefront().cart (gateway-backed CartOps)', () => {
  it('add() sets checkoutUrl from the platform once the read resolves', async () => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage();
    const client = fakeClient('https://checkout.eldra.app');
    const { cart } = createGatewayStorefront(client, { route: fakeRoute() });
    await settle();

    const failure = await cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });

    expect(failure).toBeNull();
    expect(cart.lines.value).toHaveLength(1);
    expect(cart.lines.value[0]?.title).toBe('Ash glaze mug');
    expect(globalThis.localStorage.getItem('eldra.cartId')).toBe(
      '03302070-0000-4000-8000-000000000000'
    );
    await vi.waitFor(() =>
      expect(cart.checkoutUrl.value).toBe(
        'https://checkout.eldra.app/checkout/org-1/03302070-0000-4000-8000-000000000000'
      )
    );
  });

  it('sets checkoutUrl for a cart restored from a remembered id', async () => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage({
      'eldra.cartId': '03302070-0000-4000-8000-000000000000',
    });
    const client = fakeClient('https://checkout.eldra.app');

    const { cart } = createGatewayStorefront(client, { route: fakeRoute() });
    await settle();

    expect(cart.lastFailure.value).toBeNull();
    expect(cart.lines.value).toHaveLength(1);
    await vi.waitFor(() =>
      expect(cart.checkoutUrl.value).toBe(
        'https://checkout.eldra.app/checkout/org-1/03302070-0000-4000-8000-000000000000'
      )
    );
  });

  it('add() succeeds and checkoutUrl stays null when the platform publishes no checkout', async () => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage();
    const client = fakeClient(null);
    const { cart } = createGatewayStorefront(client, { route: fakeRoute() });
    await settle();

    const failure = await cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    await settle();
    await settle();

    expect(failure).toBeNull();
    expect(cart.lines.value).toHaveLength(1);
    expect(cart.lastFailure.value).toBeNull();
    expect(cart.checkoutUrl.value).toBeNull();
  });

  it('a failed platform read costs the cart nothing but the Check out button', async () => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage({
      'eldra.cartId': '03302070-0000-4000-8000-000000000000',
    });
    const client = fakeClient('unreachable');

    const { cart } = createGatewayStorefront(client, { route: fakeRoute() });
    await settle();
    await settle();

    expect(cart.lastFailure.value).toBeNull();
    expect(cart.error.value).toBeNull();
    expect(cart.lines.value).toHaveLength(1);
    expect(cart.checkoutUrl.value).toBeNull();

    const failure = await cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    await settle();
    await settle();

    expect(failure).toBeNull();
    expect(cart.lines.value).toHaveLength(1);
    expect(cart.checkoutUrl.value).toBeNull();
  });
});
