# @eldrajs/ui changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- `@eldrajs/ui/resolver` — `EldraUiResolver({ prefix = 'Eldra' })`, a plain
  `unplugin-vue-components` resolver (`{ type: 'component', resolve(name) }`) resolving
  `<prefix><Name>` for every component the root entry exports (default prefix `Eldra`; never `Ui`).
  Backed by a hand-maintained `src/componentNames.ts`, guarded against drift from `src/index.ts` by
  a test that imports the real entry and compares its component keys.
- `README.md` reorganised into the design spec's section list (Install, Styles, Fonts,
  Customisation, Messages, Composables, Resolver, the forthcoming `./vee-validate` entry,
  Accessibility and testing, Deviations) and its Deviations list completed with every recorded
  departure from the spec for `Button`, `Link`, `Input`, `Textarea` and `VariantPicker` that had not
  made it there yet. `docs/ui.md` added to the kit's docs.
- `SearchBar` — the storefront search field with a live, grouped results panel: a real
  `<form role="search" method="get" :action>` with the field named `q`, so `Enter` with no active
  row reaches the Search page with or without scripting (`submit` fires with the query first and
  prevents nothing). The field is a `role="combobox"` (`aria-expanded`, `aria-controls`,
  `aria-autocomplete="list"`, `aria-activedescendant`, `autocomplete="off"`) and the results panel
  is a **non-modal popup**, never a dialog: it is positioned with `useFloating` against the field
  (matching its width), closed by `useOverlay`, and focus never leaves the caret — rows are reached
  through `aria-activedescendant` and a pointer press inside the panel does not blur the field.
  Four views, exactly one at a time: `idle` (recent rows, a row that empties them, then popular
  chips), `results` (Products max 4, Collections max 3, Journal and help max 3 — articles then
  pages — then "See all N results"), `none` (the query by name, one line of advice and the popular
  chips as suggestions) and `loading`, which appears only once a request has been in flight for
  300ms so a fast response never flickers the panel. Matches are marked with weight and an
  underline (a `<mark>` with no background), ignoring case and accents; the active row is marked by
  a fill, an arrow and `aria-activedescendant`, never colour alone. `/` anywhere on the page focuses
  the field (never while someone is typing elsewhere), `ArrowDown`/`ArrowUp` walk every row across
  groups without wrapping, `Enter` follows the active row (or fills the field from a recent row or
  chip, or submits), `Escape` clears the active row, then the query, then closes, and `Tab` closes
  and moves on — options are never in the tab order. Only one search bar on a page answers `/`: the
  first one mounted with `shortcut` on owns it and hands it to the next when it unmounts. A visually
  hidden polite live region announces "4 results for “mer”", or "No results for “teapot”", 400ms
  after typing stops. Recent searches live in `localStorage["eldra-ui:recent-searches"]` when
  `recent` is not given: read on mount and **written when a search actually happens** — the form is
  submitted, or a row is followed — most recent first, deduplicated without regard to case, capped
  at 5, with every storage call wrapped so a browser that refuses simply keeps no history. "Clear
  recent searches" empties them and emits `clearRecent`. A query with no `results` yet shows no
  panel at all (and, after 300ms, the loading view): the "no results" view is an answer from the
  shop, not the absence of one. `size` is `"md"` or `"lg"`, `pill` rounds the
  field fully, `autofocus` is for the Search page, `resultTypes` picks the groups, `showRecent`
  turns the history off, and `classes`/`messages`/the `item` and `empty` slots are the styling and
  content hooks. New type utilities `text-search-meta`, `text-search-title` and `text-search-kbd`,
  and a new `eldra-search-panel-height` (`min(32rem, 70vh)`, on Tailwind's `max-h` merge group).
- New composable `usePopover` (exported from the package root): the open/closed life of a non-modal
  popup anchored to a control — the "only one open at a time" registry, `useOverlay`'s closing
  rules, `useFloating`'s position plus the two entrance variables the keyframes read, the open →
  activate → `afterOpen` sequence, and the label-forwarded-click latch. `Select`, `MultiSelect` and
  `SearchBar` all open their panel with it; it replaced ~160 lines that were line-identical between
  the first two, and neither their tests nor their screenshot baselines moved.
- New messages `noResultsFor(query)`, `searchSuggestions`, `searchProducts`, `searchCollections`,
  `searchJournal` and `searchAdvice`. `clearRecent` is now the spec's own "Clear recent searches"
  (it was "Clear recent"), and `resultsCount` and `viewAllResults` both take an optional second
  argument: `resultsCount(4, 'mer')` is "4 results for “mer”" and `viewAllResults(12, 'mer')` is
  "See all 12 results for “mer”", while the one-argument call is unchanged apart from
  `viewAllResults`' verb ("See all N results", was "View all N results" — `is-IS` already said
  "Sjá allar").

- `VariantPicker` — a native radio group in a `<fieldset>` for a product option (size, colour):
  pills (default) or swatches. `modelValue` is two-way, defaulting to the first available option;
  `name` is used unmodified as the shared native radio `name` and in the legend ("Size: M"). Every
  radio shares one `name`, so arrow keys move and select natively — no key handling of any kind
  lives in the component. `options[].available: false` marks a sold-out option or combination: it
  stays selectable (never `disabled`), draws a struck-through pill or swatch, and adds ", sold out"
  to its accessible name (`messages.soldOut`) and to the legend when it is the selected value.
  Swatches carry the one per-item colour the spec allows (`options[].swatch`) as an inline style;
  the disc's edge is a real `border-strong` boundary (not a shadow), so pale colours stay visible
  at a 3:1 boundary in forced-colours mode, and the colour name is `sr-only` text inside the label,
  never colour alone. The sold-out diagonal line — on both pills and swatches — is an inline SVG
  `<line stroke="currentColor">` rather than a `background`/`box-shadow` trick: the pill's own line
  needs `vector-effect="non-scaling-stroke"` to stay a constant 1px regardless of the pill's
  label-dependent width, and forced-colours mode drops `background-color`/`box-shadow` outright, so
  only a real stroke survives there for either shape. New type utilities `text-variant-legend`/
  `text-variant-pill` (size and line only, so the two weights each needs are the stock
  `font-normal`/`-medium`/`-semibold` utilities, not baked into the shorthand); new border-width
  utilities `eldra-variant-pill-border`/`eldra-variant-swatch-ring`/`eldra-variant-swatch-edge`;
  new inset-line utility `eldra-variant-pill-selected-line` for the sold-out-and-selected pill's
  2px boundary, the same technique `eldra-radio-card-selected` uses.
- `QuantityStepper` — a decrease/input/increase group for a basket quantity, never reaching 0.
  `modelValue` is two-way (default `min`); `min`/`max` default `1`/`99`; `size` is `"md"` or
  `"sm"`; `itemName` is appended to both button names ("Increase, Stoneware mug") for use in a
  list of several lines; `error` renders the same error row a `FieldWrapper` draws, linked by
  `aria-describedby`; `locale` (default `"en-US"`) drives display formatting and parsing of a
  typed value. Pressing a button, or `ArrowUp`/`ArrowDown` in the field, steps by 1 and clamps to
  `[min, max]`, firing `change` once — never per keystroke. A typed value is rounded to a whole
  number and clamped on blur or `Enter`; a non-number becomes `min`; "0" and values past `max` are
  silently corrected rather than shown as an error. The relevant button is `aria-disabled="true"`
  at a limit (not `disabled`), so it stays focusable. A polite, visually-hidden live region
  announces the settled value once per commit. The field is `type="text"` with
  `inputmode="numeric"` and `role="spinbutton"` (`aria-valuenow`/`-valuemin`/`-valuemax`) rather
  than the design spec's literal `<input type="number">` — see the component's own doc comment:
  a native number input cannot hold a locale-grouped typed value (`is-IS`'s `"1.234"`).
- New utility `src/utils/number-format.ts`: `createNumberFormat`/`formatNumber` wrap
  `Intl.NumberFormat` for a decimal, currency or unit value, and `parseLocaleNumber` turns text a
  person typed in their own locale back into a `number`, deriving the group and decimal separators
  from `Intl.NumberFormat(locale).formatToParts()` rather than assuming an arrangement (so
  `is-IS`'s `"1.234,56"` and `en-US`'s `"1,234.56"` both parse to `1234.56`).
- New message `quantityUpdated(n)`, and new type utilities `text-stepper-value`/
  `text-stepper-value-sm` (the stepper value's 0.9375rem/0.875rem, weight 600, tabular type).
- `Switch` now merges a `FieldWrapper`'s `help` text into its `aria-describedby`, alongside its own
  `description` when it has one (own id first), instead of only ever describing itself.
- `MultiSelect` — the custom multiple select: the same trigger, popover, listbox, search field,
  groups, rich options, keyboard and "only one open at a time" rule as `Select`, with a checkbox on
  every row (`aria-multiselectable="true"`, `aria-selected` per row), a trigger summary of up to
  `maxSummary` labels followed by a "+N" pill, a removable tag list under the control
  (`showTags: false` turns it off) and a panel footer holding a polite live count, Clear and Done.
  `modelValue` is a `string[]`; `change`, `clear`, `open`, `close` and `search` are emitted, and a
  hidden native `<select multiple name>` underneath stays in sync both ways and fires a bubbling
  `change`, so forms post every selected value. Toggling never closes the popover: `Enter` (and
  `Space` without a search field) toggles, `Alt+ArrowUp` toggles and closes, `Tab` walks into the
  footer with the popover still open, `Backspace` in an empty search field takes the last tag off,
  and `Backspace`/`Delete` on the closed trigger clear everything. A `disabled` or `readonly`
  control keeps its tags readable and drops their remove buttons, as it already drops the clear
  button. Slots: `option` (`{ option, selected, active }`), `value` (`{ options }`), `tag`
  (`{ option }`) and `empty`.
- `Select`'s panel is now the same component `MultiSelect` opens. The search field, the listbox, the
  groups, the option rows, the empty state, the press guard that keeps a click inside the panel from
  blurring the focused element, and the active row's scroll-into-view live in one place; the two
  controls differ only in what choosing a row does. Nothing about `Select` changed — every part,
  class and screenshot baseline is identical.
- New messages `selected`, `selectedCount(n)`, `noneSelected` and `done`, and the default
  `multiSelectPlaceholder` is now the spec's `"Any"` (`is-IS`: `"Allt"`) rather than
  `"Select options"`.
- New utilities `text-select-pill` (the "+N" pill's 0.75rem/600 tabular type) and
  `eldra-select-check-radius` (an option checkbox's 0.25rem corner), with the variables
  `--eldra-select-pill-line` and `--eldra-select-check-radius`.
- `Select` — the custom single select: a `<button role="combobox">` trigger over a non-modal
  popover, never the platform's native select UI, with a hidden native `<select name>` (and
  `<optgroup>`s) underneath that stays in sync and fires a bubbling `change`, so forms post the
  value and existing listeners keep working. `modelValue` is two-way; `change`, `clear`, `open`,
  `close` and `search` are emitted. `options` take a `group`, `hint`, `meta` (+ `metaTone`
  `warning`/`danger`), `swatch`, `icon` and `disabled`, and the chosen option's swatch or icon
  shows in the trigger. `searchable` turns itself on past 10 options and puts a search field
  (`role="combobox"`, `aria-autocomplete="list"`, inset focus ring) at the top of the panel;
  filtering ignores case and diacritics, bolds and underlines the matched run, hides groups with no
  matches and shows "No matches for “…”" as real text. `clearable` adds a clear button beside the
  chevron (`Backspace`/`Delete` clear too), `placeholder`, `leadingIcon`, `invalid`, `describedBy`,
  `required`, `disabled`, `readonly`, `size` (`sm`/`md`/`lg`, the same box as `Input`) and
  `placement` (`auto` flips above when there is no room; `above` always opens above) round it out.
  Slots: `option` (`{ option, selected, active }`), `value` (`{ option }`) and `empty`. The whole of
  the design spec's two keyboard tables is implemented, including `PageUp`/`PageDown` by ten,
  `Alt+ArrowUp`, `Escape` clearing the query before it closes, `Tab` closing without trapping
  focus, and type-ahead with a 0.6s buffer. Opening one select closes any other open one.
- `useListbox` — the listbox keyboard and active row, exported from the package root: `Select` and
  the coming `MultiSelect` share it, and so can a control of your own. It owns no DOM; `activeId`
  is what you bind to `aria-activedescendant`, and choosing, clearing and querying are callbacks.
  `normalizeText` is exported with it, for case- and diacritic-insensitive matching.
- New message `noMatchesFor(query)` ("No matches for “…”"), used by `Select`'s empty state when a
  search query is showing; `noResults` is still used when there is none.
- New CSS variables: `--eldra-select-panel-max-height` (`20rem`), `--eldra-select-panel-max-width`
  (`22rem`, clamped to `90vw`), `--eldra-z-popover` (`30`, above the sticky header),
  `--eldra-select-group-tracking`, `--eldra-select-option-line`, `--eldra-select-swatch-edge` and
  `--eldra-select-match-weight`/`-underline`/`-underline-offset`. New utilities
  `eldra-focus-inset-always` (the inset ring on any focus, for a select's search field) and
  `animate-eldra-popover-in` (the popover's entrance, instant under reduced motion; its direction
  comes from `--eldra-popover-origin`/`--eldra-popover-slide` so a panel that flips does not replay
  it), and `eldra-select-option-active`/`-selected`, which give the active and the selected row a
  real boundary under forced colours, where a fill and a weight difference both disappear.
- **Breaking-ish:** the default `selectPlaceholder` message is now `"Select"` (`is-IS`: `"Velja"`),
  the design spec's own default, rather than `"Select an option"`.

- `useOverlay` and `useFloating` — the two composables every **non-modal** popup in this package is
  built from (Select, Multi-select, the Search bar's results panel), exported from the package root
  so a consumer can build one of their own. Neither traps focus: the design spec reserves
  `<dialog>` and focus traps for modal surfaces and says these popups are not dialogs, so `Tab`
  always moves on and focus landing outside is what closes the popup.
  `useOverlay({ open, trigger, content, setOpen, closeOnOutsideClick?, closeOnEscape?,
  returnFocus? })` returns `{ close, focusFirst, focusables }` and listens on `document` only while
  `open` is `true` — a captured `pointerdown` outside the trigger, the content, or any element
  under `data-eldra-overlay-owner="<the content's id>"` (so a teleported panel still counts as
  inside); a bubbling `focusout` whose new owner is outside; and a bubbling `Escape`, which it both
  `preventDefault()`s and stops, so a popup inside a native `<dialog>` does not close the dialog
  behind it. `returnFocus` (default on) puts focus back on the trigger on `Escape` and when focus
  went nowhere, and never pulls it off the element a pointer press just moved it to. Every listener
  comes off when the overlay closes or the scope is disposed.
  `useFloating(reference, floating, { placement?, offset?, matchWidth?, flip? })` wraps
  `@floating-ui/vue` (`autoUpdate`, `offset`, `flip`, `shift`, `size`) and returns
  `{ styles, placement, update }`. `placement` takes the design spec's own words — `auto` (below,
  flipping above when it does not fit) and `above` (always above, never flips) — as well as the
  four concrete `bottom`/`bottom-start`/`top`/`top-start` values, and `flip` overrides either
  default. `styles` is a plain `:style` object (`position`, `top`, `left`, plus `minWidth` under
  `matchWidth`) rather than a transform, leaving `transform` free for the popover's own open
  animation. `matchWidth` is a floor, not a fixed width — the spec's popover is "min width =
  trigger, grows to fit its content up to min(22rem, 90vw)", and that clamp is the panel's own
  `max-width`.

- `Switch` — an on/off control for a setting that takes effect immediately, `<button type="button"
  role="switch" aria-checked>` with the visible label as its own content (so the accessible name
  matches the screen) and no key handling of its own: `Space`/`Enter` toggle for free from a real,
  native button. `modelValue` is two-way and `change` fires with the new boolean; `size` is `md`
  (2.75 × 1.5rem track) or `sm` (2.25 × 1.25rem, filter bars); `description` adds a second `muted`
  line, linked by `aria-describedby` and kept `aria-hidden` so it never joins the accessible name;
  a hidden `<input type="checkbox">` mirrors `modelValue` and carries `name` for a plain form
  submit, disabled exactly when the switch is. On/off is shown by the thumb's position and a check
  icon as well as colour, never colour alone; the thumb slides and the track fills over
  `duration-fast`, both owning their own transition since neither carries the focus ring (the
  button does, at the spec's `radius-sm` corner). Per-part `classes` for `root`, `track`, `thumb`,
  `label` and `description`. Inside a plain (non-group) `FieldWrapper`, a `Switch` drops its own
  `label` part and takes the wrapper's id, the same shape `Checkbox`'s `labelsControl` uses — not
  part of the design spec, which never discusses a Switch inside a field wrapper, but named
  explicitly by the task. CSS variables: `--eldra-switch-radius` (default `radius-full`),
  `--eldra-switch-track-border-width` (default `1.5px`) and `--eldra-switch-thumb-offset` (default
  `0.1875rem`, the thumb's rest inset from the track's start edge).
- `@eldrajs/ui/tailwind.css` gains `eldra-switch-track-border`, `eldra-switch-thumb-offset`,
  `text-switch-label` and `text-switch-description` (the Switch's own border-width, thumb-inset and
  type-style utilities, none of them a spacing-scale multiple or an existing type token).
- `RadioGroup` — a native radio group in a `<fieldset>` with a `<legend>`, one shared `name`
  (generated when you give none) and no key handling of its own: arrow keys, wrapping, skipping
  disabled options, and the group's single tab stop are all native `<input type="radio">`
  behaviour. `modelValue` is the two-way selected value and `change` fires with it; `options` is
  `{ value, label, hint?, meta?, disabled? }[]`, and `label`/`hint`/`meta` are also scoped slots.
  `layout` is `vertical` (default), `row` (wraps, for short labels) or `cards` — the whole option
  becomes a bordered card with `meta` pushed to the end in tabular numerals, selection shown by a
  filled radio, a `surface` fill and a 2px `primary` border (never colour alone). `size` (`md`/`lg`)
  changes the radio in plain layouts only; a card's radio is always `md`. `required` is native, on
  every radio. `error` sets `aria-invalid="true"` on **every radio** (unlike `CheckboxGroup`'s,
  which stays on the fieldset) and links the message by `aria-describedby`, drawn by the same row
  `FieldWrapper` and `CheckboxGroup` use. The focus ring is drawn on the radio in every layout,
  including cards, through the same `eldra-focus-proxy` utility `Checkbox` uses. Per-part `classes`
  for `root`, `legend`, `options`, `option`, `radio`, `label`, `hint`, `meta`, `error` and
  `errorIcon`. CSS variables: `--eldra-radio-card-border-width` (default `1px`),
  `--eldra-radio-card-radius` (default `radius-md`); the radio circle itself reuses
  `--eldra-checkbox-border-width`/`-invalid`, since the spec gives it the same numbers.
- `Checkbox` inside a `FieldWrapper` — a plain wrapper already renders a `<label for>` naming the
  box, so the box no longer renders a second `<label>` of its own (its root becomes a `<span>`);
  one control, one label. The control is now positioned over the drawn box rather than `sr-only`
  inside it, so the box stays clickable with no label of its own to click through. The spec's
  single-consent shape — the sentence beside the box — is `<FieldWrapper group>`. `FieldContext`
  gains `labelsControl`, which also stops `Checkbox`, `Input` and `Textarea` adopting the context
  `id` inside a `group`, where that id belongs to the `<fieldset>` itself.
- `Checkbox` — an invalid box that is checked or indeterminate keeps its `primary` fill and its
  mark; the error is the 2px `danger` boundary alone. A `background` fill under a
  `primary-contrast` mark drew the tick in the page's own colour.
- `Checkbox` — the tick and the dash are drawn at the sizes the spec gives them (tick 0.625 ×
  0.3125rem, dash 0.625rem wide, both 2px).
- `CheckboxGroup` — `classes` gains an `errorIcon` key, and the error row is now the same
  component a `FieldWrapper` draws.

- `Checkbox` — a native `<input type="checkbox">`, visually hidden inside its own `<label>` so the
  whole row (box, label, hint) is the click target and is at least 1.5rem tall, drawn as a box with
  a tick or a dash. `modelValue` is two-way and `change` fires with the new boolean; `indeterminate`
  sets the native property (re-applied after every toggle, because activating a checkbox clears it
  in the browser) and `aria-checked="mixed"` beside it, with `controls` naming the children an
  indeterminate parent stands for. `size` is `md` (1.125rem box, nudged onto the first text line) or
  `lg` (1.5rem, top-aligned); `hint` adds a `muted` second line under the label; `value`/`name` are
  the native form values; `invalid`, `required`, `describedBy` and `id` fall back to the
  `FieldWrapper`'s context exactly as `Input`'s do. Because the input is hidden, the standard focus
  ring is drawn on the **box** through the new `eldra-focus-proxy` utility — the focus-ring
  foundation's "Proxy focus" rule. Per-part `classes` for `root`, `box`, `check`, `label` and
  `hint`. CSS variables: `--eldra-checkbox-radius` (default `radius-sm`),
  `--eldra-checkbox-border-width` (`1.5px`) and `--eldra-checkbox-border-width-invalid` (`2px`).
- `CheckboxGroup` — a real `<fieldset>` with a `<legend>`, so the question is read with every
  option. `modelValue` is the two-way array of checked values (and `change` fires with the new
  array, never the same instance twice), `options` is `{ value, label, hint?, disabled? }[]`,
  `layout` is `vertical` (0.5rem gaps) or `row` (0.5rem × 1.5rem, wrapping, for short labels like
  sizes), and `name` is the one form field name they share. `error` renders the message with its
  `alert-circle` icon and links it to the **fieldset** with `aria-describedby`, marking that
  `aria-invalid="true"` while the individual options stay valid. It needs no `FieldWrapper` around
  it, and must not be put inside one with `group` set — that would nest a second `<fieldset>` and
  legend around the first. Per-part `classes` for `root`, `legend`, `options` and `error`.
- `Input`, `Textarea` — the error boundary now follows the field's own radius (`--eldra-input-radius`
  / `--eldra-textarea-radius`, through the new `--eldra-field-radius`) rather than always
  `radius-md`, and `--eldra-field-border-width` now drives the control's real border as well as the
  inset line that completes it, so the two can no longer come apart. The danger boundary is also
  dropped on a **disabled** field (`aria-invalid` stays: still invalid, just not correctable here)
  and kept on a **read-only** one, on the root and the control alike.
- `defaultCharacterMeaning` is exported as `Readonly<Record<string, RegExp>>`. Documented: a mask
  format with no placeholder slots in it (`'--'`) formats and strips every value to `''`, and a
  masked field loses the caret to the end of the value after an edit in the middle of it.

- `FieldWrapper` — the wrapper every form control sits in: the visible `label` with its `required`
  asterisk (`aria-hidden`, with the control's native `required` doing the announcing) or
  `(optional)` mark, the control, the `error` with its `alert-circle` icon, and a foot row carrying
  `help` at the start and a `counter` (`{ max, value }`, `danger` weight 600 once over the limit) at
  the end. It provides `FIELD_KEY`, so a bare `<Input />` or `<Textarea />` inside it needs no `id`,
  no `aria-describedby`, no `aria-invalid` and no `required` of its own — `describedBy` is the error
  id **first**, then help, then the counter, and only ids that actually render. The error is a plain `<p>` linked by
  id, never a live region: announcing a failed submit belongs to the form. `full` spans both columns
  of a two-column `FormLayout`, and `group` renders the whole wrapper as a `<fieldset>` with the
  label as its `<legend>` — the spec's shape for a set of checkboxes or radios that answer one
  question, with the help and error linked to the fieldset itself — the `<legend>` is the
  fieldset's first child, which is what names it, and the fieldset carries the field's id so a
  failed submit can name the group. Slots: `default` (the control),
  `label`, `help`, `error` — a slot is content, so a `#error` slot makes the field invalid exactly
  as the prop does, and one toggled on or off is followed. Per-part `classes` for `root`, `label`,
  `legend`, `requiredMark`, `optionalText`, `control`, `error`, `errorIcon`, `foot`, `help` and
  `counter`.
- `FormLayout` — a real `<form novalidate>` that arranges fields in a single column, a responsive
  two-column grid or an inline row, and closes with an actions row. `heading` names it through
  `aria-labelledby` (`headingLevel`, 2–4, picks the element; "h4" in the spec is the type style, not
  the level), `ariaLabel` names one with no visible heading; `action` and `method` keep it posting
  without scripting. On submit the form asks the DOM which fields are invalid
  (`[aria-invalid="true"]`, which every control in this package sets from its field's `error`): if
  any are, the submit is stopped, focus moves to the first one and **`invalid`** fires with their
  ids; otherwise **`submit`** fires with `{ event, data }` — the native event, undefaulted so the
  form still posts, and the form's own `FormData`, read with the event's `submitter` so a named
  submit button contributes its own name/value pair (how a form tells "Save draft" from "Publish"). The `errorSummary` slot draws the spec's alert
  box above the fields (`surface` fill, 1px `danger` border, `danger` icon) around your list of
  links to the failed fields, and `statusMessage` feeds a permanent, visually hidden polite
  `role="status"` region so a success is announced without moving focus. The two-column pairs appear
  from a **36rem container** (not a viewport width), so a form in a narrow page-builder column
  behaves like a form on a phone; below it everything stacks and the actions go full width with the
  primary first, without moving in the DOM, and a leading back link pushes itself to the start of a
  wide row without a class from the caller. `submitting` provides `FORM_SUBMITTING_KEY`, which makes
  the `type="submit"` Button loading and every other action disabled while the fields stay editable.
  The form is a `@container`, which is what lets the md primary Button inside it grow to the 2.75rem
  touch target on a narrow *form*. Slots: `default` (fields), `errorSummary` and `actions`; per-part
  `classes` for `root`, `heading`, `errorSummary`, `fields`, `actions` and `status`.
- `FORM_LAYOUT_KEY` is exported alongside `FORM_SUBMITTING_KEY` and `FIELD_KEY`, so a consumer
  composing its own field or form wrapper can join the same wiring.
- The `optional` message is now `"optional"` (`"valfrjálst"`), lower case: the `FieldWrapper`
  renders it in parentheses as the spec's `(optional)` mark.
- `@eldrajs/ui/tailwind.css` gains `text-field-note` (the 0.8125rem / 1.45 line a field's help and
  error text share, with no `font-weight` of its own) and the `--container-two-col` breakpoint
  (36rem), which is the form layout's two-column edge — `@two-col:` and `@max-two-col:`.
- **`Button`**: the 2.75rem touch-target growth below a 48rem container is now the **primary**
  action's alone, per the spec's "Controls keep their height on mobile. Only primary action buttons
  grow to `target-touch`." A secondary, outline, ghost or danger `md` button keeps the 2.5rem
  control height it shares with the inputs beside it, so a mixed actions row no longer has two
  button heights in it on a narrow container.

- `Textarea` — multi-line text entry that grows with its content from `minHeight` (`5rem` by
  default) up to 16rem, then scrolls: `field-sizing: content` where the runtime supports it, with a
  measured `rows` fallback (re-measured against `scrollHeight`/`clientHeight` on mount, on every
  `input`, and on a programmatic `v-model` change alike) where it does not. `counter` shows
  `"n / maxLength"` in the foot row once `maxLength` is also set — `muted` under the limit, `danger`
  weight 600 once the value runs over it (typing past this *soft* limit is still allowed);
  `hardLimit` also sets the native `maxlength`, so typing stops there instead. The counter itself
  carries no `role` or `aria-live`; a separate visually hidden, always-rendered `role="status"`
  `aria-live="polite"` region announces once on crossing 80% of the limit ("20 characters left")
  and once on passing it ("Over the limit by 3"), clearing itself on leaving a zone so re-crossing
  it announces again — never on every keystroke. `input` fires alongside `update:modelValue` on
  every keystroke; `change` fires the committed value. `invalid`, `describedBy` (the counter wires
  its own id in automatically), `required`, `readonly` and `disabled` share `Input`'s states and its
  field-context wiring through `FIELD_KEY`; the per-part `classes` prop covers `root`, `control`,
  `foot` and `counter`. `--eldra-textarea-radius`, `--eldra-textarea-min-height` and
  `--eldra-counter-line-height` restyle it without touching a class.
- Messages — `overLimit` (a `Textarea`'s over-the-limit announcement: en-US "Over the limit by 3",
  is-IS "Yfir hámarkinu um 3").
- `@eldrajs/ui/tailwind.css` gains `text-counter` (a field's character-counter type style: the
  caption token's size on a `1.5` line, with no `font-weight` of its own so the over-limit state's
  `font-semibold` is a plain, reliably-ordered stock utility rather than fighting a shorthand `font`
  declaration).

- First release: a public, MIT-licensed Vue 3 core component library for Eldra storefronts, built
  to the Eldra starter design spec and WCAG 2.2 AA. Peers on `vue` ^3.4; `vee-validate` ^4 is an
  optional peer used only by the `@eldrajs/ui/vee-validate` entry.
- `@eldrajs/ui/tokens.css` declares the design system as `--eldra-*` custom properties on `:root`:
  17 colour roles, 12 type styles, the spacing, radius, shadow, layout, duration, easing and layer
  scales. A `@media (prefers-reduced-motion: reduce)` block zeroes every duration. Setting these
  variables is how a store restyles the components — no value in the package is a literal.
- `@eldrajs/ui/tailwind.css` is the Tailwind v4 theme over those variables, for consumers who run
  Tailwind themselves: import it after `@import 'tailwindcss'`. It maps the `color`, `font`,
  `spacing`, `radius`, `shadow`, `ease` and `container` namespaces onto the tokens (resetting the
  stock palettes it replaces) and adds the `text-*` type-style utilities, `control-h{,-sm,-lg}`,
  `target-min`, `target-touch`, `duration-{fast,base,slow}`, `z-{sticky,drawer,dialog,toast}` and
  the one focus ring: `eldra-focus`, `eldra-focus-always` and `eldra-focus-inset`, each with a
  `forced-colors` fallback.
- `@eldrajs/ui/style.css` is the same theme compiled with the components' utilities, for consumers
  without Tailwind.
- `Icon` — renders a Tabler (or any) icon component at the spec's four sizes (1, 1.25, 1.5 and
  2rem) with stroke 1.75, in the current text colour. Decorative (`aria-hidden`) unless `label` is
  given, which makes it `role="img"` with an accessible name.
- `Button` — the spec's one action control, in six variants (`primary`, `secondary`, `outline`,
  `ghost`, `link`, `danger`) and three sizes. Renders a native `<button>`, or an `<a href>` when
  `href` is set. `loading` hides the label and icons without changing the width, shows a spinner
  and swaps the accessible name to `label`; `iconOnly` makes it square and named by `label`;
  `pressed` exposes `aria-pressed` with a fill, not only a hue; `disabled`, `block` and the
  per-part `classes` prop complete the set. Hover fills are `color-mix()` of the tokens, so a
  rebranded `primary` or `accent` carries them with it, and on a `primary` or `accent` section the
  variants invert on their own. `--eldra-button-radius`, `--eldra-button-line-height` and
  `--eldra-button-font-size-lg` restyle it without touching a class.
- `ButtonGroup` — the layout helper: a wrapping row with a `space-3` gap, or a segmented control
  with `attached` (`role="group"`, square inner corners, 1px neighbour overlap, the focused button
  raised above its neighbours). It is a container-query context, which is what lets an md Button
  inside it grow to the 2.75rem touch target when the block is narrower than 48rem.
- `FORM_SUBMITTING_KEY` — the injection key a form layout provides so that, while the form
  submits, its `type="submit"` Button becomes a loading button and every other action is disabled.
- `@eldrajs/ui/tailwind.css` gains `text-button-{sm,md,lg}`, `animate-eldra-spin` and
  `animate-eldra-pulse` (with the `eldra-spin`/`eldra-pulse` keyframes), and a `--container-tablet`
  key so `@max-tablet:` is the spec's "narrower than 48rem" container query.
- `VisuallyHidden` — content for assistive technology only, with `as` for the rendered element and
  `focusable` for the skip-link pattern.
- Messages: `useMessages`, `provideEldraUiMessages` and `MESSAGES_KEY` resolve the strings the
  components emit themselves in the order English defaults → provided → the component's `messages`
  prop. `enUS` is the default set; `@eldrajs/ui/messages/is-IS` now ships the Icelandic one.
- `cx` and `partClass` merge classes with a `tailwind-merge` instance extended with this package's
  own `@utility` classes (type styles, control heights, `target-min`/`target-touch`, the
  `eldra-focus` family, motion durations, layers and the spinner animation) as their matching or
  own class groups, so a consumer's `classes.container: 'text-lg'` now replaces `text-button-md`
  instead of landing beside it. `mixToward` builds the `color-mix(in oklab, …)` string that derived
  states use. `useUiId` produces SSR-safe ids and `useControllableModel` the controlled/
  uncontrolled `v-model` behaviour.
- `Link` — text navigation in three forms: `inline` (always underlined, 1px at 55% of the text
  colour thickening to 2px on hover), `standalone` (weight 600, optional trailing `arrow-right`
  that moves 2px right on hover, no underline at rest), and `external` (`target="_blank"`,
  `rel="noopener noreferrer"`, the `external-link` icon and visually hidden "(opens in a new tab)").
  `tone="muted"` is for footer and meta-line links. With no `href` it renders a
  `<span data-part="root">` with the same text and no link semantics, per the spec's "render plain
  text instead of a link." `as` takes a tag or a router-link component (a component receives the
  destination as `to`, matching Vue Router / NuxtLink). On a `primary` or `accent` section it
  inherits the section's contrast colour. `--eldra-link-radius` restyles the focus ring's corner
  radius.
- `@eldrajs/ui/tailwind.css` gains `eldra-link-radius` (Link's 2px focus-ring corner radius, with
  no radius token that small).
- `Button` — a `loading` button with no `label` now also warns once in development that it loses
  its accessible name while loading (the visible label is `visibility: hidden`), next to the
  existing icon-only warning.
- `@eldrajs/ui/tailwind.css` — `eldra-focus` and `eldra-focus-inset` now own the transition list of
  the element they sit on: one `transition` shorthand covering colour, border, text-decoration,
  `translate` and `opacity` at `duration-fast` and the ring's own `outline-width`/`box-shadow` at
  `duration-base`, plus the reduced-motion rule. Before this the ring never grew in — a component's
  own `transition-[…] duration-fast` was a later rule for the same shorthand property and replaced
  the ring's entries wholesale, so it snapped to full size. **If you put the focus ring on your own
  element, do not add a `transition-*`/`duration-*` utility beside it**; add the property you need
  to the ring's list instead. `motion-reduce:transition-none` is no longer needed and stays
  harmless where it is.
- `Button` — a disabled link button (`href` plus `disabled`) now keeps its `href` and gains
  `aria-disabled="true"` and `tabindex="-1"`, with navigation prevented on click. It used to drop
  the `href`, which also dropped `role="link"`, so assistive technology stopped naming the element
  exactly when the user needed to hear that it was unavailable.
- `Button` — `aria-pressed` is emitted only on a `<button>`; a `pressed` link button drops it (a
  link cannot be pressed) and warns in development. `pressed` on any variant but `outline` also
  warns: the design spec gives the toggle fill to `outline` alone, so the other variants look
  identical pressed and unpressed.
- `ButtonGroup` — the attached group raises the focused button with `z-10` inside an `isolate`
  context rather than `position: relative`. Every Button is already `relative`, so the old raise
  did nothing and the next button's 1px overlap covered the focus ring. Its inner corners and
  overlap are now logical (`rounded-s-none`, `rounded-e-none`, `-ms-px`), so a segmented control
  reads correctly in an RTL document.
- `cx` — `eldra-link-radius` (Link's focus-ring corner radius) is now registered in the `rounded`
  class group, so a consumer's `classes.root: 'rounded-full'` replaces it instead of landing
  beside it as an unmerged duplicate. A new spec,
  `src/__tests__/custom-utility-coverage.spec.ts`, parses every `@utility` out of `tailwind.css`
  and fails if any of them is not covered by the merge config, so the next custom utility cannot
  ship unregistered the same way.
- Messages — `opensInNewTab` (`en-US` "(opens in a new tab)", `is-IS` "(opnast í nýjum flipa)") is
  now parenthesised and lower-case, matching the design spec's own wording for the text a
  screen-reader appends after an external link's label.
- `Input` — single-line text entry in seven native types (`text`, `email`, `tel`, `number`,
  `search`, `url`, `password`) and three sizes (2rem / 2.5rem / 3rem). `leadingIcon` and the
  `leadingIcon` slot put a decorative icon inside the field; `clearable` (on by default for
  `type="search"`) adds a real `<button type="button">` that shows only while there is a value,
  empties the field and returns focus to it; the `suffix` slot shares the end-edge area with it.
  `invalid` sets `aria-invalid="true"` and draws the spec's 2px `danger` boundary without the value
  shifting a pixel; `describedBy`, `required`, `readonly` and `disabled` complete the states, and
  the per-part `classes` prop covers `root`, `leadingIcon`, `control`, `clearButton` and `suffix`.
  The focus ring is on the `<input>` itself and shows on *any* focus, pointer included, as the spec
  requires of text fields. `--eldra-input-radius`, `--eldra-control-font-size`,
  `--eldra-control-font-size-mobile`, `--eldra-control-line-height` and `--eldra-field-border-width`
  restyle it without touching a class.
- `Input` masks — `mask` takes a format such as `(###) ###-####` or `A#A #A#` (`#` a digit, `A` a
  letter, `*` either, everything else a separator). The field shows the formatted text while
  `v-model` stays the **raw** value, so what you submit is what you store. The engine is exported
  as `applyMask`, `stripMask` and `defaultCharacterMeaning` for the same job outside a component.
- `FIELD_KEY` / `FieldContext` — the injection key a field wrapper provides so the control inside it
  takes its `id`, `aria-describedby`, invalid and required state without any wiring. Any explicit
  prop on the control wins over it.
- `@eldrajs/ui/tailwind.css` gains `text-control{,-sm,-lg,-mobile}` (the compact-control type
  styles, on the spec's fixed 1.5rem line; `max-md:text-control-mobile` is the spec's viewport
  exception that keeps a focused field at 1rem below 48rem so iOS never zooms) and
  `eldra-field-invalid` (the second 1px line that makes a field's error boundary read as 2px).
- `cx` — `eldra-focus-always` no longer shares a class group with `eldra-focus`. It modifies the
  ring rather than replacing it, so `cx('eldra-focus eldra-focus-always')` used to collapse to
  `eldra-focus-always` alone: a `:focus` rule with no outline, infill or transition behind it. Any
  text field of your own that carries both classes now keeps both.
- Messages — `charactersLeft`, `resultsCount` and `viewAllResults` now read naturally at one
  ("1 character left", "1 result", "View 1 result"), in English and in Icelandic (which takes the
  singular for any count ending in 1 except 11).
