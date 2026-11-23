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

## Draft preview sessions

Studio's **Preview** and its share links open the theme's own deployment on a host of the preview
router's (`p-<session>.previews-{env}.eldra.dev`), not in the builder's iframe. `@eldrajs/theme-nuxt`
renders the organisation's drafts there, client-side.

- **Detection** (`src/runtime/previewSession.ts`): the page is a session when its host has the
  session shape. The router's `<meta name="eldra-preview" content="session">` is honoured only in
  `document.head`, and only on a session host or a local development host (`localhost`,
  `127.0.0.1`, `[::1]`, `*.localhost`, `*.test`), so a marker that reaches a storefront's page
  never turns it into a session. A server render and a prerender never are one; every other page,
  Studio's iframe included, runs exactly as before.
- **Reads.** `@eldrajs/theme-core`'s `enableSessionPreview({ proxyBase })` sends the five CMS reads
  same-origin to the router's `/__eldra/gateway/*`, `no-store` and `credentials: 'same-origin'`, with
  no credential header (the router holds the session in an HttpOnly cookie and adds `X-Org-Id` and
  `X-Preview-Session` itself). A CMS answer without `Eldra-Preview: draft` is refused rather than
  shown. Catalog reads stay on the gateway, published. No request ever carries `X-Preview-Token`.
- **Routes.** `useEldraPage()` answers no route from the build: the published payload only hydrates
  the prerendered page, every navigation (back to the first route included) reads the draft, and a
  page that exists only as a draft renders (opened directly, the host serves the build's not-found
  document and the app resolves it).
- **Which reads show drafts.** Right after hydration a session re-runs, **once**, every async data
  entry the server filled (the keys the payload carries a value for); entries the browser started on
  load are waited for, not run again. An entry that did not run on load (`immediate: false`: a form
  submit, a cart create) is never run by the session. The veil stays up until they have settled,
  for at most 15 s; after that the session ends in the unavailable notice, never the published
  page. So these are drafts:
  - `useEldraPage()`, and every `useEldraPage()` mounted later (they share the route's async data);
  - every `useAsyncData` / `useFetch` whose handler reads through the kit's client
    (`useEldra().client.getEntries(...)`, `getEntry`, `getEntryByUniqueField`,
    `resolveEntryListField`, `resolveEntryList`);
  - any client read through that client made after the session started.

  These stay **published** (or the build's), and a theme that needs them as drafts must move them
  into one of the above:
  - data the server render put anywhere but async data (`useState`, a plugin's own state, a
    module-level value) — it is hydrated and never read again;
  - a read that does not go through the kit's client (`$fetch` to the gateway, `@eldrajs/sdk`) —
    it carries no session;
  - a `useAsyncData` with a custom `getCachedData` that answers a `refresh:hook` from a cache
    (only possible with Nuxt's `experimental.granularCachedData`);
  - the build-time platform reads baked into the runtime config: design tokens (until site-service
    serves draft tokens, WS-1299), theme texts, forms, site icons, SEO, the site profile.

- **What a visitor sees.** The published prerender is never painted: the router puts an early hide
  at the top of every session document (WS-1376): while `<html>` has no
  `data-eldra-preview-ready`, a 12 s animation keeps the body `visibility: hidden` (nothing else
  hides it: a theme that turns animations off shows the page at once, with the router's notice,
  which fails open). The kit sets
  `data-eldra-preview-ready` on `<html>` as soon as its own veil (or the built-in fallback line) is
  mounted and covering the page, so from then on the kit's veil is what covers it. It sets it too
  on every way the session leaves the veil (the draft shown, a refusal, the 15 s bound, a render
  that failed, a client that cannot read drafts), in case the veil never mounted, so the router's
  rule never keeps a page hidden. When the animation ends the page shows, with a notice of the
  router's, if the kit never set it (its script failed); that 12 s is shorter than the 15 s
  the drafts may take, which is why the mounted veil, not the dropped one, lifts it. The veil, the
  banner and the built-in fallback line set `visibility: visible` on themselves, so they show while
  the body is still hidden (and whatever a theme's own rule does to the body later). Under the veil the app is `aria-busy` and inert; a
  "loading" line appears, and becomes a live region, only after half a second; the veil comes down
  when the draft is on screen. An exit banner links to the router's `/__eldra/preview/exit`. A
  refused session (401: invalid, revoked, expired; 403, 502, 503: unavailable) clears every async
  data entry, so neither the draft nor the published page stays in the document, makes the app
  inert and shows a notice, which takes focus once. The copy is Icelandic or English, after the
  page's language. The veil, banner and notices are plain DOM in a shadow root outside the Vue app,
  in a chunk an ordinary storefront never loads; if that chunk cannot be loaded, a plain built-in
  line of text (Icelandic or English, with the exit link) says what the session is doing instead.
- **Permanent DOM differences in a session**: a `<div data-eldra-preview-session>` appended to
  `<body>`, after the app, whose open shadow root holds the veil, the notice and the exit banner (the
  banner stays visible, fixed at the bottom); the router's `<meta name="robots" content="noindex,
nofollow">` and `<meta name="eldra-preview">` in the head, and right after them its early hide (a
  `<style>` and a `<noscript>` twin); `data-eldra-preview-ready` on `<html>` once the veil is
  mounted. While the veil is up,
  `aria-busy="true"` and `inert` on `#__nuxt`; after a refusal, `inert`. Once the draft is on
  screen, nothing inside `#__nuxt` differs from the published page, with the exceptions listed
  under "Parity" below.
- **Parity with the published page (WS-1358).** A session must render exactly what Publish puts
  live; the starter's `test/previewParity.browser.spec.ts` is the proof and the release gate
  (`pnpm test:parity`; part of `pnpm check`, and run again by `publish.yml` before any package is
  published). It generates the starter twice as production builds: a _pinned_ build made while
  older content was live, served by a stand-in router as a session whose draft reads answer the new
  content in Core's preview shape, and a _live_ build made after that content was published, served
  statically. Core's two read shapes come from one module (`test/support/previewParityContent.ts`);
  `@eldrajs/theme-core`'s `previewParityVectors.spec.ts` checks `asPublicRead` against the 31 pairs
  of reads recorded from Core's own read code (`web-studio-core`'s
  `internal/modules/cms/handler/web/testdata/preview_parity/`, copied as they are). One pair is not
  two answers: a page placing a component that no longer resolves (archived) is served by the public
  read without the placement and refused by a preview read (404 `REUSABLE_COMPONENT_NOT_FOUND`), so
  a session shows the theme's not-found page where the live page shows the page without that
  component; that is accepted, and pinned. The pages: every starter block type, shared components (a header and
  footer), a page under a page that places them, a shared component next to a block node that no
  longer resolves, a localized page in both locales, media framing, a route template (a dynamic
  route) placing a component, and one page per structural edit. At 1280 and 390 wide, after
  hydration, the documents are compared node for node (the async data and `useState` the apps hold
  too, their focus, scroll position and console errors) and the full-page screenshots pixel for
  pixel: 0 differ.

  Removed before the comparison, from the session's page only: exactly the differences above (the
  session host, the two router meta tags, the router's early hide and the kit's
  `data-eldra-preview-ready`, which must already be set in the frame the veil drops); the live page
  is asserted to have none of them. The stand-in router injects the same early hide the router does. Not
  compared: Nuxt's hydration-state scripts (the pinned build's payload is the older content by
  construction, and every build has its own build id) and comments (Vue's fragment anchors). A
  `style` attribute is compared as the browser holds it (`style.cssText`), and the head's
  `modulepreload` hints as a set: their order is the order the prerender's async render collected
  the chunks in, which differs between any two builds of the same content. In the async data, an
  entry's `publishedAt` and `updatedAt` and a media item's `linkId` are not compared: they are the
  draft's own (Publish sets the times; each owner has its own asset link row), and the identical DOM
  shows the starter renders none of them. An entry's `status` is not among them: the public read
  does not carry it, and the session's client drops it too.

  Both pages are captured on the same condition, so a slow machine cannot capture one early: the
  app has hydrated, no async data read is in flight, the network is idle, and the whole document has
  not changed for 750 ms. And the comparison holds only if a build is a function of its content:
  Nuxt shares `useAsyncData` answers between the routes of one prerender, and a read that failed
  left later routes an empty answer where earlier ones baked the error, depending on the order the
  routes rendered in (on a busy machine, one build's footer form definition was an error and the
  other's an empty answer). `@eldrajs/theme-nuxt` reads a failed key again on every route that asks
  (`src/runtime/prerenderSharedData.ts`), so every route bakes its own failure. Where the build
  shares prerender data and Nuxt hands a page no shared cache of the shape that plugin wraps (a
  Nuxt release that moved it), the build logs one warning and goes on unguarded; the plugin's tests
  run it against the installed Nuxt's own cache module, so such a release fails the kit's tests
  first. The session's document is also written out in the frame its veil first drops, by the
  same serialiser as every capture (shadow roots walked, the session's additions left out), and
  must equal its settled document: nothing the merchant sees changes after the veil
  (the one exception is the `/focus-mid` header below).

  What the session does to get there:
  - `@eldrajs/theme-core`'s client reshapes **every** session answer into the public read's shape
    (`asPublicRead`): wherever a `reusableComponentProjection` appears — the answer itself, a list
    item, a resolved reference at any depth (a page's `parent`) — the placements are expanded as
    Core's public read expands them, `blocks` are put in layout order, and a node naming a block that
    does not resolve is dropped. Rendered in the preview shape, every node in a shared component
    carried its authored id and a `data-eldra-reusable-placement`, its subtree was rebuilt, and a
    dangling node rendered a hidden `data-eldra-missing-block` the live page has not;
  - `useEldraPage().pending` stays `false` while the session re-reads the route it has just
    hydrated, so a theme that draws a loading state for `pending` (the starter does) patches the
    page in place rather than tearing every block down and building it again, which would number
    every `useId()` anew and re-serialise every bound style. A theme's own `useAsyncData` keeps its
    own `pending`: a block that renders a loading state for it is still torn down and rebuilt in a
    session, with the same consequences;
  - the veil drops only once the head shows the draft too: the head manager writes the head in a
    timer after the render (`@unhead/vue`'s client), so the session waits for Vue's render and
    then for that write (`src/runtime/previewSessionHead.ts`), never uncovering the pinned build's
    title and Open Graph tags;
  - a `focus()` (HTML or SVG) asked of an element in the app while it is inert under the veil is
    asked again once the draft is shown, unless the page blurred it itself;
  - a page that exists only as a draft resolves the address bar's path: the host answers it with the
    build's not-found document, and when that is a prerendered page (the starter copies its `/404`
    over `404.html`) Nuxt would otherwise start at the path the document was rendered for and show
    "Page not found" (`src/runtime/previewSessionRoute.ts`). Only a document rendered for `/404` is
    started elsewhere, and the paths are compared as Nuxt's router compares them (without the app's
    `baseURL`); a document served under another address, an alias or a host's rewrite, starts where
    Nuxt would start it. The route's own data, which Nuxt counts as hydrated from its `default`
    although the document carried none, is read with the session's re-reads
    (`src/runtime/previewSessionReads.ts`): only `useEldraPage`'s, and only while it still holds its
    `default`. Nuxt marks an `immediate: false` entry with a `default` the same way and nothing on
    the entry tells them apart, so a theme's own entry in that state is never run by the session (a
    cart create runs when the page runs it); on such a page a theme's own `useAsyncData` with a
    `default` keeps it until the theme refreshes it;
  - a session's page always carries the router's `noindex, nofollow`: the session adds its own
    robots entry to the head, ahead of any page's, because the head manager owns
    `meta[name="robots"]` once the app runs and would otherwise remove the router's tag where a page
    writes its own (the not-found document a page only the draft has hydrates) or replace it with a
    theme's.

  A theme that **renders** an entry's `publishedAt` or `updatedAt` (a "last updated" line, a date
  under a post) shows the draft's in a preview, its own save time and the last publish time or none,
  where the live page shows the times Publish set: that text differs between a preview and the page
  Publish puts live.

  **Known differences** (each pinned by the spec, so a change in either direction is seen):
  - **Structural edits renumber `useId()` ids — accepted by the owner (2026-11-23)**, to be taken
    up if it ever matters. The session patches the pinned build's hydrated page to the draft, and
    Vue numbers a `useId()` by creation order: an instance keeps its hydration number, one created
    later takes the next free number. Every id still matches its own `aria-labelledby` /
    `aria-controls`; no pixel differs. The full scope, as the spec pins it (exactly which ids):

    | Edit                                                        | Renumbers | Whose ids                                                        |
    | ----------------------------------------------------------- | --------- | ---------------------------------------------------------------- |
    | content of a block, its media or framing, a localized field | no        | none                                                             |
    | an item added to a list block (an FAQ question, a tab)      | no        | none: their ids are the block's, by index                        |
    | a block added                                               | yes       | the added block and every block after it                         |
    | a block removed                                             | yes       | every block after it                                             |
    | two blocks reordered                                        | yes       | the moved blocks                                                 |
    | a block's type changed (a new block in its place)           | yes       | the new block                                                    |
    | a page that exists only as a draft, opened directly         | no        | none: the whole page is built in the browser, in prerender order |

    An added block's chunk also arrives late (its `modulepreload` added at the end of the head, as an
    absolute URL), and a removed one's stays behind from the pinned page.

  - A page that exists only as a draft, opened directly, hydrates the pinned build's not-found
    document: its head's payload preload is that document's (`/404/_payload.json`), and the session
    also holds that document's route data.
  - The session re-runs every async data entry the server filled, commerce reads included, so it
    asks the catalog again where the live page answers from its payload (same answer, one more
    request; the spec allows exactly those requests per page).
  - Focus asked for under the veil is given later than on the live page. The focus and the scroll
    position end the same; scroll-driven state can end differently (the starter header's
    hide-on-scroll, with a field focused mid-page, ends shown in about half the sessions where the
    live page has it hidden). Accepted by the owner (2026-11-23) as a known difference: it needs a
    block that takes focus mid-page, and the one who sees it is the merchant looking at a preview.
    The spec allows exactly that one difference, the header's hidden state, on that page.
  - **Design tokens and theme texts saved after the pinned build.** The owner decided
    (2026-11-23) that a preview shows them as soon as they are saved. The kit does not do that yet: a
    build reads them once (the module's `readDesignTokens` and `readThemeMessages`) and bakes them
    in — the tokens into the runtime config the plugin hands `EldraLayout`'s
    `<style data-eldra-design-token-styles>`, the texts into `virtual:eldra/messages` — and a session
    reads neither at runtime, so it shows the pinned build's (locales and currency, baked the same
    way, too). The spec's case asserting it is skipped until a session reads them.

- **Noindex** is the router's: it sends `X-Robots-Tag` and injects the robots meta.

A theme adopts it by rebuilding on the `@eldrajs/theme-nuxt` release that has it and redeploying, and
by keeping its own CMS reads in the covered forms above. The manifest will say so with
`capabilities: { draftPreview: 1 }` once Core accepts the key (`@eldrajs/vite-plugin-theme`'s
`EldraThemeOptions.capabilities`; off in `theme-nuxt` until then, because Core decodes the manifest
strictly).

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
    actions: {
      notify: false,
      confirm: false,
      subscribe: {
        list: 'newsletter',
        // the consent wording per locale; {shop} becomes the shop name on the platform
        consentText: {
          'en-US': 'I want to receive the newsletter from {shop}. I can unsubscribe at any time.',
          'is-IS': 'Ég vil fá fréttabréf frá {shop}. Ég get skráð mig úr áskrift hvenær sem er.',
        },
      },
    },
    success: { message: { 'en-US': 'Check your inbox to confirm.', 'is-IS': 'Kíktu í pósthólfið.' } },
  },
],
```

Field types are `text`, `email`, `phone`, `textarea`, `select` (with `options`), `checkbox`, `consent`
(a checkbox whose `required` means it must be checked), `number` and `url`; `validation` takes `minLength`, `maxLength` and a `pattern`. `confirm` and `subscribe` need an
email field. `subscribe.consentText` is validated like Core (a locale map, 500 characters each, plain text). Core creates a seeded form only when its key is absent and never over a merchant's edits
(an unedited seeded form is refreshed on a theme version bump). The starter's seeds are
`examples/starter-nuxt/app/formSeeds.ts`.

A seed cannot name an email template: `notify`, `confirm` and `subscribe` are flags, and Core maps each to
its own form design (`form_notification`, `form_confirmation`, `form_subscribe_confirm`). A visitor can
type any address into a form, so Core refuses a form action that would send anything but a form design
or the organisation's own custom template (`SITE_FORM_TEMPLATE_NOT_ALLOWED`); the plugin refuses a
`templateRef` on a seed with the same wording before the deploy.

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
`@eldrajs/sdk`'s `client.forms` (`get`, `submit`, `confirm`, `unsubscribe`) is the same API. Forms
are gated by the organisation's `FORMS` feature, not `PAGE_BUILDER`, and a headless app can use them
with no theme at all (see `getting-started.md`, "Forms without a theme").

**What a subscription records.** A subscribing form always has real consent wording. The
`subscribe` action carries a `consentText` sentence per locale (up to 500 characters each, plain
text with no `<` or `>`, with a `{shop}` placeholder the platform replaces with the shop name).
Core refuses to save a form whose subscribe action has no sentence in any locale; a seed that leaves
`consentText` out gets the platform's default on create, so older seeds keep working, and Studio
prefills the same default. The public definition (`GET /site/v1/forms/{key}`) exposes the resolved
sentence per locale as `consentText`, only when the form subscribes. The `form` block shows it as
small text under the submit button, escaped and linked to the button with `aria-describedby`;
pressing the button is the consent, so there is no extra checkbox and no new submit field.

At submission the platform sends marketing the sentence in the visitor's locale (resolved like a
field label), followed by the label of each ticked `consent` field, newline-separated, never
anything the client sent, plus its SHA-256, the form key and name, the `pagePath` the SDK sent
(client-supplied, so informational), and when they subscribed, confirmed and unsubscribed. IP
addresses and user agents are not stored. The `newsletter` block's own consent checkbox and
rich-text consent line are block copy and are not recorded.

The platform's marketing service owns subscribers and this record (the form only submits; the
SDK and the emailed confirm/unsubscribe links are unchanged).

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

**When it runs.** The build decides: only a **production** build (the default; not `ELDRA_BUILD_TARGET=preview`) with an
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
`localStorage` for the shopper's features, not for analytics; campaign attribution, below, keeps one
key there.)

## Campaign attribution

A merchant's campaign mails link to the site with `utm_source`, `utm_medium`, `utm_campaign` and
`utm_id` (the campaign's id) in the URL. `@eldrajs/theme-nuxt` notes the latest such landing on the
first page and after every navigation. **It keeps it only once the visitor agrees** through the shop's
own consent tool. From then on every cart add sends it, so the order made from that cart is credited
to the campaign in Studio ("Orders after a click").

**Telling the kit the visitor's answer.** In the consent tool's callback, set
`window.eldraCampaignAttributionConsent` to `true` or `false` and send the
`eldra:campaign-attribution-consent` event:

```js
window.eldraCampaignAttributionConsent = choice.marketing;
window.dispatchEvent(new Event('eldra:campaign-attribution-consent'));
```

The module's plugin reads the value when it starts and on every event, so the order of the two scripts
does not matter. Code inside the theme can call `@eldrajs/sdk`'s `grantCampaignAttributionConsent()`
and `withdrawCampaignAttributionConsent()` instead. Report the answer on every page load where it
stands: the kit does not store consent. Withdrawing removes what was kept, and later carts carry
none. A site with no consent tool keeps nothing, and its orders are still credited by the platform's
email match ("Orders from recipients").

**What is kept, for your privacy page.** With consent, one `localStorage` key,
`eldra.campaignAttribution`, holding those four campaign-level tags and the time they were captured,
for 30 days; a later tagged landing replaces it. No click id (`gclid`, `fbclid`), referrer or visitor
id, and nothing about the person. It is never cleared on an order, since the platform's checkout has
no moment in the theme to clear it from; `clearCampaignAttribution()` does it on demand. Wording for
the shop's privacy page, with the shop's own cookie-settings link and address filled in:

> **Tenglar í markaðspósti og heiti herferðar í vafranum.** Þegar þú kemur í vefverslunina fylgja
> slóðinni merki sem segja frá hvaða herferð þú komst (til dæmis utm_campaign). Ef þú samþykkir það
> geymir vefverslunin þessi merki í vafranum þínum (localStorage, undir heitinu
> `eldra.campaignAttribution`) í 30 daga. Ef þú setur vöru í körfu á þeim tíma fylgir heiti
> herferðarinnar með og skráist á pöntunina. Þannig sjáum við hvaða herferðir skila pöntunum. Án
> samþykkis þíns geymum við ekkert. Þú getur breytt vali þínu hvenær sem er undir [Stillingar
> vafrakaka]. Geymslan eyðist sjálfkrafa eftir 30 daga. Þú getur eytt henni fyrr með því að hreinsa
> vefgögn fyrir [vefslóð verslunar] í stillingum vafrans.

> **Links in marketing email and the campaign name in your browser.** When you arrive at the shop,
> the web address carries tags that say which campaign you came from (for example utm_campaign). If
> you agree, the shop keeps these tags in your browser (localStorage, under the name
> `eldra.campaignAttribution`) for 30 days. If you add a product to your cart in that time, the
> campaign name is sent along and recorded on the order. This shows us which campaigns lead to
> orders. Without your agreement nothing is kept. You can change your choice at any time under
> [Cookie settings]. The stored value deletes itself after 30 days. You can delete it sooner by
> clearing site data for [shop address] in your browser settings.

**Turning it off.** `eldra: { campaignAttribution: false }` in `nuxt.config.ts` leaves the plugin out:
nothing is noted, kept or sent. The SDK side, its options and the behaviour against a gateway older
than public contract 5.4.0 are in
[`packages/sdk/README.md`](../packages/sdk/README.md#campaign-attribution).

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
