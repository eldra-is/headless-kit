/**
 * The kit needs Nuxt 4.7.0 or later (nuxt/nuxt#37241): before it, Nuxt kept sharing a key whose
 * `useAsyncData` read failed during a prerender, so every route rendered after it baked an empty
 * answer (`null`) where earlier ones baked the error, and the same content built different pages
 * depending on route order (a preview's parity with the published site depends on it, WS-1358).
 * This runs **Nuxt's own** shared prerender cache, `@nuxt/nitro-server`'s
 * `runtime/utils/cache.mjs` as the installed Nuxt ships it, with only its environment supplied (a
 * prerender, shared data on, an in-memory `useStorage`), so a Nuxt that brings the bug back, or
 * moves the cache, fails here before a theme's build bakes inconsistent pages.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const fromNuxt = createRequire(createRequire(import.meta.url).resolve('nuxt/package.json'));
const nitroServer = dirname(fromNuxt.resolve('@nuxt/nitro-server/package.json'));
const CACHE_MODULE = join(nitroServer, 'dist', 'runtime', 'utils', 'cache.mjs');
const ASYNC_DATA = join(
  dirname(createRequire(import.meta.url).resolve('nuxt/package.json')),
  'dist',
  'app',
  'composables',
  'asyncData.js'
);

/** The environment `cache.mjs` imports, replaced line by line; a missing line is a Nuxt change. */
const ENVIRONMENT: Array<[string, string]> = [
  [
    'import { useStorage } from "nitropack/runtime";',
    'const storages = new Map(); const useStorage = (name) => { if (!storages.has(name)) { const items = new Map(); storages.set(name, { getItem: async (key) => (items.has(key) ? items.get(key) : null), setItem: async (key, value) => { items.set(key, value); } }); } return storages.get(name); };',
  ],
  [
    'import { NUXT_SHARED_DATA } from "#internal/nuxt/nitro-config.mjs";',
    'const NUXT_SHARED_DATA = true;',
  ],
];

const scratch = mkdtempSync(join(tmpdir(), 'eldra-shared-cache-'));
let loads = 0;

/** A fresh instance of Nuxt's cache module (its state is module-level). */
async function nuxtSharedCache(): Promise<{
  get(key: string): unknown;
  set(key: string, value: Promise<unknown>): Promise<void>;
}> {
  let source = readFileSync(CACHE_MODULE, 'utf8');
  for (const [line, replacement] of ENVIRONMENT) {
    expect(source, `cache.mjs still imports: ${line}`).toContain(line);
    source = source.replace(line, replacement);
  }
  expect(source).toContain('import.meta.prerender');
  source = source.replaceAll('import.meta.prerender', 'true');
  loads += 1;
  const file = join(scratch, `cache-${loads}.mjs`);
  writeFileSync(file, source);
  const loaded = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as {
    sharedPrerenderCache?: unknown;
  };
  const cache = loaded.sharedPrerenderCache as {
    get(key: string): unknown;
    set(key: string, value: Promise<unknown>): Promise<void>;
  };
  expect(typeof cache?.get, 'sharedPrerenderCache.get').toBe('function');
  expect(typeof cache?.set, 'sharedPrerenderCache.set').toBe('function');
  return cache;
}

/** Nuxt's handler: a shared answer when the cache has one, else its own read, shared. */
function read(
  cache: { get(key: string): unknown; set(key: string, value: Promise<unknown>): unknown },
  key: string,
  load: () => Promise<unknown>
): Promise<unknown> {
  const value = cache.get(key);
  if (value) return value as Promise<unknown>;
  const promise = Promise.resolve().then(load);
  void cache.set(key, promise);
  return promise;
}

const notFound = (): Promise<never> => Promise.reject(new Error('404'));
const settle = (promise: Promise<unknown>) =>
  promise.then(
    (data) => ({ data }),
    (error: Error) => ({ error: error.message })
  );
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the shared prerender cache', () => {
  it('the handler reads the cache the way this models it (Nuxt’s asyncData.js)', () => {
    const source = readFileSync(ASYNC_DATA, 'utf8');
    expect(source).toContain('ssrContext["~sharedPrerenderCache"].get(key)');
    expect(source).toContain('if (value) return value;');
    expect(source).toContain('ssrContext["~sharedPrerenderCache"].set(key, promise)');
  });

  it('a route after a failed read reads the key again and bakes its own result', async () => {
    const cache = await nuxtSharedCache();
    const load = vi.fn(notFound);
    const first = await settle(read(cache, 'form', load));
    await flush();
    const later = await settle(read(cache, 'form', load));
    expect(first).toEqual({ error: '404' });
    expect(later).toEqual({ error: '404' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a route that asks while the read is in flight shares its failure', async () => {
    const cache = await nuxtSharedCache();
    const load = vi.fn(notFound);
    const [first, concurrent] = await Promise.all([
      settle(read(cache, 'form', load)),
      settle(read(cache, 'form', load)),
    ]);
    expect([first, concurrent]).toEqual([{ error: '404' }, { error: '404' }]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('still shares an answer that succeeded, an empty one included', async () => {
    const cache = await nuxtSharedCache();
    const load = vi.fn(() => Promise.resolve(null));
    await settle(read(cache, 'empty', load));
    await flush();
    expect(await settle(read(cache, 'empty', load))).toEqual({ data: null });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shares a key once a later read of it succeeds', async () => {
    const cache = await nuxtSharedCache();
    await settle(read(cache, 'flaky', notFound));
    await flush();
    const load = vi.fn(() => Promise.resolve({ ok: true }));
    expect(await settle(read(cache, 'flaky', load))).toEqual({ data: { ok: true } });
    await flush();
    expect(await settle(read(cache, 'flaky', load))).toEqual({ data: { ok: true } });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
