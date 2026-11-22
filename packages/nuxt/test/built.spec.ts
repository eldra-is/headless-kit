import { describe, expect, it } from 'vitest';
import { livePatterns } from '../src/livePatterns';
import { createLiveMatcher, isPagePath } from '../src/runtime/paths';
import { decideBuilt, type AssetsBinding } from '../src/runtime/server/built';

const BUILT = new Set(['/', '/shop', '/products/overshirt', '/products/overshirt/_payload.json']);

function assetStore(files = BUILT) {
  const asked: string[] = [];
  const assets: AssetsBinding = {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      asked.push(`${request.method} ${pathname}`);
      if (pathname === '/shop.html')
        return new Response(null, { status: 307, headers: { location: '/shop' } });
      return files.has(pathname)
        ? new Response('built', { status: 200 })
        : new Response('missing', { status: 404 });
    },
  };
  return { assets, asked };
}

const live = createLiveMatcher(
  livePatterns({
    handlers: [
      { route: '/api/storefront-access' },
      { route: '/robots.txt' },
      { route: '/__nuxt_error' },
      { route: '/_i18n/:hash/:locale/messages.json' },
      { route: '/proxy/**:path' },
      { route: '/feeds/:name.xml' },
      { middleware: true },
    ],
    routeRules: [{ '/coming-soon': { prerender: false }, '/fonts/**': {} }],
    extra: ['/preview/**'],
  })
);

async function decide(method: string, path: string, store = assetStore()) {
  return decideBuilt({
    method,
    url: new URL(path, 'https://shop.example'),
    headers: new Headers(),
    assets: store.assets,
    isLive: live,
  });
}

describe('built pages only', () => {
  it('serves what the build wrote, redirects included', async () => {
    for (const path of ['/', '/shop', '/products/overshirt/_payload.json', '/shop?sort=name'])
      expect((await decide('GET', path)).kind, path).toBe('built');
    const redirect = await decide('GET', '/shop.html');
    expect(redirect.kind === 'built' && redirect.response.status).toBe(307);
    expect((await decide('HEAD', '/shop')).kind).toBe('built');
  });

  it('answers a page the build did not write with the 404 page, and anything else bare', async () => {
    for (const path of ['/no-such-page', '/products/nope', '/en/nope', '/a/b/c'])
      expect((await decide('GET', path)).kind, path).toBe('unbuilt-page');
    for (const path of ['/.env', '/wp-login.php', '/.git/config', '/nope/_payload.json', '/x.json'])
      expect((await decide('GET', path)).kind, path).toBe('not-found');
  });

  it('lets the site answer its own routes and on-request pages', async () => {
    for (const path of [
      '/coming-soon',
      '/robots.txt',
      '/__nuxt_error',
      '/_i18n/abc/is/messages.json',
      '/preview/x/y',
      '/preview',
      '/proxy/a/b.json',
      '/feeds/news.xml',
    ])
      expect((await decide('GET', path)).kind, path).toBe('live');
    expect((await decide('POST', '/api/storefront-access')).kind).toBe('live');
    expect((await decide('POST', '/proxy/cart')).kind).toBe('live');
  });

  it('refuses a write to anything but a live route, without asking the asset store', async () => {
    const store = assetStore();
    expect((await decide('POST', '/no-such-page', store)).kind).toBe('method-not-allowed');
    expect((await decide('PUT', '/shop', store)).kind).toBe('method-not-allowed');
    expect(store.asked).toEqual([]);
  });

  it('lets the site answer when the asset store cannot be asked', async () => {
    const failing: AssetsBinding = { fetch: () => Promise.reject(new Error('down')) };
    expect((await decide('GET', '/no-such-page', { assets: failing, asked: [] })).kind).toBe(
      'live'
    );
  });
});

describe('isPagePath', () => {
  it('reads a path without a file extension as a page', () => {
    expect(isPagePath('/en/shop')).toBe(true);
    expect(isPagePath('/v1.2/notes')).toBe(true);
    expect(isPagePath('/.env')).toBe(false);
    expect(isPagePath('/sitemap.xml')).toBe(false);
  });
});
