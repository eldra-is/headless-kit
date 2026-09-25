/** The parts a consumer can restyle through `classes`, named as the task brief's contract names
 * them (spec "Quantity stepper" → Anatomy draws the same four controls plus the error row every
 * other field in this package shows the same way). */
export type QuantityStepperPart = 'root' | 'decrease' | 'input' | 'increase' | 'error';

/** The spec's two sizes (spec "Quantity stepper" → Sizes): the default and the cart-line/filter
 * compact one. */
export type QuantityStepperSize = 'md' | 'sm';

export interface QuantityStepperProps {
  /** The quantity (two-way). Defaults to `min` when unset, never 0 on a cart line. */
  modelValue?: number;
  /** Lowest value. Spec default `1` — "Never 0 on a cart line." */
  min?: number;
  /** Stock or a per-order limit. Spec default `99`. */
  max?: number;
  /** Buttons 2.5 × 2.5rem / input 2.75rem (`md`, the default) or 2 × 2rem / 2.25rem (`sm`). */
  size?: QuantityStepperSize;
  /** Appended to the button names in lists, e.g. "Increase quantity, Stoneware mug". */
  itemName?: string;
  /** Native form field name, carried by the input. */
  name?: string;
  /** Sold out: the whole stepper is disabled. */
  disabled?: boolean;
  /** A server rejection message shown below the group, with the new max. */
  error?: string;
  /** The control's id. Comes from the `FieldWrapper` when there is one; this wins over it. */
  id?: string;
  /**
   * The BCP 47 locale for display formatting and for parsing a typed value (`parseLocaleNumber`) —
   * not part of the design spec's own Properties table, which the task brief adds. Defaults to
   * whatever `provideEldraUiLocale` set for the app, and to `"en-US"` with nothing provided.
   */
  locale?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<QuantityStepperPart, string>>;
}
