import type { StorefrontPrerenderHandle } from './gateway';

/**
 * The bridge between a framework's keyed async data and `gateway.ts`'s
 * `StorefrontRuntime.prerender`, kept out of the plugin so its two sharp edges can be tested
 * without a Nuxt runtime. Both are Nuxt 4.5 behaviours, not guesses — see
 * `nuxt/dist/app/composables/asyncData.js`:
 *
 *   * **Never pass a `default`.** A hydrating client short-circuits the whole fetch when
 *     `data.value !== undefined` (`asyncData.js`, the `fetchOnServer && nuxtApp.isHydrating`
 *     branch), and `default: () => null` makes that true before anything has run. The result is a
 *     page whose payload happened not to carry this key — a block rendered only on the client, a
 *     key that changed since the build — sitting at `data === null` forever with its handler never
 *     called.
 *   * **And recover anyway.** On that same miss Nuxt defers the first fetch to the component's
 *     `onBeforeMount`, so the handle's own promise resolves *before* the load has run and with
 *     nothing in it. A status that is neither `success` nor `error` once it settles is exactly
 *     that case, and the only honest answer is to run the load now. `dedupe: 'defer'` is what
 *     makes the deferred fetch join this one instead of issuing a second — and what makes two
 *     blocks that read the same thing cost one request rather than two.
 */

/** What this adapter uses of one keyed async-data handle. Structural, so a spec can model it. */
export interface KeyedAsyncData<T> {
  data: { value: T | null | undefined };
  error: { value: unknown };
  /** `'idle' | 'pending' | 'success' | 'error'`. */
  status: { value: string };
  /** Runs the load now, joining one already in flight for the same key (`dedupe: 'defer'`). */
  execute(): Promise<unknown>;
  /** Settles when the load registered when the handle was created has finished. */
  settled: Promise<unknown>;
}

/** The options this adapter insists on. Both are correctness, not tuning — see above. */
export interface KeyedAsyncDataOptions {
  dedupe: 'defer';
}

export type KeyedAsyncDataFn = <T>(
  key: string,
  load: () => Promise<T | null>,
  options: KeyedAsyncDataOptions
) => KeyedAsyncData<T>;

export function prerenderThroughAsyncData<T>(
  asyncData: KeyedAsyncDataFn,
  key: string,
  load: () => Promise<T | null>
): StorefrontPrerenderHandle<T> {
  const handle = asyncData<T>(key, load, { dedupe: 'defer' });
  return {
    hydrated: handle.data.value ?? null,
    settled: (async () => {
      await handle.settled;
      // Settled with no answer and no failure: the hydration miss above. Run the load.
      if (handle.status.value !== 'success' && handle.status.value !== 'error') {
        await handle.execute();
      }
      return { data: handle.data.value ?? null, error: asyncDataError(handle.error.value) };
    })(),
  };
}

/** A framework's own error object, as the one string a `StorefrontResult` carries. */
export function asyncDataError(caught: unknown): string | null {
  if (caught === null || caught === undefined) return null;
  return caught instanceof Error ? caught.message : String(caught);
}
