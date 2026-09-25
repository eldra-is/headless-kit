import { defineNuxtPlugin } from 'nuxt/app';
import { inject } from 'vue';
import { MESSAGES_KEY, type UiMessages } from '@eldrajs/ui';
import { ELDRA_KEY, type EldraContext } from '@eldrajs/theme-vue';
import { uiEnUS, uiMessagesFor } from '../i18n/uiMessages';

/**
 * Gives every `@eldrajs/ui` component below the app the message set for the
 * active content locale (`useEldra().preview.locale`, the same source
 * `useT()` reads) — so the package's own strings follow Studio's locale
 * switch instead of being pinned to English at build time.
 *
 * The provided object is a set of getters rather than a snapshot. `useMessages`
 * reads the injected object inside a `computed`, so touching `preview.locale`
 * through a getter is what makes the switch reactive — and, unlike a `watch`,
 * it creates no effect that would outlive a server request.
 *
 * `runWithContext` is how a plugin injects an app-level provide from outside a
 * `setup()` scope: @eldrajs/theme-nuxt's own plugin puts the context on
 * `vueApp` before this one runs. Absent it (nothing else in this theme
 * depends on that ordering) the English defaults stand.
 */
export default defineNuxtPlugin({
  name: 'eldra-ui-messages',
  setup(nuxtApp) {
    const context = nuxtApp.vueApp.runWithContext(() =>
      inject<EldraContext | undefined>(ELDRA_KEY, undefined)
    );
    const messages = {} as UiMessages;
    for (const key of Object.keys(uiEnUS) as (keyof UiMessages)[]) {
      Object.defineProperty(messages, key, {
        enumerable: true,
        get: () => uiMessagesFor(context?.preview.locale)[key],
      });
    }
    nuxtApp.vueApp.provide(MESSAGES_KEY, messages);
  },
});
