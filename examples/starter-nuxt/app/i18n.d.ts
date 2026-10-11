import type en from '../i18n/en-US.json';

/**
 * `vue-i18n`'s own "Global Resource Schema" mechanism: augmenting
 * `DefineLocaleMessage` with the default locale's shape gives `useI18n()`'s
 * returned composer the full dotted-key union for editor autocomplete and
 * for anywhere else in the codebase that references `vue-i18n`'s own typed
 * resource paths. `en-US.json` is the default-locale file (`package.json`'s
 * `eldra.defaultLocale`) and therefore the superset every other locale file
 * is validated against (`@eldrajs/vite-plugin-theme`'s scan), so it is the
 * schema's single source of truth.
 *
 * **This augmentation alone does not reject an unknown key at a `t(...)`
 * call site** — `vue-i18n`'s own `ComposerTranslation` type signature is
 * `<Key extends string>(key: Key | ResourceKeys | number): string`, and a
 * free generic unioned with the resource-key type always infers successfully
 * from whatever literal is passed, so `t('nav.menuTypo')` type-checks
 * regardless of this file. The actual typecheck gate (`docs/starter-kit.md`
 * §5, "Typed keys") is the global ambient `MessageKey` union
 * `@eldrajs/vite-plugin-theme` generates into `.eldra/block-types.d.ts` from
 * the same `i18n/en-US.json` — used wherever a key is typed explicitly,
 * which every helper that hands a key to another call site does.
 */
declare module 'vue-i18n' {
  export interface DefineLocaleMessage extends LocaleSchema {}
}

type LocaleSchema = typeof en;
