/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type FieldWrapperPart =
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
  /**
   * The limit the value is counted against. Without one the counter shows the length alone
   * ("12"), for a field that reports how much has been written but sets no limit.
   */
  max?: number;
  /** The current length. Defaults to `0`, so an empty field reads "0 / 200". */
  value?: number;
}

export interface FieldWrapperProps {
  /**
   * The visible label, written as a noun ("Postcode"). Leave it out (and fill no `label` slot) for
   * a field with no visible label: no `<label>` (or `<legend>`) renders, so name the control
   * itself with `aria-label` (a group: the wrapper, whose attributes reach the `<fieldset>`). The
   * required and optional marks live in the label, so they go with it.
   */
  label?: string;
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
  /**
   * Per-part classes, appended to the part's own (they win by cascade layer). Style the root with
   * `class`.
   */
  classes?: Partial<Record<FieldWrapperPart, string>>;
}
