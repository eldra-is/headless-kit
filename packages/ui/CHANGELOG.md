# Changelog

## Unreleased

- `Icon` — renders a Tabler (or any) icon component at the spec's four sizes (1, 1.25, 1.5 and
  2rem) with stroke 1.75, in the current text colour. Decorative (`aria-hidden`) unless `label` is
  given, which makes it `role="img"` with an accessible name.
- `VisuallyHidden` — content for assistive technology only, with `as` for the rendered element and
  `focusable` for the skip-link pattern.
- Messages: `useMessages`, `provideEldraUiMessages` and `MESSAGES_KEY` resolve the strings the
  components emit themselves in the order English defaults → provided → the component's `messages`
  prop. `enUS` is the default set; `@eldrajs/ui/messages/is-IS` now ships the Icelandic one.
- `cx` and `partClass` merge classes with `tailwind-merge`, which is how the `classes` prop on
  every component replaces a utility instead of losing to source order. `mixToward` builds the
  `color-mix(in oklab, …)` string that derived states use. `useUiId` produces SSR-safe ids and
  `useControllableModel` the controlled/uncontrolled `v-model` behaviour.
