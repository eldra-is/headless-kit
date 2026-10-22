import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EldraClientError, type CatalogDoc, type EldraClient } from '@eldrajs/theme-core';
import { resolveApiBase } from '../src/runtime/apiBase';
import {
  clearPrerenderMemo,
  forcePrerenderMemoForTests,
  memoizeForPrerender,
  prerenderMemoScope,
  prerenderMemoStats,
} from '../src/runtime/prerenderMemo';
import { resolveEldraRoute } from '../src/runtime/resolveRoute';

const ROUTES = 12;
const CATEGORY = { kind: 'category', target: { _type: 'category', id: 'cat-1' } };

const pages = Array.from({ length: ROUTES }, (_, index) => ({
  id: `p-${index}`,
  data: { slug: `page-${index}` },
}));

function listPage<T>(data: T[]) {
  return {
    data,
    meta: {
      hasNext: false,
      hasPrev: false,
      page: 1,
      pageSize: 100,
      rows: data.length,
      total: data.length,
      totalPages: 1,
    },
  };
}

/** A gateway that counts every call; each route gets a client of its own, as in `nuxi generate`. */
function gateway() {
  const calls = { pageList: 0, templateList: 0, categories: 0, other: 0 };
  let failCategories = 0;
  const makeClient = (): EldraClient =>
    ({
      async getEntries(schemaApiId: string) {
        if (schemaApiId === 'page') {
          calls.pageList += 1;
          return listPage(pages);
        }
        calls.templateList += 1;
        throw new EldraClientError(404, 'Not Found', '/cms/v1/schema/route-template/entry');
      },
      async getEntry(_schema: string, id: string) {
        calls.other += 1;
        return { id, data: { slug: id, hero: CATEGORY } };
      },
      catalog: {
        async listCategories() {
          calls.categories += 1;
          if (failCategories > 0) {
            failCategories -= 1;
            throw new EldraClientError(503, 'Unavailable', '/catalog/v1/categories');
          }
          return listPage([{ id: 'cat-1', slug: 'tableware', name: 'Tableware' } as CatalogDoc]);
        },
      },
    }) as unknown as EldraClient;
  return {
    calls,
    makeClient,
    failNextCategoryReads(count: number) {
      failCategories = count;
    },
  };
}

const SITE = {
  pageSchema: 'page',
  routeTemplateSchema: 'route-template',
  gatewayUrl: 'https://gw.example/api',
  orgId: 'org-1',
};

async function renderAll(
  make: () => EldraClient,
  schemas: typeof SITE,
  locale?: string
): Promise<void> {
  for (let index = 0; index < ROUTES; index += 1) {
    const route = await resolveEldraRoute(make(), schemas, `/page-${index}`, locale);
    expect(route.page?.id).toBe(`p-${index}`);
    expect(route.links.targets.get('category:cat-1')?.path).toBe('tableware');
  }
}

describe('WS-406 prerender memo', () => {
  beforeEach(() => clearPrerenderMemo());
  afterEach(() => forcePrerenderMemoForTests(undefined));

  it('reads the page list, template list and categories once for a whole prerender', async () => {
    forcePrerenderMemoForTests(true);
    const gw = gateway();
    await renderAll(gw.makeClient, SITE);
    expect(gw.calls).toEqual({ pageList: 1, templateList: 1, categories: 1, other: ROUTES });
    expect(prerenderMemoStats().hits).toBeGreaterThan(0);
  });

  it('shares nothing outside a prerender: every route reads for itself', async () => {
    forcePrerenderMemoForTests(false);
    const gw = gateway();
    await renderAll(gw.makeClient, SITE);
    expect(gw.calls).toEqual({
      pageList: ROUTES,
      templateList: ROUTES,
      categories: ROUTES,
      other: ROUTES,
    });
  });

  it('reads once per locale and once per organisation', async () => {
    forcePrerenderMemoForTests(true);
    const gw = gateway();
    await renderAll(gw.makeClient, SITE, 'is-IS');
    await renderAll(gw.makeClient, SITE, 'en-US');
    await renderAll(gw.makeClient, { ...SITE, orgId: 'org-2' }, 'en-US');
    expect(gw.calls.pageList).toBe(3);
    expect(gw.calls.categories).toBe(3);
  });

  it('does not share when the caller has no credentials to key on', async () => {
    forcePrerenderMemoForTests(true);
    const gw = gateway();
    await renderAll(gw.makeClient, { ...SITE, gatewayUrl: '', orgId: '' });
    expect(gw.calls.pageList).toBe(ROUTES);
  });

  it('does not remember a failed read', async () => {
    forcePrerenderMemoForTests(true);
    const gw = gateway();
    gw.failNextCategoryReads(1);
    const first = await resolveEldraRoute(gw.makeClient(), SITE, '/page-0');
    // Link resolution is fail-soft: the target is simply unknown.
    expect(first.links.targets.has('category:cat-1')).toBe(false);
    const second = await resolveEldraRoute(gw.makeClient(), SITE, '/page-1');
    expect(second.links.targets.get('category:cat-1')?.path).toBe('tableware');
    expect(gw.calls.categories).toBe(2);
  });

  it('starts a fresh build after clearPrerenderMemo', async () => {
    forcePrerenderMemoForTests(true);
    let reads = 0;
    const load = async () => (reads += 1);
    const scope = prerenderMemoScope('https://gw', 'org', 'en');
    expect(await memoizeForPrerender(scope, 'x', load)).toBe(1);
    expect(await memoizeForPrerender(scope, 'x', load)).toBe(1);
    clearPrerenderMemo();
    expect(await memoizeForPrerender(scope, 'x', load)).toBe(2);
  });
});

describe('WS-407 resolveApiBase', () => {
  it('sends the browser to publicApiUrl and the server to gatewayUrl', () => {
    const cfg = { gatewayUrl: 'https://origin/api', publicApiUrl: 'https://edge/api' };
    expect(resolveApiBase(cfg, true)).toBe('https://edge/api');
    expect(resolveApiBase(cfg, false)).toBe('https://origin/api');
  });

  it('keeps the browser on gatewayUrl when publicApiUrl is unset or blank', () => {
    expect(resolveApiBase({ gatewayUrl: 'https://origin/api' }, true)).toBe('https://origin/api');
    expect(resolveApiBase({ gatewayUrl: 'https://origin/api', publicApiUrl: '  ' }, true)).toBe(
      'https://origin/api'
    );
  });
});
