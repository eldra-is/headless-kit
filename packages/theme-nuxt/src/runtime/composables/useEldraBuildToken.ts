import { useRuntimeConfig } from 'nuxt/app';
import { pickBuildToken } from '../buildToken';

/**
 * The deploy token to pass as `buildToken` to a gateway client, or `undefined`.
 *
 * Answers only while Nitro is **prerendering** (`nuxi generate`): not in the browser, not in
 * `nuxi dev`, not when a deployed SSR server answers a visitor — a visitor's request must never
 * claim the build's rate-limit budget. See `../buildToken.ts` for where the value lives.
 */
export function useEldraBuildToken(): string | undefined {
  if (!import.meta.server || !import.meta.prerender) return undefined;
  return pickBuildToken(useRuntimeConfig());
}
