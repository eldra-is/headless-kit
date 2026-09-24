# @eldrajs/vite-plugin-theme changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- First release under the `@eldrajs` scope, moved from the private `@eldra/vite-plugin-theme` package.
- Adds `generateBlockTypes(blocks)`, a framework-free generator that turns every scanned block's
  `block.json` into a global ambient `.eldra/block-types.d.ts` (`interface EldraBlockData`,
  `EldraBlockEntry<K>`, `EldraMedia`) so a theme's `Block.vue` components get typed `entry.data`.
  The plugin now writes that file next to `.eldra/manifest.json` on `buildStart` and on block file
  changes in dev, skipping the write when the content is unchanged.
- `scanTheme` now validates every media field value in a block's `mock.json` against Core's
  write-side shape (`{ assetId: <uuid>, framing? }`), so a fixture-shaped value (or any other shape)
  fails with `mock.json: <field>: media values must be {assetId: uuid} — use preview.json for demo
  imagery` instead of only surfacing as a 400 when Studio later seeds a freshly-inserted block's CMS
  entry from it. The check walks `list`/`composite` nesting and `multiple: true` media fields too. A
  media field may still be entirely absent — that's the expected shape.
