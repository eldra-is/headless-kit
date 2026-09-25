import type { IconComponent } from '../icon/types';

/** The native input types the design spec's Input supports. */
export type InputType = 'text' | 'email' | 'tel' | 'number' | 'search' | 'url' | 'password';

/** The spec's three compact-control heights: 2rem, 2.5rem and 3rem. */
export type InputSize = 'sm' | 'md' | 'lg';

/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type InputPart = 'root' | 'leadingIcon' | 'control' | 'clearButton' | 'suffix';

export interface InputProps {
  /**
   * The value (two-way). With `mask` set this is the **raw** value — the digits and letters the
   * customer typed, without the separators — and the field shows the formatted one.
   */
  modelValue?: string;
  /** Native type. Defaults to `text`. */
  type?: InputType;
  /** One of the spec's three sizes. Defaults to `md`. */
  size?: InputSize;
  /** The control's id. Comes from the `FieldWrapper` when there is one; this wins over it. */
  id?: string;
  /** The form field name. */
  name?: string;
  /** An example only, never the label. Format hints belong in the field's help text. */
  placeholder?: string;
  /** Always set it for personal data: `name`, `email`, `address-line1`, `postal-code`… */
  autocomplete?: string;
  /** For example `numeric`. A `number` field defaults to `numeric`. */
  inputmode?: string;
  /** For `type="number"`. */
  min?: number;
  /** For `type="number"`. */
  max?: number;
  /** For `type="number"`. */
  step?: number;
  /** A decorative icon at the start of the field (`search`, `mail`, `discount`). */
  leadingIcon?: IconComponent;
  /** Shows the clear button while there is a value. Defaults to `true` for `type="search"`. */
  clearable?: boolean;
  /** Sets `aria-invalid="true"` and the error boundary. Comes from the `FieldWrapper` otherwise. */
  invalid?: boolean;
  /** `aria-describedby` ids, error id first. Comes from the `FieldWrapper` otherwise. */
  describedBy?: string;
  /** Native `required`. Comes from the `FieldWrapper` otherwise. */
  required?: boolean;
  /** Native `readonly`. The value stays focusable and selectable. */
  readonly?: boolean;
  /** Native `disabled`. */
  disabled?: boolean;
  /**
   * A format mask, e.g. `(###) ###-####` or `A#A #A#`: `#` a digit, `A` a letter, `*` either,
   * everything else a separator. The field displays the formatted value; `modelValue` stays raw.
   */
  mask?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<InputPart, string>>;
}
