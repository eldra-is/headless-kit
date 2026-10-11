/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type CheckboxPart = 'root' | 'box' | 'check' | 'label' | 'hint';

/** The spec's two box sizes: 1.125rem and 1.5rem. */
export type CheckboxSize = 'md' | 'lg';

export interface CheckboxProps {
  /** Checked state (two-way). */
  modelValue?: boolean;
  /**
   * Shows the dash and exposes "mixed". For a parent whose children are only partly checked; the
   * caller owns what activating it does to those children and recomputes this from them after
   * every change.
   */
  indeterminate?: boolean;
  /** Native form value, posted when the box is checked. */
  value?: string;
  /** Native form field name. In a group, every option shares one. */
  name?: string;
  /** Box 1.125rem (`md`, the default) or 1.5rem (`lg`). */
  size?: CheckboxSize;
  /** A secondary line under the label, inside the label. */
  hint?: string;
  /** Sets `aria-invalid="true"` and the 2px `danger` boundary. From the `FieldWrapper` otherwise. */
  invalid?: boolean;
  /** Native `required`. Comes from the `FieldWrapper` otherwise. */
  required?: boolean;
  /** Native `disabled`. */
  disabled?: boolean;
  /**
   * For an indeterminate parent: the ids of the children it controls (`aria-controls`).
   */
  controls?: string;
  /** The control's id. Comes from the `FieldWrapper` when there is one; this wins over it. */
  id?: string;
  /**
   * `aria-describedby` ids — the error a required consent box points at (spec's Accessibility
   * notes). Comes from the `FieldWrapper` otherwise.
   */
  describedBy?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<CheckboxPart, string>>;
}

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type CheckboxGroupPart = 'root' | 'legend' | 'options' | 'error' | 'errorIcon';

/** Vertical is the default; a row is for short labels (sizes) and wraps. */
export type CheckboxGroupLayout = 'vertical' | 'row';

/** One option of a checkbox group. */
export interface CheckboxGroupOption {
  /** The value posted, and the one that appears in the group's array. */
  value: string;
  /** The label text. */
  label: string;
  /** A secondary line under the label. */
  hint?: string;
  /** Native `disabled` for this option alone. */
  disabled?: boolean;
}

export interface CheckboxGroupProps {
  /**
   * The checked values (two-way). Defaults to an empty array.
   *
   * The order is **check order**, not option order: a value is appended when its box is ticked and
   * filtered out when it is cleared, so the array reads as the sequence the customer chose in. Sort
   * it against `options` if a stable order matters to what you do with it.
   */
  modelValue?: string[];
  /** The group question ("Material"), rendered as the fieldset's `<legend>`. */
  legend: string;
  /** The options. */
  options: CheckboxGroupOption[];
  /** `vertical` (default) or `row`, which wraps. */
  layout?: CheckboxGroupLayout;
  /** The group's error message, linked to the fieldset by `aria-describedby`. */
  error?: string;
  /** The native form field name every option shares. */
  name?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<CheckboxGroupPart, string>>;
}
