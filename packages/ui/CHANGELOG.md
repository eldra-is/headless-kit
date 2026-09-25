# @eldrajs/ui changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- `FieldWrapper` — the wrapper every form control sits in: the visible `label` with its `required`
  asterisk (`aria-hidden`, with the control's native `required` doing the announcing) or
  `(optional)` mark, the control, the `error` with its `alert-circle` icon, and a foot row carrying
  `help` at the start and a `counter` (`{ max, value }`, `danger` weight 600 once over the limit) at
  the end. It provides `FIELD_KEY`, so a bare `<Input />` or `<Textarea />` inside it needs no `id`,
  no `aria-describedby`, no `aria-invalid` and no `required` of its own — `describedBy` is the error
  id **first**, then help, and only ids that actually render. The error is a plain `<p>` linked by
  id, never a live region: announcing a failed submit belongs to the form. `full` spans both columns
  of a two-column `FormLayout`. Slots: `default` (the control), `label`, `help`, `error`; per-part
  `classes` for `root`, `label`, `requiredMark`, `optionalText`, `control`, `error`, `errorIcon`,
  `foot`, `help` and `counter`.
- `FormLayout` — a real `<form novalidate>` that arranges fields in a single column, a responsive
  two-column grid or an inline row, and closes with an actions row. `heading` names it through
  `aria-labelledby`, `ariaLabel` names one with no visible heading; `action` and `method` keep it
  posting without scripting, and `submit` fires with the native `SubmitEvent` without preventing the
  default. The two-column pairs appear from a **36rem container** (not a viewport width), so a form
  in a narrow page-builder column behaves like a form on a phone; below it everything stacks and the
  actions go full width with the primary first, without moving in the DOM. `submitting` provides
  `FORM_SUBMITTING_KEY`, which makes the `type="submit"` Button loading and every other action
  disabled while the fields stay editable. The form is a `@container`, which is what lets the md
  Buttons inside it grow to the 2.75rem touch target on a narrow *form*. Slots: `default` (fields)
  and `actions`; per-part `classes` for `root`, `heading`, `fields` and `actions`.
- `FORM_LAYOUT_KEY` is exported alongside `FORM_SUBMITTING_KEY` and `FIELD_KEY`, so a consumer
  composing its own field or form wrapper can join the same wiring.
- The `optional` message is now `"optional"` (`"valfrjálst"`), lower case: the `FieldWrapper`
  renders it in parentheses as the spec's `(optional)` mark.
- `@eldrajs/ui/tailwind.css` gains `text-field-note` (the 0.8125rem / 1.45 line a field's help and
  error text share, with no `font-weight` of its own) and the `--container-two-col` breakpoint
  (36rem), which is the form layout's two-column edge — `@two-col:` and `@max-two-col:`.

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
