import type { IconComponent } from '../icon/types';
import type { InputSize } from '../input/types';

/**
 * What the field formats: a plain decimal, a currency amount, or a physical unit. All three are
 * `Intl.NumberFormat` styles, so the symbol, its position and the grouping are the locale's rather
 * than something this component draws.
 */
export type NumberInputFormat = 'decimal' | 'currency' | 'unit';

/** The parts a consumer can restyle through `classes`. `Input`'s, plus a start-edge `prefix`. */
export type NumberInputPart =
  | 'root'
  | 'leadingIcon'
  | 'control'
  | 'prefix'
  | 'suffix'
  | 'clearButton';

export interface NumberInputProps {
  /**
   * The value (two-way), as a **number** — never the string in the field. `null` is an empty
   * field, and it is also what an unparseable entry commits to (see the component's own docs).
   */
  modelValue?: number | null;
  /** `decimal` (the default), `currency` or `unit`. */
  format?: NumberInputFormat;
  /** A BCP 47 tag. Defaults to `en-US`; a storefront passes its own content locale. */
  locale?: string;
  /** ISO 4217, e.g. `USD`, `ISK`. Required when `format` is `currency`. */
  currency?: string;
  /** How the currency is shown. Defaults to `symbol`. */
  currencyDisplay?: 'symbol' | 'narrowSymbol' | 'code' | 'name';
  /** An `Intl` unit identifier, e.g. `kilogram`, `centimeter`. Required when `format` is `unit`. */
  unit?: string;
  /** How the unit is shown. Defaults to `short`. */
  unitDisplay?: 'short' | 'narrow' | 'long';
  /** The lowest value a commit may produce. Also what allows a typed `-`. */
  min?: number;
  /** The highest value a commit may produce. */
  max?: number;
  /**
   * What `ArrowUp`/`ArrowDown` add and subtract (`Shift` multiplies it by ten). Defaults to `1`,
   * and for a currency to one minor unit of that currency (`0.01` for `USD`, `1` for `ISK`).
   */
  step?: number;
  /**
   * The most fraction digits a committed value keeps. Defaults to the currency's own digits for a
   * currency (`0` for `ISK`, `2` for `USD`), and to `2` otherwise.
   */
  precision?: number;
  /** One of the spec's three field sizes. Defaults to `md`. */
  size?: InputSize;
  /** The control's id. Comes from the `FieldWrapper` when there is one; this wins over it. */
  id?: string;
  /**
   * The form field name. It is posted by a hidden input carrying the **raw** number, so a form
   * receives `1234.5` and never the locale string the customer read.
   */
  name?: string;
  /** An example only, never the label. */
  placeholder?: string;
  /** A decorative icon at the start of the field. */
  leadingIcon?: IconComponent;
  /** Shows the clear button while there is a value. */
  clearable?: boolean;
  /** Sets `aria-invalid="true"` and the error boundary. Comes from the `FieldWrapper` otherwise. */
  invalid?: boolean;
  /** `aria-describedby` ids, own ids first. Composed with the `FieldWrapper`'s. */
  describedBy?: string;
  /** Native `required`. Comes from the `FieldWrapper` otherwise. */
  required?: boolean;
  /** Native `readonly`. The value stays focusable and selectable. */
  readonly?: boolean;
  /** Native `disabled`. */
  disabled?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<NumberInputPart, string>>;
}
