import { describe, expect, expectTypeOf, it } from 'vitest';
import { createEldraClient, customerHeaders, EldraHttpError, isEldraError } from '../index';
import type { EldraErrorId, EldraHttpRequest } from '../index';
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

function failing(status: number, problem: Record<string, unknown>) {
  let calls = 0;
  const client = createEldraClient({
    apiBaseUrl: 'https://api.example.test/api',
    orgId: 'org-123',
    fetch: (async () => {
      calls += 1;
      return new Response(JSON.stringify({ status, ...problem }), {
        status,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    }) as typeof globalThis.fetch,
  });
  return { client, calls: () => calls };
}

async function bodyOf(request: EldraHttpRequest): Promise<unknown> {
  return JSON.parse(request.body as string);
}

const signedIn = { headers: customerHeaders('tok', 'cust-1') };

const order = {
  id: 'so-1',
  orderNumber: 1001,
  salesStatus: 'OPEN',
  purchaseOrderNumber: 'PO-7',
  note: '',
  placedAt: '2026-10-10T10:00:00Z',
  paymentTermLabel: 'Net 30',
  currency: 'ISK',
  subtotalAmount: 1000,
  taxAmount: 240,
  totalAmount: 1240,
  delivery: {
    name: 'Main',
    address: 'Laugavegur 1',
    postalCode: '101',
    town: 'Reykjavík',
    countryCode: 'IS',
    phoneNumber: '',
  },
  lines: [],
  warnings: [{ code: 'SALES_ORDER_STOCK_NOT_SET_ASIDE' }],
};

describe('eldra sdk customer locations', () => {
  it('reads the active company locations with the caller token and company', async () => {
    const location = { id: 'loc-1', name: 'Main', isDefault: true };
    const { client, requests } = recording({ data: [location] });

    const locations = await client.customer.locations(signedIn);

    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('https://api.example.test/api/customer/v1/locations');
    expect(requests[0].headers.get('Authorization')).toBe('Bearer tok');
    expect(requests[0].headers.get('X-Customer-Id')).toBe('cust-1');
    expect(requests[0].headers.get('X-Org-Id')).toBe('org-123');
    expect(requests[0].body).toBeUndefined();
    expect(locations).toEqual({ data: [location] });
  });
});

describe('eldra sdk sales orders', () => {
  it('previews the cart without an idempotency key', async () => {
    const preview = { currency: 'ISK', lines: [], credit: { status: 'WITHIN', wouldBlock: false } };
    const { client, requests } = recording(preview);

    const result = await client.salesOrders.preview(
      { cartId: 'cart-1', locationId: 'loc-1' },
      signedIn
    );

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('https://api.example.test/api/sales-order/v1/preview');
    expect(requests[0].headers.get('Authorization')).toBe('Bearer tok');
    expect(requests[0].headers.get('X-Customer-Id')).toBe('cust-1');
    expect(requests[0].headers.get('Idempotency-Key')).toBeNull();
    expect(requests[0].headers.get('Content-Type')).toBe('application/json');
    expect(await bodyOf(requests[0])).toEqual({ cartId: 'cart-1', locationId: 'loc-1' });
    expect(result).toEqual(preview);
  });

  it('places the order with the idempotency key and exactly the given body', async () => {
    const { client, requests } = recording(order);
    const input = {
      cartId: 'cart-1',
      locationId: 'loc-1',
      purchaseOrderNumber: 'PO-7',
      customerOrderDate: '2026-10-10',
      note: 'Back door',
    };

    const result = await client.salesOrders.create(input, { idempotencyKey: 'key-1' }, signedIn);

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('https://api.example.test/api/sales-order/v1');
    expect(requests[0].headers.get('Idempotency-Key')).toBe('key-1');
    expect(requests[0].headers.get('Authorization')).toBe('Bearer tok');
    expect(requests[0].headers.get('X-Customer-Id')).toBe('cust-1');
    expect(await bodyOf(requests[0])).toEqual(input);
    expect(result).toEqual(order);
  });

  it('lets the idempotency key option win over a header of the same name', async () => {
    const { client, requests } = recording(order);

    await client.salesOrders.create(
      { cartId: 'cart-1' },
      { idempotencyKey: 'key-2' },
      { headers: { ...customerHeaders('tok'), 'Idempotency-Key': 'stale' } }
    );

    expect(requests[0].headers.get('Idempotency-Key')).toBe('key-2');
  });

  it('keeps the key when the client is built with an Idempotency-Key header', async () => {
    const requests: EldraHttpRequest[] = [];
    const client = createEldraClient({
      apiBaseUrl: 'https://api.example.test/api',
      orgId: 'org-123',
      headers: { 'Idempotency-Key': 'client-wide' },
      httpClient: stubHttpClient((request) => {
        requests.push(request);
        return order;
      }),
    });

    await client.salesOrders.create({ cartId: 'cart-1' }, { idempotencyKey: 'key-3' }, signedIn);

    expect(requests[0].headers.get('Idempotency-Key')).toBe('key-3');
  });

  it('refuses a key longer than 255 characters with a TypeError and sends nothing', async () => {
    const { client, requests } = recording(order);

    await expect(
      client.salesOrders.create({ cartId: 'cart-1' }, { idempotencyKey: 'k'.repeat(256) }, signedIn)
    ).rejects.toThrow(TypeError);
    await client.salesOrders.create(
      { cartId: 'cart-1' },
      { idempotencyKey: 'k'.repeat(255) },
      signedIn
    );

    expect(requests).toHaveLength(1);
  });

  it.each([undefined, '', '   '])(
    'refuses to place an order without an idempotency key (%j)',
    async (idempotencyKey) => {
      const { client, requests } = recording(order);

      await expect(
        client.salesOrders.create(
          { cartId: 'cart-1' },
          { idempotencyKey } as { idempotencyKey: string },
          signedIn
        )
      ).rejects.toThrow(TypeError);
      await expect(
        client.salesOrders.create(
          { cartId: 'cart-1' },
          undefined as unknown as { idempotencyKey: string },
          signedIn
        )
      ).rejects.toThrow(/idempotency key/i);
      expect(requests).toHaveLength(0);
    }
  );

  it('requires the idempotency key in the type', () => {
    type Create = ReturnType<typeof recording>['client']['salesOrders']['create'];
    expectTypeOf<Parameters<Create>[1]>().toEqualTypeOf<{ idempotencyKey: string }>();
  });

  it('lists the company orders with page, size and status', async () => {
    const list = { data: [], meta: { page: 2, pageSize: 10 } };
    const { client, requests } = recording(list);

    const result = await client.salesOrders.list(
      { page: 2, pageSize: 10, status: 'OPEN' },
      signedIn
    );
    await client.salesOrders.list(undefined, signedIn);

    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe(
      'https://api.example.test/api/sales-order/v1?page=2&pageSize=10&status=OPEN'
    );
    expect(requests[0].headers.get('Authorization')).toBe('Bearer tok');
    expect(requests[0].headers.get('X-Customer-Id')).toBe('cust-1');
    expect(requests[1].url).toBe('https://api.example.test/api/sales-order/v1');
    expect(result).toEqual(list);
  });

  it('reads one order by id, encoded', async () => {
    const { client, requests } = recording(order);

    const result = await client.salesOrders.get('so/1', signedIn);

    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('https://api.example.test/api/sales-order/v1/so%2F1');
    expect(requests[0].headers.get('Authorization')).toBe('Bearer tok');
    expect(result).toEqual(order);
  });

  it('sends no Authorization header when no token is passed', async () => {
    const { client, requests } = recording(order);

    await client.customer.locations();
    await client.salesOrders.preview({ cartId: 'cart-1' });
    await client.salesOrders.create({ cartId: 'cart-1' }, { idempotencyKey: 'k' });
    await client.salesOrders.list();
    await client.salesOrders.get('so-1');

    expect(requests).toHaveLength(5);
    for (const request of requests) {
      expect(request.headers.has('Authorization')).toBe(false);
      expect(request.headers.has('X-Customer-Id')).toBe(false);
    }
  });
});

describe('eldra sdk sales order refusals', () => {
  it('carries the already-ordered sales order id in errors', async () => {
    const { client } = failing(409, {
      code: 'CONFLICT',
      errorId: 'SALES_ORDER_CART_ALREADY_ORDERED',
      errors: { salesOrderId: 'so-9' },
    });

    const error = await client.salesOrders
      .create({ cartId: 'cart-1' }, { idempotencyKey: 'k' }, signedIn)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EldraHttpError);
    expect(error).toMatchObject({
      status: 409,
      errorId: 'SALES_ORDER_CART_ALREADY_ORDERED',
      errors: { salesOrderId: 'so-9' },
    });
  });

  it('carries the line that cannot be ordered', async () => {
    const { client } = failing(400, {
      errorId: 'SALES_ORDER_LINE_INVALID',
      errors: { variantId: 'var-3' },
    });

    const error = await client.salesOrders.preview({ cartId: 'cart-1' }, signedIn).catch((e) => e);

    expect(error).toMatchObject({
      status: 400,
      errorId: 'SALES_ORDER_LINE_INVALID',
      errors: { variantId: 'var-3' },
    });
  });

  it('leaves errors undefined when the problem has none, as on a credit refusal', async () => {
    const { client } = failing(409, {
      errorId: 'SALES_ORDER_CREDIT_LIMIT_EXCEEDED',
      detail: 'over the limit',
    });

    const error = (await client.salesOrders
      .create({ cartId: 'cart-1' }, { idempotencyKey: 'k' }, signedIn)
      .catch((e) => e)) as EldraHttpError;

    expect(error.errorId).toBe('SALES_ORDER_CREDIT_LIMIT_EXCEEDED');
    expect(error.errors).toBeUndefined();
  });

  it('surfaces an upstream refusal as a 502, not a sign-in failure', async () => {
    const { client, calls } = failing(502, { errorId: 'SALES_ORDER_UPSTREAM_REFUSED' });

    const error = (await client.salesOrders
      .list(undefined, signedIn)
      .catch((e) => e)) as EldraHttpError;

    expect(calls()).toBe(1);
    expect(error.status).toBe(502);
    expect(error.errorId).toBe('SALES_ORDER_UPSTREAM_REFUSED');
  });

  it('narrows a refusal by id with its errors typed', async () => {
    const { client } = failing(409, {
      errorId: 'SALES_ORDER_CART_ALREADY_ORDERED',
      errors: { salesOrderId: 'so-9' },
    });

    const error: unknown = await client.salesOrders
      .create({ cartId: 'cart-1' }, { idempotencyKey: 'k' }, signedIn)
      .catch((e: unknown) => e);

    expect(isEldraError(error, 'SALES_ORDER_LINE_INVALID')).toBe(false);
    expect(isEldraError(new Error('x'), 'SALES_ORDER_CART_ALREADY_ORDERED')).toBe(false);
    if (!isEldraError(error, 'SALES_ORDER_CART_ALREADY_ORDERED')) {
      throw new Error('expected SALES_ORDER_CART_ALREADY_ORDERED');
    }
    expectTypeOf(error.errors?.salesOrderId).toEqualTypeOf<string | undefined>();
    expect(error.errors?.salesOrderId).toBe('so-9');
  });

  it('types the errors of every documented refusal', () => {
    const e = {} as unknown;
    if (isEldraError(e, 'SALES_ORDER_LINE_INVALID')) {
      expectTypeOf(e.errors?.variantId).toEqualTypeOf<string | undefined>();
    }
    if (isEldraError(e, 'ORDER_PRODUCT_UNAVAILABLE')) {
      expectTypeOf(e.errors?.variantIds).toEqualTypeOf<string[] | undefined>();
    }
    if (isEldraError(e, 'SHIPPING_CART_NOT_EXPORTABLE')) {
      expectTypeOf(e.errors?.itemIds).toEqualTypeOf<string[] | undefined>();
    }
    if (isEldraError(e, 'CUSTOMER_BLOCKED')) {
      expectTypeOf(e.errors).toEqualTypeOf<Readonly<Record<string, unknown>> | undefined>();
    }
  });

  it('types the known error ids and still accepts any string', () => {
    expectTypeOf<'SALES_ORDER_CREDIT_LIMIT_EXCEEDED'>().toExtend<EldraErrorId>();
    expectTypeOf<'CUSTOMER_BLOCKED'>().toExtend<EldraErrorId>();
    expectTypeOf<'SHOP_TOKEN_INVALID'>().toExtend<EldraErrorId>();
    expectTypeOf<'SOMETHING_NEW'>().toExtend<EldraErrorId>();
    expectTypeOf<EldraHttpError['errorId']>().toEqualTypeOf<EldraErrorId | undefined>();
  });
});
