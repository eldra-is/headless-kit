import type { ComputedRef, InjectionKey } from 'vue';

/**
 * What a field wrapper tells the control inside it.
 *
 * The design spec's Input, Textarea, Select and the rest all sit in a **Field wrapper**, which
 * owns the visible label, the help text and the error message — so it is the wrapper, not the
 * control, that knows the control's `id`, which ids describe it (error first), whether it is
 * currently in error and whether it is required. Providing that here is what lets a bare
 * `<Input />` inside a `<FieldWrapper>` need no wiring at all.
 *
 * Every consumer injects it optionally (`inject(FIELD_KEY, null)`) and lets its own props win, so
 * a control outside a wrapper behaves exactly as its props say.
 */
export interface FieldContext {
  /** The control's `id`, which the wrapper's `<label for>` points at. */
  id: string;
  /** The `aria-describedby` value: the error id first, then help. */
  describedBy?: string;
  /** Whether the field is in error, which the control mirrors as `aria-invalid="true"`. */
  invalid: boolean;
  /** Whether the field must be filled in, which the control mirrors as native `required`. */
  required: boolean;
  /**
   * Whether the wrapper renders a `<label for>` that already names the control with this `id`.
   *
   * True for an ordinary field, false for a `group` (a `<fieldset>` is named by its `<legend>`,
   * which labels nothing in particular). A control that draws a `<label>` of **its own** — a
   * `Checkbox` wraps its box and text in one — reads this and drops that label rather than giving
   * one control two, and a control that would otherwise take `id` from here leaves it alone when
   * this is false, because a group's `id` is the fieldset's own.
   */
  labelsControl: boolean;
}

/** The key a `FieldWrapper` provides its `FieldContext` on. */
export const FIELD_KEY: InjectionKey<ComputedRef<FieldContext>> = Symbol('eldra-ui:field');
