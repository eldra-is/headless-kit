# UI components

`@eldrajs/ui` is a public, MIT-licensed Vue 3 component library for Eldra storefronts: accessible
(WCAG 2.2 AA) actions, forms, display, commerce and layout components, plus overlays and navigation
landing incrementally in this sub-project, themed entirely through CSS design tokens rather than a
fixed look. It has no dependency on Studio, a theme, or any other package in this kit; any Vue 3
project can install it on its own.

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

**Navigation, overlays and feedback** (landing incrementally; the rest of the sub-project is still
in progress)

- `Dialog` — a small modal window for one decision or a short form, native `<dialog>` +
  `showModal()` with no custom focus trap (`useDialog` and `dialogStack` in `packages/ui/README.md`
  own the shared modal rules — never stacking two, initial focus, focus return, the scroll lock —
  for every modal surface built on top of them).
- `Tabs` / `Tab` / `TabPanel` — an APG-pattern tab list that switches between sibling panels in
  place, `underline` or `pills`, data-driven (`items`) or built from `Tab`/`TabPanel` children.
  **Navigation, overlays and feedback**

- `Accordion` / `AccordionItem` — a stack of native `<details>`/`<summary>` disclosure rows, single-
  or multiple-open, with an optional link row for a menu entry without children.
- `Drawer` — a modal side sheet for long content (the cart, filters, quick view from the right;
  the mobile menu from the left), built on the same `useDialog` contract as `Dialog` and sharing
  its one-modal-at-a-time slot.

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
