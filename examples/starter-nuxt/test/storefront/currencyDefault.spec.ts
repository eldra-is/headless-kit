import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref, watch } from 'vue';
import { EldraHttpError, type EldraClient } from '@eldrajs/sdk';
import { toStorefrontCommerce } from '../../app/storefront/commerce';
import { failureMessageKey } from '../../app/storefront/feedback';
import { createGatewayStorefront } from '../../app/storefront/gateway';
import type { StorefrontCommerce, StorefrontRoute } from '../../app/storefront/types';

const PREFERENCE_KEY = 'eldra.currency';
const CART_KEY = 'eldra.cartId';

const ISK_OFF: StorefrontCommerce = {
  currency: 'ISK',
  taxInclusivePricing: true,
  defaultTaxRate: 0.24,
  currencies: ['EUR', 'USD'],
  defaultCurrency: 'EUR',
};
const EUR_ONLY: StorefrontCommerce = {
  currency: 'ISK',
  taxInclusivePricing: true,
  defaultTaxRate: 0.24,
  defaultCurrency: 'EUR',
};

function route(): StorefrontRoute {
  return {
    productHandle: null,
    collectionHandle: null,
    categorySlug: null,
    categoryPath: null,
    orderToken: null,
    query: null,
    page: 1,
    sort: null,
    columns: null,
    filters: {},
    setQuery: () => {},
  };
}

function installStorage(initial: Record<string, string> = {}): Map<string, string> {
  const data = new Map(Object.entries(initial));
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  } as Storage;
  return data;
}

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

function cartAnswer(currency: string): Record<string, unknown> {
  return {
    id: 'cart-1',
    currency,
    items: [
      {
        id: 'line-1',
        productId: 'p1',
        variantId: 'v1',
        title: 'Mug',
        price: currency === 'ISK' ? 2900 : 19.9,
        quantity: 1,
        soldInCurrency: true,
      },
    ],
    totals: { subtotal: 0, discount: 0, taxAmount: 0, total: 0 },
  };
}

function notSold(): EldraHttpError {
  return new EldraHttpError(new Response('{}', { status: 400, statusText: 'Bad Request' }), {
    errorId: 'CART_CURRENCY_NOT_SOLD',
  });
}

function shopClient(cart: Record<string, unknown> | null = null) {
  const productOptions: unknown[] = [];
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let current = cart;
  const client = {
    catalog: {
      getProduct: async (_handle: string, options: Record<string, unknown> | undefined) => {
        productOptions.push(options);
        return {
          id: 'p1',
          slug: 'mug',
          title: 'Mug',
          status: 'ACTIVE',
          options: [],
          categoryIds: [],
          mediaLinks: [],
          variants: [
            {
              id: 'v1',
              sku: 'M',
              price: 19.9,
              currency: options?.currency ?? 'ISK',
              soldInCurrency: true,
              status: 'ACTIVE',
            },
          ],
        };
      },
      listCategories: async () => [],
    },
    inventory: { availability: async () => [] },
    cart: {
      get: async () => current,
      addItem: async (input: Record<string, unknown>) => {
        calls.push({ method: 'addItem', args: [input] });
        if (input.currency === 'ISK') throw notSold();
        current = cartAnswer((input.currency as string | undefined) ?? 'ISK');
        return current;
      },
      setCurrency: async (cartId: string, currency: string) => {
        calls.push({ method: 'setCurrency', args: [cartId, currency] });
        if (currency === 'ISK') throw notSold();
        current = cartAnswer(currency);
        return current;
      },
    },
    checkout: { url: async () => 'https://checkout.example/x' },
  } as unknown as EldraClient;
  return { client, productOptions, calls };
}

describe('a store with its own currency turned off', () => {
  it('builds pages in the default currency: every read names it, before and after start', async () => {
    installStorage();
    const { client, productOptions } = shopClient();
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    expect(storefront.currency.active.value).toBe('EUR');
    const product = storefront.catalog.product(ref('mug'));
    await vi.waitFor(() => expect(product.data.value).not.toBeNull());
    expect(productOptions[0]).toEqual({ currency: 'EUR' });
    expect(product.data.value?.price.currency).toBe('EUR');

    await storefront.currency.start(async () => null);
    expect(storefront.currency.active.value).toBe('EUR');
    expect(storefront.currency.requested.value).toBe('EUR');
  });

  it('never offers the store currency in the picker', () => {
    installStorage();
    const { client } = shopClient();
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    expect(storefront.currency.offered.value).toEqual(['EUR', 'USD']);
    expect(storefront.currency.defaultCurrency).toBe('EUR');
    expect(storefront.currency.base).toBe('ISK');
  });

  it('starts an Icelandic visitor, whose country currency is not offered, in the default', async () => {
    installStorage();
    const { client } = shopClient();
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    await storefront.currency.start(async () => 'IS');
    expect(storefront.currency.active.value).toBe('EUR');
  });

  it('drops a saved ISK preference and says where prices are now', async () => {
    const data = installStorage({ [PREFERENCE_KEY]: 'ISK' });
    const { client } = shopClient();
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    await storefront.currency.start(async () => null);
    expect(data.has(PREFERENCE_KEY)).toBe(false);
    expect(storefront.currency.active.value).toBe('EUR');
    expect(storefront.currency.movedTo.value).toBe('EUR');
  });

  it('drops a saved ISK preference in a store offering one currency, with no notice', async () => {
    const data = installStorage({ [PREFERENCE_KEY]: 'ISK' });
    const { client } = shopClient();
    const storefront = createGatewayStorefront(client, { route: route(), commerce: EUR_ONLY });
    expect(storefront.currency.offered.value).toEqual(['EUR']);
    await storefront.currency.start(async () => null);
    expect(data.has(PREFERENCE_KEY)).toBe(false);
    expect(storefront.currency.active.value).toBe('EUR');
    expect(storefront.currency.movedTo.value).toBeNull();
  });

  it('leaves a saved choice alone in a store selling in its own currency only, as before', async () => {
    const data = installStorage({ [PREFERENCE_KEY]: 'EUR' });
    const { client } = shopClient();
    const storefront = createGatewayStorefront(client, {
      route: route(),
      commerce: { currency: 'ISK', taxInclusivePricing: true, defaultTaxRate: 0.24 },
    });
    await storefront.currency.start(async () => null);
    expect(data.get(PREFERENCE_KEY)).toBe('EUR');
    expect(storefront.currency.active.value).toBe('ISK');
  });

  it('creates a new cart in the default currency', async () => {
    installStorage();
    const { client, calls } = shopClient();
    const storefront = createGatewayStorefront(client, { route: route(), commerce: EUR_ONLY });
    await storefront.currency.start(async () => null);
    await storefront.cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    expect(calls[0]?.args[0]).toMatchObject({ currency: 'EUR' });
    expect(storefront.cart.currency.value).toBe('EUR');
  });

  it('moves a cart from before ISK was turned off to the default currency', async () => {
    installStorage({ [CART_KEY]: 'cart-1' });
    const { client, calls } = shopClient(cartAnswer('ISK'));
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('ISK'));
    await storefront.currency.start(async () => null);
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('EUR'));
    expect(calls).toEqual([{ method: 'setCurrency', args: ['cart-1', 'EUR'] }]);
    expect(storefront.currency.active.value).toBe('EUR');
    expect(storefront.currency.movedTo.value).toBe('EUR');
  });

  it('says prices are in the default only once, after moving a cart left in ISK', async () => {
    installStorage({ [CART_KEY]: 'cart-1', [PREFERENCE_KEY]: 'ISK' });
    const { client } = shopClient(cartAnswer('ISK'));
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('ISK'));
    const notices: Array<string | null> = [];
    watch(storefront.currency.movedTo, (code) => notices.push(code), { flush: 'sync' });
    await storefront.currency.start(async () => null);
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('EUR'));
    expect(notices).toEqual(['EUR']);
  });

  it('never withdraws the default when a move to it is refused', async () => {
    installStorage({ [CART_KEY]: 'cart-1' });
    const { client } = shopClient(cartAnswer('USD'));
    client.cart.setCurrency = (async () => {
      throw notSold();
    }) as typeof client.cart.setCurrency;
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('USD'));
    await storefront.currency.start(async () => null);
    storefront.currency.chooseBase();
    await vi.waitFor(() => expect(storefront.currency.failure.value).not.toBeNull());
    expect(storefront.currency.offered.value).toEqual(['EUR', 'USD']);
  });

  it('withdraws ISK when the store refuses a move to it', async () => {
    installStorage({ [CART_KEY]: 'cart-1' });
    const { client } = shopClient(cartAnswer('EUR'));
    const storefront = createGatewayStorefront(client, {
      route: route(),
      commerce: { ...ISK_OFF, currencies: ['EUR', 'ISK'] },
    });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('EUR'));
    await storefront.currency.start(async () => null);
    storefront.currency.choose('ISK');
    await vi.waitFor(() => expect(storefront.currency.offered.value).toEqual(['EUR']));
    expect(storefront.currency.active.value).toBe('EUR');
  });
});

describe('toStorefrontCommerce', () => {
  it('keeps the default currency the build wrote', () => {
    expect(toStorefrontCommerce({ ...EUR_ONLY })).toEqual(EUR_ONLY);
  });
});

describe('a business customer, whose cart the store keeps in ISK', () => {
  function iskOnly(): EldraHttpError {
    return new EldraHttpError(new Response('{}', { status: 409, statusText: 'Conflict' }), {
      errorId: 'CART_CURRENCY_CUSTOMER_ISK_ONLY',
    });
  }

  function businessClient(cart: Record<string, unknown> | null) {
    const built = shopClient(cart);
    let current = cart;
    built.client.cart.get = (async () => current) as typeof built.client.cart.get;
    built.client.cart.addItem = (async (input: Record<string, unknown>) => {
      built.calls.push({ method: 'addItem', args: [input] });
      const into = (input.currency as string | undefined) ?? (current?.currency as string) ?? 'ISK';
      if (into !== 'ISK') throw iskOnly();
      current = cartAnswer('ISK');
      return current;
    }) as typeof built.client.cart.addItem;
    built.client.cart.setCurrency = (async (cartId: string, currency: string) => {
      built.calls.push({ method: 'setCurrency', args: [cartId, currency] });
      if (currency !== 'ISK') throw iskOnly();
      current = cartAnswer('ISK');
      return current;
    }) as typeof built.client.cart.setCurrency;
    return built;
  }

  it('keeps their ISK cart after one refused move, quietly, with no picker', async () => {
    installStorage({ [CART_KEY]: 'cart-1' });
    const { client, calls } = businessClient(cartAnswer('ISK'));
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('ISK'));
    await storefront.currency.start(async () => null);
    await vi.waitFor(() => expect(storefront.currency.ownCurrencyOnly.value).toBe(true));

    expect(storefront.currency.active.value).toBe('ISK');
    expect(storefront.currency.requested.value).toBeUndefined();
    expect(storefront.currency.offered.value).toEqual(['ISK']);
    expect(storefront.currency.failure.value).toBeNull();
    expect(storefront.currency.movedTo.value).toBeNull();

    await storefront.cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    expect(calls.filter((call) => call.method === 'setCurrency')).toHaveLength(1);
    expect(storefront.cart.currency.value).toBe('ISK');
  });

  it('creates their cart in ISK when the default is refused for them', async () => {
    installStorage();
    const { client, calls } = businessClient(null);
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    await storefront.currency.start(async () => null);

    const failure = await storefront.cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });

    expect(failure).toBeNull();
    expect(calls.map((call) => (call.args[0] as { currency?: string }).currency)).toEqual([
      'EUR',
      undefined,
    ]);
    expect(storefront.cart.currency.value).toBe('ISK');
    expect(storefront.currency.offered.value).toEqual(['ISK']);
  });

  it('moves a signed-in business customer’s cart to ISK when the theme says so', async () => {
    installStorage({ [CART_KEY]: 'cart-1' });
    const { client, calls } = businessClient(cartAnswer('EUR'));
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('EUR'));
    await storefront.currency.start(async () => null);
    storefront.currency.keepOwnCurrency();
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('ISK'));

    expect(calls).toEqual([{ method: 'setCurrency', args: ['cart-1', 'ISK'] }]);
    expect(storefront.currency.active.value).toBe('ISK');
    expect(storefront.currency.offered.value).toEqual(['ISK']);
  });

  it('says why when they pick a currency the store keeps from them', async () => {
    installStorage({ [CART_KEY]: 'cart-1' });
    const { client } = businessClient(cartAnswer('ISK'));
    const storefront = createGatewayStorefront(client, {
      route: route(),
      commerce: { ...ISK_OFF, currencies: ['ISK', 'EUR'], defaultCurrency: 'ISK' },
    });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('ISK'));
    await storefront.currency.start(async () => null);
    storefront.currency.choose('EUR');
    await vi.waitFor(() => expect(storefront.currency.failure.value).not.toBeNull());
    expect(failureMessageKey(storefront.currency.failure.value)).toBe(
      'storefront.businessOwnCurrency'
    );
    expect(storefront.currency.offered.value).toEqual(['ISK']);
    expect(storefront.cart.currency.value).toBe('ISK');
  });

  it('moves their cart to ISK when a pick of theirs is refused, and keeps ISK', async () => {
    installStorage({ [CART_KEY]: 'cart-1' });
    const { client } = businessClient(cartAnswer('EUR'));
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('EUR'));
    await storefront.currency.start(async () => null);
    storefront.currency.choose('USD');
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('ISK'));
    expect(storefront.currency.offered.value).toEqual(['ISK']);
    expect(storefront.currency.active.value).toBe('ISK');
  });

  it('moves their cart to ISK and adds again when an add to it is refused', async () => {
    installStorage({ [CART_KEY]: 'cart-1' });
    const { client, calls } = businessClient(cartAnswer('EUR'));
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('EUR'));
    await storefront.currency.start(async () => null);
    const failure = await storefront.cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    expect(failure).toBeNull();
    expect(calls.map((call) => call.method)).toEqual(['addItem', 'setCurrency', 'addItem']);
    expect(storefront.cart.currency.value).toBe('ISK');
  });

  it('keeps no ISK choice for whoever uses the browser next', async () => {
    const data = installStorage({ [CART_KEY]: 'cart-1' });
    const { client } = businessClient(cartAnswer('EUR'));
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('EUR'));
    await storefront.currency.start(async () => null);
    storefront.currency.keepOwnCurrency();
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('ISK'));
    expect(data.has(PREFERENCE_KEY)).toBe(false);
  });

  it('goes back to what the store offers when the store sees no business customer', async () => {
    installStorage();
    const { client, calls } = shopClient();
    client.cart.addItem = (async (input: Record<string, unknown>) => {
      calls.push({ method: 'addItem', args: [input] });
      return cartAnswer((input.currency as string | undefined) ?? 'EUR');
    }) as typeof client.cart.addItem;
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    storefront.currency.keepOwnCurrency();
    await storefront.currency.start(async () => null);
    await storefront.cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    await vi.waitFor(() => expect(storefront.currency.ownCurrencyOnly.value).toBe(false));
    expect(storefront.currency.offered.value).toEqual(['EUR', 'USD']);
    expect(storefront.currency.failure.value).toBeNull();
    await storefront.cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    expect(calls.filter((call) => call.method === 'setCurrency')).toHaveLength(1);
  });

  it('lets go on sign-out and moves an ISK cart to the default', async () => {
    installStorage({ [CART_KEY]: 'cart-1' });
    const { client } = businessClient(cartAnswer('ISK'));
    client.cart.setCurrency = (async (_cartId: string, currency: string) =>
      cartAnswer(currency)) as typeof client.cart.setCurrency;
    const storefront = createGatewayStorefront(client, { route: route(), commerce: ISK_OFF });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('ISK'));
    storefront.currency.keepOwnCurrency();
    await storefront.currency.start(async () => null);
    expect(storefront.cart.currency.value).toBe('ISK');
    storefront.currency.keepOwnCurrency(false);
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('EUR'));
    expect(storefront.currency.offered.value).toEqual(['EUR', 'USD']);
  });
});
