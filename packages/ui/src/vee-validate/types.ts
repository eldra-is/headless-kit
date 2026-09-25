import type { FormMeta, FormOptions, RuleExpression } from 'vee-validate';
import type { CheckboxGroupProps, CheckboxProps } from '../components/checkbox/types';
import type { FormLayoutProps } from '../components/form-layout/types';
import type { InputProps } from '../components/input/types';
import type { NumberInputProps } from '../components/number-input/types';
import type { QuantityStepperProps } from '../components/quantity-stepper/types';
import type { RadioGroupProps } from '../components/radio/types';
import type { SearchBarProps } from '../components/search-bar/types';
import type { MultiSelectProps, SelectProps } from '../components/select/types';
import type { SwitchProps } from '../components/switch/types';
import type { TextareaProps } from '../components/textarea/types';
import type { VariantPickerProps } from '../components/variant-picker/types';

/**
 * What every `Field*` adds to the agnostic component it wraps.
 *
 * `rules` is vee-validate's own `RuleExpression`: a rule string (`'required|email'`), an object
 * (`{ required: true, min: 3 }`), a validator function, or a typed schema (yup, or zod through
 * `@vee-validate/zod`). A `Form` carrying a `validationSchema` needs none of it — the schema names
 * the fields itself — so `rules` is for the per-field case.
 */
export interface FieldBinding<TValue = unknown> {
  /**
   * The control's own `name` — and, unless `path` overrides it, the field's path in the form's
   * values.
   *
   * The two are the same thing for every control whose `name` is the native form field name. They
   * are **not** for `VariantPicker`, whose `name` is the visible option name ("Size", "Colour") as
   * well as the radios' shared native name: there, `name` stays the legend and `path` says where
   * the value lives.
   */
  name: string;
  /**
   * The field's path in the form's values, when it should not be `name` — the key `initialValues`,
   * `validationSchema`, `apiErrors` and the `errors` slot prop all use.
   */
  path?: string;
  /** Per-field rules. Leave it out when the `Form` carries a `validationSchema`. */
  rules?: RuleExpression<TValue>;
  /** The name a rule message uses for this field ("Email address"), not a visible label. */
  label?: string;
}

/**
 * Every `Field*` takes its component's own props, minus the ones it owns itself: `modelValue`
 * (vee-validate holds the value) and `invalid` / `error` (the field's own validation state). They
 * are `Omit`ted rather than ignored, so passing one is a compile error rather than a prop that
 * silently does nothing.
 */
export type FieldInputProps = Omit<InputProps, 'modelValue' | 'invalid'> & FieldBinding<string>;

export type FieldTextareaProps = Omit<TextareaProps, 'modelValue' | 'invalid'> &
  FieldBinding<string>;

/** `number | null`, not a string: a rule compares numbers and the form submits one. */
export type FieldNumberInputProps = Omit<NumberInputProps, 'modelValue' | 'invalid'> &
  FieldBinding<number | null>;

export type FieldCheckboxProps = Omit<CheckboxProps, 'modelValue' | 'invalid'> &
  FieldBinding<boolean>;

export type FieldCheckboxGroupProps = Omit<CheckboxGroupProps, 'modelValue' | 'error'> &
  FieldBinding<string[]>;

export type FieldRadioGroupProps = Omit<RadioGroupProps, 'modelValue' | 'error'> &
  FieldBinding<string>;

export type FieldSwitchProps = Omit<SwitchProps, 'modelValue'> & FieldBinding<boolean>;

export type FieldSelectProps = Omit<SelectProps, 'modelValue' | 'invalid'> & FieldBinding<string>;

export type FieldMultiSelectProps = Omit<MultiSelectProps, 'modelValue' | 'invalid'> &
  FieldBinding<string[]>;

export type FieldQuantityStepperProps = Omit<QuantityStepperProps, 'modelValue' | 'error'> &
  FieldBinding<number>;

export type FieldVariantPickerProps = Omit<VariantPickerProps, 'modelValue'> & FieldBinding<string>;

/**
 * `SearchBar`'s own `label` is the field's accessible name and `FieldBinding`'s is the name rule
 * messages use — the same string in practice, so the one prop serves both here: it is handed to
 * `useField` *and* forwarded to the control.
 */
export type FieldSearchBarProps = Omit<SearchBarProps, 'modelValue'> & FieldBinding<string>;

/** The values a `Form` holds, keyed by each field's `name`. */
export type FormValues = Record<string, unknown>;

/**
 * A form-level validation schema, exactly as `useForm` takes it: vee-validate's own rule map
 * (`{ email: 'required|email' }`) or a typed schema (yup, or zod through `@vee-validate/zod`).
 */
export type FormValidationSchema = FormOptions<FormValues>['validationSchema'];

/**
 * Everything `FormLayout` takes except `focusOnInvalid`: a `Form` owns where focus lands on a
 * failed submit (it has to, because on the first attempt nothing is marked invalid yet), so it
 * turns the layout's own focus move off rather than letting a caller ask for two of them.
 */
export interface FormProps extends Omit<FormLayoutProps, 'focusOnInvalid'> {
  /** The values the form starts with, keyed by each field's path (its `path`, else its `name`). */
  initialValues?: FormValues;
  /** A form-level schema. Fields then need no `rules` of their own. */
  validationSchema?: FormValidationSchema;
  /**
   * Field errors from the server, keyed by each field's path (its `path`, else its `name`). Applied
   * with `setErrors`, and each one is dropped again the moment its own field changes.
   */
  apiErrors?: Record<string, string>;
  /**
   * Announced in the form's polite live region once a submit has passed validation. It is never
   * visible: the visible confirmation — replacing the form, or navigating — stays the page's job.
   * `statusMessage` wins over it when both are set.
   */
  successMessage?: string;
}

/** What the default slot receives, so a `FieldWrapper` can show the message itself. */
export interface FormSlotProps {
  /**
   * The errors that should currently be **shown**, keyed by each field's path (its `path`, else its
   * `name`): a field's message appears here once that field has been touched, the form has been
   * submitted, or the server sent one — the same gate each `Field*` applies to its own `invalid`
   * state.
   */
  errors: Record<string, string>;
  /** The form's current values. */
  values: FormValues;
  /** vee-validate's form-level meta: `touched`, `dirty`, `valid`, `pending`. */
  meta: FormMeta<FormValues>;
  /** True between a valid submit and the end of the submit handler. */
  isSubmitting: boolean;
  /** How many times the form has been submitted. `0` before the first attempt. */
  submitCount: number;
}
