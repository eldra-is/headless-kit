# Starter kit conventions

`examples/starter-nuxt` is what `eldra-theme init` copies: the base every customer theme starts
from. Everything under it is source the customer owns, with one deliberate dependency:
[`@eldrajs/ui`](../packages/ui/README.md), the accessible core component library, supplies the
buttons, links, form controls, display/commerce/layout components (`Badge`, `Price`, `Rating`,
`Image`, `Container`, `Section`, and the rest) and every overlay/navigation primitive (`Accordion`,
`Drawer`, `Carousel`, `Lightbox`, `Dialog`, `Tabs`, and the rest). It is restyled through the same
`--eldra-*` design tokens the rest of the theme uses — never by overriding its internals — and
everything else (blocks, `UiImage`, the CSS) stays source the customer edits directly.

This doc covers the conventions a customer inherits: the styling foundation, the primitive layer,
the block contract, Storybook and generated previews, strings, and the testing/accessibility gates.
For the theme SDK itself (the manifest, the Studio bridge, the framework-free packages), see
[themes.md](themes.md); for the token/CSS pipeline in depth, see
[theme-design-tokens.md](theme-design-tokens.md).

## 1. Styling foundation

The starter uses Tailwind v4 bound to the Eldra design tokens, in one CSS entry:
`app/assets/main.css`.

**The route it uses, and why.** The theme Vite plugin's `virtual:eldra/tailwind-theme.css` entry
(`eldra.tailwind: true`) is the shape you'd reach for first — it emits `@import "tailwindcss"` plus
a generated `@theme static { --color-<id>: var(--eldra-color-<id>) }` block for every color token.
It works as a **JS-level** side-effect import (`import 'virtual:eldra/tailwind-theme.css'` from a
`.ts` entry). It does **not** work as a **CSS-level** `@import` — `@tailwindcss/vite` resolves
`@import` statements in CSS with its own filesystem resolver, which never reaches the virtual
module — and Nuxt's `css: [...]` array only accepts CSS files, so the JS-level form isn't reachable
from a Nuxt theme either. A theme also can't split the extension into a second CSS file: Tailwind
v4 treats every file containing `@import "tailwindcss"` as its own independent build root, so a
sibling file's `@theme` block never merges in. Both failure modes were reproduced end to end with a
real `nuxi generate`; see [theme-design-tokens.md](theme-design-tokens.md) for the full evidence.

So the starter keeps `eldra.tailwind: false` and authors `main.css` as a single self-contained
Tailwind root:

```css
@import 'tailwindcss';
@import '@eldrajs/ui/tailwind.css';
@source '../../blocks';
```

The `@source` line is not optional. Nuxt 4's Vite root is `app/`, and Tailwind's automatic source
detection starts at that root, so `blocks/` (a sibling of `app/`) is never scanned in the site
build: without it, every class only a block uses — each `@tablet:`/`@content:` container-query
variant, a block-only grid template — is missing from the deployed stylesheet, while Storybook
(whose root is the theme root) scans `blocks/` on its own and looks right. Check a site build by
grepping the emitted `_nuxt/entry.*.css` for a block-only class, not by looking at Storybook.

with `@tailwindcss/vite` registered directly in `nuxt.config.ts` (`vite: { plugins: [tailwindcss()] }`
— the adapter only asserts `tailwindcss@4.x` is installed, it never registers the transform plugin
itself).

The second import is the package's Tailwind entry (see
[packages/ui/README.md](../packages/ui/README.md#styles)): the `--eldra-*` variables with the
spec's defaults, a `@theme` block naming them in Tailwind's own namespaces (`--color-primary`,
`--radius-md`, `--font-heading`, `--shadow-md`, the type styles), the package's utilities
(`eldra-focus`, `control-h`, `text-body`, …) and a `@source './'` so this build also scans
`@eldrajs/ui`'s compiled components — without that last part a class only the package's `dist/*.js`
uses would never be emitted into the theme's stylesheet. It resolves out of `node_modules` through
Tailwind's own CSS resolver; unlike `virtual:eldra/tailwind-theme.css` above, there is nothing
virtual about it.

**Two files declare `--eldra-color-*`, and the order matters.** The package's defaults come in
through the import above; the theme's own values — `tokens.json`, plus any site override, what
Studio edits — come from `virtual:eldra/tokens.css`, which must land _after_ it. In the Nuxt build
that is already the case (verified in the emitted stylesheet); `.storybook/preview.ts` imports the
two in that order explicitly. A live Studio edit is a `<style>` appended to `<head>` by
`useEldraPreview`, so it wins over both.

**`tokens.json`** is the Studio-editable source for colors and layout containers, and its colour
ids are exactly the design spec's seventeen roles — which is also the set `@eldrajs/ui` reads:
`background`, `surface`, `surface-strong`, `border`, `border-strong`, `overlay`, `text`, `muted`,
`primary`, `primary-contrast`, `accent`, `accent-contrast`, `success`, `warning`, `danger`,
`focus`, `focus-inner`, each with `allowSiteOverride: true` so a site can override them without a
redeploy, and each chosen for WCAG AA contrast against its pairs (`test/tokens.spec.ts` asserts the
ratios). `border-strong` is the boundary of an interactive control, which the decorative `border`
is deliberately too light to be; `focus`/`focus-inner` are the two rings of the focus indicator;
`overlay` is the dialog scrim, written as an 8-digit hex because Core's token validator takes hex
or `oklch()`, never `rgba()`. Containers: `narrow` (40rem), `content` (64rem), `wide` (80rem),
`full`. Fonts and spacing are not Studio-editable yet (Core's descriptor-token ingest rejects them
today).

Each id becomes `--eldra-color-<id>`, which is the name `@eldrajs/ui`'s components read, so there
is no generated colour block in `main.css` any more and no sync script to keep current: editing a
colour in `tokens.json` restyles the theme _and_ the package's components.

**Code-level design variables** are the package's `--eldra-*` set (radii, shadows, spacing, type,
motion, z-index), which a customer overrides in `main.css` — for example `--eldra-font-heading` /
`--eldra-font-body`, whose defaults name two faces the package deliberately does not load. They
reach Tailwind through the package's own `@theme` as `rounded-md`, `shadow-md`, `font-heading`,
`text-body` and the rest. `main.css` declares no design values of its own any more: `Container` and
`Section` (`@eldrajs/ui`) now own the container widths, gutters and section spacing that used to be
hand-written here as `.eldra-container[data-size]` rules and a `--spacing-section`/`-lg` `@theme`
block — every block wraps its content in `<Section><Container width="…">…</Container></Section>`
instead of the copied `UiContainer`/`UiSection` primitives.

**Type scale** is Tailwind's defaults plus the package's type utilities: `body` takes `text-body`,
headings use `font-heading tracking-tight leading-[1.1]`. No scoped CSS and no `@apply` in blocks or
primitives — utilities only, so the kit stays readable as plain markup (`@apply` is used only inside
`main.css` itself, for the handful of base-layer/typography rules that have no per-component home).
Motion respects reduced-motion preferences everywhere via `motion-safe:` variants. Focus rings come
from two places now: `@eldrajs/ui`'s components draw the spec's own indicator (`eldra-focus`, the
`focus`/`focus-inner` token pair), and everything the theme still draws itself — a carousel track, a
lightbox thumbnail, the accordion summary — uses `app/utils/classes.ts`'s `focusRing`. There is no
blanket `:focus-visible` base rule; each focusable element says which ring it carries.

## 2. Components

### `@eldrajs/ui` — the core components

Buttons, links, layout, form controls, display/commerce components and — as of this sub-project —
every overlay and navigation primitive come from the package, not from copied source: `Button`,
`ButtonGroup`, `Link`, `Container`, `Section`, `Input`, `Textarea`, `FieldWrapper`, `FormLayout`,
`Checkbox`, `CheckboxGroup`, `RadioGroup`, `Switch`, `Select`, `MultiSelect`, `QuantityStepper`,
`VariantPicker`, `SearchBar`, `Icon`, `VisuallyHidden`, `Badge`/`StockBadge`, `Price`, `Rating`, and
now `Accordion`/`AccordionItem`, `Drawer`, `Carousel` and `Lightbox` (the starter's own `UiAccordion`/
`UiAccordionItem`, `UiDialog`, `UiDrawer`, `UiTabs`/`UiTab`/`UiTabPanel` and `app/composables/
useCarousel.ts` are gone): `faq` renders its questions through `Accordion`/`AccordionItem`
(`multiple` is the block's own `single` field, inverted); `navigation`'s mobile menu is a `Drawer`
with `side="left"` (the package's own convention for a menu drawer — a cart/filters/quick-view sheet
is `right`, the default); `gallery`'s lightbox is `Lightbox` and its `carousel` variant (along with
`testimonials`' own `carousel` variant) is `Carousel`. No block in this starter has a search trigger
or toast-like feedback, so `SearchModal` and `Toaster` have nothing to wire in yet, and no block
ever used `Tabs` or `Dialog` directly — only their now-deleted starter equivalents existed, unused.
Import components by name (`import { Button, Link, Rating, Drawer } from '@eldrajs/ui'`) — they are
never globally registered — and restyle them through tokens, the per-component CSS variables, each
component's `classes` prop, its slots, or `as`. [`packages/ui/README.md`](../packages/ui/README.md)
is the contract for all of them.

Three things a theme has to keep on its own side of that boundary:

- **Destinations are the theme's to vet.** `Link` takes the `href` it is given, so a block runs it
  through `safeHref` (`app/utils/links.ts`) first and renders nothing when that returns `null`.
- **Routing is the theme's to supply.** For a same-site destination (`isInternalHref`) a block
  passes `app/components/EldraRouterLink.vue` as `Link`'s `as`, and `Link` hands it the
  destination as `to`. That component — the one place in the theme that writes the `<NuxtLink>`
  tag — is what keeps `blocks/**` free of Nuxt globals. Note a `Button` with `href` has no `as` in
  the spec and always renders a plain `<a>`: a button-shaped CTA is a document navigation.
- **Coloured grounds announce themselves.** A section (or card) whose background is the `primary`
  or `accent` token carries `class="group/section" data-section="primary|accent"`; the package's
  components read it and invert their own colours, so no block hand-writes a contrast colour for a
  button or link. `Section` does it from its `background` prop; a block that colours its own inner
  surface (the `cta` block's card) marks that surface the same way by hand.

`app/plugins/eldra-ui-messages.ts` provides the package's own strings (`Close`, `Clear`, "opens in
a new tab", …) for the active content locale, from `app/i18n/uiMessages.ts`, and — as of this
sub-project — `Price`'s number locale and store currency too (`LOCALE_KEY`/`CURRENCY_KEY`;
`app/i18n/uiMessages.ts#currencyFor` maps `is-IS` to `ISK` and everything else to `USD`, the same
two-locale mapping `uiMessagesFor` already used for strings). No block calls `Price` yet — there is
no product data source this early in the theme — so this is wired ahead of the first one that
will; `.storybook/eldra.ts` and `test/support/mountBlock.ts` do the same for their environments.

### The starter's own blocks

`blocks/` ships 33 blocks, `block.json`'s `category` grouping them the same way Studio's insert
palette does:

- **structure** (4) — `navigation` (display name "Header"), `announcement-bar`, `breadcrumbs`,
  `footer`.
- **marketing** (14) — `hero`, `cta` ("Call to action"), `feature-grid`, `split-content`, `stats`,
  `logo-cloud`, `testimonials`, `faq`, `pricing-table`, `newsletter`, `contact` ("Contact and
  map"), `video-embed`, `team`, `timeline`.
- **content** (7) — `article`, `article-list`, `rich-text`, `gallery`, `image`, `quote`, `tabs`.
- **commerce** (8) — `collection-header`, `product-carousel`, `collection-grid`, `product-detail`,
  `cart`, `search`, `order-status`, `trust-strip`.

The ten pre-existing blocks (`navigation`, `footer`, `hero`, `cta`, `feature-grid`, `faq`,
`testimonials`, `gallery`, `image`, `article`) were rebuilt in place, not renamed; every other
block is new. Each is a self-contained `blocks/<apiId>/` directory — see §3 for the contract.

### The one primitive left in `app/components/ui/`: `UiImage`

Every other hand-rolled primitive that used to live here — `UiDialog`, `UiDrawer`, `UiAccordion`/
`UiAccordionItem`, `UiTabs`/`UiTab`/`UiTabPanel` — is gone, replaced block by block with the
`@eldrajs/ui` component it duplicated (see the previous section). `UiImage` stays, and is not a
duplicate to eventually retire the same way: it is the one place the theme's own Studio
preview-overlay framing contract (`imageFraming`/`imageFramingAttrs`/`imageFramingStyle`,
`entryId`/`fieldPath` from `@eldrajs/theme-vue`) meets `@eldrajs/ui`'s `Image`, which must stay
standalone of `@eldrajs/theme-vue` and knows nothing about Studio. A block never calls `Image`
directly for CMS-sourced media — it calls `UiImage`, which maps `framing` to `Image`'s own
`focal`/`zoom` props, adds the `data-eldra-framing*` marker attributes Studio's interactive framing
controls key off, and forwards everything else (`aspect`, `sizes`, `priority`, `rounded`, `fill`,
`fit`, `classes`) straight through.

Vue 3 `<script setup lang="ts">`, Tailwind classes, no scoped CSS, every prop typed, `class`
passthrough via `attrs`. Restyle it by editing its file — there is no upstream package to fork or
override.

| Primitive | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UiImage` | Thin wrapper over `@eldrajs/ui`'s `Image`. `src`, required `alt` (empty string allowed for decorative), `framing?`, `aspect?`, `sizes`, lazy by default, `priority` for above-the-fold, `rounded?` (`'none' \| 'lg' \| 'xl'`, forwards to `Image`'s own radius), `fill?` (covers a positioned ancestor — the hero background), `fit?` (`'cover' \| 'contain'`, for an uncropped view — the gallery lightbox), `classes?` (passthrough to `Image`'s `classes`, for a radius/size `rounded`/`fill`/`fit` don't cover, e.g. `rounded-full`/`rounded-md`). `class`/`style` land on `Image`'s root (the frame's wrapper), not the `<img>` — use `rounded`/`fit`/`classes` for anything that needs to reach the frame or media element instead. |

Same as any other primitive: `UiImage.vue`, `UiImage.stories.ts`, and
`__tests__/UiImage.spec.ts` (render, axe, plus a keyboard test — not applicable here, since `Image`
renders no interactive control of its own).

One component sits outside both groups: `app/components/EldraIcon.vue` resolves a Tabler icon
_name_ — what a CMS field holds — to markup through `useEldraIcon` and hands it to `@eldrajs/ui`'s
`Icon`, which owns the size, stroke weight and ARIA state. The package takes an icon _component_,
which is what keeps an icon library out of its dependencies. Most blocks with a decorative or
labelled icon field (`navigation`'s mega-menu triggers, `footer`'s social links, `trust-strip`'s
payment marks and delivery promises, `feature-grid`'s per-item icon, `faq`'s disclosure chevrons,
`product-detail`'s stock/perk rows, and more) render it through `EldraIcon`, never a hand-rolled
`<svg>` or a direct `Icon` call with a hard-coded component.

Some `@eldrajs/ui` props take the icon _component_ rather than a name — `FeatureCard.icon`,
`Badge.icon`, `EmptyState.icon`, `EditorPlaceholder.icon`, `Select.leadingIcon`, `Button.iconLeft` —
and `EldraIcon` is a template, so it cannot be handed straight through. **`iconComponent(name)`**
from `app/composables/iconComponent.ts` is the one helper that builds one, caching per name at module
scope so a re-render never remounts (and re-fetches) the same icon; `EMPTY_ICON` from the same module
is the inert stand-in for a required `icon` prop with nothing to show. `EldraIcon` is built on the
same module's `tablerSvgBody`/`renderTablerSvg`, so the markup transform exists once. Import it
explicitly, like every other `app/**` helper a block uses; `test/starter.spec.ts` fails if a block
re-implements the transform or hand-rolls an icon `<svg>`. Every media-bearing block —
`hero`, `gallery`, `testimonials`, `product-carousel`, `article`, `team`, `logo-cloud`, the
commerce cards, and the rest — renders its images through `UiImage`, never `Image` directly, so
Studio's framing overlay works the same way across all of them.

`metadata.framing` on a media field is a promise to the editor — Studio shows framing controls for it
— and only `UiImage` can keep that promise, because it is what emits the `data-eldra-framing*`
markers and applies the focal point and zoom. So declare it **only** on a field the block renders
through `UiImage`: `test/starter.spec.ts` fails otherwise. A field whose media reaches the DOM some
other way (a package component that takes its image as a prop and exposes no media slot, like
`ContentCard`) declares no framing rather than offering a control the render ignores — that is
`article-list`'s case, documented in its own `Block.vue`.

## 3. The block contract

A block lives at `blocks/<apiId>/`:

```
blocks/<apiId>/
  block.json              field schema (Studio's CMS schema source)
  Block.vue                the renderer
  mock.json                the seed Studio writes when an author inserts the block — no demo media
  preview.json              optional: demo-imagery overlay, story/preview-only, merged onto mock.json
  preview.png               generated by `pnpm previews`, do not hand-edit
  __tests__/Block.spec.ts   render + axe (+ keyboard where interactive), merged data and bare mock.json
```

Stories are **generated**, not hand-written — see §4.

**Types.** `packages/vite-plugin-theme` writes `.eldra/block-types.d.ts` from every `block.json` on
dev/build and via `eldra-theme types --blocks`, declaring a global `EldraBlockData` map and
`EldraBlockEntry<K>` type. `Block.vue` declares
`defineProps<{ entry: EldraBlockEntry<'my-block'> }>()` and reads fields through
`useBlockData(props, 'my-block')`, which returns the typed `data` plus `useEldraBlockField`
bindings for rich text and image framing. The file is generated like `.eldra/manifest.json` — don't
hand-edit it, and don't format it (it's ignored by `oxfmt`).

**No Nuxt globals inside a block.** `blocks/**` and `app/components/ui/**` never call `useRoute`,
`useHead`, `NuxtLink`, `$fetch`, or `useAsyncData` directly, and never rely on Nuxt's auto-import —
every import from `vue` and `@eldrajs/*` is explicit. This is what makes every block render
correctly in Storybook, which has no Nuxt build step to auto-import from. Links go through
`@eldrajs/ui`'s `Link` (+ `safeHref`, + `app/components/EldraRouterLink.vue` for a same-site path);
rich text and slot zones go through `EldraRichText`/`EldraLayout`/`EldraBlockZone` from
`@eldrajs/theme-vue`. Pages (`app/pages/**`, `app.vue`) are not under this rule — `useRoute` /
`useHead` / Nuxt auto-imports are fine there, since they never run outside a real Nuxt build.

**Field types, and the one `reference` shape that is typed.** `block.json`'s field `type` values are
Core's (`string`, `text`, `rich-text`, `media`, `select`, `bool`, `int`, `list`, `composite`,
`reference`, …). A `reference` field carries a `relation` naming what an editor may pick, as any
combination of `allowedTagIds` (semantic tag names — never schema ids, which are not portable
across organizations), `allowProducts` and `allowCollections`, with **at least one of them**:
`eldra-theme validate` fails a relation that names none with `relation requires one of
allowedTagIds, allowProducts or allowCollections`, and Core's manifest ingest refuses it the same
way. Add `"multiple": true` for a list of picks.

A relation targeting catalog **collections and nothing else** is the one reference shape
`.eldra/block-types.d.ts` types: `EldraCollectionReference | null` (or an array when `multiple`),
where only `id` and `_type` are guaranteed — `slug`, `status`, `type`, `productCount` and
`translations` come with a resolved read, and a depth-0 read, an archived collection and an unsaved
draft overlay in the page builder all arrive as the bare stub. Any other relation stays
`Record<string, unknown>`, because the value's shape depends on what the author picked.
`product-carousel`'s `sourceCollection` and `collection-grid`'s `collection` are the worked
examples: each keeps its original handle field beside the picker (renamed "Collection handle
(legacy)") so a merchant's existing block keeps working, and resolves the collection through
`app/storefront/collectionSelector.ts` — the reference first (its `slug` when it has one, its id
otherwise), then the legacy handle, then the route.

**Variants.** A block with visual variants declares a `select` field named `variant` in
`block.json`; every declared option value gets its own generated Storybook story and its own axe
assertion in the block's test.

**`mock.json`** is the seed Studio writes into a block's CMS entry when an author inserts it from the
palette, so it must be a write-valid shape for every field type — most importantly, **media fields
are absent** (never `null`, never a fixture object): Core's write-side media validator only accepts
`{ "assetId": "<uuid>", "framing"?: {...} }`, and a block whose `mock.json` populated a media field
with a Storybook fixture is rejected with a 400 on every fresh insert. Every
other field is still the canonical demo content, not filler — write copy like a real store would, no
lorem ipsum; the starter's fictional store is "Northwind Goods" (home and lifestyle goods). Because
`mock.json` carries no media, `Block.vue` must render a sensible empty state with none (no crash,
never a broken layout — e.g. `hero`'s `image-background` variant falls back to `bg-surface-strong`
instead of light text on nothing) — this is also exactly the state a freshly-inserted block is in
before an editor uploads anything.

**`preview.json`** (optional, sibling to `mock.json`) is the story/preview-only overlay that supplies
demo imagery: the same media shape as before,
`{ "assetId": "demo-<name>", "url": "/demo/<name>.svg", "altText": "…" }`, and nothing else. Demo
images live under `public/demo/`, generated deterministically by `scripts/demo-images.mjs` (seeded
SVG illustrations, no third-party assets, no licensing question — a customer swaps them for real
photos). `scripts/generate-stories.mjs` merges it onto `mock.json` (`{ ...mock, ...preview }`) for
every generated story except `Inserted`, which renders the bare `mock.json` — exactly what Studio
seeds. A block with no media fields simply has no `preview.json`. Every block spec mounts both the
merged data and the bare `mock.json`, both asserted axe-clean — the bare-mock mount is the regression
net for a block that renders badly (or crashes) the moment it is freshly inserted.

**The merge is shallow** (`{ ...mock, ...preview }`, one level deep): a `list`-valued field present
in both files is not merged item-by-item — `preview.json` replaces the whole array. A block whose
list items carry non-media content (`title`/`body`/`href`, say, alongside the image) therefore
duplicates that content into `preview.json`'s copy of the list (`feature-grid` is the example in
this starter). Editing only `mock.json`'s copy silently has no effect on the generated story or the
regenerated `preview.png` — keep both copies in sync by hand, or move the field out of the list
shape if that drift becomes a real problem for a block you add.

**The `link` pair.** Core has no `link` field type, so a link is always two `string` fields: a
top-level link is `<name>Label` + `<name>Href` (`announcement-bar`'s `linkLabel`/`linkHref`,
`hero`'s `ctaLabel`/`ctaHref`), and a link inside a `list` is a `composite` item with `label` +
`href` children (`navigation`'s `menuLinks`, `footer`'s `columns[].links`). Every `href` a block
reads is passed through `safeHref` (`app/utils/links.ts`) first and renders nothing when that
returns `null`; a same-site `href` (`isInternalHref`) is routed by passing
`app/components/EldraRouterLink.vue` as the destination component's `as`/`linkAs` prop
(`Link`, `Button`, `Breadcrumb`, `Pagination`, and the card components all take it).

**The same rule applies to storefront-derived URLs, and it is applied centrally.** A product's `url`,
a search result's `targetUrl`, a cart line's or an order line's link come off a gateway response, not
out of the CMS, and they used to be the one class of URL in the theme that reached the DOM
unchecked. They are sanitised in exactly two places now: `app/storefront/gateway.ts`'s
`mapSearchResponse` (a result whose `targetUrl` does not survive `safeHref` is dropped, rather than
becoming a card that links to `#`), and `toProductCardEntries` in `app/storefront/toProductCard.ts` —
the one function `collection-grid`, `product-carousel` and `search` build their card lists through. It
returns per card the sanitised item, the `ProductCard` data and whether the destination is same-site,
so `link-as` follows `isInternalHref` exactly as a CMS-authored link does. `ProductCard`'s `url` is
required — a card always renders a link — so an item with an unusable URL is dropped outright.

**Versions and migrations.** `.eldra/manifest.json` is committed, and `eldra-theme validate` diffs
every block's current schema against it. Dropping a field, changing its `type`/`localized`/
cardinality, or removing it without bumping `block.json`'s `version` is a validation error — Core
has no other way to know the change is deliberate. A field kept under a new id bumps `version` and
adds a `migrations` entry pairing the old and new ids, e.g. `faq`'s rename of `single` to
`exclusive`:

```json
{
  "version": 2,
  "migrations": [{ "version": 2, "renames": [{ "from": "single", "to": "exclusive" }] }]
}
```

The renamed pair must stay storage-compatible (same `type`, same `localized`, same cardinality) —
a migration moves stored data forward, it never converts it. A brand-new `apiId` starts at
`version: 1` with no `migrations`, even in the same change that retires an old block of a similar
shape: the rule only ever compares a schema against its own prior manifest entry.

**Sample pages (`pages/*.page.json`).** Four fixtures — `home.page.json`, `product.page.json`,
`collection.page.json`, `article.page.json` — are this starter's channel for showing a realistic
page rather than one block in isolation. Each is `{ template, title, blocks: [{ apiId, id, data }] }`,
the same shape a real CMS page document has, hand-authored with the same Northwind content
convention as `mock.json`. They feed three things: `stories/pages/*.stories.ts` (a Storybook page
story rendering the fixture's blocks in the same three landmark regions the route does — see
"Page structure and landmarks" below — sharing `stories/support/pageBlocks.ts`'s apiId → `Block.vue`
map and its `renderPageFixtureRegions` renderer with the tests below), `test/pages/*.spec.ts`
(the page-level gate — see "Testing and accessibility gates"), and `test/support/mountPage.ts`,
which both of those build on. A page fixture is not a schema Core validates on its own — it is
proven correct by rendering it through both channels.

**Page structure and landmarks.** A CMS page is one flat, author-ordered block list, but a document
needs three outer landmarks, and `<header>`/`<footer>` only carry the `banner`/`contentinfo` role
while they are **not** inside a sectioning element. So `app/pages/[...slug].vue` partitions that list
(`app/utils/pageStructure.ts`) and renders three sibling `EldraBlockZone`s: the leading run of
`announcement-bar`/`navigation` blocks first, then everything else inside `<main id="main">`, then a
trailing `footer` block. Without the split, every scaffolded page had neither landmark and
`app/app.vue`'s "Skip to content" link — which targets `#main` — landed the visitor _above_ the
navigation it exists to skip.

The rule is positional on purpose: only a _leading_ run counts as the header (a second announcement
bar halfway down the page stays where the author put it) and only a _trailing_ `footer` counts as the
contentinfo (a `footer` block elsewhere stays in `<main>`, where `<footer>` is legal markup for a
section's own footer and carries no landmark role). `breadcrumbs` deliberately stays inside `<main>`:
the spec places it below the header as page content, and it renders a `<nav>`, which is a landmark
wherever it sits. Three zones rather than one is safe because `EldraBlockZone` is a stateless
renderer — it maps entries to their block component inside a `data-eldra-block` wrapper and holds no
per-zone state or registration — and Studio's preview overlay addresses blocks by those attributes
document-wide, so editing, selection and live block updates behave exactly as they did with one zone.

**One documented exception: a layout-driven page.** When a page (or its template) carries a layout,
`EldraLayout` renders the same flat block list through an authored layout tree whose nodes reference
block ids — nothing can be partitioned out of it without breaking the layout. Such a page therefore
keeps its header and footer blocks inside `<main>` and has no `banner`/`contentinfo`. Closing that
needs a layout-level region concept in the SDK, not a change in the route; the route template says so
at the `structure` computed, and `test/slugPage.spec.ts` asserts that the layout branch renders each
block exactly once (no double render from the header/footer zones).

**The storefront source, and its demo fallback.** Every commerce block (`product-detail`,
`product-carousel`, `collection-grid`, `collection-header`, `cart`, `search`, `order-status`,
`trust-strip`'s delivery estimate) reads product, cart, search and order data through
`useStorefront()` (`app/storefront/types.ts#STOREFRONT_KEY`) rather than calling `@eldrajs/sdk`
directly — the same "no block reads the network or the route itself" rule §3's Nuxt-globals
paragraph states, now for commerce data. Two implementations provide it:
`app/plugins/eldra-storefront.ts` wires up `createGatewayStorefront` (`app/storefront/gateway.ts`)
for the real Nuxt app, building an `@eldrajs/sdk` client from the same gateway URL/org id the theme
module already resolved and mapping live gateway responses into the theme's own view types
(`app/storefront/types.ts`); `.storybook/eldra.ts` and `test/support/mountBlock.ts`/`mountPage.ts`
instead provide `createDemoStorefront` (`app/storefront/demo.ts`) — the hand-built Northwind
fixture data every block spec, story and page fixture renders against, with no network at all.
A block never knows which one it got.

The demo source answers the _whole_ request, not just the paging part: `search.run` honours the query
text, and `catalog.collectionProducts` honours `sort` and `filters` (category, size, colour,
availability and a price range in whole dollars) and returns the filtered `total`, with facet counts
computed over the collection's own items so the filter UI never offers a value that returns nothing.
That matters beyond tidiness — the scaffolded site and the collection sample page are both
demo-backed, so a demo that ignored `filters` would show a shopper their filter changing the URL, the
chips and the active-filter row while the grid and the count stayed exactly as they were.

`catalog.collectionProducts` takes a `StorefrontCollectionSelector` — `{ slug }` or `{ id }` — not a
bare handle, because a `reference` field stores the collection's id and may hand the block nothing
else. `createGatewayStorefront` asks for a slug directly and resolves an id through the collection
list's `filter` query (`id:eq:<uuid>`, matched back against the returned row, so a gateway that
ignores the token cannot load the wrong collection); `createDemoStorefront` resolves an id from its
own fixture. Either way an id nothing matches resolves to `null`, never an error: the block shows
its empty state, plus an editor-only "Publish to load products" hint
(`storefront.unresolvedCollection*`) explaining why.

`forms.subscribe`, `forms.sendMessage` and `catalog.notifyBackInStock` (the newsletter, contact and
back-in-stock forms) have no gateway endpoint today: `createGatewayStorefront` posts
`{ kind: 'subscribe' | 'sendMessage' | 'notifyBackInStock', ...input }` as JSON to
`runtimeConfig.public.formsEndpoint` when a site has configured one, and resolves
`{ ok: false, reason: 'unsupported' }` (rendered as the form's own "isn't set up yet" copy, not a
crash) when it hasn't. Wire a real endpoint by adding it to `nuxt.config.ts`'s `runtimeConfig.public`
(or the matching `NUXT_PUBLIC_FORMS_ENDPOINT` environment variable) — see
[`examples/starter-nuxt/README.md`](../examples/starter-nuxt/README.md#storefront-forms) for the
exact snippet.

## Seeded templates

A site deployed from this theme is not empty: `nuxt.config.ts`'s `eldra.templates` and
`eldra.templateRoles` declare the default **route templates** Core creates on the site's first
deploy, so a merchant who installs the theme has working product, collection and home pages before
touching the page builder — and can then edit them like any other page.

`app/templates.ts` builds them, and there is nothing to hand-author: each seed is one of the sample
page fixtures (§3) turned into the manifest's seed shape.

| Seed       | `routePattern`       | `schemaApiId`        | Built from                   |
| ---------- | -------------------- | -------------------- | ---------------------------- |
| Product    | `/products/:slug`    | `catalog:product`    | `pages/product.page.json`    |
| Collection | `/collections/:slug` | `catalog:collection` | `pages/collection.page.json` |
| Home       | `/`                  | `home`               | `pages/home.page.json`       |

`catalog:product` / `catalog:collection` are the two reserved schema ids for a **catalog-backed**
template: it has no CMS schema behind it, and the theme resolves `:slug` against the public catalog
at render time (`useEldraPage().catalog`, see [themes.md](themes.md#seeding-default-templates)).
`home` seeds the site's home page and applies only when the site has none.

Four rules the file exists to keep:

- **The header and footer are roles, not blocks.** Each seed's `blocks` are its fixture's blocks
  **minus** `navigation` and `footer`; those two travel once, as `eldra.templateRoles`
  (`{ header: { apiId: 'navigation', data }, footer: { apiId: 'footer', data } }`), and the
  scanner's `header`/`footer` switches — on by default — place a `reusable` role node before and
  after every seed's blocks. Core turns each role into one reusable component on the site and
  points all three templates at it, so editing the header edits it everywhere instead of on one
  seeded page at a time.
- **Seed data is Core-valid, exactly like `mock.json`.** A seed is the write Core makes on deploy,
  so it obeys the same media rule: a media field is either absent or `{ assetId: <uuid> }`. The
  sample pages carry demo imagery for Storybook (`{ assetId: "demo-hero", url, altText, … }`), so
  `stripSeedMedia(data, fields, apiId)` walks each block's declared field types — nesting through
  `composite` and `list` included, which is how it reaches `navigation`'s
  `links[].features[].image` and `hero`'s `slides[].image` — and drops every value the CMS would
  refuse, keeping any real asset id. `test/starter.spec.ts` proves it: the seeds go through the
  same scanner the build runs, and no `url` survives into one.
- **And publishable, because Core creates a seed's entries published.** A published entry cannot
  omit a value for a `required` field, and there is nothing to invent for media, so
  `stripSeedMedia` resolves the two cases differently. A required media field inside a **list
  item** costs the item: it is dropped whole, because the item is the smallest thing that can go
  and a shorter list is a shape the block already renders — `hero`'s four demo `slides[]` all
  require an image, so the seeded hero carries `slides: []`, which is what its `mock.json` carries
  too. A required media field **anywhere else** (top level, or inside a non-list `composite`) has
  nothing to drop, so the block is unseedable and the function **throws**, naming the block and
  the field, failing the build rather than seeding an entry Core would refuse to publish. No
  starter block has such a field today; the guard is there so adding one is a build error rather
  than a broken first deploy.
- **Ids come from the fixture.** A seed block keeps the fixture block's own `id`
  (`product-detail`, `home-hero`, …), which is what the generated layout's `block` nodes
  reference.

Editing a sample page fixture therefore edits the seeded template too — one copy of the starter's
product page backs the Storybook story, the page-level test and the merchant's first deploy. The
manifest the build writes (`.eldra/manifest.json`) is where they land; `eldra-theme validate` does
not see them, because it validates the theme directory without loading `nuxt.config.ts`.

`.storybook/main.ts` declares the same two options on its own `eldraTheme(...)` instance. Storybook
never renders a seeded template — it is there because that instance writes the same
`.eldra/manifest.json` the Nuxt build writes, and without it the checked-in file flips between
"with seeds" and "without" depending on which build ran last.

## 4. Storybook and generated previews

Storybook 10 (`@storybook/vue3-vite`) lives in `examples/starter-nuxt/.storybook/`, with
`@storybook/addon-docs` and `@storybook/addon-a11y`. `viteFinal` registers `@vitejs/plugin-vue`
(Storybook's own Vue plugin only compiles CSF story templates, not the theme's `.vue` SFCs) and the
real theme Vite plugin, `eldraTheme({ themeDir, framework: 'nuxt', tailwind: false })`, so the same
`virtual:eldra/*` modules and token CSS that the real site uses are what stories render against —
plus Tailwind's own Vite plugin directly, mirroring the fallback route from §1.

Each primitive's own `.stories.ts` and `stories/pages/*.stories.ts` (below) are hand-written;
**block** stories are generated by `scripts/generate-stories.mjs` from `virtual:eldra/manifest` +
`virtual:eldra/blocks` into one file per block under `stories/generated/` — one `Default` story
(`mock.json` merged with `preview.json`, when the block has one), one `Inserted` story (bare
`mock.json` — what Studio seeds on insert), plus one story per declared `variant` option (from the
same merged base as `Default`) — so adding a block or a variant never means writing Storybook
boilerplate. Generation re-runs on every `storybook dev`/`build-storybook` (`.storybook/main.ts`'s
`viteFinal`), so `stories/generated/` is disposable — never hand-edit it.

**Page stories.** `stories/pages/*.stories.ts` — one per `pages/*.page.json` fixture (§3) — render
that fixture's full block list in the same three landmark regions the route renders it in (§3, "Page
structure and landmarks"), preceded by the same skip-link markup
`app/app.vue` renders on a real page (`app.vue` itself can't be mounted under Storybook's plain
Vite build, since it's Nuxt-only, so the story copies that one snippet). Each imports its fixture
directly and maps `apiId` → `Block.vue` through `stories/support/pageBlocks.ts`, the same static map
`test/support/mountPage.ts` renders through — including `renderPageFixtureRegions`, the one function
that performs the header/`<main>`/footer split for the stories, the page specs and (through
`app/utils/pageStructure.ts`) the route itself — so a page story shows exactly what its matching
`test/pages/*.spec.ts` exercises. `pageBlocks.ts` lives under `stories/` rather than `app/utils/` on
purpose: an `app/**` file importing every block would pull each `Block.vue`'s template into
`nuxi typecheck`'s program (blocks are otherwise only reached through the code-split
`virtual:eldra/blocks` glob), so page-story block imports are typechecked separately by
`pnpm typecheck:storybook` instead.

```bash
pnpm --filter starter-nuxt storybook          # dev server, port 6007
pnpm --filter starter-nuxt build-storybook    # static build, runs in CI
pnpm --filter starter-nuxt previews           # regenerate blocks/<id>/preview.png
```

**Previews are generated, and checked for staleness.** `scripts/previews.mjs` builds Storybook,
serves the static output, and screenshots each block's `Default` story at 1280×auto with Playwright
Chromium into `blocks/<id>/preview.png` (the theme plugin copies these into `.eldra/previews/` for
Studio's block picker). `.eldra/previews.json` records a content hash per block — the hash of
**every file under `blocks/<id>/`** except `__tests__/` and `preview.png` itself, **plus
`main.css`**, **plus the resolved `@eldrajs/ui` version**. The whole block directory rather than a
named file list, because a block's rendered output is more than `Block.vue`: `parts/*.vue`, a helper
module, `block.json`'s own `variant` options and `preview.json` all change what the screenshot shows,
and a named list silently goes stale the first time a block grows a new file. `main.css` and the
package version are in it because a shared style or a component change can repaint every block with
nothing in the theme touched. `test/previewsFresh.spec.ts` fails with
"run pnpm previews" if any hash is
out of date, so **run `pnpm --filter starter-nuxt previews` after any block, `main.css` or
`@eldrajs/ui` change and commit the result** — `preview.png`, `.eldra/previews/*.png`, and `.eldra/previews.json` are all
tracked. The starter declares its own `@playwright/test` devDependency for this, so `pnpm previews`
works in a standalone copy too; run `pnpm exec playwright install chromium` once locally before the
first use.

## 5. Strings

`app/i18n/en-US.ts` and `app/i18n/is-IS.ts` each export a `satisfies Messages` object with the
identical key shape (`app/i18n/messages.ts` declares it, and a test asserts both locale files agree
on their key set). `useT()` (`app/composables/useT.ts`) reads the active locale off the Eldra
preview context (`useEldra().preview.locale`), falling back to `en-US` when there is no context —
outside a themed page, in a unit test, in Storybook — and returns a `t(key, params)` function with
plain `{param}` interpolation. There is no `vue-i18n` dependency.

No hard-coded UI copy in primitives, blocks, or pages — every visible string, `aria-label`, and
`sr-only` label goes through `t(...)`. Content copy from a block's `mock.json` is data, not UI copy,
and stays out of the locale files. Add a new key to **both** locale files in the same change; the
Icelandic string should be a real translation, not a placeholder.

**Namespaces.** `Messages` (`app/i18n/messages.ts`) is one object with one nested namespace per
block, named for the block's own strings (`header` for `navigation`, `cta`, `grid` for
`collection-grid`, `product` for `product-detail`, `trust` for `trust-strip`, and so on — most
match the `apiId` directly, a few are shortened for readability) — a block's own spec only ever
reads its own namespace, so two blocks can never collide on a key. Two namespaces are shared rather
than per-block: `storefront` is vocabulary every commerce block needs in common — a
`StorefrontResult.pending`/`error` state, an order's delivery step — so it lives once instead of
once per commerce block namespace; `editor` holds the hint strings every block's empty-state
`EditorPlaceholder` reads (shown only under `useEditing()`), also shared rather than duplicated.
`nav`, `notFound`, `loading` and `error` are the page-chrome strings `app/app.vue` and the 404 page
use directly.

## Testing and accessibility gates

Every primitive and block spec mounts from its mock/story data and asserts
`expect(await axe(wrapper.element)).toHaveNoViolations()` (`vitest-axe`, jsdom). Interactive
primitives and blocks (menu, dialog, drawer, accordion, tabs, carousel, lightbox) additionally carry
a keyboard test — arrow keys, Escape, Tab order, whatever the control's native interaction model
requires. Every interactive element carries a focus ring — the package's `eldra-focus` on its own
components, `app/utils/classes.ts`'s `focusRing` on everything the theme draws itself — and any
animation is gated behind `motion-safe:`.

**The page-level gate.** A block spec proves the block; `test/pages/*.spec.ts` (one per
`pages/*.page.json` fixture, mounted through `test/support/mountPage.ts` — see §3/§4) proves what
only shows up once several blocks share a page: `expect(await
axe(wrapper.element)).toHaveNoViolations()` over the **whole rendered page**, not just one block;
exactly one `<h1>` with no skipped heading level across every block's headings combined; every
`aria-labelledby`/`aria-describedby`/`for` target resolves and every `id` on the page is unique
(two block instances that both generate an id must never collide — this is what `useUiId()`
guards); exactly one `banner`, one `main` and one `contentinfo` landmark, in that document order,
with neither the `<header>` nor the `<footer>` inside `<main>`; the skip link is the first focusable
element **and every focusable element in the header precedes `#main`**, so following it really does
skip the navigation; and the adjacent-same-background-padding
collapse rule (§1, "two adjacent same-background sections drop the second's top padding") behaves
correctly across real block boundaries — including that a non-`Section` block like `breadcrumbs`
(no `data-section`/`data-section-bg` at all) takes no part in it, so the block after it keeps its
own top padding. Each fixture's own spec adds page-specific assertions on top (the home page's
"matches the shared page facts, and only those", the product page's page-unique radio group names
across a real product-detail instance, and so on).

```bash
pnpm --filter starter-nuxt typecheck          # nuxi typecheck + the Storybook config/stories
pnpm --filter starter-nuxt test               # vitest — every block/primitive spec, axe included
pnpm --filter starter-nuxt generate           # nuxi generate — proves a real static build
pnpm --filter starter-nuxt build-storybook    # proves Storybook itself still builds
pnpm --filter starter-nuxt previews           # regenerate + freshness-check block previews
pnpm check                                    # everything above, repo-wide, in CI's order
```

See [examples/starter-nuxt/README.md](../examples/starter-nuxt/README.md) for how to run the
starter itself, add a block, and restyle it via tokens.
