import type { EldraFeatureClient, EldraOrganizationLocales } from '@eldrajs/sdk';
import { normalizeLocale } from './locale';

/**
 * Which content locales the site serves, as it reaches a theme on
 * `runtimeConfig.public.eldra.locales`: `{ default, supported }`, or `null`.
 *
 * Published as `@eldrajs/theme-nuxt/locales` beside `@eldrajs/theme-nuxt/commerce`, so a theme
 * reading that key types it from here instead of hand-writing the record — it is the public
 * contract of a public runtime-config key. (Its own subpath rather than the package root:
 * `nuxt-module-build` generates the root's `.d.mts` itself, and that file carries the module and
 * `ModuleOptions` only.)
 *
 * It is the gateway's own organisation `locales` record unchanged, so the shape is declared
 * **once** — in `@eldrajs/sdk`, which is where the read comes from — and aliased here under the
 * name the runtime config uses.
 *
 * Read **once, at build**, from the organisation the site is deployed for
 * (`@eldrajs/sdk`'s `features.getLocales()`), because the prerender pass has to know every locale
 * before it can list a single path: which routes exist *is* this answer, and a value fetched in
 * the browser would arrive long after the artifact was written.
 *
 * `null` is a real answer, not a failure: an organisation that has configured no locales serves
 * one unprefixed site with no language switcher, which is exactly what a theme did before locales
 * existed.
 */
export type StoreLocales = EldraOrganizationLocales;

/**
 * The slice of an `@eldrajs/sdk` client this read needs — a whole `EldraClient` satisfies it.
 * Narrow on purpose: it is what lets the module's own tests hand `readStoreLocales` a client that
 * answers, omits or throws with no gateway anywhere near them.
 */
export interface StoreLocalesReader {
  features: Pick<EldraFeatureClient, 'getLocales'>;
}

/**
 * The one line a build prints when it could not learn the organisation's locales. It names the
 * cause, because the outcome — one unprefixed site, no switcher — is indistinguishable from the
 * ordinary state of an organisation that has configured none, and only one of the two is
 * something somebody can fix.
 *
 * There is deliberately **no** warning for the ordinary state. `commerce.ts` warns for its own
 * absent value because a page then renders prices with no symbol; nothing is lost here, so a line
 * every single-locale build printed would only teach its reader to ignore build warnings.
 */
export const LOCALES_READ_FAILED_WARNING =
  '[eldra] could not read the organisation’s content locales — serving one unprefixed site';

/**
 * How long the build waits for the answer. A bound rather than none, for the same reason
 * `commerce.ts` has one: this read is optional, and a locale list nobody can fetch must not be the
 * reason a deploy never finishes.
 *
 * Exported so the test that proves the bound can assert the value rather than restate it.
 */
export const READ_TIMEOUT_MS = 10_000;

/**
 * The organisation's content locales for `runtimeConfig.public.eldra`, or `null`.
 *
 * Fail-soft by construction: a gateway that cannot be reached, a read that times out, a record the
 * SDK refuses and an organisation with no locales at all all end the same way — `null`, and a
 * build that finishes serving one unprefixed site. Only the first three print the line above.
 *
 * `reader` is `null` for a site built without gateway credentials (a scaffolded theme nobody has
 * connected yet, a CI build with no secrets). Same outcome, no request, and no warning: that build
 * has already been told it has no gateway.
 */
export async function readStoreLocales(
  reader: StoreLocalesReader | null,
  warn: (message: string) => void = console.warn
): Promise<StoreLocales | null> {
  if (reader === null) return null;
  // An explicit controller and `setTimeout`, not `AbortSignal.timeout`: the timer is cleared the
  // instant the read settles, so a gateway that answers in 5 ms leaves nothing pending behind it,
  // and the bound is driven by a timer a test can advance rather than by a native one it cannot.
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${READ_TIMEOUT_MS}ms`)),
    READ_TIMEOUT_MS
  );
  try {
    return toStoreLocales(
      await reader.features.getLocales(undefined, { signal: controller.signal })
    );
  } catch (error) {
    warn(`${LOCALES_READ_FAILED_WARNING} (${describe(error)})`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Accepts only a whole answer, and re-checks what the SDK already checked.
 *
 * Not redundant: this same function is what reads the value **back** out of the runtime config in
 * the browser (`resolveStoreLocales`), where it arrives as whatever Nitro serialised — `''` for an
 * absent one, and whatever a theme put there by hand if it wrote the key itself. One validator for
 * both directions means a locale that reaches route resolution is always a usable tag.
 */
export function toStoreLocales(value: unknown): StoreLocales | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as { default?: unknown; supported?: unknown };
  const defaultLocale = normalizeLocale(typeof record.default === 'string' ? record.default : null);
  if (defaultLocale === undefined) return null;
  if (!Array.isArray(record.supported)) return null;
  const supported = [defaultLocale];
  for (const entry of record.supported) {
    const locale = normalizeLocale(typeof entry === 'string' ? entry : null);
    if (locale === undefined) return null;
    if (!supported.includes(locale)) supported.push(locale);
  }
  return { default: defaultLocale, supported };
}

/**
 * The locales the **running** site serves, read off `runtimeConfig.public.eldra.locales`.
 *
 * `runtimeConfig.public` serialises an absent object as `''`, exactly as it does for `commerce`
 * and `locale`, so the key is always there and is not always a record.
 */
export function resolveStoreLocales(value: unknown): StoreLocales | null {
  return toStoreLocales(value);
}

/**
 * How one site's paths and locales line up, resolved once from the organisation's locales and the
 * theme's own `eldra.locale` / `ELDRA_LOCALE`.
 *
 * Four fields rather than one list, because three different questions are asked of it and they
 * have three different answers for the same path:
 *
 *  * which locale a **URL with no prefix** is (`default`);
 *  * which locales a URL may be **prefixed** with (`prefixed` — never the default: the default
 *    lives at `/` only, and `/<default>/...` is not generated and resolves as unknown);
 *  * and which locale a **gateway read** carries (`override`, for an unprefixed path — see
 *    `localeForPath`).
 */
export interface EldraLocaleRouting {
  /** The locale served unprefixed. `undefined` when the site configures none. */
  default: string | undefined;
  /** Every locale the site serves, `default` first. Empty when it configures none. */
  supported: readonly string[];
  /** The locales that live under a path prefix: `supported` without `default`. */
  prefixed: readonly string[];
  /**
   * What `eldra.locale` / `ELDRA_LOCALE` asked for, normalised — the locale every gateway read
   * carried before prefixes existed, and still the locale an unprefixed read carries.
   */
  override: string | undefined;
}

/**
 * Resolve the routing above.
 *
 * `eldra.locale` keeps exactly the meaning it had: an override of the **default** locale for a
 * single-locale build. So when it names one of the organisation's supported locales, that locale
 * is the one served at `/` and the others are the prefixed ones; when it names something else —
 * or the organisation publishes no locales at all — nothing about the URLs changes and the value
 * is still forwarded on every read, which is what a site deployed against one locale of a
 * multi-locale organisation has always done.
 *
 * The match is case-insensitive and the **stored spelling wins**: `ELDRA_LOCALE=IS-is` selects
 * `is-IS`, so every path, `lang` attribute and `?locale=` on the site uses the one spelling the
 * organisation configured.
 */
export function resolveLocaleRouting(
  locales: StoreLocales | null,
  override?: string | null
): EldraLocaleRouting {
  const configured = normalizeLocale(override);
  if (locales === null) {
    return {
      default: configured,
      supported: configured === undefined ? [] : [configured],
      prefixed: [],
      override: configured,
    };
  }
  const matched = matchLocale(configured, locales.supported);
  const defaultLocale = matched ?? locales.default;
  return {
    default: defaultLocale,
    supported: [defaultLocale, ...locales.supported.filter((locale) => locale !== defaultLocale)],
    prefixed: locales.supported.filter((locale) => locale !== defaultLocale),
    override: configured,
  };
}

/**
 * The locale `path`'s first segment names, or `undefined` when it names none.
 *
 * Matched case-insensitively against the **prefixed** locales only, and answered in the stored
 * spelling: a visitor typing `/IS-is/about` lands on the same content as `/is-IS/about`, while
 * `/<default>/about` matches nothing and resolves as the unknown path it is.
 */
export function localePrefixOf(path: string, routing: EldraLocaleRouting): string | undefined {
  const segment = path.replace(/^\/+/, '').split('/', 1)[0] ?? '';
  return segment === '' ? undefined : matchLocale(segment, routing.prefixed);
}

/** `path` with its locale prefix removed, if it has one. Always starts with `/`. */
export function stripLocalePrefix(path: string, routing: EldraLocaleRouting): string {
  const locale = localePrefixOf(path, routing);
  if (locale === undefined) return path;
  const rest = path.replace(/^\/+/, '').slice(locale.length);
  return rest === '' || rest === '/' ? '/' : rest.startsWith('/') ? rest : `/${rest}`;
}

/**
 * The locale a **gateway read** for `path` must carry, or `undefined` for "the site's default".
 *
 * A prefixed path reads its own locale; an unprefixed one reads whatever `eldra.locale` asked for,
 * which is `undefined` on the overwhelming majority of sites. Deliberately **not** the resolved
 * default locale: a site that configured no override has never sent one, the gateway's own default
 * is the same document, and sending it would change every request on every existing site for no
 * change in the answer.
 */
export function localeForPath(path: string, routing: EldraLocaleRouting): string | undefined {
  return localePrefixOf(path, routing) ?? routing.override;
}

/**
 * The **active content locale** on `path` — what `<html lang>`, the language switcher, the
 * message-set lookup and every `Intl` format use. `undefined` only on a site that configures none.
 */
export function activeLocaleForPath(path: string, routing: EldraLocaleRouting): string | undefined {
  return localePrefixOf(path, routing) ?? routing.default;
}

/**
 * `path` as it is spelled under `locale`: unprefixed for the default locale, prefixed for every
 * other one. Any prefix `path` already carries is replaced, so this is also how the switcher turns
 * the page a visitor is on into the same page in another language.
 */
export function localePathFor(
  path: string,
  locale: string | undefined,
  routing: EldraLocaleRouting
): string {
  const base = stripLocalePrefix(path, routing);
  const target = matchLocale(locale, routing.prefixed);
  if (target === undefined) return base;
  return base === '/' ? `/${target}` : `/${target}${base}`;
}

/**
 * One same-site href under `locale`, leaving everything else exactly as it was.
 *
 * **Idempotent**, and that is load-bearing rather than defensive: a destination can pass through
 * more than one of the places that prefix (a resolved `link` field handed to a router link, say),
 * and a second prefix would produce `/is-IS/is-IS/products/x` — a path nothing on the site
 * answers. An href whose first segment is already one of the site's locales is returned unchanged.
 *
 * Untouched: anything that is not a path (`https://…`, `mailto:`, `#main`, a protocol-relative
 * `//host/path`), and every path on a site with no prefixed locales. The query and fragment ride
 * along unparsed — only the path part is rewritten.
 */
export function localeHref(
  href: string,
  locale: string | undefined,
  routing: EldraLocaleRouting
): string {
  const target = matchLocale(locale, routing.prefixed);
  if (target === undefined) return href;
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const cut = href.search(/[?#]/);
  const path = cut === -1 ? href : href.slice(0, cut);
  const rest = cut === -1 ? '' : href.slice(cut);
  const segment = path.replace(/^\/+/, '').split('/', 1)[0] ?? '';
  if (segment !== '' && matchLocale(segment, routing.supported) !== undefined) return href;
  return path === '/' ? `/${target}${rest}` : `/${target}${path}${rest}`;
}

/** The stored spelling of `candidate` in `locales`, matched case-insensitively. */
function matchLocale(
  candidate: string | null | undefined,
  locales: readonly string[]
): string | undefined {
  const wanted = normalizeLocale(candidate);
  if (wanted === undefined) return undefined;
  const lower = wanted.toLowerCase();
  return locales.find((locale) => locale.toLowerCase() === lower);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
