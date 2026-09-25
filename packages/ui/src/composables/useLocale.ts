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

/**
 * The store currency `Price` and its future siblings format with by default (spec "Price" →
 * Properties, `currency` row: "store currency") — a provide/inject pair, the same shape as
 * `LOCALE_KEY` and deliberately separate from it: a store's number locale and its currency are two
 * different decisions (an `en-US`-formatted store may still sell in `ISK`).
 *
 * It is an ambient default, never an answer: every component that reads it also takes a `currency`
 * prop, and the prop wins. With nothing provided the components format in `USD`.
 */
export const DEFAULT_UI_CURRENCY = 'USD';

/**
 * The injection key the currency provider writes to. Exported so an app can set the currency from
 * outside a `setup()` scope — and so it can provide a **getter**, which is what makes a currency
 * switch reactive without an effect that outlives a server request:
 *
 * ```ts
 * import { CURRENCY_KEY } from '@eldrajs/ui';
 * app.provide(CURRENCY_KEY, () => store.currency);
 * ```
 */
export const CURRENCY_KEY: InjectionKey<MaybeRefOrGetter<string | undefined>> =
  Symbol('eldra-ui-currency');

/**
 * Set the store currency for this component and everything below it.
 *
 * Wraps Vue's `provide`, so it must be called during `setup()`. Use
 * `app.provide(CURRENCY_KEY, currency)` for the app-wide case.
 */
export function provideEldraUiCurrency(currency: MaybeRefOrGetter<string | undefined>): void {
  provide(CURRENCY_KEY, currency);
}

/**
 * The currency a component should format money in: whatever an ancestor provided, else `USD`. A
 * ref or a getter is unwrapped on every read, so the value follows a currency switch.
 */
export function useEldraUiCurrency(): ComputedRef<string> {
  const provided = inject(CURRENCY_KEY, undefined);
  return computed(() => toValue(provided) ?? DEFAULT_UI_CURRENCY);
}
