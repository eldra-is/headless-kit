import { nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { createEldraClient, type EldraClient, type EldraHttpRequest } from '@eldrajs/sdk';
import {
  createGatewayStorefront,
  type StorefrontPrerenderHandle,
} from '../../app/storefront/gateway';
import { createVolatileRefresher, type VolatileRefresher } from '../../app/storefront/refresh';
import {
  prerenderThroughAsyncData,
  type KeyedAsyncData,
  type KeyedAsyncDataOptions,
} from '../../app/storefront/prerender';
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
    /** The inventory answer for the detail read. Omitted, there is no inventory service at all —
     *  which is the fail-soft case every other test here runs in. */
    stock?: () => Array<Record<string, unknown>>;
  } = {}
): FakeClient {
  const state: FakeClient = {
    detailReads: 0,
    listFilters: [],
    client: {
      inventory: {
        availability: async () => {
          if (options.stock === undefined) throw new Error('no inventory service');
          return { items: options.stock() };
        },
      },
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
        // Boxed: a payload that carries `null` is a read that answered "nothing", not one still
        // running, and that is the whole difference the result's first render turns on.
        return {
          answered: { data: value },
          settled: Promise.resolve({ data: value, error: null }),
        };
      }
      const settled = load().then(
        (data) => {
          payload[key] = data;
          return { data, error: null };
        },
        (caught: unknown) => ({ data: null, error: (caught as Error).message })
      );
      inFlight.push(settled);
      return { answered: null, settled };
    },
  };
}

/** The wiring `app/plugins/eldra-storefront.ts` does: one storefront, one page refresh. */
function wire(
  client: EldraClient,
  prerender?: <T>(key: string, load: () => Promise<T | null>) => StorefrontPrerenderHandle<T>,
  locale?: () => string | undefined
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
    locale,
  });
  return { storefront, refresher };
}

/**
 * A few turns of the microtask/scheduler queue — long enough for a watcher to re-run a load.
 *
 * The count is slack, not a guard: it has to exceed the await depth of the deepest read these tests
 * drive, which is `catalog.product` (the detail read, then the stock read and the category-tree read
 * in parallel, each of which fails over a fake client that offers neither service — and a rejection
 * caught and re-thrown costs turns of its own). Nothing here asserts on how many turns a read takes.
 */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 16; turn += 1) await nextTick();
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

  /**
   * **One read of one product in two languages is two keys.** The key is what the value travels to
   * the browser in, and Nuxt's payload plugin writes the destination's keys into
   * `nuxtApp.static.data` on every navigation while `useAsyncData` reuses an entry for a key it
   * has already seen — so a shared key would serve a shopper who switched language the data of the
   * language they left, and for the tick both pages are mounted the two would fight over one
   * entry. The unprefixed site keeps the key it always had, so no existing artifact's payload is
   * invalidated.
   */
  it('keys a read by its locale as well, so two languages are two payload entries', async () => {
    const icelandic = asyncDataStub();
    wire(fakeClient().client, icelandic.prerender, () => 'is-IS').storefront.catalog.product(
      ref('merino-crew-sweater')
    );
    await icelandic.settleAll();

    const english = asyncDataStub();
    wire(fakeClient().client, english.prerender).storefront.catalog.product(
      ref('merino-crew-sweater')
    );
    await english.settleAll();

    expect(icelandic.keys).toEqual(['storefront:catalog.product:["merino-crew-sweater","is-IS"]']);
    expect(english.keys).toEqual(['storefront:catalog.product:["merino-crew-sweater"]']);
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
      productId: 'p-1',
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
   * The detail page is the one result whose stock line is about a *variant*, so it needs the
   * variant-level inventory the batched `id:in:` read (the products list) carries none of. It
   * refreshes through its own product read instead, and stays out of the batch.
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

  /**
   * The prerender half of the inventory read: the generated HTML carries the stock the product had
   * at build, and the refresh after mount is what corrects it. A page prerendered while the last
   * one was on the shelf has to stop saying "In stock, ready to ship" once it is gone.
   */
  it('corrects a prerendered stock line from inventory on the refresh after mount', async () => {
    let onHand = 4;
    const calls = fakeClient({
      detail: () => detailRow(96),
      list: async () => [],
      stock: () => [
        {
          variantId: 'v-1',
          available: onHand > 0,
          allowBackorder: false,
          availableQuantity: onHand,
        },
      ],
    });
    const ssr = asyncDataStub();
    const { storefront, refresher } = wire(calls.client, ssr.prerender);

    const detail = storefront.catalog.product(ref('merino-crew-sweater'));
    await ssr.settleAll();
    expect(detail.data.value?.stock).toBe('in');
    expect(detail.data.value?.inventory).toBe(4);

    onHand = 0;
    await refresher.refresh();

    expect(detail.data.value?.stock).toBe('out');
    expect(detail.data.value?.inventory).toBe(0);
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

  it('refreshes each result once, and asks nothing when nothing is pending', async () => {
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
    await settle();

    expect(volatileReads(calls)).toHaveLength(1);
  });

  /**
   * The defect a real `nuxi generate` + browser run found (`test/prerenderRefresh.browser.spec.ts`):
   * a theme's blocks are lazily imported components, so the ones whose chunk lands after the app
   * has mounted create their results after the first batch has already gone out. A refresher that
   * ran once per page dropped them — the product page's carousel never refreshed a price and never
   * drew the refresh treatment, because `product-detail` had opened and closed the page's only
   * batch a tick earlier.
   */
  it('opens another batch for a result that registered after the last one flushed', async () => {
    // Rows by the ids asked for, so a late result can be about a different product than the first
    // batch was — which is what makes a second batch the right answer rather than a duplicate one.
    const calls = fakeClient({
      list: async (filter) =>
        (filter[0]?.replace(/^\w+:in:/, '').split(',') ?? []).map((id) => listRow(id, 12)),
    });
    const ssr = asyncDataStub();
    const { storefront, refresher } = wire(calls.client, ssr.prerender);

    storefront.catalog.byHandles(ref(['p-1']));
    await ssr.settleAll();
    await refresher.refresh();
    expect(volatileReads(calls)).toEqual([['id:in:p-1']]);

    const late = storefront.catalog.byHandles(ref(['p-2']));
    await ssr.settleAll();
    await refresher.refresh();
    await settle();

    expect(volatileReads(calls)).toEqual([['id:in:p-1'], ['id:in:p-2']]);
    expect(late.data.value?.[0]?.price.amount).toBe(12);
  });

  /**
   * The defect the deployed product page showed with a plain request log: the detail read and the
   * `id:in` batch both went out twice, 35 ms apart, with identical ids — two bursts asking again
   * about products the first burst had already re-read. A page load asks about a product once,
   * whichever burst the result that shows it happens to arrive in.
   */
  it('never asks twice about a product another result has already had refreshed', async () => {
    const calls = fakeClient({
      list: async (filter) =>
        (filter[0]?.replace(/^\w+:in:/, '').split(',') ?? []).map((id) => listRow(id, 7)),
    });
    const ssr = asyncDataStub();
    const { storefront, refresher } = wire(calls.client, ssr.prerender);

    const grid = storefront.catalog.collectionProducts(
      ref({ slug: 'winter-knitwear' }),
      ref({ page: 1, pageSize: 24 })
    );
    await ssr.settleAll();
    await refresher.refresh();
    expect(volatileReads(calls)).toEqual([['id:in:p-1,p-2']]);

    // A block whose chunk landed later, showing the same two products.
    const late = storefront.catalog.byHandles(ref(['p-1', 'p-2']));
    await ssr.settleAll();
    await refresher.refresh();
    await settle();

    expect(volatileReads(calls)).toEqual([['id:in:p-1,p-2']]);
    // …and it is not left showing the stale values either: the answer that already arrived for
    // those ids is folded into it, so the two blocks cannot paint two different prices.
    expect(late.data.value?.map((item) => item.price.amount)).toEqual([7, 7]);
    expect(grid.data.value?.items.map((item) => item.price.amount)).toEqual([7, 7]);
  });

  it('refreshes a result once even when it registers twice', async () => {
    // Straight at the collector: a block that creates its results twice (a remount, a second
    // render pass) hands the same entry over twice, and that is one thing to ask about, not two.
    const reads: string[][] = [];
    const refresher = createVolatileRefresher(
      async (ids) => {
        reads.push(ids);
        return ids.map((id) => ({
          id,
          price: { amount: 5, compareAt: null },
          available: true,
          stock: 'in' as const,
        }));
      },
      () => {}
    );
    let written = 0;
    const entry = {
      read: () => [{ handle: 'p-1', productId: 'p-1', price: { amount: 4, compareAt: null } }],
      write: () => {
        written += 1;
      },
      setRevalidating: () => {},
      token: () => 1,
    };
    refresher.register(entry);
    refresher.register(entry);
    await refresher.refresh();
    await refresher.refresh();

    expect(reads).toEqual([['p-1']]);
    expect(written).toBe(1);
  });

  /**
   * The product page and a grid on the same page are about the same product id, and the batched read
   * cannot answer what the product page needs: the products list carries no inventory, so an answer
   * folded in from it would leave the page's stock line on the value it was built with. Before the
   * ids were named for what they are this fell out by accident — a detail product's volatile id was a
   * *variant's*, which no list read matched — and the first page to hit it was a client-side
   * navigation from a collection page, where the grid had already claimed that product.
   */
  it('still reads the detail product for itself when a card list already asked about it', async () => {
    const calls = fakeClient({
      detail: () => detailRow(96),
      list: async () => [listRow('p-1', 96)],
      stock: () => [
        { variantId: 'v-1', available: false, allowBackorder: false, availableQuantity: 0 },
      ],
    });
    const ssr = asyncDataStub();
    const { storefront, refresher } = wire(calls.client, ssr.prerender);

    // The grid registers first, exactly as a collection page's own refresh does.
    const grid = storefront.catalog.byHandles(ref(['p-1']));
    const detail = storefront.catalog.product(ref('merino-crew-sweater'));
    await ssr.settleAll();
    const before = calls.detailReads;

    await refresher.refresh();

    expect(calls.detailReads - before).toBe(1);
    expect(detail.data.value?.stock).toBe('out');
    expect(detail.data.value?.inventory).toBe(0);
    // …and the grid still got its own batched answer, unaffected.
    expect(volatileReads(calls)).toEqual([['id:in:p-1']]);
    expect(grid.data.value?.[0]?.price.amount).toBe(96);
  });

  it('lets two results that need the same detail read share one request', async () => {
    const calls = fakeClient();
    const ssr = asyncDataStub();
    const { storefront, refresher } = wire(calls.client, ssr.prerender);

    const handle = ref('merino-crew-sweater');
    const first = storefront.catalog.product(handle);
    const second = storefront.catalog.product(handle);
    await ssr.settleAll();
    const beforeRefresh = calls.detailReads;

    await refresher.refresh();
    await settle();

    expect(calls.detailReads - beforeRefresh).toBe(1);
    expect(first.data.value?.price.amount).toBe(96);
    expect(second.data.value?.price.amount).toBe(96);
  });

  /**
   * The other half of that rule: batching by burst is only safe because a result created *after*
   * hydration never joins one. It has just read the live values itself, and the runtime tells it
   * so by prerendering nothing for it (`app/plugins/eldra-storefront.ts` returns `null` off the
   * hydrating render).
   */
  it('never batches a result the runtime prerendered nothing for', async () => {
    const calls = fakeClient({ list: async () => [listRow('p-1', 12)] });
    const { storefront, refresher } = wire(calls.client);

    const later = storefront.catalog.byHandles(ref(['p-1']));
    await settle();
    await refresher.refresh();
    await settle();

    expect(later.data.value?.[0]?.price.amount).toBe(12);
    expect(volatileReads(calls)).toHaveLength(0);
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

/**
 * A stand-in for Nuxt 4.5's `useAsyncData` on a **hydrating client**, modelling the three
 * behaviours `app/storefront/prerender.ts` exists to survive
 * (`nuxt/dist/app/composables/asyncData.js`):
 *
 *   * hydration **short-circuits** — status goes straight to `success` and the handler never runs
 *     — as soon as `data.value !== undefined`, which is exactly what an `options.default` makes
 *     true before anything has loaded. The stub honours a `default` it is passed for that reason:
 *     the adapter must not pass one, and this is what says so.
 *   * on a payload miss the first fetch is **deferred to the component's `onBeforeMount`**
 *     (`flushBeforeMount()` here — Vue runs it in the same synchronous mount pass, before any
 *     microtask, so it always precedes the adapter's own recovery), and the handle's promise
 *     resolves with the load not yet run and the status still `idle`.
 *   * a second registration of the same key runs the handler **again** under Nuxt's default
 *     `dedupe: 'cancel'`, and joins the request already in flight under `dedupe: 'defer'`.
 */
function nuxtAsyncDataStub(payload: Record<string, unknown> = {}) {
  interface Entry {
    data: { value: unknown };
    error: { value: unknown };
    status: { value: string };
    inFlight: Promise<unknown> | null;
  }
  const entries = new Map<string, Entry>();
  const beforeMount: Array<() => void> = [];
  let handlerCalls = 0;

  function run(entry: Entry, load: () => Promise<unknown>): Promise<unknown> {
    handlerCalls += 1;
    entry.status.value = 'pending';
    const request = load().then(
      (value) => {
        entry.data.value = value;
        entry.status.value = 'success';
        entry.inFlight = null;
      },
      (caught: unknown) => {
        entry.error.value = caught;
        entry.status.value = 'error';
        entry.inFlight = null;
      }
    );
    entry.inFlight = request;
    return request;
  }

  return {
    handlerCalls: () => handlerCalls,
    /** Vue's `onBeforeMount`, where Nuxt put the deferred first fetch. Synchronous, as it is. */
    flushBeforeMount(): void {
      for (const deferred of beforeMount.splice(0)) deferred();
    },
    asyncData<T>(
      key: string,
      load: () => Promise<T | null>,
      options: KeyedAsyncDataOptions
    ): KeyedAsyncData<T> {
      const fallback = (options as { default?: () => unknown }).default;
      let entry = entries.get(key);
      if (entry === undefined) {
        entry = {
          data: { value: key in payload ? payload[key] : fallback?.() },
          error: { value: null },
          status: { value: 'idle' },
          inFlight: null,
        };
        entries.set(key, entry);
      }
      const current = entry;
      const execute = (): Promise<unknown> =>
        current.inFlight !== null && options.dedupe === 'defer'
          ? current.inFlight
          : run(current, load);
      let settled: Promise<unknown>;
      if (current.data.value !== undefined) {
        // Hydrating with a value in hand: nothing runs, ever.
        current.status.value = 'success';
        settled = Promise.resolve();
      } else if (current.inFlight !== null) {
        settled = execute();
      } else {
        beforeMount.push(() => void execute());
        settled = Promise.resolve();
      }
      return {
        data: current.data as { value: T | null | undefined },
        error: current.error,
        status: current.status,
        execute,
        settled,
      };
    },
  };
}

describe('gateway storefront — prerendering through Nuxt’s keyed async data', () => {
  it('fetches on the client when the payload has no value for the key', async () => {
    const stub = nuxtAsyncDataStub();
    const calls = fakeClient();
    const { storefront } = wire(calls.client, (key, load) =>
      prerenderThroughAsyncData(stub.asyncData, key, load)
    );

    const result = storefront.catalog.product(ref('merino-crew-sweater'));
    stub.flushBeforeMount();
    await settle();

    // A `default` here would have made Nuxt call this a hydration hit before anything ran, and the
    // page would sit at `pending` with no data and no request for the rest of its life.
    expect(stub.handlerCalls()).toBe(1);
    expect(calls.detailReads).toBe(1);
    expect(result.data.value?.title).toBe('Merino crew sweater');
    expect(result.pending.value).toBe(false);
    expect(result.loading.value).toBe(false);
  });

  it('runs the deferred load itself when nothing else has', async () => {
    const stub = nuxtAsyncDataStub();
    const calls = fakeClient();
    const { storefront } = wire(calls.client, (key, load) =>
      prerenderThroughAsyncData(stub.asyncData, key, load)
    );

    // No `flushBeforeMount()`: the handle settles `idle`, with the load still waiting.
    const result = storefront.catalog.product(ref('merino-crew-sweater'));
    await settle();

    expect(calls.detailReads).toBe(1);
    expect(result.data.value?.title).toBe('Merino crew sweater');
    expect(result.pending.value).toBe(false);
  });

  it('costs one request when two results read the same key', async () => {
    const stub = nuxtAsyncDataStub();
    const calls = fakeClient();
    const { storefront } = wire(calls.client, (key, load) =>
      prerenderThroughAsyncData(stub.asyncData, key, load)
    );

    const first = storefront.catalog.product(ref('merino-crew-sweater'));
    const second = storefront.catalog.product(ref('merino-crew-sweater'));
    stub.flushBeforeMount();
    await settle();

    expect(stub.handlerCalls()).toBe(1);
    expect(calls.detailReads).toBe(1);
    expect(first.data.value?.title).toBe('Merino crew sweater');
    expect(second.data.value?.title).toBe('Merino crew sweater');
  });

  /**
   * The state a prerendered page for a discontinued product hydrates into. The server's read
   * answered `null` and the page says so; the browser must start from that same answer, not from
   * "still loading" — the block's not-found line and its loading line are different markup, and Vue
   * would report the mismatch and repaint.
   */
  it('hydrates a payload’s settled empty answer as answered, not as pending', async () => {
    const stub = nuxtAsyncDataStub({ 'storefront:catalog.product:["gone-for-good"]': null });
    const calls = fakeClient();
    const { storefront } = wire(calls.client, (key, load) =>
      prerenderThroughAsyncData(stub.asyncData, key, load)
    );

    const result = storefront.catalog.product(ref('gone-for-good'));

    // Synchronously, before any tick: settled, empty, and nothing in flight.
    expect(result.data.value).toBeNull();
    expect(result.pending.value).toBe(false);
    expect(result.loading.value).toBe(false);

    stub.flushBeforeMount();
    await settle();

    expect(stub.handlerCalls()).toBe(0);
    expect(calls.detailReads).toBe(0);
    expect(result.data.value).toBeNull();
    expect(result.pending.value).toBe(false);
    expect(result.loading.value).toBe(false);
    expect(result.error.value).toBeNull();
  });

  it('takes the payload’s value and runs nothing at all', async () => {
    const stub = nuxtAsyncDataStub({
      'storefront:catalog.product:["merino-crew-sweater"]': { title: 'From the payload' },
    });
    const calls = fakeClient();
    const { storefront } = wire(calls.client, (key, load) =>
      prerenderThroughAsyncData(stub.asyncData, key, load)
    );

    const result = storefront.catalog.product(ref('merino-crew-sweater'));
    stub.flushBeforeMount();
    await settle();

    expect(stub.handlerCalls()).toBe(0);
    expect(calls.detailReads).toBe(0);
    expect(result.data.value?.title).toBe('From the payload');
  });
});

describe('gateway storefront — `loading`, and who is allowed to write', () => {
  it('is true for a reload over data the page already has, while `pending` stays false', async () => {
    const answers = [[listRow('p-1', 10)], [listRow('p-1', 20)]];
    const calls = fakeClient({ collectionProducts: () => answers.shift() ?? [] });
    const ssr = asyncDataStub();
    const { storefront } = wire(calls.client, ssr.prerender);

    const opts = ref({ page: 1, pageSize: 24 });
    const grid = storefront.catalog.collectionProducts(ref({ slug: 'winter-knitwear' }), opts);
    expect(grid.loading.value).toBe(true);
    await ssr.settleAll();
    expect(grid.loading.value).toBe(false);
    expect(grid.pending.value).toBe(false);

    opts.value = { page: 2, pageSize: 24 };
    await nextTick();
    // A read is in flight over a value the page is already showing: a spinner, never a skeleton.
    expect(grid.loading.value).toBe(true);
    expect(grid.pending.value).toBe(false);
    expect(grid.data.value?.items[0]?.price.amount).toBe(10);

    await settle();
    expect(grid.loading.value).toBe(false);
    expect(grid.pending.value).toBe(false);
    expect(grid.data.value?.items[0]?.price.amount).toBe(20);
  });

  it('stops being pending when the read answers nothing at all', async () => {
    const ssr = asyncDataStub();
    const calls = fakeClient();
    const { storefront } = wire(calls.client, ssr.prerender);

    // No handle: the read answers `null`, which is an answer — "no such product" — and a block
    // that kept drawing a skeleton over it would never show its empty state.
    const result = storefront.catalog.product(ref(null));
    await ssr.settleAll();

    expect(result.data.value).toBeNull();
    expect(result.pending.value).toBe(false);
    expect(result.loading.value).toBe(false);
    expect(result.error.value).toBeNull();
  });

  /**
   * `refresh()` is called from an event handler, outside any watcher, so nothing ever aborts its
   * controller: without the generation guard its answer lands whenever the network returns it and
   * overwrites the newer read the shopper actually asked for.
   */
  it('lets a slow manual refresh lose to the reload that overtook it', async () => {
    const slow = deferred<Array<Record<string, unknown>>>();
    // Answered in call order — the prerender, then the manual refresh, then the reload — so the
    // slow one is pinned to the manual refresh whatever the two of them do afterwards.
    const answers: Array<() => Promise<Array<Record<string, unknown>>>> = [
      async () => [listRow('p-1', 10)],
      () => slow.promise,
      async () => [listRow('p-1', 120)],
    ];
    const client = {
      catalog: {
        listCollectionProducts: async () => ({
          data: await (answers.shift() ?? (async () => []))(),
          meta: META,
        }),
      },
    } as unknown as EldraClient;
    const ssr = asyncDataStub();
    const { storefront } = wire(client, ssr.prerender);

    const opts = ref({ page: 1, pageSize: 24 });
    const grid = storefront.catalog.collectionProducts(ref({ slug: 'winter-knitwear' }), opts);
    await ssr.settleAll();
    expect(grid.data.value?.items[0]?.price.amount).toBe(10);

    // A manual refresh that will take its time…
    const manual = grid.refresh();
    // …and, while it is out, the shopper pages the grid, which answers first.
    opts.value = { page: 2, pageSize: 24 };
    await settle();
    expect(grid.data.value?.items[0]?.price.amount).toBe(120);

    slow.resolve([listRow('p-1', 90)]);
    await manual;
    await settle();

    expect(grid.data.value?.items[0]?.price.amount).toBe(120);
    expect(grid.loading.value).toBe(false);
  });
});
