import type { EldraContext, EldraLocaleState } from '@eldrajs/theme-vue';
import { reactive } from 'vue';
import { normalizeLocale } from './locale';
import {
  activeLocaleForPath,
  localeDisplayName,
  localeHref,
  localePathFor,
  type EldraLocaleRouting,
} from './locales';
import { canonicalRoutePath } from './routePath';

/** The slice of Nuxt's router this state reads — the committed route, and one navigation. */
export interface LocaleRouter {
  /** `fullPath` where the router has one; `path` is the fallback for a stub that does not. */
  currentRoute: { value: { path: string; fullPath?: string } };
  push: (path: string) => unknown;
}

/**
 * The theme context's locale state for a Nuxt site: the active locale derived from the route it is
 * committed to, and the three path helpers derived from the site's routing.
 *
 * **The router's committed route, not `useRoute()`.** This state is built in a plugin, outside any
 * page, and what a link rendered right now should be prefixed with is the route the app is
 * actually on. `useEldraPage` pins a *page component's* own path for its lifetime for a different
 * reason (see its `createActivePath`), and that pin must not reach the links: a page being
 * navigated away from would keep prefixing for the locale it is leaving.
 *
 * **A preview's locale wins.** Studio drives the content locale through the bridge, and in edit
 * mode that is the locale the author is editing — the path in a preview frame may not name it at
 * all. Falling back to the path is what makes the very first render, before the bridge has said
 * hello, still correct for the artifact's own URL.
 */
export function createNuxtEldraLocaleState(
  routing: EldraLocaleRouting,
  preview: EldraContext['preview'],
  router: () => LocaleRouter | undefined,
  /**
   * Each locale's own name, **resolved once on the server and carried in the payload** — see
   * `localeDisplayName` for why neither side may compute its own. A locale the map does not name
   * (one that only exists client-side) falls through to that function.
   */
  names: Readonly<Record<string, string>> = {}
): EldraLocaleState {
  const currentPath = (): string => canonicalRoutePath(router()?.currentRoute.value.path ?? '/');
  /**
   * The same route **with its query and fragment** — what a language switch has to carry over, so a
   * shopper on `/search?q=mug` or a filtered collection page lands on the page they were looking
   * at rather than its empty state. The locale itself is never read from here: `active` wants the
   * path alone.
   */
  const currentHref = (): string => {
    const route = router()?.currentRoute.value;
    const full = route?.fullPath ?? route?.path ?? '/';
    const cut = full.search(/[?#]/);
    return cut === -1
      ? canonicalRoutePath(full)
      : canonicalRoutePath(full.slice(0, cut)) + full.slice(cut);
  };
  const active = (): string | null =>
    normalizeLocale(preview.locale) ?? activeLocaleForPath(currentPath(), routing) ?? null;
  // A **getter**, not a `computed`. A computed caches its first evaluation together with the
  // dependencies that evaluation touched, and the first read can happen before Nuxt has installed
  // the router (`useHead` registers its entry inside this plugin) — which would cache the default
  // locale with no dependency on the route at all, so no navigation would ever change it again. A
  // getter on a `reactive` target runs on every access and is tracked by whatever effect reads it.
  return reactive({
    get active() {
      return active();
    },
    defaultLocale: routing.default ?? null,
    supported: routing.supported,
    name: (locale: string) => names[locale] ?? localeDisplayName(locale),
    path: (href: string) => localeHref(href, active(), routing),
    switchPath: (locale: string) => localePathFor(currentHref(), locale, routing),
    select: (locale: string) => {
      void router()?.push(localePathFor(currentHref(), locale, routing));
    },
  }) as EldraLocaleState;
}

/**
 * `<link rel="alternate">` for every locale the site serves, plus `x-default` for the unprefixed
 * path — the whole set, on every page, which is what tells a search engine that these URLs are one
 * page in several languages rather than duplicates of each other.
 *
 * Empty on a site with one locale or none: a single-locale site has no alternates, and emitting
 * one that points at itself says nothing.
 *
 * The hrefs are **paths**, not absolute URLs. A prerendered artifact does not know the origin it
 * will be served from — the host that generated it is a build machine — and a baked-in wrong
 * origin would be worse than a relative one.
 */
export function localeAlternates(
  path: string,
  routing: EldraLocaleRouting
): Array<{ rel: 'alternate'; hreflang: string; href: string }> {
  if (routing.supported.length < 2) return [];
  const alternates = routing.supported.map((locale) => ({
    rel: 'alternate' as const,
    hreflang: locale,
    href: localePathFor(path, locale, routing),
  }));
  return [
    ...alternates,
    {
      rel: 'alternate' as const,
      hreflang: 'x-default',
      href: localePathFor(path, undefined, routing),
    },
  ];
}
