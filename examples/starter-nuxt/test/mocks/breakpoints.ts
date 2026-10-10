/**
 * Mock `virtual:eldra/breakpoints` for vitest (aliased in `vitest.config.ts`).
 * The starter configures no `eldra.breakpoints` override in `nuxt.config.ts`,
 * so the real virtual module resolves to these same defaults
 * (`@eldrajs/theme-core/layout`'s `DEFAULT_LAYOUT_BREAKPOINTS`).
 */
export default { tablet: 768, normal: 1024 };
