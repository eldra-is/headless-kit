// `.cjs`, not `.json`, so this budget can carry a real comment (final review I1/item 8):
// size-limit's own config schema rejects unknown JSON keys ("comment" included), so a plain JSON
// file has nowhere to record *why* a limit sits where it does.
module.exports = [
  {
    name: '@eldrajs/sdk — createEldraClient',
    path: 'packages/sdk/dist/index.js',
    import: '{ createEldraClient }',
    limit: '2.5 kB',
  },
  {
    name: '@eldrajs/sdk — everything',
    path: 'packages/sdk/dist/index.js',
    limit: '3 kB',
  },
  {
    name: '@eldrajs/rich-text — toHtml',
    path: 'packages/rich-text/dist/index.js',
    import: '{ toHtml }',
    limit: '3 kB',
  },
  {
    name: '@eldrajs/rich-text — everything',
    path: 'packages/rich-text/dist/index.js',
    limit: '6 kB',
  },
  {
    name: '@eldrajs/vue — RichText, without vue',
    path: 'packages/vue/dist/index.js',
    import: '{ RichText }',
    ignore: ['vue'],
    limit: '6 kB',
  },
  {
    name: '@eldrajs/theme-core — everything',
    path: 'packages/theme-core/dist/index.js',
    limit: '29 kB',
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
  // this number is the honest size of the overlay set, not a regression to chase back down. 80 kB
  // leaves headroom for the remaining catalogue growth without another red-gate fire drill; a
  // future jump close to it should prompt the same per-component shaking check the final review
  // ran (`pnpm --filter @eldrajs/ui build`, then measure a single-component import), not another
  // reflexive raise.
  {
    name: '@eldrajs/ui — everything, without vue',
    path: 'packages/ui/dist/index.js',
    ignore: ['vue'],
    limit: '80 kB',
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
  {
    name: '@eldrajs/ui — style.css',
    path: 'packages/ui/dist/style.css',
    limit: '13.5 kB',
  },
  {
    name: '@eldrajs/theme-vue — everything, without vue',
    path: 'packages/theme-vue/dist/index.js',
    ignore: ['vue', 'virtual:eldra/blocks', 'virtual:eldra/manifest', 'virtual:eldra/breakpoints'],
    limit: '32.5 kB',
  },
];
