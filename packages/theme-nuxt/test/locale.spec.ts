import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { EldraClient } from '@eldrajs/theme-core';
import { listCatalogDocs, loadCatalogEntry } from '../src/runtime/catalog';
import { localeQuery, normalizeLocale } from '../src/runtime/locale';
import { resolveEldraRoute } from '../src/runtime/resolveRoute';

/**
 * A site that configures no locale carries `""`, not `undefined`: that is what
 * `runtimeConfig.public.eldra.locale` holds and what an unset `ELDRA_LOCALE`
 * becomes. Forwarding it produced `?locale=` on every read, which the gateway
 * answers with 400 — so every boundary that forwards a locale normalises a
 * blank one to "no locale", and the key never reaches the client.
 */

const SCHEMAS = { pageSchema: 'page', routeTemplateSchema: 'route-template' };

const PRODUCT_TEMPLATE = {
  id: 'rt-product',
  data: {
    title: 'Product template',
    routePattern: '/products/:slug',
    schemaApiId: 'catalog:product',
    slugField: 'slug',
  },
};

const MERINO_CREW = { id: 'prod-merino', slug: 'merino-crew', title: 'Merino crew' };

interface RecordedCall {
  path: string;
  query: Record<string, unknown> | undefined;
}

/** Records every query object the runtime hands the client, so a test can ask
 * whether the `locale` key is present at all — not merely whether it is
 * `undefined`, which `toEqual` would treat as absent. */
function recordingClient(): { client: EldraClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const record = (path: string, query?: Record<string, unknown>): void => {
    calls.push({ path, query });
  };
  const listPage = (data: unknown[]) => ({
    data,
    meta: { hasNext: false, hasPrev: false, page: 1, pageSize: 100, rows: data.length, total: 0 },
  });
  const client = {
    async getEntries(schemaApiId: string, query?: Record<string, unknown>) {
      record(`/cms/v1/schema/${schemaApiId}/entry`, query);
      return listPage(schemaApiId === 'route-template' ? [PRODUCT_TEMPLATE] : []);
    },
    async getEntry(schemaApiId: string, entryId: string, query?: Record<string, unknown>) {
      record(`/cms/v1/schema/${schemaApiId}/entry/${entryId}`, query);
      return PRODUCT_TEMPLATE;
    },
    async getEntryByUniqueField(schemaApiId: string, fieldId: string, value: string) {
      record(`/cms/v1/schema/${schemaApiId}/entry/unique/${fieldId}/${value}`);
      return null;
    },
    catalog: {
      async getProduct(slug: string, query?: Record<string, unknown>) {
        record(`/catalog/v1/products/${slug}`, query);
        return MERINO_CREW;
      },
      async getCollection(slug: string, query?: Record<string, unknown>) {
        record(`/catalog/v1/collections/${slug}`, query);
        return { id: 'col-winter', slug, title: 'Winter' };
      },
      async listProducts(query?: Record<string, unknown>) {
        record('/catalog/v1/products/list', query);
        return listPage([]);
      },
      async listCollections(query?: Record<string, unknown>) {
        record('/catalog/v1/collections', query);
        return listPage([]);
      },
    },
  } as unknown as EldraClient;
  return { client, calls };
}

const localeKeys = (calls: readonly RecordedCall[]): string[] =>
  calls
    .filter((call) => call.query !== undefined && 'locale' in call.query)
    .map((call) => call.path);

describe('normalizeLocale', () => {
  it('treats a blank or whitespace-only locale as no locale, and keeps a real one', () => {
    expect(normalizeLocale('')).toBeUndefined();
    expect(normalizeLocale('   ')).toBeUndefined();
    expect(normalizeLocale(null)).toBeUndefined();
    expect(normalizeLocale(undefined)).toBeUndefined();
    expect(normalizeLocale(' is-IS ')).toBe('is-IS');
    expect(localeQuery('')).toEqual({});
    expect(localeQuery('')).not.toHaveProperty('locale');
    expect(localeQuery('is-IS')).toEqual({ locale: 'is-IS' });
  });
});

describe('locale forwarding', () => {
  it('sends no locale key at all when the configured locale is blank', async () => {
    const { client, calls } = recordingClient();

    await resolveEldraRoute(client, SCHEMAS, '/products/merino-crew', '');

    expect(calls.map((call) => call.path)).toContain('/catalog/v1/products/merino-crew');
    expect(localeKeys(calls)).toEqual([]);
  });

  it('still sends a configured locale', async () => {
    const { client, calls } = recordingClient();

    await resolveEldraRoute(client, SCHEMAS, '/products/merino-crew', ' is ');

    expect(localeKeys(calls)).toContain('/catalog/v1/products/merino-crew');
    for (const call of calls) {
      if (call.query !== undefined && 'locale' in call.query) expect(call.query.locale).toBe('is');
    }
  });

  it('keeps the catalog reads free of a blank locale too', async () => {
    const { client, calls } = recordingClient();

    await loadCatalogEntry(client, 'product', 'merino-crew', '');
    await listCatalogDocs(client, 'product', '   ');
    await listCatalogDocs(client, 'collection', '');

    expect(localeKeys(calls)).toEqual([]);
  });
});

/** The composable reads the locale out of `runtimeConfig.public.eldra`, which is
 * where the empty string actually comes from — so it gets its own test rather
 * than only the route resolver below it. */
const state = vi.hoisted(() => ({
  route: { path: '/products/merino-crew' },
  config: {
    pageSchema: 'page',
    routeTemplateSchema: 'route-template',
    locale: '' as string | null,
    locales: '' as unknown,
  },
  ctx: undefined as unknown,
}));

vi.mock('nuxt/app', () => ({
  useRoute: () => state.route,
  useRouter: () => ({ currentRoute: { value: state.route } }),
  loadPayload: () => Promise.resolve(null),
  useRuntimeConfig: () => ({ public: { eldra: state.config } }),
  clearNuxtData: () => {},
  // Server-only; `import.meta.server` is false under vitest, so a failed resolution's response
  // status is never set here (it is proven on a real `nuxi generate` —
  // `examples/starter-nuxt/test/prerenderFailure.spec.ts`).
  useRequestEvent: () => undefined,
  setResponseStatus: () => {},
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

vi.mock('@eldrajs/theme-vue', () => ({ useEldra: () => state.ctx }));

async function renderPage(
  client: EldraClient,
  config: { locale: string | null; locales?: unknown; path?: string },
  preview: { active: boolean; locale: string | null }
): Promise<void> {
  state.config.locale = config.locale;
  state.config.locales = config.locales ?? '';
  state.route.path = config.path ?? '/products/merino-crew';
  state.ctx = {
    client,
    links: { pages: [], templates: [], targets: new Map() },
    preview: { ...preview, drafts: {}, draftSchemaApiIds: {}, revision: 0, refreshRevision: 0 },
  };
  const { useEldraPage } = await import('../src/runtime/composables/useEldraPage');
  useEldraPage();
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

describe('useEldraPage', () => {
  it('forwards no locale key when the runtime config carries an empty one', async () => {
    const { client, calls } = recordingClient();

    await renderPage(client, { locale: '' }, { active: false, locale: null });

    expect(calls.map((call) => call.path)).toContain('/catalog/v1/products/merino-crew');
    expect(localeKeys(calls)).toEqual([]);
  });

  it('reads a locale-prefixed path as that locale, at the unprefixed slug', async () => {
    // The prefix selects the locale and is not part of the path the content lives at: segments are
    // not translated, so `/en-US/products/merino-crew` is the same document `/products/...` serves,
    // read with `locale=en-US`. A read that kept the prefix would ask the gateway for a slug no
    // product has.
    const { client, calls } = recordingClient();

    await renderPage(
      client,
      {
        locale: '',
        locales: { default: 'is-IS', supported: ['is-IS', 'en-US'] },
        path: '/en-US/products/merino-crew',
      },
      { active: false, locale: null }
    );

    const product = calls.find((call) => call.path === '/catalog/v1/products/merino-crew');
    expect(product?.query).toEqual({ locale: 'en-US' });
    expect(calls.every((call) => !call.path.includes('en-US/'))).toBe(true);
  });

  it('sends no locale on the unprefixed path, however many the organisation has', async () => {
    // The default locale lives at `/`, and the gateway's own default is the same document. A site
    // that configured no override has never sent a locale on that path, and starting to now would
    // change every request on every existing site without changing an answer.
    const { client, calls } = recordingClient();

    await renderPage(
      client,
      { locale: '', locales: { default: 'is-IS', supported: ['is-IS', 'en-US'] } },
      { active: false, locale: null }
    );

    expect(localeKeys(calls)).toEqual([]);
  });

  it('treats the default locale’s own prefix as an unknown path, not a second copy', async () => {
    // `/is-IS/...` is never generated, so it must resolve as the path it is — which has no page —
    // rather than as another spelling of the site root.
    const { client, calls } = recordingClient();

    await renderPage(
      client,
      {
        locale: '',
        locales: { default: 'is-IS', supported: ['is-IS', 'en-US'] },
        path: '/is-IS/products/merino-crew',
      },
      { active: false, locale: null }
    );

    expect(calls.map((call) => call.path)).not.toContain('/catalog/v1/products/merino-crew');
    expect(localeKeys(calls)).toEqual([]);
  });

  it('lets the preview bridge’s locale win over the path’s', async () => {
    // Studio drives the content locale, and the preview frame's path need not name it at all.
    const { client, calls } = recordingClient();

    await renderPage(
      client,
      {
        locale: '',
        locales: { default: 'is-IS', supported: ['is-IS', 'en-US'] },
        path: '/en-US/products/merino-crew',
      },
      { active: true, locale: 'is-IS' }
    );

    const product = calls.find((call) => call.path === '/catalog/v1/products/merino-crew');
    expect(product?.query).toEqual({ locale: 'is-IS' });
  });

  it('falls back to the configured locale when the preview bridge sends a blank one', async () => {
    // `preview.locale` wins over the config, but only when it is a locale: an
    // empty string from the bridge must not become an empty `?locale=` — nor
    // shadow the locale the site actually configured.
    const { client, calls } = recordingClient();

    await renderPage(client, { locale: 'is' }, { active: true, locale: '' });

    const product = calls.find((call) => call.path === '/catalog/v1/products/merino-crew');
    expect(product?.query).toEqual({ locale: 'is' });
  });
});
