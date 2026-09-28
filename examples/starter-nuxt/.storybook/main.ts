import type { StorybookConfig } from '@storybook/vue3-vite';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import eldraTheme from '@eldrajs/vite-plugin-theme';
import { generateStories } from '../scripts/generate-stories.mjs';
import { starterTemplateRoles, starterTemplates } from '../app/templates';

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
      // `nuxt.config.ts` wires Tailwind via the fallback route
      // (`eldra.tailwind: false`, `app/assets/main.css` starts with
      // `@import 'tailwindcss'`) because the plugin's own
      // `virtual:eldra/tailwind-theme.css` entry cannot be resolved through
      // Vite's `@import` resolver. Mirror that here: register Tailwind's own
      // Vite plugin and disable the adapter's Tailwind entry.
      tailwindcss(),
      // Every block under `blocks/**` imports `vue`/`@eldrajs/*`
      // explicitly (see the block contract rule in `docs/starter-kit.md`),
      // so Storybook — which has no Nuxt build step to auto-import from —
      // needs no auto-import shim any more.
      // `templates`/`templateRoles` are declared here as well as in
      // `nuxt.config.ts` — not because Storybook renders a seeded template
      // (it does not), but because this plugin instance writes the same
      // `.eldra/manifest.json` the Nuxt build writes. Leaving them out here
      // made the checked-in manifest flip between "with seeds" and "without"
      // depending on which build ran last.
      eldraTheme({
        themeDir,
        framework: 'nuxt',
        tailwind: false,
        templates: starterTemplates(),
        templateRoles: starterTemplateRoles(),
      }),
    ];
    config.resolve = {
      ...config.resolve,
      alias: { ...(config.resolve?.alias ?? {}), '~': `${themeDir}app`, '@': `${themeDir}app` },
    };
    return config;
  },
};
export default config;
