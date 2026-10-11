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
import { storybookI18n } from './i18n';
import { NuxtLinkStub } from './nuxt-link-stub';

// Mirrors the runtime plugin: register block field metadata once so
// `useEldraBlockField` / `EldraRichText` (the `article` block's rich-text
// field) resolve a field's `localized` flag the same way a real page does.
registerBlockFields(blockFields);

setup((app) => {
  // No gateway, no `virtual:eldra/messages` — every block calls `useI18n()` directly, with no
  // wrapper in front of it, so Storybook needs `vue-i18n` installed on the app the same way a real
  // page's `app/plugins/eldra-i18n.ts` installs it. See `./i18n.ts`.
  app.use(storybookI18n);
  // The only Nuxt global the theme reaches for, and only from
  // `app/components/EldraRouterLink.vue` (the component blocks hand
  // `@eldrajs/ui`'s `Link` as `as` for an internal destination) — Storybook has
  // no Nuxt runtime to resolve the tag, so render a plain `<a>` in its place.
  app.component('NuxtLink', NuxtLinkStub);
  // Icons need nothing wired here: `useEldraIcon` reads `app/icons.ts`, which
  // bundles the theme's own Tabler icons, so a story resolves them exactly the
  // way a real page does.
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
