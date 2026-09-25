import {
  computed,
  inject,
  provide,
  toValue,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
} from 'vue';

/**
 * The number locale the components format with, as a provide/inject pair — the same shape as
 * `useMessages`, and deliberately separate from it: the *strings* a component renders and the
 * *locale its numbers are formatted in* are two different decisions, and a store that accepts the
 * English defaults may still be an Icelandic shop.
 *
 * It is an ambient default, never an answer: every component that reads it also takes a `locale`
 * prop, and the prop wins. With nothing provided the components format in `en-US`.
 */
export const DEFAULT_UI_LOCALE = 'en-US';

/**
 * The injection key the locale provider writes to. Exported so an app can set the locale from
 * outside a `setup()` scope — and so it can provide a **getter**, which is what makes a locale
 * switch reactive without an effect that outlives a server request:
 *
 * ```ts
 * import { LOCALE_KEY } from '@eldrajs/ui';
 * app.provide(LOCALE_KEY, () => store.locale);
 * ```
 */
export const LOCALE_KEY: InjectionKey<MaybeRefOrGetter<string | undefined>> =
  Symbol('eldra-ui-locale');

/**
 * Set the number locale for this component and everything below it.
 *
 * Wraps Vue's `provide`, so it must be called during `setup()`. Use
 * `app.provide(LOCALE_KEY, locale)` for the app-wide case.
 */
export function provideEldraUiLocale(locale: MaybeRefOrGetter<string | undefined>): void {
  provide(LOCALE_KEY, locale);
}

/**
 * The locale a component should format numbers in: whatever an ancestor provided, else `en-US`.
 * A ref or a getter is unwrapped on every read, so the value follows a locale switch.
 */
export function useEldraUiLocale(): ComputedRef<string> {
  const provided = inject(LOCALE_KEY, undefined);
  return computed(() => toValue(provided) ?? DEFAULT_UI_LOCALE);
}
