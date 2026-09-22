import type { StorybookConfig } from '@storybook/vue3-vite';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import eldraTheme from '@eldrajs/vite-plugin-theme';
import AutoImport from 'unplugin-auto-import/vite';
import { generateStories } from '../scripts/generate-stories.mjs';

const themeDir = fileURLToPath(new URL('..', import.meta.url));

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.ts', '../app/components/ui/**/*.stories.ts'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: '@storybook/vue3-vite', options: {} },
  async viteFinal(config) {
    // Stories are generated, not hand-written (see scripts/generate-stories.mjs)
    // — regenerate on every `storybook dev` / `build-storybook` invocation so
    // they are always current with blocks/*/block.json + mock.json.
    generateStories();
    config.plugins = [
      ...(config.plugins ?? []),
      vue(),
      // @storybook/vue3-vite only compiles CSF story templates
      // (storybookVuePlugin); it does not register @vitejs/plugin-vue for
      // the theme's own `.vue` SFCs, so this config adds it explicitly.
      //
      // Task 1 wired Tailwind via the fallback route (nuxt.config.ts:
      // `eldra.tailwind: false`, `app/assets/main.css` starts with
      // `@import 'tailwindcss'`) because the plugin's own
      // `virtual:eldra/tailwind-theme.css` entry cannot be resolved through
      // Vite's `@import` resolver. Mirror that here: register Tailwind's own
      // Vite plugin and disable the adapter's Tailwind entry.
      tailwindcss(),
      // The ten starter blocks are the OLD implementation (task-2-brief):
      // most rely on Nuxt's implicit auto-import of `vue` composition APIs
      // (`computed`, ...) instead of importing them, since Nuxt's Vite
      // pipeline auto-imports across the whole project, not just `app/`.
      // Storybook has no Nuxt build step, so mirror just that slice of it —
      // blocks render as-is, unmodified.
      AutoImport({ imports: ['vue'], dts: false }),
      eldraTheme({ themeDir, framework: 'nuxt', tailwind: false }),
    ];
    config.resolve = {
      ...config.resolve,
      alias: { ...(config.resolve?.alias ?? {}), '~': `${themeDir}app`, '@': `${themeDir}app` },
    };
    return config;
  },
};
export default config;
