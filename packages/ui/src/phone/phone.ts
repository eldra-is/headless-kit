/**
 * Everything `@eldrajs/ui/phone` knows about phone numbers, with no Vue in it. This file and
 * `./examples.ts` are the only places in the package that import `libphonenumber-js`, an optional
 * peer: the root entry and `./vee-validate` never reach them
 * (`src/__tests__/phoneIsolation.spec.ts`).
 *
 * The `min` metadata is the one imported. It accepts landlines and mobiles and rejects a number
 * whose prefix the country does not use; `mobile` would refuse every landline.
 */
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  Metadata,
  parseIncompletePhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';

/** A phone number taken apart. */
export interface PhoneParts {
  /** The whole number in E.164: `+3545812345`. */
  e164: string;
  /** ISO 3166-1 alpha-2, when the number says which country it is in. */
  country: string | undefined;
  /** The dialling code with no `+`: `354`. */
  callingCode: string;
  /** The digits after the dialling code. */
  nationalNumber: string;
  /** Spaced the way the country writes it: `581 2345`. */
  national: string;
  /** Whether a number like this exists in its country. */
  valid: boolean;
}

/** What a field holds after one edit. */
export interface PhoneInputState {
  /** The text the field shows. */
  text: string;
  country: string;
  /** `''` until the text holds a digit. */
  e164: string;
  nationalNumber: string;
  /** Typed characters dropped from the front of the text: a `+` and a dialling code. */
  stripped: number;
}

const supported = (country: string | undefined): country is CountryCode =>
  country !== undefined && isSupportedCountry(country);

let allCountries: readonly string[] | undefined;

/** Every country a number can be written for, as ISO 3166-1 alpha-2 codes. */
export function phoneCountries(): readonly string[] {
  allCountries ??= getCountries();
  return allCountries;
}

/** A country's dialling code with no `+` (`IS` → `354`), or `''` for a country it does not know. */
export function phoneCallingCode(country: string): string {
  return supported(country) ? getCountryCallingCode(country) : '';
}

let metadata: { getCountryCodesForCallingCode(code: string): string[] | undefined } | undefined;

/** The countries sharing a dialling code, the one the code belongs to first (`1` → `US`, …). */
export function countriesForCallingCode(code: string): readonly string[] {
  metadata ??= new Metadata() as unknown as NonNullable<typeof metadata>;
  return metadata.getCountryCodesForCallingCode(code) ?? [];
}

/**
 * Takes a number apart. `country` is where a number written without a dialling code is from.
 * `null` for text with no number in it.
 */
export function parsePhone(value: string, country?: string): PhoneParts | null {
  const parsed = parsePhoneNumberFromString(value, supported(country) ? country : undefined);
  if (parsed === undefined) return null;
  return {
    e164: parsed.number,
    country: parsed.country,
    callingCode: parsed.countryCallingCode,
    nationalNumber: parsed.nationalNumber,
    national: parsed.formatNational(),
    valid: parsed.isValid(),
  };
}

/**
 * Whether `value` is a number that exists. With a `country` it must also be that country's: a
 * Danish number is not valid for Iceland, however well formed.
 */
export function isValidPhone(value: string, country?: string): boolean {
  const parts = parsePhone(value, country);
  if (parts === null || !parts.valid) return false;
  return country === undefined || parts.country === country;
}

type Allowed = (country: string) => boolean;

/** The country a dialling code selects: see `typePhone`. */
function countryForCode(
  code: string,
  detected: string | undefined,
  current: string,
  allowed: Allowed
): string | undefined {
  if (detected !== undefined && allowed(detected)) return detected;
  const sharing = countriesForCallingCode(code).filter(allowed);
  return sharing.includes(current) ? current : sharing[0];
}

function national(
  digits: string,
  country: string,
  allowed: Allowed,
  stripped: number
): PhoneInputState {
  const code = supported(country) ? country : undefined;
  const typed = new AsYouType(code);
  let text = typed.input(digits);
  const number = typed.getNumber();
  const e164 = number?.number ?? '';
  // A dialling code can belong to several countries (`+1` to 25). Once the digits say which one
  // the number is in, the country follows them.
  const actual = e164 === '' ? undefined : parsePhoneNumberFromString(e164)?.country;
  let next = country;
  if (actual !== undefined && actual !== country && allowed(actual)) {
    next = actual;
    text = new AsYouType(actual).input(digits);
  }
  return { text, country: next, e164, nationalNumber: number?.nationalNumber ?? '', stripped };
}

/**
 * One edit of the field: `raw` is whatever the `<input>` now holds, `country` the one chosen.
 *
 * - The text is reduced to digits and re-spaced the way the country writes a number.
 * - Text that starts with `+` picks its own country. As soon as the dialling code is complete the
 *   `+` and the code leave the text (the country button shows them) and the rest is the national
 *   number. A code several countries share keeps the current country if it is one of them, and
 *   otherwise takes the country the code belongs to, until the digits identify another.
 * - `allowed` limits which countries the text may switch to. A dialling code of none of them stays
 *   in the text as typed.
 */
export function typePhone(
  raw: string,
  country: string,
  allowed: Allowed = () => true
): PhoneInputState {
  const chars = parseIncompletePhoneNumber(raw);
  if (!chars.startsWith('+')) return national(chars, country, allowed, 0);

  const typed = new AsYouType();
  const text = typed.input(chars);
  const code = typed.getCallingCode();
  if (code !== undefined) {
    const next = countryForCode(code, typed.getCountry(), country, allowed);
    if (next !== undefined)
      return national(chars.slice(1 + code.length), next, allowed, 1 + code.length);
  }
  const number = typed.getNumber();
  return {
    text,
    country,
    e164: number?.number ?? '',
    nationalNumber: number?.nationalNumber ?? '',
    stripped: 0,
  };
}

/**
 * The field's state for a value that arrives from outside (a bound `modelValue`, a saved address).
 * A complete number is spaced as the country writes it in full, national prefix included
 * (`07400 123456`), which is more than the as-you-type spacing knows for a number typed without it.
 */
export function readPhone(
  value: string,
  country: string,
  allowed: Allowed = () => true
): PhoneInputState {
  const state = typePhone(value, country, allowed);
  const parts = state.e164 === '' ? null : parsePhone(state.e164);
  if (parts !== null && parts.valid && parts.country === state.country) {
    return { ...state, text: parts.national };
  }
  return state;
}
