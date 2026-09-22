import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  platform: 'neutral',
  dts: true,
  sourcemap: false,
  clean: true,
  // The Vite plugin provides these at build time; never bundle a stub. `vue` is a peer and stays external.
  external: ['virtual:eldra/blocks', 'virtual:eldra/manifest', 'virtual:eldra/breakpoints'],
});
