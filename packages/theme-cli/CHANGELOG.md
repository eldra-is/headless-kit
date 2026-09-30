# @eldrajs/theme-cli changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- `eldra-theme deploy` prints what a deploy **converted** beside what it retired. A version bump
  that turns an existing field's values into a `link` field's rewrites those values rather than
  losing them, and each converted field now gets its own line:
  `converted 44 values in navigation.links; 44 kept as plain URLs; 2 dropped: <reason> ×2`, the
  last two clauses appearing only when there is something to say. A gateway that reports totals
  without a per-field breakdown gets one `converted N values into link fields` line instead. Without
  this, the entire visible account of a successful conversion was the retirement lines, which say
  content is now read-only — the opposite of what happened. `fieldMigrationLines(report)` is
  exported so a wrapper can print the same lines its own way, with the `FieldMigrationReport`,
  `ConvertedFieldMigration`, `DroppedLinkRows` and `RetiredFieldMigration` types. Every part of the
  report is optional, so deploying against a gateway that reports less still works.

- `eldra-theme validate` accepts the new `link` field type. A theme declaring one against an older
  gateway still validates offline; against a newer one the remote `/cms/v1/field-types` list wins,
  as it already did.

- `eldra-theme validate` reports the new `showWhen` conditional-field rules
  (`@eldrajs/vite-plugin-theme`): a condition naming a field that is not a sibling in the same
  field set, naming itself, naming a sibling that is not a `select`/`bool`/`string`, naming one
  that carries `showWhen` itself, listing no values, or listing a value the sibling `select` does
  not offer, each fails validation with a line naming the field.

- `eldra-theme validate` now reads `.eldra/manifest.json` when present and runs the vite plugin's
  advisory local-history check against it, so a storage-incompatible field change or a field removed
  without a declared rename fails validation the same way `pnpm dev`/`build` does, before a deploy
  ever refuses it.
- `eldra-theme deploy` now prints one deduped `<blockApiId>.<fieldId>: <reason>` line per field
  when Core refuses a deploy with `THEME_FIELD_INCOMPATIBLE` (a storage-incompatible field change
  or field removal without a version bump). Previously the CLI only echoed the response's generic
  `detail` sentence and silently dropped the structured `errors.activationRefusal.locations` the
  gateway sends alongside it, so an author saw "theme content compatibility requires confirmation"
  with no indication of which field or fix.
- `eldra-theme deploy` prints one line per field Core retired during the deploy:
  `retired <blockApiId>.<fieldId> → <retiredAs> (<reason>, <migratedCount> entries) — previous
  content is read-only in Studio`, reading the new `syncResult.fieldMigrations.retired` array
  (`DeploySyncResult.fieldMigrations`).
- First release under the `@eldrajs` scope, moved from the private `@eldra/theme-cli` package.
- Adds `eldra-theme types --blocks`: scans `blocks/*/block.json` and writes `.eldra/block-types.d.ts`
  without contacting the gateway — the existing `types` behaviour (fetching CMS schema types by
  `--schemas`/`--out`) is unchanged when the flag is omitted.
