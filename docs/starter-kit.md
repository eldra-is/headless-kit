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
a new tab", …) for the active content locale, from `app/i18n/uiMessages.ts`, plus `Price`'s number
locale and the store currency (`LOCALE_KEY`/`CURRENCY_KEY`). The two are different decisions and
come from different places: the number locale follows the content locale, and the **currency is the
platform's** — the store's own commerce settings, which `@eldrajs/theme-nuxt` reads once during the
build and puts on `runtimeConfig.public.eldra.commerce`. A store that publishes none provides no
currency at all, and the theme's money layer then renders prices as plain numbers rather than
labelling real amounts with a guessed symbol. `.storybook/eldra.ts` and
`test/support/mountBlock.ts` do the same for their environments, taking the currency from the demo
storefront (`DEMO_COMMERCE`, US dollars — what every Northwind amount is quoted in) instead of a
runtime config.

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

**The theme decides which Tabler icons exist.** `app/icons.ts` imports each one's SVG (`?raw`) and
maps it by name; `useEldraIcon` is a synchronous lookup in that map, with no server route and no
request. That is what makes an icon work everywhere the theme runs: a statically hosted page, a
block that renders in the browser after its data arrives, and Studio's preview the moment an editor
types a name — none of which can ask a server for a file. **To add an icon, add one import line and
one entry to `app/icons.ts`**, using the Tabler outline icon's own name (<https://tabler.io/icons>).
A name that is not in the map renders nothing — deliberately, because an icon name is a CMS field
and an editor can type anything at all. `test/themeIcons.spec.ts` keeps the theme's own names
honest: it scans `blocks/**`, `app/**` and every block's `mock.json`/`preview.json`/`block.json` for
icon names and fails when one is missing from the map. A name a block _computes_ (a social network,
a card brand) is beyond a scan, so type that lookup `ThemeIconName` — exported from the same module
— and `pnpm typecheck` proves it instead.

Some `@eldrajs/ui` props take the icon _component_ rather than a name — `FeatureCard.icon`,
`Badge.icon`, `EmptyState.icon`, `EditorPlaceholder.icon`, `Select.leadingIcon`, `Button.iconLeft` —
and `EldraIcon` is a template, so it cannot be handed straight through. **`iconComponent(name)`**
from `app/composables/iconComponent.ts` is the one helper that builds one, caching per name at module
scope so a re-render never remounts the same icon; `EMPTY_ICON` from the same module
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

**Render a text value as it was given.** In Studio's preview every text field's value carries an
invisible editing payload — a run of zero-width characters after the text, naming the entry and the
field — and the preview overlay turns the text node it survives into the field an author can click
and type in. So a block displays the value it was handed: `{{ heading }}`, not
`{{ heading.toUpperCase() }}`, not ``{{ `${label}: ${value}` }}``, not a copy put through
`.replace(/\s+/g, ' ')` or `.slice()`. `value.trim()` is fine — `@eldrajs/theme-core` reads a
payload whose delimiter trimming ate. `test/inlineEditable.spec.ts` mounts every block with an
encoded copy of its `mock.json` and fails with the field paths whose payload the block destroyed.

Anything the value is _not_ displayed as derives from `stripStega(value)` (`@eldrajs/theme-core/stega`)
instead, so that the preview and the static site agree: a storage key (`announcement-bar` hashes its
dismissal off the stripped message), an `aria-label`, a lookup, and a sentence the value genuinely
has to be composed into (`search`'s heading, where `{query}` is replaced with the shopper's query —
composing from the stripped copy is what stops the overlay offering an edit that would write the
composed sentence back over the author's template). **Emptiness checks are the same rule and are the
convention for new blocks** — `stripStega(value).trim() !== ''`, because `trim()` alone leaves the
payload's bit characters behind and reads a cleared field as filled. The 33 blocks here still write
`(value ?? '').trim() !== ''` and are being migrated.

**Field types, and the one `reference` shape that is typed.** `block.json`'s field `type` values are
Core's (`string`, `text`, `rich-text`, `media`, `select`, `bool`, `int`, `list`, `composite`,
`reference`, `link`, …). A `link` field stores one destination the platform understands — a
product, collection, category, entry or page by id, or an external URL — and the theme derives the
href with `useEldraLink()` (see `docs/themes.md`, "Links"), so a renamed collection can never leave
a header pointing at a 404. It may narrow what an author can pick with `metadata.kinds`, restrict
`kind: "entry"` with `metadata.allowedEntrySchemaApiIds`, and — on a `link` that is a `list`'s
`metadata.item` — ask for a one-level tree with `metadata.tree: true`, which is how the header and
footer author their navigation. A `reference` field carries a `relation` naming what an editor may pick, as any
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
`product-carousel`'s `sourceCollection`, `collection-grid`'s `collection` and
`collection-header`'s `collection` are the worked examples, and a reference is now the **only** way
any of the three names a collection: the handle string fields they shipped with
(`sourceHandle`, `collectionHandle`) are retired, because a handle a merchant retyped went stale the
moment the collection was renamed. All three resolve through
`app/storefront/collectionSelector.ts` — the reference first (its `slug` when it has one, its id
otherwise), then, for the two blocks that can sit on a collection template, the route's own
collection. A retired handle an entry still carries (Core keeps it as `<fieldId>__vN`) is not read
by anything in the theme.

**A seed names a collection by slug.** A theme cannot know an organisation's collection ids, so a
`reference` value in seed data — a block's `mock.json`, a `pages/*.page.json` fixture, a template
seed's block data — may take the form `{ "_type": "collection", "slug": "<handle>" }`. Core resolves
it against the organisation's own catalog at seed time and leaves the field empty when nothing
matches, so the deploy still succeeds. `eldra-theme validate` holds every seed reference to one of
three shapes — absent, `{ "_type": …, "id": "<uuid>" }`, or that slug form on a relation whose
`allowCollections` is true — and refuses anything else with the path that carries it. `mock.json`
leaves references **absent** (see below); `pages/home.page.json`'s carousel is the worked example of
the slug form.

**Variants.** A block with visual variants declares a `select` field named `variant` in
`block.json`; every declared option value gets its own generated Storybook story and its own axe
assertion in the block's test.

**Conditional fields (`showWhen`).** A field only one variant reads declares
`"showWhen": { "field": "variant", "in": ["collection"] }`, and Studio offers it to an author only
while that sibling holds one of the listed values (`"equals": "collection"` is sugar for a
single-entry `in`; the scanner normalizes it away). `field` names a sibling in the **same** field
set — top level, or the same `composite` / `list` item — which must be a `select`, `bool` or
`string` field carrying no `showWhen` of its own, and every value must be one of a `select`
sibling's `metadata.options`; `eldra-theme validate` refuses each of those with a line naming the
field. Visibility is authoring UX, not storage: a hidden field keeps its stored value (so switching
a variant back restores what the author typed), validators apply only while it is visible, and
adding, changing or removing a condition never needs a `version` bump. `product-carousel` is the
worked example — the collection source is offered only for the `collection` variant, `viewAllHref`
only for `related`, and the `collection` variant derives its "view all" link from the collection
that was picked (`/collections/<slug>`, from `app/storefront/collectionSelector.ts`'s
`selectorSlug`) rather than asking for a URL a second time, showing no link while that collection
is known only by id. `collection-grid` and `collection-header` declare none: each has a single
collection field with no variant to condition it on.

**`mock.json`** is the seed Studio writes into a block's CMS entry when an author inserts it from the
palette, so it must be a write-valid shape for every field type — most importantly, **media fields
are absent** (never `null`, never a fixture object): Core's write-side media validator only accepts
`{ "assetId": "<uuid>", "framing"?: {...} }`, and a block whose `mock.json` populated a media field
with a Storybook fixture is rejected with a 400 on every fresh insert. **Reference fields are absent
too**, for the same reason a media field is: an inserted block must not arrive pointing at one
particular collection. The demo reference that makes a generated story render real catalogue data
goes in `preview.json` instead (`collection-grid`, `collection-header` and `product-carousel` each
carry one, by the demo fixture's own id). Every
other field is still the canonical demo content, not filler — write copy like a real store would, no
lorem ipsum; the starter's fictional store is "Northwind Goods" (home and lifestyle goods). Because
`mock.json` carries no media, `Block.vue` must render a sensible empty state with none (no crash,
never a broken layout — e.g. `hero`'s `image-background` variant falls back to `bg-surface-strong`
instead of light text on nothing) — this is also exactly the state a freshly-inserted block is in
before an editor uploads anything.

**`preview.json`** (optional, sibling to `mock.json`) is the story/preview-only overlay that supplies
demo imagery: the same media shape as before,
`{ "assetId": "demo-<name>", "url": "/demo/<name>.svg", "altText": "…" }` — and the demo collection
reference the commerce blocks need to render a real grid, carousel or header in a story. That one
carries **both** keys, `{ "_type": "collection", "id": "<a demoCollectionId() value>", "slug": "…" }`,
because that is what a published read hands a block (a bare `{ id, _type }` stub is the depth-0 /
draft-overlay case, where `catalog.collection()` has no key to look a title, description or count up
by) — so the story and the `preview.png` show what a live page shows, not a half-resolved one. Demo
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

**Retiring a field takes the bump and nothing else.** A field dropped outright has no rename to
declare, so it gets no `migrations` entry: the `version` bump is the whole signal, and Core moves
the previous content into a `<fieldId>__vN` legacy field rather than discarding it. Three fields
retired this way when the commerce blocks moved to collection references — `product-carousel`'s
`sourceHandle` (version 2 → 3), `collection-grid`'s `collectionHandle` (2 → 3) and
`collection-header`'s `collectionHandle` (1 → 2, the same change that added its `collection`
reference; _adding_ a field needs no bump). Nothing in the theme reads a retired field, which is
the point: a stale handle must not stand in for the collection an author picked.

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

**Commerce data is prerendered, and only price and stock refresh afterwards.** On the real site a
storefront result's first read runs inside a keyed `useAsyncData` (`storefront:<method>:<arguments>`),
so `nuxi generate` waits for it: a product page's static HTML carries the real title, images,
options, description, price and stock line, the values ride to the browser in the page payload, and
hydration paints the same DOM without fetching anything again.

A `StorefrontResult` carries three flags and they answer three different questions. `pending` is the
**skeleton** state and nothing else — a read in flight with nothing to show yet; never true over a
value the page already has, and never true once a read has answered, even when the answer was `null`
("no such product" is a result, not a wait). `loading` is **any read in flight**, including a manual
`refresh()` and a reload for changed sources — the flag a block draws a small spinner from while the
value it already has stays on screen (`loading && data !== null`). `revalidating` is the narrowest:
the volatile keys, and only those, are being refreshed.

What can have moved since the build is money and the stock line, so after the app mounts the page
does one batched read for the products it is showing
(`catalog.volatileByIds` → `filter=id:in:…`, chunked at 50) and swaps only
`price.amount`/`price.compareAt`/`available`/`stock` in; the product **detail** page refreshes
through its own `catalog.product` read instead, because that read is the only one that knows the
variant-level inventory behind its stock line. That read pairs the catalogue response with one bulk
`inventory.availability` call for the product's variants (no `locationId`, so the organisation's
default location answers), and fills `inventory` and `stock` from it: a published variant with
nothing on the shelf reads sold out rather than "In stock, ready to ship". The call fails soft — a
store that tracks no stock, an answer about no variant, a service that is down all leave the page on
the variant's published status, silently, because a shopper cannot act on "we could not reach
inventory". Product **cards** stay on status: availability is per variant and a card carries none, so
a grid would cost one detail read per tile.

A batch is every result registered before it goes out, and there can be more than one:
blocks are lazily imported components, so a block whose chunk arrives after the app has mounted
opens the next batch rather than being left out of the only one — which is what used to happen,
silently, to the carousel on a product page. What is once per page load is the **question**, not the
batch: the page remembers every product it has asked about and the read that is answering for it, so
a block that arrives in a later burst showing products an earlier one already covered asks nothing
and folds in the answer already on its way. Two blocks over the same collection therefore cost one
request and can never paint two different prices; two results needing the same detail read share
that request too; and a result that somehow registers twice takes part once. Without that the
deployed pages issued every read twice, ~35 ms apart, with identical ids.

The one thing that is **not** shared is the detail read itself: a result that reads for itself never
takes the batch's answer, because the products list the batch reads from carries no inventory, and
the product page's stock line is the one thing that needs it. So a page showing the same product in a
card and in the buy box makes both reads — one extra request, and the right trade: folding the list's
answer into the buy box would leave it on the stock the page was built with, which is the whole
reason the refresh exists.

While that is in flight the keys being refreshed sit in `StorefrontResult.revalidating`
(`'price' | 'stock'`) and the prerendered value stays on screen; a failed refresh keeps the value
and clears the set — a page never regresses to an error state for something it can already show.
A result created _after_ hydration reads the build's answer when there is one and loads live when
there is not, and the test is the payload itself: Nuxt loads the destination's `_payload.json` in
`router.beforeResolve` and writes every key in it into `nuxtApp.static.data` before the page
component exists, so a client navigation to a **prerendered** route finds its results already
answered — real prices on the first frame rather than a skeleton, and the same one batched volatile
refresh a hard load makes. A key that is not there is a route the build does not have (a preview, a
dev server) or a question the build could not know (a search as the shopper types): it loads live as
it always did and never takes part in a batch, since it has the live values already. The demo
storefront never refreshes at all, so stories and specs are unaffected. (The demo does answer _synchronously_ off a browser, so a server render of a block
against it carries the fixture's real values rather than a skeleton — the same thing the gateway
storefront does for the real site.) The wiring lives in `app/plugins/eldra-storefront.ts` (Nuxt's
half) and `app/storefront/refresh.ts`/`volatile.ts` (the framework-free half).

**What a block owes the prerender: sources that are final at setup time.** A result is cached under
a key built from its sources' values when it is created, and that key is how the browser finds the
value the build left for it. A source that says one thing during `nuxi generate` and another a
moment after hydration mints a second key, misses the payload, and refetches data the page is
already showing. Browser-local state is the trap: `product-carousel` creates three results and
renders one, and its `recently-viewed` source is `localStorage` — empty while the site is generated,
filled the instant `product-detail` records the view — so until it was gated behind its own variant
every product page ran a full products read for a row nobody was looking at. A block gives the
results it is not rendering an empty source, and reads browser-local state only in the variant that
shows it. `test/prerenderRefresh.browser.spec.ts` is the guard: a real `nuxi generate` against a
mock gateway, served as static files and driven with Playwright, asserting the payload's key set and
every request the page makes afterwards.

**A query string is not in the route while a prerendered page hydrates.** Nuxt hydrates a
prerendered route under the _payload's_ path — query stripped — and restores the address bar's real
URL only once the app's `<Suspense>` has resolved (`hasDeferredRoute`, in Nuxt's own router plugin).
So a block built during hydration sees `route.filters` empty however the visitor arrived, and a
block that seeds its URL-backed state once and never looks again is inert on the deployed site:
`/collections/<slug>?minPrice=50&maxPrice=150` rendered the whole collection, both price inputs
blank, with the chips and the URL insisting otherwise, and no request but the volatile batch.
`collection-grid` therefore **adopts the route after mount** (`adoptRouteState`) and watches it from
there — which is also what makes Back/Forward and a shared link work. Two rules keep that honest and
are worth copying into any block that reads the URL: adopt _after_ mount, never during `setup`, so
the first client render is still the server's HTML and the filtered read is a transition rather than
a hydration mismatch; and guard every assignment with an equality check, because the block's own
writes come back to it as route changes and an unguarded re-seed turns each one into a second
request. The filtered read misses the payload by construction — the filters are part of the result
key — so it reads live, which is exactly what it should do over a build that prerendered the
collection unfiltered. `test/prerenderRefresh.browser.spec.ts` covers both directions: a hard load
carrying a price range, and a query changed under a mounted block. `search` has always followed
`route.query` this way (its own watcher, so `/search?q=…` runs the restored query and every later
one); its spec now guards that explicitly, since it is the same defect class one seed-once line
would reintroduce.

**The page must be one route however the host spells it.** A generated site is a tree of
`<route>/index.html` files, and static hosts disagree about which URL that file lives at: the
deployed Eldra preview host answers `/products/ash-glaze-mug` with a 308 to
`/products/ash-glaze-mug/`, while the artifact was prerendered at the path _without_ the slash. Nuxt
compares the two while the page hydrates, finds them different and re-navigates between them — and
the catch-all route's default key differs between those two spellings, so the page and every block
on it were destroyed and built again: each block's `setup` ran twice and every storefront read in it
went out twice, while only one of the two instances ever mounted (so nothing in the DOM, and no
`onMounted` side effect, gave it away). `app/app.vue` therefore passes
`:page-key="eldraRouteKey"` — `@eldrajs/theme-nuxt`'s own canonical-path key, the same identity
`useEldraPage()` resolves content under — to `<NuxtPage>`. Keep that binding; a theme that drops it
pays for every commerce read on every dynamic route twice. The guard is the same generate-level
spec, whose static server redirects the way the real host does and whose mount probe counts block
instances, not DOM nodes.

**What the visitor actually sees.** Nothing moves. The price and the stock line the page was built
with stay exactly where they are, at their own size and wording; while the refresh is in flight they
are drawn slightly dimmed with a small spinner beside them, and each is marked `aria-busy`
(`@eldrajs/ui`'s `revalidating` state on `Price`, `StockBadge` and `ProductCard` — a state distinct
from `loading`, which is the skeleton). When the live value equals the prerendered one — the
ordinary case — nothing visibly changes at all; when it differs, the number is simply different a
moment later. A refresh that fails changes nothing: the value stays and the spinner goes. There is
no flash, no layout shift, and no state in which the page has less than it started with.

Announcements follow the same "say it once" rule. A product page has one price and one stock line,
so each announces its own refresh through a visually hidden live region. A grid or a carousel passes
`announce: false` to every card and renders **one** polite region for the whole block instead
("Updating prices and stock") — 24 refreshing cards would otherwise hold 48 regions all speaking at
the same moment. Blocks flip the flag on only _after_ mount (`app/composables/useRevalidating.ts`):
the server renders with nothing refreshing, so the browser's first render has to match it, and a
live region that arrives already holding its message is announced unreliably.

**Skeletons are for pages with nothing, never for pages with something.** A block draws its skeleton
only while `pending && data === null` — the genuine first load. A read over results the visitor can
already see (a filter, a sort, a page, a different product) keeps those results on screen under the
same dimmed-value + spinner treatment, with `aria-busy` on the block; an error over them keeps them
too, and "We couldn't load this right now." is reserved for a page that has nothing to show. The one
new state this adds is the honest opposite: a read that answers `null` without failing — a link to a
product the catalogue no longer has — says so (`storefront.notFound`) instead of rendering nothing.

**You do not rebuild the site to make a price correct.** Two mechanisms cover the gap from opposite
ends. The refresh above covers the minutes after a visitor loads a page. Underneath it, a change to
a variant's price or compare-at price, or a product's availability flipping, enqueues a site rebuild
by itself — **coalesced**, at most one per site per window (5 minutes by default, a site setting),
so a merchant repricing forty products causes one rebuild rather than forty. Stock _quantity_
changes never rebuild; they are live-only, which is exactly what the volatile refresh is for. The
prerendered HTML is therefore never more than one window behind, and what a visitor is looking at is
never more than one page load behind.

**Money is major units, everywhere in the storefront layer** — a price of `28` is twenty-eight
dollars, because that is what the catalog sends. `app/storefront/money.ts` is the only place that
converts anything: `formatMoney(amount, currency, locale?)` for money inside a sentence (an "Add to
cart · 2.800 kr." label), `toMinorUnits` for `@eldrajs/ui`'s `Price`/`ProductCard`, whose own
`amount` props read minor units, and `roundMoney` for any sum the theme computes itself.
`useMoney()` binds the first two to the currency and locale the surrounding `@eldrajs/ui`
components resolve, so a block's formatted text and its `<Price>` elements can never disagree — and
it is the one place a block resolves either. Because the digit count comes from the currency, a
zero-decimal one (`ISK`) formats and converts correctly instead of growing two invented decimal
places.

**The currency is the store's, and it is never guessed.** It comes from the platform — the
organisation's commerce settings, read once at build by `@eldrajs/theme-nuxt` and provided app-wide
under `CURRENCY_KEY` — so both money helpers take it **explicitly, with no default**: a currency
inferred from the content locale puts a dollar sign in front of krónur, which is a wrong price
rather than an incomplete one. A store that has not configured commerce publishes none, and then
`formatMoney` renders a plain number (`4.800`), an unusable code renders the number plus the code
(`4,800 XYZ1`), and neither ever throws — these run inside `computed`s, where a throw takes the
whole block down. `@eldrajs/ui`'s `<Price>` elements follow the same rule, which takes one small
piece of care: an _absent_ `CURRENCY_KEY` is what the package answers `USD` for, so "no currency"
is provided as the empty string instead (`uiCurrencyFor`, `app/storefront/commerce.ts`) — a code
`Intl` must reject, which is exactly how `Price`'s own fallback arrives at a bare number.
`useStorefront().commerce` carries the whole record for the blocks that need more than the currency:
`taxInclusivePricing` (whether the amounts on screen already contain VAT) and `defaultTaxRate`.

**`@eldrajs/ui` follow-up:** `useEldraUiCurrency()` should not default to `USD`, and `Price` should
render a bare number for a code it cannot use rather than the number followed by that code. The
empty-string sentinel above is a workaround for both: it is what makes the package decline a currency
at all, and because `Price` still appends the (empty) code it leaves a trailing space in the rendered
markup and logs one dev warning per component instance. When the package stops guessing,
`uiCurrencyFor` can be deleted and the plugin can provide `commerce?.currency` directly.

The demo source answers the _whole_ request, not just the paging part: `search.run` honours the query
text, and `catalog.collectionProducts` honours `sort` and `filters` (category, size, colour,
availability and a price range in whole dollars) and returns the filtered `total`, with facet counts
computed over the collection's own items so the filter UI never offers a value that returns nothing.
That matters beyond tidiness — the scaffolded site and the collection sample page are both
demo-backed, so a demo that ignored `filters` would show a shopper their filter changing the URL, the
chips and the active-filter row while the grid and the count stayed exactly as they were. The facet
pass itself is **one implementation, shared** — `app/storefront/facets.ts`, pure and framework-free
— so the demo and the gateway filter by exactly the same rules (price bounds inclusive and in major
units, `availability` read off the item's own stock, values OR-ed within a source and AND-ed across
sources). The demo supplies the per-product attributes a product card does not carry; see the
gateway's own paragraph below for what that means on the live site.

`catalog.collectionProducts` takes a `StorefrontCollectionSelector` — `{ slug }` or `{ id }` — not a
bare handle, because a `reference` field stores the collection's id and may hand the block nothing
else. `createGatewayStorefront` asks for a slug directly and resolves an id through the collection
list's `filter` query (`id:eq:<uuid>`, matched back against the returned row, so a gateway that
ignores the token cannot load the wrong collection); `createDemoStorefront` resolves an id from its
own fixture. Either way an id nothing matches resolves to `null`, never an error: the block shows
its empty state, plus an editor-only "Publish to load products" hint
(`storefront.unresolvedCollection*`) explaining why.

**Every gateway filter is a `[groupIndex:]field:op:value` token** — the shape the SDK's contract
fixture documents for the `filter` parameter — against one of the few fields a storefront list
actually filters on (`id`, `slug`, `status`, `createdAt`; the fixture documents the token shape, not
the field or operator set, so treat this list as what the gateway accepted when it was written and
check a 400 against it). A token the gateway does not accept is a 400, not an empty list, so the
tokens this theme builds live in one place in `app/storefront/gateway.ts`. `byHandles` asks for its
whole set in one `slug:in:a,b` token (bare tokens are AND'd, so one `eq` per handle would match
nothing), and `filter` is the one query parameter the gateway declares repeatable
(`explode: true`) — `@eldrajs/sdk` sends one `filter=` per token for it and keeps `sort`/`fields`
comma-separated. `related` has no relatedness endpoint to call, so it reads the current product and
lists the same `categoryId` (the documented query parameter on `GET /catalog/v1/products/list`), the
product itself excluded, falling back to the newest active products when it has no category or the
category holds nothing else. Its sort ids map to the sort fields the endpoint knows (`featured` and
`best-selling` to none: `featured` _is_ the collection's own order, and the contract exposes no sales
figures).

**The collection grid's facets are applied client-side, over the results the gateway returned.**
`category`, `option:*`, `price` and `availability` are not fields that endpoint filters on, so no
`filter` token is built from them; sending one is a 400, and dropping them silently is worse —
`?minPrice=50&maxPrice=150` used to leave the $48 product on screen under a URL, chips and an
active-filter row that all claimed it had been filtered. `createGatewayStorefront` now runs the same
`app/storefront/facets.ts` pass the demo does over the page it fetched, and reports the filtered
count as `total`, which is what the grid's count line and `LoadMore`'s "Showing X of Y" read.

Two consequences worth knowing before a shop with a long collection goes live:

- **A filtered read scans up to 200 products** (`FACET_SCAN_CAP` in `app/storefront/gateway.ts` —
  nine reads at the starter's default page size of 24). One gateway page would hide every match
  beyond page one; no bound at all would mean a request per 24 products for a catalogue of any size.
  Beyond the cap a filtered view describes only the first 200 products of the collection **in the
  gateway's current sort order**. Raise or lower the constant for your own catalogue; an unfiltered
  read is untouched either way (one request, the gateway's own `total`).
- **`facets` are counted off the fetched rows** (`deriveFacets`) rather than read from a response
  field that does not exist — `dto_ProductListResult` declares only `data`/`meta`. In practice that
  is the colour group: `category`, `size` and `availability` are store vocabularies (which values
  exist, in which order, under which labels) that a product-list row does not carry, so those groups
  list nothing rather than inventing values. A facet the rows cannot answer is treated as _unknown_
  and ignored — ticking a size never empties the grid on the live site — while `price` and
  `availability`, which read the item itself, filter exactly as they do in the demo.

**Core follow-up:** server-side facet filtering (and facet counts) on the catalog list endpoints
(`internal/modules/catalog/repository/{collection_query,product_list}.go` filter on
`id`/`slug`/`status`/`createdAt` only). When those land, the block's filters become `filter` tokens
again, `total` and `facets` come from the response, and this whole client-side pass — scan cap
included — goes away.

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

Six rules the file exists to keep:

- **The header and footer are roles, not blocks.** Each seed's `blocks` are its fixture's blocks
  **minus** `navigation` and `footer`; those two travel once, as `eldra.templateRoles`
  (`{ header: { apiId: 'navigation', data }, footer: { apiId: 'footer', data } }`), and the
  scanner's `header`/`footer` switches — on by default — place a `reusable` role node before and
  after every seed's blocks. Core turns each role into one reusable component on the site and
  points all three templates at it, so editing the header edits it everywhere instead of on one
  seeded page at a time. The runtime renders that role-resolved placement from inside the
  template: `useEldraPage()` hands `EldraLayout` the **template** read's own
  `reusableComponentProjection`, which expands the header component where its node sits, between
  the template's own blocks — see
  [Reusable page components](theme-reusable-components.md#route-templates).
- **The seeded header and footer carry no destinations.** A theme cannot know an organisation's own
  collections, pages or policy documents, so the fixtures leave every link field in `navigation` and
  `footer` empty — the header's `links` and `cta`, the footer's `groups`, `links`, `legalLinks` and
  `social` — and `showAccount` is off (its declared default) until a store has customer accounts.
  Every _setting_ stays, because a setting is a decision the theme can make: brand, variant, search
  style, sticky, the selectors, the newsletter copy. A seeded demo link resolves to nothing on a
  fresh organisation and renders as a label, or as a path to a page nobody has written — which is
  also why both blocks draw each part only when it holds something: no empty link column, no Menu
  button over an empty drawer, no rule across an empty legal row. `blocks/*/mock.json` keeps its demo
  rows, because that is the state of a block an author has just inserted, not the state a deploy
  seeds.
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
- **A catalog seed names no product or collection.** The sample pages name one — that is what
  makes them a realistic page — but a template renders whatever its route resolved, so the seeds
  for `/products/:slug` and `/collections/:slug` drop everything that names the fixture's own
  object and bind the fields the routed object carries itself. Dropped: `product-detail`'s
  `productHandle`; `collection-header`'s `collection`, `title` and `description`;
  `collection-grid`'s `collection`; `product-carousel`'s `viewAllHref` (a link into the fixture
  product's category); the fixture's own levels and
  links in `breadcrumbs`' `trail` and `collection-header`'s `subcollections` (emptied, a shape both
  blocks render — `breadcrumbs` still shows the Home crumb from `showHome`); and
  `product-detail`'s "Details" tab, which is the fixture product's own description, leaving the
  store-wide Shipping and Returns tabs. Bound on the seed's layout node: `breadcrumbs`'
  `currentTitle` and `collection-header`'s `title`, both `{{ title }}` against the catalog
  projection. `collection-header`'s `description` is rich text and a text template renders a
  string, so it is only dropped — the block falls back to the collection's own description, which
  is the same value. The home seed keeps its carousel's `sourceCollection`: `/` has no route
  context to fall back to, and the carousel has no route fallback at all. It names the collection
  by slug (`{ "_type": "collection", "slug": "the-winter-edit" }`), the only form a theme can ship,
  and Core resolves it against the organisation's own catalog on deploy. `test/starter.spec.ts` checks the per-field rules and, bluntly, that the fixture's
  product and collection are named nowhere in a catalog seed.

Editing a sample page fixture therefore edits the seeded template too — one copy of the starter's
product page backs the Storybook story, the page-level test and the merchant's first deploy. The
manifest the build writes (`.eldra/manifest.json`) is where they land; `eldra-theme validate` does
not see them, because it validates the theme directory without loading `nuxt.config.ts`.

`.storybook/main.ts` declares the same two options on its own `eldraTheme(...)` instance. Storybook
never renders a seeded template — it is there because that instance writes the same
`.eldra/manifest.json` the Nuxt build writes, and without it the checked-in file flips between
"with seeds" and "without" depending on which build ran last.

## The cart drawer and the `/cart` route

The cart is a **side drawer the theme hosts**, not a block an author places. `app/app.vue` mounts one
`blocks/cart/Block.vue` in its `drawer` variant beside the `Toaster`, so it exists on every route and
the header's bag opens it where the shopper already is. Before that it only existed where somebody had
placed a `drawer`-variant `cart` block on the page — nobody does — so every bag click left the page
for `/cart`.

What follows from one host (the rules themselves are documented once in the code, on `CartStore` in
`app/storefront/cart.ts`, and every file that takes part points there):

- **The bag always opens the drawer.** `blocks/navigation/Block.vue` reads
  `storefront.cart.drawerAvailable`, which the hosting block raises from `onMounted`, and renders the
  bag as a `<button>` — with `aria-haspopup="dialog"`, like every other overlay trigger in the header
  — while it is up. In the **prerendered** HTML the flag is still down (no mount hook has run), so the
  bag is a plain `<a href="/cart">` there with no popup annotation: a visitor with no JavaScript, or
  one reading the page before it hydrates, still has somewhere to go, and the swap to a button
  afterwards is an ordinary reactive update rather than a hydration correction.
- **An authored `drawer`-variant block draws nothing.** `app/app.vue` sets `cart.drawerHosted` in its
  own `setup()`, before any block on the page is created, so such a block renders no `<dialog>` of its
  own — on the server as much as in the browser, which is what keeps the generated HTML and the
  hydrated page at exactly one drawer. In Studio's editor it still shows its placeholder, which says
  the theme hosts the drawer. No field and no `block.json` version changes, so an author who already
  placed one keeps their block and its data, and a deploy migrates nothing.
- **The drawer closes on every navigation.** It is in the shell, so no navigation unmounts it any
  more, and a modal `<dialog>` left open makes the page the shopper just reached inert and
  unscrollable. `app/app.vue` watches the route and closes it, which covers every destination inside
  the drawer at once — a line's product title, Check out, View cart, anything added later — and
  back/forward with them. Only the empty state's button closes the drawer itself, because the block
  spec says it does.
- **In Studio's editor the bag is inert.** The preview overlay cancels clicks that carry an `href`,
  not a button's, so an author clicking the bag in the canvas would otherwise get a modal drawer with
  the rest of the canvas inert behind it; `onCartClick` returns early while `useEditing()` is true.
- Nothing else about the drawer moved — `cart.drawerOpen`, the Esc/backdrop close, the focus return to
  the bag, the live count and the Undo toast are the block's own, unchanged.

**Every failed mutation is reported, and every successful add is visible.** A failed _read_ leaves
the page showing what it already had and the blocks say so in place (`StorefrontResult.error`); a
failed _change_ leaves nothing behind — the button's spinner stops, the row does not move, the stepper
springs back — so without a message a refusal is indistinguishable from a control that does nothing.
`app/storefront/cart.ts` therefore keeps the structured failure (`lastFailure`: the SDK error's
`errorId`, `code` and `status`, not just its message, which is developer text) beside the existing
`error` string, `app/storefront/feedback.ts` maps one `errorId` to one translated sentence —
`storefront.outOfStock` for `CART_INSUFFICIENT_STOCK`, `storefront.unavailable` for
`CART_INVALID_PRODUCT`, `storefront.mutationFailed` for everything else and for anything that never
reached the gateway — and `useStorefrontFeedback()` is the only place that turns one into a toast. No
block writes its own copy, so the same refusal reads the same way wherever a shopper meets it. Form
refusals stay inline next to the field that caused them (the discount code, the back-in-stock address,
the contact fields), which is the Toast primitive's own rule. A successful **Add to cart** is confirmed by an
"Added to cart" toast and never by opening the drawer — the design spec's own rule for the Drawer
primitive, because a modal over the page takes the focus and the scroll position of a shopper who
pressed one button while reading a product. The toast _offers_ the cart instead: its "View cart" action
opens the hosted drawer when one is live (`cart.drawerAvailable` — a shopper asking to see the cart is
the spec's exception) and links to `/cart` when none is. A refused add that named stock also flips the
product block's own stock line to sold out, because the cart service has just proved it knows
something the page's read did not.

**Check out is the platform's page, and the theme configures nothing to reach it.** The base URL is
the platform's own (`client.platform.config()`, read once per client by `@eldrajs/sdk`), so
`app/storefront/gateway.ts` resolves `client.checkout.url({ cartId })` whenever a cart id is known —
after an add, and for a cart restored from the remembered id — and writes the result into
`cart.checkoutUrl`, which the drawer's foot and `blocks/cart/parts/Summary.vue` already key off. The
read is asynchronous and may refuse (a platform with no checkout published, a read that failed), and
neither may reach the cart: the button appears when the URL resolves and the ref stays `null`
otherwise, while the add that triggered it succeeds either way. Nothing runs on the server or under
a prerender, and nothing needs a guard for that — the cart id is browser state, so there is no cart
to resolve a URL for until the page is in a browser.

`/cart` stays, and stays a route: `app/pages/cart.vue` is theme **code**, not a page an author
composes. A shopper's cart is their own session: there is nothing to lay out, and a site must not be
able to lose its cart by deleting a page. Being a concrete route it also outranks
`app/pages/[...slug].vue`, so the gateway is never asked about `/cart`. It is the drawer's own "View
cart" destination, the deep link somebody can bookmark or be sent, and the no-JavaScript fallback
above.

Two things make it real on a deployed site, and both are easy to drop:

- `nuxt.config.ts` lists `/cart` in `nitro.prerender.routes`. Nothing gateway-driven ever will — the
  module's `prerender:routes` hook lists CMS pages and route templates — so without that line the
  artifact has no `cart/index.html` and a static host answers 404 however the app would have
  rendered it. `test/starter.spec.ts` asserts the file and the build manifest's prerendered list on
  the credential-free build; `test/prerenderRefresh.browser.spec.ts` opens the drawer from the bag on
  a generated site, then sends the router to `/cart` and lands on the prerendered page.
- The page renders `blocks/cart/Block.vue` in its `page` variant, with an entry the theme owns
  rather than a CMS entry. That is one implementation of the line items, the totals and the empty
  state, shared with the drawer and with the block an author can place on a page.

Two limits worth knowing. The copy is the theme's `app/i18n` strings, not something an author can
edit — editable copy for this surface belongs with a storefront settings entry, which does not exist
yet. And the route carries no header or footer: those are the site's own reusable components, and the
runtime resolves them only as part of a CMS page or route template, so a code route has no way to ask
for them. `/404` has the same shape for the same reason.

`test/cartDrawer.spec.ts` is where the shell and a page are mounted together — the only spec that
mounts `app/app.vue` — and `test/pages/ssr.spec.ts` asserts the same two facts about the server-
rendered shell: one closed `<dialog>`, and a bag that is still a link.

## The `/search` route

`/search` is the other code route, for the same reasons `/cart` is one. Everything in the theme that
can submit a search already names it: `@eldrajs/ui`'s `SearchBar` and `SearchModal` default their
`action` to `/search` and submit `${action}?q=…`, and `blocks/search/Block.vue`'s own chips, "Did you
mean" link and per-section "View all" links point back at it. `app/pages/search.vue` answers it,
renders `blocks/search/Block.vue` in its `results-page` variant with an entry the theme owns, and —
being a concrete route — outranks `app/pages/[...slug].vue`, so the gateway is never asked about it.
`nuxt.config.ts` lists it in `nitro.prerender.routes` beside `/cart`; without that line the artifact
has no `search/index.html` and a static host answers 404 however the app would have rendered it.

**One file answers every query.** A static host serves the same `search/index.html` for `/search` and
for `/search?q=mug`, so the prerendered HTML cannot be about any one query: it is the block's **idle**
state (the heading, the field, the popular searches). That is why the block prints no heading and no
no-results stack without a query — the empty query is a real `search.run()` answer with `total: 0`,
and taking it at face value baked "No results for “”" into every search page in the artifact.

The query is adopted from `useStorefront().route.query` in **`onMounted`**, not at setup, and that
gate is load-bearing rather than tidy. The storefront's route is filled synchronously during plugin
setup, so a hydrating browser on `/search?q=mug` already knows the query before its first render —
which would then disagree with the file it is hydrating (a different `h1`, a status line where the
chips were), and Vue would patch and repaint the block instead of hydrating it. `onMounted` never
runs on the server and runs after the first client render, so the two are equal by construction. It
is the same gate `app/composables/useRevalidating.ts` puts on the refresh treatment, for the same
reason, and `test/pages/ssr.spec.ts` and `test/pages/hydration.spec.ts` hold the two halves of it. A
whitespace-only `?q=` is no query at all: the block trims before deciding, exactly as `SearchBar`
does for its own views.

**A read in flight is not an answer.** `StorefrontResult.data` keeps the previous answer until the
next one lands, which is right for a page of prerendered products and wrong for a search panel: the
first thing `search.run()` ever answers is the empty query's `{ total: 0 }`, and a `results` object
with a zero total is `SearchBar`/`SearchModal`'s _"nothing found"_ view. So both the header
(`blocks/navigation/Block.vue`) and the search block compare `StorefrontSearchResponse.query` against
the query in the field, hand the component `undefined` while those differ — its "nothing yet", which
draws the loading view past 300ms — and read `loading`, not `pending`, for whether a read is in
flight. `pending` is the skeleton flag ("a read in flight with _nothing to show_"), so it is false for
every search after the first one.

**A price it does not know is `null`, never `0`.** The search endpoint carries no money and no
image, so `search.run()` reads both from the catalogue itself — the same batched `id:in:`
products-list read the volatile refresh uses — and leaves
`StorefrontSearchProduct.price` as `null` for anything it could not reach: a read that failed, or a
found id the catalogue did not answer about. **It asks by `sourceId`.** A search result carries two
ids — `id` names the search-index row, `sourceId` the catalog document the row is about — and only
the second is something the catalogue has heard of; asking by `id` answers zero rows every time,
which is what shipped once, and is why `test/storefront/gateway.spec.ts` asserts the filter token
itself rather than a rendered price (an empty price renders as nothing and fails silently).
A zero would be a _real_ price in the store's currency,
and every consumer formats it, so the shopper would read "$0.00". What each surface does with the
`null` follows that surface's own contract: `SearchResultItem.price` is optional, so a suggestion row
keeps the product and drops the price; `ProductCardProduct.price` is required — a commerce card
without a price is not a product card — so `toProductCard()` renders no card, the same answer it
already gives an unusable URL, and the results page counts the cards it can draw rather than the rows
it was handed.

Two fields the theme's own entry deliberately leaves absent: `popularSearches` and
`noResultsCollection` are a merchant's answers, not a theme's. An author who wants them places the
`search` block on a page of their own. The same two limits as `/cart` apply otherwise — the copy is
`app/i18n`'s until a storefront settings entry exists, and the route carries no header or footer,
because the runtime resolves those only as part of a CMS page or route template.

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
requires. One of those models is shared by four blocks rather than owned by any of them, and has
its own spec for that reason: `test/carouselKeyboard.spec.ts` covers `@eldrajs/ui`'s `Carousel`
keyboard across `product-carousel`, `gallery`, `hero`'s `split-carousel` and `testimonials` —
whether a carousel's slides hold something focusable is what decides it (the active slide owns the
one tab stop, with `Tab` moving inside that card and out of the carousel; a row of slides with
nothing focusable keeps the track as the stop), so the choice is only visible against the markup
each block really ships. Every interactive element carries a focus ring — the package's
`eldra-focus` on its own components, `app/utils/classes.ts`'s `focusRing` on everything the theme draws itself — and any
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
