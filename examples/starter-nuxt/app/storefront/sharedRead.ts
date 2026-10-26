import {
  CATEGORIES_MEMO_NAME,
  memoizeForPrerender,
  prerenderMemoScope,
} from '@eldrajs/theme-nuxt/prerender';

/**
 * How the storefront shares build-wide reads (WS-406). No Nuxt global is touched: the plugin passes
 * the public runtime config.
 *
 * Reads are keyed gateway + organisation + locale, the same key `@eldrajs/theme-nuxt` uses for its
 * own reads, so a list both ask for (the categories) is read once per build.
 */
export interface StorefrontSharedConfig {
  gatewayUrl?: string;
  orgId?: string;
}

export type SharedRead = <T>(
  name: string,
  load: () => Promise<T>,
  locale: string | undefined
) => Promise<T>;

export { CATEGORIES_MEMO_NAME };

export function createSharedRead(
  config: StorefrontSharedConfig | undefined,
  memoize: typeof memoizeForPrerender = memoizeForPrerender
): SharedRead {
  const gatewayUrl = config?.gatewayUrl ?? '';
  return (name, load, locale) =>
    memoize(prerenderMemoScope(gatewayUrl, config?.orgId, locale), name, load);
}
