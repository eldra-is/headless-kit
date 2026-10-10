import { defineNuxtPlugin } from 'nuxt/app';
import { inject, watch } from 'vue';
import { createI18n, type DefineLocaleMessage } from 'vue-i18n';
import { ELDRA_KEY, type EldraContext } from '@eldrajs/theme-vue';
import { unflattenMessages } from '@eldrajs/theme-core/i18n';
import manifest from 'virtual:eldra/manifest';

/**
 * Installs `vue-i18n` on the Vue app, fed by the theme's own message catalogue
 * (`context.messages`, `@eldrajs/theme-vue`'s `EldraContext['messages']`) —
 * the build-merged/resolved content `@eldrajs/theme-nuxt`'s runtime plugin
 * already assigned to it. Every block calls `useI18n()` from `vue-i18n`
 * directly; there is no wrapper composable here, by design.
 *
 * `context.messages.locales` is flat dotted keys, one record per locale tag
 * (the manifest's own wire shape); `unflattenMessages` turns each into the
 * nested shape vue-i18n's `messages` option expects, the same helper
 * `@eldrajs/theme-vue`'s bridge handler uses for a live override push.
 *
 * **The fallback chain.** `manifest.messages?.defaultLocale` is the *theme's*
 * own declared default locale (`package.json`'s `eldra.defaultLocale`,
 * read straight off `virtual:eldra/manifest` — unaffected by the build's
 * platform merge, unlike `context.messages.defaultLocale`, which by the time
 * a build resolves it names the *organisation's* default locale instead; see
 * `@eldrajs/theme-core/i18n`'s `resolveMessageCatalogue`). The organisation's
 * own default locale is `context.locales?.defaultLocale` — a different
 * concept from either, the site's own routing default — so the chain tries
 * that first, falling through to the theme's shipped default last.
 *
 * **The active locale.** `context.locales?.active` already folds in a Studio
 * preview's own locale override (see `@eldrajs/theme-nuxt`'s
 * `createNuxtEldraLocaleState`); `preview.locale` is the fallback for a
 * context assembled without the locale slice at all, the same two-source
 * order every other locale-aware plugin in this theme reads in
 * (`eldra-ui-messages.ts`).
 *
 * **Bridge updates.** Studio's "Theme texts" page pushes `editor:theme-messages`,
 * which `applyThemeMessages` (`@eldrajs/theme-vue`) applies by replacing
 * `context.messages.locales[tag]` wholesale, locale by locale. The deep watch
 * below re-applies every locale vue-i18n already knows (and adopts a locale it
 * does not yet, which `applyThemeMessages` can also add) through
 * `setLocaleMessage` — so a live edit reaches every block's `t(...)` call with
 * no re-render plumbing of its own, the same reactivity `context.messages`
 * being `reactive(...)` is there for.
 */
export default defineNuxtPlugin({
  name: 'eldra-i18n',
  setup(nuxtApp) {
    const context = nuxtApp.vueApp.runWithContext(() =>
      inject<EldraContext | undefined>(ELDRA_KEY, undefined)
    );

    const themeDefaultLocale = manifest.messages?.defaultLocale ?? 'en-US';
    const orgDefaultLocale = context?.locales?.defaultLocale ?? themeDefaultLocale;
    const activeLocale = (): string =>
      context?.locales?.active ?? context?.preview.locale ?? orgDefaultLocale;

    // Cast through `DefineLocaleMessage` (`app/i18n.d.ts`'s own schema augmentation): the build's
    // own scan/merge already guarantees every locale here carries the default locale's full key set
    // (`@eldrajs/theme-core/i18n`'s `resolveMessageCatalogue`), which is a build-time fact `unflattenMessages`'s
    // generic `Record<string, unknown>` return type cannot itself express.
    const sourceLocales = context?.messages.locales ?? {};
    const messages = Object.fromEntries(
      Object.keys(sourceLocales).map((tag) => [
        tag,
        unflattenMessages(sourceLocales[tag] ?? {}) as DefineLocaleMessage,
      ])
    );

    const i18n = createI18n({
      legacy: false,
      locale: activeLocale(),
      fallbackLocale: [orgDefaultLocale, themeDefaultLocale],
      messages,
    });

    nuxtApp.vueApp.use(i18n);

    if (context !== undefined) {
      watch(activeLocale, (locale) => {
        i18n.global.locale.value = locale;
      });

      watch(
        () => context.messages.locales,
        (locales) => {
          for (const tag of Object.keys(locales)) {
            i18n.global.setLocaleMessage(
              tag,
              unflattenMessages(locales[tag] ?? {}) as DefineLocaleMessage
            );
          }
        },
        { deep: true }
      );
    }
  },
});
