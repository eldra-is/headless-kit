/** The constructors a case formats with: the runtime's own, or this package's. */
export interface Formatters {
  number: (locale: string, options?: Intl.NumberFormatOptions) => Intl.NumberFormat;
  date: (locale: string, options?: Intl.DateTimeFormatOptions) => Intl.DateTimeFormat;
  list: (locale: string, options?: Intl.ListFormatOptions) => Intl.ListFormat;
  relative: (locale: string, options?: Intl.RelativeTimeFormatOptions) => Intl.RelativeTimeFormat;
  names: (locale: string, options: Intl.DisplayNamesOptions) => Intl.DisplayNames;
  compare: (locale: string) => (a: string, b: string) => number;
}

export const native: Formatters = {
  number: (locale, options) => new Intl.NumberFormat(locale, options),
  date: (locale, options) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }),
  list: (locale, options) => new Intl.ListFormat(locale, options),
  relative: (locale, options) => new Intl.RelativeTimeFormat(locale, options),
  names: (locale, options) => new Intl.DisplayNames(locale, options),
  compare: (locale) => new Intl.Collator(locale).compare,
};

const MOMENT = new Date(Date.UTC(2026, 9, 12, 14, 5, 9));
const WORDS = [
  'Ölfus',
  'Þórshöfn',
  'Akureyri',
  'Álftanes',
  'Zakynthos',
  'Æðey',
  'Eyrarbakki',
  'Ísafjörður',
  'Dalvík',
  'Óðinsvé',
  'Ýmir',
  'Úthlíð',
  'Ásbrú',
  'egg',
  'Egg',
  'Ég',
  'Élja',
  'Ítalía',
  'öl',
  'ál',
  'Ðrífa',
];

/** Every shape a storefront prints, each as `[label, text]` for one locale. */
export function render(f: Formatters, locale: string): [string, string][] {
  const out: [string, string][] = [];
  const add = (label: string, text: () => string) => out.push([label, text()]);
  for (const [currency, amount] of [
    ['ISK', 1234567],
    ['ISK', -12900],
    ['ISK', 0],
    ['EUR', 1234.5],
    ['USD', 0.5],
    ['GBP', 99.99],
    ['DKK', 1500],
    ['JPY', 1000],
  ] as const) {
    add(`price ${currency} ${amount}`, () =>
      f.number(locale, { style: 'currency', currency }).format(amount)
    );
  }
  add('price parts', () =>
    JSON.stringify(f.number(locale, { style: 'currency', currency: 'ISK' }).formatToParts(12900))
  );
  add('narrow ISK', () =>
    f
      .number(locale, { style: 'currency', currency: 'ISK', currencyDisplay: 'narrowSymbol' })
      .format(12900)
  );
  add('decimal', () => f.number(locale).format(1234567.891));
  add('integer', () => f.number(locale, { maximumFractionDigits: 0 }).format(1234567));
  add('percent', () => f.number(locale, { style: 'percent' }).format(0.255));
  add('compact', () => f.number(locale, { notation: 'compact' }).format(1234567));
  add('unit', () => f.number(locale, { style: 'unit', unit: 'kilometer' }).format(12.5));
  add('fraction digits', () => f.number(locale, { minimumFractionDigits: 2 }).format(3));
  for (const options of [
    { dateStyle: 'long' },
    { dateStyle: 'full' },
    { dateStyle: 'medium', timeStyle: 'short' },
    { day: 'numeric', month: 'short', year: 'numeric' },
    { day: 'numeric', month: 'long' },
    { weekday: 'long' },
    { month: 'long', year: 'numeric' },
    { hour: '2-digit', minute: '2-digit' },
    { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 2 },
    { dateStyle: 'long', timeStyle: 'short' },
    { dateStyle: 'full', timeStyle: 'short' },
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  ] satisfies Intl.DateTimeFormatOptions[]) {
    add(`date ${JSON.stringify(options)}`, () => f.date(locale, options).format(MOMENT));
  }
  add('date range', () =>
    f.date(locale, { dateStyle: 'medium' }).formatRange(MOMENT, new Date(Date.UTC(2026, 9, 19)))
  );
  add('list and', () => f.list(locale, { type: 'conjunction' }).format(['a', 'b', 'c']));
  add('list or', () => f.list(locale, { type: 'disjunction' }).format(['a', 'b', 'c']));
  add('list pair', () => f.list(locale).format(['a', 'b']));
  for (const [value, unit] of [
    [-3, 'day'],
    [1, 'day'],
    [-1, 'year'],
    [-1000, 'day'],
    [2, 'hour'],
    [-21, 'minute'],
  ] as const) {
    add(`relative ${value} ${unit}`, () => f.relative(locale).format(value, unit));
  }
  add('relative auto', () => f.relative(locale, { numeric: 'auto' }).format(-1, 'day'));
  for (const code of ['DK', 'IS', 'US', 'GB', 'DE'])
    add(`region ${code}`, () => f.names(locale, { type: 'region' }).of(code) ?? '');
  for (const code of ['is', 'en', 'de', 'pl'])
    add(`language ${code}`, () => f.names(locale, { type: 'language' }).of(code) ?? '');
  add('currency name', () => f.names(locale, { type: 'currency' }).of('EUR') ?? '');
  add('sort', () => [...WORDS].sort(f.compare(locale)).join(' '));
  return out;
}
