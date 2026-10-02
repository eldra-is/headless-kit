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
 * What the platform answers, as the cart ops see it through `@eldrajs/sdk`:
 *
 * - a base URL — the hand-off, built the way the SDK builds it;
 * - `null` — the platform published no checkout, with the SDK's own message for that;
 * - `'unreachable'` — the config read itself failed, which the SDK reports as a *different* message
 *   carrying the read failure as `cause`, because the two have nothing in common to fix;
 * - `'throws'` — a client whose `checkout.url` throws synchronously rather than rejecting. The real
 *   SDK's is `async`, but a hand-written stand-in (every fake in these specs, and a customer's own
 *   `CartOps`) can be the other shape, and it must not fail the add that triggered it.
 */
type FakePlatform = string | null | 'unreachable' | 'throws';

interface FakeCheckoutClient {
  client: EldraClient;
  /** Each cart id `checkout.url` was asked about, in order — one ask per cart is the contract. */
  asked: string[];
  /** Lets a held answer through; only meaningful for a client made with `{ hold: true }`. */
  release: () => void;
}

/**
 * `{ hold: true }` keeps every answer pending until `release()`, which is the only way to see what
 * happens while a resolve is still in flight — two adds for the same cart before the first answer
 * lands, for instance.
 */
function fakeClient(platform: FakePlatform, options: { hold?: boolean } = {}): FakeCheckoutClient {
  const asked: string[] = [];
  let open: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    open = resolve;
  });
  const answer = (cartId: string): Promise<string> => {
    if (platform === 'unreachable') {
      return Promise.reject(
        new Error(
          'Could not read the platform checkout URL (GET /platform/v1/config): gateway unreachable',
          { cause: new Error('gateway unreachable') }
        )
      );
    }
    if (platform === null) {
      return Promise.reject(
        new Error('The platform did not publish a checkout URL (GET /platform/v1/config).')
      );
    }
    return Promise.resolve(`${platform.replace(/\/+$/, '')}/checkout/org-1/${cartId}`);
  };
  const url = ({ cartId }: { cartId: string }): Promise<string> => {
    asked.push(cartId);
    if (platform === 'throws') throw new Error('this client builds no URLs');
    return options.hold === true ? held.then(() => answer(cartId)) : answer(cartId);
  };
  return {
    asked,
    release: () => open?.(),
    client: {
      cart: {
        addItem: async () => liveCartResponse(),
        get: async () => liveCartResponse(),
      },
      checkout: { url },
    } as unknown as EldraClient,
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createGatewayStorefront().cart (gateway-backed CartOps)', () => {
  it('add() sets checkoutUrl from the platform once the read resolves', async () => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage();
    const { client } = fakeClient('https://checkout.eldra.app');
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
    const { client } = fakeClient('https://checkout.eldra.app');

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
    const { client } = fakeClient(null);
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

  it('asks the platform once per cart, even for adds that land before the answer does', async () => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage();
    const { client, asked, release } = fakeClient('https://checkout.eldra.app', { hold: true });
    const { cart } = createGatewayStorefront(client, { route: fakeRoute() });
    await settle();

    // Both adds succeed while the first ask is still in flight — the second must not fire another.
    await cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    await cart.add({ productId: 'p2', variantId: 'v2', quantity: 1 });
    await settle();

    expect(asked).toEqual(['03302070-0000-4000-8000-000000000000']);
    release();
    await vi.waitFor(() =>
      expect(cart.checkoutUrl.value).toBe(
        'https://checkout.eldra.app/checkout/org-1/03302070-0000-4000-8000-000000000000'
      )
    );
  });

  it('survives a client whose checkout.url throws synchronously', async () => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage();
    const { client, asked } = fakeClient('throws');
    const { cart } = createGatewayStorefront(client, { route: fakeRoute() });
    await settle();

    const failure = await cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    await settle();

    expect(failure).toBeNull();
    expect(cart.lines.value).toHaveLength(1);
    expect(cart.lastFailure.value).toBeNull();
    expect(cart.checkoutUrl.value).toBeNull();
    expect(asked).toHaveLength(1);
  });

  it('a failed platform read costs the cart nothing but the Check out button', async () => {
    (globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage({
      'eldra.cartId': '03302070-0000-4000-8000-000000000000',
    });
    const { client } = fakeClient('unreachable');

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
