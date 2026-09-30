# @eldrajs/vite-plugin-theme changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- A seed's `link` value with `kind: "url"` is checked against the platform's href allowlist rather
  than only for being a non-blank string, so a scan refuses what a deploy refuses. A `mock.json` or
  `preview.json` carrying `javascript:…`, a `data:` url, a protocol-relative `//host`, a bare `#`,
  a backslash, a control character, a value over 2048 bytes or a scheme with the wrong number of
  slashes (`https:example.com`) now fails `eldra-theme validate` and `pnpm dev`/`build` with a line
  naming the path that carries it, instead of failing at the deploy — the one place a theme author
  cannot fix it offline.

- A block migration step may now carry `convertToLink`, which turns an existing field's values into
  a `link` field's on deploy — where a handle can still be resolved against the catalog — rather
  than letting a composite-to-link change land as a retirement that leaves the new field empty:

  ```jsonc
  "migrations": [{
    "version": 3,
    "renames": [],
    "convertToLink": [
      { "from": "links", "to": "links", "shape": "list",
        "label": "label", "url": "href",
        "children": { "from": "menuLinks", "group": "group" } },
      { "from": "ctaHref", "to": "cta", "shape": "string", "label": "ctaLabel" }
    ]
  }]
  ```

  `label`, `url` and `group` name the fields of the **row** being converted; `children` names the
  nested list and the key names those nested rows use, each falling back to the step's own when it
  is left out. They are separate because the row above rarely uses the same names — a footer column
  is `{title, links[]}` while each link under it is `{label, href}`, which one set of keys could not
  carry.

  `shape` says what the old field was: a `string` holding an href, or a `list` of composites whose
  named children carry the label, href, group and nested links. **The conversion copies; it never
  deletes.** `from` is left alone, so the ordinary retirement pass then stashes it as
  `<from>__v<previousVersion>` and anything the old shape carried and a link cannot hold stays
  readable — and a step that converts still has to bump the block's version for that reason. It is
  idempotent for free: on the next deploy `from` no longer exists under its old id.

  The scanner checks that `to` exists in the incoming fields and is a `link` (or, for
  `shape: "list"`, a list whose item is one), that no two conversions in a step write the same
  field, that a `shape: "string"` conversion declares no `url`, `group` or `children` (it reads one
  field and writes one link, so there are no rows to name), that a `children` mapping has an href
  key at one level or the other (without one every child converts blank and is dropped), that
  `from` exists in the previous local manifest — for as long as that manifest still describes the
  old shape; a step stops being source-checked once `from` is gone or has itself become the link
  the step writes, which is what redeploying an applied step produces — and
  that every named key exists at the level it names: `label`/`url`/`group` on the previous item's
  composite, `children.from` as a list of composites under it, and `children`'s own key names on
  that nested composite. For `shape: "string"`, that `label` names another string field of the
  previous block.

- `renames` is now optional on a migration step, so a step may carry only conversions. A step must
  still declare at least one of `renames` and `convertToLink`.

- Seed data (a block's `mock.json`, a template seed's block data and a template role's data) may
  name a `link` field's destination. A product or a collection may be named by handle —
  `{ "kind": "collection", "target": { "_type": "collection", "slug": "the-winter-edit" } }` — and
  Core resolves it against the organisation's own catalog at seed time, leaving that one link out
  when nothing matches rather than emptying the field. The other kinds address
  organisation-owned objects a theme has no portable name for, so a seed leaves their `target` out
  and an author fills it in. The scanner refuses anything else: an unknown `kind`, a `url` on a
  kind that is not `url` (or a missing one on a kind that is), a `target` on `kind: "url"`, an id
  that is not a uuid, a target whose `_type` does not mirror its `kind` (the rule Core's own
  validator refuses a mismatch on at deploy), a handle for a kind Core cannot resolve one for, and a
  child carrying children of its own. Children are walked with the same rules, and a `link` inside a list or a
  composite is walked as well.

- A `link` value may be `kind: "none"` — a heading that groups the links under it and goes nowhere
  itself, which is the only shape a footer column heading or a mega-menu parent without its own page
  has. It carries a `label` and non-empty `children`, never a `target` or a `url`, and is refused
  anywhere it cannot head anything (as a child, or with no children of its own). `metadata.kinds`
  accepts it alongside the six destinations.

- A block field may now declare `"type": "link"` — one destination the platform understands rather
  than a typed-out URL. Its value is
  `{ kind, target?: { _type, id }, url?, label?, openInNewTab?, group?, children? }` with `kind` one
  of `product`, `collection`, `category`, `entry`, `page` or `url`; `url` is set only for
  `kind: "url"` and `target` only for the other five, and `children` is one level deep and never
  more. Three metadata keys belong to the type and to nothing else: `kinds` (the kinds an author may
  pick from — every kind when absent), `allowedEntrySchemaApiIds` (restricts `kind: "entry"` to the
  named schemas, and requires `kinds` to include `entry`), and `tree` (author the field as a tree of
  one level of children — allowed only on a `link` that is a `list`'s `metadata.item`, because a
  `list` may declare only `allowedSchemas` and `item` itself). A `link` field may not declare
  `relation`. Each refusal names the field's own path
  (`blocks/navigation/block.json: fields[3].metadata.item.metadata.kinds — unknown kind "blog"`).

- `.eldra/block-types.d.ts` types a `link` field as the new global `EldraLink` interface — a list of
  links as `Array<EldraLink>`, a link inside a composite inline with the rest — and declares the
  interface only when some block actually uses the type, the way `RichTextNode` is only imported
  when one declares rich text.

- Seed data (a block's `mock.json`, a template seed's block data and a template role's data) may
  now name a catalog collection by slug in a `reference` field:
  `{ "_type": "collection", "slug": "the-winter-edit" }`. A theme cannot know an organisation's
  collection ids, so this is the only form it can ship; Core resolves it against the
  organisation's own catalog at seed time and leaves the field empty when nothing matches, so the
  deploy still succeeds. The scanner now validates every seed reference value: absent,
  `{ _type, id: <uuid> }`, or the slug form on a relation whose `allowCollections` is true.
  Anything else — a bare handle string, a resolved read's whole object, a slug on a relation that
  allows no collection — is a validation error naming the path that carries it
  (`blocks/collection-grid/mock.json: collection: reference values must be absent, …`), the same
  way a media value that is not `{assetId: uuid}` already was.

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
