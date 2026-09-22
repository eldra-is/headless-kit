import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

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
