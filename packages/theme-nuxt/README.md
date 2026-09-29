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

## Development

`src/runtime/**` is compiled by Nuxt at build/dev time, not by `tsc` — it imports `nuxt/app` and
Nuxt's virtual modules (`#imports`, `virtual:eldra/*`), which only exist inside a Nuxt build
graph. `tsconfig.json`'s `include` is narrowed to `src/index.ts` and `src/module.ts` (the module
entry, which only imports resolvable packages — and, through it, the framework-free runtime files
it shares with the composable) so `pnpm typecheck` proves the part `tsc` can
actually resolve; the runtime files that reach for Nuxt are still type-checked as part of
`nuxt-module-build build`
and by consuming Nuxt apps (see `examples/starter-nuxt`'s `nuxi typecheck`).
