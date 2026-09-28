# @eldrajs/theme-nuxt changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- New `eldra.templates` option, forwarded to `@eldrajs/vite-plugin-theme`: the default page
  templates a site is seeded with on its first deploy. See that package's changelog for the seed
  shape and its validation.

- Feat: catalog-backed route templates render. A route template whose `schemaApiId` is
  `catalog:product` or `catalog:collection` now resolves its object **by slug** through the public
  catalog instead of a CMS entry, and `useEldraPage()` returns a new `catalog`
  (`{ kind: 'product' | 'collection'; slug }`, `null` for every other route) beside `page`,
  `template` and `entry`. The bound `entry` is `{ id, data }` where `data` holds the documented
  binding paths — product: `slug`, `title`, `description`, `status`, `categoryId`, `tags`,
  `variants[]` (`sku`, `price`, `compareAtPrice`, `optionValues[]`), `images[]` (`url`, `alt`);
  collection: `slug`, `title`, `description`, `productCount`, `image` (`url`, `alt`) — every key
  always present, whatever the response omitted. A slug the catalog does not know renders the
  theme's not-found shell, not its error branch.
- Feat: generation prerenders one route per active catalog object, paging the public list endpoints
  at 100 per page (products filtered to `status:eq:ACTIVE` server-side, and any inactive record the
  gateway still reports dropped client-side). A slug that cannot become a route, or one that
  collides with a route already generated, is skipped with an `[eldra] skipped …` warning naming it
  and the build continues — merchant catalog data must not be able to fail a whole deploy.
- First release under the `@eldrajs` scope, moved from the private `@eldra/theme-nuxt` package.
