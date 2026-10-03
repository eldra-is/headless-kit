import { enUS as uiEnUS, type UiMessages } from '@eldrajs/ui';
import { isIS as uiIsIS } from '@eldrajs/ui/messages/is-IS';

/**
 * The `@eldrajs/ui` message set for a content locale.
 *
 * The package never reaches for an i18n library: the text its components draw
 * themselves ("Close", "Clear", "No matches for…") comes from a `messages`
 * prop or an ancestor's `provide`, over English defaults. This theme has the
 * same two locales as `app/i18n/{en-US,is-IS}.ts`, so the mapping is one
 * function — `en-US` (and anything unknown) keeps the English defaults,
 * `is-IS` takes the package's own Icelandic entry point, which an
 * English-only store therefore never bundles beyond this file.
 *
 * Wired app-wide by `app/plugins/eldra-ui-messages.ts`, and by
 * `.storybook/eldra.ts` / `test/support/mountBlock.ts` for the environments
 * that have no Nuxt runtime.
 */
export function uiMessagesFor(locale: string | null | undefined): UiMessages {
  return locale === 'is-IS' ? uiIsIS : uiEnUS;
}

export { uiEnUS };
