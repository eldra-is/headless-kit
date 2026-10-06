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
  /**
   * The gateway made this route organisation-independent deliberately: it takes no `X-Org-Id`, and a
   * request that carried one would be bound to the organisation's registered origins like any
   * org-scoped read — answering 403 from a browser origin the gateway promises 200 to. The pair of
   * assertions is the guard: absent here, still present on an ordinary read of the same client.
   */
  it('sends no organisation header, while an org-scoped read still does', async () => {
    const { client, requests } = platformRecording(() => ({ checkoutUrl: null }));

    await client.platform.config();
    await client.cart.get('cart-1');

    expect(requests[0].url).toBe('https://api.example.test/api/platform/v1/config');
    expect(requests[0].headers.get('X-Org-Id')).toBeNull();
    expect(requests[1].headers.get('X-Org-Id')).toBe('org-123');
  });

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

  /**
   * The read is shared, so it cannot belong to one caller's lifetime: a storefront that aborts its
   * own requests on a route change would otherwise cancel the config read out from under every
   * other caller. A signal therefore abandons the *waiting* and leaves the request alone.
   */
  it('lets a caller abandon its wait without cancelling the shared read', async () => {
    let release: ((value: unknown) => void) | undefined;
    const inFlight = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    const { client, requests } = platformRecording(() => inFlight);

    const controller = new AbortController();
    const abandoned = client.platform.config({ signal: controller.signal });
    const patient = client.platform.config();
    controller.abort();

    // The signal's own reason, which is what any other aborted call in a storefront rejects with.
    const caught = await abandoned.catch((error: unknown) => error);
    expect((caught as Error).name).toBe('AbortError');
    expect(requests[0].signal).toBeUndefined();
    release?.({ checkoutUrl: 'https://checkout.eldra.app' });
    await expect(patient).resolves.toEqual({ checkoutUrl: 'https://checkout.eldra.app' });
    expect(requests).toHaveLength(1);
  });

  it('rejects a caller whose signal is already aborted, and serves the next one', async () => {
    const { client, requests } = platformRecording(() => ({
      checkoutUrl: 'https://checkout.eldra.app',
    }));

    await expect(client.platform.config({ signal: AbortSignal.abort('gone') })).rejects.toBe(
      'gone'
    );
    await expect(client.platform.config()).resolves.toEqual({
      checkoutUrl: 'https://checkout.eldra.app',
    });
    expect(requests).toHaveLength(1);
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
      'The platform did not publish a checkout URL (GET /platform/v1/config).'
    );
  });

  /**
   * A different sentence from the one above, deliberately: "the platform published none" and "the
   * read did not come back" have nothing in common to fix, and a caller that logs `error.message` —
   * or a storefront that swallows the error, as the starter's cart does — would otherwise be sent
   * after a misconfigured platform when the gateway was unreachable or refused the origin.
   */
  it('says so, differently, when the config could not be read, and keeps the cause', async () => {
    const { client } = platformRecording(() => {
      throw new Error('gateway unreachable');
    });

    const caught = await client.checkout.url({ cartId: 'c' }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe(
      'Could not read the platform checkout URL (GET /platform/v1/config): gateway unreachable'
    );
    expect(((caught as Error).cause as Error | undefined)?.message).toBe('gateway unreachable');
  });

  it('strips every trailing slash from the published base', async () => {
    const { client } = platformRecording(() => ({ checkoutUrl: 'https://checkout.eldra.app//' }));

    await expect(client.checkout.url({ cartId: 'c' })).resolves.toBe(
      'https://checkout.eldra.app/checkout/org-123/c'
    );
  });

  /**
   * The value goes into a link a shopper clicks. The gateway normalises what it stores, so this is
   * the defensive layer — but a relative base would otherwise surface as `TypeError: Invalid URL`
   * from inside the SDK, and a `javascript:` one as a working link.
   */
  it('refuses a published base that is not an absolute http(s) URL', async () => {
    const relative = platformRecording(() => ({ checkoutUrl: 'checkout.eldra.app' }));
    await expect(relative.client.checkout.url({ cartId: 'c' })).rejects.toThrow(
      /unusable checkout URL \("checkout\.eldra\.app"\): it must be an absolute http\(s\) URL/
    );

    const script = platformRecording(() => ({ checkoutUrl: 'javascript:alert(1)' }));
    await expect(script.client.checkout.url({ cartId: 'c' })).rejects.toThrow(
      /unusable checkout URL/
    );
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
   * `filter` is repeatable on every list endpoint in
   * `src/__tests__/fixtures/web-gateway.json` (`explode: true`), while `sort`
   * and `fields` are `explode: false`. Comma-joining filter tokens ran them into
   * one parameter — a token's own value may contain commas (`slug:in:a,b`) — and
   * everything after the first token was silently dropped by the gateway.
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

  /**
   * The catalog product filters are declared `explode: true` as well, and every one of them is an
   * OR over its values — so a comma-joined `categoryId=a,b` is one id nothing matches, and a
   * shopper who ticked two categories would be shown an empty grid instead of both.
   */
  it('repeats every catalog filter parameter the gateway declares explode:true', async () => {
    const { client, requests } = recording({ data: [], meta: {} });

    await client.catalog.listCollectionProducts('the-winter-edit', {
      categoryId: ['cat-ceramics', 'cat-textiles'],
      option: ['colour:oat', 'size:m'],
      minPrice: 5000,
      maxPrice: 15000,
      availability: 'in_stock',
      facets: true,
    });
    await client.catalog.listProducts({ collectionId: ['col-winter', 'col-summer'] });

    const collection = new URL(requests[0].url);
    expect(collection.searchParams.getAll('categoryId')).toEqual(['cat-ceramics', 'cat-textiles']);
    expect(collection.searchParams.getAll('option')).toEqual(['colour:oat', 'size:m']);
    expect(collection.searchParams.get('minPrice')).toBe('5000');
    expect(collection.searchParams.get('maxPrice')).toBe('15000');
    expect(collection.searchParams.get('availability')).toBe('in_stock');
    expect(collection.searchParams.get('facets')).toBe('true');
    expect(new URL(requests[1].url).searchParams.getAll('collectionId')).toEqual([
      'col-winter',
      'col-summer',
    ]);
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
  it('exposes the problem category as code and the specific reason as errorId', () => {
    const response = { status: 404, statusText: 'Not Found' } as Response;

    const error = new EldraHttpError(response, {
      type: '/not-found',
      title: 'Not Found',
      status: 404,
      detail: 'shopping cart not found',
      code: 'NOT_FOUND',
      errorId: 'CART_NOT_FOUND',
    });
    const plain = new EldraHttpError(response, 'nope');

    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.errorId).toBe('CART_NOT_FOUND');
    expect(plain.code).toBeUndefined();
    expect(plain.errorId).toBeUndefined();
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
