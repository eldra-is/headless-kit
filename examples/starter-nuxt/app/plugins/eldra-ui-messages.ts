import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { inject } from 'vue';
import { CURRENCY_KEY, LOCALE_KEY, MESSAGES_KEY, type UiMessages } from '@eldrajs/ui';
import { ELDRA_KEY, type EldraContext } from '@eldrajs/theme-vue';
import { uiEnUS, uiMessagesFor } from '../i18n/uiMessages';
import { toStorefrontCommerce } from '../storefront/commerce';

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
 * The same provide gives the package the content locale its **numbers** are
 * formatted in (`UnitInput`, `CurrencyInput`, `QuantityStepper`, `Price`), as
 * a getter for the same reason, plus the store **currency** `Price` formats
 * amounts in. All three are separate keys on purpose: the strings a component
 * renders, the locale its numbers are formatted in, and the currency its
 * prices are formatted in are three different decisions, and a component's own
 * `locale`/`currency` prop still wins over any of these.
 *
 * **The currency is the platform's, not the locale's.** It comes from the
 * organisation's own commerce settings, which `@eldrajs/theme-nuxt` reads once
 * during the build and puts on `runtimeConfig.public.eldra.commerce`. A store
 * that publishes none provides `undefined`, which `@eldrajs/ui` reads as "this
 * store has no currency" rather than as "nobody wired the provide" — so every
 * price on the page renders as a plain number instead of under a symbol nobody
 * chose, and the package logs nothing. The provide happens either way, which is
 * the part that matters: no provider at all is the case the package warns
 * about. It is read once here, not through a getter: unlike the locale, it
 * cannot change while the page is open.
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
    const publicConfig = useRuntimeConfig().public as unknown as {
      eldra?: { commerce?: unknown };
    };
    const currency = toStorefrontCommerce(publicConfig.eldra?.commerce)?.currency;
    const messages = {} as UiMessages;
    for (const key of Object.keys(uiEnUS) as (keyof UiMessages)[]) {
      Object.defineProperty(messages, key, {
        enumerable: true,
        get: () => uiMessagesFor(context?.preview.locale)[key],
      });
    }
    nuxtApp.vueApp.provide(MESSAGES_KEY, messages);
    nuxtApp.vueApp.provide(LOCALE_KEY, () => context?.preview.locale ?? undefined);
    nuxtApp.vueApp.provide(CURRENCY_KEY, currency);
  },
});
