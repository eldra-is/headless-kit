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
