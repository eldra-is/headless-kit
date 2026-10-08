import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { inject } from 'vue';
import { CURRENCY_KEY, LOCALE_KEY, MESSAGES_KEY, enUS as uiEnUS, type UiMessages } from '@eldrajs/ui';
import { isIS as uiIsIS } from '@eldrajs/ui/messages/is-IS';
import { ELDRA_KEY, type EldraContext } from '@eldrajs/theme-vue';
import { toStorefrontCommerce } from '../storefront/commerce';

/** The package's own default message set for a content locale — `is-IS` takes its Icelandic entry
 * point, anything else (including `undefined`) keeps the English defaults. Only this plugin's own
 * fallback for a key the active locale's catalogue carries no override of, or a parameterized key
 * (see below) the catalogue cannot carry at all. */
function uiPackageMessagesFor(locale: string | null | undefined): UiMessages {
  return locale === 'is-IS' ? uiIsIS : uiEnUS;
}

/**
 * Gives every `@eldrajs/ui` component below the app the message set for the
 * active content locale (`useEldra().locales.active`, the same source
 * `app/plugins/eldra-i18n.ts`'s `vue-i18n` plugin reads) — so the package's
 * own strings follow the locale the page is served under, and Studio's locale
 * switch, instead of being pinned to English at build time. `preview.locale`
 * is the fallback for a context assembled without the locale slice.
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
 *
 * **The package's own strings now come from the theme's message catalogue**
 * (`context.messages`, under the `ui.*` namespace — "Kit: the `@eldrajs/ui`
 * message sets go under `ui.*` in the same files"), not from the package's
 * exports directly, so Studio can override one the same way it overrides any
 * other theme text. Only the package's **plain-string** keys can travel that
 * way: `i18n/<tag>.json`'s `ui.*` section holds exactly those (the manifest
 * scanner only accepts string values, so a function could never reach it in
 * the first place). The package's ~40 **parameterized** keys (`closeDrawer`,
 * `reviewCount`, …) are not in the catalogue at all and are not overridable —
 * they keep coming straight from `uiPackageMessagesFor`, functions and all,
 * which is also where a plain-string key falls back to when the active
 * locale's catalogue entry is missing (an organisation locale the theme ships
 * no `ui.*` translation for).
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
    // The page's own content locale, read through a getter on every access for the same reason
    // the message getters below exist: it changes when the visitor changes language, and the
    // package reads both inside a `computed`.
    const activeLocale = (): string | undefined =>
      context?.locales?.active ?? context?.preview.locale ?? undefined;
    const messages = {} as UiMessages;
    for (const key of Object.keys(uiEnUS) as (keyof UiMessages)[]) {
      Object.defineProperty(messages, key, {
        enumerable: true,
        get: () => {
          const locale = activeLocale();
          const packageValue = uiPackageMessagesFor(locale)[key];
          if (typeof packageValue === 'function') return packageValue;
          const resolvedLocale = locale ?? context?.messages.defaultLocale;
          const override = resolvedLocale
            ? context?.messages.locales[resolvedLocale]?.[`ui.${key}`]
            : undefined;
          return override ?? packageValue;
        },
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
