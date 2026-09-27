/**
 * Mock theme manifest resolved by the `virtual:eldra/manifest` alias.
 *
 * `hero` declares two slots: an `actions` slot allowlisted to `cta` (plus
 * `hero` itself so a nested slotted host is representable in tests — the
 * scanner would reject a self-host allowlist, but this fixture is test data)
 * and a no-allowlist `footer` slot (any block except the host itself).
 * `cta` declares no slots.
 *
 * `hero` also carries a `migrations` step (its `heading` field used to be
 * called `title`) purely so `buildTemplateBlockCatalog`'s `renames` wiring
 * has a manifest block to read — see EldraLayout's template-block renames
 * test, which is the only spec that depends on it.
 */
export default {
  manifestVersion: 1,
  theme: {
    name: '@eldrajs/theme-vue-test',
    version: '0.0.0',
    framework: 'vue',
    sdk: { core: '0.0.0', vitePlugin: '0.0.0' },
  },
  blocks: [
    {
      apiId: 'hero',
      name: 'Hero',
      version: 2,
      fields: [
        { fieldId: 'heading', name: 'Heading', type: 'string', default: 'Default heading' },
        { fieldId: 'byline', name: 'Byline', type: 'string' },
      ],
      migrations: [{ version: 2, renames: [{ from: 'title', to: 'heading' }] }],
      mock: {},
      previewImage: null,
      slots: [
        { id: 'actions', label: 'Actions', maxItems: 2, allowedBlockApiIds: ['cta', 'hero'] },
        { id: 'footer', label: 'Footer', maxItems: 2 },
      ],
    },
    { apiId: 'cta', name: 'CTA', version: 1, fields: [], mock: {}, previewImage: null },
  ],
  routes: [],
  customPages: [],
  tokens: { colors: {}, containers: {} },
};
