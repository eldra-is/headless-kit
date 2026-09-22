import { setup, type Preview } from '@storybook/vue3-vite';
import { registerBlockFields } from '@eldrajs/theme-vue';
import blockFields from 'virtual:eldra/block-fields';
// The raw `--eldra-color-*` custom properties app/assets/main.css's
// `@theme static` block maps into Tailwind color utilities — normally
// injected by @eldrajs/theme-nuxt's runtime plugin
// (packages/theme-nuxt/src/runtime/plugin.ts).
import 'virtual:eldra/tokens.css';
import '../app/assets/main.css';
import { withEldraContext } from './eldra';
import { NuxtLinkStub } from './nuxt-link-stub';

// Mirrors the runtime plugin: register block field metadata once so
// `useEldraBlockField` / `EldraRichText` (the `article` block's rich-text
// field) resolve a field's `localized` flag the same way a real page does.
registerBlockFields(blockFields);

setup((app) => {
  // The only Nuxt global the ten starter blocks use (see
  // blocks/navigation/Block.vue) — Storybook has no Nuxt runtime to resolve
  // it, so render a plain `<a>` in its place.
  app.component('NuxtLink', NuxtLinkStub);
});

const preview: Preview = {
  decorators: [withEldraContext],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};
export default preview;
