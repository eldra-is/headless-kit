import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);
// This package depends on Nuxt, never on Vue directly, so `vue` is not linked
// into its own node_modules — but the runtime composables import it, and a unit
// test that mounts one has to resolve it. Take the copy Nuxt itself uses, which
// is by definition the one the module runs against.
const vueDir = dirname(
  require.resolve('vue/package.json', { paths: [dirname(require.resolve('nuxt/package.json'))] })
);

export default defineConfig({
  resolve: {
    alias: {
      // Unit tests run outside a Nuxt build, where vite-plugin-theme's virtual
      // module does not exist. Resolve it to the fixture's scanned manifest so
      // the runtime slot catalog (drafts.ts, EldraLayout.ts) is validated
      // against the same manifest the generate/browser fixtures consume.
      'virtual:eldra/manifest': fileURLToPath(
        new URL('./test/fixtures/basic/.eldra/manifest.json', import.meta.url)
      ),
      vue: vueDir,
    },
  },
  test: {
    name: 'theme-nuxt',
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
