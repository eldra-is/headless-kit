# Themes

A theme is a Nuxt (or other framework) site whose pages are built from **blocks**: a `blocks/`
directory of `blocks/<apiId>/{block.json,Block.vue,mock.json}`, scanned at build time into a
manifest that Studio's page builder and Core's CMS schema both read. `block.json` declares a
block's fields (and optional migrations, slots); `Block.vue` renders it; `mock.json` supplies the
default data Studio shows before a page has real content. The scan output — the theme manifest,
`.eldra/manifest.json` — is what `eldra-theme deploy` uploads alongside the built static site; Core
ingests it to create or update the org's `block`-tagged CMS schemas. Git is version control for the
theme's code; the manifest is the sync channel, not the other way around.

## Theme id and schema ownership

Every theme declares a stable **theme id** in its `package.json`, beside the keys the scanner
already reads:

```json
{
  "name": "@acme/shop-theme",
  "version": "1.0.0",
  "eldra": { "themeId": "shop", "defaultLocale": "en-US" }
}
```

- `eldra.themeId` is **required**. It has the block `apiId` grammar (`^[a-z][a-z0-9-]{1,48}$`),
  and `catalog` is reserved. There is no derivation from the package name: renaming the package
  must not change who owns the theme's content. A missing or invalid id fails the plugin build,
  `eldra-theme validate` and `eldra-theme deploy` with `package.json: eldra.themeId — …`.
- The scanner emits it as `manifest.theme.id`, and `manifestVersion` is `2`. Core rejects a
  manifest that is not v2 or has no `theme.id`.
- Core stores the theme's block **schemas** as `<themeId>:<blockApiId>` (`shop:hero`) and stamps
  every schema and entry the deploy creates with the theme id, so two themes in one organisation
  never clash (`shop:hero`, `starter:hero`) and Studio can tell a theme's content from the
  merchant's own.
- **Everything the theme authors stays bare.** `block.json`, the manifest's block ids, a layout
  node's `apiId`, a slot's `allowedBlockApiIds`, `data-eldra-schema` and the overlay's
  `theme:block-clicked` all keep the bare `hero`. Only the wire spelling of an entry's
  `schemaApiId` (and of `/cms/v1/schema/{schemaApiId}/entry`) carries the prefix.
- The runtime strips the prefix of **its own** theme (the manifest's `theme.id`, which
  `virtual:eldra/manifest` carries into the build), never "any prefix": `catalog:product` and
  another theme's `starter:hero` are not this theme's blocks. `getBlockSchemaApiId(entry)` returns
  the bare id; `@eldrajs/theme-core` exports the two pure helpers `blockApiIdOf(schemaApiId,
themeId)` (wire to bare) and `themeSchemaApiId(blockApiId, themeId)` (bare to wire), and
  `registerBlockFields(fields, themeId)` registers the id for the block-field lookups inside
  theme-core. `@eldrajs/theme-nuxt` does that for you.
- Code that reads a block's entries through the SDK passes the **wire** id:
  `client.getEntries('shop:hero')`. A custom (merchant-owned) schema a route points at stays bare.

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
`editor:theme-messages` (a theme-message override save — see
[Design tokens](theme-design-tokens.md)'s "Messages" section), `editor:select-block`,
`editor:rich-text-editing`. Every message is wrapped in a versioned envelope
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

**A read the gateway could not answer is not a route that is missing**, and `useEldraPage()` keeps
them apart: a failed resolution sets `error` while `page` and `template` stay null, so a theme draws
its error branch rather than its not-found shell. On the **server** such a route is answered `500`,
and Nitro writes no file for a non-200 route — so a page the gateway could not be asked about is
absent from the artifact and named in the prerender log, instead of being baked in as a convincing
"Page not found" under a path a visitor can reach. Add `nitro.prerender.failOnError` if a build must
not ship without every page; the status alone turns a wrong page into a missing one, and that flag
turns a missing one into a failed build. Its real exposure is about twice the route count, because
each page's `_payload.json` is prerendered too and resolves the route again. A build with no
`ELDRA_GATEWAY_URL` / `ELDRA_ORG_ID` is exempt from both and still renders the static shell, which
is what a scaffold build exists to produce.

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

## Content locales and locale-prefixed routing

An organisation configures the content locales it publishes in. `@eldrajs/theme-nuxt` reads them
once during the build (`runtimeConfig.public.eldra.locales`, typed as `StoreLocales` from
`@eldrajs/theme-nuxt/locales`) and serves the **default locale at `/`** with every other supported
locale under a path prefix:

```
/products/ash-glaze-mug        the default locale
/is-IS/products/ash-glaze-mug  the same page, same slug, read with locale=is-IS
```

The first path segment selects the locale — matched case-insensitively, canonicalised to the
spelling the organisation stored — and the rest of the path resolves exactly as it does unprefixed.
`/<default-locale>/…` is deliberately **not** generated and resolves as an unknown path, because the
default locale lives at `/` only and two URLs for one page compete with each other.

**Path segments are not translated.** A page keeps its default-locale slug under every prefix, so
the prerender pass lists each content path once and writes it once per locale: pages, route
templates, catalog routes and any seeded static pages alike. An organisation serving `en-US` and
`is-IS` therefore gets `/cart` and `/is-IS/cart`, `/products/x` and `/is-IS/products/x`, and so on.

`<html lang>` and a `rel="alternate" hreflang` link per supported locale (plus `x-default` for the
unprefixed path) are written by the module, on every page. A theme adds nothing for either.

Everything else a theme needs is one composable, auto-imported beside `useEldraPage`:

```vue
<script setup lang="ts">
const { active, defaultLocale, supported, name, path, switchPath, select } = useEldraLocale();
</script>
```

- `active` is the page's locale (the prefix's, or the one a Studio preview is driving); `null` on a
  site whose organisation configures none.
- `supported` is every locale the site serves, `defaultLocale` first. A language switcher renders
  only when it holds more than one — one option is not a choice.
- `name(locale)` is that locale's own name ("íslenska (Ísland)"), resolved **on the server** and
  carried in the payload: `Intl.DisplayNames` is ICU data and a renderer and a browser need not
  have the same of it, so a page that let each side compute its own labels would hydrate into a
  mismatch and repaint.
- `path(href)` puts the active locale's prefix on one same-site destination, and is **idempotent** —
  a destination may pass through more than one prefixer.
- `switchPath(locale)` is the page the visitor is on, spelled in another language — query and
  fragment included, so a switch on `/search?q=mug` keeps the search; `select(locale)` navigates
  there.

It lives on the theme context rather than in a Nuxt composable so a **block** reaches it through the
same single `inject` it already uses — a block has to render in a Storybook story and a unit mount
with no router anywhere. Outside a themed app, and on a single-locale site, every answer is the
one-unprefixed-site answer and `path()` is the identity, so a block reads it with no branch.

**Every gateway read on a prefixed route carries that `locale`** — the page, the route template,
the entry, the catalog object, and (in the starter) the storefront's own catalog, search and order
reads. An unprefixed route carries whatever `eldra.locale` asked for and nothing more, which is
`undefined` on almost every site: that locale's content is what the gateway answers without a
`locale`, so sending it would change every request an existing site makes without changing one
answer.

`eldra.locale` / `ELDRA_LOCALE` keeps the meaning it always had — an override of the **default**
locale. Naming one of the organisation's supported locales moves that locale to `/` and prefixes the
others; naming anything else, or deploying against an organisation with no locales, changes no URL
and is still forwarded on every read.

An organisation with no configured locales, a site built without gateway credentials and a failed
read all behave exactly as every theme did before this existed: one unprefixed site, no switcher.

### Links keep the language

`useEldraLink()` resolves a `link` field's href under the active locale, and a theme's own
router-link component should put every internal destination through `path()` once — the starter's
`app/components/EldraRouterLink.vue` is the reference, and because it is the component
`@eldrajs/ui`'s `Link`/`Button` are given as `as`, one place carries the rule for the whole theme.
Both rewrites are idempotent, so the two cannot compound into `/is-IS/is-IS/…`.

Two kinds of destination need prefixing by hand, because no router is in their path: a real
`<form action>` (a no-JavaScript submit) and an href a component renders as a plain `<a>` without
taking an `as` (a toast action, say).

## Seeding default templates and pages

A theme can ship the pages a site starts with. `@eldrajs/theme-nuxt`'s `eldra.templates` (forwarded
to `@eldrajs/vite-plugin-theme`, which validates it and writes it into `.eldra/manifest.json`)
declares at most **8** route templates Core seeds a site with on its **first** deploy — a pattern
that already has a template on the site is left alone, so a merchant's edits are never overwritten
— and, in the same list, at most **16** static **page** seeds, each a Page at `/<slug>`.

```ts
// nuxt.config.ts
eldra: {
  templates: [
    {
      routePattern: '/products/:slug',
      schemaApiId: 'catalog:product',   // or 'catalog:collection', 'catalog:category', or 'home'
      title: 'Product',
      blocks: [{ id: 'product-detail', apiId: 'product-detail', data: { /* … */ } }],
      // layout?: a one-column document, generated from `blocks` when omitted
      // header?: false / footer?: false to leave a role out of that generated layout
    },
    {
      // A static page instead of a template: one key, no pattern, no layout.
      // `blocks` *is* the page, in document order.
      page: { slug: 'cart' },
      title: 'Your cart',
      blocks: [
        { apiId: 'announcement-bar', data: { /* … */ } },
        { role: 'header' },          // the site's shared header, placed here
        { apiId: 'breadcrumbs', data: { /* … */ } },
        // `required` makes the node Core creates locked: reorderable and
        // editable, but the author cannot delete it or move it out of the page.
        { apiId: 'cart', data: { variant: 'page' }, required: true },
        { role: 'footer' },
      ],
    },
  ],
  templateRoles: {
    header: { apiId: 'navigation', data: { /* … */ } },
    footer: { apiId: 'footer', data: { /* … */ } },
  },
}
```

- `schemaApiId` is one of `catalog:product`, `catalog:collection`, `catalog:category` or `home`.
  The three `catalog:*` ids are **not** CMS schemas: the template is resolved against the public
  catalog, which is why a catalog seed's pattern must be a static prefix plus a trailing parameter.
  A product or collection seed's parameter is `:slug` — one segment, looked up by slug. A
  **category** seed's is the catch-all `:path*` and its `slugField` is `path`: a category is
  addressed by its canonical path, the slugs of its ancestors root first then its own
  (`/categories/billinn/bilstolar`), so the parameter matches one or more segments and carries them
  joined with `/`. Canonical only — a leaf on its own, a wrong parent or a trailing extra segment is
  the theme's not-found shell, never a redirect. `*` is allowed nowhere else in a pattern.
  A `home` seed's pattern is exactly `/`.
- `blocks[].data` is a seed in the same shape as a block's `mock.json`, and is held to the same
  rule: a media field is either absent or `{ assetId: <uuid> }` (demo imagery belongs in
  `preview.json`). Every `apiId` must be a block the theme ships, ids must be unique and match
  `^[a-z][a-z0-9-]{0,47}$`. Core creates a seed's entries **published**, so a seed also has to
  satisfy publish validation — in particular it cannot leave a `required` field without a value.
  The scanner does not check that (it validates the write-side media rule only), so a theme whose
  block marks a media field required has to seed a real asset id for it, or leave that block out
  of its seeds; see how the starter handles it in
  [Seeded templates and pages](starter-kit.md#seeded-templates-and-pages).
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
- A **page** seed names `page: { slug }` instead of `schemaApiId`/`routePattern`; a seed declares
  one target or the other, never both. The slug is the whole path (`cart` → `/cart`) and obeys
  Core's own rule, `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`. There is no `layout` and there are no node
  ids: the `blocks` array **is** the page in document order, and Core lays it out in one column.
  An entry is either a **block** — `{ apiId, data, required? }` — or a placement of one of the
  site's two shared **regions**, `{ role: 'header' | 'footer' }`, which carries no data of its own
  (the block behind it is `templateRoles`, and Core resolves the placement to the site's own
  reusable component so every page shares one header). A region may sit anywhere in the order,
  which is what lets an announcement bar precede the header; at most one of each per page, and only
  where the theme declares that role. `required: true` locks the node Core creates — the author
  reorders it and edits its fields; delete and "move out of the page root" are refused — and it is
  a page seed's only, never a route template's. Page seeds are emitted as
  `pageSeeds[] { slug, title, blocks: [{ type, data, required? } | { type: "@header" | "@footer" }] }`,
  where a block's `type` is its apiId and the two `@` types are reserved.
- The **home** seed is unchanged and is **not** a page seed: it stays the `templates` entry it has
  always been, which Core maps to the site's root Page itself, so the home seed on the wire is
  byte-identical to the one every theme has emitted. A page seed may not claim the slug `home`
  while that template seed exists.
- A page seed is created **published**, like a template's entries, and a page whose slug the
  organization already has is skipped — so a theme that adds a page seed gets it on the next deploy
  of an existing site without touching the pages that are there.
- All three keys are omitted from the manifest when a theme declares nothing, so a theme that seeds
  nothing keeps emitting the file shape it always has.

`eldra-theme validate` does not see either option — it validates the theme directory without
loading `nuxt.config.ts`. The build is what writes them, so check `.eldra/manifest.json` (or run
the site's own tests) after changing a seed. The starter does all of this in
`examples/starter-nuxt/app/templates.ts`; see
[Seeded templates and pages](starter-kit.md#seeded-templates-and-pages) for how it builds its
three template seeds and its three page seeds out of the sample page fixtures.

## Forms

A theme does not own its forms: a merchant builds them on Studio's Forms page and the platform
serves them (`GET /site/v1/forms/{key}`, submissions to `POST /site/v1/forms/{key}/submissions`, with
a honeypot, a per-IP rate limit and optional Cloudflare Turnstile). A theme does two things.

**Seed the forms a fresh site needs.** `formSeeds` (an `eldra.formSeeds` option, validated by
`@eldrajs/vite-plugin-theme`'s `validateFormSeeds` and written to the manifest) lists up to eight
forms:

```ts
formSeeds: [
  {
    key: 'newsletter', // ^[a-z][a-z0-9-]{0,39}$, "subscriptions" is reserved
    name: 'Newsletter',
    fields: [
      { id: 'email', type: 'email', required: true, label: { 'en-US': 'Email address', 'is-IS': 'Netfang' } },
    ],
    // notify: email the merchant; confirm: email the visitor a copy; subscribe: a double opt-in list
    actions: { notify: false, confirm: false, subscribe: { list: 'newsletter' } },
    success: { message: { 'en-US': 'Check your inbox to confirm.', 'is-IS': 'Kíktu í pósthólfið.' } },
  },
],
```

Field types are `text`, `email`, `phone`, `textarea`, `select` (with `options`), `checkbox`, `consent`
(a checkbox whose `required` means it must be checked); `validation` takes `minLength`, `maxLength` and a `pattern`. `confirm` and `subscribe` need an
email field. Core creates a seeded form only when its key is absent and never over a merchant's edits
(an unedited seeded form is refreshed on a theme version bump). The starter's seeds are
`examples/starter-nuxt/app/formSeeds.ts`.

A seed cannot name an email template: `notify`, `confirm` and `subscribe` are flags, and Core maps each to
its own form design (`form_notification`, `form_confirmation`, `form_subscribe_confirm`). A visitor can
type any address into a form, so Core refuses a form action that would send anything but a form design
or the organisation's own custom template (`SITE_FORM_TEMPLATE_NOT_ALLOWED`); the plugin refuses a
`templateRef` on a seed before the deploy.

**Place them.** The starter's `form` block renders any form by key. `@eldrajs/theme-nuxt` also reads
the definition of every seeded key — and every key in its `forms` option, for a merchant-made form a
block names by default — at build time, fail-soft per key, and bakes them into the site
(`useEldraForms()`); a key it could not read is fetched when the page opens. The baked copy is
only the first paint and the prerendered HTML: a definition is **live** on the platform (no rebuild
when a merchant edits a form), so the starter's storefront re-reads it in the browser and replaces
the baked one, which is what renders a field added in Studio and the spam-check widget when
Turnstile was turned on after the build. Seeds are validated exactly as Core validates them (field
types `text`, `email`, `phone`, `textarea`, `select`, `checkbox`, `consent`; `validation` only on
text-like fields; RE2 patterns with no lookaround or backreferences; ids compared ignoring case,
`all` reserved; lengths up to 8000; a success redirect is a `/` path or an http(s) URL), because
Core refuses a whole manifest over one bad seed. From code,
`@eldrajs/sdk`'s `client.forms` (`get`, `submit`, `confirm`, `unsubscribe`) is the same API.

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

## Site icons

A site's icons are the merchant's brand, not the theme's, so a merchant sets them in Studio (Site
settings): one media-library image that is a **raster** (PNG, JPEG or WebP), square and at least
512 px (SVG is refused: the image transform cannot rasterise it), a background colour, an optional
theme colour and an optional short name. `@eldrajs/theme-nuxt` reads that setting at build time
(`GET /site/v1/site-icons`, the same fail-soft read as the design tokens). The answer carries
`iconUrl` and `icons`, the URLs of five variants that the **media worker** renders on demand (always
`image/png`) from that one image; Core builds the URLs, so the kit never learns the suffixes:

| Variant         | What it is                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| `favicon32`     | 32 px, transparent (`/icon-32`)                                                                       |
| `appleTouch180` | 180 px flattened onto the background colour (`/icon-180?bg=`; iOS has no alpha)                       |
| `icon192`       | 192 px, transparent, for the web app manifest                                                         |
| `icon512`       | 512 px, transparent, for the web app manifest                                                         |
| `maskable512`   | artwork at 60% of the side, centred on the background colour (`/icon-maskable-512?bg=`), Android-safe |

**The build does no image processing.** It writes one file, `site.webmanifest` (same-origin JSON,
as browsers require: `name`, `short_name`, `icons` with the maskable one marked `purpose:
"maskable"`, `theme_color`, `background_color`, `display: "standalone"`, `start_url`), to the static
output (`.output/public`) when the server build is compiled and again after prerender. The module
adds `<link rel="icon" type="image/png" sizes="32x32">` and `<link rel="apple-touch-icon">` pointing
at the media URLs, `<link rel="manifest">` and `<meta name="theme-color">` to **every** page's head.
No `favicon.ico` is generated: the theme's own `public/favicon.ico` stays the root fallback.

Defaults are resolved by the build, not by Core: the theme colour is the primary design token
(the platform's resolved catalog, else the theme's own `tokens.json`), and the short name is the
site name (the platform SEO read's `site.name`, else the `app.head.title` of the Nuxt config, else the theme's `package.json` name) cut to 12
characters. With no site name known, the manifest simply omits `name`/`short_name`.

**When nothing is written.** An unset icon, a failed read or a response that is not the documented
shape all end the same way: one warning at most (none for "unset"), no file, no tags. The theme's
own `public/` files and head tags are then what ships.

**Things a theme should know.**

- When icons are set they replace the theme's own `icon`/`shortcut icon`/`apple-touch-icon`/
  `manifest` links in `app.head` (and its `theme-color` meta), so the merchant's icons never sit
  beside the theme's. Tags a theme adds at runtime with `useHead` are not touched, so keep icon tags
  in `app.head` or leave the files in `public/` with no tags, as the starter does.
- `nuxi dev` writes nothing — there is no static output to serve it from.
- The icon images are served by the media CDN, not the storefront's origin, so they are only as
  available as the CDN. `sharp` was removed from `@eldrajs/theme-nuxt`: native image processing in
  every theme build was fragile (optional binaries, libc/arch, install scripts) and is unnecessary
  now that the media worker renders the variants.

## Built-in analytics

A deployed Nuxt theme reports to the organisation's Studio analytics with no code: `@eldrajs/theme-nuxt`
loads the Eldra tracker (`<gateway>/js/script.js`, the tag `analyticsTrackerScript` in `@eldrajs/sdk`
describes) and the platform counts pageviews, including client-side navigations (the script patches
`history.pushState`, so no router hook is involved).

**When it runs.** The build decides: only a **production** build (`ELDRA_BUILD_TARGET=production`) with an
organisation id (`ELDRA_ORG_ID`) and no opt-out reports. Never `nuxi dev`, never a preview build (the
Studio preview host's), never a credential-less build. The browser decides the last thing: the tag is
added by a client plugin, not written into the HTML, because the preview serves the same bundle in an
iframe; a document framed by an allowed Studio origin (`studioOrigins`) never loads it. A live site
embedded in someone else's frame still reports.

**Options.** `eldra: { analytics }` in `nuxt.config.ts`:

| Option                       | Effect                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analytics: false`           | Opts out (also `{ enabled: false }` or `ELDRA_ANALYTICS=off`). No tag, and `useEldraAnalytics().track` is a no-op.                                                                                      |
| `analytics: { eventOrigin }` | A bare origin (`https://shop.example`, no path) that receives events instead of the gateway: becomes the tag's `data-api`. Also `ELDRA_ANALYTICS_ORIGIN`. An invalid value is warned about and ignored. |

The module does not serve a first-party proxy; `eventOrigin` only names one that exists. Without it,
events go to the gateway cross-origin, which ad blockers may drop.

**Events must come from a registered origin.** The platform drops an event whose `Origin` is not one of the
organisation's storefront origins (Studio, General settings, _Storefront origins_) without an error, so a
new domain or a `*.pages.dev` URL shows nothing until it is registered.

**Custom events.** `useEldraAnalytics()` (auto-imported) returns `{ track(name, props?), enabled }`. Props
are stringified, `null`/`undefined` ones are dropped, and they are cut to the platform's limits (30
entries, keys 60 bytes, values 300 bytes; names 120). It queues up to 50 events until the script has
loaded and is a no-op on the server and wherever tracking is off. `pageview` is rejected: the script owns
it. The framework-free core is `createAnalytics` in `@eldrajs/theme-core`.

The starter theme sends these (`examples/starter-nuxt/app/storefront/analytics.ts`, a wrapper around the
storefront source, so no block sends or forgets one). Values are major units with `.` as the decimal
separator, `currency` is ISO 4217:

| Event              | Props                                                       | Sent when                                                                                                        |
| ------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `product_view`     | `product_id`, `handle`, `variant_id`, `value`, `currency`   | The product page's product loads, once per visit                                                                 |
| `add_to_cart`      | `product_id`, `variant_id`, `quantity`, `value`, `currency` | A cart add succeeded, or a quantity went up, or a removal was undone                                             |
| `remove_from_cart` | same                                                        | A cart line removal succeeded, or a quantity went down                                                           |
| `begin_checkout`   | `cart_id`, `item_count`, `value`, `currency`                | The shopper follows the Check out link                                                                           |
| `search`           | `query` (trimmed, 100 characters), `result_count`           | A search result for the typed query settled (800 ms), once per query across the header panel and the search page |

`purchase` is never sent from the browser; it belongs to the order module. The platform stores these events
but Studio's analytics do not report them yet.

**What is collected, for your privacy notice.** Technically: no cookie and nothing in `localStorage` or
`sessionStorage` is written by the tracker or by `useEldraAnalytics`. A visitor is a salted hash that
rotates daily, computed by the platform from the request, never an identifier kept in the browser. A
browser can opt itself out by setting `localStorage.eldra_ignore = 'true'`, which the script reads and
never writes. Whether that means no consent banner is a legal judgment for the site owner; this section
states only the technical facts. (The starter's own wishlist and recently-viewed lists use
`localStorage` for the shopper's features, not for analytics.)

## More

- [The deploy loop](theme-deploy-loop.md) — `eldra-theme init` → run locally → `validate` →
  `generate` → `deploy`, what the deploy report's lines mean, and publish-triggered rebuilds.
- [Starter kit conventions](starter-kit.md) — the primitive layer (`app/components/ui/`), the block
  contract (fields, mock vs. preview, variants, slots, migrations), strings, Storybook and generated
  previews, testing and accessibility gates.
- [Design tokens](theme-design-tokens.md) — `tokens.json`, the generated CSS variables, the
  optional Tailwind v4 layer (and why a CSS-level `@import` of
  `virtual:eldra/tailwind-theme.css` doesn't work — the starter's fallback route is documented
  there), and how a Studio design-token override reaches a deployed site.
- [Theme texts](theme-texts.md) — `i18n/<tag>.json`, what Studio can override, the fallback chain,
  and exporting an override back into the theme.
- [Block field migrations](theme-field-migrations.md) — renaming fields across block versions.
- [Reusable page components](theme-reusable-components.md) — the reusable-component projection and
  how `EldraLayout` resolves placements.

The repository's own [`CLAUDE.md`](../CLAUDE.md#how-a-theme-meets-the-page-builder) has the
agent-context version of all of this in one place: the manifest keys and what each becomes on the
platform, the preview bridge's full message list, the build-time platform reads, the virtual
modules, and the kit's own invariants.

Deploying: `eldra-theme deploy` pushes a static build to Eldra with a site deploy token
(`ELDRA_DEPLOY_TOKEN`); see [The deploy loop](theme-deploy-loop.md) and
`packages/theme-cli/README.md`.
