import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    vite: 'src/vite-plugin.ts',
  },
  format: 'esm',
  platform: 'neutral',
  dts: true,
  sourcemap: false,
  clean: true,
  deps: {
    neverBundle: [/^node:/, 'vite'],
  },
});
