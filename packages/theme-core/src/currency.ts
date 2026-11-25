/** The currencies a shop can sell in, in the platform's own order (WS-1383). */
export const SELLING_CURRENCIES = ['ISK', 'EUR', 'USD', 'GBP', 'CAD', 'DKK', 'NOK', 'SEK'] as const;

type SellingCurrency = (typeof SELLING_CURRENCIES)[number];

const EURO_COUNTRIES = [
  'AD',
  'AT',
  'AX',
  'BE',
  'BG',
  'BL',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GF',
  'GP',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MC',
  'ME',
  'MF',
  'MQ',
  'MT',
  'NL',
  'PM',
  'PT',
  'RE',
  'SI',
  'SK',
  'SM',
  'VA',
  'XK',
  'YT',
];

const COUNTRY_CURRENCY: Readonly<Record<string, SellingCurrency>> = {
  ...Object.fromEntries(EURO_COUNTRIES.map((country) => [country, 'EUR' as const])),
  IS: 'ISK',
  US: 'USD',
  AS: 'USD',
  GU: 'USD',
  MP: 'USD',
  PR: 'USD',
  UM: 'USD',
  VI: 'USD',
  GB: 'GBP',
  GG: 'GBP',
  IM: 'GBP',
  JE: 'GBP',
  CA: 'CAD',
  DK: 'DKK',
  FO: 'DKK',
  GL: 'DKK',
  NO: 'NOK',
  SJ: 'NOK',
  SE: 'SEK',
};

/** The selling currency a country pays in (ISO 3166-1 alpha-2, as `countryFromHeader` answers it), or `null`. */
export function currencyForCountry(country: string | null | undefined): SellingCurrency | null {
  return country ? (COUNTRY_CURRENCY[country] ?? null) : null;
}

export interface VisitorCurrencyInput {
  /** The shop's default currency (`defaultCurrencyOf`): what every page is built in. */
  base: string;
  /** The currencies the shop shows, `base` first. */
  offered: readonly string[];
  /** The visitor's earlier choice, if any. */
  remembered?: string | null;
  /** The visitor's country, as the edge reports it. */
  country?: string | null;
}

/** Remembered choice, then the visitor's country, then the shop's default: each only if offered. */
export function resolveVisitorCurrency(input: VisitorCurrencyInput): string {
  const offered = new Set(input.offered);
  if (input.remembered && offered.has(input.remembered)) return input.remembered;
  const fromCountry = currencyForCountry(input.country);
  if (fromCountry !== null && offered.has(fromCountry)) return fromCountry;
  return input.base;
}

/** What pages are built in: `defaultCurrency`, else (before contract 6.22.0) the first of a `currencies` without `currency`, else `currency`. */
export function defaultCurrencyOf(commerce: {
  currency: string;
  currencies?: readonly unknown[] | null;
  defaultCurrency?: unknown;
}): string {
  const listed = Array.isArray(commerce.currencies) ? commerce.currencies : [];
  const candidate = listed.includes(commerce.currency) ? undefined : listed[0];
  for (const code of [commerce.defaultCurrency, candidate]) {
    if (isSellingCurrency(code)) return code;
  }
  return commerce.currency;
}

function isSellingCurrency(code: unknown): code is SellingCurrency {
  return (SELLING_CURRENCIES as readonly unknown[]).includes(code);
}

/** Selling currencies only, no repeats, `base` (the default) first; a list without `base` is not trusted and answers `[base]`. */
export function offeredCurrencies(
  base: string,
  listed: readonly unknown[] | null | undefined
): string[] {
  if (!Array.isArray(listed) || !listed.includes(base)) return [base];
  const rest = SELLING_CURRENCIES.filter(
    (code) => code !== base && listed.includes(code)
  ) as string[];
  return [base, ...rest];
}

/** The site's own route that answers `{ country }` from the edge's `CF-IPCountry` header. */
export const VISITOR_COUNTRY_PATH = '/_eldra/visitor';

/** A two-letter country from `CF-IPCountry`, or `null` for none, unknown (`XX`) or Tor (`T1`). */
export function countryFromHeader(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== 'XX' ? code : null;
}
