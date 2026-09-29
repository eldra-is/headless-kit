# @eldrajs/vite-plugin-theme changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- A block field may now declare `showWhen: { "field": "<sibling>", "in": ["<value>", …] }` — the
  field is offered to an author only while that sibling holds one of the listed values.
  `equals: "x"` is sugar for `in: ["x"]` and is normalized away while scanning, so the manifest
  always carries `in`. `field` names a sibling in the *same* field set (top level, or the same
  composite / list item) which must be a `select`, `bool` or `string` field carrying no `showWhen`
  of its own — conditions do not chain — and, for a `select` sibling, every listed value must be
  one of its `metadata.options`. Each rule is a validation error naming the field
  (`blocks/product-carousel/block.json: fields[2].showWhen.field — references unknown sibling
  "variation"`), and Core's manifest ingest refuses the same shapes the same way. Visibility is
  authoring UX, not storage: adding, changing or removing `showWhen` is **not** a breaking field
  change, so it never demands a `version` bump, and the generated `.eldra/block-types.d.ts` is
  unchanged by it.

- A declared template seed block may now carry `templates` and `bindings`
  (`Record<string, string>` each), and they are emitted on that block's node in the generated —
  or declared — seed layout rather than on `templates[].blocks[]`, which still carries only the
  three keys Core decodes. Both are keyed by a target path into the block's own fields, the same
  grammar the theme's template layout reads (identifier segments with list indices allowed:
  `heading`, `items.0.label`, first segment a field the block declares), and each value must be a
  non-empty string — a text template (`{{ title }}`) for `templates`, a path on the routed entry
  for `bindings`. A key that is not such a path, or a value that is not a non-empty string, is a
  validation error naming it (`templates[0].blocks[0].templates.subheading — must be a path into
  hero's fields (expected …)`). This is what lets a catalog-backed seed fill a block in from the
  object its route resolved instead of pinning one product or collection into the seed data.

- Themes can declare `templates`: up to 8 default page templates a site is seeded with on its
  first deploy, so a merchant gets working product and collection pages without building
  anything. A seed is `{ routePattern, schemaApiId, title, blocks: [{ id, apiId, data }],
  layout? }`, where `schemaApiId` is `catalog:product`, `catalog:collection` or `home`, and each
  block's `data` is the same kind of seed as a block's `mock.json` — validated the same way, so a
  media value must be `{assetId: uuid}` or absent (`templates[0].blocks[1].data — image: media
  values must be {assetId: uuid} — use preview.json for demo imagery`). Every block `apiId` must
  be one the theme ships, ids are unique and shaped `^[a-z][a-z0-9-]{0,47}$`, and route patterns
  do not repeat. The pattern has to agree with what the seed is a template for: `home` owns `/`,
  and a catalog seed needs a static prefix plus the one `:slug` parameter it is resolved by. A seed without a `layout` gets one column of its blocks in order, framed by a
  header and a footer node that name a *role* rather than a component id (the site's own reusable
  components are resolved on deploy); `header: false` / `footer: false` leave the role out. Those
  two switches steer the generated layout and are never written to the manifest. The key is
  emitted only when a theme declares at least one seed.

  A theme can also declare `templateRoles`: the block data behind the `header`/`footer` roles its
  template seed layouts reference — `{ header?: { apiId, data }, footer?: { apiId, data } }`,
  validated the same way as a seed block (`templateRoles.header.apiId — unknown block "…"`,
  `templateRoles.header.data — …`). A role is required once any declared seed's layout places it
  (generated or declared), whether or not that seed also carries the switch that puts it there:
  `templateRoles.header — required: templates[0] places the header role`. Emitted only when the
  theme declares at least one role, same as `templates`.

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
