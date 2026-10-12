import { NumberFormat } from '@formatjs/intl-numberformat';
import en from './data/number-en.json';
import is from './data/number-is.json';
import { cached, usesBundledData } from './locale';

type LocaleData = Parameters<typeof NumberFormat.__addLocaleData>[0];

const RuntimeNumberFormat = Intl.NumberFormat;
let loaded = false;
const formats = new Map<string, Intl.NumberFormat>();

/** `new Intl.NumberFormat(locale, options)` with the same text on every runtime, Chrome and Workers included. */
export function numberFormat(
  locale: string,
  options: Intl.NumberFormatOptions = {}
): Intl.NumberFormat {
  return cached(formats, locale, options, () => {
    if (!usesBundledData(locale)) return new RuntimeNumberFormat(locale, options);
    new RuntimeNumberFormat('en', options); // the runtime's own option checks and error messages
    if (!loaded) {
      NumberFormat.__addLocaleData(en as unknown as LocaleData, is as unknown as LocaleData);
      loaded = true;
    }
    return new NumberFormat(locale, options) as unknown as Intl.NumberFormat;
  });
}

/** Runs `build` with the global `Intl.NumberFormat` set to ours: formatjs ponyfills build their number formatters from it. */
export function withOurNumberFormat<T>(build: () => T): T {
  const global = Intl.NumberFormat;
  Intl.NumberFormat = numberFormat as unknown as typeof Intl.NumberFormat;
  try {
    return build();
  } finally {
    Intl.NumberFormat = global;
  }
}

/** A price in major units, the way every Eldra surface writes it: `12.900 kr.`, `ISK 12,900`. */
export function formatPrice(amount: number, currency: string, locale: string): string {
  return numberFormat(locale, { style: 'currency', currency }).format(amount);
}
