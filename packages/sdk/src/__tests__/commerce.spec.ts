import { describe, expect, expectTypeOf, it } from 'vitest';
import { createEldraClient, EldraHttpError } from '../index';
import type { EldraCart, EldraHttpRequest, EldraOrder, EldraPlatformConfig } from '../index';
import { stubHttpClient } from './support';

function recording(response: unknown = {}) {
  const requests: EldraHttpRequest[] = [];
  const client = createEldraClient({
    apiBaseUrl: 'https://api.example.test/api',
    orgId: 'org-123',
    httpClient: stubHttpClient((request) => {
      requests.push(request);
      return response;
    }),
  });
  return { client, requests };
}

async function bodyOf(request: EldraHttpRequest): Promise<unknown> {
  return JSON.parse(request.body as string);
}

describe('eldra sdk cart', () => {
  it('adds an item and carries the existing cart id', async () => {
    const { client, requests } = recording({ id: 'cart-1', items: [] });

    const cart = await client.cart.addItem({
      cartId: 'cart-1',
      productId: 'prod-1',
      variantId: 'var-1',
      quantity: 2,
    });

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('https://api.example.test/api/shopping-cart/v1/cart/items');
    expect(await bodyOf(requests[0])).toEqual({
      cartId: 'cart-1',
      productId: 'prod-1',
      variantId: 'var-1',
      quantity: 2,
    });
    expect(requests[0].headers.get('X-Org-Id')).toBe('org-123');
    expectTypeOf(cart).toEqualTypeOf<EldraCart>();
  });

  it('reads a cart in a locale', async () => {
    const { client, requests } = recording({ id: 'cart-1' });

    await client.cart.get('cart-1', { locale: 'is-IS' });

    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe(
      'https://api.example.test/api/shopping-cart/v1/cart/cart-1?locale=is-IS'
    );
  });

  it('updates and removes items on the item path', async () => {
    const { client, requests } = recording({ id: 'cart-1' });

    await client.cart.updateItem('cart-1', 'item-9', { quantity: 3 });
    await client.cart.removeItem('cart-1', 'item-9');

    expect(requests[0].method).toBe('PATCH');
    expect(requests[0].url).toBe(
      'https://api.example.test/api/shopping-cart/v1/cart/cart-1/items/item-9'
    );
    expect(await bodyOf(requests[0])).toEqual({ quantity: 3 });
    expect(requests[1].method).toBe('DELETE');
    expect(requests[1].url).toBe(requests[0].url);
  });

  it('treats the returned cart as the verdict on a discount code', async () => {
    const accepted = recording({ id: 'cart-1', discountCode: 'SUMMER10' });
    const rejected = recording({ id: 'cart-1' });

    const yes = await accepted.client.cart.applyDiscount('cart-1', ' summer10 ', {
      locale: 'en-US',
    });
    const no = await rejected.client.cart.applyDiscount('cart-1', 'SUMMER10');

    expect(accepted.requests[0].method).toBe('PUT');
    expect(accepted.requests[0].url).toBe(
      'https://api.example.test/api/shopping-cart/v1/cart/cart-1/discount?locale=en-US'
    );
    expect(await bodyOf(accepted.requests[0])).toEqual({ code: 'summer10' });
    expect(yes.applied).toBe(true);
    expect(no.applied).toBe(false);
    expect(no.cart).toEqual({ id: 'cart-1' });
  });

  it('removes a discount code', async () => {
    const { client, requests } = recording({ id: 'cart-1' });

    await client.cart.removeDiscount('cart-1');

    expect(requests[0].method).toBe('DELETE');
    expect(requests[0].url).toBe(
      'https://api.example.test/api/shopping-cart/v1/cart/cart-1/discount'
    );
  });
});

describe('eldra sdk orders', () => {
  it('reads an order with the one-time access token header', async () => {
    const { client, requests } = recording({ id: 'order-1', status: 'CONFIRMED' });

    const order = await client.orders.get('order-1', { accessToken: 'tok' });

    expect(requests[0].url).toBe('https://api.example.test/api/order/v1/order-1');
    expect(requests[0].headers.get('X-Order-Token')).toBe('tok');
    expect(requests[0].headers.get('X-Org-Id')).toBe('org-123');
    expectTypeOf(order).toEqualTypeOf<EldraOrder>();
  });

  it('sends no token header when none is given', async () => {
    const { client, requests } = recording({});

    await client.orders.get('order-1');

    expect(requests[0].headers.has('X-Order-Token')).toBe(false);
  });

  it('recovers a basket from a trimmed token', async () => {
    const { client, requests } = recording({ orderId: 'order-1', items: [] });

    await client.orders.recover('  abc  ');

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('https://api.example.test/api/order/v1/recover');
    expect(await bodyOf(requests[0])).toEqual({ token: 'abc' });
  });
});

/**
 * The platform hosts checkout, so where it lives is the platform's answer to give: a storefront
 * reads `GET /platform/v1/config` rather than carrying a base URL of its own. These guard the two
 * things a storefront depends on — that the read happens once per client however many carts ask for
 * a URL, and that an outage is retried rather than remembered as "no checkout".
 */
function platformRecording(answer: (count: number) => unknown) {
  const requests: EldraHttpRequest[] = [];
  const client = createEldraClient({
    apiBaseUrl: 'https://api.example.test/api',
    orgId: 'org-123',
    httpClient: stubHttpClient((request) => {
      requests.push(request);
      return answer(requests.length);
    }),
  });
  return { client, requests };
}

describe('eldra sdk platform config', () => {
  it('reads the public config and caches it for the life of the client', async () => {
    const { client, requests } = platformRecording(() => ({
      checkoutUrl: 'https://checkout.eldra.app',
    }));

    const first = await client.platform.config();
    const second = await client.platform.config();

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('https://api.example.test/api/platform/v1/config');
    expect(first).toEqual({ checkoutUrl: 'https://checkout.eldra.app' });
    expect(second).toEqual(first);
    expectTypeOf(first).toEqualTypeOf<EldraPlatformConfig>();
  });

  it('serves concurrent callers from one in-flight request', async () => {
    const { client, requests } = platformRecording(() => ({
      checkoutUrl: 'https://checkout.eldra.app',
    }));

    const [first, second] = await Promise.all([client.platform.config(), client.platform.config()]);

    expect(requests).toHaveLength(1);
    expect(first).toEqual(second);
  });

  it('does not cache a failed read: the next call tries again', async () => {
    const { client, requests } = platformRecording((count) => {
      if (count === 1) throw new Error('gateway unreachable');
      return { checkoutUrl: 'https://checkout.eldra.app' };
    });

    await expect(client.platform.config()).rejects.toThrow('gateway unreachable');
    await expect(client.platform.config()).resolves.toEqual({
      checkoutUrl: 'https://checkout.eldra.app',
    });
    expect(requests).toHaveLength(2);
  });

  it('reads a platform that publishes no checkout as null, blank included', async () => {
    const { client } = platformRecording(() => ({ checkoutUrl: null }));
    await expect(client.platform.config()).resolves.toEqual({ checkoutUrl: null });

    const blank = platformRecording(() => ({ checkoutUrl: '   ' }));
    await expect(blank.client.platform.config()).resolves.toEqual({ checkoutUrl: null });

    const empty = platformRecording(() => ({}));
    await expect(empty.client.platform.config()).resolves.toEqual({ checkoutUrl: null });
  });
});

describe('eldra sdk checkout', () => {
  it('builds the hand-off url from the platform config', async () => {
    const { client, requests } = platformRecording(() => ({
      checkoutUrl: 'https://checkout.eldra.app/',
    }));

    await expect(client.checkout.url({ cartId: 'cart 1', locale: 'is-IS' })).resolves.toBe(
      'https://checkout.eldra.app/checkout/org-123/cart%201?lang=is-IS'
    );
    // A second cart reuses the one config read.
    await expect(client.checkout.url({ cartId: 'c' })).resolves.toBe(
      'https://checkout.eldra.app/checkout/org-123/c'
    );
    expect(requests).toHaveLength(1);
  });

  it('takes an explicit orgId over the one on the client, encoding both ids', async () => {
    const { client } = platformRecording(() => ({ checkoutUrl: 'https://checkout.eldra.app' }));

    await expect(client.checkout.url({ cartId: 'cart/1', orgId: 'org 2' })).resolves.toBe(
      'https://checkout.eldra.app/checkout/org%202/cart%2F1'
    );
  });

  it('refuses when the platform published no checkout url', async () => {
    const { client } = platformRecording(() => ({ checkoutUrl: null }));

    await expect(client.checkout.url({ cartId: 'c' })).rejects.toThrow(
      /did not publish a checkout URL/
    );
  });

  it('refuses when the config cannot be read, carrying the read failure as the cause', async () => {
    const { client } = platformRecording(() => {
      throw new Error('gateway unreachable');
    });

    const caught = await client.checkout.url({ cartId: 'c' }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/did not publish a checkout URL/);
    expect(((caught as Error).cause as Error | undefined)?.message).toBe('gateway unreachable');
  });
});

describe('eldra sdk inventory and catalog extras', () => {
  it('asks for availability per variant and location', async () => {
    const { client, requests } = recording({ items: [] });

    await client.inventory.availability([{ variantId: 'v', locationId: 'l' }]);

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('https://api.example.test/api/inventory/v1/stock/availability');
    expect(await bodyOf(requests[0])).toEqual({ items: [{ variantId: 'v', locationId: 'l' }] });
  });

  /**
   * `filter` is the one query parameter the gateway declares repeatable
   * (`explode: true` on every list endpoint in
   * `src/__tests__/fixtures/web-gateway.json`); `sort` and `fields` are
   * `explode: false`. Comma-joining filter tokens ran them into one parameter —
   * a token's own value may contain commas (`slug:in:a,b`) — and everything
   * after the first token was silently dropped by the gateway.
   */
  it('repeats the filter parameter per token and keeps sort comma-separated', async () => {
    const { client, requests } = recording({ data: [], meta: {} });

    await client.catalog.listProducts({
      filter: ['slug:in:merino-crew,stoneware-mug', 'status:eq:ACTIVE'],
      sort: ['-createdAt', 'slug'],
      fields: ['id', 'slug'],
      pageSize: 2,
    });

    const url = new URL(requests[0].url);
    expect(url.searchParams.getAll('filter')).toEqual([
      'slug:in:merino-crew,stoneware-mug',
      'status:eq:ACTIVE',
    ]);
    expect(url.searchParams.getAll('sort')).toEqual(['-createdAt,slug']);
    expect(url.searchParams.getAll('fields')).toEqual(['id,slug']);
    expect(requests[0].url).toContain('filter=slug%3Ain%3Amerino-crew%2Cstoneware-mug');
    expect(requests[0].url).toContain('filter=status%3Aeq%3AACTIVE');
  });

  it('normalises a null category list and searches with q', async () => {
    const { client, requests } = recording(null);

    const categories = await client.catalog.listCategories({ locale: 'en-US' });
    await client.catalog.search('mat', { limit: 5 });
    await client.catalog.listCollectionProducts('summer', { locale: 'en-US', pageSize: 12 });

    expect(categories).toEqual([]);
    expect(requests[1].url).toBe('https://api.example.test/api/search/v1?limit=5&q=mat');
    expect(requests[2].url).toBe(
      'https://api.example.test/api/catalog/v1/collections/summer/products?locale=en-US&pageSize=12'
    );
  });
});

describe('eldra sdk errors', () => {
  it('exposes the gateway problem code', () => {
    const response = { status: 409, statusText: 'Conflict' } as Response;

    const error = new EldraHttpError(response, { code: 'INSUFFICIENT_STOCK' });
    const plain = new EldraHttpError(response, 'nope');

    expect(error.status).toBe(409);
    expect(error.code).toBe('INSUFFICIENT_STOCK');
    expect(plain.code).toBeUndefined();
  });

  // A refused cart add is the case this exists for: the `code` is the generic `CONFLICT` every
  // other conflict also carries, so only `errorId` says the refusal was about stock.
  it('exposes the gateway problem errorId beside the code', () => {
    const response = { status: 409, statusText: 'Conflict' } as Response;

    const error = new EldraHttpError(response, {
      code: 'CONFLICT',
      errorId: 'CART_INSUFFICIENT_STOCK',
      detail: 'insufficient stock',
    });

    expect(error.code).toBe('CONFLICT');
    expect(error.errorId).toBe('CART_INSUFFICIENT_STOCK');
    expect(new EldraHttpError(response, { code: 'CONFLICT' }).errorId).toBeUndefined();
    expect(new EldraHttpError(response, { errorId: 7 }).errorId).toBeUndefined();
  });
});
