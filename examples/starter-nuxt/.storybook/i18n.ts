import { createI18n } from 'vue-i18n';
import enUS from '../i18n/en-US.json';
import isIS from '../i18n/is-IS.json';

/**
 * No gateway and no `virtual:eldra/messages` in Storybook — `vue-i18n` is installed straight from
 * the starter's own two locale files, the same fallback chain a real build's `app/plugins/
 * eldra-i18n.ts` resolves to on a single-locale site (there is no organisation here, so "org
 * default" and "theme default" are the one locale, `en-US`).
 *
 * One instance, installed once on the Storybook Vue app (`preview.ts`'s `setup(app)`); every block
 * rendered as a story calls `useI18n()` and reaches this. `withEldraContext` only ever needs its
 * `locale` to read `en-US` — no story here switches language (see `.storybook/eldra.ts`) — so there
 * is nothing to keep in sync beyond installing it.
 */
export const STARTER_DEFAULT_LOCALE = 'en-US';

export const storybookI18n = createI18n({
  legacy: false,
  locale: STARTER_DEFAULT_LOCALE,
  fallbackLocale: STARTER_DEFAULT_LOCALE,
  messages: { 'en-US': enUS, 'is-IS': isIS },
});
