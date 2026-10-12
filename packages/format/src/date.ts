import { DateTimeFormat } from '@formatjs/intl-datetimeformat';
import en from './data/date-en.json';
import is from './data/date-is.json';
import { cached, usesBundledData } from './locale';
import { withOurNumberFormat } from './number';

const UTC_ZONES = new Set(
  [
    'UTC',
    'Etc/UTC',
    'UCT',
    'Etc/UCT',
    'GMT',
    'Etc/GMT',
    'Etc/GMT0',
    'Etc/GMT+0',
    'Etc/GMT-0',
    'Greenwich',
    'Zulu',
    'Etc/Zulu',
    'Universal',
    'Etc/Universal',
    'Iceland',
    'Atlantic/Reykjavik',
    'Africa/Abidjan',
  ].map((zone) => zone.toLowerCase())
);
type LocaleData = Parameters<typeof DateTimeFormat.__addLocaleData>[0];

let loaded = false;
const formats = new Map<string, Intl.DateTimeFormat>();

/** `new Intl.DateTimeFormat(locale, options)` with the same text everywhere; the time zone defaults to UTC, Iceland's. */
export function dateTimeFormat(
  locale: string,
  options: Intl.DateTimeFormatOptions = {}
): Intl.DateTimeFormat {
  const resolved = { ...options, timeZone: options.timeZone ?? 'UTC' };
  return cached(formats, locale, resolved, () => {
    if (!usesBundledData(locale)) return new Intl.DateTimeFormat(locale, resolved);
    if (!UTC_ZONES.has(resolved.timeZone.toLowerCase())) {
      throw new RangeError(
        `@eldrajs/format formats ${locale} dates in UTC (Iceland's time), not ${resolved.timeZone}`
      );
    }
    new Intl.DateTimeFormat('en', resolved); // the runtime's own option checks and error messages
    if (!loaded) {
      DateTimeFormat.__addLocaleData(en as unknown as LocaleData, is as unknown as LocaleData);
      loaded = true;
    }
    return withOurNumberFormat(
      () =>
        new DateTimeFormat(locale, {
          ...resolved,
          timeZone: 'UTC',
        }) as unknown as Intl.DateTimeFormat
    );
  });
}
