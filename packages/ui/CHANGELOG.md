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
- `cx` and `partClass` merge classes with `tailwind-merge`, which is how the `classes` prop on
  every component replaces a utility instead of losing to source order. `mixToward` builds the
  `color-mix(in oklab, …)` string that derived states use. `useUiId` produces SSR-safe ids and
  `useControllableModel` the controlled/uncontrolled `v-model` behaviour.
