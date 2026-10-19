/**
 * The site's deploy token, as a theme **build** sends it to the gateway in `X-Eldra-Build-Token` so
 * the build's reads land in their own rate-limit bucket rather than the machine's IP bucket.
 *
 * It is a secret, so it is stored nowhere: not in `runtimeConfig.public` (serialised into every
 * page's payload) and not in private runtime config either, because Nitro inlines private
 * defaults in plaintext into the server build, so an SSR `nuxi build` would ship the token inside
 * `.output/server`. The composable reads `ELDRA_DEPLOY_TOKEN` from the process environment at call
 * time instead, and only during a prerender, which runs in the same process as `nuxi generate`.
 */

/** Pure core of {@link useEldraBuildToken}: the token in `env`, or `undefined` for none/blank. */
export function pickBuildToken(
  env: Record<string, string | undefined> | null | undefined
): string | undefined {
  const value = env?.ELDRA_DEPLOY_TOKEN;
  if (typeof value !== 'string') return undefined;
  const token = value.trim();
  return token === '' ? undefined : token;
}
