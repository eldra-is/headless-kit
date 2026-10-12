import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    vite: 'src/vite-plugin.ts',
    format: 'src/format/index.ts',
    'format/date': 'src/format/date.ts',
    'format/list': 'src/format/list.ts',
    'format/relative-time': 'src/format/relative-time.ts',
    'format/display-names': 'src/format/display-names.ts',
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
