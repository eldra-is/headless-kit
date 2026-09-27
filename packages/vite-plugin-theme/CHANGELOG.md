# @eldrajs/vite-plugin-theme changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- A `reference` field's `relation` now names its targets as any combination of `allowedTagIds`
  (semantic tag names), `allowProducts` and `allowCollections`, with at least one of them —
  `allowedTagIds` is no longer required, and `allowProducts` is no longer refused. A relation that
  names none — one carrying only `multiple` included — fails with `blocks/<id>/block.json:
  fields[<i>] — relation requires one of allowedTagIds, allowProducts or allowCollections`, the
  same rule and wording Core's manifest ingest applies. `allowedSchemaIds` stays refused (`themes
  may use only relation.allowedTagIds, relation.allowProducts and relation.allowCollections`):
  schema ids are not portable across organizations, while products and collections are catalog
  objects every organization has.
- `generateBlockTypes` now declares `EldraCollectionReference`
  (`{ id; _type: 'collection'; slug?; status?; type?; productCount?; translations? }` — only
  `id`/`_type` are guaranteed, since the public read returns the stub at depth 0, for an archived
  collection, and for a page builder draft overlay) and types a `reference` field whose relation targets
  catalog collections *and nothing else* as `EldraCollectionReference | null`, or
  `EldraCollectionReference[]` when the relation is `multiple`. A relation mixing targets keeps
  `Record<string, unknown>`.
- The advisory local-history check now requires a block `version` bump for a storage-incompatible
  field change (type or `localized` flip, or a nested composite/list child change) under the same
  `fieldId`, and for a field removed without a declared rename — mirroring Core's field retirement,
  which archives the previous content into a read-only `<fieldId>__v<n>` field on a bump instead of
  refusing the deploy. Without the bump, `migrationChecks` fails with `blocks/<id>/block.json: field
  <fieldId> changed type (<old> → <new>); bump "version" to <n+1> so Core retires the previous
  content` (or `changed localization` / `was removed`). See `docs/theme-field-migrations.md` → "Type
  changes and removed fields".
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
