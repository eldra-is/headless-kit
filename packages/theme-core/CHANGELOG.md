# @eldrajs/theme-core changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- Fix: a `block` layout node whose width is measured from its content — `fit-content`, or an
  unset/`auto` width as a flex-row item, or anything but a fixed length inside such a node — no
  longer collapses to 0px. A block's own `@container` root applies inline-size containment, under
  which it has no intrinsic inline size; the generated CSS now turns containment off on that
  block's root (`.<node>>*{container-type:normal}`) and makes every determinately sized container
  node, the document root included, a query container (`container-type:inline-size`), so the
  block measures its content and its container queries resolve against the width of the region
  it sits in. `fit-content`, `fill`, `100%` and fixed lengths all keep their literal meaning; a
  determinate block keeps its own root as the query container exactly as before.
- Fix: a route template's `template-block` node whose `bindings`/`templates` keys were written
  against a field's pre-migration name (before a block bumped its version and renamed that field)
  no longer fails closed with `INVALID_VALUE`. `createTemplateLayoutRenderModel` now resolves such
  a key through the block's declared `renames` — a new, optional `TemplateBlockDefinition.renames`
  map, and the exported `buildTemplateBlockRenames` helper that flattens a block's `migrations`
  array into it — before validating the node, so an un-migrated stored template keeps rendering.
  Core still rewrites the stored bindings on deploy; this is the theme's own tolerance for the
  window before that happens.
- **`buildRichTextTree` takes a `minHeadingLevel` render option**: a floor for every `heading`
  node's rendered tag (`h{max(minHeadingLevel, level)}`, still capped at 6; default `1`, i.e. the
  document's own levels). A page owns its heading outline and a rich-text field does not, so one
  stored document has to be able to render as an h2-and-down section in one block and an h3-and-down
  one in another. Applying it at render time leaves the document untouched — the position stamps and
  every other attribute are identical with and without it. `@eldrajs/theme-vue`'s `EldraRichText`
  exposes it as a prop.
- First release under the `@eldrajs` scope, moved from the private `@eldra/theme-core` package.
- `@eldra/bridge` is now the `@eldrajs/theme-core/bridge` subpath.
- Fix: a `select` field's value from the public/preview read path now arrives as its plain
  string (e.g. `"subtle"`), top-level and nested inside a `list`'s composite item. Previously
  the gateway's resolved `{ value, label }` object leaked into templates unwrapped, and was
  stega-encoded (breaking `===` comparisons) while live-editing. The unwrap only fires for a
  field the theme's manifest registers as `type: "select"` — an ordinary composite field with
  `value`/`label` sub-fields is left untouched. A theme that renders a select field's resolved
  value as visible text (a tone badge, a size label) loses overlay click-to-edit mapping for
  that text, because it is deliberately no longer stega-encoded.
- `EldraClient.encodeEntryDataStega` gained an optional fourth `apiId` parameter, used to skip
  stega-encoding a registered `select` field's resolved value — backwards compatible for any
  existing caller/implementer.
