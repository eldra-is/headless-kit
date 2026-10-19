/**
 * The site's deploy token, as a theme **build** sends it to the gateway in `X-Eldra-Build-Token` so
 * the build's reads land in their own rate-limit bucket rather than the machine's IP bucket.
 *
 * It is a secret, so it lives in Nuxt's **private** runtime config (`runtimeConfig.eldraBuildToken`,
 * written by the module from `ELDRA_DEPLOY_TOKEN`) and never in `runtimeConfig.public`, which is
 * serialised into every page's payload. Private config does not exist in the browser, and the
 * composable below additionally refuses to answer anywhere but a prerender.
 */

/** Pure core of {@link useEldraBuildToken}: the token in `config`, or `undefined` for none/blank. */
export function pickBuildToken(config: unknown): string | undefined {
  const value = (config as { eldraBuildToken?: unknown } | null | undefined)?.eldraBuildToken;
  if (typeof value !== 'string') return undefined;
  const token = value.trim();
  return token === '' ? undefined : token;
}
