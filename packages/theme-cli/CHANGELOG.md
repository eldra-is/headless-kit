# @eldrajs/theme-cli changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- `eldra-theme validate` now reads `.eldra/manifest.json` when present and runs the vite plugin's
  advisory local-history check against it, so a storage-incompatible field change or a field removed
  without a declared rename fails validation the same way `pnpm dev`/`build` does, before a deploy
  ever refuses it.
- `eldra-theme deploy` prints one line per field Core retired during the deploy:
  `retired <blockApiId>.<fieldId> → <retiredAs> (<reason>, <migratedCount> entries) — previous
  content is read-only in Studio`, reading the new `syncResult.fieldMigrations.retired` array
  (`DeploySyncResult.fieldMigrations`).
- First release under the `@eldrajs` scope, moved from the private `@eldra/theme-cli` package.
- Adds `eldra-theme types --blocks`: scans `blocks/*/block.json` and writes `.eldra/block-types.d.ts`
  without contacting the gateway — the existing `types` behaviour (fetching CMS schema types by
  `--schemas`/`--out`) is unchanged when the flag is omitted.
