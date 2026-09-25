# @eldrajs/ui changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

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
