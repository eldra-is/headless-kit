# @eldrajs/vue changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## 0.1.0 — 2026-09-15

- First release, moved out of `@eldra-is/vue-ui-components` (`RichText`, `TextRenderer`,
  `RenderNode`, the default node and mark components). The props and override semantics are
  unchanged; the types now come from `@eldrajs/rich-text`, so TipTap is not needed to typecheck.
- Links drop an href that is not `http`, `https`, `mailto`, `tel` or relative; images render only
  for an `http`, `https`, `data:image/` or relative source; an embed renders only from a host on
  `EMBED_SOURCE_HOSTS`. The previous renderer passed all three through as written.
- `scrollTransitions` still hands off to a `reveal` directive the host app registered and does
  nothing otherwise; the value's type is declared here rather than imported from a motion library.
- The script-embed loading placeholder is a plain `[data-embed-placeholder]` element instead of the
  UI library's skeleton; a failed script embed shows a link to the original.
