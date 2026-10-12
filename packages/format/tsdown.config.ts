import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    date: 'src/date.ts',
    list: 'src/list.ts',
    'relative-time': 'src/relative-time.ts',
    'display-names': 'src/display-names.ts',
  },
  format: 'esm',
  platform: 'neutral',
  dts: true,
  sourcemap: false,
  clean: true,
});
