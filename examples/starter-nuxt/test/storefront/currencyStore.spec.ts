import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { EldraHttpError } from '@eldrajs/sdk';
import { createCartStore, type CartOps, type CartSnapshot } from '../../app/storefront/cart';
import { createCurrencyStore } from '../../app/storefront/currency';
import type { StorefrontCartLine } from '../../app/storefront/types';

const SHOP = { currency: 'ISK', currencies: ['ISK', 'EUR', 'USD'] };
const PRICE: Record<string, number> = { ISK: 5000, EUR: 33.9, USD: 36.9, SEK: 390 };
const ADD = { productId: 'p1', variantId: 'v1', quantity: 1 };

function refusal(errorId: string): EldraHttpError {
  return new EldraHttpError(new Response('{}', { status: 409, statusText: 'Conflict' }), {
    errorId,
  });
}
const OFFLINE = new Error('offline');

interface Request {
  kind: 'init' | 'add' | 'setCurrency' | 'remove';
  arg?: unknown;
  release(error?: Error, keepServer?: boolean): void;
}

/**
 * The gateway behind the cart, one request at a time under the test's control. A read answers the
 * server as it was when the read was made; a write changes the server when it is released.
 */
function fakeServer(start: { currency?: string; variants?: string[] } = {}) {
  const server = {
    currency: start.currency,
    variants: [...(start.variants ?? (start.currency ? ['v0'] : []))],
  };
  const requests: Request[] = [];
  let requestedCurrency: () => string | undefined = () => undefined;

  const snapshot = (): CartSnapshot => {
    const lines: StorefrontCartLine[] = server.variants.map((variantId, index) => ({
      id: `line-${variantId}`,
      productId: 'p1',
      variantId,
      title: `Item ${index}`,
      url: '/products/item',
      variantLabel: '',
      quantity: 1,
      unitPrice: PRICE[server.currency ?? 'ISK']!,
      lineTotal: PRICE[server.currency ?? 'ISK']!,
      max: null,
    }));
    return {
      lines,
      totals: { subtotal: 0, discount: null, shipping: null, tax: null, total: 0 },
      currency: server.currency,
    };
  };

  const call = (kind: Request['kind'], arg: unknown, effect: () => void): Promise<CartSnapshot> =>
    new Promise((resolve, reject) => {
      const readNow = kind === 'init' ? snapshot() : null;
      requests.push({
        kind,
        arg,
        release(error, keepServer) {
          if (error) return reject(error);
          if (!keepServer) effect();
          resolve(readNow ?? snapshot());
        },
      });
    });

  const ops: CartOps = {
    init: () => call('init', undefined, () => undefined),
    add: (input) => {
      const createIn = server.currency === undefined ? (requestedCurrency() ?? 'ISK') : undefined;
      return call('add', createIn, () => {
        if (server.currency === undefined) server.currency = createIn;
        server.variants.push(input.variantId);
      });
    },
    setCurrency: (code) =>
      call('setCurrency', code, () => {
        server.currency = code;
      }),
    remove: (lineId) =>
      call('remove', lineId, () => {
        server.variants = server.variants.filter((variant) => `line-${variant}` !== lineId);
      }),
    setQuantity: async () => snapshot(),
    applyDiscount: async () => ({ ack: { ok: true } }),
    removeDiscount: async () => snapshot(),
    checkoutUrl: ref('https://checkout.example/x'),
  };

  const next = (kind?: Request['kind']): Request => {
    const index = kind === undefined ? 0 : requests.findIndex((request) => request.kind === kind);
    expect(index, `a ${kind ?? 'request'} in flight`).toBeGreaterThanOrEqual(0);
    return requests.splice(index, 1)[0]!;
  };

  return {
    server,
    requests,
    ops,
    next,
    sendsIn: (read: () => string | undefined) => {
      requestedCurrency = read;
    },
  };
}

function memoryPreference(initial: string | null = null) {
  let value = initial;
  return {
    read: () => value,
    remember: (code: string) => {
      value = code;
    },
    forget: () => {
      value = null;
    },
    get value() {
      return value;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
    await nextTick();
  }
}

/** A shop over a fake gateway: the real cart store under the real currency store. */
function shop(
  server: ReturnType<typeof fakeServer>,
  preference = memoryPreference(),
  commerce: { currency: string; currencies?: readonly string[] } = SHOP
) {
  const built = createCurrencyStore(commerce, createCartStore(server.ops), preference);
  server.sendsIn(() => built.currency.requested.value);
  return { ...built, preference };
}

/** Once settled, the site, the cart store and the server agree, and every price is in that currency. */
function expectAgreement(
  store: ReturnType<typeof shop>,
  server: ReturnType<typeof fakeServer>['server']
): void {
  expect(store.currency.active.value).toBe(server.currency);
  expect(store.cart.currency.value).toBe(server.currency);
  for (const line of store.cart.lines.value) {
    expect(line.unitPrice).toBe(PRICE[server.currency!]);
  }
}

async function opened(server: ReturnType<typeof fakeServer>, store: ReturnType<typeof shop>) {
  server.next('init').release();
  await settle();
  await store.currency.start(async () => null);
  await settle();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the shown currency, without a cart', () => {
  it('is the store currency until start, then the country one', async () => {
    const gateway = fakeServer();
    const { currency } = shop(gateway);
    gateway.next('init').release();
    expect(currency.active.value).toBe('ISK');
    expect(currency.pending.value).toBe(true);
    await currency.start(async () => 'DE');
    expect(currency.active.value).toBe('EUR');
    expect(currency.pending.value).toBe(false);
  });

  it('takes the stored preference before the country, without asking for the country', async () => {
    const gateway = fakeServer();
    const country = vi.fn(async () => 'DE');
    const { currency } = shop(gateway, memoryPreference('USD'));
    await currency.start(country);
    expect(currency.active.value).toBe('USD');
    expect(country).not.toHaveBeenCalled();
  });

  it('forgets a stored currency the shop no longer shows and says where prices are now', async () => {
    const gateway = fakeServer();
    const store = shop(gateway, memoryPreference('GBP'));
    await store.currency.start(async () => null);
    expect(store.currency.active.value).toBe('ISK');
    expect(store.preference.value).toBeNull();
    expect(store.currency.movedTo.value).toBe('ISK');
  });

  it('F2: a choice made during the country lookup wins over the country', async () => {
    const gateway = fakeServer();
    const { currency } = shop(gateway);
    gateway.next('init').release();
    const lookup = deferred<string | null>();
    const starting = currency.start(() => lookup.promise);
    currency.choose('USD');
    lookup.resolve('DE');
    await starting;
    await settle();
    expect(currency.active.value).toBe('USD');
  });

  it('a one-currency store offers nothing, is never pending and never asks where the visitor is', async () => {
    const gateway = fakeServer();
    const country = vi.fn(async () => 'DE');
    const { currency } = shop(gateway, memoryPreference('EUR'), { currency: 'ISK' });
    expect(currency.pending.value).toBe(false);
    await currency.start(country);
    expect(currency.offered.value).toEqual(['ISK']);
    expect(currency.active.value).toBe('ISK');
    expect(country).not.toHaveBeenCalled();
  });
});

describe('one queue for every cart write (K1)', () => {
  it('a currency picked while an add is in flight is sent after it, and the site ends with the server', async () => {
    const gateway = fakeServer({ currency: 'ISK' });
    const store = shop(gateway);
    await opened(gateway, store);

    const adding = store.cart.add(ADD);
    await settle();
    store.currency.choose('EUR');
    await settle();
    expect(gateway.requests.map((request) => request.kind)).toEqual(['add']);
    expect(store.currency.busy.value).toBe(true);

    gateway.next('add').release();
    await adding;
    await settle();
    gateway.next('setCurrency').release();
    await settle();

    expect(store.currency.busy.value).toBe(false);
    expect(gateway.server.currency).toBe('EUR');
    expectAgreement(store, gateway.server);
    expect(store.preference.value).toBe('EUR');
  });

  it('F3: the last of several quick choices wins, one move in flight', async () => {
    const gateway = fakeServer({ currency: 'ISK' });
    const store = shop(gateway);
    await opened(gateway, store);

    const adding = store.cart.add(ADD);
    await settle();
    store.currency.choose('EUR');
    store.currency.choose('USD');
    gateway.next('add').release();
    await adding;
    await settle();
    expect(gateway.requests.map((request) => [request.kind, request.arg])).toEqual([
      ['setCurrency', 'USD'],
    ]);
    gateway.next('setCurrency').release();
    await settle();

    expectAgreement(store, gateway.server);
    expect(gateway.server.currency).toBe('USD');
    expect(store.preference.value).toBe('USD');
  });

  it('a move picked while another is in flight is sent after it lands', async () => {
    const gateway = fakeServer({ currency: 'ISK' });
    const store = shop(gateway);
    await opened(gateway, store);

    store.currency.choose('EUR');
    await settle();
    store.currency.choose('USD');
    await settle();
    expect(gateway.requests.map((request) => request.arg)).toEqual(['EUR']);
    gateway.next('setCurrency').release();
    await settle();
    gateway.next('setCurrency').release();
    await settle();

    expect(gateway.server.currency).toBe('USD');
    expectAgreement(store, gateway.server);
  });

  it("drops a reload's answer that is older than the tab's own move", async () => {
    const fakeWindow = new EventTarget();
    vi.stubGlobal('window', fakeWindow);
    const gateway = fakeServer({ currency: 'ISK' });
    const store = shop(gateway);
    await opened(gateway, store);

    store.currency.choose('EUR');
    await settle();
    void store.cart.reload();
    gateway.next('setCurrency').release();
    await settle();
    gateway.next('init').release();
    await settle();

    expect(gateway.server.currency).toBe('EUR');
    expectAgreement(store, gateway.server);
  });
});

describe('what a move answers', () => {
  it('a refused move drops the currency for the visit and stays in the cart currency', async () => {
    const gateway = fakeServer({ currency: 'EUR' });
    const store = shop(gateway, memoryPreference('EUR'));
    await opened(gateway, store);

    store.currency.choose('USD');
    await settle();
    gateway.next('setCurrency').release(refusal('CART_CURRENCY_NOT_SOLD'));
    await settle();

    expect(store.currency.offered.value).toEqual(['ISK', 'EUR']);
    expect(store.preference.value).toBe('EUR');
    expectAgreement(store, gateway.server);
  });

  it('a refused move back to the store currency never drops the store currency', async () => {
    const gateway = fakeServer({ currency: 'EUR' });
    const store = shop(gateway, memoryPreference('EUR'));
    await opened(gateway, store);

    store.currency.chooseBase();
    await settle();
    gateway.next('setCurrency').release(refusal('CART_CURRENCY_NOT_SOLD'));
    await settle();

    expect(store.currency.offered.value).toEqual(['ISK', 'EUR', 'USD']);
    expectAgreement(store, gateway.server);
  });

  it('a failed move changes nothing and reports the failure', async () => {
    const gateway = fakeServer({ currency: 'ISK' });
    const store = shop(gateway);
    await opened(gateway, store);

    store.currency.choose('EUR');
    await settle();
    gateway.next('setCurrency').release(OFFLINE);
    await settle();

    expect(store.currency.offered.value).toEqual(['ISK', 'EUR', 'USD']);
    expect(store.preference.value).toBeNull();
    expect(store.currency.failure.value).not.toBeNull();
    expectAgreement(store, gateway.server);
  });

  it('K2: a move forgets the line that could be put back, and an undo takes the line from the server', async () => {
    const gateway = fakeServer({ currency: 'ISK', variants: ['v0', 'v1'] });
    const store = shop(gateway);
    await opened(gateway, store);

    const removing = store.cart.remove('line-v1');
    await settle();
    gateway.next('remove').release();
    await removing;
    expect(store.cart.lastRemoved.value).not.toBeNull();

    store.currency.choose('EUR');
    await settle();
    gateway.next('setCurrency').release();
    await settle();
    expect(store.cart.lastRemoved.value).toBeNull();
    await store.cart.undoRemove();
    expect(gateway.requests).toEqual([]);
    expectAgreement(store, gateway.server);
  });

  it('K2: an undo puts the line back as the server answers it, where it was', async () => {
    const gateway = fakeServer({ currency: 'ISK', variants: ['v0', 'v1', 'v2'] });
    const store = shop(gateway);
    await opened(gateway, store);

    const removing = store.cart.remove('line-v1');
    await settle();
    gateway.next('remove').release();
    await removing;
    const undoing = store.cart.undoRemove();
    await settle();
    gateway.next('add').release();
    await undoing;

    expect(store.cart.lines.value.map((line) => line.variantId)).toEqual(['v0', 'v1', 'v2']);
    expectAgreement(store, gateway.server);
  });
});

describe('the cart currency before the visitor currency settles', () => {
  it('shows the store currency until start, as the prerendered page did, then the cart one', async () => {
    const gateway = fakeServer({ currency: 'EUR' });
    const store = shop(gateway);
    gateway.next('init').release();
    await settle();
    expect(store.cart.currency.value).toBe('EUR');
    expect(store.currency.active.value).toBe('ISK');
    await store.currency.start(async () => null);
    expectAgreement(store, gateway.server);
  });
});

describe('a cart in a currency this build no longer offers', () => {
  it('is not moved before the visitor currency has settled', async () => {
    const gateway = fakeServer({ currency: 'SEK' });
    shop(gateway);
    gateway.next('init').release();
    await settle();
    expect(gateway.requests).toEqual([]);
  });

  it('is moved to the store currency once, and the notice shows only after the move', async () => {
    const gateway = fakeServer({ currency: 'SEK' });
    const store = shop(gateway);
    await opened(gateway, store);

    expect(gateway.requests.map((request) => [request.kind, request.arg])).toEqual([
      ['setCurrency', 'ISK'],
    ]);
    expect(store.currency.active.value).toBe('SEK');
    expect(store.currency.movedTo.value).toBeNull();
    gateway.next('setCurrency').release();
    await settle();

    expect(store.currency.movedTo.value).toBe('ISK');
    expectAgreement(store, gateway.server);
  });

  it('keeps showing that currency when the move fails, without looping, and tries again on the next add', async () => {
    const gateway = fakeServer({ currency: 'SEK' });
    const store = shop(gateway);
    await opened(gateway, store);
    gateway.next('setCurrency').release(OFFLINE);
    await settle();

    expect(gateway.requests).toEqual([]);
    expect(store.currency.movedTo.value).toBeNull();
    expectAgreement(store, gateway.server);

    const adding = store.cart.add(ADD);
    await settle();
    gateway.next('setCurrency').release();
    await settle();
    gateway.next('add').release();
    await adding;
    expect(gateway.server.currency).toBe('ISK');
    expectAgreement(store, gateway.server);
  });
});

describe('two tabs on one cart', () => {
  it('F1: tab A shows what the cart says whether tab B is refused or moves it', async () => {
    const tabAWindow = new EventTarget();
    vi.stubGlobal('window', tabAWindow);
    const gateway = fakeServer({ currency: 'ISK' });
    const tabA = shop(gateway);
    vi.unstubAllGlobals();
    const tabB = shop(gateway);
    await opened(gateway, tabA);
    await opened(gateway, tabB);

    tabB.currency.choose('EUR');
    await settle();
    gateway.next('setCurrency').release(refusal('CART_CURRENCY_NOT_SOLD'));
    await settle();
    expectAgreement(tabA, gateway.server);
    expectAgreement(tabB, gateway.server);

    tabB.currency.choose('USD');
    await settle();
    gateway.next('setCurrency').release();
    await settle();
    tabAWindow.dispatchEvent(
      Object.assign(new Event('storage'), {
        key: 'eldra.currency',
        newValue: tabB.preference.value,
      })
    );
    await settle();
    gateway.next('init').release();
    await settle();
    expect(gateway.server.currency).toBe('USD');
    expectAgreement(tabA, gateway.server);
    expectAgreement(tabB, gateway.server);
  });

  it('a tab with no cart follows a preference set or forgotten in another tab', async () => {
    const fakeWindow = new EventTarget();
    vi.stubGlobal('window', fakeWindow);
    const gateway = fakeServer();
    const { currency } = shop(gateway);
    gateway.next('init').release();
    await currency.start(async () => null);
    fakeWindow.dispatchEvent(
      Object.assign(new Event('storage'), { key: 'eldra.currency', newValue: 'USD' })
    );
    expect(currency.active.value).toBe('USD');
    fakeWindow.dispatchEvent(
      Object.assign(new Event('storage'), { key: 'eldra.currency', newValue: null })
    );
    expect(currency.active.value).toBe('ISK');
  });
});

describe('adding in a currency the shop stopped selling in (no cart yet)', () => {
  it('F4: withdraws the currency the add was sent in, not one picked meanwhile, and retries once', async () => {
    const gateway = fakeServer();
    const store = shop(gateway);
    gateway.next('init').release();
    await store.currency.start(async () => 'DE');
    expect(store.currency.active.value).toBe('EUR');

    const adding = store.cart.add(ADD);
    await settle();
    store.currency.choose('USD');
    gateway.next('add').release(refusal('CART_CURRENCY_NOT_SOLD'));
    await settle();
    expect(store.currency.offered.value).toEqual(['ISK', 'USD']);
    expect(gateway.requests.map((request) => [request.kind, request.arg])).toEqual([
      ['add', 'USD'],
    ]);
    gateway.next('add').release();
    await expect(adding).resolves.toBeNull();

    expect(gateway.server.currency).toBe('USD');
    expectAgreement(store, gateway.server);
  });

  it('falls back to the store currency, says so, and adds there', async () => {
    const gateway = fakeServer();
    const store = shop(gateway);
    gateway.next('init').release();
    await store.currency.start(async () => 'DE');

    const adding = store.cart.add(ADD);
    await settle();
    gateway.next('add').release(refusal('CART_CURRENCY_NOT_SOLD'));
    await settle();
    expect(store.currency.movedTo.value).toBe('ISK');
    gateway.next('add').release();
    await expect(adding).resolves.toBeNull();
    expectAgreement(store, gateway.server);
  });

  it('K4: with a cart, an add refusal withdraws nothing and is not retried', async () => {
    const gateway = fakeServer({ currency: 'EUR' });
    const store = shop(gateway, memoryPreference('EUR'));
    await opened(gateway, store);

    const adding = store.cart.add(ADD);
    await settle();
    gateway.next('add').release(refusal('CART_CURRENCY_NOT_SOLD'));
    await adding;
    await settle();

    expect(gateway.requests).toEqual([]);
    expect(store.currency.offered.value).toEqual(['ISK', 'EUR', 'USD']);
    expect(store.currency.movedTo.value).toBeNull();
    expectAgreement(store, gateway.server);
  });
});

describe('fifth review', () => {
  it('P1: a choice made while the first add creates the cart moves the new cart to it', async () => {
    const gateway = fakeServer();
    const store = shop(gateway);
    gateway.next('init').release();
    await store.currency.start(async () => 'DE');

    const adding = store.cart.add(ADD);
    await settle();
    store.currency.choose('USD');
    await settle();
    expect(store.preference.value).toBeNull();
    gateway.next('add').release();
    await adding;
    await settle();
    expect(gateway.requests.map((request) => [request.kind, request.arg])).toEqual([
      ['setCurrency', 'USD'],
    ]);
    gateway.next('setCurrency').release();
    await settle();

    expect(gateway.server.currency).toBe('USD');
    expect(store.preference.value).toBe('USD');
    expectAgreement(store, gateway.server);
  });

  it('P1: a choice made before the first read answers moves the cart that read finds', async () => {
    const gateway = fakeServer({ currency: 'ISK' });
    const store = shop(gateway);
    await store.currency.start(async () => null);
    store.currency.choose('EUR');
    await settle();
    gateway.next('init').release();
    await settle();
    gateway.next('setCurrency').release();
    await settle();

    expect(gateway.server.currency).toBe('EUR');
    expect(store.preference.value).toBe('EUR');
    expectAgreement(store, gateway.server);
  });

  it('P2: only the choice that was sent is withdrawn when it is refused', async () => {
    const gateway = fakeServer({ currency: 'ISK' });
    const store = shop(gateway);
    await opened(gateway, store);

    const adding = store.cart.add(ADD);
    await settle();
    store.currency.choose('EUR');
    store.currency.choose('USD');
    gateway.next('add').release();
    await adding;
    await settle();
    gateway.next('setCurrency').release(refusal('CART_CURRENCY_NOT_SOLD'));
    await settle();

    expect(store.currency.offered.value).toEqual(['ISK', 'EUR']);
    expectAgreement(store, gateway.server);
  });

  it('P3: a move to the currency the cart already has keeps the undo', async () => {
    const gateway = fakeServer({ currency: 'ISK', variants: ['v0', 'v1'] });
    const store = shop(gateway);
    await opened(gateway, store);
    const removing = store.cart.remove('line-v1');
    await settle();
    gateway.next('remove').release();
    await removing;

    store.currency.choose('ISK');
    await settle();
    expect(gateway.requests).toEqual([]);
    expect(store.cart.lastRemoved.value).not.toBeNull();
  });

  it('P4: after a failed first read, the read is tried again before the next write is sent', async () => {
    const gateway = fakeServer({ currency: 'EUR', variants: ['v0'] });
    const store = shop(gateway, memoryPreference('EUR'));
    gateway.next('init').release(OFFLINE);
    await settle();
    expect(store.cart.loadFailed.value).toBe(true);
    expect(store.cart.lines.value).toEqual([]);
    await store.currency.start(async () => null);

    const adding = store.cart.add(ADD);
    await settle();
    expect(gateway.requests.map((request) => request.kind)).toEqual(['init']);
    gateway.next('init').release();
    await settle();
    expect(store.cart.loadFailed.value).toBe(false);
    expect(store.cart.lines.value).toHaveLength(1);
    gateway.next('add').release();
    await adding;
    expectAgreement(store, gateway.server);
  });
});

describe('a move the server answers without moving', () => {
  it('writes no preference and stays with the cart', async () => {
    const gateway = fakeServer({ currency: 'ISK' });
    const store = shop(gateway);
    await opened(gateway, store);
    store.currency.choose('EUR');
    await settle();
    gateway.next('setCurrency').release(undefined, true);
    await settle();
    expect(store.preference.value).toBeNull();
    expectAgreement(store, gateway.server);
  });
});

describe('a cart that is remembered but could not be read', () => {
  it('(a) takes no currency move and saves no preference until Try again reads it', async () => {
    const gateway = fakeServer({ currency: 'ISK', variants: ['v0'] });
    const store = shop(gateway);
    gateway.next('init').release(OFFLINE);
    await settle();
    await store.currency.start(async () => null);
    expect(store.cart.loadState.value).toBe('unloaded');

    store.currency.choose('EUR');
    await settle();
    gateway.next('init').release(OFFLINE);
    await settle();
    expect(gateway.requests).toEqual([]);
    expect(store.preference.value).toBeNull();
    expect(store.cart.loadFailed.value).toBe(true);
    expect(store.currency.failure.value?.errorId).toBe('CART_NOT_LOADED');

    const retrying = store.cart.reload();
    gateway.next('init').release();
    await retrying;
    expect(store.cart.loadState.value).toBe('loaded');
    expect(store.cart.loadFailed.value).toBe(false);
    expectAgreement(store, gateway.server);

    store.currency.choose('EUR');
    await settle();
    gateway.next('setCurrency').release();
    await settle();
    expect(gateway.server.currency).toBe('EUR');
    expectAgreement(store, gateway.server);
  });

  it('(b) does not send an add when the read before it fails again', async () => {
    const gateway = fakeServer({ currency: 'ISK', variants: ['v0'] });
    const store = shop(gateway);
    gateway.next('init').release(OFFLINE);
    await settle();
    await store.currency.start(async () => null);

    const adding = store.cart.add(ADD);
    await settle();
    gateway.next('init').release(OFFLINE);
    const failure = await adding;

    expect(failure?.errorId).toBe('CART_NOT_LOADED');
    expect(gateway.requests).toEqual([]);
    expect(gateway.server.variants).toEqual(['v0']);
  });

  it('(c) only the newest read applies, and its success clears the failure', async () => {
    const gateway = fakeServer({ currency: 'ISK', variants: ['v0'] });
    const store = shop(gateway);
    gateway.next('init').release();
    await settle();
    await store.currency.start(async () => null);

    void store.cart.reload();
    const first = gateway.next('init');
    gateway.server.variants.push('v1');
    void store.cart.reload();
    gateway.next('init').release();
    await settle();
    first.release(OFFLINE);
    await settle();
    expect(store.cart.loadFailed.value).toBe(false);
    expect(store.cart.lines.value).toHaveLength(2);

    void store.cart.reload();
    const late = gateway.next('init');
    gateway.server.variants.push('v2');
    void store.cart.reload();
    gateway.next('init').release();
    await settle();
    late.release();
    await settle();
    expect(store.cart.lines.value).toHaveLength(3);
  });

  it('(d) a read that never answers fails after the timeout, and Add works again after Try again', async () => {
    vi.useFakeTimers();
    try {
      const gateway = fakeServer({ currency: 'ISK', variants: ['v0'] });
      const store = shop(gateway);
      await store.currency.start(async () => null);
      await vi.advanceTimersByTimeAsync(8000);
      expect(store.cart.loadFailed.value).toBe(true);
      expect(store.cart.pending.value).toBe(false);

      gateway.next('init');
      const retrying = store.cart.reload();
      gateway.next('init').release();
      await retrying;
      const adding = store.cart.add(ADD);
      await vi.advanceTimersByTimeAsync(0);
      gateway.next('add').release();
      await expect(adding).resolves.toBeNull();
      expectAgreement(store, gateway.server);
    } finally {
      vi.useRealTimers();
    }
  });
});
