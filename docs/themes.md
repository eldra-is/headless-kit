# Themes

A theme is a Nuxt (or other framework) site whose pages are built from **blocks**: a `blocks/`
directory of `blocks/<apiId>/{block.json,Block.vue,mock.json}`, scanned at build time into a
manifest that Studio's page builder and Core's CMS schema both read. `block.json` declares a
block's fields (and optional migrations, slots); `Block.vue` renders it; `mock.json` supplies the
default data Studio shows before a page has real content. The scan output — the theme manifest,
`.eldra/manifest.json` — is what `eldra-theme deploy` uploads alongside the built static site; Core
ingests it to create or update the org's `block`-tagged CMS schemas. Git is version control for the
theme's code; the manifest is the sync channel, not the other way around.

## Package map

```
@eldrajs/theme-core        framework-free: bridge, stega, overlay runtime, layout, rich-text
                            positions, design tokens, image framing
  ├── @eldrajs/theme-vue          Vue 3 bindings (EldraBlockZone, EldraLayout, EldraRichText, useEldra)
  ├── @eldrajs/vite-plugin-theme  scans blocks/, validates, emits the manifest + virtual modules
  │     └── @eldrajs/theme-cli        eldra-theme: init/scaffold/validate/types/deploy
  └── @eldrajs/theme-nuxt       Nuxt module: wires vite-plugin-theme + theme-vue + the gateway
                                client + the Studio bridge into a Nuxt 4 site
```

`theme-core` carries all the logic and depends on nothing else in this repo. `theme-vue` and
`theme-nuxt` are thin framework bindings over it. `vite-plugin-theme` depends only on `theme-core`
(scanning and validation are framework-agnostic on purpose — a future non-Vue theme still gets them
for free). `theme-cli` depends on `theme-core` and `vite-plugin-theme` so `validate`/`types` reuse
the same scanner the build uses. `theme-nuxt` is the only package that depends on all three.

## The framework-free rule

`theme-core`, `vite-plugin-theme` and `theme-cli` (like `sdk` and `rich-text`) never import `vue`,
`nuxt`, `#app`, `#imports`, `@vue/*` or `nuxt/*`. `scripts/check-framework-free.mjs` enforces this
in `lint:check` and in CI — a framework import creeping into the framework-free layer is a design
error, not a lint nit, because it means the wrapper packages stopped being thin. `theme-vue` may
import only `vue` and `@eldrajs/theme-core`; `theme-nuxt` may import only Nuxt, `vue`, and the
three `@eldrajs/theme-*`/`vite-plugin-theme` packages.

Block and manifest **validation** lives in `@eldrajs/vite-plugin-theme` (`scanTheme`, used by the
Vite plugin on every build) and is re-exported through `@eldrajs/theme-cli`'s `validate`/`types`
commands, so `pnpm validate` and a CI build run the identical check without a CLI-specific
reimplementation. Both stay framework-agnostic: a non-Vue theme could call `scanTheme` directly.

## The Studio bridge

`@eldrajs/theme-core/bridge` is the postMessage protocol between a theme running in Studio's page
builder preview iframe and the Studio editor host. Messages come in two families: `theme:*` is what
the theme sends — `theme:ready`, `theme:route-changed`, `theme:block-clicked`,
`theme:rich-text-selection`, `theme:slots-rendered`, and so on — and `editor:*` is what Studio
sends back — `editor:hello`, `editor:init`, `editor:content-update`, `editor:design-tokens`,
`editor:select-block`, `editor:rich-text-editing`. Every message is wrapped in a versioned envelope
(`makeEnvelope`/`parseEnvelope`, `BRIDGE_VERSION`) that a theme on an older protocol version simply
ignores rather than misinterprets.

`@eldrajs/theme-core/overlay` builds on the bridge to drive in-place editing — the runtime that
turns bridge messages into DOM selection, rich-text input classification and structural drag
handling inside the preview iframe. `@eldrajs/theme-vue`'s `useEldraPreview`/`startEldraPreview` and
`@eldrajs/theme-nuxt`'s generated CSP `frame-ancestors` header are what actually wire a theme up to
receive it; a non-Vue binding would call the same bridge and overlay functions directly.

## Running the starter

```bash
pnpm --filter starter-nuxt dev
```

with `ELDRA_GATEWAY_URL` (the org's public CMS gateway) and `ELDRA_ORG_ID` set in the environment.
See [examples/starter-nuxt](../examples/starter-nuxt) for the full README, including blocks, slots,
build/deploy and CI wiring examples, and [Starter kit conventions](starter-kit.md) for the
primitive layer, the block contract, Storybook, and the accessibility/testing harness a customer
inherits from `eldra-theme init`.

## Seeding default templates

A theme can ship the pages a site starts with. `@eldrajs/theme-nuxt`'s `eldra.templates` (forwarded
to `@eldrajs/vite-plugin-theme`, which validates it and writes it into `.eldra/manifest.json`)
declares at most **8** route templates Core seeds a site with on its **first** deploy — a pattern
that already has a template on the site is left alone, so a merchant's edits are never overwritten.

```ts
// nuxt.config.ts
eldra: {
  templates: [
    {
      routePattern: '/products/:slug',
      schemaApiId: 'catalog:product',   // or 'catalog:collection', or 'home'
      title: 'Product',
      blocks: [{ id: 'product-detail', apiId: 'product-detail', data: { /* … */ } }],
      // layout?: a one-column document, generated from `blocks` when omitted
      // header?: false / footer?: false to leave a role out of that generated layout
    },
  ],
  templateRoles: {
    header: { apiId: 'navigation', data: { /* … */ } },
    footer: { apiId: 'footer', data: { /* … */ } },
  },
}
```

- `schemaApiId` is one of `catalog:product`, `catalog:collection` or `home`. The two `catalog:*`
  ids are **not** CMS schemas: the template is resolved by looking `:slug` up in the public
  catalog, which is why a catalog seed's pattern must be a static prefix plus a trailing `:slug`.
  A `home` seed's pattern is exactly `/`.
- `blocks[].data` is a seed in the same shape as a block's `mock.json`, and is held to the same
  rule: a media field is either absent or `{ assetId: <uuid> }` (demo imagery belongs in
  `preview.json`). Every `apiId` must be a block the theme ships, ids must be unique and match
  `^[a-z][a-z0-9-]{0,47}$`.
- `layout` is optional. Omitted, the scanner generates one flat column: the `header` role, the
  seed's blocks in order, the `footer` role — `header: false` / `footer: false` leave a role out.
  Declared, it is held to that same shape (one flex column of `reusable` and `block` nodes, every
  seed block placed, each role at most once) and rebuilt from its validated nodes, so nothing a
  theme added to a node reaches the manifest.
- `templateRoles` carries the block data behind those roles. It is **required** for any role a
  seed's layout places, and its `data` is validated exactly like a seed block's. On deploy Core
  creates one reusable component per role ("Header"/"Footer"), publishes it, assigns it to the
  site's role and points every seeded template's role node at it — so one header is shared by all
  of them rather than copied per page.
- Both keys are omitted from the manifest when a theme declares nothing, so a theme that seeds
  nothing keeps emitting the file shape it always has.

`eldra-theme validate` does not see either option — it validates the theme directory without
loading `nuxt.config.ts`. The build is what writes them, so check `.eldra/manifest.json` (or run
the site's own tests) after changing a seed. The starter does all of this in
`examples/starter-nuxt/app/templates.ts`; see
[Seeded templates](starter-kit.md#seeded-templates) for how it builds its three seeds out of the
sample page fixtures.

## Layout sizing and container queries

Blocks adapt to the width they are given with container queries: every block root is a
`@container` (`container-type: inline-size`) and the block's own `@tablet:`/`@content:` styles
measure it. That works for any block whose width is set by its parent — `fill`, `100%`, a fixed
length, a stretched flex-column or grid item — but `container-type: inline-size` also applies
inline-size _containment_, and a contained element has no intrinsic inline size at all. A block
whose width must be measured from its content (`fit-content`, or an unset width as a flex-row
item, or anything but a fixed length inside such a node) would therefore collapse to 0px.

The layout CSS `@eldrajs/theme-core` generates handles this per node and per breakpoint. For an
intrinsically sized block it turns containment off on the block root (`.<node>>*{container-type:
normal}`), and it makes every determinately sized container node — the document root always
among them — a query container. The block then sizes to its content, and its container queries
resolve against the nearest determinate ancestor: the width of the region it sits in, which is
the closest thing to "its own width" a content-sized box can be measured by (a `fit-content`
call-to-action in a 400px column renders its narrow layout; the same block in a 1200px row
renders its wide one, shrunk to its content). A determinate block keeps its own root as the query
container, exactly as a block rendered outside a layout does. Nothing in a block has to change
for this; a block that nests its own `@container` deeper than the root keeps it.

## More

- [Starter kit conventions](starter-kit.md) — the primitive layer (`app/components/ui/`), the block
  contract, strings, Storybook and generated previews, testing and accessibility gates.
- [Design tokens](theme-design-tokens.md) — `tokens.json`, the generated CSS variables, the
  optional Tailwind v4 layer (and why a CSS-level `@import` of
  `virtual:eldra/tailwind-theme.css` doesn't work — the starter's fallback route is documented
  there).
- [Block field migrations](theme-field-migrations.md) — renaming fields across block versions.
- [Reusable page components](theme-reusable-components.md) — the reusable-component projection and
  how `EldraLayout` resolves placements.

Deploying: `eldra-theme deploy` pushes a static build to Eldra with a site deploy token
(`ELDRA_DEPLOY_TOKEN`); see `packages/theme-cli/README.md`.
