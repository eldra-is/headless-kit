# @eldrajs/theme-nuxt changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- **Category pages.** A route template whose `schemaApiId` is `catalog:category` is now resolved
  against the store's category tree. Its pattern ends in a catch-all parameter and its `slugField`
  is `path` (`/categories/:path*`), and a category is addressed by its **canonical path** — the
  slugs of its ancestors, root first, then its own (`/categories/billinn/bilstolar`). There is no
  read that takes a path, so the whole category list is read and the path's segments are walked down
  the tree by slug; **only the canonical path resolves**, so a leaf on its own, a wrong parent and a
  trailing extra segment are each the not-found shell rather than a redirect. `useEldraPage()`'s
  `catalog` is `{ kind: 'category', slug, path }` there — the leaf's slug and the whole path — and
  the resolved entry carries the binding paths `slug`, `title`, `path`, `ancestors[]` and
  `children[]`, plus `description` and `productCount` only when the catalog read carried them (the
  category model may have neither, and an invented key would bind a template to an empty value on
  every site without one).
- `prerender:routes` adds one route per **canonical** category path, times the site's locales, the
  same way it fans out collections. A category the list cannot place — no slug, or a parent the list
  does not hold — gets no route, and neither does the subtree under it: a path built over that gap
  addresses a different category.
- A `link` field pointing at a **category** now resolves to the canonical path. The category targets
  are read as one whole tree rather than in `id:in:` chunks, because a chunked read keyed on the
  wanted ids alone discards the ancestors the path is built from; a target the tree cannot place
  carries no path and renders as plain text rather than as a link the site answers with its
  not-found shell. A reader with no `listCategories` resolves none, exactly as before.

- **A route the gateway could not be asked about is no longer rendered as the not-found page.**
  `useEldraPage()`'s resolution failure now travels with the resolution itself rather than in the
  calling composable's own `error` ref: `useAsyncData` keeps one entry per route key and runs only
  the **first** caller's handler, so a theme that calls `useEldraPage()` twice on a page (a plugin
  for the catalog route beside the page component — which the starter does) saw the failure in one
  of them and an ordinary empty resolution in the other. That is indistinguishable from "there is
  no such page", so a transient gateway failure drew the theme's not-found shell, and `nuxi
  generate` wrote it to disk under a path a visitor can reach, with exit code 0. On the server such
  a route is now answered `500` as well, so Nitro writes no file for it and names it in the
  prerender list (pair it with `nitro.prerender.failOnError` to stop the build — its real exposure is
  about twice the route count, because each page's `_payload.json` is prerendered too and resolves
  the route again). A build with no `ELDRA_GATEWAY_URL` / `ELDRA_ORG_ID` is exempt from **both** the
  status and the error: there every read fails by definition, so such a route resolves to the plain
  empty route and the theme renders its static shell, exactly as it did before. The resolved route's
  new optional `error` field is set only for a failure — a genuine not-found (no match, or a 404 from
  the gateway) carries none, exactly as before — and `useEldraPage()`'s `error` is now typed
  `ComputedRef<string | null>`, which is what it has always been at runtime.

- **Locale-prefixed routing.** `runtimeConfig.public.eldra` now carries `locales` — the
  organisation's own `{ default, supported }` record, read once during the build, or `null` — and
  the module serves the default locale at `/` with every other supported locale under a path
  prefix (`/is-IS/products/ash-glaze-mug`). The first path segment selects the locale, the rest of
  the path resolves as it does unprefixed, and every gateway read for that page carries that
  `locale`; `/<default-locale>/…` is not generated and resolves as an unknown path. Path segments
  are not translated — a page keeps its default-locale slug under every prefix — so the prerender
  pass lists each content path once and writes it once per locale, seeded `cart`/`wishlist`/`search`
  pages included. The key's type ships as `StoreLocales` (`@eldrajs/theme-nuxt/locales`, a new
  subpath export beside `./commerce`), a new auto-imported `useEldraLocale()` answers which locale
  the page is and prefixes a destination for it, and the module writes `<html lang>` plus an
  `hreflang` alternate per locale (and `x-default`) itself. `useEldraLocale().name(locale)` is that
  locale's own name for a switcher's label, resolved **on the server** and carried in the payload —
  `Intl.DisplayNames` is ICU data and a renderer and a browser need not have the same of it, so a
  page that let each side compute its own labels would hydrate into a mismatch and repaint.
  `eldra.locale` / `ELDRA_LOCALE` keeps its meaning as an override of the **default** locale: naming a supported locale moves it to `/`,
  naming anything else changes no URL and is still forwarded on every read. An organisation with no
  locales, a site built without gateway credentials and a failed read all behave exactly as every
  site did before this: one unprefixed site, no switcher — and only the failed read prints a
  warning, because the other two are not mistakes.

- `eldra.templates` accepts static **page** seeds beside the route-template seeds it already took —
  `{ page: { slug }, title, blocks }`, where an entry of `blocks` is either a block
  (`{ apiId, data, required? }`) or a placement of the site's shared header or footer
  (`{ role: 'header' | 'footer' }`). See `@eldrajs/vite-plugin-theme`'s changelog for the grammar;
  this module only widens the option's type and forwards it.

- `useEldraPage` no longer replaces the page with an error alert for the first 401 of a preview
  read. A preview token is one hash per organization, so minting one anywhere else revokes the one
  a live preview is using; the editor answers `theme:request-failed` by minting again and
  re-sending `editor:init`, usually within a second, and reporting that first failure blanked the
  page for exactly that second — and, because every keystroke re-reads the drafts, produced one
  alert per keystroke with the page gone. The first failure is held back (what is on screen stays,
  rather than collapsing to the not-found shell) and the error is reported once a 401 arrives on a
  *newer* token — the retry failed too — or after a 10s grace window, so a preview nobody is going
  to recover still says so.

- `runtimeConfig.public.eldra` now carries `commerce` — `{ currency, taxInclusivePricing,
defaultTaxRate }`, or `null` — read once from the organisation during the build, so a prerendered
  page's prices are formatted in the currency the store actually sells in instead of one the theme
  guessed from the content locale. The key's type ships with the package as `StoreCommerce`, so a
  theme reading it does not hand-write the record (`@eldrajs/theme-nuxt/commerce`, a new subpath
  export — the package root's declarations are generated by `nuxt-module-build` and carry the module
  and its options only). A store with no commerce settings, a site built
  without gateway credentials and a read that failed all land on `null` with a single warning
  (`[eldra] the store publishes no currency — prices render as plain numbers`, plus the cause in
  brackets when the read itself failed); the build never fails over it. The module adds no
  environment override: the platform is the source, and a theme-side currency could only relabel
  real amounts. See the README for what a theme should do with `null`.

- The batched target reads behind a `link` field now page to the end of a result rather than
  stopping at the first hundred rows, and the category read asks for the ids it actually needs
  (`id:in:`, in chunks, like the product and collection reads) and keeps only those. A target lost
  past a page boundary renders as a link with no destination, which is indistinguishable from a
  deleted one; and a category tree read whole would otherwise put every category a site has into
  the prerendered payload of every page that links to one.

- The walk that finds which targets a page names reaches far deeper before it gives up, and says so
  when it does — naming the entry — instead of returning silently. The old bound could be reached
  by a link nested inside a composite inside a list, and the only symptom was a link that quietly
  had no destination.

- A `link` field's destinations now resolve to real hrefs on a generated site. Route resolution
  fills the theme context's `links` slice from the page and route-template lists it already reads,
  plus one batched read per target type for the objects the resolved document's blocks name — all
  inside the same `useAsyncData` call, so a `nuxi generate` build bakes every href into the page's
  payload and a prerendered page resolves them with no client request. A read that fails leaves
  those targets unknown: the links pointing at them render unlinked rather than failing the page.
  `useEldraPage()` also returns the slice as `links`.

- Fix: on a **generated** site in a browser, `useEldraPage()` now resolves routes from the build
  instead of the gateway. A path Nuxt prerendered (its app manifest ships the list) is read back out
  of the route payload Nuxt has already loaded, so a client navigation between two prerendered
  routes renders in the same tick — `pending` never true, no gateway read — and a path the build
  does not contain is the not-found state immediately, instead of after listing every page and every
  route template to reach the same answer. Studio preview (the route may be a draft), `nuxi dev` and
  an SSR deployment all keep the dynamic resolution they had. New pages need a rebuild to become
  routes, which is what publishing already triggers.

- Fix: a page component now resolves the route **it** is being created for. `useRoute()` inside a
  package resolves to Nuxt's app-level route, which `NuxtPage` syncs only after the destination
  page's `<Suspense>` has resolved — and a page's blocks are created inside that pending branch. So
  on every client navigation the destination page ran its `setup` under the route it was replacing:
  it rendered the **departing** page's blocks, ran every read on them a second time, and only then
  swapped to its own content. `useEldraPage()` now reads the router's committed route and pins it
  for the page's lifetime (the identity `eldraRouteKey` already gives `<NuxtPage>`); called outside
  a component — for a plugin's route context — it follows the committed route directly.

- Fix: a page served at a URL that differs from the one it was prerendered at only by a trailing
  slash is no longer built twice. A generated site is `<route>/index.html`, and a static host may
  answer `/products/ash-glaze-mug` with a redirect to `/products/ash-glaze-mug/`; Nuxt then
  re-navigates between the two paths while the page hydrates, and the catch-all route's default key
  differs between them — so the page, and every block on it, was destroyed and created again,
  running each block's `setup` (and every storefront read in it) a second time. `useEldraPage()` now
  watches the **canonical** path, the one its async-data key already used, and the module
  auto-imports `eldraRouteKey` for a theme to give `<NuxtPage>` (`:page-key="eldraRouteKey"`) so the
  page survives that move. Themes scaffolded before this should add the `page-key` binding; the
  starter does.

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
