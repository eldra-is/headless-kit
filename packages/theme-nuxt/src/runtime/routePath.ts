/**
 * One request path, reduced to the identity the theme resolves content for.
 *
 * A generated site is written as `<route>/index.html`, and static hosts disagree about which URL
 * that file lives at: some serve `/products/ash-glaze-mug`, others answer it with a 308 to
 * `/products/ash-glaze-mug/` (the deployed Eldra preview host is one of them). Both are the same
 * page — the same CMS route, the same prerendered payload — so everything keyed by the path must
 * agree, or the browser treats the page it was *served* as a different route from the one it was
 * *built* as.
 *
 * That is not cosmetic. Nuxt's own hydration path compares `window.location` with the path the
 * payload was prerendered at, and when they differ it re-navigates twice (`hasDeferredRoute` in
 * `nuxt/dist/pages/runtime/plugins/router.js`) — which re-creates the page component, and with it
 * every block on it, so every block's `setup` runs a second time and every read it makes goes out
 * again. Canonicalising here is what makes those two navigations land on the same route identity
 * and change nothing.
 */
export function canonicalRoutePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * The route key a theme's catch-all page should give `<NuxtPage>` (`:page-key="eldraRouteKey"`),
 * auto-imported by this module.
 *
 * Nuxt's default key for a catch-all route interpolates the splat parameter, so
 * `/products/ash-glaze-mug` and `/products/ash-glaze-mug/` produce **different** keys
 * (`products,ash-glaze-mug` vs `products,ash-glaze-mug,`) and Vue destroys and re-creates the page
 * when the router moves between them. Keying by the canonical path instead means the page — and
 * the block tree under it — survives that move.
 */
export function eldraRouteKey(route: { path: string }): string {
  return canonicalRoutePath(route.path);
}
