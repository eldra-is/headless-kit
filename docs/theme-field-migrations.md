# Block field migrations

Declare top-level field renames in `blocks/<apiId>/block.json` when increasing the block version:

```json
{
  "apiId": "hero",
  "name": "Hero",
  "version": 2,
  "fields": [{ "fieldId": "title", "name": "Title", "type": "string" }],
  "migrations": [{ "version": 2, "renames": [{ "from": "titl", "to": "title" }] }]
}
```

Migration objects accept only `version` and `renames`; each rename accepts only `from` and `to`. Property names are case-sensitive and duplicate JSON keys are rejected. A step has a unique integer version from 2 through the incoming block version and at most 32 renames (an empty list is allowed). IDs must match `^[a-z][a-zA-Z0-9]{0,48}$`, be distinct within each pair, and have unique sources and targets per step. Every destination must exist in the incoming fields, including destinations of historical declarations. Remove obsolete declarations when a later schema no longer contains their destination.

The scanner emits these declarations without changing content. Core owns installed schema history, permissioned activation, and atomic draft/published data migration. These maps cannot convert types, change localization or cardinality, merge/split fields, provide defaults, or migrate slots. Recursive list/composite children must retain their IDs and storage shape; labels, validators, options, and reference tag restrictions may evolve. Cardinality defaults match Core: media is multiple by default; select and reference fields are single by default.

## Advisory local history

`scanTheme({ themeDir, previousManifest })` optionally compares against a previous validated local manifest. The Vite plugin reads `.eldra/manifest.json` before each initial scan or rescan and replaces it only after validation succeeds. This records the last validated local **scan**, which can precede completion of a build and does not identify the installed Core version.

With local history, pending steps satisfy `previousVersion < step.version <= incomingVersion`; their sources must exist in that previous schema and their destination storage shapes must match. Pending sources/targets cannot repeat or cross into a rename chain, since no intermediate schema history is available. A historical declaration whose source still exists locally but is removed by the incoming schema requires a new version bump. Unchanged redeploys remain valid once the source has already left the previous local schema.

Fresh CI checkouts without a previous manifest validate declarations and destinations without inventing a source schema. Core still performs authoritative validation against each site's installed state. Invalid local history fails with a manifest diagnostic and is preserved; correct or deliberately remove that advisory file to scan without it. Removing local history never bypasses Core's checks.

## Type changes and removed fields

Changing a field's type or `localized` flag under the _same_ `fieldId`, or dropping a field entirely, is allowed — Core retires the previous content into a read-only legacy field (`<fieldId>__v<installedVersion>`) rather than discarding it. That retirement only happens on a version bump: with local history available, for every field id present in both the previous and the incoming block whose storage shape differs (the same `storageCompatible` check used for declared renames), or that is missing from the incoming block without a declared rename, the scanner requires `version` to be strictly greater than the previous local version. Without the bump it fails with a diagnostic naming the block, the field, and the fix, for example:

```
blocks/hero/block.json: field subtitle changed type (string → media); bump "version" to 2 so Core retires the previous content
blocks/hero/block.json: field subtitle changed localization; bump "version" to 2 so Core retires the previous content
blocks/hero/block.json: field subtitle changed storage shape (media multiplicity / nested field); bump "version" to 2 so Core retires the previous content
blocks/hero/block.json: field subtitle was removed; bump "version" to 2 so Core retires the previous content
```

The third wording covers a `storageCompatible` refusal where the top-level `type` and `localized` didn't change — a media/select/reference multiplicity flip, or an incompatible nested composite/list child.

A field that is the source of a declared rename (`migrations[].renames[].from`) is exempt from the "was removed" diagnostic — its compatibility is governed by the rename check above instead. This check runs wherever local history is available: during `pnpm dev`/`build` (the Vite plugin always passes `previousManifest` when `.eldra/manifest.json` exists) and from `eldra-theme validate`, which now reads that same file when present.

The scanner cannot see installed entries, so it cannot tell whether a field actually holds content — it requires the bump unconditionally, the same way the rest of this advisory check works. Core performs the authoritative, content-aware retirement at deploy time and reports what it retired; `eldra-theme deploy` prints one line per retired field, for example `retired hero.subtitle → subtitle__v1 (type-changed, 12 entries) — previous content is read-only in Studio`.

## Grouped menu children become sections

A header or footer whose links carry children grouped by a `group` text (a mega-menu column heading) can move to sections, where each column is a section with its own heading, with one step:

```json
{
  "version": 4,
  "groupsToSections": [{ "field": "links" }]
}
```

`field` is a top-level `link` field, or a `list` of links, and that link must declare `tree.sections` (an object `tree` with a `sections` key, `{ "depth": 2, "sections": { "max": 4 } }`; `tree: true` declares none and is refused; see `docs/themes.md`, "Declaring a menu"). The step accepts only `field` and at most 16 entries; the scanner refuses a field that is missing, is neither a link nor a list of links, does not declare `tree.sections`, or is converted by two steps. A step must declare at least one of `renames`, `convertToLink` and `groupsToSections`.

Core applies it once on deploy, after the same deploy's `convertToLink` conversions (which write the `group` text it reads), to draft and published data alike. For each top-level link it partitions the children on the trimmed `group` of the organisation's default locale, in first-seen order: children with no group form one section with no heading, at the position they were first seen, and a typo in a group (`Women`, `Wmen`) makes two sections. Every locale gets the same partition, and each section's heading is that locale's own `group` text. The link keeps `sections` and loses `children`. A link that already has sections, or no children, is left alone, so a redeploy changes nothing, and `eldra-theme deploy` counts the rewrites in the same converted line as a `convertToLink` step.

The step is checked against the incoming fields and stays in `migrations` for as long as the theme lists it, so keep that field, with its `tree.sections`, for as long as the step is there. A link that would break a save rule (more sections than `tree.sections.max`, a `none` child, a child with children of its own) is left unconverted and reported as skipped, never written. Only a top-level `link` field or a `list` of links can be named: a link inside a list inside a composite (a footer's `groups[].links`) is not migrated.

Stored revisions are not rewritten. A header revision from before the step restores with its `children` while the field's declaration still admits them (`tree.depth` 2); once the theme narrows it to depth 1, Core refuses that value and the restore keeps the current menu and warns (`PAGE_REVISION_LINK_MENU_KEPT`).

## Route templates and declared renames

A route template's own `template-block` bindings and text templates are stored separately from a
block's entry data, so a rename Core has already migrated on every entry can still leave a
template pointing at the field's old name. Rather than failing that placement closed until Core
rewrites the stored template, the theme resolves a `bindings`/`templates` key written against a
block's pre-migration name from its declared `migrations` at render time — the same rename map the
scanner validates — so an un-migrated route template keeps rendering. Core still rewrites the
stored bindings on deploy; this is the render-time fallback for the window before that happens.
