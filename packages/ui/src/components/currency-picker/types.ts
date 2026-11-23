import type { SelectPart } from '../select/types';

export type CurrencyPickerPart = 'root' | SelectPart;

export interface CurrencyPickerProps {
  /** ISO 4217 codes to offer, the store's own first. With fewer than two the picker renders nothing. */
  currencies: readonly string[];
  /** The chosen code (`v-model`). */
  modelValue?: string;
  /** Defaults to the `currencyPickerLabel` message ("Currency"). */
  label?: string;
  /** Shows the label; hidden by default, where the picker sits in a header. */
  showLabel?: boolean;
  /** `Select`'s own `size`. Defaults to `sm`. */
  size?: 'sm' | 'md' | 'lg';
  /** `Select`'s own `placement`. */
  placement?: 'auto' | 'above';
  /** A change is on its way (the cart is moving): the picker says so and still takes a newer choice. */
  busy?: boolean;
  /** The language the currency names are written in. Defaults to `useEldraUiLocale()`. */
  locale?: string;
  classes?: Partial<Record<CurrencyPickerPart, string>>;
}
