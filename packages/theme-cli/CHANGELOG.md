# @eldrajs/theme-cli changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- First release under the `@eldrajs` scope, moved from the private `@eldra/theme-cli` package.
- Adds `eldra-theme types --blocks`: scans `blocks/*/block.json` and writes `.eldra/block-types.d.ts`
  without contacting the gateway — the existing `types` behaviour (fetching CMS schema types by
  `--schemas`/`--out`) is unchanged when the flag is omitted.
