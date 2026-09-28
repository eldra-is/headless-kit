# @eldrajs/theme-nuxt changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- Feat: `useEldraPage()` exposes `reusableComponentProjection` on a **route-template** route. Core
  attaches the projection to whichever document the read returned, and a route resolves exactly one
  of the two — a static route a `page`, a dynamic one a `template` — so the composable now reads the
  page's, else the template's. It is a fallback and never a merge: `@eldrajs/theme-core` refuses a
  projection carrying a binding the rendered document does not place, so a page's projection on a
  template route would fail the layout closed. Preview drafts already reach a placement inside a
  template the same way they reach one inside a page; nothing there needed lifting. The public
  route-template read carries no projection — it is pre-expanded and redacted like a public page
  read — so a prerendered template route renders its header and footer with no component or site
  identity anywhere in the HTML or the payload.
- Fix: a blank locale is no longer forwarded to the gateway. A site that configures none carries
  `""` — that is what `runtimeConfig.public.eldra.locale` holds, and what an unset `ELDRA_LOCALE`
  becomes — which went out as `?locale=` on every read and came back a 400 from the collection
  lookup. Every boundary that forwards a locale (`useEldraPage()`, route resolution, the catalog
  reads, the module's `prerender:routes` pass and the public runtime config it writes) now treats
  a blank or whitespace-only locale as no locale at all, so the request carries no `locale`
  parameter and the gateway serves the site's default. A blank `locale` from the Studio preview
  bridge falls back to the configured one instead of shadowing it.

- Removed the unused `catalogTemplateRoutes` helper from the runtime (never exported from the
  module's public entry, and `prerender:routes` cannot use it: it lists the catalog once per
  **kind** and maps once per template, so a list-and-map-in-one call would refetch the whole
  catalog for every template). Compose `listCatalogDocs` + `catalogDocRoutes` instead.

- New `eldra.templates` and `eldra.templateRoles` options, forwarded to
  `@eldrajs/vite-plugin-theme`: the default page templates a site is seeded with on its first
  deploy, and the block data behind the `header`/`footer` roles those seeds place. See that
  package's changelog for the seed shape and its validation.

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
