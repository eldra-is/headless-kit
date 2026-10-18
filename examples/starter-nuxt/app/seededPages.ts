/**
 * The slugs of the pages this theme seeds (`PAGE_SEEDS` in `./templates.ts`, which reads files and
 * so cannot be imported at runtime). The storefront asks it whether a surface exists before it
 * advertises it: the `WebSite` markup names a `SearchAction` only when the `search` page is seeded.
 * `test/seededPages.spec.ts` fails when the two lists drift.
 */
export const SEEDED_PAGE_SLUGS: readonly string[] = ['cart', 'wishlist', 'search', 'products'];
