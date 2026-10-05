/**
 * The kit's own href allowlist, re-exported under the name this theme's blocks
 * already call: ordinary site links are allowed, executable and opaque URL
 * schemes are not. One implementation, in `@eldrajs/theme-core`, so a block
 * and the link resolver can never disagree about what is safe.
 */
export { safeLinkHref as safeHref } from '@eldrajs/theme-core/links';

/**
 * A destination the site itself owns — a path (`/shop`) or an in-page hash
 * (`#main`). These are the links that should route client-side, which is what
 * `@eldrajs/ui`'s `Link` does when it is given Nuxt's `<NuxtLink>` as `as`
 * (see `app/components/EldraRouterLink.vue`); everything else (an absolute URL,
 * `mailto:`, `tel:`) is a document navigation and stays a plain `<a>`.
 *
 * Call it on the output of `safeHref`, never on a raw field value.
 */
export function isInternalHref(href: string): boolean {
  return href.startsWith('/') || href.startsWith('#');
}

/**
 * The site's own search results page — the page `pages/search.page.json` seeds, and
 * `@eldrajs/ui`'s `SearchBar`/`SearchModal` default `action`.
 *
 * Named here rather than in each block because **two** blocks point at it: the `search` block (its
 * own form, its popular-search chips, its "see all" link) and the `navigation` block (the header's
 * inline field, the search overlay's form, and the overlay's "See all N results" row, which
 * `SearchModal` builds from the `action` it is given). They have to agree about the path, and —
 * since both must prefix it for the page's own locale — about the fact that there is exactly one
 * path to prefix.
 *
 * Put it through `useEldraLocale().path()` at the point of use. These are form actions and library
 * hrefs with no `EldraRouterLink` in their path, so nothing else will do it for them.
 */
export const SEARCH_PATH = '/search';

/** One query's URL on that page: what a chip, a "see all" row and a submit all resolve to. */
export function searchQueryHref(query: string): string {
  return `${SEARCH_PATH}?q=${encodeURIComponent(query)}`;
}
