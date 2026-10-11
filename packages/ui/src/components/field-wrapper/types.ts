/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type FieldWrapperPart =
  | 'root'
  | 'label'
  | 'legend'
  | 'requiredMark'
  | 'optionalText'
  | 'help'
  | 'control'
  | 'error'
  | 'errorIcon'
  | 'foot'
  | 'counter';

/** The character counter shown at the end of the foot row. */
export interface FieldWrapperCounter {
  /** The limit the value is counted against. */
  max: number;
  /** The current length. Defaults to `0`, so an empty field reads "0 / 200". */
  value?: number;
}

export interface FieldWrapperProps {
  /** The visible label, written as a noun ("Postcode"). */
  label: string;
  /** The control's id. Generated when it is not given, and handed to the control either way. */
  id?: string;
  /** Shows `*` and sets native `required` on the control. */
  required?: boolean;
  /** Shows "(optional)". Mark only the minority of fields per form. */
  optional?: boolean;
  /** A short instruction ("Like BS1 4XE"), linked to the control by `aria-describedby`. */
  help?: string;
  /**
   * The error message. When set the error is shown with its icon, the control reads
   * `aria-invalid="true"`, and the error's id comes first in `aria-describedby`.
   */
  error?: string;
  /** Shows the "n / max" counter in the foot row. */
  counter?: FieldWrapperCounter;
  /**
   * Renders a `<fieldset>` with the label as its `<legend>`, for a set of checkboxes or radios
   * that share one question. There is no single control to tie a `<label for>` to, so the help and
   * error are linked to the fieldset itself.
   */
  group?: boolean;
  /** Spans both columns of a two-column `FormLayout`. */
  full?: boolean;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<FieldWrapperPart, string>>;
}
