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
  motion, z-index), declared on `:root` with the spec's defaults, plus a
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

   | Component           | CSS variables                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
   | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `Avatar`            | `--eldra-avatar-initials-size-{sm,md,lg,xl}` (defaults `0.76rem`/`0.95rem`/`1.33rem`/`2.28rem`, "38% of diameter" — no token of its own), `--eldra-avatar-initials-tracking` (default `0.02em`), `--eldra-avatar-icon-size-{sm,md,lg,xl}` (defaults `0.857rem`/`1.071rem`/`1.5rem`/`2.571rem`, the spec's own lg number scaled proportionally to the other three diameters)                                                                                         |
   | `Badge`             | `--eldra-badge-line-height` (default `1`) — the badge text's line ratio, no token of its own                                                                                                                                                                                                                                                                                                                                                                        |
   | `Button`            | `--eldra-button-radius` (default `var(--eldra-radius-md)`), `--eldra-button-line-height` (default `1.2`), `--eldra-button-font-size-lg` (default `1.0625rem`, the one button size with no type token of its own)                                                                                                                                                                                                                                                    |
   | `Checkbox`          | `--eldra-checkbox-radius` (default `var(--eldra-radius-sm)`), `--eldra-checkbox-border-width` (default `1.5px`), `--eldra-checkbox-border-width-invalid` (default `2px`)                                                                                                                                                                                                                                                                                            |
   | `ContentCard`       | `--eldra-content-card-title-line` (default `1.3`) — the title's line ratio, no token of its own; `--eldra-content-card-excerpt-size` (default `0.9375rem`) and `--eldra-content-card-excerpt-line` (default `1.5`) — the excerpt's own size and line ratio, shared by `FeatureCard`'s `body` (`text-content-card-excerpt` in `tailwind.css`), since both read the same spec number                                                                                  |
   | `EditorPlaceholder` | `--eldra-editor-placeholder-border-width` (default `1.5px`) — the dashed boundary's width, distinct from `EmptyState`'s own stock `border` (1px)                                                                                                                                                                                                                                                                                                                    |
   | `EmptyState`        | `--eldra-empty-state-title-line` (default `1.3`) — the title's line ratio, no token of its own                                                                                                                                                                                                                                                                                                                                                                      |
   | `FieldWrapper`      | `--eldra-field-note-line-height` (default `1.45`) — the line the help and error text share                                                                                                                                                                                                                                                                                                                                                                          |
   | `Image`             | `--eldra-image-hatch-gap` (default `0.75rem`) — the live "No image" placeholder's diagonal-line repeat distance                                                                                                                                                                                                                                                                                                                                                     |
   | `Input`             | `--eldra-input-radius` (default `var(--eldra-radius-md)`), `--eldra-control-font-size` (default `0.9375rem`), `--eldra-control-font-size-mobile` (default `1rem`), `--eldra-control-line-height` (default `1.5rem`), `--eldra-field-border-width` (default `1px`)                                                                                                                                                                                                   |
   | `Link`              | `--eldra-link-radius` (default `2px`) — the focus ring's corner radius on every variant                                                                                                                                                                                                                                                                                                                                                                             |
   | `LogoItem`          | `--eldra-logo-image-max-height` (default `2.5rem`), `--eldra-logo-image-max-width` (default `9rem`) — the logo image's contain box; `--eldra-logo-wordmark-size` (default `1.25rem`) — the wordmark fallback's font size (its weight, line-height and letter-spacing reuse `h2`/`h3` tokens directly, see `text-logo-wordmark` in `tailwind.css`)                                                                                                                   |
   | `MultiSelect`       | everything `Select` reads, plus `--eldra-select-pill-line` (the "+N" pill's line box) and `--eldra-checkbox-radius`/`--eldra-checkbox-border-width`, shared with `Checkbox` so a consumer restyles both at once                                                                                                                                                                                                                                                     |
   | `Price`             | `--eldra-price-current-sm-size` (default `0.9375rem`), `--eldra-price-current-lg-size` (default `1.5rem`) — only `sm`/`lg` need one: `md`'s current price inherits the surrounding text, and `compareAt`/`from`/`unit` scale off whichever size the root sets (`0.9em`, a literal ratio the spec itself gives, and a fixed `0.8125rem`), so neither needs a variable of its own                                                                                     |
   | `UnitInput`         | `Input`'s exactly, because it draws `Input`'s box: `--eldra-input-radius`, `--eldra-control-font-size`, `--eldra-control-font-size-mobile`, `--eldra-control-line-height`, `--eldra-field-border-width` (`CurrencyInput` is a `UnitInput`, so the same)                                                                                                                                                                                                             |
   | `QuantityStepper`   | `--eldra-stepper-radius` (default `var(--eldra-radius-md)`)                                                                                                                                                                                                                                                                                                                                                                                                         |
   | `RadioGroup`        | `--eldra-radio-card-border-width` (default `1px`) and `--eldra-radio-card-radius` (default `radius-md`) for the card boundary; `--eldra-checkbox-border-width`/`-invalid` for the radio circle itself, shared with `Checkbox`                                                                                                                                                                                                                                       |
   | `SearchBar`         | `--eldra-search-panel-max-height` (default `32rem`, clamped to `70vh`), `--eldra-search-text-line`, `--eldra-search-empty-line`, `--eldra-search-kbd-line`, `--eldra-input-radius`, `--eldra-field-border-width`, `--eldra-z-popover`, and `--eldra-popover-origin` (set by the panel itself from the placement it resolved to: `top left` below the field, `bottom left` above it)                                                                                 |
   | `Select`            | `--eldra-select-panel-max-height` (default `20rem`), `--eldra-select-panel-max-width` (default `22rem`, clamped to `90vw`), `--eldra-z-popover` (default `30`), `--eldra-field-radius`, `--eldra-field-border-width`, `--eldra-select-group-tracking`, `--eldra-select-option-line`, `--eldra-select-swatch-edge`, the `--eldra-select-match-*` trio, and `--eldra-popover-origin` (`top left` / `bottom left`, set by the panel from the placement it resolved to) |
   | `StockBadge`        | `--eldra-stock-status-line` (default `1.4`) — the status line text's line ratio, no token of its own                                                                                                                                                                                                                                                                                                                                                                |
   | `Switch`            | `--eldra-switch-radius` (default `var(--eldra-radius-full)`), `--eldra-switch-track-border-width` (default `1.5px`), `--eldra-switch-thumb-offset` (default `0.1875rem`, the thumb's rest inset from the track's start edge)                                                                                                                                                                                                                                        |
   | `Textarea`          | `--eldra-textarea-radius` (default `var(--eldra-radius-md)`), `--eldra-textarea-min-height` (set from the `minHeight` prop, default `5rem`), `--eldra-counter-line-height` (default `1.5`)                                                                                                                                                                                                                                                                          |

   A component not listed here reads only the shared tokens from layer 1.

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
5. **`as`**, on the components whose spec allows a different rendered element (`Button`, `Link`,
   `Badge`, `Container`, `Section`, `ContentCard`, `FeatureCard`, and the rest of the display/layout
   components landing in this sub-project). `Button`, `ContentCard` and `FeatureCard` render an
   `<a>` automatically when `href` is set, without needing `as` for that case; `Badge` defaults to
   `<span>` and is never a link; `Section` picks `<section>`/`<div>` itself from whether it is named
   (`as` overrides that choice outright, for a `<header>`/`<footer>` landmark that needs no name of
   its own).

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

### Layering

A popup panel rendered inside its own control is at the mercy of everything above it on the page.
An ancestor with `overflow: hidden` — a rounded card, a table cell, a carousel track, a scrolled
column — clips it at that ancestor's edge; and any element that starts its own **stacking context**
(a sticky header with a `z-index`, a section with `isolate`, anything with a `transform`, `filter`
or `opacity` below 1) paints over it whatever the panel's own `z-index` says, because a `z-index`
only orders siblings within one context.

So `Select`, `MultiSelect` and `SearchBar` render their panel through a `<Teleport>` to
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
  the viewport, and its `overflow` clips the panel exactly like any other ancestor. The starter's
  `UiDrawer` is one such element (it slides on a `transform`). Point `teleport` at something plain,
  or leave it at `body`.
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

`teleport` is a prop on all three controls and an option on `usePopover`: `true` (default), a CSS
selector string for a target of your own, or `false` to keep the old in-place `absolute` rendering
when you know nothing above the control clips or stacks over it.

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

| Component              | Wraps             | Field value                                          |
| ---------------------- | ----------------- | ---------------------------------------------------- |
| `FieldInput`           | `Input`           | `string`                                             |
| `FieldTextarea`        | `Textarea`        | `string`                                             |
| `FieldUnitInput`       | `UnitInput`       | `number \| null` (`null` is an empty field)          |
| `FieldCurrencyInput`   | `CurrencyInput`   | `number \| null` (`null` is an empty field)          |
| `FieldCheckbox`        | `Checkbox`        | `boolean` (one consent box)                          |
| `FieldCheckboxGroup`   | `CheckboxGroup`   | `string[]` (one question, several answers)           |
| `FieldRadioGroup`      | `RadioGroup`      | `string`                                             |
| `FieldSwitch`          | `Switch`          | `boolean`                                            |
| `FieldSelect`          | `Select`          | `string`                                             |
| `FieldMultiSelect`     | `MultiSelect`     | `string[]`                                           |
| `FieldQuantityStepper` | `QuantityStepper` | `number`                                             |
| `FieldVariantPicker`   | `VariantPicker`   | `string` (`name` is the visible legend — see `path`) |
| `FieldSearchBar`       | `SearchBar`       | `string`                                             |

Each takes `name` (the control's native `name`, and by default the field's path too), optional
`path`, optional `rules` (vee-validate's own `RuleExpression`: a rule string, an object, a function,
or a typed schema) and optional `label` — the name a rule message uses for the field, not a visible
label. Everything else its component takes is forwarded untouched, slots, `classes` and attributes
included; the props it keeps back are `modelValue`, `invalid` and `error`, which are `Omit`ted from
the type so passing one is a compile error rather than a prop that silently does nothing.

**`path` is for the one control whose `name` is visible.** A `VariantPicker`'s `name` is the option
name — "Size", "Colour" — drawn in the legend as well as used as the radios' shared native name, so
without `path` the field would be called `Size` in `initialValues`, `validationSchema`, `apiErrors`
and the `errors` slot prop, and either the legend or the key would have to be wrong:

```vue
<!-- the legend reads "Size"; values.size holds the choice -->
<FieldVariantPicker name="Size" path="size" :options="sizes" />
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

  `ChipGroup` (`modelValue: string[]`, `label`, `disabled`) is a slot wrapper like `ButtonGroup` —
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
- **`createNumberFormat` / `formatNumber` / `parseLocaleNumber` / `localeSeparators` /
  `currencyFractionDigits`** (`src/utils/number-format.ts`) — locale-aware number formatting and
  its inverse, behind the numeric controls and exported for use outside them.
  `currencyFractionDigits` is the one no component here calls: `UnitInput` and `CurrencyInput`
  keep the private library's rule that `maxFraction` is `2` whatever the currency, so it is
  exported for a consumer who wants the currency's own minor unit instead (`0` for ISK, `3` for
  KWD, read from ICU).
- **`FormLayout`'s `statusMessage` and `focusOnInvalid`, `Form`'s `successMessage`, and
  `FieldBinding`'s `path`** — each named in the deviations below, where the reason is.

## Deviations

Additions and departures from the design spec, and why.

- **The stretched-link + proxy-focus pattern is factored into `src/components/card/stretchedLink.ts`,
  shared by `ContentCard` and `FeatureCard`.** Both spec sections describe the identical shape —
  the card root proxies the ring for a visible title `<a>` that stretches to cover the whole card
  via `after:absolute after:inset-0` — so it is one exported set of class strings
  (`CARD_FOCUS_PROXY`, `STRETCHED_LINK`, `STRETCHED_LINK_OUTLINE`) rather than duplicated per
  component. `ProductCard`, landing in the same wave, wants the identical pattern; point it at this
  file instead of a third copy. The title link uses `outline-none`, not `Rating.vue`'s
  `outline-hidden`: `outline-hidden` stays visible under forced colours by design, which here would
  draw a second, text-sized ring beside `eldra-focus-proxy`'s own card-wide one — the spec's own
  acceptance criterion for the sibling Product card rules that out ("the link shows no separate
  ring"). See `stretchedLink.ts`'s own comment for the rest of the reasoning.
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
  directly, which does nothing to fix the trap task-2-fix-1.md found in `Price`: a percentage width
  inside a shrink-to-fit ancestor (`inline-flex`/`inline-block`) collapses to nothing regardless of
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
  (`"size-<productId>"`) — this component does not namespace it.
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
  but a `VariantPicker`'s `name` is also its **visible** legend, so one `name` would have had to be
  both the option name a customer reads and the key in `values`. `path` separates them and defaults
  to `name`, so nothing else in the entry changes shape.
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
  `@tabler/icons-vue` dependency** (plan 2, task 1 decision). The spec fixes both the colour and
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
  (plan 2, task 3 decision), rather than the spec's separately worded linked hidden text ("the link
  text is the visible value + '128 reviews' + visually hidden ', rated 4.5 out of 5'"). The task
  brief scopes the new message vocabulary to exactly `rating` and `noReviews`; setting the same
  tested sentence as the `<a>`'s own `aria-label` — with the visible value/count marked
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
- **The starter's `UiImage` is a thin wrapper over `Image`, not a replacement** (task-7 ruling,
  2026-09-25; the plan's own wording said "replace `UiImage`"). `Image` must stay standalone of
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
- **Fix round 1 (task-7-fix-1.md, 2026-09-25): `UiImage` gained `rounded`/`fill`/`fit`/`classes`,
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
- **`AvatarGroup`'s `max` is clamped to 0–3, whatever is passed.** The spec's Avatar section gives
  `max` a default of `3` and, separately, an unconditional acceptance criterion: "Groups never show
  more than four circles in total." Those two only agree if `max` itself never exceeds `3` — three
  avatars plus one "+N" counter — so the prop is clamped rather than trusted, and a caller who
  passes `max="10"` still sees at most four circles.
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
- **Fix round 2 (task-7-fix-2.md, 2026-09-25): the navigation logo dropped `UiImage` entirely, and
  `fit="contain"` now also shrink-wraps the frame.** Two open findings from the round 1 re-review:
  - **The navigation block's logo was still routed through `UiImage`** with a bare
    `class="h-8 w-auto"`, the exact class-lands-on-the-root problem round 1 fixed everywhere else —
    missed because the fix brief's own scope named five blocks and not this one. The logo is not a
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
