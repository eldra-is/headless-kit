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
  matchWidth: true, // adds `width` equal to the trigger's
});
```

`styles` is a plain object for `:style` — `position`, `top`, `left`, and `width` under `matchWidth`
— not a transform, so the panel keeps `transform` for its own open animation. `placement` is the
placement actually used, after flipping. A panel rendered through a `<Teleport>` still counts as
part of the overlay if it carries `data-eldra-overlay-owner="<the content element's id>"`; without
that, a press inside it reads as a press outside and closes the popup.

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
