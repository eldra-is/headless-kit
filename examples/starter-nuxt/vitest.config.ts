import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Only used to compile the .vue SFCs mounted directly in unit tests
  // (test/eldraIcon.spec.ts) outside of a full Nuxt build; it does not
  // affect the generate-based tests, which build through Nuxt's own Vite
  // pipeline in a child process.
  plugins: [vue()],
  resolve: {
    alias: {
      // `@eldrajs/theme-vue`'s single bundled entry imports these three
      // virtual module ids at the top level (EldraBlockZone/EldraLayout),
      // normally supplied only by `@eldrajs/vite-plugin-theme`'s Vite plugin
      // during a real theme build. Outside that build (plain `vitest`, here)
      // they resolve to nothing — mirrors `@eldrajs/theme-vue`'s own vitest
      // config, which aliases the same three ids to mocks under its own
      // `src/__tests__/mocks/*`. This is what lets every spec import
      // `@eldrajs/theme-vue` by package name instead of reaching into its
      // source directly — a copy of this starter from `eldra-theme init`
      // has no sibling monorepo packages to reach into at all.
      'virtual:eldra/blocks': fileURLToPath(new URL('./test/mocks/blocks.ts', import.meta.url)),
      'virtual:eldra/manifest': fileURLToPath(new URL('./test/mocks/manifest.ts', import.meta.url)),
      'virtual:eldra/breakpoints': fileURLToPath(
        new URL('./test/mocks/breakpoints.ts', import.meta.url)
      ),
    },
    // One Vue instance: @vue/test-utils and @eldrajs/theme-vue must share Vue's injection state.
    dedupe: ['vue'],
  },
  test: {
    name: 'starter-nuxt',
    environment: 'node',
    include: ['test/**/*.spec.ts', 'app/components/ui/__tests__/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
