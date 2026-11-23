// @vitest-environment jsdom
/**
 * The path a draft preview session's router starts at (`previewSessionRoute.ts`, WS-1358): the
 * address bar's when the host answered a draft-only page with the build's not-found document, and
 * the rendered one in every other case, compared as Nuxt's router compares them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ session: true }));

vi.mock('nuxt/app', () => ({
  defineNuxtPlugin: (plugin: unknown) => plugin,
}));
vi.mock('../src/runtime/previewSession', () => ({
  detectPreviewSession: () => state.session,
}));

const { default: plugin, sessionStartPath } = await import('../src/runtime/previewSessionRoute');

describe('sessionStartPath', () => {
  it('starts a draft-only page at the address bar’s path, not the not-found document’s', () => {
    expect(sessionStartPath('/404', '/draft-only')).toBe('/draft-only');
    expect(sessionStartPath('/404/', '/draft-only/')).toBe('/draft-only/');
    expect(sessionStartPath('/404?x=1', '/journal/new')).toBe('/journal/new');
  });

  it('leaves the not-found page itself, a trailing slash or an encoding aside', () => {
    expect(sessionStartPath('/404', '/404')).toBeUndefined();
    expect(sessionStartPath('/404', '/404/')).toBeUndefined();
    expect(sessionStartPath('/%34%30%34', '/404')).toBeUndefined();
  });

  it('never rewrites a document served under another address (an alias, a rewrite)', () => {
    expect(sessionStartPath('/', '/home')).toBeUndefined();
    expect(sessionStartPath('/about', '/um-okkur')).toBeUndefined();
    expect(sessionStartPath('/is-IS/um', '/um')).toBeUndefined();
  });

  it('compares and assigns the path without a non-root baseURL', () => {
    expect(sessionStartPath('/404', '/shop/draft-only', '/shop/')).toBe('/draft-only');
    expect(sessionStartPath('/404', '/shop/draft-only', '/shop')).toBe('/draft-only');
    expect(sessionStartPath('/404', '/shop/404', '/shop/')).toBeUndefined();
    expect(sessionStartPath('/404', '/shop', '/shop/')).toBe('/');
    // An address outside the base is Nuxt's to handle, as written.
    expect(sessionStartPath('/404', '/shopping/x', '/shop/')).toBe('/shopping/x');
  });

  it('leaves a hash-mode router and a payload without a path alone', () => {
    expect(sessionStartPath('/404', '/draft-only', '/#/')).toBeUndefined();
    expect(sessionStartPath(undefined, '/draft-only')).toBeUndefined();
    expect(sessionStartPath('', '/draft-only')).toBeUndefined();
  });
});

describe('the plugin', () => {
  type App = { payload: { path?: string }; $config: { app: { baseURL: string } } };
  const run = (app: App): void => (plugin as unknown as { setup: (app: App) => void }).setup(app);
  const app = (path: string, baseURL = '/'): App => ({
    payload: { path },
    $config: { app: { baseURL } },
  });

  beforeEach(() => {
    state.session = true;
    window.history.replaceState(null, '', '/draft-only');
  });

  it('sets the payload path in a session', () => {
    const nuxt = app('/404');
    run(nuxt);
    expect(nuxt.payload.path).toBe('/draft-only');
  });

  it('assigns the path without the baseURL', () => {
    window.history.replaceState(null, '', '/shop/draft-only');
    const nuxt = app('/404', '/shop/');
    run(nuxt);
    expect(nuxt.payload.path).toBe('/draft-only');
  });

  it('changes nothing outside a session', () => {
    state.session = false;
    const nuxt = app('/404');
    run(nuxt);
    expect(nuxt.payload.path).toBe('/404');
  });
});
