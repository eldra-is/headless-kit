/**
 * Mock `virtual:eldra/manifest` for vitest (aliased in `vitest.config.ts`).
 * Re-exports the starter's own committed `.eldra/manifest.json` — unlike
 * `@eldrajs/theme-vue`'s equivalent mock (a hand-written fixture, since that
 * package has no blocks of its own), the starter already has a real
 * generated manifest for its ten real blocks, so there is nothing to
 * hand-maintain here.
 */
import manifest from '../../.eldra/manifest.json';

export default manifest;
