# `@eldrajs/ui`

Accessible Vue 3 core components for Eldra storefronts, themed through CSS design tokens.

Work in progress; see plan.

The components are built to `eldra-starter-spec/01-core-components.md` (WCAG 2.2 AA). Where this
package adds something the spec's property tables do not list, it is recorded below rather than
left for a reader to find.

## Composables

Exported from the package root, for a consumer building a control this package does not ship yet.
`useControllableModel` is the model every stateful component here uses; the other two are the parts
of a **non-modal popup** — a select panel, a search results panel, a menu — that are easy to get
wrong. Neither traps focus: the design spec's non-negotiables reserve `<dialog>` and focus traps for
modal surfaces, and say these popups are not dialogs.

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

`useListbox` is the third: the keyboard and the active row of a listbox popup, which `Select` and
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

## Deviations

Additions and departures from the design spec, and why.

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
  `Checkbox` takes `describedBy?: string`, exactly as `Input` and `Textarea` do, and falls back to
  a `FieldWrapper`'s context when there is one.
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
- **`Button` touch growth is the primary action's.** "Only primary action buttons grow to
  `target-touch` (2.75rem)" below a 48rem container, so an `md` `primary` button grows and a
  secondary, outline, ghost or danger action beside it keeps the 2.5rem control height it shares
  with the inputs.
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
  `Composables`), so a select that has to change placement at runtime needs a `:key` change. It is
  a layout decision — "the footer's selectors use `above`" — not state.
- **`Select`'s panel is rendered in place, never teleported.** It is positioned absolutely inside
  the component's own root, so `data-part` and `classes` selectors reach it and it inherits the
  section it sits in. The spec's own "Don't place a select inside a container that clips overflow"
  is the trade-off that buys.
- **`MultiSelect`'s parts include the footer's.** The brief's part list stops at the tags; the
  spec's anatomy draws a footer ("live count · Clear (link button) · Done (primary sm)") and its
  acceptance criteria test it, so `footer`, `footerCount`, `footerClear` and `footerDone` are parts
  as well. `optionCheck` is reused for an option's **checkbox** — it is the mark that says a row is
  chosen in both controls, so a consumer styles it once — and the footer's two buttons are real
  `Button`s whose `data-part` is the multi-select's rather than `Button`'s own `container`.
- **`MultiSelect`'s placeholder default is the spec's `"Any"`** (`is-IS`: `"Allt"`), not
  `"Select options"`. New messages with it: `selected` ("Selected", which names the tag list beside
  the field's own label), `selectedCount(n)` ("4 selected"), `noneSelected` and `done`.
- **`MultiSelect`'s clear button belongs to the popover while it is open.** The spec's Tab table
  walks "from the search field (or the trigger) to the footer's Clear, then Done, with the popover
  still open", and the trigger's own clear button sits between the trigger and the panel in the tab
  order. It therefore carries `data-eldra-overlay-owner="<the panel's id>"`, which is how
  `useOverlay` already recognises a part of an overlay that is not inside its content element, so
  tabbing through it does not close the popover. `Tab` itself is never consumed: focus landing
  outside the control is what closes it, which is also what closes it past Done.
- **`Backspace` in a `MultiSelect`'s empty search field removes the last tag.** Not in the spec's
  keyboard table — it is the convention every chip input follows — and it is guarded on the query
  being empty, so it never eats a character the user meant to delete.
- **A `MultiSelect` value with no option of its own is dropped** from the summary, the tags, the
  count and the hidden native select. It has no label to show and a `<select>` cannot hold it, so
  showing a count that includes it would make the trigger disagree with the tags underneath it.
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
