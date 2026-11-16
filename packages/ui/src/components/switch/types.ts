/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type SwitchPart =
  | 'track'
  | 'thumb'
  | 'label'
  | 'description'
  | 'trackStart'
  | 'trackEnd'
  | 'requiredMark'
  | 'error'
  | 'errorIcon';

/** What the `thumb`, `trackStart` and `trackEnd` slots are handed. Their content is decorative
 *  (`aria-hidden`): the switch's name and `aria-checked` carry the meaning. */
export interface SwitchSlotProps {
  /** On or off. */
  checked: boolean;
  /** Whether the switch is disabled. */
  disabled: boolean;
}

/** The spec's two sizes: the default and the filter-bar/dense-list compact one. */
export type SwitchSize = 'md' | 'sm';

export interface SwitchProps {
  /** On/off (two-way). Reflected as `aria-checked`. */
  modelValue?: boolean;
  /** Track 2.75 × 1.5rem (`md`, the default) or 2.25 × 1.25rem (`sm`, filter bars). */
  size?: SwitchSize;
  /** A second line under the label, linked with `aria-describedby` rather than in the name. */
  description?: string;
  /** Native `disabled`. */
  disabled?: boolean;
  /**
   * Shows `FieldWrapper`'s `*` after the label text, with the visually hidden "Required" message
   * (a switch has no native `required` to announce it). Default `false`.
   */
  requiredMark?: boolean;
  /**
   * An error message drawn under the switch in `FieldWrapper`'s error row, linked first in
   * `aria-describedby`, and `aria-invalid="true"` on the switch. The row is a sibling after it.
   */
  error?: string;
  /**
   * `aria-invalid="true"` on the switch without an error row, for a caller that shows its own
   * message, like `RadioGroup`'s `invalid`. The Switch design draws no danger state on the track,
   * so `error` and `invalid` change nothing visual on the control. Default `false`.
   */
  invalid?: boolean;
  /** The control's id. Comes from the `FieldWrapper` when there is one; this wins over it. */
  id?: string;
  /** Native form field name, carried by the hidden mirror `<input type="checkbox">`. */
  name?: string;
  /**
   * Per-part classes, appended to the part's own (a consumer class wins by cascade layer). The
   * root (the `<button>`) is styled with `class`.
   */
  classes?: Partial<Record<SwitchPart, string>>;
}
