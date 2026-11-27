# @eldrajs/theme-cli changelog

Hand-maintained: every change a consumer can see gets a line under Unreleased in the same change.
Release-please writes the generated notes from commit messages and does not replace this.

## Unreleased

- The scaffolded starter writes money, numbers and dates in the organisation's regional format (`runtimeConfig.public.eldra.region`, WS-1277), not the content locale: an English-language Icelandic store prints "4.790 kr." and Icelandic dates on its English pages, and an order's dates fall on the organisation's own calendar day. Its words stay on the content locale. With no regional format published, the content locale formats, as before. `app/composables/useRegionalFormat.ts` is new (`useFormatDate`, `useFormatLocale`, `REGION_KEY`).
- The scaffolded starter's `collection-header` no longer shifts the page when it hydrates (WS-1451): the Read more row is reserved from the first server render and stays hidden, inert and out of the accessibility tree until the description is known to overflow its three-line clamp.
- The scaffolded starter is redesigned as Northwind Goods (WS-1277): a new palette and serif headings in `tokens.json`, 18 CC0 demo photos in `public/images/` (sources in `CREDITS.md`), and new optional fields and variants, so existing content keeps rendering. The header gains an info strip (`infoItems`), labelled tools, a square `brandMark` for small phones, an `account` link and a phone-menu `drawerLayout`, and its cards are now 4:5. The footer is dark by default and gains `address`, `phone`, `email` and `hours`. New variants: `hero` `card`, `trust-strip` `numbered`, `feature-grid` `arched` and `collection-grid` `filter-bar`. `product-carousel` gains filter chips, a grid layout and quick add; `split-content` gains a list of makers and a background; `newsletter` `split` gains a help panel. The product page has an image mosaic with Lightbox zoom and an accordion. The seeded pages drop the announcement bar, since the header's info strip replaces it. The starter README maps every page-builder feature to the file that shows it.
- The scaffolded starter's header declares menu sections and product/collection cards on its `links` field and draws them (WS-1362): a mega panel column of cards, each a picture, a title and a price. Its `navigation` block is version 5 with a `groupsToSections` migration, and its mock is sections; deploying it needs a cms-service that has `groupsToSections`, so deploy the platform first.
- The starter template builds its pages in the store's default currency (`commerce.defaultCurrency`), and never offers the store's own currency once the store turned it off; a cart left in that currency moves to the default, and a business customer's cart stays in ISK (`currency.keepOwnCurrency()` for a theme with business sign-in) (WS-1399).
- `eldra-theme types` asks the gateway for the `declare module '@eldrajs/sdk'` augmentation and
  writes it with the CMS types, so `product.extensions` is typed through the SDK's
  `EldraProductExtensions` registry (WS-434, contract 6.1.0). It is on by default;
  `--no-sdk-augmentation` leaves it out, for a project that does not depend on `@eldrajs/sdk`.
- `eldra-theme deploy` explains a 413 whose body is not JSON instead of printing `gateway responded 413`: a proxy or CDN in front of the API may have refused the upload as too large, with the platform's own artifact limits for comparison.
- `eldra-theme init` scaffolds a starter whose `studioOrigins` default to production Studio (`https://eldra.app`) instead of `https://localhost:4311`, so a deploy that forgets `ELDRA_STUDIO_ORIGIN` still lets production Studio connect to the preview rather than failing silently; `ELDRA_STUDIO_ORIGIN` accepts a comma-separated list.
- `eldra-theme validate` and the plugin build fail naming `package.json: eldra.themeId` when a theme
  declares no id (or an invalid one); `eldra-theme deploy` refuses a build whose
  `.eldra/manifest.json` is not `manifestVersion: 2` with a valid `theme.id` before uploading
  anything. `eldra-theme init` scaffolds the starter with `"eldra": { "themeId": "starter" }`;
  change it to your own theme's id.

- `eldra-theme validate` surfaces the scanner's new message-catalogue errors (an invalid
  `i18n/<tag>.json` key, value, locale file name, or a non-default locale's keys that are not a
  subset of the default locale's) exactly as `@eldrajs/vite-plugin-theme/scan` reports them.
  `eldra-theme types --blocks` (and the Vite plugin's own `.eldra/block-types.d.ts` write) now also
  emits a `type MessageKey = '…' | '…';` union from the theme's default-locale message keys, when it
  ships any — see `@eldrajs/vite-plugin-theme`'s changelog and `docs/theme-design-tokens.md`.

- Fixed: `eldra-theme init` no longer ships a previously built Storybook, coverage report,
  Playwright output or tool cache. The starter copy (used both by the packaged `template/`
  directory and, directly, by `init` itself) now excludes `storybook-static`, `coverage`,
  `test-results`, `playwright-report` and `.cache` in addition to the directories it already
  skipped, driven by one shared exclusion list so both copies always agree.

- `eldra-theme deploy` prints what a deploy **converted** beside what it retired. A version bump
  that turns an existing field's values into a `link` field's rewrites those values rather than
  losing them, and each converted field now gets its own line naming which field was read, which was
  written, how many entries were rewritten and how many of the produced links kept a plain URL
  because they named no catalog or CMS destination:

  ```
  converted navigation.links → links (2 entries, 44 links kept their URL)
  warning: dropped 1 "none" row from navigation.links — the field does not offer that kind
  ```

  The two counts are deliberately in their own units — entries rewritten against link rows produced
  — and rows the destination field's own `kinds` refused get one warning each, naming the kind first
  because that is what an author changes. A drop reason this version does not recognise prints as
  the code the gateway sent. Without this, the entire visible account of a successful conversion was
  the retirement lines, which say content is now read-only — the opposite of what happened.
  `fieldMigrationLines(report)` is exported so a wrapper can print the same lines its own way, with
  the `FieldMigrationReport`, `ConvertedFieldMigration`, `DroppedLinkRows` and
  `RetiredFieldMigration` types. Every part of the report is optional, so deploying against a
  gateway that reports less still works.

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
