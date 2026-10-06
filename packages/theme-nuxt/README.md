# @eldrajs/theme-nuxt

Nuxt module for Eldra themes: wires `@eldrajs/vite-plugin-theme`, the gateway client, draft
overlays and the Studio preview bridge into a Nuxt 4 site. It prerenders every published page and
dynamic route from the CMS, writes the generated `.eldra/manifest.json` and the CSP
`frame-ancestors` header the Studio preview bridge needs, and exposes `useEldraPage` for resolving
the current route's page/template/entry.

```bash
pnpm add @eldrajs/theme-nuxt
```

## Usage

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@eldrajs/theme-nuxt'],
  eldra: {
    gatewayUrl: process.env.ELDRA_GATEWAY_URL,
    orgId: process.env.ELDRA_ORG_ID,
    studioOrigins: ['https://acme.eldracms.com'],
  },
});
```

```vue
<script setup lang="ts">
import { EldraLayout } from '@eldrajs/theme-vue';
const { page, layout, blocks } = useEldraPage();
</script>
<template>
  <main>
    <EldraLayout v-if="page && layout" :layout="layout" :blocks="blocks" />
  </main>
</template>
```

## `eldraRouteKey` — required on your `<NuxtPage>`

Give your `app.vue` the route key this module auto-imports:

```vue
<!-- app/app.vue -->
<template>
  <NuxtPage :page-key="eldraRouteKey" />
</template>
```

This is not cosmetic on a **generated** site. `nuxi generate` writes each route as
`<route>/index.html`, and static hosts disagree about which URL that file lives at — some serve
`/products/ash-glaze-mug`, others answer it with a redirect to `/products/ash-glaze-mug/`. When the
URL the visitor lands on differs from the path the page was prerendered at, Nuxt re-navigates
between the two while the page hydrates; a catch-all page's default route key interpolates the
splat parameter, so those two spellings key differently and Vue destroys and re-creates the page —
and every block on it. Each block's `setup` then runs twice, so every read a commerce block makes
goes out twice. Only one of the two instances ever mounts, so nothing in the DOM gives it away.

`eldraRouteKey(route)` keys by the canonical path — the same identity `useEldraPage()` resolves
content under — so the move is a no-op. Themes scaffolded before this was added should add the
binding.

## Route resolution on a generated site

On a **static build in a browser**, `useEldraPage()` resolves routes from the build, not from the
gateway. `nuxi generate` ships the list of paths it prerendered (Nuxt's app manifest,
`/_nuxt/builds/meta/<buildId>.json`), and that list answers both questions the resolver used to ask
the gateway:

- **The path is in the build.** Its page, template and entry are in the `_payload.json` Nuxt's own
  payload plugin loads in `router.beforeResolve`, before the page component exists — so a client
  navigation between two prerendered routes renders the destination in the same tick, with `pending`
  never true and no gateway read at all.
- **The path is not in the build.** It does not exist: `useEldraPage()` returns the empty route
  (`page === null && template === null`) straight away, so the theme draws its not-found shell
  without the five reads it used to take to conclude the same thing. A route published since the
  build is not in the artifact either — publishing triggers a rebuild, which is what makes the build
  the authority.

Three situations keep the old dynamic resolution, and are the reason the manifest is consulted
rather than assumed:

- **Studio preview.** Inside an allowed `studioOrigins` frame the route may be a draft, an
  unpublished page or a path no build has ever contained, so every resolution is live — from the
  first render, before the bridge has even said hello.
- **`nuxi dev`.** The dev server ships a manifest that prerendered nothing.
- **An SSR deployment** (`nuxt build` plus a Node server), for the same reason: nothing is in the
  build, so an empty prerendered list means "this build prerendered nothing", never "this route does
  not exist".

### A resolution that **failed** is not a route that is missing

The empty route above is an answer: there is no such page. A read the gateway could not answer is
not, and `useEldraPage()` keeps the two apart — a failed resolution carries `error` on the resolution
itself (`ResolvedEldraRoute.error`), so `error` is non-null while `page`/`template` are null and a
theme can draw its error branch instead of its not-found shell. The error lives on the resolution
rather than inside the composable because `useAsyncData` keeps **one** entry per route key and runs
only the first caller's handler: a theme that calls `useEldraPage()` twice on a page (a plugin for
the catalog route beside the page component) would otherwise see the failure in one call and an
ordinary empty route in the other.

**On the server such a route is answered `500`.** Nitro's prerenderer marks a non-200 route failed
before it writes anything, so a page the gateway could not be asked about is absent from the
artifact and named in the prerender log, instead of being written as the theme's not-found shell
under a path a visitor can reach. Pair it with `nitro.prerender.failOnError` if a build must not ship
without every page — the status alone turns a wrong page into a missing one, and that flag turns a
missing one into a failed build. Note the real exposure is about twice the route count: with
`crawlLinks: false` Nitro still prerenders each page's own `_payload.json`, which resolves the route
again.

A build with **no `ELDRA_GATEWAY_URL` / `ELDRA_ORG_ID`** is exempt from both: there every read fails
by definition, so such a route resolves to the plain empty route with no `error` and the theme
renders its static shell, which is the whole point of a scaffold build.

This is also why `eldraRouteKey` above is required rather than advisory: one page component per
canonical route is what lets the composable resolve the route its page is being created for. Nuxt
hands a page its own route through an injection private to Nuxt's app module, which a composable
shipped in a package cannot reach; `useEldraPage()` therefore reads the router's committed route and
pins it for the page's lifetime.

## Catalog-backed route templates

A route template whose `schemaApiId` is `catalog:product` or `catalog:collection` is backed by the
store's catalog rather than a CMS schema: the module prerenders one route per active product or
collection, and `useEldraPage()` resolves the object by the slug in the path.

```vue
<script setup lang="ts">
const { template, entry, catalog, layout, blocks } = useEldraPage();
// catalog is { kind: 'product' | 'collection', slug } here, and null on every other route.
// entry.data carries the binding paths a catalog template addresses —
// product: slug, title, description, status, categoryId, tags, variants[], images[]
// collection: slug, title, description, productCount, image
</script>
```

A slug the catalog does not know resolves to the empty route, so the theme renders its not-found
shell. During generation a slug that cannot become a route is skipped with a warning naming it and
the build continues.

`studioOrigins` must be explicit — this module never supplies a broad fallback origin for the
preview bridge. See [examples/starter-nuxt](../../examples/starter-nuxt) for a full theme and
[docs/themes.md](../../docs/themes.md) for the integration guide.

## What the store sells in

The module reads the organisation's commerce settings once, during the build, and puts them on the
runtime config beside the gateway URL and the org id. `StoreCommerce` is exported for exactly this,
so the key's shape is not re-declared per theme:

```ts
import type { StoreCommerce } from '@eldrajs/theme-nuxt/commerce';

const raw = (useRuntimeConfig().public.eldra as { commerce: StoreCommerce | null | '' }).commerce;
const commerce: StoreCommerce | null = typeof raw === 'object' ? raw : null;
```

`commerce` is `null` when the store has not configured commerce, when the site is built without
gateway credentials, or when the read failed — the build prints one warning (naming the cause when
there was one) and finishes, because a currency nobody can fetch should cost a symbol, not a deploy.
A theme that formats prices should treat that as "render a plain number", never as a currency to
guess at; the starter does exactly that in `app/storefront/money.ts`.

One detail of Nuxt's own serialisation matters when you read the key: a `null` public runtime-config
value reaches the page as an **empty string**, so on a store that published nothing `commerce` is
`''` rather than `null` (the module's `locale` does the same). Treat anything that is not an object
as "no currency" — not as a malformed record — and only complain about a record that is present but
incomplete.

The module supplies no override of its own, on purpose: the platform publishes the currency the
catalogue's prices are actually in, so a theme-side setting could only ever relabel real amounts.
(Nuxt's own public-runtime-config environment overriding — `NUXT_PUBLIC_ELDRA_COMMERCE_CURRENCY` and
its siblings — still applies wherever Nuxt reads runtime config at request time, as it does to every
other public key. On a prerendered site there is nothing for it to override: the value is baked into
each page's payload at build.) It is read at build rather than in the browser because every price on
a prerendered page is formatted against it.

## Which locales the site serves

The module reads the organisation's configured content locales once, during the build, and puts
them on the runtime config beside `commerce`. `StoreLocales` is exported for exactly this:

```ts
import type { StoreLocales } from '@eldrajs/theme-nuxt/locales';

const raw = (useRuntimeConfig().public.eldra as { locales: StoreLocales | null | '' }).locales;
const locales: StoreLocales | null = typeof raw === 'object' ? raw : null;
```

`locales` is `{ default, supported }` with `supported` default-first, or `null` — for an
organisation that has configured none, for a site built without gateway credentials, and for a read
that failed (that last one, and only that one, prints a warning naming the cause). `null` means the
site behaves exactly as it did before locales existed: one unprefixed site, no language switcher.
The same empty-string serialisation note as `commerce` applies, which is what the `typeof` guard
above is for.

A theme rarely needs to read the key itself: the module turns it into routing (see below) and
`useEldraLocale()` is the composable that answers "which locale is this page, and what are the
others".

## Locale-prefixed routing

With two or more locales the site serves the default locale at `/` and every other supported
locale under a path prefix — `/is-IS/products/ash-glaze-mug`. The first path segment selects the
locale (matched case-insensitively, canonicalised to the spelling the organisation stored) and the
rest of the path resolves exactly as it does unprefixed; every gateway read made for that page
carries that `locale`. `/<default-locale>/…` is deliberately **not** generated and resolves as an
unknown path, because the default locale lives at `/` only.

Path segments are not translated: a page is at its default-locale slug under every prefix, so
`/is-IS/about` is the Icelandic rendering of the same document `/about` serves. The prerender pass
therefore lists each content path once and writes it once per locale — pages, route templates,
catalog routes and the seeded `cart`/`wishlist`/`search` pages alike.

`eldra.locale` / `ELDRA_LOCALE` keeps the meaning it always had: an override of the **default**
locale. Naming one of the organisation's supported locales moves that locale to `/` and prefixes
the others; naming anything else (or deploying against an organisation with no locales) changes no
URL and still forwards the value on every read.

The module gives every page `<html lang>` and a `rel="alternate" hreflang` link per supported
locale (plus `x-default` for the unprefixed path) on its own — a theme adds nothing for either.

```vue
<script setup lang="ts">
// Auto-imported, like `useEldraPage`.
const { active, defaultLocale, supported, name, path, switchPath, select } = useEldraLocale();

// `path()` prefixes one same-site destination for the active locale, and is idempotent.
const cartHref = computed(() => path('/cart'));
// `switchPath()` is the same page in another language, query and fragment included;
// `select()` navigates there.
</script>
```

`name(locale)` is that locale's own name ("íslenska (Ísland)") for a switcher's option label. It is
resolved **once, on the server**, and carried in the payload: `Intl.DisplayNames` is ICU data and a
renderer and a browser need not have the same of it — Node answers "íslenska (Ísland)" for `is-IS`
where a reduced-ICU browser build answers "Icelandic (Iceland)" — so a page that let each side
compute its own labels would hydrate into a mismatch and repaint.

Links are already handled where the kit owns them: `useEldraLink()` resolves a `link` field's href
under the active locale, and a theme's router-link component should put every internal `to`
through `path()` once (the starter's `app/components/EldraRouterLink.vue` is the reference).

## Development

`src/runtime/**` is compiled by Nuxt at build/dev time, not by `tsc` — it imports `nuxt/app` and
Nuxt's virtual modules (`#imports`, `virtual:eldra/*`), which only exist inside a Nuxt build
graph. `tsconfig.json`'s `include` is narrowed to `src/index.ts` and `src/module.ts` (the module
entry, which only imports resolvable packages — and, through it, the framework-free runtime files
it shares with the composable) so `pnpm typecheck` proves the part `tsc` can
actually resolve; the runtime files that reach for Nuxt are still type-checked as part of
`nuxt-module-build build`
and by consuming Nuxt apps (see `examples/starter-nuxt`'s `nuxi typecheck`).
