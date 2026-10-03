# `@eldrajs/ui`

Accessible Vue 3 core components for Eldra storefronts, themed through CSS design tokens.

The components are built to
[`eldra-starter-spec/01-core-components.md`](../../eldra-starter-spec/01-core-components.md) (WCAG
2.2 AA). Plan 1 — foundations, actions and forms (`Button`/`ButtonGroup`, `Link`, `Input`,
`Textarea`, `FieldWrapper`, `FormLayout`, `Checkbox`/`CheckboxGroup`, `RadioGroup`, `Switch`,
`Select`/`MultiSelect`, `QuantityStepper`, `VariantPicker`, `SearchBar`) — is complete, plus
`UnitInput` and `CurrencyInput`, which the spec has no equivalent of; display, commerce, layout, overlays, navigation
and feedback components land in the two sub-projects that follow, in the same delivery order the
spec's "Components and delivery order" section lays out. What this package ships that the spec does
not name is listed under
[Additions beyond the spec](#additions-beyond-the-spec), and where it departs from a property table
it is recorded under [Deviations](#deviations) — neither is left for a reader to find.

## Install

```bash
pnpm add @eldrajs/ui vue
```

Peer: **`vue ^3.5`**. The floor is 3.5, not 3.4: every control's ids come from `useId()`, which Vue
added in 3.5, so on 3.4 the install succeeds and the first control to mount throws
`useId is not a function`. `vee-validate ^4.12` is an **optional** peer — only the `./vee-validate`
entry needs it, and nothing else in the package imports it.

## Styles

Three CSS entries ship; pick the one that matches how the consumer builds CSS. Every one of them
starts from the same `--eldra-*` variables, so nothing here is a different theme, only a different
delivery shape.

- **`@eldrajs/ui/tokens.css`** — the `--eldra-*` variables only (colours, radii, spacing, type,
  motion, z-index, and the one opacity — `--eldra-revalidating-opacity`), declared on `:root` with
  the spec's defaults, plus a
  `@media (prefers-reduced-motion: reduce)` rule that zeroes every duration variable.
- **`@eldrajs/ui/tailwind.css`** — `tokens.css`, then a Tailwind v4 `@theme` block mapping its own
  namespaces onto those variables (`--color-primary: var(--eldra-color-primary)`, `--radius-md`,
  `--font-heading`, `--spacing-*`, `--shadow-*`, `--ease-*`) plus the package's custom utilities
  (control heights, the `eldra-focus` ring, the type styles, motion and layer utilities) and a
  `@source "../dist"` so a consumer's own Tailwind build scans the package's _compiled_ components.
  For a project that already runs Tailwind v4, `main.css` (or equivalent) becomes:

  ```css
  @import 'tailwindcss';
  @import '@eldrajs/ui/tailwind.css';
  ```

- **`@eldrajs/ui/style.css`** — the package's own compiled build of `tailwind.css` plus every
  component's utilities, for a consumer with no Tailwind build of their own:

  ```css
  @import '@eldrajs/ui/style.css';
  ```

  This is also what a project whose own Tailwind build cannot share this package's utility prefix
  (a `ui:`-prefixed theme, for example) reaches for.

## Fonts

The type tokens' defaults are `--eldra-font-heading: "Bricolage Grotesque", ui-sans-serif,
system-ui, -apple-system, "Segoe UI", sans-serif` and `--eldra-font-body: "Instrument Sans",
ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. The package does not load either
font — it only names them — so a consumer either loads Bricolage Grotesque and Instrument Sans
themselves (self-hosted, or a Google Fonts `<link>`/`@import`) or overrides `--eldra-font-heading`
and `--eldra-font-body` with their own stack. Until one or the other happens, text renders in the
fallback system stack, which is legible but not the spec's intended look.

## Customisation

Every component supports all five of these; none hard-codes anything a store might want to change.

1. **Tokens.** Every colour, radius, height, spacing step, font, duration, easing and z-index a
   component uses resolves to a `--eldra-*` variable from [Styles](#styles) above — set one on any
   ancestor (typically `:root`) and every component reading it follows. **`:root` rather than a
   wrapper**, for the popup panels: `Select`, `MultiSelect` and `SearchBar` render theirs through a
   `<Teleport>` to `body` (see [Layering](#layering)), so a variable set on a `<div>` around the
   control is not an ancestor of the panel any more and is not inherited by it.
2. **Per-component CSS variables**, declared on the component's own root with a token-derived
   default, for the handful of values that are not shared design tokens — a size with no dedicated
   token, a component-specific corner radius. Each one is documented on the component's own
   Storybook docs page; the variables currently declared:

   | Component           | CSS variables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
   | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `Accordion`         | none — the top divider is a stock `border-t`, no per-component variable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
   | `AccordionItem`     | `--eldra-accordion-title-line` (default `1.4`) — the label's line ratio, no token of its own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
   | `Avatar`            | `--eldra-avatar-initials-size-{sm,md,lg,xl}` (defaults `0.76rem`/`0.95rem`/`1.33rem`/`2.28rem`, "38% of diameter" — no token of its own), `--eldra-avatar-initials-tracking` (default `0.02em`), `--eldra-avatar-icon-size-{sm,md,lg,xl}` (defaults `0.857rem`/`1.071rem`/`1.5rem`/`2.571rem`, the spec's own lg number scaled proportionally to the other three diameters)                                                                                                                                                                                                                                          |
   | `AvatarGroup`       | none — the overlap and stack order are plain Tailwind, no per-component variable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
   | `Badge`             | `--eldra-badge-line-height` (default `1`) — the badge text's line ratio, no token of its own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
   | `Breadcrumb`        | none — the collapse threshold reads `--container-tablet` (`Container`'s own 48rem gutter breakpoint), and the link/ellipsis boxes reuse `target-min`/`eldra-link-radius`/`radius-sm`, no per-component variable of its own                                                                                                                                                                                                                                                                                                                                                                                           |
   | `Button`            | `--eldra-button-radius` (default `var(--eldra-radius-md)`), `--eldra-button-line-height` (default `1.2`), `--eldra-button-font-size-lg` (default `1.0625rem`, the one button size with no type token of its own)                                                                                                                                                                                                                                                                                                                                                                                                     |
   | `ButtonGroup`       | none — reads only the shared tokens from layer 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
   | `Carousel`          | `--eldra-carousel-per-view-base`/`-md`/`-lg` (bound as an inline style on the track by `carouselPerViewStyle`, resolved into `--eldra-carousel-per-view` per container-query breakpoint by the `eldra-carousel-track` utility, no default of its own — a slide with none set stays full width) and `--eldra-carousel-gap` (default `var(--eldra-space-4)`), both read by the `eldra-carousel-slide` utility's width formula; `--eldra-carousel-dot-size` (default `0.5rem`) and `--eldra-carousel-dot-ring` (default `1.5px`), read by `eldra-carousel-dot`                                                          |
   | `Checkbox`          | `--eldra-checkbox-radius` (default `var(--eldra-radius-sm)`), `--eldra-checkbox-border-width` (default `1.5px`), `--eldra-checkbox-border-width-invalid` (default `2px`)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
   | `CheckboxGroup`     | none — reads only the shared tokens from layer 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
   | `Chip`              | none — the selected/hover fills are `color-mix()` over shared `--eldra-color-*` tokens, no per-component variable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
   | `ChipGroup`         | none — reads only the shared tokens from layer 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
   | `Container`         | none — the gutter widths (`--eldra-gutter-{mobile,tablet,desktop}`) are shared tokens, also read by `Section`; the three finite `width` values likewise read the shared `--eldra-container-{narrow,content,wide}` tokens directly, through `Container`'s own `eldra-container-{narrow,content,wide}` utilities rather than Tailwind's `max-w-narrow`/`-content`/`-wide` — see the Deviations entry below                                                                                                                                                                                                             |
   | `ContentCard`       | `--eldra-content-card-title-size` (default `1.25rem`) and `--eldra-content-card-title-line` (default `1.3`) — the title's own size and line ratio, no token of its own; `--eldra-content-card-excerpt-size` (default `0.9375rem`) and `--eldra-content-card-excerpt-line` (default `1.5`) — the excerpt's own size and line ratio, shared by `FeatureCard`'s `body` (`text-content-card-excerpt` in `tailwind.css`), since both read the same spec number                                                                                                                                                            |
   | `CurrencyInput`     | `UnitInput`'s exactly (it renders a `UnitInput` with `isCurrency` always on) — see the `UnitInput` row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
   | `Dialog`            | `--eldra-dialog-title-size` (default `1.25rem`), `--eldra-dialog-title-line` (default `1.3`) — the title's own size/line, no token of its own; `--eldra-dialog-width` (default `32rem`), `--eldra-dialog-width-sm` (default `24rem`) — the panel's own width, always capped at `100vw - 2rem` inside the utility itself; `--eldra-dialog-max-height` (default `calc(100vh - 4rem)`)                                                                                                                                                                                                                                  |
   | `Drawer`            | `--eldra-drawer-title-size` (default `1.25rem`), `--eldra-drawer-title-line` (default `1.3`) — the title's own size/line, no token of its own (the same numbers as `Dialog`'s, but its own variable pair); `--eldra-drawer-width` (default `28rem`) — the panel's own maximum width, capped at the viewport inside the utility itself, which also carries the full-screen-below-a-48rem-_viewport_ media query                                                                                                                                                                                                       |
   | `EditorPlaceholder` | `--eldra-editor-placeholder-border-width` (default `1.5px`) — the dashed boundary's width, distinct from `EmptyState`'s own stock `border` (1px)                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
   | `EmptyState`        | `--eldra-empty-state-title-size` (default `1.25rem`) and `--eldra-empty-state-title-line` (default `1.3`) — the title's own size and line ratio, no token of its own                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
   | `FeatureCard`       | Shares `ContentCard`'s `--eldra-content-card-excerpt-size`/`-line` for its own `body` text (`text-content-card-excerpt`); its `title` reads `text-h4` directly, no variable of its own                                                                                                                                                                                                                                                                                                                                                                                                                               |
   | `FieldWrapper`      | `--eldra-field-note-line-height` (default `1.45`) — the line the help and error text share                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
   | `FormLayout`        | `--eldra-form-summary-radius` (default `var(--eldra-radius-md)`) — the status summary box's corner radius                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
   | `Icon`              | none — reads only the shared tokens from layer 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
   | `Image`             | `--eldra-image-hatch-gap` (default `0.75rem`) — the live "No image" placeholder's diagonal-line repeat distance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
   | `Input`             | `--eldra-input-radius` (default `var(--eldra-radius-md)`), `--eldra-control-font-size` (default `0.9375rem`), `--eldra-control-font-size-mobile` (default `1rem`), `--eldra-control-line-height` (default `1.5rem`), `--eldra-field-border-width` (default `1px`)                                                                                                                                                                                                                                                                                                                                                    |
   | `Lightbox`          | none of its own — the entrance keyframe (`eldra-lightbox-in`) and every size are either shared tokens or literal component-specific classes (`px-16`, `size-11`/`max-md:size-11`), the same "no dedicated variable" shape as `AvatarGroup`/`ButtonGroup`                                                                                                                                                                                                                                                                                                                                                             |
   | `Link`              | `--eldra-link-radius` (default `2px`) — the focus ring's corner radius on every variant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
   | `LoadMore`          | none — the status/meter/button sizes all reuse shared tokens (`text-body-sm`, `control-h`, `text-button-md`), no per-component variable                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
   | `LogoItem`          | `--eldra-logo-image-max-height` (default `2.5rem`), `--eldra-logo-image-max-width` (default `9rem`) — the logo image's contain box; `--eldra-logo-wordmark-size` (default `1.25rem`) — the wordmark fallback's font size (its weight, line-height and letter-spacing reuse `h2`/`h3` tokens directly, see `text-logo-wordmark` in `tailwind.css`)                                                                                                                                                                                                                                                                    |
   | `MultiSelect`       | everything `Select` reads, plus `--eldra-select-pill-line` (the "+N" pill's line box) and `--eldra-checkbox-radius`/`--eldra-checkbox-border-width`, shared with `Checkbox` so a consumer restyles both at once                                                                                                                                                                                                                                                                                                                                                                                                      |
   | `Pagination`        | none — every size (the 2.5rem page link/`control-h` previous-next, the `target-touch` compact arrows, the 0.9375rem `text-control` compact status) reuses a shared token or a shared arbitrary spacing multiple, no per-component variable                                                                                                                                                                                                                                                                                                                                                                           |
   | `Popover`           | `--eldra-z-popover` (default `30`), shared with the other popover panels — no per-component variable of its own: it has no fixed size to clamp, unlike `Select`'s panel                                                                                                                                                                                                                                                                                                                                                                                                                                              |
   | `Price`             | `--eldra-price-current-sm-size` (default `0.9375rem`), `--eldra-price-current-lg-size` (default `1.5rem`) — only `sm`/`lg` need one: `md`'s current price inherits the surrounding text, and `compareAt`/`from`/`unit` scale off whichever size the root sets (`0.9em`, a literal ratio the spec itself gives, and a fixed `0.8125rem`), so neither needs a variable of its own                                                                                                                                                                                                                                      |
   | `ProductCard`       | none of its own — it composes `Image`/`Badge`/`StockBadge`/`Price`/`Button`, each restyled through its own row above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
   | `QuantityStepper`   | `--eldra-stepper-radius` (default `var(--eldra-radius-md)`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
   | `RadioGroup`        | `--eldra-radio-card-border-width` (default `1px`) and `--eldra-radio-card-radius` (default `radius-md`) for the card boundary; `--eldra-checkbox-border-width`/`-invalid` for the radio circle itself, shared with `Checkbox`                                                                                                                                                                                                                                                                                                                                                                                        |
   | `Rating`            | none — the half-star overlay (`eldra-rating-half`) is a fixed `clip-path`, no per-component variable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
   | `SearchBar`         | `--eldra-search-panel-max-height` (default `32rem`, clamped to `70vh`), `--eldra-search-text-line`, `--eldra-search-empty-line`, `--eldra-search-kbd-line`, `--eldra-input-radius`, `--eldra-field-border-width`, `--eldra-z-popover`, and `--eldra-popover-origin` (set by the panel itself from the placement it resolved to: `top left` below the field, `bottom left` above it)                                                                                                                                                                                                                                  |
   | `SearchModal`       | `--eldra-search-modal-width` (default `40rem`), `--eldra-search-modal-max-height` (default `40rem`) — both clamped to the viewport inside their own utility, which also carries the full-screen-below-a-48rem-_viewport_ media query; `--eldra-search-modal-field-size` (default `1.0625rem`), `--eldra-search-modal-foot-size`/`-line` (defaults `0.75rem`/`1.4`), `--eldra-search-modal-kbd-size` (default `0.6875rem`) — none with a token of their own; plus everything `SearchBar`'s reused `SearchResultsPanel` reads (`--eldra-search-text-line`, `--eldra-search-empty-line`, `--eldra-control-line-height`) |
   | `Section`           | none — the vertical rhythm (`--eldra-section-{sm,md,lg}`) and the gutters it shares with `Container` are shared tokens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
   | `Select`            | `--eldra-select-panel-max-height` (default `20rem`), `--eldra-select-panel-max-width` (default `22rem`, clamped to `90vw`), `--eldra-z-popover` (default `30`), `--eldra-field-radius`, `--eldra-field-border-width`, `--eldra-select-group-tracking`, `--eldra-select-option-line`, `--eldra-select-swatch-edge`, the `--eldra-select-match-*` trio, and `--eldra-popover-origin` (`top left` / `bottom left`, set by the panel from the placement it resolved to)                                                                                                                                                  |
   | `Skeleton`          | none — `width` sets an inline style directly (see the Deviations entry), no CSS variable involved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
   | `StockBadge`        | `--eldra-stock-status-line` (default `1.4`) — the status line text's line ratio, no token of its own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
   | `Switch`            | `--eldra-switch-radius` (default `var(--eldra-radius-full)`), `--eldra-switch-track-border-width` (default `1.5px`), `--eldra-switch-thumb-offset` (default `0.1875rem`, the thumb's rest inset from the track's start edge)                                                                                                                                                                                                                                                                                                                                                                                         |
   | `Tab`               | none — reads only the shared tokens from layer 1, plus `VariantPicker`'s `text-variant-pill` type style (no per-component variable of its own; see that component's row)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
   | `TabPanel`          | none — reads only the shared tokens from layer 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
   | `Tabs`              | none — reads only the shared tokens from layer 1; the new `eldra-scrollbar-hide` utility the tab list uses has no variable of its own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
   | `Textarea`          | `--eldra-textarea-radius` (default `var(--eldra-radius-md)`), `--eldra-textarea-min-height` (set from the `minHeight` prop, default `5rem`), `--eldra-counter-line-height` (default `1.5`)                                                                                                                                                                                                                                                                                                                                                                                                                           |
   | `Toast`             | `--eldra-toast-title-size` (default `0.9375rem`), `--eldra-toast-title-line` (default `1.4`) — the title's own size/line, sitting between two type-scale steps with no token of its own                                                                                                                                                                                                                                                                                                                                                                                                                              |
   | `Toaster`           | `--eldra-toast-width` (default `24rem`) — the fixed region's own width, always capped at `100vw - 2rem` inside the utility itself, the same shape as `Dialog`'s own width variables                                                                                                                                                                                                                                                                                                                                                                                                                                  |
   | `Tooltip`           | `--eldra-tooltip-arrow-size` (default `0.3125rem`) — the arrow's side length, no token of its own; `--eldra-z-popover` (default `30`), shared with the popover panels                                                                                                                                                                                                                                                                                                                                                                                                                                                |
   | `UnitInput`         | `Input`'s exactly, because it draws `Input`'s box: `--eldra-input-radius`, `--eldra-control-font-size`, `--eldra-control-font-size-mobile`, `--eldra-control-line-height`, `--eldra-field-border-width` (`CurrencyInput` is a `UnitInput`, so the same)                                                                                                                                                                                                                                                                                                                                                              |
   | `VariantPicker`     | `--eldra-variant-legend-line` (default `1.4`), `--eldra-variant-pill-border-width` (default `1px`), `--eldra-variant-pill-selected-color` (default `var(--eldra-color-text)`), `--eldra-variant-pill-radius` (default `var(--eldra-radius-md)`), `--eldra-variant-swatch-ring-width` (default `2px`), `--eldra-variant-swatch-edge-width` (default `1px`)                                                                                                                                                                                                                                                            |
   | `VisuallyHidden`    | none — reads only the shared tokens from layer 1 (it renders no visible box at all)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

   Every component this package ships has a row above; `src/__tests__/readmeCoverage.spec.ts`
   fails the build if `src/componentNames.ts` gains a name this table has not. "None" means the
   component reads only the shared tokens from layer 1 above, with no CSS variable of its own.

   One variable in that list is **derived, not a knob**: `--eldra-field-invalid-radius` is declared
   by the `eldra-field-invalid` utility on the field root that carries it (every control with the
   2px error boundary — `Input`, `UnitInput`, `Select`, `MultiSelect`, `Textarea`, `SearchBar`) as
   `var(--eldra-field-radius, var(--eldra-input-radius, var(--eldra-radius-md)))`, so the inset
   error line can round to the field's own corner minus the border width. It exists because a
   two-deep `var()` fallback written inline inside a `calc()` makes every consumer's PostCSS print a
   parse warning — see the Deviations entry. Setting it from outside does nothing, because the
   utility declares it on the same element: change the radius it reads instead.

3. **A `classes` prop**, typed `Partial<Record<Part, string>>` where `Part` is the union of that
   component's `data-part` names from the design spec's anatomy (`container`, `label`,
   `leadingIcon`, `trailingIcon`, `spinner` for `Button`; see each component's exported
   `<Name>Part` type and its Storybook docs page for the exact list). Values merge onto that part's
   own classes with `tailwind-merge` (via this package's own `cx`, also exported for a consumer
   composing a wrapper the same way), so `classes.root: 'rounded-full'` replaces
   `eldra-button-radius` instead of landing beside it.
4. **A slot for every part that holds content** (`label`, `description`, `error`, `leading`,
   `trailing`, `empty`, `header`, `footer`, `item`, …), named after the part it replaces.
5. **`as`**, on the components whose spec allows a different rendered _root_ element (`Button`,
   `Link`, `Badge`, `Container`, `Section`, `VisuallyHidden`, `Rating`, `LogoItem`). `Button` renders
   an `<a>` automatically when `href` is set, without needing `as` for that case; `Badge` defaults
   to `<span>` and is never a link; `Section` picks `<section>`/`<div>` itself from whether it is
   named (`as` overrides that choice outright, for a `<header>`/`<footer>` landmark that needs no
   name of its own). **`linkAs`**, not `as`, on `ContentCard`/`FeatureCard`/`ProductCard`/
   `Breadcrumb`/`Pagination`: each of these has a spec-fixed root (`<article>`/`<div>`/`<nav>`), and
   `linkAs` instead picks the element for a _nested_ part — the stretched title link on the cards,
   every level's link on `Breadcrumb`, a page/previous/next control on `Pagination` — so the name
   never collides with the root-tag meaning `as` carries everywhere else (a string still takes
   `href`; a component receives the destination as `to`, the same contract `as` uses).

Two naming rules hold across every component, on top of the five capabilities above:

- **`ariaLabel` is always an accessible name; `label`/`title` are visible text.** `Section.ariaLabel`
  and `ChipGroup.ariaLabel` render `aria-label` and nothing else — there is no visible text
  anywhere they could name instead. `label` means visible content everywhere else it appears
  (`Badge`, `Chip`, `Checkbox`, `Select`, `RadioGroup`, `VariantPicker`, `EditorPlaceholder`), and
  `FormLayout`/`CheckboxGroup`/`RadioGroup`'s own `ariaLabel` prop (plan 1) already followed this
  rule — `Section`/`ChipGroup` used to call the same accessible-name-only concept `label`, which
  the starter's own `[...slug].vue` fell into once, passing `:label` where `:labelled-by` pointing
  at a real heading was the fix (see the Deviations entry). `AvatarGroup.label` is the one
  exception that is not a bug: it is spoken content ("Makers: Ingrid, Tomas…"), not an
  accessible-name-only prop.
- **The visually hidden part on a component with one is always named `srText`**, not `srLabel` —
  `Avatar`/`LogoItem`/`Price` (`Price.compareAt`'s hidden "Sale price"/"Regular price" labels used
  to be `srLabel`) all agree on `srText` now. `Badge`'s `hiddenSuffix` is a deliberate exception: it
  mirrors its own prop name (`hiddenSuffix`), not a generic "hidden text" part.

## Fields: the context a `FieldWrapper` provides

A `FieldWrapper` owns the visible label, the help text and the error message, and provides what it
knows to the control inside it (`FIELD_KEY`, typed as `FieldContext`) — so a bare `<Input />`
inside one needs no wiring at all:

| Field           | What the control does with it                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`            | Takes it as its own `id`, so the wrapper's `<label for>` names it                                                                                      |
| `labelId`       | The label element's own id, for a control a `<label for>` cannot name (`Select`'s `<button>` trigger uses it as `aria-labelledby`)                     |
| `describedBy`   | The wrapper's error, help and counter ids, in that order                                                                                               |
| `invalid`       | Mirrors it as `aria-invalid="true"`                                                                                                                    |
| `required`      | Mirrors it as native `required`                                                                                                                        |
| `labelsControl` | `false` for a `group` (a `<fieldset>` named by its `<legend>`): a control that draws a label of its own keeps it, and nothing claims the fieldset's id |

**`id`, `invalid` and `required` are replaced by the control's own props; `describedBy` is
composed.** One rule for every control here: **its own ids come first, then the context's.** So a
`describedBy` prop _adds_ to the wrapper's error and help ids rather than replacing them —

```vue
<FieldWrapper label="Email" error="Enter a valid email">
  <Input described-by="newsletter-note" />
</FieldWrapper>
<!-- aria-describedby="newsletter-note <error-id>" — the error is still described -->
```

— and so does a control's own part: `Switch`'s description id and the group controls'
(`RadioGroup`, `CheckboxGroup`, `QuantityStepper`) own error id both lead, with the context's ids
after them. `aria-describedby` is announced in the order its ids are listed, so the control's own
message is heard first.

**`Textarea` is the one exception, and it is deliberate:** its order is `describedBy` prop, then the
context's ids, then its **own counter** last — `joinIds(joinIds(prop, context), counterId)`. The
counter is a running "18 of 200 characters", not something that has to be heard before the error
that says what to fix, so it is the one own-part that trails rather than leads.

Ids are deduplicated **per id, not per argument** — every value here may itself be several
space-separated ids, so `joinIds('a b', 'b c')` is `'a b c'` and not `'a b b c'` — first occurrence
wins, so the order above survives. The attribute is omitted rather than rendered empty; `joinIds`
(exported from the root) is the helper the components use, for a consumer composing a control of
their own.

The three group controls take no `describedBy` prop of their own — they are `<fieldset>`s named by
a `<legend>`, and their `error` prop is what they describe themselves with.

## Messages

Text a component renders itself — "Close", "Clear", "No matches for…", pagination labels — comes
from a `messages` prop merged over English defaults, never from an i18n library:

```ts
import { provideEldraUiMessages } from '@eldrajs/ui';

provideEldraUiMessages({ close: 'Loka' }); // during setup(); sets it for everything below
```

`app.provide(MESSAGES_KEY, messages)` does the same app-wide, from outside a `setup()` scope.
Precedence, low to high: the English defaults (`enUS` / `defaultMessages`), whatever an ancestor
provided through `provideEldraUiMessages`/`MESSAGES_KEY`, then a component's own `messages` prop.

`@eldrajs/ui/messages/is-IS` ships the complete Icelandic set as its own entry point, so an
English-only store never bundles it:

```ts
import { MESSAGES_KEY } from '@eldrajs/ui';
import { isIS } from '@eldrajs/ui/messages/is-IS';

app.provide(MESSAGES_KEY, isIS);
```

## Composables

Exported from the package root — the same building blocks `Select`, `MultiSelect`, `SearchBar` and
every other stateful component here are built on, not a separate public API layered over private
internals, so a consumer building a control this package does not ship yet (a menu, a combobox with
its own shape) reuses exactly what those components use. `useControllableModel` is the model every
stateful component here uses; `useFloating`, `useOverlay` and `usePopover` are the parts of a
**non-modal popup** — a select panel, a search results panel, a menu — that are easy to get wrong.
Neither `useOverlay` nor `usePopover` traps focus: the design spec's non-negotiables reserve
`<dialog>` and focus traps for modal surfaces, and say these popups are not dialogs.

```ts
import { useFloating, useOverlay } from '@eldrajs/ui';

const open = ref(false);
const trigger = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);

// Closing and focus. Listens on `document` only while `open` is true.
const { close, focusFirst, focusables } = useOverlay({
  open,
  trigger,
  content: panel,
  setOpen: (next) => (open.value = next),
  // closeOnOutsideClick: true,  // an outside `pointerdown`, or focus landing outside
  // closeOnEscape: true,        // `Escape`, consumed so an enclosing <dialog> does not also close
  // returnFocus: true,          // back to the trigger, but never off what the user just clicked
});

// Position. `@floating-ui/vue` with `autoUpdate`, kept current while both elements are mounted.
const { styles, placement, update } = useFloating(trigger, panel, {
  placement: 'auto', // 'auto' = below, flipping above when it does not fit; 'above' never flips
  offset: 4, // the gap in pixels
  matchWidth: true, // adds `minWidth` equal to the trigger's
});
```

`useListbox` is another: the keyboard and the active row of a listbox popup, which `Select` and
`MultiSelect` share. It owns no DOM — `activeId` is what you bind to `aria-activedescendant` on
whichever element holds focus (the trigger, or the search field when there is one) — and everything
that differs between a single and a multiple select is a callback.

```ts
import { useListbox } from '@eldrajs/ui';

const listbox = useListbox({
  options: () => visibleOptions.value, // already filtered, in DOM order
  isOpen: () => open.value,
  searchable: () => searchable.value, // a search field owns Home/End, Space and printable keys
  canOpen: () => !disabled && !readonly, // a control that cannot open must not swallow the keys
  optionId: (value) => `${id.value}-o${indexOf(value)}`,
  open: (edge) => openPanel(edge), // 'end' is ArrowUp on a closed, non-searchable trigger
  close: () => closePanel(),
  select: (option) => choose(option), // closing afterwards is yours to decide
  clear: () => clearValue(), // Backspace/Delete; return true if something was cleared
  startQuery: (character) => setQuery(character),
  escape: () => clearQuery(), // return true to consume Escape instead of closing
});
```

`onKeydown` is the whole of the design spec's two Select keyboard tables: arrow movement that skips
disabled and filtered-out rows and stops at the ends, `PageUp`/`PageDown` by ten, `Home`/`End`,
`Alt+ArrowUp`, `Escape` clearing a query before it closes, `Tab` closing without preventing focus
from moving on, and type-ahead with a 0.6s buffer that ignores case and diacritics (`normalizeText`
is exported for the same folding in a search filter).

`styles` is a plain object for `:style` — `position`, `top`, `left`, and `minWidth` under
`matchWidth` — not a transform, so the panel keeps `transform` for its own open animation.
`matchWidth` is a _floor_, never a fixed width: the spec's popover "min width = trigger, grows to
fit its content up to min(22rem, 90vw)", and that upper clamp is the panel's own `max-width`
(`eldra-select-panel-width`, over `--eldra-select-panel-max-width`), not this composable's.
`placement` is the placement actually used, after flipping.

`focusables()` is the tab sequence inside the content, so an element the platform keeps out of it —
`tabindex="-1"`, `disabled`, `aria-hidden="true"`, anything under `[hidden]` — is not in the list
even when it is programmatically focusable.

Two things `useOverlay` deliberately does not do:

- **A panel rendered through a `<Teleport>` is only recognised if it says so.** Give it
  `data-eldra-overlay-owner="<the content element's id>"`; without that, a press inside it reads as
  a press outside and closes the popup.
- **"Only one open at a time" is the consumer's.** `Escape` is consumed with `preventDefault()` and
  `stopPropagation()`, which is enough to keep an enclosing native `<dialog>` from closing behind
  the popup — but `stopPropagation()` at `document` does not stop other listeners already on
  `document`, and nothing here knows about other overlays. Opening one select closing any other is
  a registry the consumer keeps (`src/components/select/openRegistry.ts` is this package's).

`usePopover` is that registry, wired up: the one composable this package's own non-modal popups
(`Select`, `MultiSelect`, `SearchBar`'s results panel) actually build on, exported from the root for
a consumer whose control needs the same six things rather than reassembling them from
`useFloating`/`useOverlay` by hand:

- **the registry** — opening claims a module-level "only one open at a time" slot (via a stable
  per-instance handle) and closes whatever held it;
- **the teleport** — `teleport` (default `true`) returns `teleportTo` and `teleportDisabled` to
  put on a `<Teleport>` around the panel, and switches `useFloating` to the `fixed` strategy to
  match; `tabRedirect` keeps a panel that has tab stops inside the `Tab` walk it left with its
  place in the DOM. See [Layering](#layering) below for both, and for how to turn the teleport off;
- **`useOverlay`** — the outside-press/focus-leaves/`Escape` closing rules, non-modal, so nothing
  traps focus and `Tab` always moves on;
- **`useFloating`** — positioning, plus the `--eldra-popover-origin` the entrance keyframes read
  (`top left` below the control, `bottom left` above it), so a panel that flips after floating-ui
  measures changes a custom property rather than its `animation-name` (which would replay the
  entrance);
- **the open sequence** — `open(activate?)` opens, runs `activate` (make a row active), then —
  only when the call actually changed the state — runs `afterOpen` a tick later, which is where
  focus moves into the panel; `close(returnFocus?)` closes and returns focus to the trigger unless
  told not to;
- **the label-forwarded-click latch** — a `<label for>` naming the trigger forwards its click to
  it, and the spec is explicit that clicking a field's label focuses the control **without**
  opening it. A forwarded click is indistinguishable from a real one except that no pointer was
  pressed and its `detail` is 0 (the same shape as a programmatic `element.click()`), so
  `onTriggerPointerDown`/`onTriggerClick` (bound to the trigger) arm a latch on `pointerdown` and
  release it on whichever `pointerup`/`pointercancel` follows, wherever it lands.

What stays with each control is what actually differs: which rows there are, what choosing one
does, and which element the popup is anchored to. See `src/components/select/usePopover.ts` for
the full option/return shape (`UsePopoverOptions`, `UsePopoverReturn`, also exported).

`useDialog` is the **modal** counterpart: the shared "Modal dialogs" rules applied to a native
`<dialog>`, built for `Dialog` and reused by every modal surface after it (`Drawer`, `Lightbox` and
`SearchModal`) instead of each reimplementing them. `Drawer` is `Dialog`'s side-sheet
sibling: it adds only what a side sheet needs beyond the shared contract — a per-side slide, a
full-screen mobile variant, and a right-side default of focusing the close button first (see the
README's Deviations for why that is the opposite of `Dialog`'s own initial-focus rule) — passing
its own `initialFocus` computed ref into the same `useDialog` call shown below.

```ts
import { useDialog } from '@eldrajs/ui';

const open = ref(false);
const dialog = ref<HTMLDialogElement | null>(null);

const { close, isTop } = useDialog({
  open,
  setOpen: (next) => (open.value = next),
  dialog,
  dismissable: () => !formIsDirty.value, // default true; read on every backdrop click
  initialFocus: someRef, // else the first control that is not `[data-part="close"]`
  onCancel: () => emit('cancel'), // Esc always closes — this is a notification, not a guard
});
```

It owns, through the native element alone — **no custom focus trap, no `role="dialog"`** (the
spec's own non-negotiable 2):

- **open/close**, synced to `open` via `showModal()`/`.close()`. A modal `<dialog>` already makes
  the rest of the page inert and already contains `Tab`/`Shift+Tab` to its own controls, so nothing
  here re-implements either;
- **nested modals** (operator override, 2026-09-26 — see [Deviations](#deviations)), **the scroll
  lock**, and **the toast hand-off** — all in `src/composables/dialogStack.ts`, the module-level
  stack every consumer of `useDialog` shares (the same shape as `usePopover`'s own
  `openRegistry.ts`, but pushing on top rather than closing or refusing anything — a modal opening
  while another is already open is simply left open, underneath). `Esc` and a backdrop click,
  though, only ever act on the **topmost** entry (`isTop` below); a lower dialog ignores both, even
  one dispatched at it directly. The scroll lock is held while the stack is non-empty, released only
  once every open modal has closed. `TOAST_HOST_KEY` (exported) is a plain
  `Ref<HTMLDialogElement | null>` tracking the **topmost** dialog, **not a Vue injection key**
  despite the name matching this package's `*_KEY` convention — see its own doc comment for why: a
  `Toaster` mounted near an app's root is a sibling of whatever opens a `Dialog` elsewhere in the
  tree, and `provide`/`inject` cannot connect two siblings, so the hand-off is a plain shared
  reference both sides read and write, exactly the same reasoning `usePopover`'s `topLayerDialog()`
  already uses to teleport a panel into a dialog it did not render;
- **initial focus** — `initialFocus`, else the first focusable that is not `[data-part="close"]`
  (this package's own "every part carries `data-part`" convention doubling as the composable's
  exclusion rule, so any modal built on this contract needs no second constant to stay in sync),
  else the close button itself, applied a tick after `showModal()` so slot content mounted alongside
  the dialog (a form's first field) already exists to focus;
- **focus return** — whatever had focus immediately before `showModal()`, refocused the moment the
  dialog actually closes, by any route — the page's own opener at the bottom of the stack, or,
  for a modal opened from inside another one, whichever control still had focus in the modal
  underneath, so closing the top one lands focus back there instead of on the page;
- **`Esc`** (the native `cancel` event) — closes the dialog, never gated by `dismissable`, but only
  while it is the top of the stack; `onCancel` is a plain callback with nothing to call
  `preventDefault()` on, so it cannot keep the dialog open;
- **backdrop click** — a `click` whose `target` is the `<dialog>` element itself (not a descendant),
  closing it when `dismissable` reads `true` **and** it is the top of the stack.

`close(returnValue?)` is exposed so a consumer can close with an action value of their own — a
`Dialog`'s exposed `close` (`<Dialog ref="dialogRef">` then `dialogRef.value.close('remove')`) is
this, unchanged. `isTop` is `true` while this dialog is the **topmost** entry `dialogStack` holds —
`false` for one still open but covered by a modal opened on top of it.
`Tooltip` is built on `useFloating` and `useOverlay` directly rather than on `usePopover`, because
it must never join the "only one open at a time" registry — showing a tooltip must never close
somebody else's open `Select`. It still shares the _teleport target_ logic (an internal
`useTeleportTarget`, not exported: body, or the open modal `<dialog>` the trigger sits in) with
`usePopover`, so both answer "where does this popup escape to" the same way. See
[Layering](#layering) below.

`useToast` is the toast queue behind `Toast`/`Toaster` (design spec "Toast") — a **module-level**
store, not a `provide`d instance: call it from anywhere, not only from inside a `Toaster`'s own
subtree (a fetch error handler, a Pinia/Vuex store, a route guard).

```ts
import { useToast } from '@eldrajs/ui';

const toast = useToast();
toast.show({
  title: 'Added to cart',
  text: 'Merino crew sweater · Oatmeal · M',
  action: { label: 'View cart (3)', href: '/cart' }, // or { label, onActivate: () => {...} }
});
const dangerId = toast.show({ variant: 'danger', title: "Couldn't update your cart" });
toast.dismiss(dangerId); // closes it early, e.g. once a retry succeeds
toast.clear(); // empties the queue
toast.toasts; // Readonly<Ref<ToastItem[]>> — what a mounted `Toaster` renders
```

`show` resolves `variant` (default `"success"`) and `duration` together: `success` defaults to
6000ms, `warning` to 10000ms, both overridable per call, and `danger` is always `0` (never
auto-dismissed) regardless of what is passed. An `id` is a dedupe key — a second `show()` with the
same `id` replaces that toast in place (same position, a fresh timer) instead of adding a second
one; omitted, one is generated. At most three toasts are queued at once; a fourth evicts the
oldest.

**SSR-safe**: nothing in `useToast` touches `window`/`document`, and it starts no timer — a single
`<Toaster />`, mounted once near an app's root, owns every timer (paused while the pointer is over
the stack or focus is inside it, resumed for whatever time was left) and where the region actually
renders: `TOAST_HOST_KEY` (see `useDialog` above) if a modal `Dialog` is open, `<body>` otherwise —
the same hand-off `Dialog`, `Drawer`, `Lightbox` and `SearchModal` already share, so a toast raised
during a modal flow is never inert behind it.

`useCarousel` is the scroll-snap carousel's whole behaviour with no rendering of its own — index
tracking, previous/next/`goTo`, edge detection for the arrows, and autoplay with the spec's pause
rules — so `Carousel` renders the markup around it and `Lightbox` (its own track reuses this file
unchanged) needs nothing else.

```ts
import { ref } from 'vue';
import { useCarousel } from '@eldrajs/ui';

// Declared locally and passed in, the same shape `useDialog`'s own `dialog` option takes — a
// plain top-level `const x = ref(...)` is what <script setup>'s template-ref wiring
// (`ref="rootRef"`/`ref="trackRef"` in the template) recognises.
const rootRef = ref<HTMLElement | null>(null); // hover/focus-within/tab-hidden pause autoplay
const trackRef = ref<HTMLElement | null>(null); // its real DOM children are what this composable reads

const {
  index, // 0-based, the slide whose start is closest to the track's scroll position
  count, // the track's current child count, read from the live DOM
  canPrev,
  canNext, // false at an end — including when nothing overflows, so both arrows disable together
  goTo,
  next,
  prev, // never loop — arrows/dots disable at the ends instead
  onTrackKeydown, // ArrowLeft/ArrowRight — bind to the track's `keydown`
  playing,
  pause,
  resume,
  toggle, // autoplay's own toggle state, independent of the momentary hover/focus pause
} = useCarousel({
  rootRef,
  trackRef,
  autoplay: () => props.autoplay, // ms; 0/undefined means off, and it never starts under reduced motion
  slideLabel: () => messages.value.slideOf, // (position, total) => string, 1-based
  draggable: () => props.draggable, // mouse/pen drag on the track; default true if omitted
  onChange: (i) => emit('change', i),
});
```

It reads `trackRef.value.children` directly rather than Vue's slot vnodes: a carousel's whole job
is scroll geometry (`scrollLeft`, `offsetLeft`, `scrollWidth`), which only exists once the browser
has laid the slides out, so `count`, the index-from-scroll math and the per-slide `aria-label`s all
agree with what is really on screen however the slide markup got there. Every slide is annotated in
place — `data-part="slide"`, `role="group"`, `aria-roledescription="slide"`, the `slideLabel`
result as `aria-label`, and the `eldra-carousel-slide` sizing class — through a `MutationObserver`
on the track, so a consumer's own `<li>`/`<figure>`/component root becomes the slide with no
wrapper element added around it. `resolveCarouselPerView` and `carouselPerViewStyle` turn
`CarouselProps['perView']` into the three inline custom properties (`--eldra-carousel-per-view-base`
/`-md`/`-lg`) the `eldra-carousel-track` utility resolves into `--eldra-carousel-per-view` per
container-query breakpoint, so `Carousel` and `Lightbox` share one reading of the prop. An inline
style rather than classes, deliberately — see the Deviations entry. `prefersReducedMotion` is the one
JavaScript check CSS's own `motion-reduce:` cannot make on its own — whether autoplay may start at
all.

**Pointer drag** (operator ruling): touch already swipes the track for free through native
scroll-snap; `draggable` (default `true`) adds the mouse/pen equivalent. `pointerdown` on the
track — the primary button, anywhere except an editable/range control (`input`, `textarea`,
`select`, `[contenteditable]`, `input[type="range"]`) or an element opted out with `data-no-drag` —
starts tracking the pointer, buttons and links included (fix, 2026-09-26, round 2: a `ProductCard`'s
stretched title link covers the whole card, so a blanket "no interactive descendant" rule left no
way to drag from a card at all — the operator's own words: "we are not able to drag on a card, we
have to place the cursor between cards"). The `pointerdown` itself is never `preventDefault()`ed, so
native focus/click behaviour is untouched below the threshold. Once the pointer has moved 6px, the
gesture becomes a drag: `data-dragging="true"` goes on the track (the CSS `Carousel`/`Lightbox` read
it with — `data-[dragging=true]:snap-none` suspends scroll snapping, `data-[dragging=true]:cursor-grabbing`
swaps the cursor from `cursor-grab`), any text selection the native `mousedown` already started is
cleared (`window.getSelection()?.removeAllRanges()`), and `scrollLeft` follows the pointer 1:1. On
release, the track snaps to the nearest slide by position, nudged one slide further in the flick's
direction if the final movement was faster than 0.5px/ms — `goTo`, so it clamps and emits the same
as any other navigation — and, only because a real drag happened, the click that a mouse drag always
fires on release is cancelled so it never reaches whatever was under the pointer (a card's own link,
a quick-add button); a press that never crossed the threshold arms nothing, so its plain click or
link navigation lands exactly as if this composable did not exist. Autoplay pauses for the span of
the drag (folded into the same suspend `hovered`/`focusedWithin` already use, so the Pause/Play
button's label never flips) and resumes after. Reduced motion is respected the same way every other
`goTo` call already is — instant, not smooth. The drag also ends on `lostpointercapture`, not only
`pointerup`/`pointercancel` (fix, 2026-09-26): capture can be revoked with no preceding pointer event
at all — another element calling `setPointerCapture` for the same pointer, an OS/browser gesture (an
edge-swipe), the captured element becoming disabled — and without this the drag state (and
autoplay's suspension) would stay stuck forever with no further user action guaranteed to clear it.
It is handled identically to `pointercancel`, since there is nothing left to release by the time it
fires.

### Layering

A popup panel rendered inside its own control is at the mercy of everything above it on the page.
An ancestor with `overflow: hidden` — a rounded card, a table cell, a carousel track, a scrolled
column — clips it at that ancestor's edge; and any element that starts its own **stacking context**
(a sticky header with a `z-index`, a section with `isolate`, anything with a `transform`, `filter`
or `opacity` below 1) paints over it whatever the panel's own `z-index` says, because a `z-index`
only orders siblings within one context.

So `Select`, `MultiSelect`, `SearchBar` and `Tooltip` render their panel (or bubble) through a
`<Teleport>` to
`document.body`, positioned with floating-ui's **`fixed`** strategy — the viewport being the one
frame the panel and its control still share once they are in different subtrees. `autoUpdate` keeps
them together: it watches every scrollable ancestor of the control, so the panel follows a trigger
that scrolls under it. On `body` the panel is a child of the root stacking context, where
`z-popover` (`--eldra-z-popover`, default `30`) means what the spec's layer table says it means,
above `z-sticky` (`20`) and below `z-drawer` (`40`).

Four things follow from the move, and each is a real consequence rather than a detail:

- **A modal native `<dialog>` is the exception, and is handled.** A dialog opened with
  `showModal()` renders in the browser's _top layer_, above every `z-index` on the page, so a panel
  on `body` would be behind the dialog that opened it and no `z-index` could help. When the control
  sits inside one, the panel is teleported into **that dialog** instead — same escape from clipping
  and stacking, same top layer. The nearest open ancestor `<dialog>` that matches `:modal` wins,
  which is not always the nearest one (a non-modal `<dialog open>` can sit inside a modal one); if
  none claims the top layer — either none is modal, or the engine does not implement `:modal` — the
  nearest open dialog is used, because teleporting into a dialog that did not need it costs far
  less than teleporting out of one that did. **The target is resolved on every open**, not once:
  `closest()` answers about the DOM as it is, so a control that is sometimes inside an open dialog
  and sometimes not gets the right answer each time.
- **The target itself has to be a clean frame.** A teleport target you name yourself — and the
  enclosing `<dialog>`, when there is one — becomes the panel's containing block if it has a
  `transform`, `filter`, `perspective`, `backdrop-filter`, `contain: paint/layout/strict/content`
  or `will-change` on any of those: `position: fixed` then resolves against **that element**, not
  the viewport, and its `overflow` clips the panel exactly like any other ancestor. This package's
  own `Drawer` is one such element — its slide-in animation is a `transform` on the root
  `<dialog>` itself (see `Drawer.vue`'s own comment on `rootClass`), so teleporting into an open
  `Drawer` needs the same care as any other transformed ancestor. Point `teleport` at something
  plain, or leave it at `body`.
- **Custom properties are no longer inherited from around the control.** Set `--eldra-*` overrides
  on `:root` (which is what [Customisation](#customisation) asks for anyway), not on a wrapper
  `<div>`. A consumer with their own top-layer elements sets `--eldra-z-popover` there.
- **The panel is no longer in document order after its control, so the `Tab` walk is restored by
  hand.** Sequential focus order is the browser's and it follows the DOM; left alone, `Tab` from
  the trigger would step past the teleported panel to the next thing on the page and close the
  popup with its own controls never reached — which the spec's Multi-select Keyboard table forbids
  ("Tab moves from the search field (or the trigger) to the footer's Clear, then Done, with the
  popover still open"). `usePopover`'s **`tabRedirect`** puts exactly those two boundary steps back:
  `Tab` on the last tab stop the control still holds moves focus to the panel's first focusable,
  and `Shift+Tab` on that first focusable moves it back to that stop. Everything between is the
  browser's own order — including the steps _inside_ the control, which are still DOM siblings: a
  `MultiSelect` showing a clear button walks trigger → clear button on the browser's own order,
  then into the footer's Clear, then Done, exactly as the table says, and back the same way.

  **This is a redirect, not a trap.** `Tab` on the panel's _last_ focusable is left entirely alone:
  focus leaves for the next thing on the page and `useOverlay` closes the popup behind it. So there
  is an exit forwards (past the last row) and an exit backwards (`Shift+Tab` to the trigger, then
  on), which is what WCAG 2.1.2 asks for — no keyboard user is ever held anywhere, and nothing
  corrects focus after the fact. Controls that already move focus into the panel on open (any
  searchable `Select` or `MultiSelect`) are untouched: their order was already right. Turn it on
  with `tabRedirect` when your own panel holds tab stops; it is inert when the panel is rendered in
  place or has none. What counts as "the control" is `useOverlay`'s own answer — the trigger plus
  anything carrying `data-eldra-overlay-owner="<the panel's id>"` — so a control of your own puts
  its trigger-side buttons in the walk by marking them the way `MultiSelect`'s clear button does.

`teleport` is a prop on `Select`, `MultiSelect` and `SearchBar`, and an option on `usePopover`:
`true` (default), a CSS selector string for a target of your own, or `false` to keep the old
in-place `absolute` rendering when you know nothing above the control clips or stacks over it.
`Tooltip` has no `teleport` prop — it always teleports (`fixed` strategy, same target resolution),
because a tooltip has no in-place `absolute` rendering to fall back to.

## Resolver

`@eldrajs/ui/resolver` is a plain
[`unplugin-vue-components`](https://github.com/unplugin/unplugin-vue-components) resolver:

```ts
// vite.config.ts
import Components from 'unplugin-vue-components/vite';
import { EldraUiResolver } from '@eldrajs/ui/resolver';

export default defineConfig({
  plugins: [Components({ resolvers: [EldraUiResolver()] })],
});
```

A template can then write `<EldraButton>`, `<EldraSelect>`, and so on, with no explicit import —
the plugin auto-imports `{ Button }` (etc.) from `@eldrajs/ui` the first time it sees the tag; the
components are never globally registered. The default prefix is `'Eldra'`:

```ts
EldraUiResolver({ prefix: 'Acme' }); // <AcmeButton> instead
```

`EldraUiResolver(...).resolve(name)` returns `{ name, from: '@eldrajs/ui' }` for every component
`src/index.ts` exports under `<prefix><Name>`, and `undefined` for anything else — including a
`Ui`-prefixed tag. `Ui` is never the resolver's default prefix: that prefix belongs to the private
Eldra library and its own resolver. Pass `{ prefix: 'Ui' }` yourself if a consumer genuinely wants
that name — the package itself never implies it.

## `./vee-validate`

Everything above is validation-agnostic: `FieldWrapper` takes an `error` string, `Input` takes
`invalid`, and where those come from is the consumer's business. `@eldrajs/ui/vee-validate` is the
optional adapter for the one library the spec names — nothing else in the package imports it, and
the root entry loads fine without it (a test proves both, in the source graph and in `dist/`).

```bash
pnpm add vee-validate   # optional peer, ^4.12
```

It exports `Form`, twelve `Field*` components, `API_ERRORS_KEY` and the `useFieldControl`
composable they are all built on.

### The `FieldWrapper` pattern

A `Field*` renders **only** the control. The label, the help text, the required mark and the error
row stay the `FieldWrapper`'s, exactly as they are without validation — so the message reaches the
wrapper through the form's default slot:

```vue
<script setup lang="ts">
import { Button, FieldWrapper } from '@eldrajs/ui';
import { FieldInput, Form } from '@eldrajs/ui/vee-validate';

const schema = { email: 'required|email' };
function send(values) {
  /* … */
}
</script>

<template>
  <Form heading="Ask the studio" :validation-schema="schema" @submit="send">
    <template #default="{ errors }">
      <FieldWrapper label="Email address" required :error="errors.email">
        <FieldInput name="email" type="email" autocomplete="email" />
      </FieldWrapper>
    </template>
    <template #actions>
      <Button variant="primary" type="submit" label="Sending">Send message</Button>
    </template>
  </Form>
</template>
```

Vue refuses a `v-slot` on a component that also has named slot templates as children, so the fields
go in an explicit `<template #default="{ errors }">` whenever there is an actions row — which there
almost always is.

`errors` is keyed by each field's `name`, and holds only the messages that should currently
**show**: a field appears there once it has been touched or the form has been submitted. That is
the same gate each `Field*` puts on its own `aria-invalid`, so the wrapper and the control cannot
disagree about whether the field is in error. The other default-slot props are `values`, `meta`,
`isSubmitting` and `submitCount`.

Three of the controls own an `error` prop of their own — `FieldRadioGroup`, `FieldCheckboxGroup`
and `FieldQuantityStepper` — and those draw their message themselves **only outside** a
`FieldWrapper`. Inside one the wrapper says it, once.

### The components

| Component              | Wraps             | Field value                                                                   |
| ---------------------- | ----------------- | ----------------------------------------------------------------------------- |
| `FieldInput`           | `Input`           | `string`                                                                      |
| `FieldTextarea`        | `Textarea`        | `string`                                                                      |
| `FieldUnitInput`       | `UnitInput`       | `number \| null` (`null` is an empty field)                                   |
| `FieldCurrencyInput`   | `CurrencyInput`   | `number \| null` (`null` is an empty field)                                   |
| `FieldCheckbox`        | `Checkbox`        | `boolean` (one consent box)                                                   |
| `FieldCheckboxGroup`   | `CheckboxGroup`   | `string[]` (one question, several answers)                                    |
| `FieldRadioGroup`      | `RadioGroup`      | `string`                                                                      |
| `FieldSwitch`          | `Switch`          | `boolean`                                                                     |
| `FieldSelect`          | `Select`          | `string`                                                                      |
| `FieldMultiSelect`     | `MultiSelect`     | `string[]`                                                                    |
| `FieldQuantityStepper` | `QuantityStepper` | `number`                                                                      |
| `FieldVariantPicker`   | `VariantPicker`   | `string` (`name` is the visible legend unless `legend` is given — see `path`) |
| `FieldSearchBar`       | `SearchBar`       | `string`                                                                      |

Each takes `name` (the control's native `name`, and by default the field's path too), optional
`path`, optional `rules` (vee-validate's own `RuleExpression`: a rule string, an object, a function,
or a typed schema) and optional `label` — the name a rule message uses for the field, not a visible
label. Everything else its component takes is forwarded untouched, slots, `classes` and attributes
included; the props it keeps back are `modelValue`, `invalid` and `error`, which are `Omit`ted from
the type so passing one is a compile error rather than a prop that silently does nothing.

**`path` is for the one control whose `name` can be visible.** A `VariantPicker`'s `name` is drawn
in the legend as well as used as the radios' shared native name, so with `name="Size"` and no `path`
the field would be called `Size` in `initialValues`, `validationSchema`, `apiErrors` and the `errors`
slot prop, and either the legend or the key would have to be wrong:

```vue
<!-- the legend reads "Size"; values.size holds the choice -->
<FieldVariantPicker name="Size" path="size" :options="sizes" />
```

A page with more than one picker sharing an option name needs a _unique_ `name` per picker, which
is what `legend` is for — it separates the two jobs, so `name` is only the radios' grouping key and
`legend` is the visible (and accessible) name of the group. `FieldVariantPicker` forwards it like
every other `VariantPicker` prop:

```vue
<!-- the legend still reads "Size"; the radios group by a per-product name -->
<FieldVariantPicker :name="`size-${sku}`" path="size" legend="Size" :options="sizes" />
```

`path` defaults to `name`, so every other control needs nothing extra: a `RadioGroup`'s or
`CheckboxGroup`'s `name` is only the shared native field name, never the legend (that is `legend`),
and an `Input`'s is the native name outright.

`FieldSearchBar` is the odd one: a `SearchBar` renders a `<form>` of its own, so it belongs on a
Search page rather than inside a `Form`'s `<form>`; its `label` is both the control's accessible
name and the name rule messages use; and it takes neither `id` nor `name` from the field, because it
sets its own id and its native field is always `q`.

### `Form`

`Form` renders a `FormLayout` and passes every one of its props through — bar `focusOnInvalid`,
which it sets itself — so the layout, heading, actions row, two-column container query and polite
status region are the ones documented above. It adds:

- **`initialValues`** and **`validationSchema`** — handed to `useForm`.
- **`submit(values, ctx)`** — fires only with valid values; `ctx` is vee-validate's submission
  context (`resetForm`, `setErrors`, …). **`invalid(errors)`** fires instead when validation fails,
  after focus has already moved to the first invalid field.
- **`submitting`** — `isSubmitting`, or the prop, whichever is true. `submit` is an event rather
  than an awaited handler, so bind `submitting` yourself for a request you own.
- **The error summary** — after a failed submit the spec's alert box appears above the fields with
  a link to each error (the link text is the message; the target is the control's own id, which is
  the one the `FieldWrapper` generated). Fill the `errorSummary` slot to replace the list; the box,
  its border and its icon are still drawn for you.
- **`apiErrors`** — a `{ [path]: message }` map from the server, applied with `setErrors`. Each
  entry disappears the moment **its own** field changes, because a server error is a statement about
  the value that was sent, and every entry is dropped at the start of the next submit attempt for
  the same reason. It is provided on `API_ERRORS_KEY`, so a `Field*` reads the same map outside a
  `Form` too.

  How long one survives a change to a **different** field is vee-validate's own behaviour rather
  than a choice made here, and it is worth knowing: before the first submit — and with per-field
  `rules` at any time — only the field that changed is revalidated, so another field's server error
  stays put. After a submit, with a form-level `validationSchema`, vee-validate revalidates every
  already-validated field on each change (`validated-only` mode), and a field that now passes has
  its manually set error replaced by that pass, so the server's message for it goes too. Send the
  current `apiErrors` with each response rather than treating one as sticky.

- **`successMessage`** — announced in the polite live region once a submit passes validation. It is
  never visible: replacing the form with a confirmation, or navigating, stays the page's job (spec
  "Form layout" → States, Success). An explicit `statusMessage` wins over it.

## Accessibility and testing

Every component in this package ships, as part of being done, not as an add-on:

- **Zero `axe` violations** (`vitest-axe`, the `region` rule disabled to match the starter) against
  every state the spec's states table lists for that component.
- **A keyboard test for every row of the spec's keyboard table** — focus movement, `aria-*` state
  and emitted events, exercised with `@vue/test-utils`' `trigger('keydown', …)`, not just a
  mouse-click assertion.
- **A Storybook story per state**, titled with the spec's own state names ("Loading", "Sold out",
  "Long content", "Narrow container", "Reduced motion", "Forced colours" — the last two via
  emulated media in the story parameters), in `packages/ui/.storybook`
  (`@storybook/vue3-vite`). Run it locally with `pnpm --filter @eldrajs/ui storybook`.
- **A screenshot regression harness**: `scripts/screenshots.mjs` captures every story at 1280 and
  360px with Playwright and compares against committed baselines in `packages/ui/__screenshots__`
  (pixelmatch, 0.1% threshold). `pnpm --filter @eldrajs/ui screenshots --update` refreshes them
  after an intentional visual change. **The committed baselines are macOS/Chromium renderings**, and
  font rasterisation differs enough between platforms that a run on Linux or Windows will fail on
  nearly every story; regenerate them on your own platform (and do not commit that regeneration)
  until per-platform baselines land. The harness is deliberately **outside `pnpm check`** and
  outside CI for the same reason — it is run and reviewed by hand.

The design spec's own five-step testing protocol is the definition of done per component:

1. Run an automated accessibility checker against each state of each component. Zero violations.
2. Keyboard-only pass: reach, operate and leave every part using exactly the keys in the section's
   table.
3. Screen-reader pass on one desktop and one mobile screen reader: names, roles, states and
   announcements match the Accessibility notes.
4. Contrast: check every text and non-text pair in the states table against the ratios in the
   colour table.
5. 200% zoom and a 320px-wide viewport; reduced motion on; forced colours on.

**What is actually automated, precisely.** Step 1 (axe, per state), step 2 (the keyboard tests) and
the visual half of step 5 (the reduced-motion and forced-colours stories, captured with Playwright's
media emulation) — plus the screenshot baselines above. **Steps 3 and 4 are not automated in this
package**, and step 5's zoom pass is not either: axe runs under happy-dom, where there is no layout
and no computed paint, so its `color-contrast` rule cannot evaluate and reports nothing. Nothing
under `src/` computes a relative luminance, and `scripts/build-tokens.mjs` only copies the token
values across. The one automated ratio check on the whole branch is
[`examples/starter-nuxt/test/tokens.spec.ts`](../../examples/starter-nuxt/test/tokens.spec.ts),
which checks eleven pairs of the **starter's** `tokens.json`. Contrast, the screen-reader pass and
the zoom/320px pass are therefore manual protocol steps, performed and recorded per component
during development, outside this repository's own history.

## Additions beyond the spec

Things this package ships that design spec 1 does not name at all. Each is listed here so a reader
comparing the package against the spec can tell an addition from a drift.

- **`Chip` and `ChipGroup`** — an operator addition (2026-09-25) for the private component
  library's `FilterChip`, which a store migrating onto this package needs an equivalent of. There
  is no spec 1 "Chip" section; the visual language is derived from two sections that do exist:
  Badge's pill shape and Multi-select's removable tag row, whose exact class recipe `Chip`'s `sm`
  size shares with `MultiSelect.vue` (`src/utils/tagRecipe.ts`, extracted rather than duplicated).
  A plain chip is a `<span>`, no role; `selectable` renders a real `<button type="button"
aria-pressed>` that fills `primary`/`primary-contrast` when `selected`, the same pair Badge's
  own `primary` tone fills with. `removable` adds a separate `<button>` named `"Remove <label>"`
  (`messages.removeTag`, `MultiSelect`'s own tag message, reused rather than duplicated) —
  **and always wins over `selectable`**: a removable chip's root is never also the selection
  toggle, because nesting a real `<button>` (remove) inside a real `<button>` (root) is invalid
  HTML. This is the same rule the private library's own `FilterChip` states outright in its
  `CLAUDE.md` ("removable mode is display-only for the chip body; only the close button is
  interactive"); a dev-only console warning fires for the combination. `Backspace`/`Delete` on a
  focused removable chip's root (`tabindex="0"`, no invented ARIA role) or its remove button emits
  `remove`; `Enter`/`Space` toggle a selectable chip through the native `<button>`'s own behaviour,
  with no separate keydown handler that could double-toggle. `icon` draws directly (Badge's own
  reasoning: neither chip size's icon dimension or stroke is one of `Icon.vue`'s four); `avatar`
  draws through `Avatar` at the chip's own icon size via `classes.root` — no built-in `Avatar` size
  is small enough to sit inside either chip size, so it is drawn undersized rather than left at
  `Avatar`'s own smallest, `sm`.

  `ChipGroup` (`modelValue: string[]`, `ariaLabel`, `disabled`) is a slot wrapper like `ButtonGroup` —
  it does not render its children, a consumer places `<Chip value="…" selectable>`s in its default
  slot — that provides `CHIP_GROUP_KEY` context (`src/components/chip/context.ts`, exported from
  the root entry): a member chip with both `selectable` and a `value` reads its selected state from
  `modelValue` and toggles through the group's own `update:modelValue` instead of its own
  `selected`/`update:selected`. `role="group"` with the given `aria-label`; the wrap gap is
  `space-2`, `tokens.json`'s own token description for "chip gaps" — a narrower gap than
  `ButtonGroup`'s `space-3` "gap inside control groups", because these are a row of chips, not a
  row of whole controls.

- **`UnitInput` and `CurrencyInput`** — editable unit and money fields, and **ports of the two
  components Eldra's private component library ships**, not designs of this package's own. The spec
  has no editable numeric field: its `Price` is a display component (plan 2), and `Input`'s
  `type="number"` is a native number input, which cannot hold a locale-grouped value at all. They
  are `Input`'s box in every respect a customer can see (the same sizes, paddings, focus ring and
  error boundary, imported from `src/components/input/classes.ts`), plus the part a text field
  cannot do: a `number` on one side and an `Intl`-formatted string in the field **at all times**,
  reformatted on every keystroke with the caret mapped through the new text. They are a port so
  that a store that knows those fields knows these; the handful of places this port deliberately
  departs from them is listed under the deviations below.
- **`FieldUnitInput` and `FieldCurrencyInput`**, their `./vee-validate` wrappers, binding
  `number | null`.
- **`provideEldraUiLocale` / `useEldraUiLocale` / `LOCALE_KEY`** (`src/composables/useLocale.ts`) —
  the number locale as a provide/inject pair, the same shape as the messages one and deliberately a
  separate key: the strings a component renders and the locale its numbers are formatted in are
  different decisions. `UnitInput`, `CurrencyInput`, `QuantityStepper` and `Price` read it, and each
  one's own `locale` prop wins over it.
- **`provideEldraUiCurrency` / `useEldraUiCurrency` / `CURRENCY_KEY`**
  (`src/composables/useLocale.ts`) — `LOCALE_KEY`'s sibling, the store currency `Price` formats
  with by default, `USD` with nothing provided; `Price`'s own `currency` prop wins over it.
- **`FieldCheckboxGroup`** — the twelfth `Field*`, for the one root-entry control the spec's list
  of ten left without a way to validate it (see the deviation below).
- **`filterNumericBeforeInput`** (`src/utils/numeric-input.ts`) — the `beforeinput` filter that
  keeps a numeric text field numeric, used by `QuantityStepper` and exported for a consumer
  building a numeric control of their own.
- **`createNumberFormat` / `formatNumber` / `formatCurrency` / `formatUnit` / `currencySymbol` /
  `parseLocaleNumber` / `localeSeparators` / `currencyFractionDigits`**
  (`src/utils/number-format.ts`) — locale-aware number formatting and its inverse, behind the
  numeric controls and exported for use outside them.

  **`formatCurrency(value, locale = 'en-US', currency = 'USD', narrowSymbol = true, maxFraction = 2, minFraction?)`**
  and
  **`formatUnit(value, { locale, unit, maxFraction, isCurrency, currency, narrow, minFraction })`**
  are **ports of the private Eldra library's own two helpers, and the canonical copy of them**: that
  library is expected to import these and delete its own, so the signatures are positional and the
  option names are its own, against this package's house style, and for the arguments it passes the
  output must stay identical character for character. The contract, in full:
  `minimumFractionDigits` is `0`, `maximumFractionDigits` is `maxFraction`, a currency carries
  `currencyDisplay: narrow ? 'narrowSymbol' : 'symbol'`, and a unit carries no `unitDisplay` at all
  (so `UnitFormatOptions.narrow` affects a currency only — unlike `NumberFormatOptions.narrow`,
  which narrows a unit too). `src/utils/__tests__/number-format.spec.ts` holds a parity table that
  recomputes that rule with `Intl` directly and fails if the two ever diverge.

  **`minFraction` is the one addition to the ported signature, and it is display-only: omit it to
  match input formatting.** Omitted — which is how the private library calls — the behaviour is
  exactly the contract above, so `28` formats as `"$28"` and `28.5` as `"$28.5"`: the rule a
  currency _field_ wants, where it shows what a person typed rather than what the minor unit
  allows. A _displayed_ amount wants the opposite, a price list in which one row reads `$96` and
  the next `$96.50` being no column of money, so it passes `currencyFractionDigits(currency, locale)`
  and gets `"$96.00"`. `Price` passes that count as **both** `minFraction` and `maxFraction`; a
  zero-decimal currency is unaffected by either, its own count being `0`.

  `formatCurrency` is what a theme should reach for when it has to put money in a sentence ("Add to
  cart · kr 2,800") rather than render a `<Price>`: a hand-built
  `Intl.NumberFormat({ style: 'currency' })` writes the **wide** sign (`"ISK 2,800"`), which is not
  the shape this package's own prices and currency fields are in, and that mismatch is exactly the
  defect it exists to prevent. Note that `maxFraction` defaults to `2` whatever the currency, so a
  caller that wants the currency's own count passes it — which is what keeps a króna from growing a
  fraction it has no minor unit for, and `BHD` at three places. It **throws** `RangeError` for a
  code `Intl` rejects, as the private helper does; a caller inside a `computed` guards it the way
  `Price` does (plain decimal plus the raw code). Formatters are memoised per distinct shape inside
  the module, so a grid of prices pays for one construction rather than one per amount while both
  functions stay pure.

  **`currencySymbol(currency, locale, narrow = true)`** is this package's own addition rather than a
  port: the sign on its own — `"kr"`, `"kr."`, `"$"` — read out of `formatToParts` rather than a
  code → symbol table, for a place that names a currency rather than formatting an amount in it. A
  currency with no sign distinct from its code in that locale returns the code, so a caller pairing
  the two should compare them rather than printing `"ISK ISK"`. It never throws.

  `currencyFractionDigits` is the one no component here calls: `UnitInput` and `CurrencyInput`
  keep the private library's rule that `maxFraction` is `2` whatever the currency, so it is
  exported for a consumer who wants the currency's own minor unit instead (`0` for ISK, `3` for
  KWD, read from ICU).

- **`frameAspectRatio`** (`src/utils/ratio.ts`) — turns an `ImageRatio` preset into the CSS
  `aspect-ratio` value `Image`'s frame and `Skeleton`'s `media` variant both resolve it to; exported
  so a consumer accepting an `ImageRatio` of their own (`ImageRatio` itself is public) can honour it.
- **`formatDate`** (`src/utils/date.ts`) — the ISO-date formatter behind `ContentCard`'s `date` prop.
  Never throws: a malformed, empty or calendar-invalid value (`'2026-02-30'`) returns `null` rather
  than a fabricated date or a thrown `RangeError`, warning once per bad value in dev.
- **`useSlotPresence`** (`src/composables/useSlotPresence.ts`) — reactive named-slot presence, used
  by every component in this package that branches on a slot (slots are not reactive on their own —
  see the composable's own comment).
- **`useHeadingTag`** (`src/composables/useHeadingTag.ts`), and the shared **`HeadingLevel`** type
  (`2 | 3 | 4 | 5 | 6`) it takes — `headingLevel` → `<component :is>` tag name, factored out of
  `ContentCard`/`FeatureCard`/`ProductCard`/`EmptyState`/`FormLayout`, each of which used to
  redeclare the identical one-line `computed`. `FormLayout`'s own narrower `FormLayoutHeadingLevel`
  (`2 | 3 | 4`) is `Extract<HeadingLevel, 2 | 3 | 4>`, not a separately re-typed union.
- **`roundRatingToHalf` / `ratingStarStates`** (`src/utils/rating.ts`) — `Rating`'s own
  round-to-nearest-half-star and five-star-fill-state rules, for a consumer building a rating
  display (or a custom `Rating` slot) that should round the same way.
- **`initialsFromName`** (`src/utils/avatar.ts`) — `Avatar`'s own initials rule (first + last word's
  first letter, uppercase; a single word keeps its own first two letters), for a consumer's own
  avatar-shaped fallback.
- **`FormLayout`'s `statusMessage` and `focusOnInvalid`, `Form`'s `successMessage`, and
  `FieldBinding`'s `path`** — each named in the deviations below, where the reason is.
- **`Popover`** — an operator addition (2026-09-25) for the private component library's own
  `Popover`/`Dropdown`, which a store migrating onto this package needs a generic equivalent of.
  There is no spec 1 "Popover" section; the visual language is `Select`'s own popup (its rounded
  panel, border, shadow and `animate-eldra-popover-in` entrance) and the behaviour is `usePopover`'s
  — the same registry (`openRegistry`, "only one open at a time" _with_ `Select`/`MultiSelect`/
  `SearchBar` too), `useOverlay` closing rules, `useFloating` positioning (`placement`,
  `matchWidth`), teleport (`body`, or the open native `<dialog>` the trigger sits in) and pointer
  latch that those three controls already share, extracted one level further so a component with no
  listbox of its own — a menu, a filter panel, a dropdown — can use the exact same machinery instead
  of a hand-rolled copy.

  Its `trigger` is not drawn by the component at all: a scoped slot (`{ open, toggle, attrs }`,
  mirroring the private library's own Studio-documented `#trigger="{ triggerAttrs }"` shape) hands
  the consumer everything to spread (`v-bind="attrs"`) onto whatever element they render — `id`,
  `type: 'button'`, `aria-haspopup`, `aria-expanded`, `aria-controls`, a `class` built from
  `classes.trigger`, and the click/pointerdown pair — because a generic popover cannot know whether
  its trigger should be a `<button>`, an `<a>`, or a table row the way `Select`'s always-a-button
  trigger can. The panel itself carries **no default `role`** — deliberately, unlike `Select`'s
  panel, which is always `role="listbox"` because it always is one: a `Popover`'s content could be a
  menu, a listbox, or a plain filter form, and a package-imposed role would be wrong for at least
  two of the three. `Popover`'s own `$attrs` (`inheritAttrs: false`) forward onto the panel instead
  — `<Popover role="menu">` puts `role="menu"` on it directly, the same shape the private library's
  own `Popover` forwards its fallthrough `attrs` onto its content element with — and `ariaLabel`
  (this package's own accessible-name convention) sets `aria-label` there for a panel with no
  visible heading. Opening moves no focus into the panel by default (the private library's own
  `Popover` makes the same `focusOnOpen: false` choice, for the same reason: it has no idea what is
  inside), but `tabRedirect` is always on, since a menu's rows or a filter form's fields are exactly
  the real tab stops that behaviour exists for.

- **`narrowSymbol` on `Price`, and `Price` formatting through `formatCurrency`** — `true` by
  default, the same default `CurrencyInput` already carried, so every currency this package renders
  is written with the currency's **narrow** sign: `"kr 2,800"` under `en-US`/`ISK`, not
  `"ISK 2,800"`; `"$"`, not `"US$"`, in a locale that distinguishes the two. The design spec says
  only that the amount is formatted by `Intl`, which leaves the sign open; a store's own back office
  writes narrow signs, and a price that disagreed with the currency field the operator typed it into
  was the defect worth closing by default rather than by opt-in. Set it to `false` for the wide
  sign; a locale whose two signs are identical (`is-IS` writes `kr.` either way) is unaffected
  either way, and `ProductCard` inherits the prop through its own `Price`.

  `Price` formats every amount through that ported `formatCurrency`, passing
  `currencyFractionDigits(currency, locale)` as **both** the maximum and the minimum fraction
  digits. The maximum keeps a zero-decimal currency integral (`"kr 2,800"`, never `"kr 2,800.4"`)
  and `BHD` at three places; the minimum is why a price reads `"$48.00"` rather than the `"$48"`
  the same formatter gives a currency _field_, which pads nothing because a field shows what
  someone typed. One formatter, two rules, and the caller says which.

- **`revalidating` on `Price`, `StockBadge` and `ProductCard`** — a second, distinct busy state for
  a value that is _already on screen_ while a fresher one is fetched, which the spec's own `loading`
  row does not cover. It exists for prerendered storefronts: a statically built product page or
  collection grid paints the price and the stock line from build-time data, then refreshes only
  those values after load, and the visitor must keep reading the value it already has rather than
  watch it turn back into a skeleton. So the two states are opposites, not degrees of one thing —
  `loading` means _there is no value yet_ (skeleton, nothing to read), `revalidating` means _this
  value is real but may be a moment old_ — and `loading` wins when both are set.

  While it is on, the value keeps its text and its place, dimmed to `--eldra-revalidating-opacity`
  (a shared token, default `0.75`, applied through the `eldra-revalidating` utility — per value part,
  never on the root, because CSS opacity composites and a dimmed root would take the spinner down
  with it); a `1em` spinner — the same shape `Button` draws, from the package's own internal
  `Spinner.vue` — is drawn beside it; the root carries `aria-busy="true"`; and a visually hidden
  `aria-live="polite"` region reads `messages.updatingPrice` / `messages.updatingStock`.

  **The spinner reserves no space at all.** It is a flex item of width `0` whose negative
  inline-start margin cancels, exactly, the gap the root would otherwise put in front of it
  (`-ms-2` against `Price`'s `gap-x-2`, `-ms-1.5` against `StockBadge`'s `gap-1.5`), with the
  circle absolutely positioned inside that zero-width box and overflowing to the right of it. So
  the component's width, its characters and its line breaks are identical with the state on and
  off — a refreshing value never moves the layout around it — while the circle still lands
  immediately after the last amount. (Anchoring it to the root's own box instead, `absolute` +
  `start-full`, looks equivalent and is not: these roots are `inline-flex`, and a flex or grid
  parent stretches that box to the column, which puts the spinner at the far edge of the column
  rather than beside the value.) On `Price` it renders before the `unit` part, which is
  `basis-full` and would otherwise push it onto a third line.

  The cost of that is real and worth stating: the circle is **drawn outside the component's own
  box**, so an ancestor with `overflow: hidden` whose right edge hugs the text will clip it. The
  escape hatch is `classes.spinner` — restyle that part (a static position, a different offset, or
  a real width) for a layout that cannot let it overflow.

  The live region is in the DOM whether or not it has anything to say, and only its text changes: a
  region that arrives already holding its message is announced unreliably, since a screen reader
  takes the region and its content in one pass and has no change to report. For the same reason, a
  page that **hydrates with `revalidating` already `true`** should flip the flag on after mount
  rather than render it on: a region that is already saying "Updating price" when the page first
  paints is part of the initial content, not a change, and nothing announces it.

  `announce` (default `true`) turns that region off per instance — no `aria-live` element is
  rendered at all, while `aria-busy`, the dim and the spinner stay exactly as they are. That is
  what a grid wants: twelve refreshing cards otherwise hold twenty-four polite regions all speaking
  at once, so the page should pass `announce: false` and announce the refresh once itself.

  **The change itself is eased, not just the waiting.** The first default dim here was shallow
  enough to be nearly invisible (`0.9`), and measured on a real prerendered product page it failed
  the thing the state exists for: the amount read as ordinary settled text for the three seconds
  the read took, and then the number simply changed — a visitor who looked away never saw it
  happen, and one who was looking saw it blink. So two things changed together, on an operator
  ruling (2026-10-03):

  - **The dim is deep enough to see** — `0.75`, a quarter of the way out rather than a tenth. That
    is the deepest dim at which every colour these values are drawn in (`text`, `muted`, `accent`,
    `success`, `warning`, `danger`) still clears **3:1** against all three grounds this package
    ships: worst case 3.60:1 on `background`, 3.41:1 on `surface`, 3.17:1 on `surface-strong`. It
    is **below 4.5:1** (1.4.3) for everything but `text`, and that is the trade this default takes
    — for the length of the read, with `aria-busy` set while it lasts. A store that needs 4.5:1
    unbroken raises the token: `0.9` clears it for all six on `background` and on `surface`, and
    `surface-strong` needs `0.94` (at either, the dim is nearly invisible and the spinner carries
    the state on its own). One that wants the state louder lowers it and gives up the 3:1 floor.
    Being a token rather than a number in a class is what makes either direction a one-line
    decision.
  - **A changed value fades in.** `Price`'s amount and compare-at, and `StockBadge`'s status line,
    play a 0 → 1 opacity fade over `--eldra-duration-base` when their formatted text changes
    (`src/utils/valueFade.ts`). **Enter only**: the new value is in the DOM the instant the props
    change — in the same render as `aria-busy`, the dim and the spinner — and fades in from there.
    Nothing fades out, because a leaving half would keep the previous amount on screen for the
    length of the fade, after the component had already stopped saying it was busy. On a price that
    is the one thing not to do: an assistive technology re-reading when `aria-busy` clears would
    read the stale number, and a sighted visitor would watch the old one brighten to full strength
    before vanishing. **Still never a skeleton**: a value on screen stays on screen throughout.

  **It is one element, animated in JavaScript, and that is deliberate.** A Vue `<Transition>` keyed
  on the text cannot do this. `mode="out-in"` renders a placeholder as soon as the key changes and
  brings the new child in on a _later_ render pass, so the DOM's text lags the props by a pass for
  every value change in the package, refresh or not — measured, not assumed: with that shape the
  starter's cart line total still read the old amount a tick after the stepper click, and emptying
  the leave classes did not change it, because the extra pass is the mode. The default mode is no
  better: it keeps the leaving element in the DOM for two animation frames, which is a second copy
  of the value in the accessibility tree. One stable element with its text interpolated normally
  has neither problem, so that is what `ValueText` (internal) is: a bare `<span>` carrying the
  caller's own `data-part` and `class`, with `Element.animate()` played on it after each change.

  Reduced motion is answered twice over — `prefers-reduced-motion: reduce` is checked before the
  animation starts, and the duration is read from `--eldra-duration-base` on the element itself,
  which `tokens.css` zeroes under that same query; either one alone skips the fade entirely, and
  the value still changes instantly. Duration and easing come from the element's computed style
  rather than a literal, so overriding the tokens re-times this animation exactly as it re-times
  every CSS one (the house pattern `AccordionItem`'s panel height already follows;
  `src/utils/cssTiming.ts` is shared by both). The fade sits on an inner span
  (`currentValue`/`compareAtValue`/`labelValue`) while the dim stays on the value part: both are
  `opacity`, and one element cannot animate a property another rule is holding at the token's
  value — composited instead, the span fades 0 → 1 _inside_ the part's dim. Nothing reserves width:
  the amounts are already `tabular-nums`, so a number whose digit count does not change keeps
  exactly the width it had.

  `ProductCard` draws none of this itself: it passes `revalidating` and `announce` to its `Price`
  and `StockBadge`, the two values a refresh actually changes, and the rest of the card (media,
  title, badges, quick add) stays exactly as it was and fully interactive.

  New parts: `spinner` and `srStatus` on `Price` and `StockBadge` — `srStatus`, not `status`,
  because `LoadMore` already owns a visible `status` part and a collection page renders both — plus
  the fade's own value spans, `currentValue`/`compareAtValue` on `Price` and `labelValue` on
  `StockBadge`.

## Deviations

Additions and departures from the design spec, and why.

- **The stretched-link + proxy-focus pattern is factored into `src/components/card/stretchedLink.ts`,
  shared by `ContentCard`, `FeatureCard` and `ProductCard`.** All three spec sections describe the
  identical shape — the card root proxies the ring for a visible title `<a>` that stretches to
  cover the whole card via `after:absolute after:inset-0` — so it is one exported set of class
  strings (`CARD_FOCUS_PROXY`, `STRETCHED_LINK`, `STRETCHED_LINK_OUTLINE`) rather than duplicated
  three times. `ProductCard`'s root layout classes (`flex h-full min-w-56 flex-col`) sit alongside
  `CARD_FOCUS_PROXY` rather than replacing any part of it. The title link uses `outline-none`, not
  `Rating.vue`'s `outline-hidden`: `outline-hidden` stays visible under forced colours by design,
  which here would draw a second, text-sized ring beside `eldra-focus-proxy`'s own card-wide one —
  the spec's own acceptance criterion for the sibling Product card rules that out ("the link shows
  no separate ring"). See `stretchedLink.ts`'s own comment for the rest of the reasoning.
- **`ContentCard`'s `date` prop is formatted by `src/utils/date.ts#formatDate`, not a literal
  `"12 Sep 2026"` string.** The spec's own example is one locale's rendering (`Intl.DateTimeFormat`
  with `day: 'numeric', month: 'short', year: 'numeric'`), not a fixed format the component
  reproduces regardless of locale — `en-US` reads "Sep 12, 2026", `is-IS` reads "12. sep. 2026". The
  ISO string is parsed by its own calendar components rather than handed to `new Date(iso)`
  directly, because that constructor reads a date-only string as UTC midnight and a locale west of
  UTC would format it a calendar day early.
- **`Skeleton`'s `width` prop sizes the root, not the shape's own literal width.** The spec's
  Properties table lists `width` as the text/title shape's own CSS width ("Default 100% (title
  60%)"). Read that literally, an override would have to be applied to a percentage-wide `line`
  directly, which does nothing to fix the same trap `Price`'s own loading skeleton once had: a
  percentage width inside a shrink-to-fit ancestor (`inline-flex`/`inline-block`) collapses to
  nothing regardless of
  which element carries the percentage, because the ancestor itself has no definite width to
  resolve it against. `width` is the escape hatch for exactly that case instead: it sets the root's
  own width (replacing its default `w-full`) to a literal, always-definite value, and every shape
  inside then renders at that full (now definite) width rather than its own default fraction of it
  — so `<Skeleton width="12rem" variant="title" />` still renders a 12rem-wide bar, just sized from
  the root down rather than the shape up, and works inside a shrink-to-fit container the literal
  reading would not fix.
- **`Skeleton`'s `btn` variant takes `--eldra-control-height` (2.5rem), not the spec's literal
  2.75rem.** The Sizes table gives `btn` a fixed `2.75rem` — the same figure as `target-touch`,
  which `Button`'s own `md` size only grows to below a 48rem **container** (a container query this
  placeholder does not replicate). Reserving the shape that actually needs holding in the common,
  non-narrow case — a resting `Button`'s own height — means reading its `control-h` utility
  instead, the same one `Button`'s `md` size uses.
- **`Skeleton`'s region-level `busyLabel` (spec :3340, default `"Loading products…"`) is a real
  `busyLabel?: string | null` prop** (final review, plan 2), not deferred. With one given, the root
  becomes the live busy region itself (`role="status"`, `aria-busy="true"`, `aria-label`, every
  shape individually `aria-hidden`); with none (the default), the root stays plain `aria-hidden`, as
  it always was — the right shape for a `Skeleton` composed _inside_ another component's own
  already-named busy region (`ProductCard`'s loading root already carries `role="group"
aria-busy aria-label="Loading product"`, `ContentCard`'s loading root now matches it with
  `messages.loading`). `FeatureCard` has no `loading` variant of its own, so nothing there composes
  `Skeleton` at all.
- **`Container`'s three finite widths are their own `eldra-container-{narrow,content,wide}`
  utilities, not Tailwind's auto-generated `max-w-narrow`/`-content`/`-wide`** (package bug, fixed
  2026-09-27). The spec's own numbers (40rem/64rem/80rem) are also exactly the container-query
  breakpoint scale this package declares `@narrow:`/`@content:`/`@wide:` against — `tailwind.css`'s
  `--container-{narrow,content,wide}` theme keys serve both purposes, which is normally free
  (Tailwind reads one scale for both the width utilities and the breakpoint variants). It is not
  free here: a `@container` condition cannot reference a custom property, so those three keys have
  to hold a literal length, not the `var(--eldra-container-*)` indirection every other `@theme`
  value in this file uses — and shipped with exactly that `var()`, which silently compiled every
  `@narrow:`/`@content:`/`@wide:` variant in the package to nothing at all (`Container`'s own
  `@content:` desktop gutter, and every starter block's `@content:` layout, never engaged). Making
  the three keys literal fixes the breakpoints but would otherwise cost `max-w-content` and its
  siblings their runtime overridability — the whole point of `--eldra-container-*` existing as a
  variable in `tokens.css` in the first place — so `Container.vue` reads three small dedicated
  utilities instead, each a one-line `max-width: var(--eldra-container-*)`, leaving the two scales
  (breakpoints and widths) sharing the same three numbers without sharing the same CSS declaration.
  See `tailwind.css`'s own `@theme` comment for the full mechanism, and
  `src/__tests__/containerQueryLiterals.spec.ts` /
  `src/__tests__/containerQueryBreakpoints.spec.ts` for the guards.
- **`Section` marks every background, including `none`, with a new `data-section-bg` attribute**
  (distinct from `data-section`, which stays reserved for the `primary`/`accent` colour-inversion
  signal `Button`/`Link`/`Price`/`Rating` already read) — an implementation detail beyond the
  spec's own anatomy, needed for the spec's Do/Don't rule ("alternate `none` and `surface` between
  neighbouring blocks instead of adding divider lines"). An unlayered `tailwind.css` rule
  (`[data-section-bg=X] + [data-section-bg=X]`, five pairs — CSS has no same-value-as-previous-
  sibling selector) zeroes a `Section`'s own top padding whenever the **previous** sibling
  `Section` shares its background, and wins over _any_ layered `pt-*`/`py-*` class regardless of
  specificity or source order (CSS Cascade Layers) — not only `spacing`'s own default, but a
  consumer's `classes.root: 'pt-12'` too, since a class from any source still compiles into the
  same layered `@layer utilities`. The escape hatch is one of the two things this rule does not
  touch: give the two `Section`s different `background` values (the rule only fires on a match), or
  reach for an unlayered override of your own (`!pt-12`, which Tailwind never puts in a layer).
- **`Section` provides a new `SECTION_KEY` context and warns, in development, when a `Section`
  mounts inside another one** — the spec's own text says "sections are never nested inside
  another section" but names no mechanism for catching a violation; this package's existing
  dev-only-warning convention (`Button`'s `iconOnly`/`label` warnings) is reused rather than
  invented fresh, and a warning, not a thrown error, so a misuse degrades instead of crashing a
  live storefront.
- **`Section.ariaLabel`/`ChipGroup.ariaLabel`, not `label`** (final review, plan 2). Both shipped
  as `label` first; see the Customisation section's "`ariaLabel` is always an accessible name" rule
  above for why that collides with every other `label` in this package. Caught by the starter's own
  `[...slug].vue`, whose not-found `Section` passed `:label="t('notFound.title')"` two lines above a
  visible `<h1>` with the identical text — an `aria-label` duplicating a visible heading is exactly
  the case `labelledBy` exists for. Fixed there by giving the `<h1>` an `id` and switching the
  `Section` to `labelled-by` pointing at it, rather than by renaming the prop and leaving the
  duplication in place.
- **Active buttons scale to 98% instead of moving down 1px** (operator decision, 2026-09-25). The
  spec's Button States table gives the pressed row "moves down 1px", and that is what shipped: an
  `active:` one-pixel downward translate utility. A 1px translate is below the threshold at which a
  press reads as tactile — at the sizes the spec gives, it looks like a rendering artefact rather
  than a button being pushed. The whole control now shrinks to 98% from its own centre over `duration-fast`
  (roughly half the ~4% the private Eldra library's button uses), on every variant but `link`,
  which the spec's own link row gives no press movement either, and never on a disabled or loading
  button. Mechanically it is the independent `scale` property, which is in `eldra-focus`'s
  transition list beside `translate`; under `prefers-reduced-motion: reduce` the button does not
  scale **at all** (`motion-reduce:active:scale-100`), because removing the transition alone would
  leave an instant 2% jump, which is still motion.
- **One popover entrance for all three popovers, and it does not slide** (operator request,
  2026-09-25). The spec's Select section describes the opening as a fade plus a 0.25rem slide plus
  a _vertical_ scale from 98%; `SearchBar`'s results panel had no entrance at all. All three —
  `Select`, `MultiSelect`, `SearchBar` — now play the same one: opacity 0 → 1 and a **uniform**
  scale 0.98 → 1 over `duration-base` with `ease-out`, growing from the corner the panel is
  anchored by (`--eldra-popover-origin`: `top left` below the control, `bottom left` above it).
  The slide made the panel read as a separate object arriving from somewhere rather than as the
  control opening out, and a `scaleY`-only entrance visibly stretches the type inside the panel
  while it plays. `--eldra-popover-slide` is gone with it. Closing is instant, as the spec says,
  and under reduced motion the panel simply appears (`--eldra-duration-base` is `0ms` there).
- **`Input`, `SearchBar` and `UnitInput` share one field recipe.** The spec describes one field
  box and three controls draw it; `SearchBar` used to hold a hand-copied duplicate of `Input`'s
  classes, and the copy had drifted — it had lost the `--eldra-input-radius` variable and carried
  its own spelling of the type-size rules, which is what an operator review saw as a search field
  that "does not behave like the regular input fields". The recipes now live in
  `src/components/input/classes.ts` and all three import them; a component may add its own deltas
  (`SearchBar`'s pill radius and its two sizes, `UnitInput`'s drag handle) and never a
  second copy of the box. The class strings are internal — a consumer restyles through tokens,
  per-component variables and `classes`, never by importing them.
- **`QuantityStepper` filters typing with `beforeinput`.** It cannot be a native
  `<input type="number">` (see its own deviation below), which also means it does not get the
  browser's own numeric filtering — an operator review
  found you could type anything into a quantity field, and it was only corrected on blur.
  `filterNumericBeforeInput` cancels an insertion that would put something non-numeric in the
  field, letting deletions, undo and redo through untouched. **A paste is sanitised rather than
  refused**: pasting `12ab3` inserts `123`, because someone who copied a number with a stray label
  attached meant the number, and refusing the whole paste is a dead end with no message.

  **The locale's group separator is refused on this whole-number field.** The same character means
  different things in different locales: `1,5` reads as "one thousand five" to the parser and as
  "one point five" to an Icelandic customer, and the field committed 15 while showing something
  that looked like 1.5. Refused, that character never reaches the field, so the text can never say
  one thing while the value says another. The control shows an **ungrouped** editing string while
  focused (`1,000` becomes `1000`), which is what makes refusing it free: there is never a
  separator in the field to type after. `filterNumericBeforeInput` still accepts it on a
  decimal field, for a consumer building one — someone pasting `1,234.50` means 1234.5.

  **`UnitInput` and `CurrencyInput` do the opposite, on purpose** (see below): they let a
  non-numeric keystroke land and strip it on the reformat.

- **`UnitInput` and `CurrencyInput` are ports, and the behaviour is the private library's**
  (operator ruling, 2026-09-25). "The currency input, unit input should function identical to how
  they do in the private ui." The field is formatted **while it is typed into** — there is no
  editing mode and no focus-dependent text — because that is what a merchant already knows these
  fields to do; a field that showed a plain number under the caret and a formatted one on blur was
  rejected. Everything that follows from it (the caret mapped by numeric content, the arrow/
  backspace/delete rules that step over separators and never eat the symbol, `,` and `.` both
  inserting the locale's decimal, the empty-until-blur rule, the controlled reconciliation, the
  drag handle) is ported case for case, and
  `src/components/{unit-input,currency-input}/__tests__/` carries the private specs' own cases
  under their own names.

  **Typing is not filtered in these two.** A non-numeric keystroke lands and the reformat removes
  it — the opposite of `QuantityStepper`, and deliberate: this field's own text is full of
  characters that are not digits (a symbol, group separators, a literal), so a filter judging the
  resulting value would have to understand the formatted string it is judging. Pasting `12ab3`
  leaves `123` either way.

  **Four deliberate departures from the private components**, each because the private behaviour is
  wrong here rather than merely different:

  1. **A typed decimal separator is put back inside the number, not appended to the string.** The
     private component appends it, which is right for `$1,234.` and wrong for every suffix-symbol
     format — it produced `1,234 km.` and `1.234 kr.,`.
  2. **`CurrencyInput` forwards only the props that were actually passed.** The private wrapper
     spreads all of them, so `UnitInput` sees a bound `modelValue` on a field nobody bound and the
     reconciliation clears an uncontrolled field a tick after every keystroke.
  3. **Double-click is wired to the native `dblclick` event.** The private wrapper listens for a
     `doubleClick` that nothing emits, so selecting the digits by double-click never worked there.
  4. **Read-only and disabled fields do nothing at all** — no editing, no caret placement, no
     stepping, no drag, no clear button. The private component has no read-only state.

  And the package conventions on top of the port: the `data-part` anatomy and `classes`, the three
  field sizes, the `FieldWrapper` context (`id`, `invalid`, `required`, composed `describedBy`),
  `locale` from a prop or `provideEldraUiLocale()` rather than from vue-i18n, and the form value
  below.

- **`UnitInput` draws its own `label` only when nothing above it names the field.** The prop is
  kept for parity with the private component, whose own wrapper draws a label; inside a
  `FieldWrapper` the wrapper owns the label, and a second one would say it twice. That is also why
  the field box is one element deeper than `Input`'s: the `field` part is what the leading icon and
  the suffix row are positioned against, so a label above them cannot shift them.
- **`UnitInput` posts the raw number through a hidden input.** `name` renders
  `<input type="hidden" :name :value>` carrying `1234.5`, and the visible control has no `name` of
  its own, so exactly one value is posted and it is never the locale string — `"1.234,5"` would be
  read as `1.2345` by almost every server. (The private component posts the formatted string,
  because it has no hidden input; this package already made the other choice for its numeric
  fields, and a form value that parses differently on every server is not a parity worth keeping.)
- **`UnitInput` has no `role="spinbutton"`, unlike `QuantityStepper`.** A spinbutton's value space
  is bounded by `aria-valuemin`/`-valuemax`, and this control's `max` defaults to the largest safe
  integer; a spinbutton with no meaningful bounds announces less than the plain text field a screen
  reader otherwise reads. `ArrowUp`/`ArrowDown` still step by `step`.
- **The drag handle is out of the accessible tree** (`aria-hidden`, `tabindex="-1"`, pointer only).
  Every value it can reach is reachable with `ArrowUp`/`ArrowDown` on the field itself, so
  announcing a second control for the same job would only add a stop to the keyboard path.
- **The tick in a `Checkbox` and in a multi-select option is Tabler's check, not the spec's literal
  ink box** (operator finding, 2026-09-25). The spec's Sizes tables give the tick as
  0.3125 × 0.625rem (and 0.25 × 0.5rem in an option row) — a 2 : 1 box — and drawn at exactly that
  it reads as a shallow V rather than as a tick. Both marks are now Tabler's `check` geometry
  (`M5 12l5 5l10 -10` over 24 units, ≈3 : 2), scaled to fit each box with the spec's 2px stroke and
  round caps, centred. The widths are unchanged, so the marks still fill the boxes they sit in; the
  indeterminate dash is untouched.
- **A `Select` or `MultiSelect` trigger shows the focus ring while its popover is open** (operator
  request). A trigger opened with the pointer is focused but not `:focus-visible`, so the ring did
  not show, and an open popover hung off a control with nothing saying it was the one the keyboard
  was about to act on. `eldra-focus-open` is a modifier of `eldra-focus` in the same shape as
  `eldra-focus-always` and `eldra-focus-proxy` — it carries no ring of its own, it only turns on the
  one already there — keyed to the element's own `aria-expanded="true"`, so nothing has to be kept
  in sync and closing fades the ring back out over the transition `eldra-focus` already owns. The
  `SearchBar` never needed it: its trigger is a text field, and text fields carry
  `eldra-focus-always`.
- **The focus ring fades in at full size rather than growing.** The design spec's Focus ring
  section says the ring and its infill "grow from 0 to 2px over `duration-base`", and that is what
  this package shipped first: an animated `outline-width` and `box-shadow` spread. A browser paints
  both at whole device pixels, so a 2px growth has only two or three distinct frames however long
  the transition runs — it reads as a 1 fps stagger, not as motion, and an operator review caught
  it on every control in Storybook. The ring is now drawn at its full 2px + 2px geometry at all
  times and its **opacity** is what animates, over the same `duration-base` with the same
  `ease-out`. Measured in Chromium: 13 distinct alpha values across the 200ms, against 2–3 before.
  The end state — the thing every contrast requirement in the spec is about — is byte-identical,
  and nothing else about the indicator changes.

  Mechanically: `--eldra-focus-alpha` is registered with `@property` (`syntax: '<number>'`) so the
  engine can interpolate it, and both ring colours are
  `color-mix(in srgb, transparent, <role> calc(var(--eldra-focus-alpha) * 100%))`. Two fallbacks
  keep it safe rather than clever — an engine without `color-mix` gets the whole ring at once
  through an `@supports not` rule, an engine without `@property` switches the alpha 0 → 1 with no
  fade, and forced-colours mode still gets a static `outline` in the system `Highlight` colour
  (`box-shadow` is dropped there by the UA). In every one of those paths the ring is present at
  full size; only the fade is lost, which is exactly what `prefers-reduced-motion` asks for anyway.

- **`Button` `text-button-{sm,md,lg}` utilities, and the `lg` font size as a per-component
  variable.** The spec's Sizes table gives `lg` a 1.0625rem font, between `body` (1rem) and
  `body-lg` (1.125rem) with no token of its own in `tokens.json`. Writing `text-[1.0625rem]` in the
  component would put a literal in a component class, which this package's own rule forbids, so
  `tailwind.css` declares the three `text-button-*` utilities instead —
  `var(--eldra-button-font-size-lg, 1.0625rem)` for the one size with no token, which also makes it
  a documented customisation point.
- **`Button` icon-only `md` does not grow to `target-touch`.** The Sizes table gives the icon-only
  row its own explicit heights ("square: width = height of its size") with no narrow-container
  growth, unlike the labelled `md` row. 2.5rem already clears the spec's 1.5rem touch-target floor,
  so nothing is lost.
- **`Button` `secondary` on an accent section gets the same 12% `currentColor` hover as
  `outline`.** The spec says the secondary button there "becomes transparent with a `currentColor`
  border" and stops; since it then _is_ an outline button in every other respect, it takes the
  outline variant's hover fill rather than no hover feedback at all.
- **`Button`'s `as` takes a router-link component, not only a tag name** — the same contract as
  `Link`'s, and the spec's "Customisation layers" §5 lists `as` on `Button`. It applies to the link
  form only: with `href` set and `as` a component (`NuxtLink`, `RouterLink`), the component receives
  the destination as `to`, matching those components' own prop contract; with `as` a plain string it
  stays a tag (or custom element) that still receives `href`. With no `href` there is no destination
  to route, so `as` is ignored and this is a `<button>` — `Button` still chooses `<button>` or `<a>`
  from `href` alone, per the spec's own Accessibility note. Everything else is unchanged: icon-only
  and loading naming, `aria-pressed`'s link rule, and the disabled-link semantics below all behave
  exactly as they do on a native `<a>`.
- **A disabled `Button` with a component `as` renders a plain `<a href>`, not the router link.**
  `Button` stops a disabled click with `preventDefault()`, which is enough for a native `<a>`,
  whose navigation _is_ the default action. A `RouterLink`/`NuxtLink` does not navigate by a default
  action: it installs its own click listener on its own root, which runs before the handler passed
  down through fall-through attributes — so the route change had already happened by the time
  `preventDefault()` ran, and a disabled call to action navigated. While disabled, the element is
  therefore the plain anchor for the same destination (a `<span>` if there is somehow no `href`,
  which `href`-implies-link makes unreachable today). Everything else is unchanged — the `href`
  stays so it keeps `role="link"`, with `aria-disabled="true"` and `tabindex="-1"` — and it routes
  again the moment it is enabled, with no change from the caller.
- **`Button` disabled link button keeps its `href`.** A disabled `<a>` that also drops `href`
  becomes a generic element and stops exposing `role="link"` — a screen reader stops naming what it
  is at the exact moment it needs to say "unavailable". `href` stays, and `aria-disabled="true"`,
  `tabindex="-1"` and a `preventDefault()` on click make it inert instead.
- **`Button` `aria-pressed`.** Never emitted on a link button (`role="link"` has no pressed state,
  and a dev warning says why). On any variant but `outline`, `pressed` still sets the attribute (a
  screen reader must hear the state) but the spec's states table gives the toggle _fill_ to
  `outline` alone — a pressed `primary`/`secondary`/`ghost`/`danger` button looks identical whether
  it is pressed or not, which is the trade-off worth knowing, not a bug.
- **`Button` never grows to the touch target; it always matches the input beside it** (operator
  addition, 2026-09-25: "the height of the button is a bit taller than of the inputs… make all
  scales match so sm button = sm input, base button = base input, large input = large button").
  The spec's "Actions and forms" → Compact controls says "Controls keep their height on mobile.
  Only primary action buttons grow to `target-touch` (2.75rem)" below a 48rem container. Every
  sized control in this package already shared the `control-h-sm`/`control-h`/`control-h-lg`
  tokens except `Button`, whose `md` `primary` variant grew to 2.75rem inside any `@container`
  narrower than 48rem (`ButtonGroup`, `FormLayout`, the theme's `Section`) — so a primary button
  next to an `md` input rendered taller than it, which is what the operator saw. That growth is
  removed: a Button stays on the shared control-height scale at every variant and size, in every
  container. The WCAG 2.5.8 24px minimum is still met at every size (`sm` is 2rem = 32px).
  `--eldra-target-touch` and the `target-touch` utility are unchanged and still available for a
  future component.
- **`Link` underlines every variant at rest, including `standalone` — operator direction,
  2026-09-26: "I would preferably have all link elements also have underline by default — that
  goes for breadcrumbs as well, as that is the recommended WCAG 2.2 standard" (F73, 1.4.1).** This
  overrides the design spec's own text for the standalone variant ("No underline at rest ... bold
  weight + arrow identify it"), which stays true only for the new `underline: false` opt-out. A
  `Link` with `underline` at its default `true` gets the spec's inline/external recipe (1px at 55%
  of the text colour, thickening to 2px at full colour on hover, held through `:active`) on every
  variant; `underline: false` restores the old standalone-only shape — no underline at rest, 1px
  appearing on hover, 2px on `:active` — for a navigation bar whose own design removes it. The same
  ruling reaches three other places that render a link-shaped affordance without going through
  `Link` itself, all updated alongside it: `Breadcrumb`'s trail links (`linkClass` — see that
  component's own Deviations entry below) and the stretched title links `ContentCard`, `FeatureCard`
  and `ProductCard` build from `stretchedLink.ts` (underlined at rest now, thickening on hover via
  the card root's `group`, not only on hover as the spec's own States rows read — see
  `stretchedLink.ts`'s own comment and each component's `titleLinkClass`/`linkClass`). `LogoItem`'s
  link and `Rating`'s linked variant were reviewed and intentionally left as they were — see the
  `LogoItem` Deviations entry above for why.
- **`Link` has no `externalIcon` prop and no `@tabler/icons-vue` runtime dependency.** The arrow and
  external-link icons are both fixed by the spec's anatomy, not swappable the way `Button`'s
  `iconLeft`/`iconRight` are, so both are inline `<svg>`s using Tabler's own published path data —
  the same shape as `Button`'s spinner — keeping `@tabler/icons-vue` a devDependency only, matching
  this package's documented runtime dependencies (no icon library among them).
- **`Link`'s `rel` is `"noopener noreferrer"`**, one step past the spec text's own `rel="noopener"`
  (every section of the spec that mentions it says just `noopener`) — the more defensive value, and
  the resolution given for this exact ambiguity when the component was built.
- **`Link`'s `as` accepts a router-link component, not only a tag name.** With `href` set and `as` a
  component (`NuxtLink`, `RouterLink`), the component receives `to` instead of `href`, matching
  those components' own prop contract; with `as` a plain string it stays a tag (or custom element)
  that still receives `href`. With no `href` at all, `as` is ignored and the component always
  renders a plain `<span>` — there is no destination to route through.
- **`Input`'s mobile 1rem override applies to `md` only.** The shared "Actions and forms" rule
  states it without qualification, but the spec's own Sizes table marks it only on the `md` row
  (`sm` stays 0.875rem, `lg` is already 1rem) — the more specific statement wins. Consequence worth
  knowing: an `sm` `Input` still zooms on focus on iOS, because 0.875rem is under the 16px browsers
  use as the no-zoom threshold.
- **`Input`'s clear button is 1.5rem on `sm`, not the spec's 2rem.** The spec fixes the trailing
  action's size in the `md` row only ("2rem square at 0.25rem"); a 2rem button does not fit a 2rem
  `sm` field with a 0.25rem inset, so `sm` uses 1.5rem — still above the 2.5.8 touch-target minimum
  — with matching end padding. `md` and `lg` keep the spec's 2rem.
- **`Input`'s `suffix` slot and the clear button share one end-anchored row**, `data-part="suffix"`,
  rather than two independently positioned elements. This keeps both on one row at any size and
  gives the keyboard table's "`Tab` reaches the clear button next" order for free, since the row
  follows the input in DOM order. One rough edge: the input's end padding is the spec's 2.5rem
  whether one trailing item or two is present, so a wide `suffix` plus the clear button can let a
  long value run underneath — measuring the slot would need JavaScript and is not in the spec.
- **`Input`'s `clearable`/`invalid`/`required`/`describedBy` default to `undefined`, not `false`.**
  They fall back to a `FieldWrapper`'s context when there is one, and `false` there would be an
  answer rather than "no opinion". (`describedBy` **composes** with the context rather than
  replacing it — see [Fields](#fields-the-context-a-fieldwrapper-provides).) `readonly` and `disabled` have no context source and default to
  `false` as usual. The clear button is additionally hidden on a disabled or read-only field.
- **`Textarea` has no `help`/slot forwarding into a `FieldWrapper`'s foot row.** `FieldWrapper` owns
  its _own_, independent `foot`/`counter` parts (see its Deviation below); `Textarea`'s own
  `foot`/`counter` exist purely for standalone use, matching `Input`'s precedent of being fully
  functional without a wrapper. A consumer composing `FieldWrapper` + `Textarea` uses one counter or
  the other, never both.
- **`Textarea`'s `hardLimit` sets native `maxlength` only when `hardLimit` is true**, never merely
  because `maxLength` is present — `counter` and `hardLimit` are independent props, and the spec's
  documented default lets typing continue past a soft `counter` limit.
- **`FormLayout` `statusMessage` and its status region.** The spec's Form layout States table ends
  with "Success: replace the form with a confirmation message (newsletter) or navigate (checkout),
  **and announce it in a polite live region**", and its acceptance criteria repeat it — but the
  properties table has nothing to announce _with_. So `FormLayout` always renders a visually hidden
  `role="status"` / `aria-live="polite"` paragraph (`data-part="status"`), fed by a
  `statusMessage?: string` prop. Always in the DOM, because a live region added to the page at the
  same moment as its text is not reliably announced; empty until there is something to say. The
  _visible_ confirmation is still the page's job.
- **`FormLayout` `headingLevel`.** The spec calls the form's heading "h4 style", which names the
  type style (1.125rem, 600), not the outline level. The element is an `<h2>` by default — the
  level a form's own title takes under a page's `<h1>` — and `headingLevel?: 2 | 3 | 4` lets a form
  nested under a page's own `<h3>` avoid skipping a level. The type style never changes.
- **`FieldWrapper` `aria-describedby` order.** The spec writes
  `aria-describedby="<error-id> <help-id> <counter-id>"`; only the ids that actually render are
  emitted, so a field with no help never points at an element that is not there.
- **`FieldWrapper` slots are content.** `<template #error>` and `<template #help>` are richer ways
  of writing the `error` and `help` props (a message with a link in it, say), so a field with an
  `error` _slot_ is invalid and linked exactly as one with the prop is.
- **`Checkbox` `describedBy`.** The spec's Checkbox property table has no way to point at an
  error, but its Accessibility notes require one ("Required consent: `required`,
  `aria-invalid="true"` and `aria-describedby` pointing to an error that says what to do"). So
  `Checkbox` takes `describedBy?: string`, exactly as `Input` and `Textarea` do, and composes it
  with a `FieldWrapper`'s context when there is one (own id first — see
  [Fields](#fields-the-context-a-fieldwrapper-provides)).
- **`Checkbox`'s hint is part of the accessible name.** The spec's anatomy puts the hint "inside
  the label", and a `<label>`'s whole text is the control's name — so a box with a hint is
  announced as "Washed linen Pre-softened, will not shrink further". That is the spec's own
  structure, kept rather than swapped for an `aria-describedby` that would read the same words a
  beat later. It is also what makes the hint part of the click target.
- **`CheckboxGroup`'s error is the group's, not each option's.** `error` puts `aria-invalid="true"`
  and the `aria-describedby` link on the `<fieldset>`; the individual boxes keep their ordinary
  boundary. The spec's own 2px `danger` box is written against the **required consent** case (a
  single `Checkbox` with `invalid`), and repeating "invalid" on every one of five options is noise
  rather than information. This matches `FieldWrapper`'s `group` variant, which reads the same way.
- **A `Checkbox` inside a `FieldWrapper` drops its own `<label>`.** A `Checkbox` is normally a
  `<label>` wrapping its box and text, which is what makes the whole row the click target. A plain
  `FieldWrapper` renders a `<label for>` naming the same control, and one control with two labels
  is `form-field-multiple-labels` and an accessible name assembled out of both — so the box reads
  `FieldContext.labelsControl` and renders a `<span>` root instead, letting the wrapper's label
  name it. The drawn box stays clickable because the control covers it rather than being `sr-only`
  in a corner of it. A box with an `id` of its own keeps its label either way: the wrapper's `for`
  can no longer reach it.
- **The spec's "Single consent" variant is `<FieldWrapper group>`.** The consent sentence belongs
  _beside_ the box, as its own label — so the wrapper must not be the thing labelling it. `group`
  gives a `<fieldset>` named by a `<legend>`, which labels nothing in particular, and contributes
  the error row and the `aria-describedby`/`aria-invalid` wiring. A control inside a group also
  leaves the context `id` alone, because that id is the fieldset's own.
- **A `CheckboxGroup` is not put inside a `FieldWrapper` at all.** It draws its own `<fieldset>`
  and `<legend>` — the spec's group anatomy — so a `FieldWrapper` with `group` set around it nests
  a second fieldset and legend around the first. Use the group on its own.
- **An invalid box that is checked keeps its `primary` fill.** The spec's States table gives the
  error row a `background` fill, but that row describes the _unchecked_ required-consent box. The
  mark is `primary-contrast`, so keeping `background` under a tick would draw the tick in the
  page's own colour and lose it — and "checked differs by fill and tick shape, not only colour"
  has to stay true in every state. An invalid marked box is `primary` fill plus the 2px `danger`
  boundary.
- **`RadioGroup`'s error reaches the radios, unlike `CheckboxGroup`'s.** The spec's Radio group
  property table says `error` "sets `aria-invalid="true"` on the radios" (plural) — unlike
  `CheckboxGroup`, whose own error stays on the `<fieldset>` alone (see the `CheckboxGroup`
  deviation above). Both are followed as written: `RadioGroup`'s `aria-describedby` still links the
  fieldset to the message, and `aria-invalid` is additionally set on every radio.
- **`RadioGroup`'s `size` is plain-layout only.** The spec's own property table scopes it: "Radio
  1.125rem or 1.5rem (**plain layouts**)". A card's radio is always the `md` circle, whichever size
  the caller asked for.
- **The radio circle reuses `Checkbox`'s border-width utilities.** The spec gives it the identical
  numbers (1.5px, 2px in error) as the Checkbox box, so `eldra-checkbox-border`/`-invalid` are
  shared rather than duplicated as `eldra-radio-*`. The **card** itself is a different element with
  its own 1px number, so it gets `eldra-radio-card-border` of its own.
- **A card's selected boundary is a real border plus an inset line**, the same technique
  `eldra-field-invalid` uses for a field's error state: the spec spells it out ("2px `primary` (1px
  border + 1px inset line)"), so growing the real border to 2px — which would shift the card's
  neighbours — is not what it asks for. `eldra-radio-card-selected` reads
  `--eldra-radio-card-selected-color` so the same utility draws the `danger` version too, for a
  selected option that is also in the group's error (no dedicated spec row; read the same way an
  invalid checked `Checkbox` is — see that deviation above).
- **`RadioGroup`'s `label`, `hint` and `meta` are scoped slots as well as `option` fields**
  (`#label="{ option }"`, and so on), since the group is built from a data array rather than
  written-out children — richer content than plain text needs somewhere to go.
- **`Switch` inside a `FieldWrapper`.** The spec never discusses a Switch inside a field wrapper at
  all (a Switch commits immediately; it is not submitted with a form), but the task named this
  wiring explicitly. It mirrors `Checkbox`'s `labelsControl`: a plain wrapper's `<label for>` names
  the button, so the switch drops its own `label` part and takes the wrapper's id. Unlike
  `Checkbox`, the root element never changes tag — it is always the `<button>` — only the inner
  label `<span>` is skipped, so the wrapper's visible text is not rendered twice.
- **`Switch`'s description is `aria-hidden` inside the button, not a sibling.** The spec's anatomy
  diagram draws the description on its own line below the track, with an arrow to
  "`← description (aria-describedby)`", and its numbered list says the button holds "the track and
  the label" — label only. So the description renders inside the button's own content (which is
  what lets a two-column CSS grid, the same shape `Checkbox` uses, put it directly under the label
  for free) but is marked `aria-hidden="true"`, keeping it out of the button's accessible _name_
  while `aria-describedby` still exposes it as the _description_ — browsers read an
  `aria-describedby` target regardless of `aria-hidden` on that target, the standard technique for
  a description that must not double as the name.
- **`Switch`'s hidden mirror `<input type="checkbox">` cannot live inside the button.** `<button>`'s
  content model forbids interactive descendants, and an `<input>` is interactive content
  regardless of the `hidden` attribute (that attribute doesn't change what category an element
  belongs to). So the component's template has two top-level nodes — the button and the hidden
  input as its sibling — a plain Vue 3 fragment, not a new wrapping element.
- **`Switch`'s track and thumb each carry their own transition.** The spec's Behaviour & motion
  section asks for both: "The thumb slides _and the track fills_ over `duration-fast` with
  `ease-out`." Neither element carries `eldra-focus` (that sits on the button), so — exactly like
  Link's arrow — each may carry its own `transition-*`/`duration-fast` utility with a
  `motion-reduce:transition-none` fallback.
- **`Select` is `modelValue`, not `value`.** The spec's property table names the two-way value
  `value`; every other control in this package takes `modelValue` with `update:modelValue`, which
  is what `v-model` binds, so `Select` matches them. The spec's own `change` and `clear` events are
  emitted exactly as written, alongside `open`, `close` and `search`.
- **`Select`'s `optionIcon` part.** The spec's anatomy numbers the parts and then describes an
  option's contents in prose ("swatch, icon, label + hint, meta, check"), so the icon has no
  numbered name. It is a part all the same, and the _trigger_ reuses `optionSwatch` and
  `optionIcon` for the chosen option's mark — "an option's swatch" is styled once wherever it
  appears, rather than once in the list and again in the trigger.
- **`Select`'s empty state is a sibling of the listbox, not a child.** A `role="listbox"` may own
  only `option` and `group` children, so "No matches for “…”" inside one is an
  `aria-required-children` violation. The listbox itself still renders when nothing matches (an
  empty one is merely "needs review"), because `aria-controls` is a _required_ property of
  `role="combobox"` and needs something real to point at while the popup is showing. The trigger
  carries `aria-controls` when it is closed too, as ARIA 1.2 asks; axe treats a collapsed
  combobox's reference to a not-yet-rendered popup as "needs review", not a violation.
- **`Select`'s option rows carry a forced-colours boundary.** The spec draws the active row as a
  `surface-strong` fill and the selected row as weight 600 plus a check. Forced-colours mode
  replaces every fill and flattens the weight, so the two utilities `eldra-select-option-active`
  (a 2px `Highlight` inset outline) and `eldra-select-option-selected` (a 1px `CanvasText` one)
  apply _only_ there. On a row that is both, the active outline wins — selection is still carried
  by the check mark beside it.
- **`Select`'s `noMatchesFor` message.** The spec asks for the empty state to read
  "No matches for “teal”" — the query is part of the string — and the message catalogue had only
  `noResults`. Both are used: `noResults` with no query, `noMatchesFor(query)` with one.
- **`Select`'s clear button is named `aria-label` + `aria-labelledby`.** The spec wants
  "Clear Country", and the component does not know the label's text — only its id. So the button
  carries `aria-label="Clear"` and, inside a `FieldWrapper`, an `aria-labelledby` of
  `"<its own id> <the label's id>"`, which the platform resolves to "Clear Country". On its own it
  keeps the plain `aria-label`.
- **`Select` distinguishes a label's forwarded click from a real one.** "Clicking the Field
  wrapper's label focuses the trigger (it doesn't open it)" — but a `<label for>` naming a
  `<button>` forwards its click to it, and a forwarded click is otherwise indistinguishable from a
  real one. The trigger therefore opens only for a click with a pointer press behind it (or a
  non-zero `detail`) — a press that ends anywhere but the trigger releases the latch, so a drag off
  the control cannot arm the next click — and focuses without opening otherwise. The cost: a programmatic
  `element.click()` focuses rather than opens. Keyboard activation never goes through a click at
  all, because `useListbox` consumes `Enter` and `Space` itself.
- **`Select`'s `disabled` is the native `disabled` attribute.** The spec writes the state as
  `tabindex="-1"` plus `aria-disabled="true"`; a real `<button disabled>` is already unfocusable
  and inert, so the component uses it and adds `aria-disabled="true"` beside it rather than
  hand-rolling the tab behaviour.
- **`Select`'s `required` reaches the hidden native `<select>`, as the spec asks.** That is what
  makes the placeholder "invalid on submit if required" without scripting. Be aware of the
  consequence in a browser: a `hidden` control that fails constraint validation cannot be focused
  to report the problem, so the form is blocked and the browser logs it rather than showing a
  bubble. Pair it with the `FieldWrapper`'s own `error` for a visible message.
- **`Select`'s `placement` is read once.** `useFloating`'s options are not reactive (see
  [Composables](#composables)), so a select that has to change placement at runtime needs a `:key`
  change. It is a layout decision — "the footer's selectors use `above`" — not state.
- **The popover panels are teleported, and positioned against the viewport** (operator decision,
  2026-09-25). They used to be rendered in place, positioned absolutely inside the component's own
  root, on the strength of the spec's own "Don't place a select inside a container that clips
  overflow" — a rule a store owner cannot be asked to hold, since the container is usually a card
  or a sticky header they did not write. `Select`, `MultiSelect` and `SearchBar` now render their
  panel through a `<Teleport>` to `body` (or to the modal `<dialog>` the control sits in) with
  floating-ui's `fixed` strategy. `data-part` and `classes` still reach it — both are on the
  element — but a descendant selector rooted above the control does not, custom properties set on
  a wrapper are no longer inherited, and the panel is no longer in document order after its
  trigger, so the `Tab` walk into it is `usePopover`'s `tabRedirect` rather than the browser's.
  [Layering](#layering) has the whole list, including why that redirect is not a focus trap and
  what a teleport target of your own has to avoid. `teleport: false` restores the old shape.
- **`MultiSelect`'s parts include the footer's.** The brief's part list stops at the tags; the
  spec's anatomy draws a footer ("live count · Clear (link button) · Done (primary sm)") and its
  acceptance criteria test it, so `footer`, `footerCount`, `footerClear` and `footerDone` are parts
  as well. `optionCheck` is reused for an option's **checkbox** — it is the mark that says a row is
  chosen in both controls, so a consumer styles it once — and the footer's two buttons are real
  `Button`s whose `data-part` is the multi-select's rather than `Button`'s own `container`.
- **`MultiSelect`'s placeholder default is the spec's `"Any"`** (`is-IS`: `"Allt"`), not
  `"Select options"`. New messages with it: `selected` ("Selected", which names the tag list beside
  the field's own label), `selectedCount(n)` ("4 selected"), `noneSelected` and `done`.
- **`MultiSelect`'s clear button belongs to the popover while it is open.** It carries
  `data-eldra-overlay-owner="<the panel's id>"`, which is how `useOverlay` recognises a part of an
  overlay that is not inside its content element, so focus or a pointer press landing on it does
  not close the popover — and it is why the button is still in the `Tab` walk the spec's table
  describes ("from the search field (or the trigger) to the footer's Clear, then Done, with the
  popover still open") now that the panel is teleported out of DOM order. `usePopover`'s
  `tabRedirect` reads that attribute to find the control's **last** tab stop and redirects only
  there, so the browser still walks trigger → clear button itself and the walk continues
  clear button → footer Clear → Done, and back the same way (see [Layering](#layering)).
- **`Backspace` in a `MultiSelect`'s empty search field removes the last tag.** Not in the spec's
  keyboard table — it is the convention every chip input follows — and it is guarded on the query
  being empty, so it never eats a character the user meant to delete.
- **A `MultiSelect` value with no option of its own is dropped** from the summary, the tags, the
  count and the hidden native select. It has no label to show and a `<select>` cannot hold it, so
  showing a count that includes it would make the trigger disagree with the tags underneath it.
- **A disabled or read-only `MultiSelect` keeps its tags and drops their remove buttons.** The
  spec's States table ends a disabled control's row with "clear button hidden", and a read-only one
  is "the value is readable but fixed" — the tag list _is_ the value made readable, so it stays in
  both states while the control that would change it goes, exactly as the trigger's clear button
  already does. Hidden rather than `disabled`: a disabled button stays in the accessibility tree
  announcing a "Remove Sweaters" action that can never happen.
- **`MultiSelect`'s `classes.value` and `classes.native` do nothing.** `value` is a `Select`'s
  chosen-option row; a multi-select draws `summary` (the labels and the "+N" pill) in its place.
  `native` marks the hidden native `<select>` with a `data-part` so a test or a form helper can
  find it, but the element is `hidden` in both controls, so there is nothing for a class to do.
  Both names stay in the part union so one `classes` object can be handed to either control.
- **`MultiSelect`'s `value` slot takes `{ options }`** (the chosen ones, in the order they were
  chosen) and fills the `summary` part, and the `tag` slot takes `{ option }` and replaces a chip's
  **label**, leaving its remove button in place — a consumer restyling a chip should not have to
  rebuild the control that empties it.
- **`QuantityStepper`'s field is `type="text"`, not the spec anatomy's literal
  `<input type="number">`.** A native number input's DOM value can only ever be the US-style,
  ungrouped floating-point grammar (digits and a single `.`); it cannot hold a locale-grouped
  string like `is-IS`'s `"1.234"` (`.` as the group separator) — assigning one is either silently
  rejected by the browser's value-sanitisation algorithm or misread as the decimal `1.234`. The
  task brief explicitly asks this control to parse a typed value with `parseLocaleNumber`, which
  only makes sense for text the browser has not already mangled. `inputmode="numeric"` and
  `role="spinbutton"` with `aria-valuenow`/`-valuemin`/`-valuemax` (the ARIA APG's own pattern for
  this shape of control) satisfy the spec's 4.1.2 note ("The input exposes its value, min and max
  natively") through the accessibility tree instead. "No native spin buttons" (the anatomy's own
  item 3) is satisfied for free: a text input has none to hide.
- **`QuantityStepper`'s live region announces its own value, not a cart subtotal.** The spec's
  exact sentence ("Cart updates are announced in a polite live region near the cart total ...
  'Quantity updated, subtotal $112.00'") names a subtotal a single, reusable control has no access
  to — that announcement belongs to whatever composes this control with a cart total. What this
  component owns and announces once per settled change (never per keystroke) is its own value,
  via the new `quantityUpdated(n)` message.
- **`QuantityStepper`'s group has one perimeter border, not one per part.** The spec's ASCII
  anatomy draws `┬`/`┴` between the three parts; the reference image shows one continuous
  boundary, so this is diagram notation, not a drawn divider. `overflow-hidden` on the rounded
  group is what gives the two outer corners' square first/last children the "inner radius is
  `radius-md` minus 1px" look the Sizes table asks for, without a literal px.
- **`locale` is not part of the design spec's own Properties table for "Quantity stepper"** — the
  task brief adds it (default `"en-US"`) for display formatting and for parsing a typed value.
  `src/utils/number-format.ts` (`createNumberFormat`, `formatNumber`, `parseLocaleNumber`) is the
  general-purpose utility behind it, exported from the package root for use outside this control.
- **`VariantPicker`'s sold-out diagonal lines are inline SVG, not CSS-only utilities.** A first
  attempt drew them with `background-image`/`box-shadow`, which broke two ways under real
  rendering: the gradient's stripe thickness is measured along the gradient's own diagonal length,
  so a label-dependent pill width turned the spec's "1px line" into a visibly thick band, and
  `background-color`/`box-shadow` are exactly the two properties forced-colours mode empties out —
  the swatch's sold-out line was completely invisible under `forced-colors: active`. An inline
  `<svg><line stroke="currentColor" vector-effect="non-scaling-stroke"></svg>` fixes both: a
  constant screen-pixel stroke regardless of the box's aspect ratio, and a stroke remaps under
  forced colours the same way a real border does.
- **`VariantPicker`'s `, sold out` suffix is `messages.soldOut.toLowerCase()`**, not the message
  verbatim. The shared `soldOut` string is capitalised ("Sold out", used standalone e.g. as a
  badge); the spec's own inline examples are lower-case mid-sentence ("Clay, sold out"). Assumes
  `soldOut` has no interior capitals, true for `enUS` and `isIS` today; a future locale needing
  different mid-sentence casing would want its own message key instead.
- **`VariantPicker`'s `name` is used unmodified as the native radio group name**, with no generated
  fallback — unlike `RadioGroup`, which mints one with `useUiId` when absent. Here `name` is
  required and always caller-supplied, per the spec's own Properties table ("Used in the legend and
  as the radio group name"). A page rendering more than one picker sharing an option name (two
  product cards each with their own "Size") must give each its own `name`
  (`"size-<productId>"`) — this component does not namespace it — and pass `legend` so the visible
  (and accessible) name stays "Size" rather than the grouping key.
- **`SearchBar`'s panel holds a `listbox` rather than being one.** The spec's Accessibility notes
  say "The panel is `role="listbox"` named 'Search suggestions'" — but the same section's `none`
  view puts a title and a line of advice inside that panel, above chips that _are_ options, and a
  `role="listbox"` may own only `option` and `group` children. So the popup box is
  `data-part="panel"` and the element that owns the options is `data-part="listbox"` inside it,
  which is what `aria-controls` points at (and what always renders while the panel shows: a
  `role="combobox"` must point at something real). The no-results message and the loading rows are
  its siblings. `Select` solved the same conflict the same way.
- **Four parts beyond the brief's list, all in the spec's own anatomy**: `listbox` (above), `chip`
  (anatomy item 9), `clearRecent` (the idle view's "Clear recent searches" row) and `liveRegion`
  (anatomy item 11), plus `itemArrow` for the Sizes table's "Active arrow". A part the component
  draws and a consumer cannot reach is not a part.
- **`SearchBar`'s `select` event carries `(item, type)`**, where `type` is one of the four result
  types or `"viewAll"`. The spec writes the payload as `{ type, url }` and the brief as `(item)`;
  two arguments carry both without making a consumer destructure a synthetic object, and `item`
  is the same object the `item` slot receives.
- **Articles and pages share one group.** The spec's `results` view names three groups — Products
  (max 4), Collections (max 3), Journal and help (max 3) — while `resultTypes` has four values, so
  `articles` and `pages` are drawn under one "Journal and help" heading, articles first, with three
  rows between them. `resultTypes` still filters each of the two independently.
- **A row's sub line has nowhere to come from.** The spec's reference image shows a second line
  under each title ("Knitwear · 4 colours", "Journal · 4 min read") and a `muted` meta on
  collections ("48 products"), but the `SearchResults` shape this package ships (the brief's, kept
  exactly) carries only `title`, `href` and a product's `price`. The `item` slot is how a store
  draws more; nothing was invented in the type.
- **An idle panel with nothing in it does not open.** The spec says the panel opens on focus, and
  that neither the recent nor the popular list shows when it is empty — which together would leave
  an empty box under the field. `aria-expanded` stays `false` until there is something to show.
- **The `none` view waits for a first response.** The spec's `none` view is "Query **without
  matches**" — an answer from the shop — so it is not drawn while `results` is still `undefined`,
  or a shopper typing "m" would be told there is nothing called "m" while the request for it is
  still in flight. Until the first response arrives the panel shows nothing at all; after 300ms the
  loading view takes over, exactly as the spec's own `loading` row says.
- **One search bar on a page answers `/`.** The spec says the shortcut focuses "the header search",
  singular, but every instance listens on `document`. `src/components/search-bar/shortcutOwner.ts`
  is a module-level claim queue (the same shape as the select family's `openRegistry`): the first
  instance mounted with `shortcut` on owns the key, the others stand behind it, and an unmount — or
  a `shortcut` prop turned off — hands it to the next in line. Ownership is read at keystroke time,
  so nothing has to re-render for it to change hands.
- **`resultsCount` and `viewAllResults` take the query as an optional second argument.** The spec
  names it in both sentences — "4 results for mer", "See all 12 results for “mer”" — while the same
  two messages are also used where there is no query to name (a filtered list's count, the Search
  modal's own "See all n results" row), so the query is optional rather than required: with it the
  message reads the spec's sentence, without it the plain count. One wording delta is left, because
  the catalogue is shared: the popular heading is `popularSearches` ("Popular searches", not the
  spec's "Popular right now"), which a store overrides through `messages`. New messages beside
  them: `noResultsFor(query)`, `searchSuggestions`, `searchProducts`, `searchCollections`,
  `searchJournal` and `searchAdvice`; `clearRecent` is now the spec's own "Clear recent searches"
  and `viewAllResults` its "See all", which `is-IS` already said.
- **`SearchBar` writes the recent-search history itself** when `recent` is not given: on submit and
  on a followed row (not on every keystroke), most recent first, deduplicated without regard to
  case, capped at 5, and wrapped so a storage that refuses leaves the list in memory for that page
  only. A consumer that supplies `recent` owns the storage behind it and has `submit`/`select` to
  write from; nothing is written over their list.
- **The `/` hint carries `messages.shortcutHint` as its `title`.** The visible chip is the spec's
  bare `/` and is `aria-hidden`, so the full sentence ("Press / to search") has nowhere to be
  announced; it is the chip's tooltip, and the field carries `aria-keyshortcuts="/"`.
- **A row's active arrow is not animated.** The spec's Sizes table only says "visible only on the
  active row"; the package's own Motion conventions give hover/colour changes `duration-fast`, and
  other components carry their own `transition-*` for a similarly momentary reveal (Link's arrow,
  Switch's thumb and track) — but here `itemArrow` is a plain `v-if="isActive(row)"`, so the arrow
  appears and disappears with the row's active state, not a fade. Nothing in the spec's own text
  for this component asks for a transition; additive if wanted.
- **`SearchBar`'s results panel shares the select family's "only one open at a time" registry.**
  It opens through `usePopover` (see [Composables](#composables)), the same composable `Select` and
  `MultiSelect` use, so opening a search bar's panel closes an open select's panel and vice versa —
  not only another search bar's. The spec discusses this only within the Select family; extending
  the one registry to `SearchBar` was a judgement call for a page that can show both at once,
  rather than a second, uncoordinated registry.
- **`FieldCheckboxGroup` — an eleventh `Field*`, beyond the design spec's list of ten.** The spec
  names `FieldCheckbox` and `FieldRadioGroup` but no group checkbox, which would have left
  `CheckboxGroup` as the only form control the root entry exports with no way to validate it
  through this entry — while its exact peer, `RadioGroup`, has one. `FieldCheckbox` is therefore
  the spec's single **boolean** consent box (no `type: 'checkbox'` array mode), and
  `FieldCheckboxGroup` is the array question beside it. Additive: no name in the spec changed.
- **A `Field*` never reads the error back to its `FieldWrapper`; the `Form` hands it down.** The
  wrapper is in the root entry and cannot know about vee-validate, and a control cannot write to
  the wrapper that provides its context — so `Form`'s default slot carries `errors`, keyed by field
  `name`, and the wrapper is bound to it (`:error="errors.email"`). It carries only the messages
  that should currently show, on the same "touched, or the form has been submitted" gate each
  `Field*` puts on its own `aria-invalid`, so the two cannot disagree.
- **`Form` adds `successMessage`, which is not in the spec's Form layout property table.** The
  spec's Success state asks for the confirmation to be "announced in a polite live region", and
  `FormLayout` already has that region (`statusMessage`) — `successMessage` is simply the half a
  form component can own: it fills the region once a submit passes validation. The visible half —
  replacing the form or navigating — stays the page's. An explicit `statusMessage` wins over it.
- **A server error shows immediately, without waiting for a blur or a submit.** The display gate
  above exists so a rule message does not appear under a half-typed value; an `apiErrors` entry is
  the answer to a submit that has already happened, so there is nothing left to wait for — and a
  form rendered with errors from an earlier round trip would otherwise show none of them.
- **`FieldSearchBar` takes neither an `id` nor a `name` from the field.** A `SearchBar` sets its
  own id after its attribute fall-through and its native field is always `q`, because its form
  posts to the Search page. So the field's `name` is its validation path only, and an error summary
  lists it as text rather than linking to an id that would not exist.
- **`path` on every `Field*`, for the one control that needs it.** The design spec's contract says
  a `Field*` "takes `name` and `rules`". That holds wherever `name` is the native form field name,
  but a `VariantPicker`'s `name` is also its **visible** legend (unless `legend` overrides it), so
  one `name` would have had to be both the option name a customer reads and the key in `values`.
  `path` separates them and defaults to `name`, so nothing else in the entry changes shape.
- **A `Form` never posts without scripting; `FormLayout` still does.** vee-validate's
  `handleSubmit` calls `preventDefault()` on the event it is given, so the spec's "The form still
  posts without scripting" acceptance criterion cannot hold for a form whose whole purpose is to
  validate in the browser. `action` and `method` are still forwarded (they are `FormLayout`'s
  props), and the hidden native `<select>` inside every `Select` still carries its value — so a
  scripting-free post is one `FormLayout` away, without this entry.
- **Fields are revalidated while submitting.** The spec's Submitting state says the fields "stay
  editable but aren't re-validated". vee-validate revalidates on value update regardless of
  `isSubmitting`, and suppressing that would mean a field edited mid-flight keeping a message that
  no longer matches its value. The _display_ gate is unchanged, so nothing new appears while the
  customer is mid-word.
- **A `group` `FieldWrapper` renders `tabindex="-1"` on its `<fieldset>`.** Not in the spec's
  anatomy; it is what makes an error summary's link land. A group has no single control, so the
  summary points `#<id>` at the fieldset itself, and a browser moves focus to a fragment's target
  only when that target can take focus. `-1` keeps it out of the tab order. Programmatic focus
  (`FormLayout`'s own, and the `Form`'s) still prefers the first focusable control inside it.
- **`FormLayout` gained `focusOnInvalid` (default `true`).** Not in the spec's property table. The
  `Form` in this entry validates asynchronously, so it has to own the focus move on a failed submit
  — on the first attempt nothing is marked `aria-invalid` yet for the layout to find. Without a way
  to turn the layout's own move off, a later refused submit would move focus twice.
- **`StockBadge`'s four level icons are inline SVG path data, not an `icon` prop and not a runtime
  `@tabler/icons-vue` dependency** (operator decision). The spec fixes both the colour and
  the icon per level ("`in` = `success` + circle-check", and so on), so there is nothing for a
  consumer to choose; the `<path>` data for `circle-check`/`alert-triangle`/`circle-x`/`clock` is
  copied from that package's outline set (MIT licensed) the same way `Button`'s spinner is a
  hand-written SVG rather than a dependency on an icon package for one shape.
- **`Badge`'s `outline` replaces the tone's fill entirely, rather than combining with it.** The
  spec's States table (`Badge` → States) gives `outline` exactly one row — `background` fill,
  1px inset `border-strong`, `text` text and icon — independent of `tone`/`variant`; there is no
  "outline danger" or "outline sale" row. So `outline: true` always renders that one boundary
  treatment, whatever `tone` or `variant` is also set, which is also why the icon-required dev
  warning still checks the underlying `tone` rather than the rendered colour: an outlined
  `danger` badge still needs its icon, even though outline hides the red fill.
- **`Badge`'s `icon` prop takes an `IconComponent`, not the spec's `icon: string | null`.** Every
  icon prop in this package takes a Vue component rather than a name string (see `IconComponent`'s
  own doc comment) — `Button.iconLeft`/`iconRight`/`icon`, and now `Badge.icon` — so a consumer
  never depends on this package shipping or naming an icon set. `StockBadge`'s four level icons
  are the one exception, and are built in for the reason above.
- **`Rating`'s linked accessible name reuses the static `messages.rating(value, count)` sentence**
  (operator decision), rather than the spec's separately worded linked hidden text ("the link
  text is the visible value + '128 reviews' + visually hidden ', rated 4.5 out of 5'"). The scope
  deliberately limits the new message vocabulary to exactly `rating` and `noReviews`; setting the
  same tested sentence as the `<a>`'s own `aria-label` — with the visible value/count marked
  `aria-hidden` in both forms — honours that budget and gives every screen reader one unambiguous
  name instead of two overlapping fragments, at the cost of not reproducing the spec's exact
  count-first wording for the linked form.
- **`Rating`'s linked variant wraps its content in a second element, `<a data-part="link">`,
  rather than `root` itself becoming the anchor** (the way `Badge`/`Link`'s `as` swaps their own
  root tag). `root` stays a plain, always-present wrapper; the standard focus ring is drawn on it
  via the proxy-focus pattern (`eldra-focus-proxy`, `:has(:focus-visible)` — `Checkbox`'s and
  `VariantPicker`'s own technique) rather than on the `<a>` directly, which keeps the ring's box —
  and the 2.5.8 1.5rem minimum — `root`'s own predictable layout box regardless of what tag `as`
  renders, instead of depending on an inline `<a>`'s content-fitted focus box. Matches the design
  spec's own reference image, whose "Focus-visible (linked)" panel draws the ring around the whole
  rating, stars included, not just the link text.
- **`Rating` adds one message beyond the task brief's named two (`rating`, `noReviews`):
  `reviewCount(n)`.** The spec's Anatomy names the linked variant's visible count text verbatim —
  "'(128)' on cards; '128 reviews' underlined when linked" — and the card form's `"(128)"` is a
  literal parenthesised number with no word to translate, but the linked form's "128 reviews" is a
  real, pluralised English/Icelandic sentence fragment. The Global Constraints require every piece
  of text a component renders itself to come from `useMessages()`, so that fragment needed its own
  key rather than a hand-written literal.
- **`Rating`'s empty-star outline stroke is 1.75**, the same weight `Link`'s arrow/external icons
  use — the spec's Sizes table gives no number for it, and 1.75 is the closest existing "outline
  icon" precedent in this package (`StockBadge`'s icons, by contrast, are solid shapes with no
  stroke weight to match).
- **`Rating` ignores `href` while `count` is `0`.** The spec's Linked variant assumes there are
  reviews to jump to, and the no-reviews state has its own `emptyAction` slot for an interactive
  link — wrapping that slot's content in a rating-wide `<a>` the moment a consumer used it would
  nest an `<a>` inside an `<a>`, invalid HTML that silently strips the inner link's own semantics.
- **Trailing action pairs are 1.5rem wide with no gap** (operator report, 2026-09-25). A
  `UnitInput`/`CurrencyInput` with `clearable` and the drag handle both showing drew each action a
  full 2rem square with a 1px gap between them, so the two icons ended up roughly 1.1rem apart — far
  wider than any other icon pair in the library. With two of the field's own trailing actions
  present, the row now carries no gap and each action shrinks to `w-6` (1.5rem, still the WCAG
  2.5.8 24px minimum) at the row's own height, and the control's end padding grows to fit both. A
  single action (`Input`, `SearchBar`, and `UnitInput`/`CurrencyInput` with only one of clear/drag
  showing) is unchanged. The recipes are data in `src/components/input/classes.ts`
  (`FIELD_TRAILING_PAD_PAIR`, `FIELD_ACTION_PAIR_SIZE`), and `UnitInput` picks them by counting how
  many of its own actions are showing — never by the presence of a caller's `suffix` slot, whose
  width this package does not control.
- **Every enabled button is `cursor: pointer`, overriding Tailwind's preflight default** (operator
  report, 2026-09-25: "all buttons should have cursor-pointer"). Tailwind v4's preflight sets
  `button { cursor: default }`, so nothing in the library showed a pointer unless a component said
  otherwise. Every live `Button` variant, the `Input`/`SearchBar`/`UnitInput` clear buttons, a live
  `QuantityStepper` +/- button, a live `Select`/`MultiSelect` trigger and clear button, a
  `MultiSelect` tag's remove button, and `Switch` now carry `cursor-pointer`; a disabled or
  read-only control keeps whatever cursor it already had (`cursor-not-allowed`, `cursor-progress`,
  or `Select`/`MultiSelect`'s read-only `cursor-default`), and the `UnitInput` drag handle keeps its
  own `cursor-ns-resize`. `Link` needed nothing — an `<a>` is a pointer already.
- **The starter's `UiImage` is a thin wrapper over `Image`, not a replacement** (ruling, 2026-09-25;
  the plan's own wording said "replace `UiImage`"). `Image` must stay standalone of
  `@eldrajs/theme-vue` (this package never depends on a theme package), but the starter's
  `examples/starter-nuxt/app/components/ui/UiImage.vue` carries Studio's preview-overlay framing
  contract — `imageFramingAttrs`/`imageFramingStyle` from `@eldrajs/theme-vue`, `entryId`/
  `fieldPath` for the overlay's interactive framing controls — which `Image` must not know about.
  So `UiImage` keeps its old prop names (`src`, `alt`, `framing`, `entryId`, `fieldPath`, `aspect`,
  `sizes`, `priority`, so every block under `examples/starter-nuxt/blocks/*` needed no change) and
  renders `Image` underneath: `framing.{x,y}` (0–1 fractions) map to `Image`'s `focal` (0–100
  percent), `framing.zoom` passes straight through, and `aspect` (`"16/9"`-style strings) maps to
  `Image`'s six `ImageRatio` presets, falling back to an inline `aspect-ratio` style on the root
  for anything else. `Image` recomputes `object-position`/`transform`/`transform-origin` from
  `focal`/`zoom` itself (the same clamped-transform-origin formula `imageFramingStyle` uses — see
  `Image.vue`'s own `focalBand`/`clampToFocalBand` comment), so the rendered style is
  byte-identical to the old hand-rolled version; `examples/starter-nuxt/test/framing.spec.ts`
  (asserting on the `Hero`/`Image` blocks' actual rendered `<img>`) needed no change. Only
  `imageFramingAttrs`' `data-eldra-framing*` marker attributes forward from `UiImage` to `Image`,
  never that helper's own `style` — `Image`'s attribute-forwarding rule (below) puts a caller's
  `style` on the root, not the media element, and `Image` already derives an equivalent style from
  `focal`/`zoom`. `class`/`style` passed to `UiImage` land on `Image`'s root (the figure/frame
  wrapper) rather than the `<img>` itself.
- **Fix round 1 (2026-09-25): `UiImage` gained `rounded`/`fill`/`fit`/`classes`,
  and every block that needs a radius, a background fill, or an uncropped view was updated to use
  them.** The first round's own Deviations entry (above) claimed a block's leftover `rounded-*`/
  `object-cover`/`object-contain` class was now merely "redundant" once `class`/`style` moved to
  `Image`'s root — that was wrong. `Image`'s `frame` (not its root) is the part with
  `overflow-hidden`, so a `rounded-*` class stuck on the root clipped nothing and every rounded
  corner in the starter went square; the hero's `image-background` variant's
  `class="absolute inset-0 h-full w-full object-cover"` landed on the root too, but with no
  `aspect`/dimensions the frame it wraps had no definite height for that `h-full` to resolve
  against, so the background image stopped covering the section. Caught in review, not by any
  test — nothing exercised a legacy Tailwind radius/object-fit class against `Image`'s actual
  clip/cover contract, and only the packaged Storybook stories were re-baselined, never the
  starter's own rendered blocks. Fixed with four additions to `UiImage`, all optional and all
  mapped onto `Image`'s own `classes` prop (never onto `class`/`style`, which stay `Image`'s root):
  - **`rounded`** (`'none' | 'lg' | 'xl'`, default `'none'`) forwards straight to `Image`'s own
    `rounded` prop.
  - **`fill`** (`boolean`, default `false`) is for a background image that has to cover its
    positioned ancestor: `ratio="auto"` plus `absolute inset-0 h-full w-full` on `classes.root` and
    `h-full w-full` on `classes.frame`, so the frame's height comes from the ancestor via the
    `inset-0`/`h-full` chain instead of needing `media.width`/`height` (which this wrapper never
    has). Used by the hero block's `image-background` variant.
  - **`fit`** (`'cover' | 'contain'`, default `'cover'`) maps to `classes.media`, for a lightbox-
    style full view that must never crop. Used by the gallery block's lightbox, alongside
    `classes.frame: 'max-h-[85vh]'` for the height cap that used to sit on the `<img>` directly.
    (`fit="contain"`'s own class set was incomplete at first — see the fix round 2 entry below.)
  - **`classes`** passes straight through to `Image`'s own `classes` prop (merged with whatever
    `rounded`/`fill`/`fit` set, caller's value always wins) — the escape hatch for a radius `Image`
    has no preset for (`rounded-full` on the testimonials avatars, `rounded-md` on
    gallery/feature-grid thumbnails, neither of which is one of `Image`'s two presets).
    Regression coverage: a `[data-part="frame"]` radius assertion per affected block (`hero`,
    `gallery`, `feature-grid`, `testimonials`, `image`), a hero test asserting the `fill` classes and
    the resulting `aspect-ratio: auto` on the background variant, a gallery test asserting the
    lightbox's `object-contain`/`max-h-[85vh]`, and a `UiImage.spec.ts` contract test per prop with
    mutation checks (break the mapping, watch the test fail, restore).
- **`AvatarGroup` has no `size` prop; every avatar in a group renders `sm`** (2rem). The task
  brief's own `AvatarGroupProps` type gives it none, and the spec's anatomy diagram shows a
  compact stacked row rather than naming a size — `sm` is the smallest of the four, the fit for a
  row of up to four overlapping circles plus a "+N" counter, distinct from the single `lg` avatars
  the spec shows elsewhere (a testimonial byline, a journal author card). A consumer who wants a
  different size restyles through `classes.item`/`classes.more` (both take the `size-*` group, so
  a replacement diameter also has to update the initials text size alongside it).
- **`AvatarGroup`'s `max` is clamped to 0–3, whatever is passed, with a dev-only warning when it
  had to clamp** (the warning: final review, plan 2). The spec's Avatar section gives `max` a
  default of `3` and, separately, an unconditional acceptance criterion: "Groups never show more
  than four circles in total." Those two only agree if `max` itself never exceeds `3` — three
  avatars plus one "+N" counter — so the prop is clamped rather than trusted, and a caller who
  passes `max="10"` still sees at most four circles; the warning matches the same
  dev-only-when-overriding-a-caller convention `Badge`/`Button`/`Chip`/`Image`/`Price`/`Section`
  already use.
- **`AvatarGroup`'s accessible sentence strips `Intl.ListFormat`'s own Oxford comma** (task brief:
  "Icelandic list joining: use `Intl.ListFormat` with the message locale where available"). Node's
  (and every major browser's) English "long conjunction" CLDR pattern joins three or more items as
  "a, b, and c", but the spec's own example — `aria-label="Makers: Ingrid, Tomas, Maya and 4
more"` — has no comma before "and". Icelandic's own pattern already has no such comma, so its
  output needed no change; `src/utils/listFormat.ts#formatConjunctionList` keeps
  `Intl.ListFormat`'s locale-correct word, order and pluralisation and removes only that one
  separator (via `formatToParts`, not a regex over the whole rendered string), with a hand-written
  `", "`/`" and "`/`" og "` join as the fallback for a runtime with no `Intl.ListFormat` at all.
- **`LogoItem` always renders a real `<li>`, and `root` moves to whichever element is the actual
  cell.** The spec's own anatomy already says this ("Cell: a centred grid cell (`<li>`, or an `<a>`
  inside the `<li>` when linked)"), but it is worth spelling out because every other component's
  `root` is a single element that never moves: `<ul role="list">` only reads as a list to
  assistive tech when its children are real `<li>`s (a bare `<a>` gets no implicit `listitem` role,
  and `<a>` is not valid content of `<ul>` at all), so unlike `Link`'s span/`a` swap, `LogoItem`
  cannot collapse the wrapper away. Unlinked, the `<li>` itself carries `data-part="root"` and the
  cell's own box. Linked, the box (and the `eldra-focus` ring — 2.5.8 needs the _target_ itself at
  least 4rem tall, not just a gutter around it) moves to the `<a>`/`as` cell, and the outer `<li>`
  is bare — no class list, no `data-part`, nothing `classes` can reach, because it carries nothing
  visual to restyle. `classes.root` always reaches the one element that is actually the cell,
  whichever tag that turns out to be.
- **No `external` prop; whether the hidden link context appears is judged from `href` itself.**
  `LogoItemProps` (task brief) has no `external` boolean the way `LinkProps` does, but the spec's
  own default for `linkContext` is conditional on the href — `" (stockist site)"` "when `href` is
  external" — so the component has to decide this on its own. `isExternalHref` in `LogoItem.vue`
  treats an absolute URL (a scheme like `https:`, or a protocol-relative `//`) as external and
  everything else (a root-relative path, a hash, a query) as on-site; a caller who knows better
  still overrides the judgement entirely with an explicit `linkContext` (including `''`, to
  deliberately suppress it on an otherwise-external href).
- **`LogoItem`'s wordmark reuses three type tokens across two different styles rather than
  introducing a fourth.** The spec's wordmark is "heading family, 1.25rem, weight 700,
  line-height 1.15, letter-spacing −0.01em" — no single shared type style matches, but `h1`/`h2`'s
  weight (700), `h2`'s line-height (1.15) and `h3`'s tracking (−0.01em) each individually do, so
  `text-logo-wordmark` (`tailwind.css`) reads those three tokens directly and only the 1.25rem size
  is a new component variable (`--eldra-logo-wordmark-size`) with a literal default — the same
  "reuse what matches, one new variable for what doesn't" shape `text-card-title`/`text-stepper-value`
  already use, just spread across two donor styles instead of one.
- **`LogoItem`'s link stays without an underline, even after the operator's "all link elements are
  underlined" ruling below (`Link`, `Breadcrumb`, card titles).** Reviewed as part of that same
  change and deliberately left alone: the linked cell's own text is the greyscale/wordmark brand
  mark or an image, not a run of body copy — underlining a wordmark reads as a broken heading, not
  a link affordance, and the cell's non-colour affordance is already its own hover/focus treatment
  (opacity rising to 100%, the `eldra-focus` ring, the 4rem target) rather than a text decoration.
  `Rating`'s linked variant needed no change either: its `count` text ("128 reviews") was already
  underlined at rest before this task (`decoration-1 decoration-current/55`), not hover-gated.
- **Fix round 2 (2026-09-25): the navigation logo dropped `UiImage` entirely, and
  `fit="contain"` now also shrink-wraps the frame.** Two open findings from the round 1 re-review:
  - **The navigation block's logo was still routed through `UiImage`** with a bare
    `class="h-8 w-auto"`, the exact class-lands-on-the-root problem round 1 fixed everywhere else —
    missed because round 1's own scope named five blocks and not this one. The logo is not a
    CMS-framed image at all (no `framing`, no `entryId`/`fieldPath`), so it no longer goes through
    `UiImage`: `blocks/navigation/Block.vue` now renders a plain
    `<img :src="data.logo.url" :alt="data.brand" class="h-8 w-auto" loading="eager"
decoding="async">`, the same shape the rest of the starter's un-framed images already use.
  - **`fit="contain"` only changed `object-fit`, and `Image`'s `frame` is unconditionally
    `w-full overflow-hidden`.** A portrait image under `h-full w-full` still computes its box from
    the frame's full _width_, scaled by its own intrinsic ratio; once that scaled height passes a
    height cap on the frame (the lightbox's `max-h-[85vh]`), the frame's `overflow-hidden` **clips**
    it — the opposite of "contain". `fit="contain"` now also shrink-wraps the frame itself
    (`classes.frame` gains `w-auto max-w-full`, composed with any caller frame classes) and gives
    the media both a width and a height constraint together, not just an unconstrained
    `object-contain`: `classes.media` becomes `object-contain h-auto w-auto max-w-full
max-h-[inherit]` — `max-h-[inherit]` reads the _frame's_ own `max-height` back onto the media,
    so the browser scales the image down to fit inside both caps at once, the same thing the
    original bare `<img class="max-h-[85vh] w-auto object-contain">` did by being the frame itself.
    Confirmed `max-h-[inherit]` compiles as a valid Tailwind v4 arbitrary value (built CSS contains
    `.max-h-\[inherit\]{max-height:inherit}`).
    Regression coverage: a navigation test asserting the logo `<img>` carries `h-8 w-auto` directly
    with no `[data-part]` wrapper; `UiImage.spec.ts` tests asserting the exact `contain` class set on
    both `frame` and `media` (and that `cover` is unchanged); a gallery lightbox test asserting the
    same on the actual rendered block. All four with mutation checks against the wiring itself (not
    just `UiImage` in isolation): reverting the navigation block's `<img>` back to `UiImage`, and
    disabling either half of `contain`'s class additions, each turns the corresponding new test red.
- **`EmptyState`'s default icon is chosen per `variant`, not left unset.** The spec's Properties
  table gives `icon` a default of "per use" rather than naming one, but a consumer using the
  component with no icon at all still needs a decorative circle rather than an empty one —
  `empty`/`noResults`/`error` draw a built-in inbox, magnifying glass and warning triangle
  respectively (Tabler `inbox`/`search`/`alert-triangle` outline path data, copied the same way
  `StockBadge`'s icons are), at the spec's 1.75rem / 1.5 stroke. A caller's own `icon` always wins.
- **`empty`/`noResults` render no `actions` row at all until a caller supplies the `actions`
  slot; `error` alone gets a generic built-in one ("Try again").** The spec's own examples for the
  first two ("Shop bestsellers", "Clear filters", "Browse all knitwear") are all store-specific —
  this package has no way to know what a store's bestsellers collection is called — so there is no
  generic default to fall back to. "Try again" is the one action every failed fetch shares, so
  `error` is the only variant with a built-in default (see `EmptyState.vue`'s own comment).
- **`EmptyState`'s built-in "Try again" button label is a new `tryAgain` message key**
  (`src/messages/en-US.ts`/`is-IS.ts`), not part of the task brief's own message vocabulary. It is
  chrome this component renders itself (spec → Default copy, "Try again"), the same category as
  every other message key here, so it goes through `useMessages()` like the rest rather than being
  hard-coded English.
- **`EditorPlaceholder`'s icon renders through the shared `Icon` component (1.5rem, exactly
  `Icon`'s `lg`), while `EmptyState`'s own icon (1.75rem, 1.5 stroke — neither of which matches
  any of `Icon`'s four sizes or its fixed 1.75 stroke) is hand-drawn**, the same split `Badge`
  (hand-drawn) versus every other icon-taking component (via `Icon`) already establishes.
- **`ProductCard`'s media-corner "Sold out" is a plain outline `Badge`, not `StockBadge`.** The
  task brief's own framing ("a sale/new Badge and a StockBadge stack in the media corner")
  reads as though both components land there, but the design spec's anatomy line is explicit
  ("Badge stack ... Badge sale / new / outline 'Sold out'") and its States table describes the
  sold-out badge as "inset 1px `border-strong`" — exactly `Badge`'s own `outline` recipe
  (`bg-background text-text border-border-strong`), which `StockBadge` has no equivalent of (it
  is bare inline text and an icon, no fill or border at all). The corner stack is therefore
  `Badge :outline`, matching the spec's literal styling; `StockBadge` composes elsewhere (next
  bullet), which is what gives the brief's "Composes ... Badge/StockBadge ..." line a real,
  distinct component for each half.
- **`ProductCardProduct.stock` and the `stockLine` part are an addition beyond the spec's own
  8-part anatomy.** The anatomy diagram draws no stock-status row at all, but the brief's own
  `ProductCardProduct` type carries a `stock?: StockLevel | null` field distinct from
  `available`, and composing `StockBadge` needed a real use beyond the outline "Sold out" badge
  above (which is `Badge`, not `StockBadge` — see the previous bullet). When `stock` is set (and
  the product is not sold out, where the disabled quick-add button already carries the same
  meaning), a `StockBadge` status line renders above quick add, in the position most storefront
  cards put a "Only 3 left" line. Omit `stock` for a card that should render exactly the spec's
  own anatomy with nothing extra.
- **The sold-out quick-add control is a disabled `Button`, not `StockBadge`.** Same reasoning as
  the corner badge: the spec's States table describes it as "`muted` on `surface-strong`, no
  border" — `Button`'s own `outline` variant's `DISABLED` recipe
  (`bg-surface-strong text-muted border-transparent`) verbatim — and its Accessibility section
  says sold out reads "the words 'Sold out' on **badge and button**", naming two separate
  elements. A disabled `<button>` (not `StockBadge`, which renders no button at all) is what
  keeps it out of the tab order natively, with no `tabindex` bookkeeping.
- **The quick-add button's accessible name is one whole-sentence function message
  (`messages.quickAdd(title)`), applied as an explicit `aria-label`, not the visible "Quick add"
  text plus the raw title glued on as visually hidden content.** The spec's own English
  description ("'Quick add' + hidden ' Merino crew sweater'") is content-splicing shaped, and
  that shape was tried first — but Icelandic's natural phrasing puts the product name in the
  _middle_ of the sentence ("Setja {title} í körfu"), which splicing a fixed visible prefix with
  a trailing hidden suffix cannot express for every locale, only English's own word order. The
  whole sentence is therefore one catalogue entry (`quickAdd`, new in both `en-US`/`is-IS`) a
  locale can reorder freely, and it replaces `Button`'s own (otherwise absent, for a plain
  outline button) `aria-label` via ordinary Vue attribute fallthrough — confirmed empirically
  against this exact component (a fallthrough `aria-label` on `<Button>` overrides its own
  computed one) before relying on it, since `Button` only turns its `label` prop into
  `aria-label` for `iconOnly`/`loading` buttons. The _visible_ button text stays the spec's own
  "Quick add" (`messages.quickAddLabel`), a separate, non-parametrised catalogue entry.
- **The hover zoom scales from the image's centre, not its authored focal point.** The spec says
  the zoom scales "from the image's focal point", which `Image`'s own `focal`/`zoom` props exist
  for — but they drive a _static_ crop, not a `:hover` transition, and `ProductCardProduct` (the
  task brief's own type) carries no per-image focal data for the card to read. The hover scale is
  a plain `group-hover:scale-[1.03]` CSS transform with the default `transform-origin: center`,
  which only matters visually for an image whose subject sits noticeably off-centre.
- **`ProductCard`'s loading state renders a `<div role="group">`, not `<article role="group">`.**
  The spec's own Loading row asks for `role="group"` on "the card", but the ARIA-in-HTML
  allowed-roles table does not permit `group` on `<article>` (axe's `aria-allowed-role` rule
  catches it), and there is no article content to justify the tag while loading anyway — the
  element itself changes for that one state rather than fighting an invalid role onto `<article>`.
  `ContentCard`'s own loading state follows the same pattern (final review, plan 2): a `<div
role="group" aria-busy aria-label="messages.loading">`, not the `<article>` its loaded state
  renders, so a loading card is always a named busy region rather than an unlabelled one.
- **`ProductCard` wraps `Price`/`Rating`/`StockBadge` in their own `<div data-part="…">`, the same
  convention it already used for `Image`'s `media` wrapper** (final review, plan 2). Passing
  `data-part`/`class` straight through as fallthrough attributes on those three components
  replaced, rather than supplemented, each one's own `data-part="root"` — Vue applies fallthrough
  attributes after a child's own template bindings, so `<Price data-part="price">` left the
  rendered element with `data-part="price"`, not `"root"`, and no way to select
  `[data-part="price"] [data-part="root"]`. The wrapper keeps both: `ProductCard`'s own part name
  on the wrapper `<div>`, the composed child's full part tree intact inside it.
- **The sale/new badge is suppressed while sold out, even if both are set on the same product.**
  `Badge`'s own acceptance criterion ("a third badge is never rendered") and the spec's own
  sold-out States row name only the outline "Sold out" badge, so `ProductCard` trusts `available`
  over `badge` when they conflict rather than stacking both.
- **The sale badge's percentage is derived from `price`, independently of what set `badgeKind`,
  and renders no badge at all when that derivation finds no real discount** (the second half,
  final review, plan 2). `ProductCardProduct.badge` is the caller's own sale/new _decision_ (the
  spec's "derived automatically ... when tagged `new`" needs a tag vocabulary this type does not
  carry, so presence is trusted rather than re-derived) — but its rounded percentage text ("−20%")
  still comes from `price.amount`/`price.compareAt` via the same `compareAt > amount` rule
  `Price`'s own `isSale` uses, so the badge and the price never disagree about whether there is a
  discount. A caller passing `badge: { variant: 'sale' }` with no (or an equal/lower) `compareAt`
  previously still rendered a fabricated "−0%"; `discountPercent > 0` is now also a condition of
  showing the sale badge at all, not only of what number it prints.
- **`Dialog`'s close button "moves down 1px" active state (spec "Dialog" → States) is a 2%
  `scale-[0.98]`, not a 1px translate — the same substitution `Button`'s own press state made
  (operator ruling, 2026-09-25).** A 1px move reads as a rendering artefact rather than a press,
  and `src/__tests__/source-scan.spec.ts` fails the shipped stylesheet on any `active:` translate,
  `top`, or `margin-top` utility for exactly that reason — first caught here when this component's
  literal reading of the spec's own words tripped that guard.
- **`Dialog`'s `close` event reason for a plain external close (a parent sets `modelValue` to
  `false` directly, through neither the close button, a backdrop click, nor the exposed
  `close(value)`) reads `"programmatic"`.** The spec names four reasons (`"escape"`, `"backdrop"`,
  `"button"`, an action value) and does not name this fifth route at all; `useDialog`'s own
  `hide()` calls the native `.close('programmatic')` for it. An earlier revision called the
  argument-less `.close()` instead, which per the HTML `close(returnValue)` steps leaves
  `returnValue` at whatever the _previous_ close set it to, so a consumer that closed once via the
  close button and later closed again through `v-model` read a stale `"button"` for a close that
  was not one — `"programmatic"` is both a distinct, honest fifth reason and a reset on every route
  through `hide()`. `Drawer` and `SearchModal` inherit the same reason through `useDialog`.
- **Modal stacking is now allowed** (operator override, 2026-09-26, superseding the design spec's
  own shared modal rule "Never stack two modals" — every other rule in that section stays). The
  operator's own report: "we should allow modals to open inside of a modal, but Esc / click outside
  etc. must only close the topmost modal" — a cart `Drawer`'s "Remove" opening a confirm `Dialog` on
  top of it (`Drawer`'s `StackedConfirm` story) is exactly this. `src/composables/dialogStack.ts`
  changed from a single module-level slot that refused a second `showModal()` outright to a stack: a
  dialog opening while others are already open is pushed on top and left there, no refusal, no dev
  warning — the ones underneath stay open, simply no longer the top. `Esc` and a backdrop click act
  only on the topmost entry (`useDialog`'s own `isTop`, now "top of stack" rather than "the only
  entry"); a lower dialog ignores both, even one dispatched directly at it in a test, which real
  top-layer stacking would never route there in a browser. Closing the top returns focus to whatever
  was focused in the modal underneath (the same per-instance `opener` capture `useDialog` always
  had, unchanged — a modal opened from inside another one simply captures that other one's currently
  focused control as its own opener, for free). The scroll lock is held while the stack is
  non-empty, released only once every open modal has closed; `TOAST_HOST_KEY` tracks the topmost
  dialog, following it down as each closes. `docs/ui.md`'s "never stacking two" line and its
  Drawer entry's "one-modal-at-a-time slot" wording are updated to match; the design spec's own
  words are left as written (the spec is the historical record the override departs from, not
  something this package edits).
- **`TOAST_HOST_KEY` (`src/composables/dialogStack.ts`) is a plain `Ref<HTMLDialogElement |
null>`, not a Vue `InjectionKey`, despite matching this package's `*_KEY` naming convention for
  `provide`/`inject` pairs (`FIELD_KEY`, `MESSAGES_KEY`, `CHIP_GROUP_KEY`, …).** A `Toaster` is
  expected to mount once near an app's root — a sibling of whatever page content opens a `Dialog`
  elsewhere in the tree — and `provide`/`inject` only ever connects a provider to its own
  descendants, never to a sibling. The module-level `Ref` both `useDialog` (writer) and `Toaster`
  (reader) import directly is the same hand-off shape `usePopover`'s own `topLayerDialog()` already
  relies on to teleport a panel into a modal dialog it did not render. See the Composables section
  above and the constant's own doc comment for the full reasoning.
- **`Dialog` exposes `close`/`isTop` via `defineExpose` rather than adding an `actionValue` prop
  or a dedicated footer-button component.** The spec's `close` event can carry "an action value"
  (the Confirm variant's "Remove", a form's successful submit), and the anatomy's `footer` is a
  plain slot the consumer fills with their own buttons — there is no library-owned action button
  for those buttons to be. A template ref to the `Dialog` (`<Dialog ref="dialogRef">`, then
  `dialogRef.value.close('remove')` from the consumer's own click handler) is the smallest surface
  that lets a footer button close with a value of its own, and matches how a native `<dialog>`'s
  own `.close(returnValue)` already works — no new prop, no new component.
- **`Tabs`' spec property named `label` ships as `ariaLabel`.** Package convention, applied
  consistently everywhere a prop's only job is to name an element for assistive technology
  (`FormLayout`'s own `ariaLabel`, `ChipGroup`'s `label` predates the convention and is left as
  is): an accessible-name-only prop is `ariaLabel`, so it reads as what it does rather than
  colliding, in a reader's head, with a prop that renders visible text — which `Tab`'s own
  `title` is, following `Button`'s `label`/default-slot pattern.
- **`TabPanel` gives `tabindex="0"` only to a panel with no focusable content of its own**, not
  unconditionally as the spec's own Accessibility line reads literally ("`tabindex="0"`" with no
  qualifier). This is the ARIA APG tabs pattern's own narrower rule — a panel that already
  contains a link or a button needs no second stop for the same content — and the task brief
  names it outright as "the panel focusability rule"; `TabPanel.vue` checks its own rendered DOM
  for a focusable descendant on mount and after every update.
- **`Tab` and the `items` API carry no `disabled`.** The spec's "Tabs" section — Properties,
  States, Keyboard, Accessibility — never mentions a disabled tab (unlike `RadioGroup`'s or
  `Select`'s options, which the spec states explicitly), so none is added; a store that needs to
  keep a tab reachable-but-inert can hide its `Tab` entirely instead, the same way an unlinked
  `FeatureCard` has no tab stop at all.
- **A `Tab`'s own type style reuses `VariantPicker`'s `text-variant-pill` utility**, not a new
  `text-tab`. The two are the exact same numbers — "0.9375rem … 500 (600 selected)" — and
  `text-variant-pill` already carries no baked-in weight for the same reason a new one would need
  none (see that component's own comment): one size, two weights depending on state, which no
  `font` shorthand can express, so the component pairs it with `font-medium`/`font-semibold`
  itself. A component reusing a differently-named cross-component utility is unusual enough to
  call out here rather than leave a reader wondering why `Tab.vue` imports nothing from
  `variant-picker/`.
- **`Accordion`'s panel animates height on expand and collapse, through the Web Animations API, not
  CSS** (operator override, 2026-09-26: "the accordion should have some expand transition" —
  supersedes the original "fades, does not animate height" ruling below it in earlier versions of
  this file). The spec's own Behaviour & motion text only asked for a fade ("Panel: fades in over
  `duration-base` `ease-out` when opened"), and a CSS grid-rows height animation was the original
  design and was rejected for it: making one work at all requires the panel to stay in the layout
  while "closed" — collapsed to a zero-height row rather than genuinely hidden — which means
  overriding the panel's own `display` so the browser's default
  `details:not([open]) > *:not(summary) { display: none; }` rule (the HTML spec's own UA style)
  never applies to it, defeating the Accordion acceptance criterion "Find-in-page finds text in
  closed panels and opens the item" (a `<details>`-specific browser feature keyed to that exact
  default hiding) to satisfy a different one. `eldra-accordion-panel` (see `tailwind.css`) still
  only ever touches `opacity` and `display`'s place in the transition list for exactly that reason,
  and the operator's height animation does not replace it — it runs alongside, entirely in
  JavaScript, entirely in `src/components/accordion/heightTransition.ts` and
  `AccordionItem.vue`'s `onToggle`/`onSummaryClick`: `Element.prototype.animate` on the panel
  element from a measured pixel height (`0` ↔ `scrollHeight`) to the other, which never touches
  `display` at all, so the find-in-page argument above never applies to it.
  - **Open** is driven by the native `toggle` event, not the click — the browser has already
    flipped `open` and revealed the panel by the time `toggle` fires, so `scrollHeight` is already
    accurate, and keying off `toggle` rather than a click handler is what makes a browser-forced
    open (find-in-page revealing a match inside a closed panel, `hidden="until-found"`) animate
    too, with no click ever having happened.
  - **Close** intercepts the summary's own `click` (`Enter`/`Space` reach it too, converted to a
    `click` by the browser's own default action) with `preventDefault()`, since the browser's
    default close action would otherwise remove the panel from layout before any script could
    measure it. The height animation plays in reverse and only then sets `details.open = false`
    itself, which is what fires the native `toggle` this component already listens for — the
    `modelValue`/`update:modelValue`/re-emitted `toggle` contract is completely unchanged, just
    deferred until the animation settles.
  - **Reduced motion** (`prefers-reduced-motion: reduce`) is checked the same way
    `useCarousel`/`Tooltip` do (`prefersReducedMotion()`), independently of `tokens.css` already
    zeroing `--eldra-duration-base` under the same media query — either one skips the animation.
  - **Duration and easing are read from the panel's own computed style** at animation time
    (`--eldra-duration-base`, `--eldra-ease-out` opening / `--eldra-ease-in` closing) rather than a
    literal number in `heightTransition.ts`, matching this package's "every duration/easing
    resolves to a token" rule even though this is a JS animation, not a CSS one — a consumer
    overriding those tokens changes this animation too. There is deliberately no literal fallback:
    when the variable does not resolve to a usable value at all (no stylesheet loaded — a unit
    test mounting the component with no CSS pipeline, most likely), the animation is skipped
    outright, exactly like `Element.prototype.animate` being unavailable.
  - **The documented gap**: an exclusive-`name` group's sibling that closes because another item
    opened is not reached through the click-intercept above at all — the browser (or
    `closeOtherOpenSiblings`'s happy-dom fallback, see below) flips that sibling's `open` directly,
    with no click of its own to intercept — so it still closes instantly, exactly as it did before
    this change. Animating that collapse too would mean one `AccordionItem` instance reaching into
    a sibling's; left as the deliberate trade-off an operator override at this scope calls for,
    not something left unfinished.
- **`AccordionItem`'s open state is `modelValue` (two-way `update:modelValue`), not the spec's own
  `open`.** Every other stateful control in this package (`Switch`, `Checkbox`, `Select`, …) takes
  its state through `modelValue`/`v-model`, and `open` would be the one exception with no
  compensating benefit — a consumer already reaches for `v-model="isOpen"` on every other control
  here.
- **Native same-`name` `<details>` exclusivity is feature-detected, with a JS fallback for an
  engine that lacks it**, rather than assumed or always re-implemented in script. Every current
  browser (Chromium, Firefox, Safari) already closes the previously open sibling itself — see
  `src/components/accordion/detailsExclusivity.ts` — so `AccordionItem.vue` only runs its own
  `closeOtherOpenSiblings` query when the one-time probe says the platform does not, which is also
  what makes the package's own test suite exercise that fallback at all: happy-dom implements
  neither the `name` grouping algorithm nor the `.name` IDL property (a fairly recent HTML
  addition), so both the probe and the fallback read/write `name` through `getAttribute`/
  `setAttribute` rather than the property, which is what Vue's own `:name` binding sets in every
  engine regardless of whether that engine also exposes it as a property.
- **`Drawer`'s `label` becomes `ariaLabel`.** The brief's own prop name is an accessible-name-only
  prop — it never renders as visible text, it only becomes the `<dialog>`'s `aria-label` when there
  is no `title` to be `aria-labelledby` instead (the menu drawer) — and this package's own naming
  rule for that shape is `ariaLabel`, not the bare noun (`title` is reserved for _visible_ text
  everywhere else in the package). Matches operator ruling, 2026-09-25.
- **`Drawer`'s full-screen mobile variant is a plain `@media (width < 48rem)` query baked into the
  `eldra-drawer-width` utility itself, never a `@container` query.** The design spec's own Global
  Constraints name exactly two rules in the whole spec that measure the **viewport** rather than
  the enclosing block — form-field text below a 48rem viewport, and "the full-screen variants of
  Drawer, Lightbox and Search modal" below a 48rem viewport — and this is the second one (operator
  ruling, 2026-09-25). Every other responsive rule in this package measures a container
  (`@max-tablet`, `@two-col`, …); this one measures the screen a real device has, because a drawer
  covering "the whole screen" is a statement about the device, not about whatever page-builder
  column happens to contain it. `48rem` is Tailwind's own `md` breakpoint, the same edge
  `max-md:text-control-mobile` already measures for the other viewport exception, so the media
  query is written as literal CSS (`@media (width < 48rem)`, Tailwind v4's own compiled form of
  `max-md:`) nested inside the `@utility` body rather than a second Tailwind variant class, so a
  consumer overriding `classes.panel` cannot separate the width clamp from its own mobile
  exception — the two are one rule together, the same way `eldra-dialog-width`'s viewport clamp is
  baked into that utility rather than left to a second class.
- **`Drawer`'s `width` prop feeds `--eldra-drawer-width` (default `28rem`) with the viewport clamp
  and the full-screen media query both inside the one `eldra-drawer-width` utility**, the same
  shape `--eldra-dialog-width` uses for `Dialog`'s own width — a literal per-component variable
  rather than a token, because the spec's own default sits between two tokens and has none of its
  own. `Textarea`'s `--eldra-textarea-min-height` is the precedent for setting one of these from a
  prop's inline style rather than a fixed default only.
- **`Drawer`'s close button focuses first on the right side (cart, filters, quick view), unlike
  `Dialog`'s own initial-focus rule.** The design spec's own "Drawer" → Variants table gives the
  right side a different default than every other modal surface in this package: "Cart: the close
  button. Filters and quick view: the close button unless a control is marked `autofocus`" — the
  opposite of `Dialog`'s "never the close button while a better candidate exists." `Drawer.vue`
  computes its own `initialFocus` for `useDialog` (a native `[autofocus]` element inside the body,
  else the close button) only for `side="right"`; the left side (the menu) passes `undefined`, so
  `useDialog`'s own default — the first focusable that is not `[data-part="close"]` — already gives
  "the first link in the menu" for free, since the anatomy puts the `<nav>` first in the body.
- **`Drawer` has no `dismissable` prop**, unlike `Dialog`. The design spec's own "Drawer" →
  Behaviour & motion row is unconditional — "Closes on `Esc`, the close button, and a backdrop
  click" — with no exception column the way the shared modal rules' "unless the dialog holds
  unsaved input" gives `Dialog`. `useDialog`'s `dismissable` option is simply never passed, which
  defaults to `true`.
- **`Drawer`'s reduced-motion entrance reuses `Dialog`'s own `animate-eldra-dialog-in-reduced`
  keyframe rather than a third one of its own.** Both spec sections ask for the identical "plain
  opacity fade over `duration-base` (200ms), linear" — no rise, no scale, nothing side-specific — so
  a second keyframe with the same two declarations would only be a second name for the same rule.
  Only the non-reduced entrance gets `Drawer`-specific keyframes (`eldra-drawer-in-right`/`-left`,
  a `translateX` slide from the correct edge), since that part _is_ side-specific.
- **`Drawer`'s slide animation is on the root `<dialog>`, not the panel**, the same placement
  `Dialog`'s own `animate-eldra-dialog-in` uses. The root is a full-viewport transparent flex box
  that only docks its (opaque) panel child to one edge; translating the root by a full 100% of its
  own (viewport) width slides the panel fully off-screen and back regardless of the panel's own
  width, while the `::backdrop` — a sibling box, not a descendant — is untouched by the transform
  and simply stays in place.
- **`Drawer`'s close button aria-label is a function of whichever prop names the drawer, not a
  fixed string.** The design spec's own Accessibility notes give three different literal labels
  for the one control ("Close cart", "Close menu", "Close filters"), which this package cannot know
  in advance — a new `closeDrawer(name)` message (`Close ${name}`, is-IS `Loka ${name}`) reads
  whichever of `title`/`ariaLabel` names the drawer, so a consumer reaches the spec's exact wording
  by choosing that prop's value (`title="Cart"` reads "Close Cart") — falling back to the plain
  `close` message when the drawer has neither.
- **`Drawer`'s events and props follow `Dialog`'s own naming, not the design spec's literal
  `open`/`openChange` two-way property and `afterLeave` event.** `modelValue` (two-way, `Dialog`'s
  own convention every stateful component in this package shares) replaces `open`/`openChange`;
  `close(reason)` fires with `"escape"`/`"backdrop"`/`"button"`/an action value, the identical shape
  `Dialog`'s own `close` event already uses, rather than a bare `close` with no reason. There is no
  `afterLeave`: the spec's own exit is "instant" (no animation to wait for), the same reasoning that
  gives `Dialog` no exit-coordination event either — an event that only ever fires on the same tick
  as `close` would tell a consumer nothing `close` does not already.
- **`Tooltip`'s bubble stays mounted permanently, unlike every other teleported panel in this
  package.** `Select`/`MultiSelect`/`SearchBar` mount their panel fresh on every open (`v-if` on
  the `<Teleport>`), so `animate-eldra-popover-in`'s keyframe replays each time. The spec's own
  Tooltip motion is a plain opacity **transition** (`duration-fast`, `ease-out`), and a CSS
  transition only plays on a change to an element already in the DOM — mounting a fresh element
  straight into its end state plays no fade at all. So the bubble is teleported unconditionally
  (behind `teleportDisabled` until mount, same as everywhere else) and toggles
  `opacity`/`pointer-events` through a reactive class instead.
- **The trigger's `aria-labelledby`/`aria-describedby` is grafted onto the slotted element with
  `cloneVNode`, not read from a scoped slot the consumer wires up.** The spec is explicit that
  "the component generates the tooltip id and wires the trigger to it" — the wiring is `Tooltip`'s
  job, not a prop the consumer must remember to bind — and that attribute has to land on the
  actual focusable element, not on `root` (the neutral wrapper span the hover/focus listeners live
  on): a screen reader computes an element's accessible name from what _that_ element points at.
  The default slot's single element is therefore cloned with the id merged in
  (`joinIds`, so an existing `aria-describedby` is not clobbered), via a stable
  functional-component wrapper (`<component :is="Trigger" />`) so Vue patches the same underlying
  element across renders rather than replacing it. This is the one place in the package that
  reaches into a slot's own vnode instead of only rendering it.
  **The trigger contract this implies: a plain element, or a component whose focusable root
  receives `$attrs`.** A `cloneVNode` merge only reaches the DOM when the vnode's own attrs land on
  a real element — `Button` works, since it lets `$attrs` fall through undisturbed, but a component
  declared `inheritAttrs: false` whose own template binds its _own_ `aria-describedby` after
  spreading `$attrs` (`Input`, `Textarea`, `Select`, `Switch`, and this package's other form
  controls) silently overwrites the grafted one instead: the tooltip still "works" from `Tooltip`'s
  own point of view, but the resulting DOM carries no trace of the graft, so it is invisible to
  assistive technology. A dev-only warning checks the rendered DOM for the expected id after every
  render (not `original.type`'s `inheritAttrs` statically, which would miss the same symptom
  arising from an unrelated `$attrs`-ordering issue) and names the fix: wrap such a control in a
  plain element the tooltip can attach to instead.
- **No show delay, on hover or on focus.** The spec's own Behaviour bullet says it twice ("No
  delay on focus; none needed on hover") and the acceptance criteria repeat it ("appears ... with
  no delay on focus"); `Tooltip` shows on the very hover/focus event with no timer at all. The
  task brief's own test note ("hover (delay, fake timers)") is read as "prove there is no delay",
  not as a requirement for one — `__tests__/tooltip.spec.ts` uses fake timers to advance past a
  hover event and assert the bubble is already visible before any time has passed.
- **"Focus within it" (spec → States, Shown) reads as _keyboard_ focus, and activating the trigger
  dismisses the tooltip like `Esc` does — neither is in the design spec's own text.** An operator
  report ("hover and click the element, the tooltip gets stuck and does not disappear on
  hover-out") traced to `focusWithin` counting any `focusin`, including the one a mouse click gives
  its own target — so `mouseleave` alone could no longer hide it. The controller's ruling narrows
  "focus within it" to `keyboardFocusWithin`, gated on `element.matches(':focus-visible')` behind a
  `supportsFocusVisible` feature test (`supportsFocusVisible.ts`, mirroring `Textarea`'s
  `supportsFieldSizing`), falling back to a same-page "was the last input a key or a pointer" flag
  where `:focus-visible` cannot be trusted — this package's own test environment, happy-dom,
  implements it as a synonym for `:focus` rather than throwing, so the flag has to be reached for
  deliberately (a spec stubs `supportsFocusVisible` to exercise it) rather than detected by a
  `try`/`catch`. Beyond that narrowing, activating the trigger (`pointerdown`, `click`, or an
  `Enter`/`Space` `keydown`) now also sets the Dismissed state exactly like `Esc`, on the same
  reasoning: a clicked button should not keep its own label floating just because the click left it
  focused. The `hoveringTrigger` watcher that clears a dismissal fires on either edge, not only the
  pointer leaving, so a dismissal that started with no hover at all (an `Enter`/`Space` activation)
  still clears the next time the pointer enters, rather than needing an unrelated blur/refocus.
- **Fix (2026-09-26): activation only counts for a button/link-like trigger, never an editable
  one.** The dismissal above was originally keyed off any `Enter`/`Space` `keydown` bubbling
  through the wrapper, with no check on what fired it. For a `role="description"` tooltip labelling
  a text input, that meant every space a shopper typed while composing their own text set
  `dismissed` — and since focus never actually left the field, nothing cleared it again until an
  unrelated blur/refocus, so the description tooltip vanished for the rest of that focus session
  after the first keystroke. `onRootKeyDown` now checks `event.target` via `isActivatableTarget`
  first: `Enter`/`Space` only dismisses when the target matches `button`, `a[href]`,
  `[role="button"]`, `[role="link"]` or `summary`, and is explicitly excluded for `input`,
  `textarea`, `select` and `[contenteditable]` regardless.
- **The `0.5rem` hover bridge (WCAG 1.4.13) is a CSS `::before` on the bubble, not a fourth DOM
  part.** The anatomy lists three parts (`root`, `bubble`, `arrow`); the bridge is an invisible
  pseudo-element extending the bubble's own hit-test area back to the trigger's edge, sized and
  positioned to the gap, so a real pointer crossing it never leaves a hoverable element. It carries
  no `data-part` and is not reachable through `classes` for the same reason `Skeleton`'s shimmer
  and `Rating`'s half-star clip are not — it is drawn, not a component part.
- **`useFloating`'s `FloatingPlacement` gained `top-end`/`bottom-end`.** `Tooltip`'s `align="end"`
  needs a floating-ui placement the existing union did not have (only the `-start` pair, for
  `Select`/`MultiSelect`'s own footer selectors); the two additions are purely additive and behave
  like their `-start` siblings (`flip: true`).
- **The teleport-target lookup (`topLayerDialog`/`isTopLayer`, the "body, or the open modal
  `<dialog>` the trigger sits in" rule) moved to `src/composables/teleportTarget.ts`.** `usePopover`
  and `Tooltip` both need it and neither should duplicate it; it is not exported from the package
  root, the same as `openRegistry` — an internal building block the two share, not part of the
  public composable surface. `usePopover`'s own behaviour and tests are unchanged by the move.
- **`Toast`'s exit is not animated, even though the spec asks for a 150ms fade out on dismiss**
  (spec "Toast" → Behaviour & motion) — the same "instant by default" trade-off `Dialog`'s own exit
  makes (see its own entry above). Final review item 7 asked specifically whether `Accordion`'s own
  CSS-only exit mechanism (`@starting-style` + `transition-behavior: allow-discrete` on a state held
  for one extra frame) would fit this case in roughly 40 lines; it does not, for a reason specific
  to _this_ removal rather than the general "no `<TransitionGroup>` in this package" one.
  `Accordion`'s panel animates a native `<details>` toggling its own `display` — the browser drives
  the open transition entirely from the `[open]` attribute change, and even the close (now
  intercepted by JS to play the height animation before that same attribute flips — see this
  file's own Accordion entry above, added after this comparison was written) still has one
  persistent element with a `[open]` attribute to key a transition off, at every point in the
  process. `Toaster` removes a toast by splicing Vue's reactive `toasts` array (`useToast`'s
  `dismiss()`), which unmounts the element immediately; there is no attribute to key a CSS
  transition off after that point; nothing renders to transition once it's gone. Reaching the same
  effect needs `Toaster` to intercept every removal, hold the removed item in a locally-tracked
  "leaving" set for one more render plus a 150ms timer before actually dropping it, and merge that
  set back into `nonDanger`/`danger` in the right list position — while staying correct under a
  toast being dedupe-replaced mid-exit, `clear()` wiping the queue while something is already
  leaving, and the existing hover/focus pause logic, which currently assumes `toasts` and "what's
  on screen" are the same list. That is a second, parallel list-lifecycle to get right beside the
  one `useToast` already owns, not a CSS utility — meaningfully more than the ~40-line budget this
  review round set, and risk (a reordering, a leaked timer, a `clear()` racing an exit) for a purely
  cosmetic 150ms fade. The entrance animation (fade + a 0.5rem rise over `duration-base`) ships as
  specified; `Toaster` removes a dismissed toast from the DOM immediately instead.
- **`Toaster`'s own anatomy has only two named parts, `root` and `list`, even though a danger toast
  renders outside both** (spec "Toast" → Behaviour & motion: "insert them into the same fixed stack
  but outside the polite status element … so the two live regions aren't nested"). There is no
  visually distinct "danger group" box to name a third part for — a danger toast is simply a
  further direct child of `root`, a sibling of `list` (the `role="status" aria-live="polite"`
  element), so the two live regions never nest; each danger toast is its own `role="alert"` region,
  set on `Toast`'s own root by its `variant`. One consequence, accepted rather than solved: a mixed
  sequence of variants does not interleave perfectly in the visual stack (every non-danger toast is
  grouped inside `list`, so a danger toast raised in between still renders after that whole group).
  The spec does not describe cross-variant ordering closely enough to rule this out, and getting it
  exactly right would mean nesting the two live regions after all.
- **`list` collapses to `hidden` (rather than staying `flex flex-col gap-3`) while it holds no
  non-danger toast**, purely so `root`'s own `gap-3` does not insert a spare 0.75rem gap above a
  danger-only stack (an empty `list` would otherwise still count as one flex item). This does not
  affect the polite announcement itself — an empty `aria-live="polite"` region announces nothing
  regardless of its own `display`, and Vue applies the class change in the same patch that inserts
  a first toast's markup, so the region is already visible by the time anything is announced.
- **`Toast`'s own `keydown` handler calls `preventDefault()` on `Escape`**, beyond what closing
  just this toast requires. While a toast is teleported inside an open `Dialog` (`TOAST_HOST_KEY`)
  and holds focus, the platform's own Escape-closes-the-topmost-dialog behaviour would otherwise
  fire as well — closing the dialog behind the toast, not only the toast the spec's own Keyboard
  row asks Escape to close ("closes the toast that holds focus"). `preventDefault()` on the
  `keydown` suppresses that native "close request" before it reaches the dialog.
- **Every `Carousel` slide gets the spec's gallery treatment — `role="group"`,
  `aria-roledescription="slide"`, an "n of total" `aria-label` — including product rows.** The
  spec's own Accessibility section gives that markup to "gallery slides" only and calls a product
  row's own slides plain list items holding Product cards, but `CarouselProps` carries nothing that
  tells the component which of the two a given instance is (no `variant` prop — the spec's variant
  table is a controls/dots/counter combination, not a discriminant `useCarousel` can read), and the
  same track this composable drives is shared by both. One consistent rule for every slide, applied
  by `useCarousel` itself rather than duplicated per call site, was judged better than inventing a
  prop the type brief for this task does not have — a screen reader user hears "group, slide, 1 of
  4" on a product row's cards, slightly more verbose than the spec's plain list items, never less
  informative. The same gap means the **arrow buttons carry the gallery's own accessible names**
  ("Previous slide"/"Next slide", `messages.previous`/`.next`) **on a product row too**, rather than
  the spec's row-specific wording ("Previous products"/"Next products"): with no discriminant to
  read, `Carousel.vue` uses the one pair of messages for both variants, the same reasoning as the
  slide-role rule above. A consumer wanting the spec's exact row wording overrides it per instance
  via the `messages` prop (`{ previous: 'Previous products', next: 'Next products' }`).
- **The track's own accessible name is the fixed word "Slides", not the spec's two literal
  examples** ("Bestsellers, scrollable list" for a row, "Slides" for a gallery). Composing the
  first would mean formatting it from the region's own `ariaLabel`, coupling the track's wording to
  whatever a caller happened to name the whole carousel; the plain generic word reads correctly for
  both variants and needs no `messages` key of its own beyond `slides`.
- **The Pause/Play button's accessible name is its visible text ("Pause"/"Play"), not the spec's
  longer "Pause slideshow"/"Play slideshow".** The task brief's own message-key guidance names the
  pair `pause`/`play`, one string each — this package uses that one string for both the visible
  label and the accessible name (a native `<button>`'s default accessible name is already its own
  text content) rather than adding a second, longer key purely for the ARIA name.
- **The visible "n / total" counter is not bolded on its current number**, despite the spec's own
  Sizes row ("current number bold"). The counter is `aria-hidden` and rendered from
  `messages.counter(n, max)` — a single localized string ("n / max" in English, "n af max" in
  Icelandic) — so bolding only the leading number would mean splitting that string back apart by
  position, which breaks the moment a locale's own word order does not put the number first. The
  counter stays plain text; the locale-correct string was judged more important than the one-weight
  visual detail on a range that is not read by assistive technology.
- **Arrow, Pause/Play and dot markup is hand-rolled `<button>`s rather than `<Button icon-only>` or
  `<Button variant="outline" size="sm">`**, even though the Pause/Play recipe is otherwise byte-for-
  byte `Button`'s own outline/`sm` box. `data-part="pause"` (and `"prev"`/`"next"`) needs to land on
  the actual rendered element, and no `Button` size is the arrow's own 2.75rem circle; reusing
  `Button` for Pause alone while hand-rolling the arrows beside it would leave one control built two
  different ways for no real gain.
  engine regardless of whether that engine also exposes it as a property.
- **Fix (2026-09-26, operator report: "swiping/dragging on both lightbox and carousel is very
  broken — it starts and then kind of cancels; while dragging we are highlighting stuff"): the
  track's own `touch-action` changes from `touch-pan-y` alone to `touch-pan-x touch-pan-y`
  (`Carousel.vue`'s own `trackClass` comment has the full mechanism), and the pointer-drag state
  machine in `useCarousel` gains two fixes shared by `Carousel` and `Lightbox`.** First: the track
  keeps `scroll-behavior: smooth` at rest for its own arrow/dot/autoplay navigation, but every
  `scrollLeft` write the drag makes is a real, instant assignment — under `smooth`, each one started
  an animation the very next write interrupted, which is what read as "starts and then kind of
  cancels." `data-[dragging=true]:scroll-auto` (riding the same `data-dragging` attribute
  `data-[dragging=true]:snap-none` already used) turns `scroll-behavior` off for the drag's
  duration; a forced reflow between clearing the attribute and the release's `goTo()` call
  (`endTrackDrag`'s own comment) is what lets the class change actually take effect before the
  snap-back animates, rather than either jumping instantly or fighting the drag's own last write.
  Second: `pointermove`'s own `preventDefault()` (unchanged) never stopped the browser's native
  text-selection drag, which starts on `mousedown`, before any `pointermove` fires — so dragging
  across a slide's caption highlighted it. `onTrackPointerDown` now called `preventDefault()` itself,
  once every bail-out (wrong button, touch, an interactive descendant) had already passed, and the
  drag also toggles `user-select: none` on `document.documentElement` for its duration (the pointer
  can leave the track mid-drag, past the track's own `data-[dragging=true]:select-none`), restored on
  `pointerup`/`pointercancel`/`lostpointercapture` alike. Touch was never affected by either fix —
  it swipes through native scroll-snap panning, which is exactly what the `touch-action` change
  above restores. (The `preventDefault()`-on-`pointerdown` half of this fix was itself replaced the
  same day — see the round-2 fix below.)
- **Fix (2026-09-26, round 2, operator report: "we are not able to drag on a card, we have to place
  the cursor between cards. If it's a clickable entry we should cancel the click ... if we swipe
  over some offset. That way the click stays functional but we can still swipe."): a drag may now
  start on any pointer press inside the track — buttons and links included — not only the track's
  bare background between slides.** The previous round's `isInteractiveDescendant` bailed out of
  tracking a pointerdown on _any_ `a[href]`/`button`/`input`/`[role="button"]`/etc., which is exactly
  why dragging never started on a `ProductCard` (its title link is stretched over the whole card).
  Replaced with `isNoDragTarget`, which only excludes an editable/range control (`input`, `textarea`,
  `select`, `[contenteditable]`, `input[type="range"]`) or an explicit `data-no-drag` opt-out. The
  round-1 `preventDefault()` on every qualifying `pointerdown` is gone too — it was what stopped a
  slide's own link/button from focusing or clicking normally below the 6px threshold, which the
  ruling requires ("Do NOT preventDefault() the pointerdown — keep native focus/click behaviour").
  In its place, `onTrackPointerMove` clears any text selection the bare `mousedown` already started
  (`window.getSelection()?.removeAllRanges()`) the instant the gesture crosses the threshold, which
  is the only moment a selection anchor stops being wanted. The click-cancelling half of the state
  machine (`suppressNextClick`, armed only once a real drag happened, consumed by a capture-phase
  listener on the track) needed no change — it already canceled a click "wherever the pointer lands,"
  drag start included.
- **`Breadcrumb` never truncates a label, even a long one — this reverses a truncation rule an
  earlier draft of the task's own interface comment carried ("long titles truncate at 40ch with the
  full title in `title`").** The design spec text is explicit and binding over that comment: "Product
  titles are never truncated; the trail wraps" (Behaviour & motion), repeated as its own acceptance
  criterion ("At 320px and 200% zoom the trail wraps without horizontal scroll and titles are not
  truncated", 1.4.10). There is no `truncate`/`line-clamp` class anywhere in this component and no
  native `title` attribute either — nothing here is ever clipped, so a hover tooltip repeating text
  that is already fully visible would add nothing. `LongTitles` (Storybook) shows a long current-page
  title wrapping onto a second line instead of clipping.
- **The separator between levels is an inline Tabler `chevron-right` SVG (`aria-hidden`, the same
  shape `AccordionItem`'s own chevron uses), not the CSS-drawn two-border chevron the design spec's
  own Sizes row describes ("a small chevron drawn in CSS between items").** Operator direction,
  2026-09-25: consistent with every other directional glyph this package draws (`Link`'s arrow,
  `AccordionItem`'s chevron), all of which are inline SVGs, not CSS pseudo-element borders — a
  second decorative-line technique for one component would be a new pattern with no reuse anywhere
  else in the package. It is still `aria-hidden` and still not text, so it is still never announced.
- **Fix (2026-09-26): the separator's fixed `mt-1.875` — sized to centre a 0.375rem chevron on one
  `text-body-sm` line (1.3125rem) — was also being used before a link, whose own sibling box is
  `target-min` (1.5rem), not that line-height.** The operator reported "separators render as tiny
  marks sitting above the baseline" — true of most separators in an ordinary trail, since only the
  one immediately before the current page (see `BreadcrumbItem`'s own comment on wrapping) ever sits
  beside a plain, line-height-driven `<span>`; every other separator sits beside a `target-min` link
  or the ellipsis button. `separatorClass` (`Breadcrumb.vue`) now takes an `alignCenter` argument:
  `true` (`self-center`, letting the flexbox centre the chevron against its sibling's real height,
  no arithmetic needed) before a link or the ellipsis; `false` (the original `mt-1.875` math,
  unchanged) only before the trail's final, possibly-wrapping current-page item — `self-center`
  there would centre the chevron against the _whole_ wrapped block instead of its first line, which
  the `LongTitles` story and a dedicated `Breadcrumb.spec.ts` case both prove stays correct. The
  chevron's own size is unchanged (0.375rem, `size-1.5`, already the spec's own number); only the
  horizontal margin moved from `mr-0.5` (0.125rem, right only) to `mx-1` (0.25rem, both sides).
- **Fix, round 2 (2026-09-26): the round-1 fix above still centred the two kinds of separator
  against two different reference boxes — `self-center` against a link's real 1.5rem `target-min`
  height, the fixed `mt-1.875` against the current page's plain 1.3125rem text line — so they never
  quite lined up (a pixel review of the built `navigation-breadcrumb--default`/`--long-titles`
  baselines found the current-page separator sitting visibly above the others, not centred on
  them).** `separatorClass` (`Breadcrumb.vue`) no longer takes an `alignCenter` argument or branches
  on position at all: every separator is now a `<span data-part="separator">` frame — `inline-flex
items-center justify-center`, fixed at `h-6` (1.5rem = 24px, the same height `target-min` gives a
  link or the ellipsis button), `self-start` against the `<li>`'s own `items-start` — wrapping the
  actual 0.375rem chevron `<svg>` centred inside it. `currentClass` now carries the same `inline-
flex items-center target-min` frame `linkClass` gives its sibling, so a non-wrapping current page
  lines up with a link exactly. That fixed, top-pinned 24px frame is also what keeps a _wrapping_
  current-page title's separator correct with the identical recipe rather than a special case: since
  the frame's own height never grows past 24px regardless of how tall the wrapped `<li>` becomes,
  and it is pinned to the `<li>`'s top edge, it stays centred on the title's first line exactly like
  it would if the title were a single line. `Breadcrumb.spec.ts`'s "separator geometry" tests now
  assert the class-recipe identity across positions directly (sorted class-list equality between the
  separator before a link and the one before the current page, wrapping or not) rather than only
  checking which one Tailwind class name a given position carries, per the review that caught this.
- **Fix (2026-09-26, operator report: "Breadcrumb arrow icons are way, way too small"): the
  separator chevron grows from the spec's own `0.375rem` (`size-1.5`) to `1rem` (`size-4`) —
  superseding the "chevron's own size is unchanged" line in the fix above, which predates this
  report.** The spec's own Sizes row for "Separator" gives `0.375rem`, but the operator judged the
  built result illegible at a glance; `size-4` is this package's own override, recorded here rather
  than silently changed. The chevron still centres inside the same fixed `h-6` (24px) frame
  `separatorClass` (`Breadcrumb.vue`) already gives every separator — see that fix's own comment
  above for why the frame, not the chevron, is what keeps every separator's vertical position
  identical regardless of what it sits beside — so this is a pure size bump with no other geometry
  to reconcile. Stroke width (`1.75`) and colour (`text-muted`, inherited via `currentColor`) are
  unchanged.
- **`Breadcrumb`'s trail links are underlined at rest, not only on hover — the same operator
  ruling as `Link`'s own Deviations entry above ("all link elements... underline by default").**
  The spec's own States row for the Link part ("`muted`, underline hidden (transparent)" at rest)
  predates that ruling; `linkClass` now carries `Link`'s own shared rest recipe (1px at 55% of the
  text colour, thickening to 2px on hover) instead of the old no-underline-until-hover shape. The
  current page (`currentClass`) is unaffected — it was never a link and carries no underline in
  either state.
- **The `<nav>` landmark name and the ellipsis button's accessible name are catalogue messages
  (`breadcrumbLabel`, `showMoreLevels`), not literal strings baked into the template**, following
  this package's own rule that text a component renders on its own — never passed in by a caller —
  goes through `useMessages()`. Icelandic has no single settled UI term for "breadcrumb" the way it
  does for "close" or "search"; `breadcrumbLabel` reads `'Leiðarslóð'` (route/way trail) and
  `showMoreLevels` reads `` `Sýna ${n} þrep í viðbót` `` ("þrep", a rung/step, does not change form
  between one and many) — both judgement calls, recorded here rather than left silent.
- **`Breadcrumb` emits its `BreadcrumbList` JSON-LD (spec "Breadcrumb" → Behaviour & motion: "Emit
  `BreadcrumbList` structured data from the same items") as a `<script type="application/ld+json">`
  inside the `<nav>`, set with `v-text` rather than mustache interpolation or `v-html`.** `<script>`
  is a RAWTEXT element, so Vue's compiler never parses `{{ }}` inside its children the same way it
  never parses them inside a `<textarea>` — the content would render as the literal four characters
  `{{ x }}`. `v-html` would work (a `<script>`'s `innerHTML` setter is a text-content assignment, not
  script execution) but reopens the fragment through the HTML parser, which resolves a `</script`
  substring inside the JSON as the tag's own close and truncates it — a real risk for a label a
  merchant wrote, not a synthetic one. `v-text` sets `el.textContent` directly and skips HTML
  parsing entirely, so nothing inside the JSON can end the tag early. The current page's own `item`
  URL is omitted from its `ListItem`, matching both schema.org's own guidance for a list's last entry
  and this component's rule that the last item is never a link regardless of what `href` it carries.
- **`Pagination` renders as `<button>` elements emitting `update:page` without `hrefForPage`,
  rather than the spec's own literal default `?page={n}`** (controller ruling). A consumer
  driving pagination from in-memory state (a client-side filtered grid, a `Load more`-adjacent
  paged view with no server round trip) has no URL to build, and the spec's own default would have
  forced one anyway. With `hrefForPage` given, every control — page, previous, next — renders as a
  real `<a href>` (or the `linkAs` component, `Link`'s own `as` contract) exactly as the spec describes;
  without it, the same controls are native `<button type="button">`s and the component is
  controlled through `page`/`update:page` instead.
- **`Pagination`'s numbered and compact forms are two sibling subtrees inside one `<nav>`, switched
  by a `@container` query on the root, not one element that changes shape.** The design spec's own
  Behaviour bullet ("Numbered and compact are driven by the same data") reads either way; two
  subtrees was chosen because the two forms are not simply a style change of one control — the
  compact previous/next arrows are icon-only outline buttons with a different accessible name
  ("Previous page") than the numbered form's chevron-plus-text link, and the compact form adds a
  "Page 2 of 12" status with nothing to correspond to in the numbered list. `compact` forces the
  compact form by not rendering the numbered subtree at all, rather than leaving it in the DOM and
  hidden; the default (unforced) case renders both, one `hidden @tablet:flex` and the other `flex
@tablet:hidden`, with `--container-tablet` (`tailwind.css`, declared for exactly this edge —
  see its own comment) as the shared 48rem breakpoint.
- **`Pagination`'s previous/next controls read "Previous page"/"Next page" in both forms**, not the
  spec's own shorter visible "Previous"/"Next" text for the numbered form with a separate,
  unspecified full sentence for the compact icon-only arrows. One message pair (`previousPage`/
  `nextPage`) serves both, which is also the exact pair the task's own message list names.
- **`Pagination` gained a `pageOfTotal(page, total)` message beyond the task's listed set**, because
  the compact form's status ("Page 2 of 12") needs the total baked into the sentence, unlike
  `pageN(n)`'s single-page accessible name — composing it from two separate calls would leave "of"
  untranslated. `pageN` itself grew an optional second parameter (`current = false`) rather than a
  second key, so `pageN(6)` ("Page 6") and `pageN(6, true)` ("Page 6, current page") share one
  translatable sentence instead of a key that exists only to append four words.
- **`Pagination`'s compact status bolds the page numbers inside the sentence by splitting the
  translated string on digit runs (`/(\d+)/`), not by changing the message contract.** The spec's
  own States table gives the numbers `text` weight 600 ("Page **2** of **12**"), but `pageOfTotal`
  is one translated sentence with no seam of its own to carry that markup across locales — a
  regex split on the digit runs a locale's own numerals produce is presentation only (the message
  key, its arity and every translation stay exactly as before; `messages/__tests__/parity.spec.ts`
  sees no change), and works the same way regardless of where in the sentence a locale's word order
  puts the numbers.
- **`LoadMore`'s button is hand-rolled rather than a wrapped `<Button variant="outline">`**, the
  same reason `Drawer`'s own close button is hand-rolled instead of a wrapped `<Button icon-only>`:
  this part needs its own literal `data-part="button"`, and `Button`'s root hard-codes
  `data-part="container"` with no prop to override it. The recipe (`control-h`, `text-button-md`,
  the `eldra-focus` ring, the 98%-scale press) is `Button`'s own `outline` variant, copied rather
  than composed.
- **`LoadMore`'s button stays clickable while `pending`, and is never `disabled`** — the same "a
  loading control is still clickable; the action is already under way" rule `Button`'s own
  `loading` state follows (see that component's own comment). `pending` shows a spinner and sets
  `aria-busy="true"`; a consumer wanting to prevent a duplicate `load` mid-flight guards its own
  handler, the same way a consumer of `Button loading` already must.
- **`Image` gained a `fit?: 'cover' | 'contain'` prop (default `'cover'`, unchanged for every
  existing consumer).** The Image spec is explicit that "the frame always crops; it never
  stretches," but `Lightbox`'s own spec is just as explicit the other way ("Image: fits the stage
  height and width, keeps its aspect ratio (contain)") — a full-resolution photo in a viewer must
  never be cropped. Rather than duplicate `Image`'s frame/media/placeholder/caption machinery in a
  second component for one property, the crop behaviour became a prop; `focal`/`zoom` still apply
  under `cover` and have no effect under `contain` (there is nothing to pan once the whole image is
  always visible).
- **`Lightbox`'s own `label` is `ariaLabel`, per this package's own convention** (an accessible-
  name-only prop is never the bare noun): the viewer has no visible heading of its own to be
  `aria-labelledby`, only `aria-label`.
- **The viewer is unconditionally full screen, at every width — there is no windowed size above a
  48rem viewport.** The design spec's own "Global Constraints" section groups Drawer, Lightbox and
  Search modal together as "full-screen variants … apply below a 48rem viewport," which `Drawer`'s
  own `eldra-drawer-width` utility takes literally (a real windowed default above that edge). The
  Lightbox section itself, though, is unambiguous and stated twice ("Viewer: the full viewport …
  100% × 100%"; "Mobile: The Lightbox is always full screen, at every width") — a specialisation of
  the general rule that is trivially true at every width, not a contradiction of it, since "full
  screen below 48rem" is a subset of "full screen everywhere." The one behaviour that genuinely
  does change at that viewport edge is the close button's own size (spec: "2.5rem … 2.75rem below
  48rem"), implemented exactly like `Drawer`'s own close button (`size-10 max-md:size-11`, a real
  `@media` query, no `@container`).
- **Every slide the track scrolls between is a plain `<div data-part="slide">`, not itself the
  `<figure>` the spec's own anatomy names ("Slide: a `<figure>` holding the image").**
  `useCarousel`'s shared `annotate()` puts `role="group"` on whatever element it treats as the
  slide, and axe's `aria-allowed-role` refuses that role specifically on a `<figure>` that also
  contains a `<figcaption>` (proven live: only the captioned images in this component's own tests
  failed it; the uncaptioned ones did not) — the same shape as `Carousel`'s own `<li>` exception,
  just discovered one level deeper. `Image`'s own `caption` prop already renders the real
  `<figure>`/`<figcaption>` pairing one level inside this wrapper, so the caption is still a real
  `<figcaption>` of a real `<figure>`, just not the element carrying the group semantics.
- **Message vocabulary is `*Image`, never `*Slide`, anywhere in this component** (`previousImage`/
  `nextImage`/`imageOf`/`goToImage`), even where the design spec's own wording for the thumbnail
  strip reuses `Carousel`'s literal dot phrasing ("With thumbnails" → "each 'Go to slide n'"). A
  Lightbox viewer shares its track with `Carousel` as an implementation detail this package's own
  users never see; every string this component renders says "image," matching every other word in
  its own spec section (arrows, accessibility notes, anatomy).
- **The visible counter is not bolded on its current number**, for the identical reason `Carousel`'s
  own counter is not (see that component's own Deviations entry): it is `aria-hidden` and rendered
  from one localized `messages.counter(n, max)` string that cannot be split back apart by character
  position across locales.
- **`←`/`→` are handled on the `<dialog>` root itself, not through `useCarousel`'s own
  `onTrackKeydown` bound to the track.** The spec's own Keyboard row is explicit that these keys
  work "from anywhere in the viewer," not only a focused track — binding both the root's own
  listener and `onTrackKeydown` on the track would double-fire `next()`/`prev()` whenever the track
  itself holds focus, so this component reimplements the two-line key check once, at the root,
  instead.
- **No `dismissable` prop, unconditionally the opposite of `Drawer`'s own unconditional rule.** The
  spec's own words are as direct as `Drawer`'s: "There is no backdrop click: the viewer fills the
  viewport and its ground is part of the viewer" — `useDialog`'s `dismissable` option is passed a
  literal `false`, never a prop.
- **A disabled arrow's icon alone drops to 45% opacity (`disabled:text-background/45`); the border
  stays at its full 70%.** The spec's own States table gives the border and the icon separate
  values at that state ("border: same" / "icon: … at 45% opacity"), so the dimming lives on the
  icon's own `currentColor` rather than a whole-button `opacity-*`, which would fade the border too.
- **Thumbnails have no size/state table of their own in the spec** ("Carousel dots styled as small
  images" is the whole description) — this component's own choice is a `size-12` square, opacity
  60% at rest raised to 100% on hover/selection, and a light `outline` (rather than a `ring`, to
  avoid a `ring-offset-color` arbitrary value against the ground's own `color-mix()` fill) on the
  image showing.
- **Opening at a non-zero `index` moves the track there with no scroll animation, regardless of
  `prefers-reduced-motion`**, unlike every later move (arrows, `←`/`→`, a thumbnail), which scrolls
  smoothly unless reduced motion is on — the spec's own "Opens at index" is a distinct sentence from
  "Moving between images scrolls smoothly." `useCarousel`'s own `goTo` has no per-call override for
  this (and gaining one was judged not worth changing a composable shared with `Carousel`, under
  review concurrently as this task's own dependency), so `Lightbox.vue` temporarily replaces the
  track's own `scrollTo` for the duration of that one synchronous call and restores it immediately
  after — a local decorator, not a change to `useCarousel` itself.
- **Every slide's `Image` (the element that actually carries a `src`) only exists in the DOM while
  the viewer is open — `v-if="model"` on `Image` itself, the slide `<div>` wrapping it staying
  mounted throughout (fix round 1, corrected below).** An earlier draft of this component instead
  relied on the closed `<dialog>`'s own `display: none`, reasoning that "a UA fetches nothing
  inside an element with no layout box" — **true for `loading="lazy"`, false for an eager `<img>`**:
  a plain (non-lazy) `<img>`, which `priority` forces, begins fetching the moment it is _connected_
  to the DOM, independent of any ancestor's `display` — so a `Lightbox` mounted closed next to a
  product gallery (its whole intended usage) downloaded every full-resolution photo immediately,
  never open or not. Caught by code review, not the screenshot harness (every story and every test
  mounted already open, so the closed-state network behaviour was never observed) — fixed by
  gating `Image` on `model` instead. The slide _wrapper_ stays mounted unconditionally on purpose:
  `useCarousel`'s own index/count maths reads `trackRef.value.children.length` directly, and
  keeping that count constant across an open/close transition means neither depends on the
  `MutationObserver` timing a `v-if` on the wrapper itself would introduce (proven live: the
  existing "jumps to the starting index" test, which mounts closed and opens with a non-zero
  `index`, stayed green with no changes once the fix landed on `Image` alone). Every slide stays
  `priority` (eager) once it exists — by definition that is only while the viewer is open, so
  there is no `loading="lazy"` proximity heuristic left to fight (the problem the _original_ task
  hit, when only the current slide was eager and the rest never left that heuristic) and no reason
  to delay any of them once the shopper can already see the current one.
- **The track's own accessible name is the spec's literal "Images" (a dedicated `lightboxImages`
  message key), not `Carousel`'s own "Slides."** Every other string this component renders already
  says "image" rather than "slide" (see `previousImage`/`imageOf`/`goToImage` above) — the track's
  label was the one place that still reused `Carousel`'s `slides` key by oversight, caught by code
  review (fix round 1) since nothing asserted its value.
- **The stage's own 4rem side padding (spec "Sizes": "room for the arrows") lives on each slide,
  not on the scrolling track.** Padding on the track itself (an `overflow-x-auto` element) does not
  shrink what a scroll-snapped, 100%-wide slide's own `clientWidth` shows at rest — it only shifts
  where the content starts, so the very next slide's own padding-width sliver was already visible
  beside the first one before any scrolling happened (caught live in the `Narrow` story's own
  360px-wide baseline, a real peek the spec's own "one slide = 100% of the stage, no gap" rule rules
  out). A slide's own inset costs nothing at the track's box-sizing level — its outer width is still
  exactly the track's own, since border-box already includes the padding — so moving `px-16` there
  removes the peek entirely while the image still loses the 4rem the arrows need.
- **`index`'s two-way binding only reflects `props.index` at the moment the viewer transitions to
  open (or is already open at mount) — it does not reactively re-jump the track if a consumer
  changes `index` while the viewer is already open and visible.** The spec's own Properties wording
  ("set it to the thumbnail that was activated _before opening_") only describes the opening
  moment, which is the only case `watch(model, …, { immediate: true })` actually calls
  `openAtIndex` for; an intentional scope limit, not a gap, but worth stating here since a future
  consumer reading only this file (not the task's own internal report) would otherwise have no way
  to know it was considered.
- **`SearchModal` duplicates `SearchBar.vue`'s view logic (idle/results/none/loading, the grouping,
  the highlight arithmetic, recent-search storage) rather than importing it.** The spec's own words
  are "the same live search … everything else is exactly as the Search bar", which is a behavioural
  contract, not a markup one: the two components share almost no DOM (a floating popup with a boxed
  field versus a modal frame with a borderless one) beyond the `SearchResultsPanel`/`useListbox`
  pair this component reuses directly (`SearchResultsPanel`'s new `flat` prop renders it inline,
  with no border/shadow/radius/open-animation of its own, for exactly this reuse). Extracting the
  view logic into a third shared module was judged a larger refactor than this task's scope, with a
  real cost — `SearchBar.vue` must not be touched by this task, and a shared composable would need
  to keep both its own tests and this component's green at once for a limited win over predictable,
  read-side-by-side duplication.
- **The query is `v-model:query`, not `v-model`/`modelValue`.** The spec's own Properties table
  gives `SearchModal` two independent two-way properties, `open` and `value`; this package's own
  convention already spends `modelValue` on a modal surface's open/closed state (`Dialog`, `Drawer`
  and now this component all use it that way), so the query needed a name of its own rather than
  displacing that convention for one component.
- **The dialog's accessible name is `ariaLabel`, defaulting to `messages.search` ("Search"), not a
  `label` prop.** Package rule: an accessible-name-only prop is always `ariaLabel` (see `Drawer`'s
  own `ariaLabel`), which also keeps it from colliding with the _field_'s own accessible name
  (fixed to `messages.searchTheShop`, exactly as `SearchBar`'s own default, and not exposed as a
  prop — the spec's own Properties table for this component gives the modal no field-label
  override of its own).
- **The three-step `Esc` is handled by a listener bound directly on the `<dialog>`'s `cancel` event
  in the template, not by `useDialog`'s `onCancel` option.** `onCancel` is a plain notification
  `useDialog`'s own listener always follows with an unconditional `close()` — right for `Dialog`/
  `Drawer` ("Esc always closes it"), but this component's first two steps (clear the active option;
  clear the query) must _not_ close it. Vue attaches a native element's template-bound listeners
  while mounting it, before any composable's own `onMounted` runs, so the template's own `@cancel`
  handler is guaranteed to see the event before `useDialog`'s internal one does; it calls
  `stopImmediatePropagation()` on the two steps that must not reach that internal listener at all,
  and does nothing on the third, letting `useDialog`'s own close proceed exactly as it already does
  for `Dialog`/`Drawer`.
- **`/` and `⌘K`/`Ctrl+K` share `shortcutOwner.ts` with `SearchBar`, extended with a `kind`
  parameter (default `'/'`) rather than a second module.** The spec's own rule — "`/` opens it only
  when no SearchBar currently owns the `/` shortcut" — is exactly what claiming the _same_ queue
  `SearchBar` already claims produces: whichever of them mounted first, with its shortcut on, owns
  the key. `⌘K`/`Ctrl+K` needs its own independent queue (`'modal'`) instead, for the spec's "Only
  one search modal on a page may enable it" — a `SearchBar` never contends for it. Every existing
  call site (`claimShortcut(token)`, with no second argument) keeps claiming the `'/'` queue
  unchanged, so `SearchBar.vue` and its tests needed no edit.
- **Choosing a result or "See all" row closes the modal (`close('select')`); submitting the form
  with no active option does not.** The spec's own Enter bullet says an active option "follows the
  link **and closes the dialog**", but is silent on closing for a plain submit to the Search page —
  a deliberate asymmetry this component preserves rather than smooths over by closing on every
  route that leaves the field.
- **No `dismissable` prop.** The spec gives this component no exception to "a backdrop click …
  closes it (desktop and tablet)" the way `Dialog`'s own `dismissable` is. Below 48rem there is no
  backdrop area to click in the first place (the dialog fills the viewport), so the parenthetical's
  own carve-out falls out of the full-screen layout for free, with nothing to gate in script.
- **The full-screen-below-a-48rem-_viewport_ media query is three separate bundled utilities
  (`eldra-search-modal-width`/`-max-height`/`-position`), the same technique `eldra-drawer-width`
  already documents**, rather than one utility or a class-level arbitrary value — width, max-height
  and position are three different CSS properties a consumer can restyle independently through
  `classes.root`, but each one's own desktop number and its full-screen override must travel
  together, the same reasoning `eldra-drawer-width` gives for its own single bundled rule.
- **The radius/border/shadow removed below 48rem is plain `max-md:rounded-none`/`border-0`/
  `shadow-none` on the root, not a fourth bundled utility.** Unlike the three geometry numbers
  above, these three are already independent, token-driven stock Tailwind groups with nothing of
  their own to interpolate — bundling them would only rename three existing groups into one that
  still has to be undone by a consumer restyling just one of them.
- **The Close/Cancel button is two `<button>` elements sharing one `data-part="close"`, toggled by
  `hidden`/`md:hidden` rather than one element whose content and accessible name change with the
  viewport.** The spec draws two genuinely different controls at the two sizes — an icon-only
  button needing `aria-label="Close search"`, and a "Cancel" text button whose own visible text is
  already its accessible name — and an element hidden with `display: none` is already removed from
  the accessibility tree and the tab order, so exactly one of the two is ever reachable at a time
  with no JavaScript viewport tracking required. `classes.close` restyles both, since a consumer
  restyling "the close control" almost always means both of its sizes.
- **`Carousel`'s `perView` reaches the CSS as three inline custom properties on the track, not as
  Tailwind classes** (`--eldra-carousel-per-view-base`/`-md`/`-lg`, written by
  `carouselPerViewStyle`; the `eldra-carousel-track` utility resolves them into
  `--eldra-carousel-per-view` per container-query breakpoint). This is a _fix_, not a preference
  (2026-09-27). The component used to build interpolated arbitrary-property classes
  (`` `[--eldra-carousel-per-view:${n}]` ``, plus `@tablet:`/`@content:` steps), and Tailwind has no
  runtime: it scans source _text_ for class names, and an interpolated value is never in that text.
  A consumer's build (`@import '@eldrajs/ui/tailwind.css'`, whose `@source './'` scans `dist/*.js`)
  therefore emitted no rule for any of the three, `eldra-carousel-slide`'s width formula fell back
  to its own `1`, and every carousel rendered one full-width slide — the starter's testimonials,
  product row, `split-carousel` hero and `carousel` gallery all at once. The package's own Storybook
  hid it, because its `@source '../src'` happens to scan the very `.vue` file whose template literal
  holds the pattern. An inline style needs no scanner, so the numbers stay fully dynamic while the
  compiled CSS stays entirely static; `src/__tests__/source-scan.spec.ts` compiles what a consumer's
  own stylesheet says, against `dist`, and asserts both container-query steps reach it. The
  guarantee generalises: **no class name in this package is ever built by interpolating a value.**
- **`Breadcrumb` resolves a component `linkAs` to something focusable itself, rather than requiring
  the component to expose a `focus`.** The spec's "activating the ellipsis moves focus to the first
  revealed link" has to hold for a component `linkAs` (a `NuxtLink`/`RouterLink` wrapper — the shape
  most consumers pass), where Vue hands a `:ref` callback the component's _public instance_, not its
  root element. The component now prefers an exposed `focus()` when there is one — a wrapper may
  have a better target in mind than its own root — and otherwise falls back to the instance's `$el`,
  guarded by its own `focus` check so a fragment root (whose `$el` is a comment node) is a no-op
  rather than a throw. Before this (fixed 2026-09-27) the ref was cast straight to `HTMLElement`,
  which reached a component's `focus` only when that component happened to expose one and did
  nothing at all otherwise: the guarantee was silently the consumer's, not the package's.
- **A `classes` part given an array is flattened, and warned about once per component and part in
  dev.** `classes` is one class string per part, and TypeScript says so — but a JavaScript consumer,
  a `v-bind` of an untyped object and a value out of JSON all reach `partClass` anyway, and
  `Object.entries(['flex', 'gap-4'])` reads an array's _indices_, so an array used to render
  `class="0 1"`: two classes that style nothing, in place of the two that were written. `cx` now
  flattens one the way Vue's own `:class` array syntax does, and `partClass` names the component and
  the part in a single dev `console.warn` (`import.meta.env.DEV`, so production carries neither the
  message nor the check). The component name comes from `getCurrentInstance()`, which is set while a
  component renders — where every `classes` computed is first evaluated — so no call site had to
  change.
- **`formatDate` takes an `Intl.DateTimeFormatOptions` subset as a third argument**
  (`FormatDateOptions`: `day`, `month`, `year`, `weekday`), with every omitted key keeping the
  spec's own `12 Sep 2026` default rather than dropping that part from the output — so
  `{ month: 'long' }` is a one-key change to the long form. The spec describes one rendering of one
  date; a block that needs two (the starter's `article` renders the long form for a wide block and
  the short one for a narrow, switched by a container query) would otherwise have to reach for
  `Intl.DateTimeFormat` directly and lose the ISO-parsing, invalid-date and never-throw guards this
  helper exists for. The never-throw contract extends to the options themselves: `Intl` throws a
  `RangeError` for a value outside its own enums, and this runs inside a `computed`, so a bogus
  value falls back to the default style and warns once in dev instead.
- **`VariantPicker` takes a `legend` prop separate from `name`.** The spec's Properties table gives
  `name` two jobs — the radios' shared native `name` _and_ the visible legend — which a page
  rendering more than one picker cannot satisfy at once: giving each picker a unique group key
  (`size-<sku>`, a `useUiId()` value) so their radios don't join one group also printed that key
  above the pills and, because a `<fieldset>`'s `<legend>` is the group's accessible name, read it
  out to a screen reader. `legend` is what a shopper reads, `name` stays the grouping key, and
  `name`'s own behaviour is unchanged whenever `legend` is absent — so every caller written against
  the spec's single-prop shape keeps working.
