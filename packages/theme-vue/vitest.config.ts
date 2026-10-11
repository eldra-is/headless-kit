import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'virtual:eldra/blocks': fileURLToPath(
        new URL('./src/__tests__/mocks/blocks.ts', import.meta.url)
      ),
      'virtual:eldra/manifest': fileURLToPath(
        new URL('./src/__tests__/mocks/manifest.ts', import.meta.url)
      ),
      'virtual:eldra/breakpoints': fileURLToPath(
        new URL('./src/__tests__/mocks/breakpoints.ts', import.meta.url)
      ),
    },
    // One Vue instance: @vue/test-utils and this package must share Vue's injection state.
    dedupe: ['vue'],
  },
  test: { name: 'theme-vue', environment: 'jsdom', include: ['src/**/*.spec.ts'] },
});
