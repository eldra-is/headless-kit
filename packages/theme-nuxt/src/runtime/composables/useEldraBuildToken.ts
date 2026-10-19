import { pickBuildToken } from '../buildToken';

/**
 * The deploy token to pass as `buildToken` to a gateway client, or `undefined`.
 *
 * Answers only while Nitro is **prerendering** (`nuxi generate`): not in the browser, not in
 * `nuxi dev`, not when a deployed SSR server answers a visitor — a visitor's request must never
 * claim the build's rate-limit budget. The value is read from `process.env` at call time and is
 * never stored in runtime config; see `../buildToken.ts`.
 */
export function useEldraBuildToken(): string | undefined {
  if (!import.meta.server || !import.meta.prerender) return undefined;
  // Whole-object access on purpose: a bundler only inlines a literal `process.env.NAME`, and this
  // value must never be baked into a build artifact.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return pickBuildToken(env);
}
