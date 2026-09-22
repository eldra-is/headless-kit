import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: 'esm',
  platform: 'node',
  // tsdown defaults fixedExtension to true when platform is 'node', which
  // emits .mjs/.cjs regardless of package.json's "type". This package is
  // type: module and its exports map / bin point at dist/*.js, so force
  // plain extensions to match.
  fixedExtension: false,
  dts: true,
  sourcemap: false,
  clean: true,
});
