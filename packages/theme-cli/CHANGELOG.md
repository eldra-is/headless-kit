# @eldrajs/theme-cli changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

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
