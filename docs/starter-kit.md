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

`blocks/` ships 34 blocks, `block.json`'s `category` grouping them the same way Studio's insert
palette does:

- **structure** (4) — `navigation` (display name "Header"), `announcement-bar`, `breadcrumbs`,
  `footer`.
- **marketing** (14) — `hero`, `cta` ("Call to action"), `feature-grid`, `split-content`, `stats`,
  `logo-cloud`, `testimonials`, `faq`, `pricing-table`, `newsletter`, `contact` ("Contact and
  map"), `video-embed`, `team`, `timeline`.
- **content** (7) — `article`, `article-list`, `rich-text`, `gallery`, `image`, `quote`, `tabs`.
- **commerce** (9) — `collection-header`, `product-carousel`, `collection-grid`, `product-detail`,
  `cart`, `search`, `wishlist`, `order-status`, `trust-strip`.

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
  preview.json              optional: story/preview-only overlay merged onto mock.json — demo
                            imagery, and any field a tile should render differently from a fresh insert
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
payload's bit characters behind and reads a cleared field as filled. The 34 blocks here still write
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

**Slots.** A block may declare bounded, semantic insertion regions for _other_ blocks — not a field
an author fills in, but a zone the layout can place a block into — with a top-level `slots` array in
`block.json` (`BlockSlotDefinition`): `hero`'s is the worked example.

```json
"slots": [
  {
    "id": "actions",
    "label": "Action buttons",
    "description": "Buttons rendered under the hero copy. Falls back to the built-in calls to action.",
    "maxItems": 2,
    "allowedBlockApiIds": ["cta"]
  }
]
```

Each slot declares a unique lowercase-kebab `id` (what `Block.vue` names its `<slot>` after), a
`label` Studio shows the author, an optional `description`, a required `maxItems` capacity from 1 to
20, and an optional `allowedBlockApiIds` allowlist — every id in it must be a block the theme ships,
or `eldra-theme validate` rejects it. An omitted allowlist admits any block type except the host
block itself. `Block.vue` renders a slot as an ordinary named Vue `<slot>` with fallback content —
`hero`'s `actions` slot falls back to its own built-in call-to-action buttons when nothing has been
placed into it:

```vue
<slot name="actions">
  <a v-if="d.ctaLabel && ctaHref" class="button" :href="ctaHref">{{ d.ctaLabel }}</a>
</slot>
```

`EldraLayout` (`@eldrajs/theme-vue`) is what fills a slot: a layout document may place at most
`maxItems` blocks per slot, each one of the slot's own child layout nodes, and a layout that
overflows one fails closed (`SLOT_FULL`) rather than silently dropping the extra block — the
allowlist is enforced per placement the same way. An empty slot renders identically on a static page
and in Studio's preview; there is no hidden persistence, and a slot carries no CMS data of its own
beyond the child blocks placed into it. In Studio's **preview only**, a rendered slot additionally
carries an editor-only marker (`data-eldra-slot-marker`, `data-eldra-slot-id`) naming
`<label> · <n>/<maxItems>`, and its geometry is reported over the `theme:slots-rendered` bridge
message — static generation includes neither. See [How a theme meets the page
builder](../CLAUDE.md#the-preview-bridge) for where that message sits among the rest of the bridge.

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

**`preview.json`** (optional, sibling to `mock.json`) is the story/preview-only overlay. Mostly it
supplies **demo imagery**, which is what it exists for, but it is the overlay for **any** field a
story or the preview tile should render differently from a fresh insert — `breadcrumbs` has no media
at all and carries one to turn `fromProduct` off, because the demo storefront's route is a product
by default and the tile is about the authored levels (see "The category tree"). It is never a second
seed: Studio writes `mock.json` and nothing here. The media shape is the same as before,
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
seeds. A block has no `preview.json` unless it has something to overlay. Every block spec mounts both
the merged data and the bare `mock.json`, both asserted axe-clean — the bare-mock mount is the
regression net for a block that renders badly (or crashes) the moment it is freshly inserted, and the
merged mount is what catches a mistyped key in the overlay, which a preview hash alone would not.

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
reference; _adding_ a field needs no bump). **An addition under an existing list item is the
one "additive" change that is not free**, and it is why `collection-grid`'s price-slider toggle is
the block-level `priceSlider` rather than a `filters[].slider`: `storageCompatible` compares a list
item's children by count and id, so the scanner cannot tell an addition from a replacement and
demands the bump either way — which would retire every author's configured `filters` list and empty
the filter panel on live collection pages until somebody rebuilt it. Top-level additions
(`priceSlider`, `priceStep`) and a new **option** on an existing `select` (the `collection` filter
source) both cost nothing: the scanner compares type, localization and cardinality, not an enum's
members. `navigation`'s `showAccount` is the fourth
retirement (3 → 4): the
platform has no customer login, so the header offers no account control and the field that gated one
is gone, with whatever an entry held kept as `showAccount__v3`. Nothing in the theme reads a retired
field, which is the point: a stale handle must not stand in for the collection an author picked, and
a stale setting must not switch a control back on.

**Sample pages (`pages/*.page.json`).** Five fixtures — `home.page.json`, `product.page.json`,
`collection.page.json`, `category.page.json`, `article.page.json` — are this starter's channel for showing a realistic
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
`/collections/<slug>?price=50-150` rendered the whole collection, both price thumbs at the ends of
the catalogue's own span, with the chips and the URL insisting otherwise, and no request but the
volatile batch.
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

**A list of cards says it once, over the list.** `collection-grid` is the one block where the
per-card treatment was too quiet to read: two dimmed values per card, twenty-four cards, and a
shopper who has just ticked a filter cannot tell whether anything happened. So for a whole read over
cards already on screen **the card grid itself breathes** — its opacity eases between 0.7 and 0.9
and back, continuously, until the result lands (`animate-eldra-pulse-soft`, declared in
`app/assets/main.css` beside the theme's other custom utilities). Nothing is drawn over the cards
and nothing enters the DOM, so there is no layout shift and nothing for assistive technology to have
to ignore. Under `prefers-reduced-motion: reduce` the animation is off and the grid holds a steady
0.8 instead (`motion-reduce:animate-none motion-reduce:opacity-80`) — still visibly waiting, with
nothing moving. The dimmed-value + spinner treatment stays for the volatile price/stock refresh,
which is a different state and still the right size for it; two indicators for one state read as the
page stuttering, so the block masks the per-card flag while the grid pulses (`showCardRefresh` in its
`Block.vue`). The list takes `inert` so no card can be clicked mid-update, and the count's
`role="status"` is what says "Updating…" in words. The sidebar, the chips, the toolbar and the count
are deliberately outside the pulsing element and stay at full strength: filter changes are
**coalesced** — the control, the chips and the URL move at once, the read they drive waits
`FILTER_DEBOUNCE_MS` (350 ms), and a run of ticks therefore reaches the storefront as one request,
with "Updating…" showing from the first one. Sort, Columns, Load more, Clear all, a removed chip and
the drawer's own apply flush that window instead of waiting it out, so each of those is one request
carrying everything pending; the drawer's live "Show N products" count has the same window. What is
held back is the **whole** request-options object, not just its filters: a sidebar change resets the
page window in the same turn, and holding one input while another moves is how one tick after a Load
more press became two requests. A block with its own live filters should follow the same shape;
nothing in `app/storefront/**` is involved, it is the block's own state.

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

The module builds **no `Intl.NumberFormat` for a currency itself**: `formatMoney` is
`@eldrajs/ui`'s `formatCurrency` and `currencyLabel` is its `currencySymbol`, which is what makes
the sign in a sentence the same one every `<Price>`, `<ProductCard>` and `<CurrencyInput>` on the
page writes — the currency's **narrow** sign (`kr 2,800` on an English page, `2.800 kr.` on an
Icelandic one, `$28.00` for dollars). A theme that reaches for `{ style: 'currency' }` directly gets
the _wide_ sign instead (`ISK 2,800`) and quietly disagrees with every price beside it; that is the
one reason to go through the package here rather than through `Intl`. `test/moneyFormatting.spec.ts`
scans `app/**` and `blocks/**` and fails on any second formatter, because the failure is silent: a
second one renders perfectly good-looking money that simply disagrees with the money beside it.

The fraction digits come from that formatter too, and `formatMoney` asks it for the currency's own
count as **both** the maximum and the minimum — the same pair `<Price>` passes — so a króna never
grows a fraction and a dollar amount never leaves a cart column ragged (`$96.00`, not `$96`). That
padding is the one argument beyond the private component library's own currency contract, which
`@eldrajs/ui` holds the canonical copy of; see `docs/ui.md`.

**The currency is the store's, and it is never guessed.** It comes from the platform — the
organisation's commerce settings, read once at build by `@eldrajs/theme-nuxt` and provided app-wide
under `CURRENCY_KEY` — so both money helpers take it **explicitly, with no default**: a currency
inferred from the content locale puts a dollar sign in front of krónur, which is a wrong price
rather than an incomplete one. A store that has not configured commerce publishes none, and then
`formatMoney` renders a plain number (`4.800`), an unusable code renders the number plus the code
(`4,800 XYZ1`), and neither ever throws — these run inside `computed`s, where a throw takes the
whole block down. `@eldrajs/ui`'s `<Price>` elements follow the same rule, and need no workaround
to do it: the package guesses no currency either, so the plugin provides `commerce?.currency` as it
comes — `undefined` when the store published none, which the package reads as "this store has no
currency" and renders as a plain number. The provide itself always happens, which is the part that
matters: _no provider at all_ is the case the package warns about in dev, and that is a theme that
forgot to wire the key, not a store without commerce settings.
`useStorefront().commerce` carries the whole record for the blocks that need more than the currency:
`taxInclusivePricing` (whether the amounts on screen already contain VAT) and `defaultTaxRate`.

The demo source answers the _whole_ request, not just the paging part: `search.run` honours the query
text, and `catalog.collectionProducts` honours `sort` and `filters` (category, collection, size,
colour, availability and a price range in whole major units) and returns the filtered `total`, plus
the `facets` object that describes what it answered from. That matters beyond tidiness — the
scaffolded site and the collection sample page are both demo-backed, so a demo that ignored
`filters` would show a shopper their filter changing the URL, the chips and the active-filter row
while the grid and the count stayed exactly as they were. The pass and the counting live in
`app/storefront/facets.ts` — pure, framework-free and the demo's own, since the gateway source hands
both to the platform (see its paragraph below) — under the same rules the platform applies: price
bounds inclusive and in major units, `availability` read off the item's own stock as
`in_stock`/`out_of_stock`, values OR-ed within a source and AND-ed across sources, and a family's
counts computed with that family's own filter left out. The demo supplies the per-product attributes
a product card does not carry.

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
nothing). `filter` is one of the query parameters the gateway declares repeatable (`explode: true`),
along with the catalog's `categoryId`, `collectionId` and `option` — `@eldrajs/sdk` sends one entry
per value for those four and keeps `sort`/`fields` comma-separated. `related` has no relatedness
endpoint to call, so it reads the current product and lists the same `categoryId` (the documented
query parameter on `GET /catalog/v1/products/list`), the product itself excluded, falling back to
the newest active products when it has no category or the category holds nothing else. Its sort ids
map to the sort fields the endpoint knows (`featured` and `best-selling` to none: `featured` _is_
the collection's own order, and the contract exposes no sales figures).

**The collection grid's facets are the catalog list's own query parameters** (public contract
3.7.0). `catalog.collectionProducts` sends them and asks for `facets=true`, so one request answers
the filtered page, the filtered `total` (what the count line and `LoadMore`'s "Showing X of Y" read)
and the counts the panel draws its groups from — over the **whole collection**, not the rows one read
could reach. They are not `filter` tokens and never were: `filter` is the `field:op:value` vocabulary
above, and a facet sent through it is a 400.

| the block's filter        | the parameter                         | the conversion that matters                                                                                                                                |
| ------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `price` (`"<min>-<max>"`) | `minPrice`, `maxPrice`                | whole **major** units in the URL, **minor** in the request — the store's own fraction digits, so ISK 50 is `50` and USD 50 is `5000`                       |
| `category` (slugs)        | `categoryId` (repeatable, OR)         | the slug is resolved to a catalog id through `GET /catalog/v1/categories`, read once per storefront; a **parent** id matches its whole subtree server-side |
| `option:<key>`            | `option=<key>:<value>` (repeatable)   | OR within a key, AND across keys — the panel's own semantics                                                                                               |
| `availability`            | `availability=in_stock\|out_of_stock` | both boxes ticked is every product, so nothing is sent                                                                                                     |
| `collection` (slugs)      | `collectionId` (repeatable, OR)       | only on the catalogue-wide list (`catalog.products`, the `/products` page); not expressible on a collection's own product list — see below                 |

**A category page scopes that same catalogue-wide list.** `catalog.products` takes a `categoryPath`
— the open category's canonical path — and sends that category's `categoryId`, which the platform
matches over its whole subtree. The shopper's own `category` clause is **intersected** with the
subtree rather than sent beside it: the parameter is an OR over a list, so a ticked value from
outside would widen the page past its own category, and a ticked descendant replaces the scope's id
instead (narrowing within it). A path no category occupies answers `null` — the grid's empty state —
never the unscoped catalogue, which is the same answer an unknown collection handle gets.

Four things worth knowing before a shop goes live:

- **The price span and the counts come from the platform, in major units.** `facets.price` arrives in
  the same minor units as the parameters it is counted over, and the gateway source converts it to
  the major units every money field in `app/storefront/types.ts` carries. Everything else passes
  through: the terms keep their catalog ids (which is what a `categoryId` filter needs), the option
  values keep their labels and swatches. The span itself is **absent** when the scope minus the price
  filter held nothing to span — a different answer from 0 to 0, which would be a dead track labelled
  in the store's currency — and the price control then falls back to the widest span it has seen for
  this collection.
- **Counts leave their own family's filter out** and the price bounds leave only price out — the
  platform's rules, stated on `CatalogFacets` and relied on by the panel. That is what makes a
  multi-select panel usable: ticking "Oat" must not zero every other colour, and dragging a price
  thumb must not move the track under the shopper's hand. A value another filter rules out keeps its
  place with a count of 0, and the panel disables it rather than hiding it.
- **No `availability` facet means stock could not be read at all** — which is not the same answer as
  "nothing is in stock", so the platform omits the object rather than sending two zeroes and the
  panel **drops the availability group**. An availability _filter_ in that state is a request error
  rather than an unfiltered page (an unfiltered one would read like a shop with nothing out of
  stock), so the grid reports it and keeps the page the shopper was looking at — the same treatment
  every other failed read over visible results gets.
- **A source the scope cannot narrow by is declared, and the panel hides its group.**
  `StorefrontCollectionProducts.unfilterable` names the `filters` keys this answer's own scope cannot
  honour, and `collection-grid` drops those groups and their chips — the author's `filters[]` row
  included, because an author cannot know which scope their grid will be read in. Describing a family
  and filtering on it are different capabilities, so a group fed by real counts can still be a filter
  that moves the chips, the URL and nothing else, which is the defect this whole path removes. The
  request and the query string are left alone: the source is meaningful in another scope, so a shared
  link keeps working, and the storefront that declared it unfilterable is already the one ignoring it.
  A storefront that can honour everything says nothing, which is also how one that has never heard of
  the field reads.

  Today that is exactly one source, `collection`, and only on a **collection-scoped** grid: there is no
  `collectionId` parameter on `GET /catalog/v1/collections/{slug}/products` — the scope already _is_
  one collection, and the parameter is an OR, so a second id would widen rather than intersect — while
  the `collections` facet there is still answered and still honest, naming the other collections these
  products are in. The catalogue-scoped grid (`catalog.products` over
  `GET /catalog/v1/products/list`, which does take `collectionId` — the `/products` page) declares
  nothing, so the group is offered there and really narrows; its slugs are resolved to collection ids
  through the collection list's own `slug:in:` filter, asked for only the slugs a shopper ticked and
  memoised per storefront (unlike the categories, which are read whole: a store's collections are a
  merchandising list that grows without bound). The demo storefront filters its own fixture by
  collection in both scopes, so a Storybook story or a sample page keeps the group.

- **A "Sort by" option the scope cannot honour is declared the same way, and the grid drops it.**
  `StorefrontCollectionProducts.unsortable` names the block's own sort ids — `featured`,
  `best-selling`, `price-asc`, `price-desc`, `newest` — this answer's scope has nothing real to order
  by; `collection-grid` removes a named id from "Sort by" once the result arrives, the author's
  `sortOptions` row included, for the same reason `unfilterable` hides a filter group: a control that
  moves the selected value and the URL and changes nothing in the grid is the defect this whole path
  removes. A URL naming a now-unsortable id falls back to the first option still offered, the same
  path a `sort` id this grid never configured already falls back through.

  The platform gateway declares `['best-selling']` on **both** scopes — the collection-scoped read and
  the catalogue-wide one alike — because neither reads sales figures to order by; this is the one case
  where the two scopes agree, unlike `unfilterable`'s `collection`, which only one of them cannot honour.
  `featured` is not in that list even though it also maps to no gateway sort parameter: it _is_ the
  collection's own default order, which the endpoint already answers in. The demo storefront declares
  nothing, so Storybook and the sample pages keep every option, `best-selling` included. An author
  whose own storefront does carry sales data keeps the option in the schema and the seeds — nothing
  here removes it from either, only from a scope that says it cannot honour it.

A clause the mapping cannot express is left out rather than guessed at — a price bound that is not a
number, a `collection` clause, or **a category slug this store has no category for** (a stale shared
link, a category since unpublished), which the request omits rather than sending as something that
matches nothing. That is the storefront's standing "unknown, not unmatched" rule: a filter nothing can
honour must not empty a shopper's grid. The one clause that is never dropped quietly is a category
whose lookup _failed_: that fails the read, so the grid shows its error rather than a page that
ignores a filter the chips say is applied.

`app/storefront/facets.ts` belongs to the **demo** storefront: it filters and counts that fixture, so
Storybook, the sample pages and the specs filter for real without a gateway. The gateway source hands
both jobs to the platform and shares only the one thing that is not a backend's to decide — the
`in_stock`/`out_of_stock` vocabulary, which the panel reads a shared URL through as well.

### How a variant option is displayed

**The merchant decides, and the theme reads it.** A variant option carries a **display kind** the
merchant sets in Studio ("Display as") — `none`, `color` or `custom` — and a `color` option carries a
hex colour on each of its values. `StorefrontProductOption` therefore has three fields where it used
to have one:

| field      | what it is                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `kind`     | `'none' \| 'color' \| 'custom'` — the merchant's choice, as the platform stores it. `none` for a source that does not say. |
| `metadata` | the merchant's own name for a `custom` option (`[A-Za-z0-9_.-]`, ≤ 64 chars). Absent on every other kind.                  |
| `type`     | `'swatches' \| 'pills'`, **derived** by `app/storefront/options.ts`'s `optionDisplayType` — what `VariantPicker` takes.    |

Each value's `swatch` is a CSS colour from the store — content, never a design token — and
`@eldrajs/ui`'s `VariantPicker` paints it as the disc's background with the value's label as
visually hidden text, so the colour is never the only thing carrying the meaning.

**Nothing is guessed from the option's name.** An option a merchant called "Colour" and left on
`none` is pills; one called "Litur" and set to `color` draws swatches. That is the whole point of the
field: before it existed the only way a theme could draw colour circles was to match the option's
label — a merchant's word, translated per locale and theirs to rename — and a store that spelled it
"Color" or sold by "Finish" got pills no matter what the photography needed.

**The kind is permission to show colours, not a promise that there are any.** `optionDisplayType`
answers `swatches` only for a `color` option with **at least one** `swatch` on its values, and
`pills` otherwise — including for a `color` option whose colours a merchant has not picked yet or has
cleared again, both of which the platform allows (a value's colour is nullable) and Studio's own
clearable picker produces. The reason is the hidden label: a swatch picker with nothing to paint
draws one identical empty circle per value with every name in visually hidden text, so a sighted
shopper cannot tell M from XL, where the pills it replaced read their names out loud. The option
keeps its `kind` — the merchant's intent is still the merchant's — and only the control falls back.

A **filter facet** decides the same way from the same evidence (`facetTypeFor` in
`blocks/collection-grid/parts/groups.ts`: swatches when the facet's values carry them, pills
otherwise), so the two surfaces can never disagree about one option. One function and one rule; the
facets carry `kind` too, for a theme that wants to read the intent even where there is nothing yet to
paint (`CatalogFacetOption.kind`).

**A single value without a colour, inside an option whose other values have one, keeps its place** —
uncoloured, exactly as such a row survives in a filter panel's colour group rather than being
dropped. Dropping it would hide a variant a shopper can buy. In the picker's swatch mode that one
disc is also unlabelled (the label is visually hidden there), so the fix is to fill the colour in, or
to clear the rest and get pills for the whole option.

**Branching on a `custom` option.** `blocks/product-detail` stamps `data-option-kind` (and
`data-option-metadata` for a `custom` option) on each picker row, which is the hook to use if your
fork wants to render one named option its own way:

```css
/* The merchant's `custom` option named `fabric-chip`, drawn wider than the other pills. */
[data-option-metadata='fabric-chip'] [data-part='radio'] {
  min-width: 6rem;
}
```

`custom` is deliberately not a third control. A theme that wants one reads `option.metadata` (or the
attribute above) and renders that option itself; everything else keeps working, because a `custom`
option is a list of values like any other. The block's "Size guide" link goes beside the **first**
option drawn as pills — the size option on any ordinary product — rather than beside every pills
option, so a product with Size and a `custom` option does not render the link twice.

**A product card's dots** (`StorefrontProductListItem.colours`) are the `color`-kind option's values:
`undefined` when the source cannot say (the platform's product _list_ read answers no options today,
so that is the live site's answer), `[]` when it can and there are none — two different answers to
`app/storefront/facets.ts` — and a value with no colour left out rather than drawn as a blank dot.

A gateway answering a contract older than the field sends no `kind` at all, and a kind this theme has
never heard of is one it cannot draw: both read as `none`, never as a failure — the mapping runs on
the product read's own path, where a refusal replaces the whole page with an error alert over a
presentational field. A value's `swatch` is passed through whatever the kind says (and a `null` or
empty one is dropped on both the product and the facet read), so a gateway that populates the colour
before it populates the kind loses nothing.

**If you have forked a storefront source**, note that `kind` is **required** on
`StorefrontProductOption` and on `CatalogFacetOption`, not optional: a read always includes it, and a
third "the source did not say" state would be one more thing for every reader to branch on. Your own
source has to set it — `'none'` is the honest answer for a backend that has no such field — and
`optionDisplayType` is there so you never decide the control yourself.

### The category tree

`GET /catalog/v1/categories` answers the organisation's whole category list — `{id, slug, title,
parentId}` per row, so the categories are a **tree** — and a product read carries
`primaryCategoryId` (plus `categoryIds`, the full set). `app/storefront/categories.ts` is the walk
between them: pure, framework-free, shared by both storefront sources, and the one place a category's
URL is decided. Three features read it.

**A category's canonical path, and its page.** The theme ships a category **page**
(`pages/category.page.json`, route template `/categories/:path*`), and a category is addressed by the
slugs of its ancestors, root first, then its own, joined with `/` — `home/ceramics`. That is the only
path the route answers: **canonical only, no redirects**, so a leaf on its own, a wrong parent and a
trailing extra segment are each the theme's not-found shell. `buildCategoryIndex` indexes it both
ways (`idByPath`, `pathById`), `pathOf` reads one out and `categoryHref` (`app/utils/links.ts`) turns
it into a destination, each segment encoded and the separators kept. A category whose ancestor chain
does not reach a root through rows the list holds — a parent since unpublished, a `parentId` cycle —
has **no** path, which is also the honest answer: there is no page to link to, and a path built over
that gap would address a different category.

`catalog.category(path)` is the page's own read: the category placed in the tree — its title, its
`ancestors` (root first, itself excluded) and its **direct** `children`. One level of children,
because the strip under the title is one level and a grandchild belongs on its own parent's page. It
is the whole category list walked, not a per-path endpoint, and the list is memoised per storefront,
so the breadcrumb, the header's strip and the grid's own scope cost one request between them.

**A product's breadcrumb trail.** `StorefrontProduct.categoryTrail` is the chain from the root
ancestor down to the product's own category, each level a link to **that level's own category page**
(`/categories/home`, `/categories/home/ceramics`). Every honest absence is `[]` — a product with no
category, a `primaryCategoryId` the list no longer holds, a category the list holds but cannot place,
a category read that failed — because a page without a category crumb is a page and a crumb labelled
`undefined` is a bug. The trail is walked **down** the leaf's own canonical path rather than up the
tree, because every prefix of a canonical path is itself one, so the ancestors come out already
placed and already in order.

**Two blocks render it, and they render different things.** `breadcrumbs` owns the **trail**: its
`fromProduct` appends the store's levels after the author's own, which are the page tree _above_ the
catalogue, while a category is the level nearest the product. `product-detail`'s `showCategory` names
the product's **category**, as one label above the title — the shelf this product sits on, not a
path to it. It used to draw the whole trail there as well, inside a second `<nav>` named
"Breadcrumb", which put the same levels on the page twice as soon as both blocks were on.

`fromProduct` exists because the seeded product **template** cannot carry an authored trail: a
template renders whatever product its `:slug` matched, so `app/templates.ts` empties the list, and a
merchant's first product page had the Home crumb alone — one item, which is fewer than two, which is
nothing.

`fromProduct` is **on unless the author turns it off** (`default: true`, read as `!== false`), and
that is about the one case where the two readings differ: a value the page document does not carry
at all. That is not an author's "no" — it is a product template seeded before the field existed,
which is every site deployed up to the day it landed, because Core stores what a seed wrote and does
not backfill a field added later. Read as "off", the trail was switched off on exactly the pages it
exists for while the seeded template beside it also had `product-detail`'s `showCategory` off: a live
product page with no category trail in either place and nothing in the inspector to explain it.

**Both fields are on by default, and that is a pair, not a conflict** — one trail, one label. What a
page with both on does name twice is the leaf category itself: once as the last crumb, once as the
label. `pages/product.page.json` still ships `showCategory: false` because the seeded template's
breadcrumbs already carry the trail, but neither block can see what else is on the page, so neither
default can promise more than "they are not two trails". A product page built by hand, or a seeded
one whose merchant turned `showCategory` back on, names the category twice until one of the two is
turned off — which is what both field descriptions say. `test/pages/product.spec.ts` pins the
arrangement with both on: one breadcrumb landmark carrying the whole trail, and exactly one category
link outside it.

The block's own `preview.json` turns `fromProduct` off for the generated story and the preview tile
alone — the demo storefront's route is a product by default, so the tile would otherwise draw the
demo product's category on top of `mock.json`'s authored levels.

It is **prerender-safe without any wiring of its own**. The categories are read on the server inside
the same `useAsyncData` the product read already runs under, so a generated product page carries its
trail in the page payload and the hydrating browser fetches nothing to draw the crumb. `breadcrumbs`
asks `catalog.product()` for the route's own handle, which is the same method over the same sources
`product-detail` asks with — identical prerender key, so one read answers both blocks.

**The collection grid's category facet.** `CatalogFacetTerm.parentId` makes the `categories` family a
tree, and the panel draws parents with their children indented one level inside a nested
`role="group"` named after the parent ("Under Tableware"): a real grouping for a screen reader and no
extra tab stop, because every row stays an ordinary checkbox in source order. One indent, ever —
anything deeper is drawn under its top-most listed ancestor, since a filter panel is not a tree view
and a 15rem sidebar has no third indent. Ticking a parent sends the parent's slug, the request
resolves it to the parent's `categoryId`, and the platform matches the whole subtree; the children are
then drawn ticked and inoperable with a hidden note naming the parent, because the way back out is the
one control that can still change.

**Whether a parent row is offered at all is the platform's answer, not a display choice.** The whole
of the decision is one field, `facets.categoryCounts`:

- **Public contract 3.8.0 and later** answers `parentId` on each category facet term (**absent** for a
  root, otherwise the nearest _reported_ ancestor, always an id in the same list), its counts **rolled
  up** over each subtree, and the terms **depth-first by title** — and its `categoryId` filter matches
  a whole subtree. The gateway carries all three through untouched (normalising absent-means-root to
  the explicit `null` the view type uses) and marks the family `categoryCounts: 'rolled-up'`; the panel
  then nests it. A rolled-up count is **never derived**: it is deduplicated over the subtree, and a sum
  over the children on screen is not, because a product in two sibling categories is one product and
  two counts.
- **Any other answer** — an older gateway, or a source that places nothing — counts the categories
  products are _assigned_ to, which in a real store are the leaves, and matches a `categoryId` by
  direct membership only. The family then stays **flat**: no parent row, no indent, nothing implied.
  Those three changes shipped together, so "cannot roll up" is the same gateway as "cannot match a
  subtree" — and a `Tableware` row there would be a filter it answers with nothing, emptying the grid
  under a chip claiming otherwise. That is the defect this whole path exists to remove, so a catalogue
  of cups and bowls simply offers Cups and Bowls, exactly as it did before any of this.

Nothing is ever synthesised from the category list to fill the gap. The list is read **once per
storefront** and has exactly two readers: a `category` filter's slug→id lookup and a product's
breadcrumb trail. Its failure is swallowed by the trail and not by the filter — a product page without
a crumb is a page, while a _filter_ that quietly dropped the category the chips and the URL both say is
applied is a lie, so that one fails the read and the grid shows its error over the last good page. An
unfiltered collection page spends no extra request on any of it.

The demo storefront models the 3.8.0 side of that from its own two-level fixture tree (`Home` over
`Ceramics`/`Kitchen`, `Knitwear` a root): it derives its trails from the tree, counts a product under
its category _and every ancestor_ — deduplicated, so it declares `'rolled-up'` — **and** expands a
ticked parent to its descendants when it filters. All three or none: a source that declared rolled-up
counts and then filtered by direct membership would offer a parent row that empties the grid, which is
the same lie as the fallback telling one. The mock gateway the generate tests run against answers one
contract at a time for exactly that reason (`test/support/mockGateway.ts`'s `MockCatalogContract`),
and `test/mockGatewayContract.spec.ts` pins both pairs.

**`@eldrajs/ui`'s `FilterPanel` draws the filters; `collection-grid` only adapts and routes.**
`filters[]` names the facets and their order; everything inside them — values, labels, swatches,
counts — is the storefront's `facets`, never CMS content. The sources are `category`, `collection`,
`options`, `option:<key>`, `price` and `availability`; `blocks/collection-grid/parts/groups.ts`'s
`buildFilterFacets` is the one place a source is reconciled with the facets' own vocabulary
(`options[].key`) and turned into the package's own `FilterFacet[]` shape, and the one place the
price grammar lives. The package never sees a catalogue shape or a router: the panel is controlled
(`modelValue` + `change`/`clear`/`remove`), and the block is what turns that into a request, a URL
write and (in the drawer) a batched apply.

- **Price is the panel's own `range` facet** (`RangeFacet`, over `@eldrajs/ui`'s `RangeSlider`):
  `min`/`max` are the collection's own bounds from the facets, `step` is the `priceStep` field
  (default: one unit of the store currency, ISK 100 — narrowed to a step the catalogue's span can
  hold ten of), and both thumbs announce the amount in the store's own currency with no decimals
  ("kr 2.800", never "2800"). A thumb parked on the catalogue's own end is **no bound**, so a filter
  can be dragged back off, and the move applies once it is over (pointer release, the key release
  that ends an arrow-key run, a typed field committing) — one request and one URL write per
  gesture. The two **Min**/**Max** fields are the store's own money fields when a currency is
  published (the panel's own `CurrencyInput` wiring), generic number fields otherwise. `priceSlider`
  off maps to the facet's own `slider: false` (additive on `@eldrajs/ui`'s `FilterFacet`): the
  thumbs, the track and the histogram are not drawn, only the labelled fields — for prices that sit
  in a few tight clusters a track cannot separate — and the fields keep the exact same
  clamping/snapping/commit rules either way, because it is the same `RangeSlider` under both shapes
  (its own `trackVisible` prop). A span with fewer than two distinct prices (one product, or every
  product priced the same) is not drawn at all — no group, no single thumb that cannot move — which
  is the package's own `FilterPanel` rule (`renderableFacets`), not something this block repeats.
  A distribution (`facets.price.histogram`, 24 equal buckets) draws the panel's own decorative
  histogram above the track when a storefront sends one; none does yet, so no histogram shows today.
- **`options` is one row for every variant option the store has** — the shipped seed, and what a
  merchant should leave alone. The storefront's facets answer one family per option key with its own
  name and values (`facets.options[]`), so the block builds a facet per key, in the facets' order,
  labelled by the facet's `name`; a key with no values draws no facet. That is what makes a store
  selling by `fabric`, or spelling its colour option `color`, filterable with no page edit and no code
  change: the keys are the merchant's own. An explicit `option:<key>` row still works and **wins** for
  that key — the way to rename one facet or pin where it sits — so "Size first, then whatever else
  this store sells by" is two rows. The two keys this theme has its own strings for (`size`, `colour`)
  keep them, so an Icelandic store reads "Stærð" rather than a raw store key; every other key reads
  the store's own name. The facet type is chosen by the **values**: one whose values carry a `swatch`
  is a `colour` facet (swatch rows by default, a swatch grid when the block's own `colourLayout`
  field is `grid`); one whose values carry a size-system `group` is a `size` facet (tiles under a
  sub-heading per system, with a **Size guide** link under them when the block's own `sizeGuideHref`
  field names one); everything else is a plain `list`. `group` is not sent by any storefront
  today — a Core follow-up — so every option is a `list` until it arrives. A key the facets stop
  naming while a shopper has it ticked keeps its facet, so the filter stays removable.
  The URL is unchanged: `?colour=oat&size=m`, the bare option key, since the `option:` prefix is the
  field's vocabulary and never a shopper's. A query key the store has no option for is **not** read as
  one — `?ref=newsletter` would otherwise become a filter nobody set, in the shopper's own URL.
- **`availability` is one `toggle` facet, not a checkbox pair.** "In stock only" is its one switch
  row when the store can read stock; yes/no facets beyond it (`facets.toggles[]` — pre-order, on
  sale — another Core follow-up, not sent today) would fold in as more switch rows beside it, each
  under its own camelCase query key (`on_sale` reads and writes `?onSale=1`). A value nothing is
  left for is disabled, not hidden, same as every other facet; a selected value the facets stop
  listing altogether is kept, labelled by its raw value since nothing describes it any more.
- **The `category` facet nests** when, and only when, the platform rolled its own counts up — parent
  rows with their children one indent in, a ticked parent carrying its whole subtree. Every other
  answer draws the family flat. See "The category tree" above for why the two travel together.
- **A value nothing is left for is disabled, not hidden** — see the counting rule above. A value
  the shopper has already selected is never disabled, and one the facets stop listing altogether is
  kept so the filter stays removable. A whole **facet** with no values is dropped, which is how a
  store the facets cannot describe a family of (no availability counts, an option key it does not
  have) stops offering it.
- **The panel owns the applied chips and Clear all; the grid's own toolbar carries only what the
  panel cannot** — the live count, the mobile Filter button and Sort by/Columns, in one slim row.
  `showApplied` draws the chips in both the sidebar and the drawer; the sidebar's own head also
  draws **Clear all** and moves focus to its own title when pressed. A range contributes no chip of
  its own (a span has no one value a chip could take off) — its own thumbs and fields are what show
  the applied price. Removing a chip or pressing the empty state's own **Clear filters** button
  still moves focus to the grid's live count, the one thing the panel cannot do for either.
- **The query string is the state**:
  `?price=1200-4800&category=ceramics&collection=the-winter-edit&colour=oat&availability=in_stock`
  (plus `sort`, `columns` and `page`). One key per facet, the option sources under their bare option
  key, the price range as the single `<min>-<max>` string the request itself takes. An option key is
  read back only once the store has said it has that option, which is the first read answering — so
  a shared `?fabric=linen` is adopted after mount like every other filter (the prerendered page is
  the unfiltered one either way). An option key that would **take a query key something else already
  owns** is refused with a dev warning and its facet is not drawn: the four filter sources own
  `?category=`, `?collection=`, `?price=` and `?availability=`, and the storefront route owns `?q=`,
  `?page=`, `?token=`, `?sort=` and `?columns=` before a block sees them. Namespacing it instead would
  mint a shareable URL no other spelling of this theme reads. It goes out
  through `route.setQuery()` and comes back through `route.filters` — no router and no Nuxt global
  inside `blocks/**` — so a filtered view is linkable and the back button works, while the
  prerendered page stays the unfiltered one (see "A query string is not in the route while a
  prerendered page hydrates" above). Two spellings are **retired**: the price pair
  `?minPrice=…&maxPrice=…` is not read any more (a link carrying it renders the unfiltered
  collection), while the pre-rename `?availability=in-stock` still is — it is folded into
  `in_stock` on the way in, and a value from no vocabulary at all is dropped rather than guessed.

`forms.subscribe`, `forms.sendMessage` and `catalog.notifyBackInStock` (the newsletter, contact and
back-in-stock forms) have no gateway endpoint today: `createGatewayStorefront` posts
`{ kind: 'subscribe' | 'sendMessage' | 'notifyBackInStock', ...input }` as JSON to
`runtimeConfig.public.formsEndpoint` when a site has configured one, and resolves
`{ ok: false, reason: 'unsupported' }` (rendered as the form's own "isn't set up yet" copy, not a
crash) when it hasn't. Wire a real endpoint by adding it to `nuxt.config.ts`'s `runtimeConfig.public`
(or the matching `NUXT_PUBLIC_FORMS_ENDPOINT` environment variable) — see
[`examples/starter-nuxt/README.md`](../examples/starter-nuxt/README.md#storefront-forms) for the
exact snippet.

### A route the gateway could not answer is never written

A storefront's reads fail one at a time: a gateway under load answers one of them `500` and the rest
normally. That is a different thing from a `404` — a `404` says the object is gone, a `500` says
nobody could be asked — and for a prerendered route the difference is the whole page.

`useEldraPage()` is called **twice** on every page here: once by `app/plugins/eldra-storefront.ts`,
for the `{kind, slug}` a catalog route template matched, and once by `app/pages/[...slug].vue` for
the page it renders. Both calls use one async-data key, so Nuxt builds one entry around the
**first** handler and hands the second call that entry — which is why a failure the composable used
to remember in its own `ref` reached the plugin and nothing else. The page's `error` stayed `null`
over an empty resolution, which is exactly what "there is no such page" looks like, so the page drew
its not-found shell and `nuxi generate` wrote it: a "Page not found" document under
`collections/<slug>/index.html` for a collection with six products in it, exit code 0, nothing in
the build log. Every link to that collection — the header's included — then landed on a dead end
that looked deliberate.

Two things close it, and both are the module's and the theme's, not a block's:

- The failure travels **with the resolution** (`ResolvedEldraRoute.error`), so every caller of a
  route sees it and the theme's error branch is reachable on a real content route again.
- On the server such a route is answered **500** rather than 200. Nitro marks a non-200 route failed
  before it writes anything, so the wrong page is never in the artifact, and
  `nitro.prerender.failOnError` (on, in `nuxt.config.ts`) turns the other half — an artifact that is
  simply missing a product or collection page — into a failed build rather than a deployable one. A
  transient gateway failure is a build to re-run, not a dead link a shopper finds.

A build with **no gateway credentials at all** is exempt from both halves — not from the response
status alone. `eldra-theme init` && `pnpm generate` with nothing in the environment is a scaffold:
every read fails there by definition, which is a certainty rather than news, so such a route
resolves to the empty route with **no `error` on it** and the page draws its styled not-found shell,
exactly as it did before a failure had anywhere to be reported. Exempting only the status left the
message on the shared resolution, which put a raw `<p role="alert">Invalid URL</p>` on `/` — the
first page a developer ever generates. `test/starter.spec.ts` pins both halves now: that build
prerenders `/` and `/404` and nothing else, and `/`'s own HTML carries `data-eldra-not-found` and no
`role="alert"`.

`test/prerenderFailure.spec.ts` is the guard for the credentialed case — a real `nuxi generate`
against a mock gateway that fails exactly one read.

**What `failOnError` is actually exposed to is about twice the route count.** With
`crawlLinks: false` Nitro still queues each rendered page's own `_payload.json` from the
`x-nitro-prerender` header, and rendering that payload resolves the route against the gateway a
second time — so 84 locale routes are roughly 168 resolutions, and a build fails if any one of them
cannot be answered. A gateway that is merely under load is handled by the clients' own retry, below;
`nitro.prerender.concurrency` is **not** the knob for it, because Nitro's default is already 1.

### When the gateway rate-limits the build

The reads above are also what meets the gateway's **rate limit**. It counts requests per minute per
client, and a build is every page, every route template, every catalog document, times the site's
locales, roughly twice over (the paragraph above), all from one address in a few minutes. The
gateway answers `429` with `too many requests; slow down and try again`, the route cannot be
resolved, and `failOnError` ends the build — the right outcome for a broken gateway, the wrong one
for a gateway that was simply asking for a pause.

**It is handled, and there is nothing to configure.** Both clients a build reads through retry an
idempotent request that answered `429` or `503` — `@eldrajs/theme-core`'s, which resolves pages and
route templates, and `@eldrajs/sdk`'s, which `app/plugins/eldra-storefront.ts` builds for the
commerce blocks. They honour the gateway's `Retry-After` when it sends one and otherwise wait
250 ms, doubled per attempt and capped at 5 s with jitter, for at most five attempts including the
first. A `404`, a `401` or any other status is still reported on the first answer.

So **a build that fails with `429` is a build to re-run**, and if it fails again the limit is
genuinely narrower than the build. Then, in order:

1. **Set `eldra.retry` in `nuxt.config.ts`** — `{ attempts: 8, maxDelayMs: 15000 }` waits out a
   much narrower window. `attempts` counts the first request, and `{ attempts: 0 }` turns retrying
   off, which is what you want if a build should fail fast rather than wait. The policy is carried
   in the public runtime config, and the storefront plugin passes it to its own `@eldrajs/sdk`
   client, so one setting covers both halves of the build.
2. **Leave `nitro.prerender.concurrency` alone unless you have raised it.** Nitro's default is
   already **1** — one route rendered at a time — so there is nothing to lower here, and this
   theme's `nuxt.config.ts` deliberately does not set it. Raising it is what makes a rate limit
   likelier, not a build faster.
3. **Ask for a higher limit for the build's address** rather than reaching for
   `failOnError: false`, which buys a green build by shipping an artifact with pages missing.

**The new failure mode is a build that crawls, not one that fails.** That is the point, but it is
also the one thing nobody can see from the outside, so it is worth knowing the arithmetic. A
`Retry-After` is honoured up to a minute — `maxDelayMs` caps the _computed_ backoff and **not** a
wait the gateway asked for — so four waits on a rate limit that keeps asking for a minute is about
four minutes on **one** read. Nitro then re-renders a route whose response was not 200 up to
`prerender.retry` (3) more times, and with `concurrency: 1` nothing else is rendered meanwhile, so a
sustained rate limit can hold a single route for something like a quarter of an hour with no output
and no error. If a build has gone quiet and the gateway is the suspect, `{ attempts: 0 }` is the
fail-fast lever: it restores the old behaviour — one request, and the `429` surfaces — so the build
fails in seconds and names the route.

## Seeded templates and pages

A site deployed from this theme is not empty: `nuxt.config.ts`'s `eldra.templates` and
`eldra.templateRoles` declare what Core creates on the site's first deploy, so a merchant who
installs the theme has working product, collection, category, home, cart, wishlist and search pages
before touching the page builder — and can then edit them like any other page.

`app/templates.ts` builds them, and there is nothing to hand-author: each seed is one of the sample
page fixtures (§3) turned into the manifest's seed shape. Two kinds travel in the one
`eldra.templates` list (`starterSeeds()`), told apart by the target each names.

**Route templates** — a pattern, resolved per object:

| Seed       | `routePattern`       | `schemaApiId`        | Built from                   |
| ---------- | -------------------- | -------------------- | ---------------------------- |
| Product    | `/products/:slug`    | `catalog:product`    | `pages/product.page.json`    |
| Collection | `/collections/:slug` | `catalog:collection` | `pages/collection.page.json` |
| Category   | `/categories/:path*` | `catalog:category`   | `pages/category.page.json`   |
| Home       | `/`                  | `home`               | `pages/home.page.json`       |

`catalog:product` / `catalog:collection` / `catalog:category` are the three reserved schema ids for a
**catalog-backed** template: it has no CMS schema behind it, and the theme resolves the pattern's
trailing parameter against the public catalog at render time (`useEldraPage().catalog`, see
[themes.md](themes.md#seeding-default-templates-and-pages)).
The category one is the only pattern in the kit that carries a **catch-all** parameter: a category is
addressed by its whole canonical path — the slugs of its ancestors, root first, then its own — so
`:path*` matches one or more segments and its `slugField` is `path`. Canonical only, no redirects.
`home` seeds the site's home page and applies only when the site has none.

**Pages** — one static document each, at `/<slug>`:

| Seed     | Slug       | Fixed block | Built from                 |
| -------- | ---------- | ----------- | -------------------------- |
| Cart     | `cart`     | `cart`      | `pages/cart.page.json`     |
| Wishlist | `wishlist` | `wishlist`  | `pages/wishlist.page.json` |
| Search   | `search`   | `search`    | `pages/search.page.json`   |

Those three were code routes under `app/pages/` until the grammar could express them; the sections
below have the whole story. A page seed is skipped when the organisation already has a page with
that slug, exactly as a template seed is skipped for a pattern that already has a template, so an
existing site picks up a newly added page on its next deploy and nothing a merchant has edited is
overwritten.

Seven rules the file exists to keep:

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
- **A page seed places those regions rather than being framed by them.** A page seed declares no
  layout at all — its entry list _is_ the page, in the fixture's own order, and Core lays it out in
  one column — so the two role blocks become _placements_ where the fixture puts them
  (`{ role: 'header' }` / `{ role: 'footer' }`, emitted as the reserved `@header` / `@footer`
  types). That is what keeps the announcement bar above the header, which a frame around the blocks
  could not express. Their block data still travels once, as `eldra.templateRoles`, so a seeded page
  and a seeded template share one header and one footer.
- **One block per seeded page is `required`, and that is why the page can exist at all.** A page
  seed may mark a block `required: true`; Core creates its layout node **locked**, so an author
  reorders it and edits its fields but cannot delete it or move it out of the page root. `/cart`'s
  `cart` block, `/wishlist`'s `wishlist` block and `/search`'s `search` block each carry it —
  without it a merchant could delete the cart off the cart page, which is precisely the objection
  that kept those three as code routes. Only a page seed's blocks may carry it.
- **The seeded header and footer carry no destinations.** A theme cannot know an organisation's own
  collections, pages or policy documents, so the fixtures leave every link field in `navigation` and
  `footer` empty — the header's `links` and `cta`, the footer's `groups`, `links`, `legalLinks` and
  `social`.
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
- **Ids come from the fixture — on a template seed.** A seed block keeps the fixture block's own
  `id` (`product-detail`, `home-hero`, …), which is what the generated layout's `block` nodes
  reference. A **page** seed emits no ids: it declares no layout, so there would be nothing for one
  to be referenced from, and Core mints the nodes itself.
- **A catalog seed names no product or collection.** The sample pages name one — that is what
  makes them a realistic page — but a template renders whatever its route resolved, so the seeds
  for `/products/:slug` and `/collections/:slug` drop everything that names the fixture's own
  object and bind the fields the routed object carries itself. Dropped: `product-detail`'s
  `productHandle`; `collection-header`'s `collection`, `title` and `description`;
  `collection-grid`'s `collection`; `product-carousel`'s `viewAllHref` (a link into the fixture
  product's category); the fixture's own levels and
  links in `breadcrumbs`' `trail` and `collection-header`'s `subcollections` (emptied, a shape both
  blocks render — and the product seed turns `breadcrumbs`' `fromProduct` on, so the trail it cannot
  author comes from the routed product's own categories instead; see "The category tree"); and
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

## The cart drawer and the `/cart` page

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

`/cart` is a **page the theme seeds**, not a route it owns: `pages/cart.page.json` (above, "Seeded
templates and pages"). It is the drawer's own "View cart" destination, the deep link somebody can
bookmark or be sent, and the no-JavaScript fallback above — and now also a document an author can
compose. It used to be `app/pages/cart.vue`, a code route, on the argument that a shopper's cart is
their own session and a site must not be able to lose its cart by deleting a page. The first half
was never the whole story (a cart page is a page like any other: a header to leave it by, a
breadcrumb trail, a carousel under the empty state), and the second is now a rule rather than an
absence — the seed marks the `cart` block `required`, so Core creates its node locked and the one
thing on the page that cannot be deleted is the cart.

What makes it real on a deployed site:

- **The page document.** `@eldrajs/theme-nuxt`'s `prerender:routes` hook lists every published
  page's own path, so `cart/index.html` is written from the document itself. Nothing names `/cart`
  in `nitro.prerender.routes` any more — a path named there would be prerendered even on a build
  whose gateway has no such page, baking the not-found shell into the artifact under a name a
  visitor can reach. `test/prerenderRefresh.browser.spec.ts` runs a real `nuxi generate` against the
  mock gateway and asserts the file, its header and its footer; `test/starter.spec.ts` asserts the
  other half, that a credential-free build prerenders `/` and `/404` and nothing else.
- **The catch-all serves it.** `resolveRoute()` (`@eldrajs/theme-core`) matches a published page by
  slug _before_ any route template, so `app/pages/[...slug].vue` renders the cart page with the
  site's own header and footer resolved into it — the two things the code route could not have,
  because the runtime resolves them only as part of a page or a template.
- **One cart implementation.** The page's `cart` block is `blocks/cart/Block.vue` in its `page`
  variant: the same line items, totals and empty state as the drawer, and as the block an author can
  place anywhere else.

The copy is the page's own fields now, which is the point of the move: the empty state's heading and
its "Continue shopping" destination (`/`, the one route every store has) are seeded from the fixture
and editable in Studio, where the code route built them in TypeScript from `app/i18n`. The chrome
the block renders itself — "Your cart", the item count, the column headings — is still the theme's.

`test/cartDrawer.spec.ts` is where the shell and a page are mounted together — the only spec that
mounts `app/app.vue` — and `test/pages/ssr.spec.ts` asserts the same two facts about the server-
rendered shell: one closed `<dialog>`, and a bag that is still a link.

## The `/search` page

`/search` is a seeded page too (`pages/search.page.json`), for the same reasons `/cart` is one.
Everything in the theme that can submit a search already names it: `@eldrajs/ui`'s `SearchBar` and
`SearchModal` default their `action` to `/search` and submit `${action}?q=…`, and
`blocks/search/Block.vue`'s own chips, "Did you mean" link and per-section "View all" links point
back at it. The page renders that block in its `results-page` variant, with the `required` mark on
its node — so the destination every search submit in the theme names cannot be deleted out from
under them — and `cart/index.html`'s story is this one's too: the page document is what writes
`search/index.html`, through the module's `prerender:routes` hook, with no hand-named prerender
entry anywhere.

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

Two fields the seed deliberately leaves absent: `popularSearches` and `noResultsCollection` are a
merchant's answers, not a theme's. The page carries the fields, empty, so an author fills them in
where their shoppers' own searches are — rather than a theme inventing four popular searches and a
fallback collection it cannot know. Everything else about the page is the seed's: the results
heading is a field, and the header, breadcrumbs, carousel and footer around the block are blocks an
author can edit, move or add to like any other page's.

## Wishlist

A shopper can save products for later, and the whole feature is **local to their browser**. There is
no account behind it and no platform endpoint for one yet: `app/storefront/history.ts`'s
`createWishlistStore()` keeps a list of storefront handles in `localStorage` under
`eldra.storefront.wishlist` — the same namespace and the same bare JSON array `recentlyViewed`
already uses, and the same unversioned shape `@eldrajs/sdk`'s `createCartSession` keeps the cart id
in. An account-backed wishlist is a later platform feature; when it lands, the store behind
`useStorefront().wishlist` changes and nothing that reads it has to.

The interface is `items` (handles, newest first), `count`, `has`, `toggle`, `remove`, `clear` and
`hydrate` (`WishlistStore` in `app/storefront/types.ts`). Three surfaces read it, and all three go
through **`useWishlist()`** (`app/composables/useWishlist.ts`) rather than touching
`useStorefront().wishlist` directly:

- **`blocks/product-detail/Block.vue`** — the heart in the buy box (`aria-pressed`, "Save … to
  wishlist" / "Remove … from wishlist"). Pressing it raises a toast, because `aria-pressed` flipping
  on a 20px outline icon is not feedback: "Saved to wishlist" with one action, **View wishlist** →
  `/wishlist`, the same shape the add-to-cart toast has, or "Removed from wishlist" with no action
  (the product has left the list, so there is nothing to go and see, and pressing the heart again is
  already the undo). One toast id for both, so pressing twice replaces the sentence instead of
  leaving two contradicting ones on screen.
- **`blocks/wishlist/Block.vue`** — the block the `/wishlist` page is made of (below).
- **`blocks/navigation/Block.vue`** — a heart in the header's actions row beside the bag, with the
  bag's own count pill, linking to `/wishlist`. **It is there whether or not anything is saved**, and
  no `block.json` field gates it: `/wishlist` is a page the theme seeds into every site, so the heart
  can never lead nowhere. It gated itself on a non-empty list first, which made it a way in you
  could only find once you had already found it. Only the **count** is the visitor's own state, so
  only the badge waits for the saved list (below); with nothing saved the heart's accessible name is
  simply `header.wishlistEmpty` — "Wishlist", no number — rather than the bag's "Cart, empty", which
  is worth saying about a bag and says nothing about a list nobody has used.
  Absent from the `minimal` variant, which the spec defines as brand, search, cart and a Menu
  button — the same `variant !== 'minimal'` guard the call to action carries. It _does_ render at
  mobile widths, unlike the call to action: a shopper who saved something on a phone has no other
  way back to it, where the call to action has a drawer row.

**Hydration is the one rule everything here turns on.** `items` is empty until `hydrate()`, which
only `useWishlist()` calls, and only in `onMounted`. A saved list is a visitor's own state, and one
prerendered file is served to all of them — so the HTML a build writes has no pressed hearts, no
count on the header's heart and an empty `/wishlist` page, the browser's first render of that file is
identical to it by construction, and the saved products arrive a moment later as an ordinary
reactive update. The
same gate the header puts on the cart count and `useRevalidating` puts on the refresh treatment;
reading storage at construction instead made Vue repaint the buy box and the header on every reload
for anyone who had ever saved a product. Every mutation calls `hydrate()` first, so a toggle can
never write an empty list over a saved one.

**The same rule covers the cart, including its _pending_ flag.** The cart store asks for whatever
cart the browser already remembers as soon as it is created (`init()`, from the storefront plugin's
`setup`), which is before the app hydrates — so on a reload with a cart in `localStorage` the cart
is already `pending` while the prerendered file, built with no browser, says nothing is loading.
That flag is as much the visitor's own state as the count is: `product-detail` reads it behind its
own after-mount gate (`cartBusy`) for the Add to cart button and the sticky buy bar, having spent a
while logging one "Hydration completed but contains mismatches" on every product-page reload with a
cart in it — and nowhere else, because the header's count was gated already. The test that sees it
is `test/prerenderRefresh.browser.spec.ts`, which is the only place the kit hydrates a real
generated page in a real browser; a mounted spec never hydrates against server-rendered HTML at
all. So the rule to apply to anything new that reads the cart, the wishlist, recently-viewed or any
other browser-held value: **read it behind a mount gate, flags and counts alike.**

Hydration also subscribes to the `storage` event, so a save in one tab reaches the header count and
the wishlist page in the others. There is **one listener for the whole page**, not one per store, and
`useWishlist()` gives up its interest in `onUnmounted` — the last consumer to leave drops it. Both
halves are about the same thing: `useStorefront()` builds a fallback storefront _per calling
component_ when nothing is provided (every Storybook story, every block mount), so a listener per
store with no way to undo it would leave one behind for each, holding a dead `items` ref.

### The `/wishlist` page and its block

`/wishlist` is the third seeded page (`pages/wishlist.page.json`), and the block it is made of is
`blocks/wishlist/`. Both are new: the surface used to be `app/pages/wishlist.vue`, a code route that
owned its own markup on the argument that a saved list "has no fields, no variants and nothing to
configure" and therefore did not earn a block.

What changed is not the list — it is still one grid and one empty state — but what a page is allowed
to be. A code route carries no header and no footer, because the runtime resolves those only as part
of a page or a route template, so `/wishlist` had no navigation to leave it by and nothing a
merchant could put beside the grid. As a page it has both, and as a block the grid can also be
placed anywhere else. Its node is seeded `required`, so the page cannot lose the list the header's
heart points at.

Four fields, each falling back to the theme's own localized copy, so a freshly inserted block
renders exactly what the route did: `heading` (the `<h1>`, with the saved count beside it),
`emptyTitle`, `emptyText` and `emptyLink` — a `link`, so an author can point "Continue shopping" at
a collection, a page or a product and have it keep resolving when that object is renamed. The seed
names `/`, the one destination every store has. The link is deliberately **not** localized: a
destination is one decision rather than a translation (the rule `link` fields follow everywhere), so
its visible label is the theme's own words unless the author types their own.

The cards are not hand-rolled: they are `@eldrajs/ui`'s `ProductCard` built by
`toProductCardEntries()`, the same mapping `collection-grid`, `product-carousel` and `search` build
theirs with.

**One batched read, by handle.** `catalog.byHandles()` turns the whole saved list into a single
`filter=slug:in:…` products read — not one request per product — and makes no request at all for an
empty list, which is what both the prerender and the first client render do. The cards render in the
order they were saved; a handle the catalogue does not answer about gets no card and is **still
kept**, because nothing here can tell "this product was deleted" from "we could not ask", and a read
that failed must never be what empties a shopper's wishlist.

**The read is keyed on the block's own handle list, not on the live wishlist**, and that distinction
is the difference between a removal costing nothing and a removal costing a round trip.
`StorefrontResult` watches its sources, so handing it `wishlist.items` directly made every heart
press re-run the whole batched read — and put the block into its refresh state for the duration,
which dimmed every card that was staying. The block instead keeps a `ref` that only ever _gains_
handles (and only ones it has no row for) plus a map of every row the read has answered, so a
removal is a local filter and a handle arriving from elsewhere — another tab's save, a client
navigation — is still fetched.

Each card's heart removes the product and moves focus somewhere deliberate — the next card's own
heart, the last one when the end of the list went, or the empty state's heading when that was the
only saved product — the same rule `blocks/cart/Block.vue` follows for a removed line. The removal is
announced through one polite live region, naming the product and the list's new size ("Removed
Speckled latte mug. 1 item in your wishlist."). That is mechanism as much as copy: a polite region is
announced when its content _changes_, so a fixed sentence written into it twice is announced once, and
every removal after the first was silent. No toast here — the product page's heart raises one because
nothing on that page changes, and here the list itself does.

**In Studio the grid is empty**, because the editor is not a shopper's browser, which would read as a
block that could not find its data. One `EditorPlaceholder` above it says what it will hold on the
live site — editor-only, gated on `useEditing()` like every other hint in the theme, the same shape
the cart block's closed-drawer hint has.

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

The starter speaks `vue-i18n` directly — no hand-rolled `useT()`, no wrapper composable of any kind
around `useI18n()`. A block reads its own strings exactly the way an application built from
scratch on `vue-i18n` would: `import { useI18n } from 'vue-i18n'; const { t } = useI18n();`, then
`t('header.cartMany', { count })`.

**The two files.** `i18n/en-US.json` and `i18n/is-IS.json` sit at the theme root (siblings of
`tokens.json` and `blocks/`, not under `app/`) — nested objects, vue-i18n's own on-disk shape, with
the identical key tree in both (`test/i18n.spec.ts`'s canary fails otherwise). `en-US` is the
default locale, declared in `package.json`'s own `eldra.defaultLocale` field; every other locale
file's keys must be a subset of the default's (`@eldrajs/vite-plugin-theme`'s scanner enforces this
at scan time, the same way it validates `blocks/*/block.json`). A key is a dotted path matching
`^[a-z0-9]+([A-Z][a-z0-9]*)*(\.[a-z0-9]+([A-Z][a-z0-9]*)*)*$` (camelCase segments, ≤ 128 characters);
a value is a string (≤ 2000 runes) that may carry `vue-i18n`'s own `{param}` placeholders, stored
verbatim. A literal `@` inside a value has to be escaped `{'@'}` (vue-i18n's own linked-message
syntax reads a bare `@` as the start of one) — `newsletter.emailPlaceholder`'s `"name{'@'}example.com"`
is the shipped example; nothing else in vue-i18n's message syntax (`{`/`}` outside a placeholder,
`|`, a leading `@`) survives unescaped either, so a new string that happens to need one follows the
same pattern.

**`@eldrajs/ui`'s own strings live in the same files**, under a top-level `ui.*` namespace — English
from the package's own `enUS` export, Icelandic from `@eldrajs/ui/messages/is-IS` — but only the
package's **plain-string** keys: a manifest key can only ever be a string (the scanner's own rule),
so the package's ~40 **parameterized** keys (`closeDrawer(name)`, `reviewCount(n)`, and the rest,
which embed real pluralization logic no flat template can carry) are not in `ui.*` at all and are
not overridable — `app/plugins/eldra-ui-messages.ts` falls those back to the package's own function
straight from `@eldrajs/ui`, and falls back to it for a plain-string key too whenever the active
locale's catalogue has no entry for it. Every other `ui.*` key _is_ overridable: it is exactly what
reaches Studio's "Theme texts" page (the contract's `messages` manifest block), where an operator
can translate a key the theme ships no file for, or override the theme's own default.

**The merge, at build time.** `@eldrajs/vite-plugin-theme` scans `i18n/*.json` into the manifest,
flattening each locale's nested JSON into dotted keys the same way `vue-i18n`'s own on-disk format
flattens; `@eldrajs/theme-nuxt`'s module reads the platform's theme-message overrides at `nuxi
generate` time and merges them over the manifest defaults (`virtual:eldra/messages` serves the
result — merged over, resolved per organisation locale, a credential-less build serving the manifest
defaults unchanged). `@eldrajs/theme-vue`'s `EldraContext['messages']` is this resolved catalogue,
reactive, flat dotted keys per locale tag — the one source both the app's own i18n plugin and
`@eldrajs/ui`'s message provide read from. See `docs/theme-design-tokens.md` for the full five-tier
fallback (`override(locale) → theme(locale) → override(orgDefault) → theme(orgDefault) →
theme(themeDefault)`) and the bridge message Studio pushes on a live edit.

**The plugin.** `app/plugins/eldra-i18n.ts` installs `vue-i18n` on the Vue app once:
`createI18n({ legacy: false, locale, fallbackLocale: [orgDefaultLocale, themeDefaultLocale],
messages: unflatten(context.messages.locales) })` — `unflattenMessages` (`@eldrajs/theme-core/i18n`)
is the same helper the bridge handler below uses, turning the flat catalogue back into vue-i18n's
nested shape. `locale` follows `useEldraLocale().active` (the page's URL-prefix locale, or the one a
Studio preview is driving) with `preview.locale` as the fallback for a context assembled without the
locale slice — the same two-source order every other locale-aware plugin in this theme reads in
(`eldra-ui-messages.ts` below). A Studio "Theme texts" edit arrives as the `editor:theme-messages`
bridge message, which `@eldrajs/theme-vue` applies to `context.messages.locales` wholesale per
locale; the plugin watches that and re-applies every locale through vue-i18n's own
`setLocaleMessage`, so a live edit reaches every mounted block's `t(...)` with no re-render plumbing
of its own.

It falls back to the theme's own default locale (`en-US`, declared the way the paragraph above
says) for a configured organisation locale the theme ships no message set for — vue-i18n's own
`fallbackLocale` chain, not a hand-rolled one. An organisation may configure any number of locales;
this theme ships two. The content on such a page is still that locale's, and English chrome around
real Icelandic (or Polish, or Portuguese) copy is the honest outcome of shipping two sets, where a
key rendered unresolved would not be.

**One real difference from the old hand-rolled loader, worth knowing.** `vue-i18n`'s own
interpolation renders a named placeholder with no matching param as **empty**, not as the literal
`{param}` the theme's old `useT()` used to leave visible. That was a deliberate fail-safe this kit no
longer has — adopting the library directly means its behaviour, not a reimplementation of the old
one.

**Typed keys.** `app/i18n.d.ts` augments `vue-i18n`'s own `DefineLocaleMessage` interface with
`en-US.json`'s shape (`vue-i18n`'s documented "Global Resource Schema" mechanism), which is enough to
give `useI18n()`'s composer autocomplete over every dotted key — but `vue-i18n`'s own `t(...)` type
signature (`<Key extends string>(key: Key | ResourceKeys | number) => string`) infers `Key` from
whatever literal a call site passes, so a bare `t('nav.menuTypo')` still type-checks; the schema
augmentation alone does not reject it. The real gate is the global ambient `MessageKey` union
`@eldrajs/vite-plugin-theme` generates into `.eldra/block-types.d.ts` from the same
`i18n/en-US.json` — every helper that hands a key to some _other_ call site to interpolate later
(`blocks/product-detail/stock.ts`'s `lowStockKey`, `blocks/search/Block.vue`'s `pluralise`, and a few
more) types its return as `MessageKey`, and an unknown string assigned there fails typecheck. Both
type sources are generated from the one file, so they can never disagree about which keys exist.
Nuxt's own typecheck (`nuxt.config.ts`'s `typescript.tsConfig.include`) deep-checks `app/**`, where
every one of those helpers lives; `blocks/**`'s own template/script bodies are outside that
project's `include` (a pre-existing fact of this starter's tsconfig, not something this change
affects) and are only resolution-checked, not expression-checked, by `nuxi typecheck` — so a literal
`t('typo')` written directly inside a block is not caught by any mechanism here.

The same active locale is what every `Intl` format on the page runs in: `app/plugins/
eldra-ui-messages.ts` provides it to `@eldrajs/ui` under `LOCALE_KEY`, which is where `<Price>`,
`<CurrencyInput>` and `app/storefront/money.ts` all read it from. The **currency** does not follow
the locale — it is the store's, from the platform — so a page served under `/is-IS` prints
"2.800 kr." where the same money reads "kr 2,800" on the English one.

No hard-coded UI copy in primitives, blocks, or pages — every visible string, `aria-label`, and
`sr-only` label goes through `t(...)`. Content copy from a block's `mock.json` is data, not UI copy,
and stays out of the locale files. Add a new key to **both** locale files in the same change; the
Icelandic string should be a real translation, not a placeholder. `test/i18n.spec.ts` also runs a
narrow "no literal UI copy" scan over every block's `<template>` — an `aria-label`/`title`/
`placeholder`/`alt` written as a plain quoted literal rather than bound to `t(...)` fails it.

**Namespaces.** `i18n/en-US.json` is one object with one nested namespace per block, named for the
block's own strings (`header` for `navigation`, `cta`, `grid` for `collection-grid`, `product` for
`product-detail`, `trust` for `trust-strip`, and so on — most match the `apiId` directly, a few are
shortened for readability) — a block's own spec only ever reads its own namespace, so two blocks can
never collide on a key. Two namespaces are shared rather than per-block: `storefront` is vocabulary
every commerce block needs in common — a `StorefrontResult.pending`/`error` state, an order's
delivery step — so it lives once instead of once per commerce block namespace; `editor` holds the
hint strings every block's empty-state `EditorPlaceholder` reads (shown only under `useEditing()`),
also shared rather than duplicated. `nav`, `notFound`, `loading` and `error` are the page-chrome
strings `app/app.vue` and the 404 page use directly. `ui` is the one namespace that is not the
theme's own — see above.

**Storybook and tests install `vue-i18n` straight from the two JSON files** — no gateway, no
`virtual:eldra/messages` in either environment. `.storybook/i18n.ts` builds one `createI18n()`
instance installed once on the Storybook Vue app (`.storybook/preview.ts`'s `setup(app)`);
`test/support/mountBlock.ts`'s `mountOptions()` builds a fresh one per mount (`global.plugins`), the
same fallback chain degenerated to the theme's own default locale (there is no organisation in
either environment). A spec whose own locale has to switch live after mounting — `blocks/
collection-grid/__tests__/Block.spec.ts`'s "follows a locale switch" — builds its own `createI18n()`
and its own watcher rather than asking the shared harness to carry reactive plumbing every other
caller would pay for.

## 6. Content locales

The organisation's configured content locales reach the theme through
`@eldrajs/theme-nuxt` — the default locale at `/`, every other supported locale under a path prefix
(`/is-IS/products/ash-glaze-mug`). `docs/themes.md` has the whole rule; what the starter adds on top
of it is four things, and a customer editing this theme should know all four.

**The footer's language switcher** (`blocks/footer/Block.vue`, behind the block's own `showLocale`
field) lists `useEldraLocale().supported`, each option labelled with the locale's own name through
`useEldraLocale().name` — "íslenska (Ísland)", not "Icelandic", because a visitor hunting for their
language is hunting for the word they write it with. Its value is the page's locale and choosing one
is a navigation (`select`), so there is no local state: a `ref` of the choice would show the new
language immediately and then disagree with the page if the navigation were slow or refused. With
one locale it renders nothing at all — most stores, and every Storybook story — which is the same
judgement the currency slot beside it already makes. The label computation is deliberately _not_ in
the block: `Intl.DisplayNames` is ICU data the renderer and the browser need not share, so the
adapter resolves the names once on the server and carries them in the payload.

**Every link keeps the language.** `app/components/EldraRouterLink.vue` is the one component every
internal destination passes through — `@eldrajs/ui`'s `Link`/`Button` hand their `href` to whatever
`as` they are given — so that is where the active locale's prefix is added, once, for the whole
theme. `useEldraLink()` prefixes what it resolves as well; both rewrites are idempotent, so the two
cannot compound. Two destinations are prefixed by hand because no router is in their path: the
search block's `<form action>` (the no-JavaScript submit) and the product-detail toasts'
`{label, href}` actions, which `@eldrajs/ui`'s `Toast` renders as a plain `<a>`. **If you add a
destination of either kind, put it through `useEldraLocale().path()`.**

**The storefront reads the catalog in the page's language.** `app/plugins/eldra-storefront.ts`
hands `createGatewayStorefront` a `locale` getter and `app/storefront/gateway.ts` wraps the SDK
client once (`withContentLocale`), so every catalog, search and order read carries it and no call
site has to remember — `inventory` is left alone, because stock counts carry no language. The locale
is part of each result's async-data key too: one read of one product in two languages is two values,
and the key is what they travel to the browser in.

**A locale with no message set falls back to English chrome** — see section 5.

Nothing here is reached on a store with one configured locale: the switcher does not render, no path
is prefixed, no read carries a `locale`, and the artifact is byte-for-byte what it was.

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
