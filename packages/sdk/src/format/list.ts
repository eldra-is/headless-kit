import ListFormat from '@formatjs/intl-listformat';
import en from './data/list-en.json';
import is from './data/list-is.json';
import { cached, usesBundledData } from './locale';

type LocaleData = Parameters<typeof ListFormat.__addLocaleData>[0];

let loaded = false;
const formats = new Map<string, Intl.ListFormat>();

/** `new Intl.ListFormat(locale, options)` with the same text everywhere: `a, b og c`. */
export function listFormat(locale: string, options: Intl.ListFormatOptions = {}): Intl.ListFormat {
  return cached(formats, locale, options, () => {
    if (!usesBundledData(locale)) return new Intl.ListFormat(locale, options);
    new Intl.ListFormat('en', options); // the runtime's own option checks and error messages
    if (!loaded) {
      ListFormat.__addLocaleData(en as unknown as LocaleData, is as unknown as LocaleData);
      loaded = true;
    }
    return new ListFormat(locale, options) as unknown as Intl.ListFormat;
  });
}
