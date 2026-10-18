import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnalytics, type AnalyticsSender } from '../analytics';

/**
 * Runs the real tracker script (a vendored copy of web-studio-core's
 * `cloudflare-edge/contracts/tracker/script.js`, stored as `.txt` so no tool treats it as source)
 * in jsdom: it is what makes a client-side navigation in a Nuxt site count as a pageview (it
 * patches `history.pushState`/`replaceState`), what `createAnalytics` hands custom events to, and
 * what must leave no cookie or storage identifier behind.
 */
const script = readFileSync(join(__dirname, 'fixtures', 'tracker-script.js.txt'), 'utf8');

interface Posted {
  url: string;
  body: { orgId: string; name: string; url: string; props?: Record<string, string> };
}

function install(dataApi?: string): Posted[] {
  const posted: Posted[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: { body: string }) => {
      posted.push({ url, body: JSON.parse(init.body) });
      return Promise.resolve(new Response(null, { status: 202 }));
    })
  );
  const tag = document.createElement('script');
  tag.src = 'https://gateway.example/js/script.js';
  tag.setAttribute('data-org', 'org-1');
  if (dataApi) tag.setAttribute('data-api', dataApi);
  // jsdom does not execute inserted scripts; run the source with `currentScript` pointing at the
  // tag, which is what a browser does for a dynamically inserted classic script.
  Object.defineProperty(document, 'currentScript', { value: tag, configurable: true });
  new Function(script)();
  Object.defineProperty(document, 'currentScript', { value: null, configurable: true });
  return posted;
}

describe('the tracker script in a single-page app', () => {
  beforeEach(() => {
    history.replaceState(null, '', '/');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as { eldra?: unknown }).eldra;
  });

  it('sends a pageview for the first load and for each client-side navigation, deduped by path', () => {
    const posted = install();
    history.pushState({}, '', '/products/mug');
    history.pushState({}, '', '/products/mug');
    history.pushState({}, '', '/cart');
    expect(posted.map((p) => new URL(p.body.url).pathname)).toEqual([
      '/',
      '/products/mug',
      '/cart',
    ]);
    expect(posted.every((p) => p.body.name === 'pageview')).toBe(true);
    expect(posted[0]?.url).toBe('https://gateway.example/api/analytics/v1/event');
  });

  it('reports to data-api when a first-party origin is named', () => {
    const posted = install('https://shop.example');
    expect(posted[0]?.url).toBe('https://shop.example/api/analytics/v1/event');
  });

  it('carries custom events from createAnalytics', () => {
    const posted = install();
    const analytics = createAnalytics({
      enabled: true,
      sender: () => (window as { eldra?: AnalyticsSender }).eldra,
    });
    analytics.track('add_to_cart', { product_id: 'p1', quantity: 2 });
    const event = posted.find((p) => p.body.name === 'add_to_cart');
    expect(event?.body.props).toEqual({ product_id: 'p1', quantity: '2' });
  });

  it('writes no cookie and nothing to storage', () => {
    const cookie = vi.spyOn(document, 'cookie', 'set');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    install();
    history.pushState({}, '', '/a');
    window.eldra?.('event', 'search', { props: { query: 'mug' } });
    expect(cookie).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe('');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

declare global {
  interface Window {
    eldra?: AnalyticsSender;
  }
}
