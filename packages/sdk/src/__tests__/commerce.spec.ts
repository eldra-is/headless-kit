import { describe, expect, expectTypeOf, it } from 'vitest';
import { createEldraClient, EldraHttpError } from '../index';
import type { EldraCart, EldraHttpRequest, EldraOrder } from '../index';
import { stubHttpClient } from './support';

function recording(response: unknown = {}) {
  const requests: EldraHttpRequest[] = [];
  const client = createEldraClient({
    apiBaseUrl: 'https://api.example.test/api',
    orgId: 'org-123',
    checkoutUrl: 'https://checkout.example.test/',
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

describe('eldra sdk checkout', () => {
  it('builds the hosted checkout handoff url', () => {
    const { client } = recording();

    expect(client.checkout.handoffUrl({ cartId: 'cart 1', locale: 'is-IS' })).toBe(
      'https://checkout.example.test/checkout/org-123/cart%201?lang=is-IS'
    );
    expect(client.checkout.handoffUrl({ cartId: 'c', checkoutUrl: 'http://localhost:3002' })).toBe(
      'http://localhost:3002/checkout/org-123/c'
    );
  });

  it('refuses to build a handoff without a checkout url', () => {
    const client = createEldraClient({ orgId: 'org-123', httpClient: stubHttpClient(() => ({})) });

    expect(() => client.checkout.handoffUrl({ cartId: 'c' })).toThrow(/checkout URL/);
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
});
