import { DisplayNames } from '@formatjs/intl-displaynames';
import en from './data/display-names-en.json';
import is from './data/display-names-is.json';
import { cached, usesBundledData } from './locale';

type LocaleData = Parameters<typeof DisplayNames.__addLocaleData>[0];

let loaded = false;
const formats = new Map<string, Intl.DisplayNames>();

/** `new Intl.DisplayNames(locale, options)` with the same names everywhere: `Danmörk`. */
export function displayNames(locale: string, options: Intl.DisplayNamesOptions): Intl.DisplayNames {
  return cached(formats, locale, options, () => {
    if (!usesBundledData(locale)) return new Intl.DisplayNames(locale, options);
    new Intl.DisplayNames('en', options); // the runtime's own option checks and error messages
    if (!loaded) {
      DisplayNames.__addLocaleData(en as unknown as LocaleData, is as unknown as LocaleData);
      loaded = true;
    }
    return new DisplayNames(locale, options) as unknown as Intl.DisplayNames;
  });
}
