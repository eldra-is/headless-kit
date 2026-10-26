import RelativeTimeFormat from '@formatjs/intl-relativetimeformat';
import en from './data/relative-time-en.json';
import is from './data/relative-time-is.json';
import { cached, usesBundledData } from './locale';
import { withOurNumberFormat } from './number';

type LocaleData = Parameters<typeof RelativeTimeFormat.__addLocaleData>[0];

let loaded = false;
const formats = new Map<string, Intl.RelativeTimeFormat>();

/** `new Intl.RelativeTimeFormat(locale, options)` with the same text everywhere: `fyrir 3 dögum`. */
export function relativeTimeFormat(
  locale: string,
  options: Intl.RelativeTimeFormatOptions = {}
): Intl.RelativeTimeFormat {
  return cached(formats, locale, options, () => {
    if (!usesBundledData(locale)) return new Intl.RelativeTimeFormat(locale, options);
    new Intl.RelativeTimeFormat('en', options); // the runtime's own option checks and error messages
    if (!loaded) {
      RelativeTimeFormat.__addLocaleData(en as unknown as LocaleData, is as unknown as LocaleData);
      loaded = true;
    }
    return withOurNumberFormat(
      () => new RelativeTimeFormat(locale, options) as unknown as Intl.RelativeTimeFormat
    );
  });
}
