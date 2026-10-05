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
 * The injection key the store currency is provided under (spec "Price" → Properties, `currency`
 * row: "store currency") — the same provide/inject shape as `LOCALE_KEY` and deliberately separate
 * from it: a store's number locale and its currency are two different decisions (an
 * `en-US`-formatted store may still sell in `ISK`). It is an ambient default, never an answer:
 * every component that reads it also takes a `currency` prop, and the prop wins. **With nothing
 * provided there is no currency at all** — see `useEldraUiCurrency` for what the components then
 * render, and why this pair has no default code.
 *
 * Exported so an app can set the currency from
 * outside a `setup()` scope — and so it can provide a **getter**, which is what makes a currency
 * switch reactive without an effect that outlives a server request:
 *
 * ```ts
 * import { CURRENCY_KEY } from '@eldrajs/ui';
 * app.provide(CURRENCY_KEY, () => store.currency);
 * ```
 *
 * Providing `undefined` is meaningful and different from not providing at all: it says the store
 * has **no** currency, which is the answer a platform that has not been told one must be able to
 * give. Vue's `inject` consults `key in provides`, so the two cases stay distinguishable (see
 * `useEldraUiCurrency`).
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
 * A value no provider can supply, so `inject`'s default tells "nobody provided a currency" apart
 * from "a provider answered: this store has none". Vue's `inject` returns a provided `undefined`
 * rather than the default (it tests `key in provides`), which is what makes the distinction real.
 */
const NO_CURRENCY_PROVIDER: unique symbol = Symbol('eldra-ui-currency-absent');

/** Dev-only, and once for the whole session: the warning names a wiring mistake that is the same
 *  on every component on the page, so one line says all of it. */
let warnedNoCurrencyProvider = false;
function warnNoCurrencyProvider(): void {
  if (!import.meta.env?.DEV || warnedNoCurrencyProvider) return;
  warnedNoCurrencyProvider = true;
  console.warn(
    '[@eldrajs/ui] no currency provider: nothing supplied CURRENCY_KEY ' +
      '(provideEldraUiCurrency / app.provide(CURRENCY_KEY, …)), so a component with no `currency` ' +
      'prop of its own formats amounts as plain numbers with no currency symbol. Provide the ' +
      'store currency, or provide `undefined` to say the store has none and silence this.'
  );
}

/**
 * The currency a component should format money in: whatever an ancestor provided, else **nothing**.
 * A ref or a getter is unwrapped on every read, so the value follows a currency switch.
 *
 * **There is no default code.** A component library installed by a shop of any kind cannot guess
 * one: a `USD` fallback puts a dollar sign in front of krónur, and a wrong price is worse than an
 * incomplete one. So `undefined` comes back whenever there is no currency to name, and a component
 * reading it formats the amount as a plain number through the same `Intl` path, with no symbol and
 * no code (`Price` does exactly that). The empty string is read as "no currency" too: it is not a
 * code `Intl` accepts, and it was the only way to decline one while this composable still defaulted.
 *
 * Two ways to arrive at `undefined`, and only one of them is a mistake. A provider that supplies
 * `undefined` (or `''`) has *answered* — this store has no currency — and nothing is logged. Having
 * no provider at all is unwired, and warns once per session in dev.
 */
export function useEldraUiCurrency(): ComputedRef<string | undefined> {
  const provided = inject<MaybeRefOrGetter<string | undefined> | typeof NO_CURRENCY_PROVIDER>(
    CURRENCY_KEY,
    NO_CURRENCY_PROVIDER
  );
  return computed(() => {
    if (provided === NO_CURRENCY_PROVIDER) {
      warnNoCurrencyProvider();
      return undefined;
    }
    const currency = toValue(provided);
    return currency === undefined || currency === '' ? undefined : currency;
  });
}
