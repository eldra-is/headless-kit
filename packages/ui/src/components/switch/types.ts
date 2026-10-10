/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type SwitchPart = 'root' | 'track' | 'thumb' | 'label' | 'description';

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
  /** The control's id. Comes from the `FieldWrapper` when there is one; this wins over it. */
  id?: string;
  /** Native form field name, carried by the hidden mirror `<input type="checkbox">`. */
  name?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<SwitchPart, string>>;
}
