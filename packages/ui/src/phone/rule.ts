import { displayNames } from '@eldrajs/sdk/format/display-names';
import { toValue, type MaybeRefOrGetter } from 'vue';
import { DEFAULT_UI_LOCALE } from '../composables/useLocale';
import type { UiMessages } from '../composables/useMessages';
import { enUS } from '../messages/en-US';
import { isValidPhone, parsePhone } from './phone';

export interface PhoneRuleOptions {
  /**
   * The country the number has to belong to, as an ISO 3166-1 alpha-2 code. Left out, any
   * country's number passes, and the message names the country the number's dialling code says.
   */
  country?: MaybeRefOrGetter<string | undefined>;
  /** The locale the country is named in. Default `en-US`. */
  locale?: MaybeRefOrGetter<string | undefined>;
  /** `phoneInvalid` and `phoneInvalidNumber`, when not the English defaults. */
  messages?: MaybeRefOrGetter<
    Partial<Pick<UiMessages, 'phoneInvalid' | 'phoneInvalidNumber'>> | undefined
  >;
}

/** A country's name in `locale` (`IS`, `is-IS` → `Ísland`); the code itself when it has none. */
export function phoneCountryName(country: string, locale: string): string {
  try {
    return displayNames(locale, { type: 'region' }).of(country) ?? country;
  } catch {
    return country;
  }
}

/**
 * A validation rule for a `PhoneInput`'s value: `true`, or the message to show.
 *
 * An empty value passes: whether the field is required is another rule's question. The shape is
 * vee-validate's rule function, and nothing here imports vee-validate, so it serves any form code.
 */
export function phoneRule(options: PhoneRuleOptions = {}): (value: unknown) => true | string {
  return (value) => {
    if (value === undefined || value === null || value === '') return true;
    const text = String(value);
    const country = toValue(options.country);
    if (isValidPhone(text, country)) return true;
    const messages = { ...enUS, ...toValue(options.messages) };
    const named = country ?? parsePhone(text)?.country;
    if (named === undefined) return messages.phoneInvalidNumber;
    return messages.phoneInvalid(
      phoneCountryName(named, toValue(options.locale) ?? DEFAULT_UI_LOCALE)
    );
  };
}
