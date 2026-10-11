/**
 * Simulates a runtime whose ICU data does not cover a given locale — Chromium and `is-IS`, checked
 * directly against a real `@playwright/test` browser (`Intl.NumberFormat.supportedLocalesOf(['is-IS'])`
 * returns `[]` there) rather than assumed — without needing an actual browser in a unit test.
 *
 * `Intl.NumberFormat`'s own locale negotiation runs inside the native constructor, which nothing in
 * JS can reach into to make it choose differently for one tag. What this does instead is remove the
 * locale from whatever list reaches the constructor *before* negotiation runs, so the negotiation
 * that follows is the same one a runtime with no data for it would run on its own: a lone `'is-IS'`
 * strips to an empty list, which `Intl.NumberFormat` treats exactly as "no locale requested" and
 * answers with the runtime's own default (`en-US` here) — reproducing `number-format.ts`'s original
 * bug bit for bit — while `['is-IS', 'da-DK']` (`LOCALE_FALLBACKS`'s own chain) strips to `['da-DK']`,
 * which negotiates to that locale precisely as Chromium's real negotiation does.
 *
 * Patches the global `Intl.NumberFormat` in place rather than replacing all of `Intl`, so
 * `Intl.DateTimeFormat` and the rest are untouched; call the returned function (in a `finally` or an
 * `afterEach`) to put the real constructor back.
 */
export function withoutIcuDataFor(locale: string): () => void {
  const Original = Intl.NumberFormat;
  type Locales = ConstructorParameters<typeof Intl.NumberFormat>[0];

  function strip(locales: Locales): string[] | undefined {
    if (locales === undefined) return undefined;
    const list = Array.isArray(locales) ? locales : [locales as string];
    return list.filter((tag) => tag !== locale);
  }

  class StubbedNumberFormat extends Original {
    constructor(locales?: Locales, options?: Intl.NumberFormatOptions) {
      super(strip(locales), options);
    }

    static override supportedLocalesOf(
      locales: Locales,
      options?: Intl.NumberFormatOptions
    ): string[] {
      return Original.supportedLocalesOf(strip(locales) ?? [], options);
    }
  }

  // `lib.es2020.intl.d.ts` types `Intl.NumberFormat` with a bare call signature as well as a `new`
  // one — true of the real constructor, not of a `class extends` subclass — so the assignment needs
  // the cast; every call this package and its tests make is `new Intl.NumberFormat(...)`, which
  // `StubbedNumberFormat` serves exactly as the original does.
  Intl.NumberFormat = StubbedNumberFormat as unknown as typeof Intl.NumberFormat;

  return () => {
    Intl.NumberFormat = Original;
  };
}
