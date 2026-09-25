// The optional vee-validate entry (`@eldrajs/ui/vee-validate`): `Form` and the twelve `Field*`
// components.
//
// This directory is the **only** place in the package that may import `vee-validate`. The root
// entry stays validation-agnostic — a `FieldWrapper` takes an `error` string and an `Input` takes
// `invalid`, from wherever the consumer's own validation comes from — so a store using zod, its
// framework's own form state, or no client-side validation at all never pays for a library it does
// not use. `src/__tests__/veeValidateIsolation.spec.ts` is what keeps that true: it imports the root
// entry with `vee-validate` mocked to throw, and reads the built `dist/index.js` for any mention
// of it.
//
// `vee-validate` is an optional peer (`^4.12`); installing it is what turns this entry on.

export { default as Form } from './Form.vue';

export { default as FieldCheckbox } from './FieldCheckbox.vue';
export { default as FieldCheckboxGroup } from './FieldCheckboxGroup.vue';
export { default as FieldInput } from './FieldInput.vue';
export { default as FieldMultiSelect } from './FieldMultiSelect.vue';
export { default as FieldNumberInput } from './FieldNumberInput.vue';
export { default as FieldQuantityStepper } from './FieldQuantityStepper.vue';
export { default as FieldRadioGroup } from './FieldRadioGroup.vue';
export { default as FieldSearchBar } from './FieldSearchBar.vue';
export { default as FieldSelect } from './FieldSelect.vue';
export { default as FieldSwitch } from './FieldSwitch.vue';
export { default as FieldTextarea } from './FieldTextarea.vue';
export { default as FieldVariantPicker } from './FieldVariantPicker.vue';

export { API_ERRORS_KEY } from './context';

export type {
  FieldBinding,
  FieldCheckboxGroupProps,
  FieldCheckboxProps,
  FieldInputProps,
  FieldMultiSelectProps,
  FieldNumberInputProps,
  FieldQuantityStepperProps,
  FieldRadioGroupProps,
  FieldSearchBarProps,
  FieldSelectProps,
  FieldSwitchProps,
  FieldTextareaProps,
  FieldVariantPickerProps,
  FormProps,
  FormSlotProps,
  FormValidationSchema,
  FormValues,
} from './types';

/**
 * The building block the eleven `Field*` components are made of, exported so a consumer wrapping a
 * control this package does not ship — or one of its own — binds it the same way: the value, the
 * message gated on "touched or submitted", the `id` the error summary links to, and the server
 * error that clears when the value changes.
 *
 * `FIELD_ONLY` comes with it: the prop names a `Field*` keeps for itself and must **not** forward
 * to the control it wraps (`path`, `rules`, `label`, `id`). Without it a consumer writing their own
 * wrapper has to rediscover the list by reading this package's source.
 */
export {
  FIELD_ONLY,
  useFieldControl,
  type UseFieldControlOptions,
  type UseFieldControlReturn,
} from './useFieldControl';
