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
blocks/hero/block.json: field subtitle was removed; bump "version" to 2 so Core retires the previous content
```

A field that is the source of a declared rename (`migrations[].renames[].from`) is exempt from the "was removed" diagnostic — its compatibility is governed by the rename check above instead. This check runs wherever local history is available: during `pnpm dev`/`build` (the Vite plugin always passes `previousManifest` when `.eldra/manifest.json` exists) and from `eldra-theme validate`, which now reads that same file when present.

The scanner cannot see installed entries, so it cannot tell whether a field actually holds content — it requires the bump unconditionally, the same way the rest of this advisory check works. Core performs the authoritative, content-aware retirement at deploy time and reports what it retired; `eldra-theme deploy` prints one line per retired field, for example `retired hero.subtitle → subtitle__v1 (type-changed, 12 entries) — previous content is read-only in Studio`.
