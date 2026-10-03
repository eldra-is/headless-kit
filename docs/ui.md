# UI components

`@eldrajs/ui` is a public, MIT-licensed Vue 3 component library for Eldra storefronts: accessible
(WCAG 2.2 AA) actions, forms, display, commerce and layout components, plus navigation, overlay and
feedback components, themed entirely through CSS design tokens rather than a fixed look. It has no
dependency on Studio, a theme, or any other package in this kit; any Vue 3 project can install it on
its own.

```bash
pnpm add @eldrajs/ui vue
```

Components are exported unprefixed from the root entry (`Button`, `Select`, …) and are not
registered globally — import what you use, or opt into `<EldraButton>`-style auto-imports with the
`@eldrajs/ui/resolver` entry for
[`unplugin-vue-components`](https://github.com/unplugin/unplugin-vue-components).

## Components

Every component `@eldrajs/ui` ships, one line each (see `packages/ui/README.md`'s Customisation
table and Storybook for the full contract of each).

**Actions and forms**

- `Button` / `ButtonGroup` — a button (or link styled as one), with loading/icon-only states, and
  a `role="group"` wrapper that lays related buttons out together.
- `Input` / `Textarea` — a labelled single- or multi-line text field with the shared field
  boundary, masks and error states.
- `UnitInput` / `CurrencyInput` — a numeric field that keeps a locale-formatted string in view at
  all times; `CurrencyInput` is a `UnitInput` with currency formatting always on.
- `QuantityStepper` — a numeric +/− stepper for cart and line-item quantities.
- `Checkbox` / `CheckboxGroup` — a labelled checkbox, and a `role="group"` of related ones sharing
  one label and error.
- `RadioGroup` — a `role="radiogroup"` of plain or card-styled radio options.
- `Switch` — a labelled on/off toggle.
- `Select` / `MultiSelect` — a single- or multi-value select with a popover listbox.
- `SearchBar` — a typeahead search field with a popover results panel.
- `VariantPicker` — a product's option groups, rendered as pills or colour swatches.
- `Link` — an inline or standalone link, with the package's own external-link and underline
  conventions.
- `FieldWrapper` — the label/help/error layout every form control renders inside.
- `FormLayout` — the form shell: heading, fields, a status region and an actions row.
- `Icon` — the shared icon frame the rest of the package draws its icons through.
- `VisuallyHidden` — text present for assistive technology only.

**Display, commerce and layout**

- `Container` / `Section` — the max-width/gutter wrapper and the vertical-spacing/background
  wrapper every block is built from.
- `Image` — the responsive media frame every card and block builds on (fixed aspect ratio, focal
  point, zoom, a live "no image" placeholder).
- `Badge` / `StockBadge` — a small status/count pill, and an icon-plus-word inventory status line
  (in stock, low stock, preorder, out of stock).
- `Price` — a formatted amount, with an automatic sale/compare-at state.
- `Rating` — a read-only five-star rating in half steps, optionally linked to a store's reviews.
- `Avatar` / `AvatarGroup` — a round image/initials/icon identity atom, and a stacked row of them
  with a "+N" overflow count.
- `LogoItem` — one logo cell in a stockist or press logo cloud.
- `Skeleton` — a neutral, shimmering loading placeholder shape.
- `EmptyState` — the shared "nothing here / no results / error" panel shown inside a block.
- `EditorPlaceholder` — Studio's own hint for an unfilled block field; never rendered on the live
  storefront.
- `Chip` / `ChipGroup` — a removable tag or selectable filter pill, and a `role="group"` of them
  (an operator addition beyond the design spec — see the README).
- `ContentCard` / `FeatureCard` — an editorial/journal card (media, eyebrow, title, excerpt, meta),
  and an icon tile plus title and body, optionally linked.
- `ProductCard` — the product tile used in grids, carousels and search results, composing `Image`,
  `Price`, `Rating`, `Badge`, `StockBadge` and `Button`.

**Navigation, overlays and feedback**

- `Dialog` — a small modal window for one decision or a short form, native `<dialog>` +
  `showModal()` with no custom focus trap (`useDialog` and `dialogStack` in `packages/ui/README.md`
  own the shared modal rules — nested modals with `Esc`/a backdrop click acting only on the topmost
  one, initial focus, focus return, the scroll lock — for every modal surface built on top of them).
- `Tabs` / `Tab` / `TabPanel` — an APG-pattern tab list that switches between sibling panels in
  place, `underline` or `pills`, data-driven (`items`) or built from `Tab`/`TabPanel` children.
- `Accordion` / `AccordionItem` — a stack of native `<details>`/`<summary>` disclosure rows, single-
  or multiple-open, with an optional link row for a menu entry without children.
- `Drawer` — a modal side sheet for long content (the cart, filters, quick view from the right;
  the mobile menu from the left), built on the same `useDialog` contract as `Dialog` and sharing
  its modal stack (a `Dialog` may open on top of it — Esc/a backdrop click act only on the topmost).
- `Tooltip` — a short, non-modal text label naming or describing an icon-only trigger on hover and
  keyboard focus (WCAG 1.4.13: dismissible, hoverable, persistent).
- `Popover` — a generic non-modal trigger + floating panel for menus, filters and dropdowns (an
  operator addition beyond the design spec — see the README), built on the same `usePopover`
  machinery as `Select`'s own popup.
- `Pagination` — numbered page links with previous/next, collapsing to a compact "Page 2 of 12"
  form below 48rem of its own width (a `@container` query, not the viewport); real links with
  `hrefForPage`, or buttons emitting `update:page` without it.
- `LoadMore` — a "Showing 24 of 96 products" live status, a progress meter and a button that hides
  once everything is shown, for collections where browsing matters more than position.
- `SearchModal` — the Search bar's field, results panel and listbox inside a native `<dialog>`,
  opened by a consumer's own trigger or by `/`/`⌘K`/`Ctrl+K` from anywhere, sharing `useDialog`'s
  contract with `Dialog` and `Drawer` and reusing `SearchBar`'s own `SearchResultsPanel`/
  `useListbox`.
- `Toast` / `Toaster` — a brief, non-blocking status message in a fixed bottom-right region, raised
  from anywhere with `useToast()` (a module-level queue, not a `provide`d instance) and rendered by
  one `<Toaster />` mounted near an app's root. Auto-dismisses per variant (success 6s, warning
  10s, danger never), pauses while hovered or focused, and teleports into an open `Dialog` instead
  of `<body>` while one is open (see `packages/ui/README.md`'s Composables section).
- `Carousel` — a native scroll-snap track with arrows, an optional counter and dots, and optional
  autoplay with a mandatory Pause/Play button (WCAG 2.2.2); never loops except autoplay wrapping
  from the last slide back to the first. Touch swipes natively; mouse/pen drag (`draggable`,
  default `true`) snaps to the nearest slide on release, biased one slide further by a fast flick.
  `useCarousel` (also exported) is the whole behaviour with no rendering of its own, reused
  unchanged by the Lightbox's own track.
- `Breadcrumb` — a `<nav>`/`<ol>` trail back up the catalogue, collapsing its middle levels behind
  an ellipsis button below its own 48rem width (never the viewport) and never truncating a title.
- `Lightbox` — a full-screen native `<dialog>` image viewer for product galleries, built on
  `useDialog` and `useCarousel` unchanged: counter, close, arrows and a caption around a one-
  image-per-view track, with an optional thumbnail strip. Opens at a given `index` (two-way) with
  no scroll animation; `←`/`→` move the image from anywhere in the viewer, not only the track; the
  stage is draggable the same way `Carousel`'s own track is (thumbnails unaffected).

## Loading and revalidating

Two of the commerce components carry two different busy states, and they are opposites rather than
degrees of one thing. `loading` means there is no value yet: `Price` renders a text skeleton,
`ProductCard` replaces the whole card with one. `revalidating` means the value on screen is real but
may be a moment out of date — the state a prerendered storefront is in just after load, when the
page was built with yesterday's price and stock and is refreshing only those two fields live. So
`Price`, `StockBadge` and `ProductCard` (which passes it straight to its price and stock line) keep
the value exactly where it is, dim it to `--eldra-revalidating-opacity`, draw a small spinner
beside it — outside the component's own box, so nothing on the page moves — and mark the root
`aria-busy="true"` with a hidden live region reading "Updating price" / "Updating stock". A refresh
that fails simply turns the flag back off and leaves the value that was already there. `loading`
wins when both are set. A grid should pass `announce: false` alongside `revalidating` and announce
the refresh once at page level — that drops each value's own live region and changes nothing else.

The dim is deep enough to see (`--eldra-revalidating-opacity`, default `0.75`): a value being
refreshed has to read as unsettled rather than as ordinary settled text. That costs contrast for as
long as the read lasts — 0.75 is the deepest dim at which every colour these values are drawn in
still clears 3:1 on every ground the package ships, and it is below 4.5:1 for everything but the
plain `text` colour — so the token is there to move: `0.9` clears 4.5:1 for all six colours on
`background` and on `surface` (`surface-strong` needs `0.94`), and lowering it makes the state
louder at the cost of the 3:1 floor. And when the fresher value lands it **fades in** rather than simply appearing:
the new amount, or the new stock line, is on screen the instant the data changes and fades from
transparent over `--eldra-duration-base`. Nothing fades out, so a stale value is never shown after
the component has stopped saying it is busy, and there is only ever one copy of the value in the
DOM. Under `prefers-reduced-motion: reduce` there is no animation at all and the value simply
changes. A value that is on screen never turns back into a skeleton.

## Money and number formatting

Every currency the package renders is written with the currency's **narrow** sign — `kr 2,800`
under `en-US`/`ISK`, `2.800 kr.` under `is-IS`, `$28` for dollars — because that is the sign a
store's own back office writes, and a price that disagreed with the currency field an operator
typed it into is a bug the shopper sees. `Price` (and `ProductCard` through it) takes
`narrowSymbol`, `true` by default, as `CurrencyInput` already did; pass `false` for the wide sign,
which for some currency-and-locale pairs is the ISO code itself.

`Price` formats through `formatCurrency` (below), so it carries that formatter's fraction rule:
the currency's own count as the maximum, and a **minimum of zero**, which is why a whole amount
reads `$48` rather than `$48.00`.

A theme that has to put money in a sentence rather than render a `<Price>` — "Add to cart ·
kr 2,800", a cart line total, a search suggestion — should format it with the package's own
`formatCurrency` rather than `Intl.NumberFormat`, which writes the wide sign by default and so
quietly disagrees with every price beside it:

```ts
import { currencySymbol, formatCurrency } from '@eldrajs/ui';

formatCurrency(2800, 'en-US', 'ISK', true, 0); // "kr 2,800"
formatCurrency(28, 'en-US', 'USD'); // "$28"
currencySymbol('ISK', 'is-IS'); // "kr."
```

`formatCurrency(value, locale, currency, narrowSymbol, maxFraction)` is positional, with those
defaults, because it is a **port of the private Eldra library's own helper and the canonical copy of
it** — that library imports this one rather than keeping its own, so the signature is its signature
and the output has to stay identical. Two things follow from that contract: the minimum fraction
digits are `0`, so `28` is `"$28"` and `28.5` is `"$28.5"`; and `maxFraction` defaults to `2`
whatever the currency, so pass `currencyFractionDigits(currency, locale)` when you want the
currency's own count (`<Price>` does, which is what keeps krónur integral and `BHD` at three
places). It throws `RangeError` for a code `Intl` rejects, as the original does — guard it the way
`Price` does if it runs inside a `computed`.

`currencySymbol` is this package's own addition: the sign on its own, for a place that names a
currency rather than formatting an amount in it. It never throws. Both sit alongside `formatNumber`,
`formatUnit`, `createNumberFormat`, `parseLocaleNumber`, `localeSeparators` and
`currencyFractionDigits` — see `packages/ui/README.md` for the whole set.

## Styles

Pick one of three CSS entries, depending on how the consuming project builds CSS:

- `@eldrajs/ui/tokens.css` — the `--eldra-*` design token variables only.
- `@eldrajs/ui/tailwind.css` — the tokens plus a Tailwind v4 `@theme` block and the package's own
  utilities, for a project that runs Tailwind v4 itself:

  ```css
  @import 'tailwindcss';
  @import '@eldrajs/ui/tailwind.css';
  ```

- `@eldrajs/ui/style.css` — the package's own compiled stylesheet, for a project with no Tailwind
  build of its own:

  ```css
  @import '@eldrajs/ui/style.css';
  ```

## Forms

The form components are validation-agnostic: `FieldWrapper` takes an `error` string, `Input` takes
`invalid`, and where those come from is the consuming project's business. For projects that use
[vee-validate](https://vee-validate.logaretm.com/v4/), the optional `@eldrajs/ui/vee-validate` entry
ships `Form` (over `useForm` and `FormLayout`) and a `Field*` component per control (over
`useField`) — see `packages/ui/README.md`'s `./vee-validate` section for the exact list.
`vee-validate ^4.12` is an optional peer; nothing else in the package imports it.

```vue
<Form :validation-schema="schema" @submit="send">
  <template #default="{ errors }">
    <FieldWrapper label="Email address" required :error="errors.email">
      <FieldInput name="email" type="email" autocomplete="email" />
    </FieldWrapper>
  </template>
  <template #actions>
    <Button variant="primary" type="submit">Subscribe</Button>
  </template>
</Form>
```

## More

- [`packages/ui/README.md`](../packages/ui/README.md) — the full reference: install, fonts,
  customisation (tokens, per-component CSS variables, `classes`, slots, `as`), messages and
  localisation, the composables (`useFloating`, `useOverlay`, `useListbox`), the
  `EldraUiResolver`, the `./vee-validate` entry, the accessibility/testing protocol every
  component ships, and every recorded deviation from the design spec.
- Storybook — one story per component state, screenshot-tested against committed baselines. Run it
  locally with `pnpm --filter @eldrajs/ui storybook`, or build it with
  `pnpm --filter @eldrajs/ui build-storybook`. The baselines under `packages/ui/__screenshots__`
  are **macOS/Chromium renderings** and have to be regenerated per platform, which is why
  `pnpm --filter @eldrajs/ui screenshots` is outside `pnpm check` and outside CI.
