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
import { describe, expect, it, vi } from 'vitest';
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
}));

vi.mock('nuxt/app', () => ({
  useRoute: () => ({ path: '/products/merino-crew' }),
  useRuntimeConfig: () => ({
    public: {
      eldra: { pageSchema: 'page', routeTemplateSchema: 'route-template', locale: null },
    },
  }),
  clearNuxtData: () => {},
  useAsyncData: (
    _key: unknown,
    handler: () => Promise<unknown>,
    options?: { default?: () => unknown }
  ) => {
    const data = ref(options?.default?.() ?? null);
    const pending = ref(true);
    void Promise.resolve(handler()).then((value) => {
      data.value = value;
      pending.value = false;
    });
    return { data, pending };
  },
}));

vi.mock('@eldrajs/theme-vue', () => ({
  useEldra: () => ({
    client: {},
    preview: {
      active: false,
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
  resolveEldraRoute: () => Promise.resolve(state.resolved),
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
