import { resolveApiBase } from '@eldrajs/theme-nuxt/api-base';
import {
  CATEGORIES_MEMO_NAME,
  memoizeForPrerender,
  prerenderMemoScope,
} from '@eldrajs/theme-nuxt/prerender';

/**
 * Where the storefront's SDK client talks to, and how it shares build-wide reads (WS-406, WS-407).
 * No Nuxt global is touched: the plugin passes the public runtime config and whether it is running
 * in the browser.
 *
 * - **Base:** the browser uses `publicApiUrl` (`ELDRA_PUBLIC_API_URL`, the edge host) when set;
 *   the server, and so every build-time and prerender read (the only place the build token is
 *   sent), always uses `gatewayUrl` (`ELDRA_GATEWAY_URL`, the origin).
 * - **Shared reads:** keyed gateway + organisation + locale, the same key `@eldrajs/theme-nuxt`
 *   uses for its own reads, so a list both ask for (the categories) is read once per build.
 */
export interface StorefrontApiConfig {
  gatewayUrl?: string;
  publicApiUrl?: string;
  orgId?: string;
}

export type SharedRead = <T>(
  name: string,
  load: () => Promise<T>,
  locale: string | undefined
) => Promise<T>;

export { CATEGORIES_MEMO_NAME };

export function createStorefrontApiAccess(
  config: StorefrontApiConfig | undefined,
  isClient: boolean,
  memoize: typeof memoizeForPrerender = memoizeForPrerender
): { apiBaseUrl: string | undefined; shared: SharedRead } {
  const gatewayUrl = config?.gatewayUrl ?? '';
  const apiBaseUrl =
    resolveApiBase({ gatewayUrl, publicApiUrl: config?.publicApiUrl }, isClient) || undefined;
  return {
    apiBaseUrl,
    // Keyed on `gatewayUrl`, not the browser base: a prerender is server-side, where they are one.
    shared: (name, load, locale) =>
      memoize(prerenderMemoScope(gatewayUrl, config?.orgId, locale), name, load),
  };
}
