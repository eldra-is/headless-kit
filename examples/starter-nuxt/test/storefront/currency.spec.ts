import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import type { EldraClient } from '@eldrajs/sdk';
import { createGatewayStorefront } from '../../app/storefront/gateway';
import { EldraHttpError } from '@eldrajs/sdk';
import { fetchVisitorCountry } from '../../app/storefront/currency';

const CURRENCY_STORAGE_KEY = 'eldra.currency';

function notSold(): EldraHttpError {
  return new EldraHttpError(new Response('{}', { status: 400, statusText: 'Bad Request' }), {
    errorId: 'CART_CURRENCY_NOT_SOLD',
  });
}
import type { StorefrontCommerce, StorefrontRoute } from '../../app/storefront/types';

const MULTI: StorefrontCommerce = {
  currency: 'ISK',
  taxInclusivePricing: true,
  defaultTaxRate: 0.24,
  currencies: ['ISK', 'EUR', 'USD'],
};
const ISK_ONLY: StorefrontCommerce = {
  currency: 'ISK',
  taxInclusivePricing: true,
  defaultTaxRate: 0.24,
};

function fakeRoute(): StorefrontRoute {
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

const PRODUCT = {
  id: 'p1',
  slug: 'mug',
  title: 'Mug',
  status: 'ACTIVE',
  options: [],
  categoryIds: [],
  mediaLinks: [],
};

function catalogClient(): { client: EldraClient; productOptions: unknown[] } {
  const productOptions: unknown[] = [];
  const client = {
    catalog: {
      getProduct: async (_handle: string, options: Record<string, unknown> | undefined) => {
        productOptions.push(options);
        const currency = options?.currency as string | undefined;
        return {
          ...PRODUCT,
          variants: [
            currency === 'EUR'
              ? {
                  id: 'v1',
                  sku: 'M',
                  price: 19.9,
                  currency: 'EUR',
                  soldInCurrency: true,
                  status: 'ACTIVE',
                }
              : currency === 'USD'
                ? {
                    id: 'v1',
                    sku: 'M',
                    price: 2900,
                    currency: 'ISK',
                    soldInCurrency: false,
                    status: 'ACTIVE',
                  }
                : { id: 'v1', sku: 'M', price: 2900, status: 'ACTIVE' },
          ],
        };
      },
      listCategories: async () => [],
    },
    inventory: { availability: async () => [] },
    cart: { get: async () => ({}) },
    checkout: { url: async () => 'https://checkout.example/x' },
  } as unknown as EldraClient;
  return { client, productOptions };
}

describe('catalog reads in the chosen currency', () => {
  it('reads in the store currency as the build did, then in the chosen one', async () => {
    installStorage();
    const { client, productOptions } = catalogClient();
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: MULTI });
    const product = storefront.catalog.product(ref('mug'));
    await vi.waitFor(() => expect(product.data.value).not.toBeNull());
    expect(productOptions[0]).toEqual({});
    expect(product.data.value?.price).toEqual({ amount: 2900, compareAt: null });

    await storefront.currency.start(async () => null);
    storefront.currency.choose('EUR');
    await nextTick();
    await vi.waitFor(() => expect(product.data.value?.price.currency).toBe('EUR'));
    expect(productOptions.at(-1)).toEqual({ currency: 'EUR' });
    expect(product.data.value?.price.amount).toBe(19.9);
  });

  it('marks a product with no price in the chosen currency as not sold, keeping its own currency', async () => {
    installStorage();
    const { client } = catalogClient();
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: MULTI });
    await storefront.currency.start(async () => null);
    storefront.currency.choose('USD');
    const product = storefront.catalog.product(ref('mug'));
    await vi.waitFor(() => expect(product.data.value).not.toBeNull());
    expect(product.data.value?.price).toMatchObject({
      amount: 2900,
      currency: 'ISK',
      soldInCurrency: false,
    });
  });

  it('never sends a currency for a one-currency store', async () => {
    installStorage({ [CURRENCY_STORAGE_KEY]: 'EUR' });
    const { client, productOptions } = catalogClient();
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: ISK_ONLY });
    await storefront.currency.start(async () => 'DE');
    const product = storefront.catalog.product(ref('mug'));
    await vi.waitFor(() => expect(product.data.value).not.toBeNull());
    expect(productOptions).toEqual([{}]);
  });
});

function cartResponse(currency: string, soldInCurrency = true): Record<string, unknown> {
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
        soldInCurrency,
      },
    ],
    totals: { subtotal: 0, discount: 0, taxAmount: 0, total: 0 },
  };
}

function cartClient(initial: Record<string, unknown> | null) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  let current = initial;
  const client = {
    cart: {
      get: async () => current,
      addItem: async (input: Record<string, unknown>) => {
        calls.push({ method: 'addItem', args: [input] });
        current = cartResponse((input.currency as string | undefined) ?? 'ISK');
        return current;
      },
      setCurrency: async (cartId: string, currency: string) => {
        calls.push({ method: 'setCurrency', args: [cartId, currency] });
        if (currency === 'USD') throw Object.assign(new Error('not sold'), { status: 400 });
        current = cartResponse(currency, currency !== 'EUR');
        return current;
      },
      removeItem: async () => {
        calls.push({ method: 'removeItem', args: [] });
        current = { ...cartResponse('EUR'), items: [] };
        return current;
      },
    },
    checkout: { url: async () => 'https://checkout.example/checkout/org/cart-1' },
  } as unknown as EldraClient;
  return { client, calls };
}

describe('the cart follows the chosen currency', () => {
  it('creates a new cart in the chosen currency', async () => {
    installStorage();
    const { client, calls } = cartClient(null);
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: MULTI });
    await storefront.currency.start(async () => null);
    storefront.currency.choose('EUR');
    await storefront.cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    expect(calls[0]).toEqual({
      method: 'addItem',
      args: [{ cartId: undefined, productId: 'p1', variantId: 'v1', quantity: 1, currency: 'EUR' }],
    });
    expect(storefront.cart.currency.value).toBe('EUR');
  });

  it('moves the whole cart when the visitor switches, and holds checkout while a line is not sold', async () => {
    installStorage({ 'eldra.cartId': 'cart-1' });
    const { client, calls } = cartClient(cartResponse('ISK'));
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: MULTI });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('ISK'));
    await storefront.currency.start(async () => null);
    await vi.waitFor(() => expect(storefront.cart.checkoutUrl.value).not.toBeNull());

    storefront.currency.choose('EUR');
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('EUR'));
    expect(calls).toContainEqual({ method: 'setCurrency', args: ['cart-1', 'EUR'] });
    expect(storefront.cart.notSold.value.map((line) => line.title)).toEqual(['Mug']);
    expect(storefront.cart.checkoutUrl.value).toBeNull();

    await storefront.cart.removeNotSold();
    expect(storefront.cart.notSold.value).toEqual([]);
    expect(storefront.cart.checkoutUrl.value).not.toBeNull();
  });

  it('adopts the cart currency it finds instead of moving the cart (another tab chose it)', async () => {
    installStorage({ 'eldra.cartId': 'cart-1' });
    const { client, calls } = cartClient(cartResponse('ISK'));
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: MULTI });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('ISK'));
    await storefront.currency.start(async () => null);
    client.cart.addItem = (async () => cartResponse('EUR')) as typeof client.cart.addItem;
    await storefront.cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    await vi.waitFor(() => expect(storefront.currency.active.value).toBe('EUR'));
    expect(calls.filter((call) => call.method === 'setCurrency')).toEqual([]);
  });

  it('does not move the cart before start() has settled', async () => {
    installStorage({ 'eldra.cartId': 'cart-1' });
    const { client, calls } = cartClient(cartResponse('EUR'));
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: MULTI });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('EUR'));
    await nextTick();
    expect(calls).toEqual([]);
    expect(storefront.currency.active.value).toBe('ISK');
  });

  it('puts the visitor back in the cart currency and forgets the choice when the cart refuses to move', async () => {
    const data = installStorage({ 'eldra.cartId': 'cart-1' });
    const { client } = cartClient(cartResponse('ISK'));
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: MULTI });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('ISK'));
    await storefront.currency.start(async () => null);
    storefront.currency.choose('USD');
    expect(storefront.currency.busy.value).toBe(true);
    await vi.waitFor(() => expect(storefront.currency.busy.value).toBe(false));
    expect(storefront.currency.active.value).toBe('ISK');
    expect(storefront.cart.currency.value).toBe('ISK');
    expect(data.has(CURRENCY_STORAGE_KEY)).toBe(false);
  });

  it('withdraws a currency the cart may not move to because the shop stopped selling in it', async () => {
    installStorage({ 'eldra.cartId': 'cart-1' });
    const { client } = cartClient(cartResponse('ISK'));
    client.cart.setCurrency = (async () => {
      throw notSold();
    }) as typeof client.cart.setCurrency;
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: MULTI });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('ISK'));
    await storefront.currency.start(async () => null);
    storefront.currency.choose('EUR');
    await vi.waitFor(() => expect(storefront.currency.offered.value).toEqual(['ISK', 'USD']));
    expect(storefront.currency.active.value).toBe('ISK');
    expect(storefront.currency.failure.value?.errorId).toBe('CART_CURRENCY_NOT_SOLD');
  });

  it('withdraws a currency the shop stopped selling in and adds in the store currency instead', async () => {
    const data = installStorage();
    const sent: Array<string | undefined> = [];
    const client = {
      cart: {
        get: async () => null,
        addItem: async (input: Record<string, unknown>) => {
          sent.push(input.currency as string | undefined);
          if (input.currency === 'EUR') throw notSold();
          return cartResponse('ISK');
        },
      },
      checkout: { url: async () => 'https://checkout.example/x' },
    } as unknown as EldraClient;
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: MULTI });
    await storefront.currency.start(async () => 'DE');
    expect(storefront.currency.active.value).toBe('EUR');

    const failure = await storefront.cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });

    expect(failure).toBeNull();
    expect(sent).toEqual(['EUR', undefined]);
    expect(storefront.currency.active.value).toBe('ISK');
    expect(storefront.currency.offered.value).toEqual(['ISK', 'USD']);
    expect(storefront.currency.movedTo.value).toBe('ISK');
    expect(data.has(CURRENCY_STORAGE_KEY)).toBe(false);
    expect(storefront.cart.lines.value).toHaveLength(1);
  });
});

describe('price filters in the chosen currency', () => {
  it('sends no price filter and shows no price facet outside the store currency', async () => {
    installStorage();
    const queries: Array<Record<string, unknown>> = [];
    const client = {
      catalog: {
        listProducts: async (options: Record<string, unknown>) => {
          queries.push(options);
          return {
            data: [],
            meta: {
              page: 1,
              pageSize: 24,
              total: 0,
              totalPages: 0,
              rows: 0,
              hasNext: false,
              hasPrev: false,
            },
            facets: {
              price: { min: 1000, max: 9000 },
              categories: [],
              collections: [],
              options: [],
            },
          };
        },
        listCategories: async () => [],
      },
      cart: { get: async () => null },
      checkout: { url: async () => 'x' },
    } as unknown as EldraClient;
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: MULTI });
    const opts = ref({ page: 1, pageSize: 24, filters: { price: ['10-20'] } });
    const result = storefront.catalog.products(opts);
    await vi.waitFor(() => expect(result.data.value).not.toBeNull());
    expect(queries[0]).toMatchObject({ minPrice: 10, maxPrice: 20 });
    expect(result.data.value?.facets?.price).toBeDefined();

    await storefront.currency.start(async () => null);
    storefront.currency.choose('EUR');
    await vi.waitFor(() => expect(queries).toHaveLength(2));
    await vi.waitFor(() => expect(result.data.value?.facets?.price).toBeUndefined());
    expect(queries[1]).not.toHaveProperty('minPrice');
    expect(queries[1]).not.toHaveProperty('maxPrice');
    expect(queries[1]).toMatchObject({ currency: 'EUR' });
  });
});

describe('search in the chosen currency', () => {
  it('prices search results in the chosen currency', async () => {
    installStorage();
    const listed: unknown[] = [];
    const client = {
      catalog: {
        search: async () => ({
          results: [
            { id: 'r1', sourceId: 'p1', kind: 'PRODUCT', title: 'Mug', targetUrl: '/products/mug' },
          ],
          total: 1,
        }),
        listProducts: async (options: Record<string, unknown>) => {
          listed.push(options);
          return {
            data: [
              {
                id: 'p1',
                slug: 'mug',
                title: 'Mug',
                status: 'ACTIVE',
                minPrice: 19.9,
                maxPrice: 19.9,
                totalVariants: 1,
                currency: 'EUR',
                soldInCurrency: true,
              },
            ],
            meta: {
              page: 1,
              pageSize: 1,
              total: 1,
              totalPages: 1,
              rows: 1,
              hasNext: false,
              hasPrev: false,
            },
          };
        },
      },
      cart: { get: async () => null },
      checkout: { url: async () => 'x' },
    } as unknown as EldraClient;
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: MULTI });
    await storefront.currency.start(async () => null);
    storefront.currency.choose('EUR');
    await vi.waitFor(() => expect(storefront.currency.active.value).toBe('EUR'));
    const result = storefront.search.run(ref('mug'));
    await vi.waitFor(() => expect(result.data.value?.products[0]?.price?.amount).toBe(19.9));
    expect(listed.every((options) => (options as { currency?: string }).currency === 'EUR')).toBe(
      true
    );
    expect(result.data.value?.products[0]?.price).toMatchObject({ amount: 19.9, currency: 'EUR' });
  });
});

describe('fetchVisitorCountry', () => {
  it('gives up after the timeout so Add to cart is not held', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      (_path: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener('abort', () => reject(new Error('aborted')))
        )
    );
    try {
      const answer = fetchVisitorCountry(1500);
      await vi.advanceTimersByTimeAsync(1500);
      await expect(answer).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('answers the country the edge reports', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ country: 'DE' }) }));
    try {
      await expect(fetchVisitorCountry()).resolves.toBe('DE');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('a cart read that fails (K3)', () => {
  function readFailure(status: number): EldraHttpError {
    return new EldraHttpError(new Response('{}', { status, statusText: `S${status}` }), {
      errorId: status === 404 ? 'CART_NOT_FOUND' : 'UNAVAILABLE',
    });
  }

  function cartReads(answers: Array<() => unknown>) {
    return {
      cart: {
        get: async () => {
          const next = answers.shift()!;
          return next();
        },
      },
      checkout: { url: async () => 'https://checkout.example/x' },
    } as unknown as EldraClient;
  }

  it('keeps the cart and its currency when the read times out or the gateway answers 5xx', async () => {
    const data = installStorage({ 'eldra.cartId': 'cart-1', [CURRENCY_STORAGE_KEY]: 'USD' });
    const client = cartReads([
      () => cartResponse('EUR'),
      () => {
        throw readFailure(503);
      },
    ]);
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: MULTI });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('EUR'));
    await storefront.currency.start(async () => null);

    const failure = await storefront.cart.reload();
    expect(failure?.status).toBe(503);
    expect(data.get('eldra.cartId')).toBe('cart-1');
    expect(storefront.cart.currency.value).toBe('EUR');
    expect(storefront.currency.active.value).toBe('EUR');
    expect(storefront.cart.lines.value).toHaveLength(1);
  });

  it('forgets a cart the gateway says is gone, and the preference applies again', async () => {
    const data = installStorage({ 'eldra.cartId': 'cart-1', [CURRENCY_STORAGE_KEY]: 'USD' });
    const client = cartReads([
      () => cartResponse('EUR'),
      () => {
        throw readFailure(404);
      },
    ]);
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: MULTI });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('EUR'));
    await storefront.currency.start(async () => null);

    expect(await storefront.cart.reload()).toBeNull();
    expect(data.has('eldra.cartId')).toBe(false);
    expect(storefront.cart.currency.value).toBeUndefined();
    expect(storefront.currency.active.value).toBe('USD');
  });
});

describe('CodeRabbit review on #162: gateway', () => {
  it('4662896726: a stale read that finds the old cart gone does not forget the newer cart', async () => {
    const data = installStorage({ 'eldra.cartId': 'cart-c' });
    const gets: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }> = [];
    const gone = () =>
      new EldraHttpError(new Response('{}', { status: 404, statusText: 'Not Found' }), {
        errorId: 'CART_NOT_FOUND',
      });
    const client = {
      cart: {
        get: () =>
          new Promise((resolve, reject) => {
            gets.push({ resolve, reject });
          }),
        addItem: async () => ({ ...cartResponse('ISK'), id: 'cart-d' }),
      },
      checkout: { url: async () => 'https://checkout.example/x' },
    } as unknown as EldraClient;
    const storefront = createGatewayStorefront(client, { route: fakeRoute(), commerce: ISK_ONLY });
    gets.shift()!.resolve({ ...cartResponse('ISK'), id: 'cart-c' });
    await vi.waitFor(() => expect(storefront.cart.currency.value).toBe('ISK'));

    void storefront.cart.reload();
    void storefront.cart.reload();
    const older = gets.shift()!;
    gets.shift()!.reject(gone());
    await vi.waitFor(() => expect(data.has('eldra.cartId')).toBe(false));
    await storefront.cart.add({ productId: 'p1', variantId: 'v1', quantity: 1 });
    expect(data.get('eldra.cartId')).toBe('cart-d');

    older.reject(gone());
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(data.get('eldra.cartId')).toBe('cart-d');
  });
});
