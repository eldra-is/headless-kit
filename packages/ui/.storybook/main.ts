import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import type { PluginOption } from 'vite';
import type { StorybookConfig } from '@storybook/vue3-vite';

/**
 * Plugin-name prefixes contributed by `packages/ui/vite.config.ts`.
 *
 * Storybook's Vite builder loads the package's own `vite.config.ts` as its base
 * config (it keeps the plugins and throws the `build` block away), so this
 * package's library plugins arrive here already registered. Two instances of
 * `@vitejs/plugin-vue` make the second one parse an SFC that the first has
 * already turned into JavaScript ("At least one <template> or <script> is
 * required in a single file component"), and `vite-plugin-dts` would emit the
 * library's declarations into `dist/` during a Storybook build. So they are
 * dropped here and the two Storybook actually needs are added back fresh.
 */
const LIBRARY_PLUGIN_PREFIXES = ['vite:vue', 'unplugin-dts', '@tailwindcss/vite'];

function flatten(plugins: PluginOption[]): PluginOption[] {
  return plugins.flatMap((plugin) => (Array.isArray(plugin) ? flatten(plugin) : [plugin]));
}

function isLibraryPlugin(plugin: PluginOption): boolean {
  const name = (plugin as { name?: string } | null | undefined)?.name;
  return name !== undefined && LIBRARY_PLUGIN_PREFIXES.some((prefix) => name.startsWith(prefix));
}

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.ts'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: '@storybook/vue3-vite', options: {} },
  async viteFinal(viteConfig) {
    viteConfig.plugins = [
      ...flatten(viteConfig.plugins ?? []).filter((plugin) => !isLibraryPlugin(plugin)),
      // @storybook/vue3-vite compiles CSF story templates only; the package's
      // own `.vue` SFCs need @vitejs/plugin-vue registered explicitly.
      vue(),
      // `.storybook/preview.css` starts with `@import 'tailwindcss'`, so the
      // theme in `src/styles/tailwind.css` and every utility a component uses
      // is compiled by Tailwind's own Vite plugin — the same pipeline
      // `vite build` uses for `dist/style.css`.
      tailwindcss(),
    ];
    return viteConfig;
  },
};

export default config;
