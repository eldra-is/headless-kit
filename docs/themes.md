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
`theme:rich-text-selection`, `theme:slots-rendered`, `theme:block-hovered` (the hovered block's
identity and rect, edit mode only, for an editor affordance anchored to that block — see
`BridgePayloads` in `bridge/protocol.ts`), and so on — and `editor:*` is what Studio
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

## The route key a theme's `app.vue` must pass

A theme renders every CMS route through one catch-all page, and its `app.vue` must hand
`<NuxtPage>` the route key `@eldrajs/theme-nuxt` auto-imports:

```vue
<!-- app/app.vue -->
<template>
  <NuxtPage :page-key="eldraRouteKey" />
</template>
```

`nuxi generate` writes each route as `<route>/index.html`, and static hosts disagree about which URL
that file lives at: some serve `/products/ash-glaze-mug`, others answer it with a 308 to
`/products/ash-glaze-mug/`. When the URL a visitor lands on differs from the path the page was
prerendered at, Nuxt re-navigates between the two while the page hydrates — and a catch-all page's
_default_ key interpolates the splat parameter, so the two spellings key differently and Vue
destroys and re-creates the page and every block on it. Every block's `setup` runs a second time,
and every read a commerce block makes goes out twice; only one of the two page instances ever
mounts, so neither the DOM nor an `onMounted` side effect shows it. `eldraRouteKey` keys by the
canonical path — the identity `useEldraPage()` already resolves content under — so the move changes
nothing. The starter does this; a theme scaffolded before it was added should.

## Route resolution on a generated site

A `nuxi generate` build answers its own routes in the browser. Nuxt ships the list of paths it
prerendered (its app manifest), and `useEldraPage()` reads it: a path in that list is resolved from
the route payload Nuxt has already fetched — no gateway read, and no loading state on a navigation
between two prerendered routes — and a path that is **not** in it is the not-found shell
immediately, rather than after listing every page and every route template to reach the same answer.

New content therefore needs a rebuild to become a route, which is how a deployed site already works:
publishing from Studio triggers one.

Dynamic resolution stays exactly as it was wherever the build cannot be the authority — inside a
Studio preview frame (the route may be a draft), on `nuxi dev`, and on an SSR deployment, all of
which prerender nothing.

## Links

A `link` field stores a destination the platform understands — a product, collection, category,
entry or page by id, or an external URL — rather than a typed-out href that silently rots when the
target is renamed. Resolve one to an href with `useEldraLink()`:

```vue
<script setup lang="ts">
import { useEldraLink } from '@eldrajs/theme-vue';

const props = defineProps<{ entry: EldraBlockEntry<'navigation'> }>();
const link = useEldraLink();
</script>

<template>
  <nav>
    <template v-for="(item, index) in props.entry.data.links ?? []" :key="index">
      <a v-if="link(item)?.href" :href="link(item)!.href!">{{ link(item)!.label }}</a>
      <span v-else-if="link(item)?.label">{{ link(item)!.label }}</span>
    </template>
  </nav>
</template>
```

`useEldraLink()` returns `(value) => ResolvedLink | null`, where `ResolvedLink` is
`{ href, label, newTab, group, children }`. Two rules matter to a theme:

- **`href` is null whenever nothing addressable was found** — the target is gone, carries no slug,
  or the site has no route template serving its kind. Render the label as plain text then (or
  nothing), never a dead anchor.
- **`label` is the value's own when an author set one, else the target's own title, else null.** A
  row with no label at all is a row with nothing to show.

`children` is one level deep and never more, which is what a mega-menu column needs and all the
grammar allows. A child's `group` is its column heading.

`@eldrajs/theme-nuxt` fills the context inside the same `useAsyncData` call that resolves the route,
so a `nuxi generate` build bakes every href into the page's payload and a prerendered page resolves
them with no client request. The lookups are one batched read per target type, and a read that fails
leaves those targets unknown — the links pointing at them render unlinked rather than failing the
page.

The framework-free half is `@eldrajs/theme-core/links`: `resolveLink(value, context)`,
`linkTargetKeys(value)` (the `` `${_type}:${id}` `` keys to look up) and `safeLinkHref(value)`, the
kit's single href allowlist. A wrapper for another framework fills the same context and re-exports
the same three.

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
  `^[a-z][a-z0-9-]{0,47}$`. Core creates a seed's entries **published**, so a seed also has to
  satisfy publish validation — in particular it cannot leave a `required` field without a value.
  The scanner does not check that (it validates the write-side media rule only), so a theme whose
  block marks a media field required has to seed a real asset id for it, or leave that block out
  of its seeds; see how the starter handles it in
  [Seeded templates](starter-kit.md#seeded-templates).
- `layout` is optional. Omitted, the scanner generates one flat column: the `header` role, the
  seed's blocks in order, the `footer` role — `header: false` / `footer: false` leave a role out.
  Declared, it is held to that same shape (one flex column of `reusable` and `block` nodes, every
  seed block placed, each role at most once) and rebuilt from its validated nodes, so nothing a
  theme added to a node reaches the manifest.
- `templateRoles` carries the block data behind those roles. It is **required** for any role a
  seed's layout places, and its `data` is validated exactly like a seed block's. On deploy Core
  creates one reusable component per role ("Header"/"Footer"), publishes it, assigns it to the
  site's role and points every seeded template's role node at it — so one header is shared by all
  of them rather than copied per page. At render time the runtime consumes that role-resolved
  placement inside the template: Core's route-template read carries a
  `reusableComponentProjection` exactly as a page read does, `useEldraPage()` hands the template
  document's projection to `EldraLayout`, and the component expands in place with the same
  identity a placement on a page gets — see
  [Reusable page components](theme-reusable-components.md#route-templates).
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

## Hiding a node on some devices

A layout node's `style.visible` is a responsive boolean (`{ normal, tablet?, mobile? }`, inherited
from the wider breakpoint down like every other responsive value). Where it resolves to `false` the
generated layout CSS hides the node at that breakpoint. It emits two rules rather than a plain
`display: none` — `LAYOUTCLASS` below stands for the node's generated
`eldra-layout-<sha256 of its id>` class:

<!-- prettier-ignore -->
```css
@media (max-width: 767px) {
  .LAYOUTCLASS:not([data-eldra-edit-mode]) { display: none; }
  .LAYOUTCLASS[data-eldra-edit-mode]:not([data-eldra-edit-mode] *) { opacity: 0.35; }
}
```

Every selector is a **same-element** selector — the attribute conditions apply to the layout node
itself, never to its children — and each adds an attribute selector's specificity on top of the
class, so both outrank the node's own `.LAYOUTCLASS` rule (its `display: flex`/`grid`) wherever
they land in the stylesheet.

On a published site, in preview and in static generation nothing carries `data-eldra-edit-mode`, so
the node is hidden. Under the Studio bridge in **edit** mode the overlay runtime sets that attribute
on every node a framework binding marked `data-eldra-hidden` — so the author still sees the node,
dimmed, and can select, move and unhide it. The marker is applied after mount, like every other
overlay decoration, so server and client render the same DOM; `data-eldra-hidden` itself (the
breakpoints the node is hidden at, space separated — `@eldrajs/theme-core`'s
`hiddenLayoutBreakpoints(style)`) is rendered unconditionally and carries no styling of its own.

`:not([data-eldra-edit-mode] *)` on the dimming rule is why the 35 % does not compound. The marker
goes on every element carrying a hidden node's class — it has to, because the `display: none` gate
is per element and a binding may put a node's class on more than one nested element (a slot child's
wrapper and the block element inside it both carry it) — and `opacity` multiplies through nesting
where `display: none` was idempotent. Dimming only a marked element with no marked ancestor applies
the 35 % once per hidden subtree, so a hidden node inside a hidden node, and a hidden slot child,
all land at 0.35 rather than 0.1225.

What the overlay reports to Studio as `hiddenAtBreakpoint: true` on `theme:block-clicked` and
`theme:blocks-rendered` is strictly the block's **own** node: it reads that node's
`data-eldra-hidden` and resolves the viewport against the theme's own breakpoints. A block hidden
only because an ancestor node is hidden does not carry the flag — unhiding it is a different act
from unhiding its parent.

A wrapper for another framework has one thing to do here: render
`data-eldra-hidden="<breakpoints>"` on the layout node element. Everything else — the CSS, the
marker, the bridge message — is already in `@eldrajs/theme-core`.

### Reserved names

`--eldra-*` CSS custom properties, `data-eldra-*` attributes and `eldra-*` class names are the
kit's. A theme, a block or a design-token file must not define its own under those prefixes: the
generated stylesheets write them, and the overlay runtime reads them to decide what is hidden, what
is selected and what is being edited. Everything a theme is expected to set is a documented token
(see [Design tokens](theme-design-tokens.md)); anything else under those prefixes is internal and
may change in a minor release.

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
