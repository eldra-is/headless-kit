/** The parts a consumer can restyle through `classes`, named as the spec's anatomy names them. */
export type TextareaPart = 'root' | 'control' | 'foot' | 'counter';

export interface TextareaProps {
  /** The text (two-way). */
  modelValue?: string;
  /** An example of a good answer. Format hints belong in the field's help text. */
  placeholder?: string;
  /** The character limit shown by the counter. With no `counter`, this alone shows nothing. */
  maxLength?: number;
  /** Shows "n / maxLength" in the foot row. */
  counter?: boolean;
  /** Also sets the native `maxlength`, so typing stops at the limit. */
  hardLimit?: boolean;
  /** Size to the expected answer, in rem. Defaults to `5rem` (about 3 lines). */
  minHeight?: string;
  /** Sets `aria-invalid="true"`. Comes from the `FieldWrapper` otherwise. */
  invalid?: boolean;
  /** Native `required`. Comes from the `FieldWrapper` otherwise. */
  required?: boolean;
  /** Native `readonly`. The value stays focusable and selectable. */
  readonly?: boolean;
  /** Native `disabled`. */
  disabled?: boolean;
  /** The control's id. Comes from the `FieldWrapper` when there is one; this wins over it. */
  id?: string;
  /** The form field name. */
  name?: string;
  /** `aria-describedby` ids, error id first. Comes from the `FieldWrapper` otherwise. */
  describedBy?: string;
  /** Per-part class overrides, merged with `tailwind-merge`. */
  classes?: Partial<Record<TextareaPart, string>>;
}
