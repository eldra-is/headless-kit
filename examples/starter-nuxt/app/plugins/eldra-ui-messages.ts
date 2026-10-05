import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { inject } from 'vue';
import { CURRENCY_KEY, LOCALE_KEY, MESSAGES_KEY, type UiMessages } from '@eldrajs/ui';
import { ELDRA_KEY, type EldraContext } from '@eldrajs/theme-vue';
import { uiEnUS, uiMessagesFor } from '../i18n/uiMessages';
import { toStorefrontCommerce, uiCurrencyFor } from '../storefront/commerce';

/**
 * Gives every `@eldrajs/ui` component below the app the message set for the
 * active content locale (`useEldra().locales.active`, the same source `useT()`
 * reads) — so the package's own strings follow the locale the page is served
 * under, and Studio's locale switch, instead of being pinned to English at
 * build time. `preview.locale` is the fallback for a context assembled without
 * the locale slice.
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
 * that publishes none provides the empty string — see `uiCurrencyFor` for why
 * that, and not `undefined`, is what declines a currency — and every price on
 * the page then renders as a plain number instead of under a symbol nobody
 * chose. It is read once here, not through a getter: unlike the locale, it
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
    const currency = uiCurrencyFor(toStorefrontCommerce(publicConfig.eldra?.commerce)?.currency);
    // The page's own content locale, read through a getter on every access for the same reason
    // the message getters below exist: it changes when the visitor changes language, and the
    // package reads both inside a `computed`.
    const activeLocale = (): string | undefined =>
      context?.locales?.active ?? context?.preview.locale ?? undefined;
    const messages = {} as UiMessages;
    for (const key of Object.keys(uiEnUS) as (keyof UiMessages)[]) {
      Object.defineProperty(messages, key, {
        enumerable: true,
        get: () => uiMessagesFor(activeLocale())[key],
      });
    }
    nuxtApp.vueApp.provide(MESSAGES_KEY, messages);
    // The same value is the locale every `Intl` format in the theme runs in — `@eldrajs/ui`'s
    // `Price`/`CurrencyInput` and, through `useEldraUiLocale()`, `app/storefront/money.ts`. So a
    // page served under `/is-IS` prints "2.800 kr." where the same money reads "kr 2,800" on the
    // English one, while the currency itself stays the store's.
    nuxtApp.vueApp.provide(LOCALE_KEY, activeLocale);
    nuxtApp.vueApp.provide(CURRENCY_KEY, currency);
  },
});
