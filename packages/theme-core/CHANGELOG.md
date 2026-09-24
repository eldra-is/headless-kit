# @eldrajs/theme-core changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

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
