/**
 * `useEldraPage()`'s reusable projection, on both kinds of route.
 *
 * A static route resolves a `page` and no `template`; a dynamic route resolves
 * a `template` (plus the routed `entry`) and no `page` — see `resolveRoute.ts`.
 * Core attaches `reusableComponentProjection` to whichever document the read
 * returned, so the composable has to look at both, and the value it hands
 * `EldraLayout` must be the one that belongs to the document being rendered:
 * `@eldrajs/theme-core`'s expansion refuses a projection carrying a binding the
 * document does not place (`COMPONENT_STALE`), so a page's projection on a
 * template route — or the two merged — fails the layout closed.
 *
 * The route resolver and the Nuxt data layer are mocked; this is about the
 * composable's own wiring, not about the gateway (`locale.spec.ts` and
 * `catalogRoutes.spec.ts` cover that).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

type ResolvedLike = {
  page: unknown;
  template: unknown;
  entry: unknown;
  catalog: unknown;
};

const EMPTY: ResolvedLike = { page: null, template: null, entry: null, catalog: null };

const state = vi.hoisted(() => ({
  resolved: { page: null, template: null, entry: null, catalog: null } as unknown,
  path: '/products/merino-crew',
  /** The key and `watch` sources the composable handed `useAsyncData`, last call. */
  asyncData: { key: (): string => '', watch: [] as Array<() => unknown> },
  /** How many times the composable reached the **gateway** resolver. */
  resolverCalls: 0,
  /** Studio's bridge, as `useEldra()` reports it. */
  previewActive: false,
  /** The build's prerendered route list, as `staticRoutes.ts` reports it — `null` for a build
   *  that ships none (a dev server, an SSR deployment). */
  prerendered: null as ReadonlySet<string> | null,
  /** Every route payload the build wrote, keyed by path; what `loadPayload` answers with. */
  payloads: {} as Record<string, { data: Record<string, unknown> }>,
  /** Nuxt's own two data caches, as the payload plugin leaves them for a navigation. */
  nuxtApp: {
    isHydrating: false,
    payload: { data: {} as Record<string, unknown> },
    static: { data: {} as Record<string, unknown> },
  },
  /** Every `loadPayload` the composable asked for. */
  payloadsLoaded: [] as string[],
}));

vi.mock('nuxt/app', () => ({
  useRoute: () => ({
    get path() {
      return state.path;
    },
  }),
  useRouter: () => ({
    currentRoute: {
      get value() {
        return { path: state.path };
      },
    },
  }),
  useRuntimeConfig: () => ({
    public: {
      eldra: { pageSchema: 'page', routeTemplateSchema: 'route-template', locale: null },
    },
  }),
  clearNuxtData: () => {},
  loadPayload: (path: string) => {
    state.payloadsLoaded.push(path);
    return Promise.resolve(state.payloads[path] ?? null);
  },
  /**
   * Nuxt's own two behaviours around `getCachedData`, and nothing else
   * (`nuxt/dist/app/composables/asyncData.js`): a cached value means the handler never runs, and
   * the entry starts settled rather than pending — which is the whole of "a static navigation
   * shows no loading state".
   */
  useAsyncData: (
    key: unknown,
    handler: () => Promise<unknown>,
    options?: {
      default?: () => unknown;
      watch?: Array<() => unknown>;
      getCachedData?: (key: string, nuxtApp: unknown, ctx: { cause: string }) => unknown;
    }
  ) => {
    state.asyncData = {
      key: key as () => string,
      watch: options?.watch ?? [],
    };
    const resolvedKey = typeof key === 'function' ? (key as () => string)() : (key as string);
    const cached = options?.getCachedData?.(resolvedKey, state.nuxtApp, { cause: 'initial' });
    const data = ref(cached ?? options?.default?.() ?? null);
    const pending = ref(cached === undefined);
    if (cached === undefined) {
      void Promise.resolve(handler()).then((value) => {
        data.value = value;
        pending.value = false;
      });
    }
    return { data, pending };
  },
}));

vi.mock('@eldrajs/theme-vue', () => ({
  useEldra: () => ({
    client: {},
    preview: {
      get active() {
        return state.previewActive;
      },
      locale: null,
      drafts: {},
      draftSchemaApiIds: {},
      revision: 0,
      refreshRevision: 0,
    },
  }),
}));

vi.mock('../src/runtime/resolveRoute', () => ({
  EMPTY_ELDRA_ROUTE: EMPTY,
  resolveEldraRoute: () => {
    state.resolverCalls += 1;
    return Promise.resolve(state.resolved);
  },
}));

// The manifest read itself is a browser fact (`src/runtime/staticRoutes.ts` answers `null` off a
// browser, which is the whole of its dev/SSR guard); these specs are about what `useEldraPage`
// does with the answer, so the answer is set here and proven end to end by the starter's
// generate-level browser harness.
vi.mock('../src/runtime/staticRoutes', () => ({
  knownPrerenderedRoutes: () => state.prerendered,
  prerenderedRoutes: () => Promise.resolve(state.prerendered),
}));

const PROJECTION = (placementId: string): Record<string, unknown> => ({
  bindings: [
    {
      placementId,
      componentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      siteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      revision: 2,
    },
  ],
  revisions: [
    {
      componentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      siteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      revision: 2,
      document: {
        version: 1,
        root: {
          id: 'component-root',
          type: 'flex',
          layout: { direction: { normal: 'column' } },
          children: [{ id: 'component-header', type: 'block', entryId: 'header-entry' }],
        },
      },
    },
  ],
});

async function projectionFor(resolved: ResolvedLike): Promise<unknown> {
  state.resolved = resolved;
  const { useEldraPage } = await import('../src/runtime/composables/useEldraPage');
  const { reusableComponentProjection } = useEldraPage();
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
  return reusableComponentProjection.value;
}

const templateDoc = (projection?: Record<string, unknown>) => ({
  id: 'rt-product',
  data: {
    title: 'Product',
    layout: {
      version: 1,
      root: {
        id: 'template-root',
        type: 'flex',
        layout: { direction: { normal: 'column' } },
        children: [
          {
            id: 'role-header',
            type: 'reusable',
            componentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          },
        ],
      },
    },
    blocks: [{ id: 'header-entry', schemaApiId: 'navigation', data: { brand: 'Starter' } }],
  },
  ...(projection === undefined ? {} : { reusableComponentProjection: projection }),
});

describe('useEldraPage reusable projection', () => {
  it('exposes the template document’s projection on a route-template route', async () => {
    const projection = PROJECTION('role-header');

    await expect(
      projectionFor({
        page: null,
        template: templateDoc(projection),
        entry: { id: 'prod-merino', data: { title: 'Merino crew' } },
        catalog: { kind: 'product', slug: 'merino-crew' },
      })
    ).resolves.toEqual(projection);
  });

  it('still exposes the page document’s projection on a static route', async () => {
    const projection = PROJECTION('page-header');

    await expect(
      projectionFor({
        ...EMPTY,
        page: {
          id: 'p-home',
          data: { title: 'Home', blocks: [] },
          reusableComponentProjection: projection,
        },
      })
    ).resolves.toEqual(projection);
  });

  it('carries no projection for a template read that has none', async () => {
    await expect(
      projectionFor({ ...EMPTY, template: templateDoc(), entry: null })
    ).resolves.toBeUndefined();
  });

  it('never merges a page projection into a template route’s', async () => {
    // Both documents present is not a shape `resolveRoute` produces, but it is
    // the shape a naive merge would be written against — and a merged
    // projection is what `COMPONENT_STALE` refuses. The page's wins outright
    // when there is a page; the template's is never added to it.
    const pageProjection = PROJECTION('page-header');
    const templateProjection = PROJECTION('role-header');

    await expect(
      projectionFor({
        ...EMPTY,
        page: {
          id: 'p-home',
          data: { title: 'Home', blocks: [] },
          reusableComponentProjection: pageProjection,
        },
        template: templateDoc(templateProjection),
      })
    ).resolves.toEqual(pageProjection);
  });
});

/**
 * A generated site is prerendered at `/products/x` and served by the deployed host at
 * `/products/x/` (a 308 — see `src/runtime/routePath.ts`), so Nuxt moves the router between those
 * two spellings while the page hydrates. The composable must call that one route: its async-data
 * key already did, and its `watch` sources must agree with the key, or the same key is resolved a
 * second time — `pending` back to true, the block tree torn down and rebuilt around the answer.
 */
describe('useEldraPage route identity', () => {
  it('reads the same key and the same watch sources for a path with and without a trailing slash', async () => {
    state.resolved = EMPTY;
    const { useEldraPage } = await import('../src/runtime/composables/useEldraPage');

    state.path = '/products/merino-crew';
    useEldraPage();
    const bare = {
      key: state.asyncData.key(),
      watched: state.asyncData.watch.map((source) => source()),
    };

    state.path = '/products/merino-crew/';
    const slashed = {
      key: state.asyncData.key(),
      watched: state.asyncData.watch.map((source) => source()),
    };

    expect(slashed).toEqual(bare);
    expect(bare.watched).not.toEqual([]); // the sources exist at all
    state.path = '/products/merino-crew';
  });
});

/**
 * A generated site ships the list of routes it prerendered, and that list — not the gateway — is
 * what a browser on a static build resolves against.
 *
 * Two answers come out of it, and both are answers the gateway was being asked for: a route in the
 * build has its resolution in the payload Nuxt has already fetched, and a route not in the build
 * does not exist. Neither may cost a request, and neither may make the page pending: the starter's
 * `[...slug].vue` renders its loading shell for exactly as long as `pending` is true.
 *
 * Studio and the dev server are the exceptions, and they are the reason the manifest is consulted
 * rather than trusted blindly — a draft route is not in any build.
 */
describe('useEldraPage static-first resolution', () => {
  const PATH = '/products/merino-crew';
  const KEY = `eldra-page:${PATH}`;
  const BUILT: ResolvedLike = {
    page: null,
    template: { id: 'rt-product', data: { title: 'Product', blocks: [] } },
    entry: { id: 'prod-merino', data: { title: 'Merino crew' } },
    catalog: { kind: 'product', slug: 'merino-crew' },
  };

  beforeEach(() => {
    state.path = PATH;
    state.resolved = EMPTY;
    state.resolverCalls = 0;
    state.previewActive = false;
    state.prerendered = null;
    state.payloads = {};
    state.payloadsLoaded = [];
    state.nuxtApp.isHydrating = false;
    state.nuxtApp.payload.data = {};
    state.nuxtApp.static.data = {};
  });

  type Page = ReturnType<typeof import('../src/runtime/composables/useEldraPage').useEldraPage>;

  /**
   * The composable's state, plus **what it was in the same synchronous turn it was created in**.
   * "No loading state on a static navigation" is a claim about that turn and nothing later: a
   * `pending` that settles a microtask afterwards is still a render with the loading shell in it,
   * and every assertion made after an `await` would pass anyway.
   */
  async function pageFor(): Promise<{ page: Page; settledAtSetup: boolean }> {
    const { useEldraPage } = await import('../src/runtime/composables/useEldraPage');
    const page = useEldraPage();
    const settledAtSetup = page.pending.value === false;
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
    return { page, settledAtSetup };
  }

  it('renders a prerendered route straight from the payload Nuxt already loaded', async () => {
    state.prerendered = new Set([PATH]);
    // Nuxt's payload plugin writes the destination's payload into `static.data` in
    // `router.beforeResolve`, before the page component exists.
    state.nuxtApp.static.data[KEY] = BUILT;

    const {
      page: { entry, pending },
      settledAtSetup,
    } = await pageFor();

    expect(entry.value).toEqual(BUILT.entry);
    expect(settledAtSetup).toBe(true);
    expect(pending.value).toBe(false);
    expect(state.resolverCalls).toBe(0);
  });

  it('loads the route payload itself when it is not already in memory, still without the gateway', async () => {
    state.prerendered = new Set([PATH]);
    state.payloads[PATH] = { data: { [KEY]: BUILT } };

    const {
      page: { entry },
    } = await pageFor();

    expect(entry.value).toEqual(BUILT.entry);
    expect(state.payloadsLoaded).toEqual([PATH]);
    expect(state.resolverCalls).toBe(0);
  });

  it('answers a route the build does not contain as not found, with no request and no pending', async () => {
    state.prerendered = new Set(['/', '/404', '/products/ash-glaze-mug']);

    const {
      page: { page, template, pending },
      settledAtSetup,
    } = await pageFor();

    // Synchronously, in the turn the page component was created in — not one microtask later,
    // which is still a render of the loading shell.
    expect(settledAtSetup).toBe(true);
    expect(page.value).toBeNull();
    expect(template.value).toBeNull();
    expect(pending.value).toBe(false);
    expect(state.resolverCalls).toBe(0);
  });

  it('still resolves through the gateway in Studio, where the route may be a draft', async () => {
    state.prerendered = new Set(['/', '/404']);
    state.previewActive = true;
    state.resolved = BUILT;

    const {
      page: { entry },
      settledAtSetup,
    } = await pageFor();

    expect(entry.value).toEqual(BUILT.entry);
    expect(state.resolverCalls).toBeGreaterThan(0);
    // And it did not shortcut to "no such route" on the way: a build manifest says nothing about a
    // draft. Settling in the same turn here would mean the manifest had answered.
    expect(settledAtSetup).toBe(false);
  });

  it('still resolves through the gateway on a build that prerendered nothing', async () => {
    // `nuxi dev`, and an SSR deployment: no prerendered list, so the build knows no routes and
    // cannot be asked about them.
    state.prerendered = null;
    state.resolved = BUILT;

    const {
      page: { entry },
    } = await pageFor();

    expect(entry.value).toEqual(BUILT.entry);
    expect(state.resolverCalls).toBeGreaterThan(0);
  });

  it('falls back to the gateway for a prerendered route whose payload carries no answer', async () => {
    state.prerendered = new Set([PATH]);
    state.payloads[PATH] = { data: {} };
    state.resolved = BUILT;

    const {
      page: { entry },
    } = await pageFor();

    expect(entry.value).toEqual(BUILT.entry);
    expect(state.resolverCalls).toBe(1);
  });
});
