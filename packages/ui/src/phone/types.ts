import type { UiMessages } from '../composables/useMessages';

/**
 * `Input`'s sizes, written out: an alias of `InputSize` reaches the built declarations as a
 * directory import (`import('..')`), which Node16 resolution refuses.
 */
export type PhoneInputSize = 'sm' | 'md' | 'lg';

/**
 * The parts a consumer can restyle through `classes`. The first six are the field; the rest are
 * the country list, which is the panel a `Select` opens, under the same names.
 */
export type PhoneInputPart =
  | 'field'
  | 'countryButton'
  | 'flag'
  | 'callingCode'
  | 'chevron'
  | 'control'
  | 'panel'
  | 'search'
  | 'listbox'
  | 'group'
  | 'groupLabel'
  | 'option'
  | 'optionLabel'
  | 'optionMeta'
  | 'optionCheck'
  | 'empty';

/** What `change` carries: the number as it stands after an edit or a change of country. */
export interface PhoneInputChange {
  /** The whole number in E.164, `''` while the field holds no digit. */
  e164: string;
  /** The chosen country, ISO 3166-1 alpha-2. */
  country: string;
  /** Its dialling code with no `+`. */
  callingCode: string;
  /** The digits after the dialling code. */
  nationalNumber: string;
  /** Whether this is a number the chosen country has. */
  valid: boolean;
}

export interface PhoneInputProps {
  /**
   * The whole number in E.164 (`+3545812345`), `''` while the field holds no digit. While the
   * number is still being typed it is the dialling code and the digits so far, so a validation
   * rule can judge it at any moment.
   */
  modelValue?: string;
  /** The chosen country, ISO 3166-1 alpha-2. Bind with `v-model:country` to follow it. */
  country?: string;
  /**
   * The country the field starts on when `country` is not bound and the value does not say:
   * the shop's own. Without it, the first of `preferredCountries`, then of `countries`, then `US`.
   */
  defaultCountry?: string;
  /** Countries listed first, under "Suggested", in this order. */
  preferredCountries?: string[];
  /** The only countries offered. Default: every country a number can be written for. */
  countries?: string[];
  /** The locale countries are named and sorted in. Default: `provideEldraUiLocale`'s. */
  locale?: string;
  size?: PhoneInputSize;
  /** The number field's id, which a `<label for>` points at. Default: the field wrapper's. */
  id?: string;
  /** Posts the E.164 value under this name, through a hidden input. */
  name?: string;
  /** Default: a number the chosen country could have. `false` for none. */
  placeholder?: string | false;
  /** Default `tel-national`. */
  autocomplete?: string;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
  readonly?: boolean;
  disabled?: boolean;
  /** Message overrides for this control alone. */
  messages?: Partial<UiMessages>;
  /** Per-part classes, appended to the part's own. Style the root with `class`. */
  classes?: Partial<Record<PhoneInputPart, string>>;
}
