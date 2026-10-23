// `.cjs`, not `.json`, so this budget can carry a real comment (final review I1/item 8):
// size-limit's own config schema rejects unknown JSON keys ("comment" included), so a plain JSON
// file has nowhere to record *why* a limit sits where it does.
module.exports = [
  // Raised from 2.5 kB / 3 kB when the transport grew its retry (`src/retry.ts`):
  // a `429` from the gateway's rate limit is waited out rather than failed, which
  // is what a static build of a real catalogue needs and is worth ~0.7 kB brotlied.
  {
    name: '@eldrajs/sdk — createEldraClient',
    path: 'packages/sdk/dist/index.js',
    import: '{ createEldraClient }',
    // 3.5 kB before `client.forms` (get/submit/confirm/unsubscribe, a 422 read as field messages):
    // about 0.2 kB brotlied, and the client is one object, so an unused method is not shaken out.
    limit: '3.75 kB',
  },
  {
    name: '@eldrajs/sdk — responsiveImage',
    path: 'packages/sdk/dist/index.js',
    import: '{ responsiveImage }',
    limit: '1 kB',
  },
  // Raised from 4 kB when `responsiveImage` and the media-variant helpers joined the
  // package (`src/image.ts`): ~0.2 kB brotlied on top of the retrying transport.
  {
    name: '@eldrajs/sdk — everything',
    path: 'packages/sdk/dist/index.js',
    // 4.5 kB before the image helpers read the `width` and `height` the API gives an image (contract
    // 4.14.0): about 0.08 kB brotlied, and 4.46 kB was already used.
    limit: '4.6 kB',
  },
  {
    name: '@eldrajs/rich-text — toHtml',
    path: 'packages/rich-text/dist/index.js',
    import: '{ toHtml }',
    limit: '3 kB',
  },
  {
    name: '@eldrajs/rich-text — safeImageSrc',
    path: 'packages/rich-text/dist/index.js',
    import: '{ safeImageSrc }',
    limit: '200 B',
  },
  {
    name: '@eldrajs/rich-text — everything',
    path: 'packages/rich-text/dist/index.js',
    limit: '6 kB',
  },
  // Each entry is mostly CLDR data for `is` and `en`; the comparator alone must stay small.
  {
    name: '@eldrajs/sdk/format — formatPrice',
    path: 'packages/sdk/dist/format.js',
    import: '{ formatPrice }',
    limit: '38 kB',
  },
  {
    name: '@eldrajs/sdk/format — compareIcelandic',
    path: 'packages/sdk/dist/format.js',
    import: '{ compareIcelandic }',
    limit: '1 kB',
  },
  // Dates include the number formatter (shared with the root entry) for the decimal in fractional seconds.
  {
    name: '@eldrajs/sdk/format — date',
    path: 'packages/sdk/dist/format/date.js',
    limit: '70 kB',
  },
  {
    name: '@eldrajs/sdk/format — list',
    path: 'packages/sdk/dist/format/list.js',
    limit: '12 kB',
  },
  {
    name: '@eldrajs/sdk/format — relative-time',
    path: 'packages/sdk/dist/format/relative-time.js',
    limit: '43 kB',
  },
  {
    name: '@eldrajs/sdk/format — display-names',
    path: 'packages/sdk/dist/format/display-names.js',
    limit: '32 kB',
  },
  {
    name: '@eldrajs/vue — RichText, without vue',
    path: 'packages/vue/dist/index.js',
    import: '{ RichText }',
    ignore: ['vue'],
    limit: '6 kB',
  },
  {
    name: '@eldrajs/vue — EldraImage, without vue',
    path: 'packages/vue/dist/index.js',
    import: '{ EldraImage }',
    ignore: ['vue'],
    // 1 kB before `imageSrcset` listed an original wider than `full`: +0.05 kB on 0.95 kB used.
    limit: '1.1 kB',
  },
  {
    name: '@eldrajs/theme-core — everything',
    path: 'packages/theme-core/dist/index.js',
    // SEO, sitemap, structured data, forms and analytics (WS-382–WS-387); storefronts tree-shake what they skip.
    limit: '32 kB',
  },
  {
    name: '@eldrajs/theme-core — overlay runtime',
    path: 'packages/theme-core/dist/overlay.js',
    import: '{ createOverlayRuntime }',
    limit: '12 kB',
  },
  {
    name: '@eldrajs/theme-core — bridge',
    path: 'packages/theme-core/dist/bridge.js',
    limit: '2 kB',
  },
  // The link resolver, on the same scale as the bridge: a route-pattern parser,
  // a page-path walk and one URL allowlist. A theme imports it on every page
  // that renders navigation, so it has to stay small.
  {
    name: '@eldrajs/theme-core — links',
    path: 'packages/theme-core/dist/links.js',
    limit: '3 kB',
  },
  // The icon data must stay lazy: one static import on this path ships all 6,287 icons (275 kB brotlied).
  {
    name: '@eldrajs/ui — TablerIcon, without vue, tailwind-merge or its lazy chunks',
    path: 'packages/ui/dist/index.js',
    import: '{ TablerIcon }',
    ignore: ['vue', 'tailwind-merge', './tablerIconData-*'],
    limit: '3.25 kB',
  },
  {
    name: "@eldrajs/ui — TablerIcon's lazy index, without the data files",
    path: 'packages/ui/dist/tablerIconData-*.js',
    ignore: ['./tabler-icons/*'],
    limit: '2 kB',
  },
  {
    name: '@eldrajs/ui — Button, without vue or tailwind-merge',
    path: 'packages/ui/dist/index.js',
    import: '{ Button }',
    ignore: ['vue', 'tailwind-merge'],
    limit: '6 kB',
  },
  // Raised 60 kB -> 80 kB (final review I1/item 8, plan 3): plan 3 shipped twelve overlay/
  // navigation components (Dialog, Drawer, Lightbox, SearchModal, Toast/Toaster, Tooltip, Popover,
  // Carousel, Tabs/Tab/TabPanel, Breadcrumb, Pagination, LoadMore) behind the one root entry this
  // budget measures. At bb95c35 the real, tree-shaken cost of "import everything" is 67.97 kB —
  // healthy per-component shaking (a `Button`-only import stays ~3 kB, see the row above) means
  // this number is the honest size of the overlay set, not a regression to chase back down.
  //
  // Raised 80 kB -> 88 kB for `FilterPanel`, and only after the per-component shaking check this
  // comment has always prescribed. Measured against the same `dist/` (2026-10-07):
  //
  //   { FilterPanel }               26.21 kB   composes Checkbox, Switch, Chip, Badge, Input,
  //                                            Button, CurrencyInput/UnitInput, RangeSlider, Link
  //   { RangeSlider }                7.25 kB
  //   { Checkbox }                   3.06 kB
  //   { swatchInk, toggleValue }     1.13 kB   the panel's pure modules, with no component at all
  //
  // A consumer importing one leaf still gets a leaf, and a consumer importing the panel pays for
  // the panel rather than for the library — so the 13 kB the "everything" total gained is the
  // honest size of a component that composes a third of the catalogue, not a shaking regression.
  // The same check is what the next jump close to this ceiling should start with, before any
  // further raise.
  // Raised from 88 kB for `@eldrajs/sdk/format`'s Icelandic and English data (~59 kB), which Chrome and Workers lack.
  // Raised from 150 kB for `NavMenu` (148.4 kB without it, 150.9 kB with it).
  // Raised from 152 kB for `NavMenu`'s variant, arrow keys and hover intent (152.16 kB with them).
  // Raised from 153 kB for `Image`'s `zoomOrigin` and `crops` (153.12 kB with them).
  // Raised from 154 kB for `TablerIcon` (154.19 kB with it, 2.74 kB alone); its icon data stays lazy, so is ignored here.
  {
    name: "@eldrajs/ui — everything, without vue or TablerIcon's lazy chunks",
    path: 'packages/ui/dist/index.js',
    ignore: ['vue', './tablerIconData-*'],
    limit: '155 kB',
  },
  // A second, narrow budget alongside the "everything" one above: proves a consumer importing one
  // small, leaf component (no overlay stack, no floating-ui, no carousel/toast machinery) still
  // gets real tree-shaking, not just the overlay bundle staying under its own generous ceiling.
  {
    name: '@eldrajs/ui — Badge, without vue or tailwind-merge',
    path: 'packages/ui/dist/index.js',
    import: '{ Badge }',
    ignore: ['vue', 'tailwind-merge'],
    limit: '12 kB',
  },
  // Raised 13.5 kB -> 14.5 kB for `FilterPanel`, which is mostly new CSS: a disclosure, five facet
  // shapes, a swatch and its ring, a size tile in four states, a histogram bar and the
  // container-query switch to two colour columns. Measured at 13.63 kB with it, so this keeps a
  // little under a kilobyte of headroom rather than sitting on the number.
  {
    name: '@eldrajs/ui — style.css',
    path: 'packages/ui/dist/style.css',
    limit: '14.5 kB',
  },
  {
    name: '@eldrajs/ui — components.css',
    path: 'packages/ui/dist/components.css',
    limit: '14.5 kB',
  },
  {
    name: '@eldrajs/theme-vue — everything, without vue',
    path: 'packages/theme-vue/dist/index.js',
    ignore: ['vue', 'virtual:eldra/blocks', 'virtual:eldra/manifest', 'virtual:eldra/breakpoints'],
    limit: '32.5 kB',
  },
];
