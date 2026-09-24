# @eldrajs/theme-vue changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- First release under the `@eldrajs` scope, moved from the private `@eldra/theme-vue` package.
- Fix: a draft's own top-level `select` field now unwraps to its plain string value the same way
  one nested inside a draft's embedded block already did, so a live-editing `Block.vue`'s `===`
  comparison keeps working for a top-level `select`/`variant` field too.
