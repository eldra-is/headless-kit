import { nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { createEldraClient, type EldraClient, type EldraHttpRequest } from '@eldrajs/sdk';
import {
  createGatewayStorefront,
  type StorefrontPrerenderHandle,
} from '../../app/storefront/gateway';
import { createVolatileRefresher, type VolatileRefresher } from '../../app/storefront/refresh';
import type {
  StorefrontProduct,
  StorefrontRoute,
  StorefrontSource,
  VolatileSnapshot,
} from '../../app/storefront/types';

/**
 * The prerender/refresh half of the gateway storefront: a result's first load runs under the
 * framework's keyed async data — awaited while a prerender renders, read back out of the payload
 * while the browser hydrates — and after hydration the page's results refresh *only* their
 * volatile values, in one batched read.
 *
 * Nuxt is nowhere in here on purpose. `gateway.ts` takes both abilities as a `StorefrontRuntime`
 * (`app/plugins/eldra-storefront.ts` implements them over `useAsyncData` and `app:mounted`), so
 * what a prerender does can be stated in a stub and asserted — which a `nuxi generate` run, with
 * no gateway credentials in this suite, cannot.
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

/** A product detail response in the gateway's own shape, with one variant. */
function detailRow(price: number): Record<string, unknown> {
  return {
    id: 'p-1',
    slug: 'merino-crew-sweater',
    title: 'Merino crew sweater',
    status: 'ACTIVE',
    variants: [{ id: 'v-1', sku: 'MCS-OAT-M', price, status: 'ACTIVE' }],
  };
}

/** One product list row, in the gateway's own shape. */
function listRow(
  id: string,
  price: number,
  options: { status?: string } = {}
): Record<string, unknown> {
  return {
    id,
    slug: id,
    title: `Product ${id}`,
    status: options.status ?? 'ACTIVE',
    minPrice: price,
    maxPrice: price,
    totalVariants: 1,
  };
}

const META = { page: 1, pageSize: 24, total: 2, totalPages: 1, rows: 2 };

interface FakeClient {
  client: EldraClient;
  detailReads: number;
  /** The `filter` token lists `client.catalog.listProducts` was called with, in order. */
  listFilters: string[][];
}

/** A client with no HTTP behind it, for the assertions that are about mapped values. */
function fakeClient(
  options: {
    detail?: () => Record<string, unknown>;
    list?: (filter: string[]) => Promise<Array<Record<string, unknown>>>;
    collectionProducts?: () => Array<Record<string, unknown>>;
  } = {}
): FakeClient {
  const state: FakeClient = {
    detailReads: 0,
    listFilters: [],
    client: {
      catalog: {
        getProduct: async () => {
          state.detailReads += 1;
          return options.detail?.() ?? detailRow(96);
        },
        listProducts: async (query: Record<string, unknown>) => {
          const filter = (query.filter ?? []) as string[];
          state.listFilters.push(filter);
          return { data: (await options.list?.(filter)) ?? [], meta: META };
        },
        listCollectionProducts: async () => ({
          data: options.collectionProducts?.() ?? [listRow('p-1', 10), listRow('p-2', 20)],
          meta: META,
        }),
      },
    } as unknown as EldraClient,
  };
  return state;
}

/** The volatile reads among a fake client's product-list calls. */
function volatileReads(calls: FakeClient): string[][] {
  return calls.listFilters.filter((filter) => filter[0]?.startsWith('id:in:') === true);
}

/**
 * The stub async-data provider: keyed, awaited, payload-backed — `useAsyncData` reduced to the
 * three things `gateway.ts` asks of it. A key already in `payload` is a hydrating browser, and its
 * loader is never called; anything else is a prerender, whose load `settleAll()` awaits the way
 * Nuxt awaits a page's async data before it writes the HTML.
 */
function asyncDataStub(payload: Record<string, unknown> = {}) {
  const inFlight: Array<Promise<unknown>> = [];
  const keys: string[] = [];
  return {
    keys,
    payload,
    async settleAll(): Promise<void> {
      while (inFlight.length > 0) await inFlight.shift();
      await nextTick();
    },
    prerender<T>(key: string, load: () => Promise<T | null>): StorefrontPrerenderHandle<T> {
      keys.push(key);
      if (key in payload) {
        const value = payload[key] as T | null;
        return { hydrated: value, settled: Promise.resolve({ data: value, error: null }) };
      }
      const settled = load().then(
        (data) => {
          payload[key] = data;
          return { data, error: null };
        },
        (caught: unknown) => ({ data: null, error: (caught as Error).message })
      );
      inFlight.push(settled);
      return { hydrated: null, settled };
    },
  };
}

/** The wiring `app/plugins/eldra-storefront.ts` does: one storefront, one page refresh. */
function wire(
  client: EldraClient,
  prerender?: <T>(key: string, load: () => Promise<T | null>) => StorefrontPrerenderHandle<T>
): { storefront: StorefrontSource; refresher: VolatileRefresher } {
  // The refresh runs when this spec says so, not on a schedule of its own. It reaches the
  // storefront declared below through the closure, exactly as the plugin's does.
  const refresher = createVolatileRefresher(
    (ids) => storefront.catalog.volatileByIds(ids),
    () => {}
  );
  const storefront = createGatewayStorefront(client, {
    route: fakeRoute(),
    runtime: { prerender, register: refresher.register },
  });
  return { storefront, refresher };
}

/** A few turns of the microtask/scheduler queue — long enough for a watcher to re-run a load. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 6; turn += 1) await nextTick();
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('gateway storefront — prerendered results', () => {
  it('awaits its load under a keyed async data, and is not pending once it has one', async () => {
    const ssr = asyncDataStub();
    const calls = fakeClient();
    const { storefront } = wire(calls.client, ssr.prerender);

    const result = storefront.catalog.product(ref('merino-crew-sweater'));
    // Nothing yet — this is the render the framework is about to wait on.
    expect(result.pending.value).toBe(true);
    expect(result.data.value).toBeNull();

    await ssr.settleAll();

    expect(result.data.value?.title).toBe('Merino crew sweater');
    expect(result.data.value?.price.amount).toBe(96);
    expect(result.pending.value).toBe(false);
    expect(result.error.value).toBeNull();
    // The key is the method plus its arguments, stable across renders of the same read.
    expect(ssr.keys).toEqual(['storefront:catalog.product:["merino-crew-sweater"]']);
  });

  it('keys a read by its arguments, sorting object keys so one read is one key', async () => {
    const ssr = asyncDataStub();
    const calls = fakeClient();
    const { storefront } = wire(calls.client, ssr.prerender);

    storefront.catalog.collectionProducts(
      ref({ slug: 'winter-knitwear' }),
      ref({ pageSize: 24, page: 1 })
    );
    storefront.catalog.related(ref('merino-crew-sweater'), 8);
    await ssr.settleAll();

    expect(ssr.keys).toEqual([
      'storefront:catalog.collectionProducts:[{"slug":"winter-knitwear"},{"page":1,"pageSize":24}]',
      'storefront:catalog.related:["merino-crew-sweater",8]',
    ]);
  });

  it('paints the payload’s own value while hydrating, without calling the gateway', async () => {
    const prerendered: StorefrontProduct = {
      handle: 'merino-crew-sweater',
      title: 'Merino crew sweater',
      url: '/products/merino-crew-sweater',
      featuredImage: null,
      images: [],
      options: [],
      categoryTrail: [],
      description: '',
      inventory: null,
      price: { amount: 96, compareAt: null },
      stock: 'in',
      available: true,
      variantId: 'v-1',
    };
    const hydrating = asyncDataStub({
      'storefront:catalog.product:["merino-crew-sweater"]': prerendered,
    });
    const calls = fakeClient();
    const { storefront } = wire(calls.client, hydrating.prerender);

    const result = storefront.catalog.product(ref('merino-crew-sweater'));
    // Synchronously — the browser's first render has to be the server's render.
    expect(result.data.value).toEqual(prerendered);
    expect(result.pending.value).toBe(false);

    await hydrating.settleAll();
    expect(calls.detailReads).toBe(0);
    expect(result.data.value).toEqual(prerendered);
  });

  it('loads the ordinary way for a result the runtime has nothing prerendered for', async () => {
    const calls = fakeClient();
    // A client navigation: the runtime answers `null`, and nothing is cached or awaited.
    const { storefront } = wire(calls.client, undefined);

    const result = storefront.catalog.product(ref('merino-crew-sweater'));
    await settle();

    expect(calls.detailReads).toBe(1);
    expect(result.data.value?.title).toBe('Merino crew sweater');
    expect(result.pending.value).toBe(false);
  });
});

describe('gateway storefront — the volatile refresh after hydration', () => {
  /**
   * Asserted at the URL the SDK actually sends: `filter` is the gateway's one repeatable
   * parameter, and the whole point of collecting the page's results is that they leave as one
   * request rather than one per block.
   */
  it('issues exactly one batched request for every result on the page', async () => {
    const urls: string[] = [];
    const client = createEldraClient({
      apiBaseUrl: 'https://api.example.test/api',
      orgId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      httpClient: (async (request: EldraHttpRequest) => {
        urls.push(request.url);
        const filters = new URL(request.url).searchParams.getAll('filter');
        if (filters.some((filter) => filter.startsWith('id:in:'))) return { data: [], meta: META };
        if (filters.some((filter) => filter.startsWith('slug:in:'))) {
          return { data: [listRow('p-3', 30), listRow('p-4', 40)], meta: META };
        }
        return { data: [listRow('p-1', 10), listRow('p-2', 20)], meta: META };
      }) as never,
    });
    const ssr = asyncDataStub();
    const { storefront, refresher } = wire(client, ssr.prerender);

    storefront.catalog.collectionProducts(
      ref({ slug: 'winter-knitwear' }),
      ref({ page: 1, pageSize: 24 })
    );
    storefront.catalog.byHandles(ref(['p-3', 'p-4']));
    await ssr.settleAll();
    const prerenderRequests = urls.length;

    await refresher.refresh();

    const refreshUrls = urls.slice(prerenderRequests);
    expect(refreshUrls).toHaveLength(1);
    expect(new URL(refreshUrls[0]!).searchParams.getAll('filter')).toEqual([
      'id:in:p-1,p-2,p-3,p-4',
    ]);
  });

  it('swaps only the volatile fields, and clears `revalidating` when it has', async () => {
    const answer = deferred<Array<Record<string, unknown>>>();
    const calls = fakeClient({ list: () => answer.promise });
    const ssr = asyncDataStub();
    const { storefront, refresher } = wire(calls.client, ssr.prerender);

    const grid = storefront.catalog.collectionProducts(
      ref({ slug: 'winter-knitwear' }),
      ref({ page: 1, pageSize: 24 })
    );
    await ssr.settleAll();
    const before = grid.data.value!.items[0]!;
    const untouched = grid.data.value!.items[1]!;
    expect(before.price.amount).toBe(10);
    expect(grid.revalidating.value.size).toBe(0);

    const running = refresher.refresh();
    // The prerendered value stays on screen while its replacement is in flight.
    expect([...grid.revalidating.value].sort()).toEqual(['price', 'stock']);
    expect(grid.data.value?.items[0]?.price.amount).toBe(10);

    answer.resolve([listRow('p-1', 12, { status: 'DRAFT' })]);
    await running;

    const after = grid.data.value!.items[0]!;
    expect(after.price.amount).toBe(12);
    expect(after.available).toBe(false);
    expect(after.stock).toBe('out');
    // Everything that is not volatile is still the prerendered value…
    expect(after.title).toBe(before.title);
    expect(after.url).toBe(before.url);
    expect(after.featuredImage).toBe(before.featuredImage);
    // …and a product the answer said nothing about is still the very same object.
    expect(grid.data.value?.items[1]).toBe(untouched);
    expect(grid.revalidating.value.size).toBe(0);
  });

  /**
   * P1's hand-off note: a detail product's `variantId` is a *variant's* id, which the batched
   * `id:in:` read (product ids) can never match. It refreshes through its own product read
   * instead, and stays out of the batch.
   */
  it('refreshes the detail product through `catalog.product`, not through the batch', async () => {
    let price = 96;
    const calls = fakeClient({ detail: () => detailRow(price), list: async () => [] });
    const ssr = asyncDataStub();
    const { storefront, refresher } = wire(calls.client, ssr.prerender);

    const detail = storefront.catalog.product(ref('merino-crew-sweater'));
    await ssr.settleAll();
    expect(calls.detailReads).toBe(1);

    price = 79;
    await refresher.refresh();

    expect(calls.detailReads).toBe(2);
    // No batched read at all: the page's only product is the detail one.
    expect(volatileReads(calls)).toEqual([]);
    expect(detail.data.value?.price.amount).toBe(79);
    expect(detail.data.value?.title).toBe('Merino crew sweater');
    expect(detail.revalidating.value.size).toBe(0);
  });

  it('drops an answer for data the result has already replaced', async () => {
    const answer = deferred<Array<Record<string, unknown>>>();
    const collection = { rows: () => [listRow('p-1', 10)] };
    const calls = fakeClient({
      list: () => answer.promise,
      collectionProducts: () => collection.rows(),
    });
    const ssr = asyncDataStub();
    const { storefront, refresher } = wire(calls.client, ssr.prerender);

    const opts = ref({ page: 1, pageSize: 24 });
    const grid = storefront.catalog.collectionProducts(ref({ slug: 'winter-knitwear' }), opts);
    await ssr.settleAll();

    const running = refresher.refresh();
    // The shopper pages the grid: the result reloads and answers with the live price, 120.
    collection.rows = () => [listRow('p-1', 120)];
    opts.value = { page: 2, pageSize: 24 };
    await settle();
    expect(grid.data.value?.items[0]?.price.amount).toBe(120);

    // …and only then does the refresh, issued against the data that is now gone, answer.
    answer.resolve([listRow('p-1', 90)]);
    await running;

    expect(grid.data.value?.items[0]?.price.amount).toBe(120);
  });

  it('keeps the prerendered values when the refresh fails, and clears `revalidating`', async () => {
    const answer = deferred<Array<Record<string, unknown>>>();
    const calls = fakeClient({ list: () => answer.promise });
    const ssr = asyncDataStub();
    const { storefront, refresher } = wire(calls.client, ssr.prerender);

    const grid = storefront.catalog.collectionProducts(
      ref({ slug: 'winter-knitwear' }),
      ref({ page: 1, pageSize: 24 })
    );
    await ssr.settleAll();

    const running = refresher.refresh();
    answer.reject(new Error('gateway unreachable'));
    await running;

    expect(grid.data.value?.items[0]?.price.amount).toBe(10);
    expect(grid.data.value?.items[1]?.price.amount).toBe(20);
    // A page never regresses to an error state for a value it can already show.
    expect(grid.error.value).toBeNull();
    expect(grid.revalidating.value.size).toBe(0);
  });

  it('refreshes once per page load, and not a result created after the batch', async () => {
    const calls = fakeClient({ list: async () => [listRow('p-1', 12)] });
    const ssr = asyncDataStub();
    const { storefront, refresher } = wire(calls.client, ssr.prerender);

    storefront.catalog.collectionProducts(
      ref({ slug: 'winter-knitwear' }),
      ref({ page: 1, pageSize: 24 })
    );
    await ssr.settleAll();

    await refresher.refresh();
    await refresher.refresh();
    const later = storefront.catalog.byHandles(ref(['p-3']));
    await refresher.refresh();
    await settle();

    expect(volatileReads(calls)).toHaveLength(1);
    expect(later.revalidating.value.size).toBe(0);
  });

  it('hands one batched answer to every result that took part in it', async () => {
    const seen: VolatileSnapshot[] = [];
    const calls = fakeClient({
      list: async (filter) =>
        filter[0]?.startsWith('slug:in:') === true
          ? [listRow('p-1', 10)]
          : [listRow('p-1', 11), listRow('p-2', 22)],
    });
    const ssr = asyncDataStub();
    const refresher = createVolatileRefresher(
      async (ids) => {
        const answer = await storefront.catalog.volatileByIds(ids);
        seen.push(...answer);
        return answer;
      },
      () => {}
    );
    const storefront = createGatewayStorefront(calls.client, {
      route: fakeRoute(),
      runtime: { prerender: ssr.prerender, register: refresher.register },
    });

    const grid = storefront.catalog.collectionProducts(
      ref({ slug: 'winter-knitwear' }),
      ref({ page: 1, pageSize: 24 })
    );
    const row = storefront.catalog.byHandles(ref(['p-1']));
    await ssr.settleAll();
    expect(row.data.value?.[0]?.price.amount).toBe(10);

    await refresher.refresh();

    expect(volatileReads(calls)).toEqual([['id:in:p-1,p-2']]);
    expect(seen.map((snapshot) => snapshot.id)).toEqual(['p-1', 'p-2']);
    // Both results took the same answer: the grid's `p-1` and the row's `p-1` cannot disagree.
    expect(grid.data.value?.items[0]?.price.amount).toBe(11);
    expect(row.data.value?.[0]?.price.amount).toBe(11);
  });
});
