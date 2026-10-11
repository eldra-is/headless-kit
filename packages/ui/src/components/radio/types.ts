/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type RadioGroupPart =
  | 'root'
  | 'legend'
  | 'options'
  | 'option'
  | 'radio'
  | 'label'
  | 'hint'
  | 'meta'
  | 'error'
  | 'errorIcon';

/** The spec's two radio sizes: 1.125rem or 1.5rem. Plain layouts only — a card's radio is fixed. */
export type RadioGroupSize = 'md' | 'lg';

/** `vertical` (default), `row` (wraps, for short labels) or `cards` (the whole option is a card). */
export type RadioGroupLayout = 'vertical' | 'row' | 'cards';

/** One option of a radio group. For `cards`, `label` is the card title and `meta` is the price. */
export interface RadioGroupOption {
  /** The value posted, and the one the group's `modelValue` holds when this option is chosen. */
  value: string;
  /** The label text (plain rows), or the card title (cards). */
  label: string;
  /** A secondary line under the label. */
  hint?: string;
  /** Cards only: a price or note, end-aligned, tabular numerals ("Free", "$12.00"). */
  meta?: string;
  /** Native `disabled` for this option alone. Say why in `hint`. */
  disabled?: boolean;
}

export interface RadioGroupProps {
  /** The selected value (two-way). */
  modelValue?: string;
  /** The shared native `name`. Generated when absent, so every option still posts as one field. */
  name?: string;
  /** The question, rendered as the fieldset's `<legend>`. */
  legend: string;
  /** The options. At most about 6 — past that, use `Select`. */
  options: RadioGroupOption[];
  /** `vertical` (default), `row` (wraps) or `cards` (the whole option is a bordered card). */
  layout?: RadioGroupLayout;
  /** Radio 1.125rem (`md`, the default) or 1.5rem (`lg`). Plain layouts only. */
  size?: RadioGroupSize;
  /** Native `required` on every radio. */
  required?: boolean;
  /** The group's error message. Sets `aria-invalid="true"` on every radio, linked by id. */
  error?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<RadioGroupPart, string>>;
}
