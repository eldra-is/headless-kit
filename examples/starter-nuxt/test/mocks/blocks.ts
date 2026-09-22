/**
 * Mock `virtual:eldra/blocks` for vitest (aliased in `vitest.config.ts`).
 *
 * The real virtual module (`@eldrajs/vite-plugin-theme`'s Vite plugin)
 * builds this same shape — `Record<apiId, () => Promise<{ default:
 * Component }>>` — from the theme's scanned `blocks/*` directory. Rebuilding
 * it here with Vite's own `import.meta.glob` (rather than a static import
 * per block) means it never needs editing as blocks are added or removed —
 * unlike `@eldrajs/theme-vue`'s equivalent mock (a package with no blocks of
 * its own to glob), this starter always has real ones to resolve against.
 */
const modules = import.meta.glob<{ default: unknown }>('../../blocks/*/Block.vue');

const blocks: Record<string, () => Promise<{ default: unknown }>> = {};
for (const [path, loader] of Object.entries(modules)) {
  const apiId = path.split('/').at(-2);
  if (apiId !== undefined) blocks[apiId] = loader;
}

export default blocks;
