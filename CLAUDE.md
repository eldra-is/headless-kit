# CLAUDE.md

Public repository. Everything here is visible to anyone, and the packages are on the public npm
registry. Read this before changing anything.

## Invariants

- **GitHub-hosted runners only.** Every workflow is `runs-on: ubuntu-latest`. Never `self-hosted`,
  never a reusable workflow from another Eldra repository — those target self-hosted runners and
  a private registry. A fork pull request on a self-hosted runner executes a stranger's code on
  private infrastructure.
- **No secret is readable from a job that runs pull request code.** `ci.yml` and `commit-check.yml`
  use `pull_request`, never `pull_request_target`, and carry no secrets. Secrets exist only in
  `release.yml` (push to main) and `publish.yml` (release published), which fork code cannot
  trigger.
- **No `NPM_TOKEN` anywhere.** Publishing is npm trusted publishing over OIDC with provenance, to
  npmjs only. The scope is the audience: `@eldrajs/*` is public, on npmjs, needs no token;
  `@eldra-is/*` is Eldra's private UI library on GitHub Packages. They are different scopes on
  purpose — an npm scope resolves against one registry, so one scope for both would mean no
  repository could depend on both. Never publish this kit under `@eldra-is`.
- Actions are pinned by commit SHA with the version in a trailing comment. Dependabot bumps them.
- The `main — checks` ruleset requires the CI job by its **name** (`Lint, types, tests, build,
package checks`) and the commit check by its job id (`check`). Rename either and every pull
  request waits forever for a status that never comes; update the ruleset in the same change.
- **Public packages never import a private one.** `@eldrajs/sdk` and `@eldrajs/rich-text` import
  nothing at all outside their own folder. Framework wrappers import only their framework and the
  core packages.
- **Framework-free packages import no framework.** `scripts/check-framework-free.mjs` enforces it
  for sdk, rich-text, theme-core, vite-plugin-theme, theme-cli; wrappers (`vue`, `theme-vue`,
  `theme-nuxt`) import only their framework and the core packages.
- **The SDK ships no response types.** `src/contract.ts` declares an empty `EldraContract`
  interface; the Vite plugin generates the gateway's OpenAPI document into the consumer's project
  as `contract.ts`, which augments that interface, and every contract-derived type then resolves.
  Without the augmentation they resolve to `unknown` (responses) or `Record<string, unknown>`
  (bodies, queries) — never to a guess. Do not add a snapshot of the document back into the
  package; `src/__tests__/fixtures/web-gateway.json` is a test input only.

## Commands

```bash
pnpm check              # everything CI runs, including the starter's Storybook build
pnpm test:watch         # unit tests, live
pnpm build              # every package, via tsdown / vite
pnpm --filter @eldrajs/sdk fixture   # regenerate the test fixture's contract.ts after a build
pnpm size               # size budgets against dist; build first
pnpm pack-smoke         # pack, install into a fresh project, import at runtime and under tsc
```

## Releasing

Release-please in manifest mode, one component per package, tags `sdk-v1.2.3`, one release PR for
all packages. The `node-workspace` plugin bumps `vue` when `rich-text` releases and rewrites the
`workspace:^` range on publish; do not add `linked-versions` — it opens its own group PR and that
candidate is dropped under `separate-pull-requests: false`, so only `sdk` gets released. **It reads commit
types.** The pull request title is the squash-merge commit: `feat` or `fix` makes a release, `chore`
does not, and the manual workflow cannot force one. Nor can a `chore` commit carrying `Release-As`:
release-please only lets `Release-As` pick the version, and skips a package whose release notes
would be empty, which they are when every commit is a hidden type (`chore`, `docs`).
Publishing happens on the GitHub release event, one package per release, by packing that package and
`npm publish --provenance`.

Five more components release the same way: `theme-core`, `theme-vue`, `vite-plugin-theme`,
`theme-cli`, `theme-nuxt` (tags `theme-core-v0.1.0`, etc.) — the `publish.yml` tag→directory rule
already covers them since each component name equals its `packages/` directory.

Each package keeps a hand-maintained `CHANGELOG.md` for what a consumer can see; add the line in the
same change, under Unreleased, and rename that heading to the version in the release PR's wake.
Release-please writes its generated notes to `RELEASE-NOTES.md` in each package (`changelog-path`),
which is not shipped in the tarball; the GitHub release carries the same text.

## Layout

- `packages/sdk` — `@eldrajs/sdk`. Framework-free: no Vue, no DOM assumptions beyond `globalThis`
  lookups that tolerate absence. `src/vite-plugin.ts` is the `./vite` entry (`eldra()`), may import
  Vite, Node and `openapi-typescript`; nothing else may. It resolves paths against the nearest
  `package.json` above Vite's root, because Nuxt's root is `app/`; and a Nuxt consumer's tsconfig
  include must be `../.eldra/**/*.ts` (Nuxt copies the entry into `.nuxt/` verbatim). Type checking runs twice: `tsconfig.json`
  proves the un-generated state (`unknown`), `tsconfig.generated.json` proves the generated state
  against the fixture. Built by tsdown. `src/image.ts` encodes the media host's contract — variant
  names and widths, the asset URL shape, which content types it resizes — copied from
  `eldra-is/studio-media-worker` `src/index.ts`; change both together.
- `packages/rich-text` — `@eldrajs/rich-text`. Framework-free, imports nothing. The document types
  are declared here, not imported from TipTap. `src/html.ts` is the kit's XSS surface: it
  serialises merchant-authored content to HTML, so every text and attribute value goes through
  `escapeHtml`, URLs through `safeHref` / `safeImageSrc`, colours through `safeCssColor`, and an
  embed renders only when `isTrustedEmbedSource` accepts its `src`. A change there needs a test
  that tries to break out, proven by mutation. No top-level statement may have a side effect a
  bundler can see: each module-level `wrap(...)` / `wrapMark(...)` call in the default tables
  carries `/* @__PURE__ */`, or importing `safeImageSrc` alone bundles the renderer. The
  `rich-text — safeImageSrc` size budget catches a missing one.
  Built by tsdown.
- `packages/vue` — `@eldrajs/vue`. The `RichText` renderer and `EldraImage`; depends on
  `@eldrajs/rich-text` and `@eldrajs/sdk`, peers on `vue`. Uses the same safety helpers in `Link.vue`, `Image.vue` and `Embed.vue`. Built by
  Vite in library mode with `vite-plugin-dts` bundling the declarations into one `index.d.ts` —
  per-file `.vue.d.ts` output fails Node16 resolution, which `attw` catches.
- `packages/ui` — `@eldrajs/ui`. The public Vue 3 core component library, built to
  `eldra-starter-spec/01-core-components.md` (WCAG 2.2 AA). Peers on `vue` **3.5 or newer**
  (`src/utils/id.ts` calls Vue's `useId()`, added in 3.5, and nearly every component calls it),
  optionally on `vee-validate` (the `./vee-validate` entry only); runtime deps are
  `@floating-ui/vue` and `tailwind-merge`. Built by Vite in library mode with `vite-plugin-dts`, the
  same shape as `packages/vue`. **No value is written literally**: every colour, radius, height,
  spacing step, font, duration, easing and z-index resolves to a `--eldra-*` variable, so a
  consumer restyles by setting variables. `scripts/build-tokens.mjs` generates
  `src/styles/tokens.css` from `eldra-starter-spec/tokens.json` (checked in; `pnpm --filter
@eldrajs/ui check:tokens` runs in the root `lint:check` and fails on drift — regenerate with
  `build-tokens`, never hand-edit). The Storybook screenshot harness
  (`pnpm --filter @eldrajs/ui screenshots`, baselines in `packages/ui/__screenshots__`) is
  **outside `pnpm check` and outside CI**, and the baselines are **not tracked** (git-ignored):
  font rasterisation differs enough per platform that one machine's PNGs fail nearly every story
  on another. Create your own once with `screenshots --update`, then compare against them.
  Three CSS entries ship: `./tokens.css` (the variables),
  `./tailwind.css` (the `@theme` block and the `@utility` rules — type styles, control heights,
  the `eldra-focus` ring, motion and layer utilities — copied to `dist/` verbatim so a consumer's
  own Tailwind build reads them, with `@source './'` resolving against `dist/`), and `./style.css`
  (the package's compiled stylesheet for consumers without Tailwind, emitted by the `style` lib
  entry). `scripts/copy-css.mjs` does the copying. `scripts/check-framework-free.mjs` does not
  apply — this is a framework package. Entries (`exports`): `.` (every component, composable and
  type, unprefixed — `Button`, `Select`, no global registration), `./resolver`
  (`EldraUiResolver({ prefix = 'Eldra' })` for `unplugin-vue-components`, resolving
  `<prefix><Name>` against `src/componentNames.ts` — a hand-maintained list rather than one
  generated from `src/index.ts`, guarded by `src/__tests__/componentNames.spec.ts` importing the
  index and comparing its component keys; a generator was judged not worth a build step ahead of
  `vite build` for 19 names that change once per component, ever), `./vee-validate` (`Form` and
  twelve `Field*` components wrapping `vee-validate`'s `useField`/`useForm`, plus `API_ERRORS_KEY`
  and `useFieldControl`; `src/vee-validate/**` is the only place in the package that may import
  `vee-validate`, and `src/__tests__/veeValidateIsolation.spec.ts` proves the root entry loads
  without it in both the source graph and the built `dist/`), `./messages/is-IS` (the Icelandic message set, its
  own entry so an English-only store never bundles it), and the three CSS entries above. Text a
  component renders itself goes through a `messages` prop / `provideEldraUiMessages`, English
  defaults built in. Composables exported from the root are the same building blocks the package's
  own components are built on, not a separate layer over private internals, so a consumer building
  a control this package does not ship yet reuses exactly what those components use: `useFloating`
  (`@floating-ui/vue` placement), `useOverlay` (non-modal popup close/focus, never a focus trap —
  modal surfaces use `useDialogStack` when they land), `usePopover` (`src/components/select/usePopover.ts`;
  `useOverlay` and `useFloating` wired into one non-modal popup life cycle — the "only one open at a
  time" registry, the entrance-variable positioning, the open sequence, the label-forwarded-click
  latch — that `Select`, `MultiSelect` and `SearchBar` all open their panel with), `useListbox` (the
  select keyboard and active row, shared by `Select`/`MultiSelect`). Never a `Ui` prefix: the
  resolver entry defaults to `Eldra`, which is `packages/ui/README.md`'s job to keep straight from
  the private Eldra library's own `Ui*`/resolver.
- `packages/theme-core` — `@eldrajs/theme-core`. Framework-free core of the theme SDK: the Studio
  preview bridge (`./bridge`), stega, the overlay runtime, layout CSS, rich-text position mapping,
  design tokens, image framing. Built by tsdown, one entry per subpath. Must never import a
  framework, contain editing UI, TipTap, or `@eldra-is/*`.
- `packages/theme-vue` — `@eldrajs/theme-vue`. Vue 3 bindings over `theme-core`: block zones,
  layout, rich text, the preview composables. Built by tsdown; `vue` and the plugin's
  `virtual:eldra/*` modules stay external (`deps.neverBundle`), never inlined. Must never contain
  editing UI, TipTap, or `@eldra-is/*`.
- `packages/vite-plugin-theme` — `@eldrajs/vite-plugin-theme`. Node-only Vite plugin: scans
  `blocks/*/block.json`, validates against the manifest schema, emits the manifest and the virtual
  modules (`./scan` exposes the scanner standalone for `theme-cli`). Built by tsdown. Framework-free
  — must never import a framework or `@eldra-is/*`.
- `packages/theme-cli` — `@eldrajs/theme-cli`. Node CLI (`eldra-theme`) over `theme-core` and
  `vite-plugin-theme`: init/scaffold/validate/types/deploy. Built by tsdown; `prepack` copies
  `examples/starter-nuxt` into `template/` (git-ignored) so `eldra-theme init` has something to
  scaffold from. Framework-free — must never import a framework or `@eldra-is/*`.
- `packages/theme-nuxt` — `@eldrajs/theme-nuxt`. Nuxt module wiring `vite-plugin-theme`,
  `theme-vue`, the gateway client and the Studio bridge into a Nuxt 4 site. Built by
  `nuxt-module-build`, not tsdown. Must never contain editing UI, TipTap, or `@eldra-is/*`.
- `examples/` — real projects on the workspace packages, type-checked by `pnpm typecheck`. A
  documented snippet lives here first and is referenced by path, so it cannot stop compiling
  silently.
- `examples/starter-nuxt` — the theme starter: what `eldra-theme init` copies. `theme-cli`'s
  `prepack` script copies this directory into `packages/theme-cli/template/` (git-ignored, rebuilt
  on every pack/publish) rather than the CLI depending on it at runtime. Buttons, links and form
  controls come from `@eldrajs/ui` (a real dependency, restyled through the `--eldra-*` tokens,
  never forked); everything else is copied source the customer owns — `app/components/ui/` is down
  to just `UiImage` now (every other hand-rolled primitive was replaced, block by block, by the
  matching `@eldrajs/ui` component). **34 blocks** ship under `blocks/`, `block.json`'s `category`
  grouping them `structure`/`marketing`/`content`/`commerce` (see `docs/starter-kit.md` for the
  full set); nine hand-authored sample pages, `pages/*.page.json`
  (`{template,title,blocks:[{apiId,id,data}]}`, the same shape a real CMS page document has, with
  `page: {slug}` in place of `template` on the four that seed a static Page — `/cart`,
  `/wishlist`, `/search` and `/products` (the catalogue; a page, not a template, which is also what
  lets it sit beside the product template's `/products/:slug` — `resolveRoute` matches an exact page
  before any pattern), which Core creates with the one block each exists for `required`, i.e.
  locked against deletion), render every block in a fixture in one place and back both a Storybook
  page story (`stories/pages/*.stories.ts`) and a page-level test (`test/pages/*.spec.ts` —
  whole-page axe, one `<h1>`, unique ids across block instances; the four seeded pages share
  `test/pages/seededPages.spec.ts`). Commerce blocks (`product-detail`,
  `collection-grid`, `cart`, `search`, `order-status`, and the rest) read product/cart/search/order
  data through `useStorefront()` (`app/storefront/**`'s own view types, `STOREFRONT_KEY`) — a real
  gateway-backed implementation in the Nuxt app (`app/plugins/eldra-storefront.ts`), a demo Northwind
  fixture (`app/storefront/demo.ts`) in Storybook and tests — rather than calling `@eldrajs/sdk`
  directly.
  `blocks/<apiId>/{block.json,Block.vue,mock.json,preview.json?,preview.png,__tests__/}`
  is the block contract — `mock.json` is exactly the seed Studio writes when an author inserts the
  block, so a media field is absent there (never a fixture object; `eldra-theme validate` enforces
  `{assetId: uuid}` or absent), and the optional sibling `preview.json` is a story/preview-only overlay
  merged onto `mock.json` — demo imagery mostly, but any field a story or the preview tile should
  render differently from a fresh insert (`breadcrumbs` has no media and carries one to turn
  `fromProduct` off) — and neither `blocks/**` nor
  `app/components/ui/**` may call Nuxt globals
  (`useRoute`, `useHead`, `NuxtLink`, `$fetch`, `useAsyncData`) or rely on Nuxt auto-imports — every
  `vue`/`@eldrajs/*` import is explicit, which is what lets a block render in Storybook with no
  Nuxt build step. `useStorefront()` is not a Nuxt global (it is a plain `inject()` off
  `STOREFRONT_KEY`, resolved outside the block either way), so `blocks/**` may call it freely; the
  rule above is still absolute for `useRoute`/`useHead`/`NuxtLink`/`$fetch`/`useAsyncData` and
  auto-imports. `app/components/EldraRouterLink.vue` is the single carve-out that writes the
  `<NuxtLink>` tag, and blocks hand it to `@eldrajs/ui`'s `Link` as `as` for a same-site
  destination (always after `safeHref`). Tailwind v4 is wired through the fallback route, not the
  plugin's `virtual:eldra/tailwind-theme.css` CSS-level `@import` (that import only resolves at the
  JS level — see `docs/theme-design-tokens.md`): `eldra.tailwind: false`, `app/assets/main.css` is
  `@import 'tailwindcss'` then `@import '@eldrajs/ui/tailwind.css'`. There is no generated colour
  block and no sync script: `tokens.json`'s ids _are_ the package's `--eldra-color-*` role names,
  so one edit restyles both, and `virtual:eldra/tokens.css` must stay ordered after the package's
  defaults (it is, in the Nuxt build; `.storybook/preview.ts` imports them in that order
  explicitly). **Storybook** (`examples/starter-nuxt/.storybook/`) generates its block stories from
  `virtual:eldra/manifest`/`virtual:eldra/blocks` rather than hand-written CSF — one `Default` story
  per block from `mock.json`, one per declared `variant` option; `pnpm --filter starter-nuxt
build-storybook` runs in CI. **Previews** (`blocks/<id>/preview.png`, `.eldra/previews/*.png`,
  `.eldra/previews.json`) are Playwright screenshots of those generated stories
  (`scripts/previews.mjs`) keyed by a content hash of **every file under `blocks/<id>/`** except
  `__tests__/` and `preview.png` itself (so a block's `parts/*.vue`, its `block.json` and any helper
  module all count — a named file list silently went stale as blocks grew part files), **plus
  `main.css`** (a shared style change invalidates every block's hash) **plus the `@eldrajs/ui` package itself** (its source when it resolves to this workspace, its
  version in a scaffolded theme — a package change can repaint every preview with nothing in the
  theme touched, while a release bump alone must not) — `test/previewsFresh.spec.ts`
  fails "run pnpm previews" when a hash is stale, so run `pnpm --filter starter-nuxt previews` after
  any block, `main.css` or package change and commit the regenerated files. See `docs/starter-kit.md` for
  the full set of conventions (styling foundation, primitive table, strings, testing gates) in
  consumer terms.
- `docs/` — plain markdown: `getting-started.md`, `images.md`, `rich-text.md`, `frameworks.md` (the contract a
  wrapper for another framework must satisfy), `ui.md` (short: what `@eldrajs/ui` is, install, the
  three CSS entries, links to `packages/ui/README.md` and Storybook), `themes.md` (theme package
  map, the framework-free rule, the Studio bridge, running the starter), `starter-kit.md` (the
  starter's own conventions — see the `examples/starter-nuxt` entry above) plus the four
  `theme-*.md` docs `themes.md` links to, and `roadmap.md` (planned work; remove a line in the
  change that builds it).

## How a theme meets the page builder

A theme is the platform's content model, in files. `@eldrajs/vite-plugin-theme` scans the theme
directory into `ThemeManifest` (`packages/vite-plugin-theme/src/types.ts`); `eldra-theme deploy`
uploads it with the built static site, and the platform's ingest turns each top-level key into
platform state. A theme never talks to that platform directly to make this happen — it is all
manifest in, generated artifact out.

- **`blocks`** — one entry per `blocks/<apiId>/block.json`, each becoming a `block`-tagged CMS
  schema (fields, groups, slots, migrations). A block's CMS entry is what the page builder's
  inspector edits; `Block.vue` is what renders it, in the preview and on the deployed site alike.
- **`templates` / `pageSeeds` / `templateRoles`** — what a site starts with on its first deploy, at
  most 8 of each. A `templates` entry seeds a route template (`catalog:product`,
  `catalog:collection`, `catalog:category` or `home`); a `pageSeeds` entry seeds a static Page at
  `/<slug>` instead, with no node ids — its `blocks[]` **is** the page, in document order
  (`ManifestPageSeed`, `types.ts:89`). Either kind may place the `@header`/`@footer` regions, which
  resolve to the site's own reusable components, built once from `templateRoles` on first deploy and
  shared by every seed that places them (`types.ts:162`) — this is the mechanism behind a theme's
  header and footer being ordinary reusable components, editable from any page that hosts one. A
  seed is skipped once the site already has a template for its pattern or a page with its slug, so a
  merchant's own edits are never overwritten. See [Seeding default templates and
  pages](docs/themes.md#seeding-default-templates-and-pages) and
  [Reusable page components](docs/theme-reusable-components.md).
- **`tokens`** — the theme's own `tokens.json`, normalized into `--eldra-color-*` /
  `--eldra-container-*` CSS variables. Studio's site settings can override any token marked
  `allowSiteOverride`, live, with no redeploy of the theme's code — but a **deployed** (prerendered)
  site only picks up an override because `@eldrajs/theme-nuxt` reads the organisation's resolved
  catalog at build time and feeds it back through `tokens`' own transform hook (below). See [Design
  tokens](docs/theme-design-tokens.md).
- **`messages`** — the theme's `i18n/<tag>.json` catalogues, flattened to dotted keys. Studio's
  "Theme texts" page can override or translate any plain-string key (not the UI package's
  parameterized ones) for any organisation locale; the deployed site picks that up the same way
  tokens do, through `messages`' transform hook. See [Theme texts](docs/theme-texts.md).

### The preview bridge

`@eldrajs/theme-core/bridge` (`packages/theme-core/src/bridge/protocol.ts`) is the postMessage
protocol between a theme running in Studio's builder preview iframe and the Studio editor host.
Every message is one of `BridgePayloads` (`protocol.ts:222`), wrapped in a versioned envelope a
theme on an older protocol version ignores rather than misreads. Two owners, two prefixes:

- **`editor:*` — Studio sends, the theme receives.** `editor:hello`/`editor:init` (mode, preview
  token, locale, path), `editor:content-update` (draft entry data), `editor:design-tokens` /
  `editor:theme-messages` (live overrides), `editor:select-block`, `editor:navigate`,
  `editor:set-mode`, `editor:set-viewport`, `editor:refresh`/`editor:ping`, `editor:drag-start`/
  `editor:drag-end`, `editor:framing-mode` (image framing), and the §18 rich-text trio
  `editor:rich-text-editing` / `editor:rich-text-applied` / `editor:rich-text-locate`.
- **`theme:*` — the theme sends, Studio receives.** `theme:ready` (capabilities, manifest/theme/SDK
  versions, resolved breakpoints), `theme:pong`, `theme:route-changed`, `theme:block-clicked` /
  `theme:field-clicked` / `theme:text-edited`, `theme:blocks-rendered` / `theme:block-hovered` /
  `theme:slots-rendered` (editor-only geometry, gated by capability negotiation), `theme:height-changed`,
  `theme:error`, `theme:request-failed` (a gateway read's HTTP status — how a theme signals a revoked
  preview token without Studio polling for it), `theme:drop-candidate` / `theme:node-dropped`
  (structural drag), `theme:framing-target` / `theme:framing-changed`, and the rich-text trio
  `theme:rich-text-selection` / `theme:rich-text-input` / `theme:rich-text-command`.

Each side advertises what it supports in its first message — `EDITOR_CAPABILITIES` /
`THEME_CAPABILITIES` (`protocol.ts:466`) — so a capability like `block-slots` or `rich-text-inline`
is only ever used once both sides have named it. `@eldrajs/theme-core/overlay` is the runtime that
turns these messages into DOM selection, rich-text classification and drag handling inside the
iframe; `@eldrajs/theme-vue`'s `useEldraPreview`/`startEldraPreview` wire a Vue theme up to it. See
[The Studio bridge](docs/themes.md#the-studio-bridge).

### Build-time platform reads

`@eldrajs/theme-nuxt`'s module makes four reads of the organisation's platform state, once, at
`nuxi generate` time, in parallel (`packages/theme-nuxt/src/module.ts:360`): commerce settings
(currency), content locales, theme-message overrides (`GET /site/v1/theme-messages`) and resolved
design tokens (`GET /site/v1/design-tokens`). **Each is independently fail-soft** — a gateway that
cannot be reached, a response that fails its own shape check, or a credential-less build all answer
`null` with one `console.warn` line, never a failed build, and never let one read's failure take
another down (a currency the gateway will not give up must not cost the site its locales). A theme
with no `ELDRA_GATEWAY_URL`/`ELDRA_ORG_ID` configured still produces the static shell a scaffold
build is for. See `readStoreCommerce`/`readStoreLocales`/`readThemeMessages`/`readDesignTokens` and
their own `*_WARNING` constants for the exact wording each prints.

### Virtual modules

`@eldrajs/vite-plugin-theme` resolves seven `virtual:eldra/*` ids
(`packages/vite-plugin-theme/src/plugin.ts`): `manifest` (the whole `ThemeManifest`), `blocks` (an
apiId → lazy `Block.vue` import map), `block-fields` (per-block `{fieldId, type, localized?,
metadata?}`, for runtime field lookups with no manifest import), `breakpoints` (resolved
tablet/normal px, deliberately **not** part of `manifest` — it must never reach
`.eldra/manifest.json`, which ingest validates strictly), `messages` (the theme's message
catalogue), `tokens.css` and `tailwind-theme.css` (opt-in). `handleHotUpdate` rescans and
invalidates these on a change to `blocks/*/{block.json,mock.json,preview.png}`, `i18n/*.json`,
`tokens.json` or `package.json`.

Two of these — `messages` and `tokens.css` — are the mechanism behind "a Studio override reaches
the deployed site": `EldraThemeOptions.resolveMessages` / `resolveTokens`
(`vite-plugin-theme/src/types.ts:440`) are transform hooks the `load()` handler calls on the raw
manifest content before serving the module (`plugin.ts:128` / `:141`). Unset, each virtual module
serves the manifest's own content unchanged — a credential-less build's behaviour. `theme-nuxt` is
the one caller that sets them, and only after its own platform reads (above) have settled: closures
assigned onto the same options object `eldraTheme()` was already called with, which works because
Nuxt's module `setup()` (platform reads included) always finishes before Vite's build hooks run.

### Invariants

- **Framework-free packages import no framework.** `theme-core`, `vite-plugin-theme` and
  `theme-cli` never import `vue`, `nuxt`, `#app`/`#imports` or `@vue/*`/`nuxt/*`;
  `scripts/check-framework-free.mjs` enforces it in `lint:check` and CI. `theme-vue` imports only
  `vue` and `theme-core`; `theme-nuxt` imports only Nuxt, `vue`, and the three `theme-*`/
  `vite-plugin-theme` packages.
- **`@eldrajs/*` never imports `@eldra-is/*`.** The public packages (on npmjs) and Eldra's private
  UI library (on GitHub Packages) are different scopes for a reason — this kit must build and run
  with no access to the private registry at all.
- **Blocks never call Nuxt globals.** `blocks/**` and `app/components/ui/**` never call `useRoute`,
  `useHead`, `NuxtLink`, `$fetch`, `useAsyncData`, or rely on Nuxt auto-imports — every `vue`/
  `@eldrajs/*` import is explicit. This is what lets a block render in Storybook, which has no Nuxt
  build step to auto-import from.
- **Previews hash every file that can change what they show.** A block's `preview.png` is keyed by a
  content hash of every file under `blocks/<id>/` (except `__tests__/` and `preview.png` itself)
  plus `main.css` plus the `@eldrajs/ui` digest (source in this workspace, version in a scaffolded
  theme) — not a named file list, which goes stale
  the moment a block grows a part file. `test/previewsFresh.spec.ts` fails a stale hash with "run
  pnpm previews".
- **The CSS variable rule in `@eldrajs/ui`.** No value is written literally: every colour, radius,
  height, spacing step, font, duration, easing and z-index resolves to a `--eldra-*` variable, so a
  consumer restyles the package by setting variables, never by overriding a class. `tokens.css` is
  generated from `eldra-starter-spec/tokens.json` and regenerated with `build-tokens`, never
  hand-edited.

## Testing

Vitest, `environment: node` for the framework-free packages. A test that guards a specific defect is
proven by mutation before it is called a guard. `pnpm typecheck` includes the specs for every
package except `theme-nuxt` (its `tsconfig.json` covers only `src/module.ts`/`src/index.ts`; the
runtime and tests are type-checked by the Nuxt build and the generate tests instead) and
`examples/starter-nuxt` (`nuxi typecheck` covers app code, not the specs) — elsewhere, `expectTypeOf`
assertions are only real under `pnpm typecheck`; `pnpm test` does not check types.

`theme-core` and `theme-vue` run on `environment: jsdom` — their overlay/rich-text-position code
needs real `Range`/`Selection` behaviour, which `node` does not provide. `theme-nuxt`'s tests need
a build first (`pnpm --filter @eldrajs/theme-nuxt build`, or the root `pnpm build`) and Chromium
for its two browser specs (`designTokenParity.browser.spec.ts`, `slots.browser.spec.ts`) via
`@playwright/test` 1.62.1 — `pnpm exec playwright install --with-deps chromium` once locally; CI
installs it every run. `packages/ui` needs the same Chromium for
`src/components/tabs/__tests__/tabsRing.browser.spec.ts`, which compiles the package's own Tailwind
entry over the component's server-rendered markup and measures a focused tab's ring in pixels after
a real `Tab` press — the kind of defect (a scroll container clipping a ring; `:focus-visible` not
being what `element.focus()` produces) that no class or declaration assertion can see. It is one of
two specs in that package declaring `environment: node` per file (the other is
`src/components/select/__tests__/teleportSsr.spec.ts`, which server-renders with no DOM at all):
under the package's default happy-dom, closing Playwright's browser raises an unhandled
`ECONNRESET` on the driver connection, which vitest reports as a worker crash rather than a test
result. `theme-cli`'s tests run
`dist/cli.js` as a subprocess, so build that package first too. `examples/starter-nuxt` needs the
same Chromium for
`test/prerenderRefresh.browser.spec.ts`, which runs a real `nuxi generate` against a mock gateway
(`test/support/mockGateway.ts`), serves the output as static files and drives it with Playwright —
the only test in the kit that sees Nuxt's own hydration, payload and lazily imported block
components, and the only one that can see a commerce block refetch prerendered data or fail to
draw its refresh treatment. It generates into a copy of the starter under `os.tmpdir()`, never into
`examples/starter-nuxt/.output`, so it does not race `test/starter.spec.ts`'s own generate runs.
Two details of it are load-bearing and easy to "simplify" away: its static server answers a
directory path with a **308 to the same path plus a trailing slash**, the way the deployed preview
host does (the artifact is prerendered without one, and that mismatch is what made Nuxt rebuild
every page mid-hydration), and it copies `test/support/mountProbe.client.ts` into the generated
copy's `app/plugins/` to count block **instances** — a block built twice mounts once, so a DOM
count or a request log alone cannot see it.

**The accessibility gate (`examples/starter-nuxt`).** Every primitive and block spec asserts
`expect(await axe(wrapper.element)).toHaveNoViolations()` (`vitest-axe`, jsdom) — a passing axe
check is a required part of the spec, not an optional add-on, and a block with a `variant` field
asserts it for every declared variant, not just the default. Anything interactive (menu, dialog,
drawer, accordion, tabs, carousel, lightbox) additionally needs a keyboard test — the operable path
a screen-reader or keyboard-only visitor actually has, not just a mouse-click assertion. This is
enforced by review, not a separate CI check: a new primitive/block PR without both is incomplete.
