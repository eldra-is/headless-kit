import { setup, type Preview } from '@storybook/vue3-vite';
import { registerBlockFields } from '@eldrajs/theme-vue';
import blockFields from 'virtual:eldra/block-fields';
import '../app/assets/main.css';
// The theme's own `--eldra-color-*` / `--eldra-container-*` custom properties,
// generated from tokens.json — normally injected by @eldrajs/theme-nuxt's
// runtime plugin. It comes *after* main.css deliberately: main.css imports
// `@eldrajs/ui/tailwind.css`, which declares the package's own defaults for
// the same `--eldra-color-*` names on `:root`, and the theme's values (what
// Studio edits) have to be the ones that win.
import 'virtual:eldra/tokens.css';
import { withEldraContext } from './eldra';
import { NuxtLinkStub } from './nuxt-link-stub';
import { createStorybookIconFetcher } from './iconFetcher';
import { ICON_FETCHER_KEY } from '../app/composables/iconFetcher';

// Mirrors the runtime plugin: register block field metadata once so
// `useEldraBlockField` / `EldraRichText` (the `article` block's rich-text
// field) resolve a field's `localized` flag the same way a real page does.
registerBlockFields(blockFields);

setup((app) => {
  // The only Nuxt global the theme reaches for, and only from
  // `app/components/EldraRouterLink.vue` (the component blocks hand
  // `@eldrajs/ui`'s `Link` as `as` for an internal destination) — Storybook has
  // no Nuxt runtime to resolve the tag, so render a plain `<a>` in its place.
  app.component('NuxtLink', NuxtLinkStub);
  // `EldraIcon` -> `useEldraIcon` normally calls Nuxt's `/api/eldra-icon`
  // route, which does not exist under Storybook's plain Vite build. Provide
  // the glob-based fetcher app-wide so every story resolves icons the same
  // way a real page does, just from a different transport.
  app.provide(ICON_FETCHER_KEY, createStorybookIconFetcher());
});

const preview: Preview = {
  decorators: [withEldraContext],
  parameters: {
    // Storybook pads `#storybook-root` by 1rem unless a story is `fullscreen`. Every block here is
    // a full-width page section (a sticky header, a hero, a footer), so it renders edge to edge the
    // way it does on a real page — and the preview screenshots, which clip to the story root,
    // stay true to the page too.
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};
export default preview;
