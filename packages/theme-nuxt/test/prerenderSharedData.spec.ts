/**
 * A failed read is never shared between the routes of a prerender (`prerenderSharedData.ts`,
 * WS-1358). The fake cache is Nuxt's own behaviour (`@nuxt/nitro-server`'s `sharedPrerenderCache`):
 * a rejected read is not stored, but its key stays shared, and a later `get` is a promise of the
 * storage read — `null`.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('nuxt/app', () => ({ defineNuxtPlugin: (plugin: unknown) => plugin }));

const { withoutFailedReads } = await import('../src/runtime/prerenderSharedData');

function nuxtSharedCache() {
  const keys = new Set<string>();
  const promises = new Map<string, Promise<unknown>>();
  const storage = new Map<string, unknown>();
  return {
    get(key: string): unknown {
      if (!keys.has(key)) return undefined;
      return promises.get(key) ?? Promise.resolve(storage.get(key) ?? null);
    },
    async set(key: string, value: Promise<unknown>): Promise<void> {
      keys.add(key);
      promises.set(key, value);
      try {
        storage.set(key, await value);
      } catch {
        // Nuxt swallows the failure and keeps the key.
      } finally {
        promises.delete(key);
      }
    },
  };
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
  it('without the wrapper, a route after a failed read bakes an empty answer (Nuxt’s behaviour)', async () => {
    const cache = nuxtSharedCache();
    const first = await settle(read(cache, 'form', notFound));
    await flush();
    const later = await settle(read(cache, 'form', notFound));
    expect(first).toEqual({ error: '404' });
    expect(later).toEqual({ data: null });
  });

  it('with it, every route after a failed read fails the same way', async () => {
    const cache = withoutFailedReads(nuxtSharedCache(), new Set());
    const load = vi.fn(notFound);
    const first = await settle(read(cache, 'form', load));
    await flush();
    const later = await settle(read(cache, 'form', load));
    expect(first).toEqual({ error: '404' });
    expect(later).toEqual({ error: '404' });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a route that asks while the read is in flight shares its failure', async () => {
    const cache = withoutFailedReads(nuxtSharedCache(), new Set());
    const load = vi.fn(notFound);
    const [first, concurrent] = await Promise.all([
      settle(read(cache, 'form', load)),
      settle(read(cache, 'form', load)),
    ]);
    expect([first, concurrent]).toEqual([{ error: '404' }, { error: '404' }]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('still shares an answer that succeeded, an empty one included', async () => {
    const cache = withoutFailedReads(nuxtSharedCache(), new Set());
    const load = vi.fn(() => Promise.resolve(null));
    await settle(read(cache, 'empty', load));
    await flush();
    expect(await settle(read(cache, 'empty', load))).toEqual({ data: null });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shares a key again once a later read of it succeeds', async () => {
    const cache = withoutFailedReads(nuxtSharedCache(), new Set());
    await settle(read(cache, 'flaky', notFound));
    await flush();
    const load = vi.fn(() => Promise.resolve({ ok: true }));
    expect(await settle(read(cache, 'flaky', load))).toEqual({ data: { ok: true } });
    await flush();
    expect(await settle(read(cache, 'flaky', load))).toEqual({ data: { ok: true } });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
