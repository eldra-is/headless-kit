import { FormContextKey, useField } from 'vee-validate';
import {
  computed,
  inject,
  onMounted,
  onScopeDispose,
  shallowRef,
  watch,
  type ComputedRef,
  type MaybeRef,
  type WritableComputedRef,
} from 'vue';
import { FIELD_KEY } from '../components/field-wrapper/context';
import { useUiId } from '../utils/id';
import { API_ERRORS_KEY, FIELD_ANCHORS_KEY, FIELD_MESSAGES_KEY } from './context';
import type { FieldBinding } from './types';

/** The props every `Field*` passes in: its `FieldBinding`, plus the control's own `id` if it has one. */
type FieldControlProps<TValue> = FieldBinding<TValue> & { id?: string };

/** The three props that decide when a field validates. Never forwarded to the wrapped control. */
export const FIELD_VALIDATION_PROPS = [
  'validateOnMount',
  'validateOnBlur',
  'validateOnValueUpdate',
] as const;

/**
 * Their defaults for a **typed** control — `FieldInput`, `FieldTextarea`, `FieldCurrencyInput`,
 * `FieldUnitInput`, `FieldSearchBar` — handed to `withDefaults(defineProps<…>(), …)`. A value
 * there is built up one keystroke at a time, so validating each change would judge a half-typed
 * value; the field validates when it is left instead.
 *
 * They have to be real defaults: Vue casts an absent boolean prop to `false`, never `undefined`,
 * so without one `validateOnBlur` could not default to `true`.
 */
export const FIELD_VALIDATION_DEFAULTS = {
  validateOnMount: false,
  validateOnBlur: true,
  validateOnValueUpdate: false,
} as const;

/**
 * Their defaults for a **choice** control — `FieldCheckbox`, `FieldCheckboxGroup`,
 * `FieldRadioGroup`, `FieldSwitch`, `FieldSelect`, `FieldMultiSelect`, `FieldVariantPicker`,
 * `FieldQuantityStepper`. One click or selection is the whole value there — there is no typing in
 * between, and often no blur afterwards — so a box that only validated on blur would go on saying
 * "required" after it had been ticked. These validate on each change as well as on blur.
 *
 * `FieldQuantityStepper` belongs here although it has a text field: a `QuantityStepper` writes its
 * value only when a typed number is committed (on blur or `Enter`) or a button is pressed, never
 * per keystroke, so every change it reports is a complete quantity.
 */
export const FIELD_CHOICE_VALIDATION_DEFAULTS = {
  validateOnMount: false,
  validateOnBlur: true,
  validateOnValueUpdate: true,
} as const;

/** The props a `Field*` keeps for itself and never forwards to the component it wraps. */
export const FIELD_ONLY = ['path', 'rules', 'label', 'id', ...FIELD_VALIDATION_PROPS] as const;

export interface UseFieldControlOptions<TValue> {
  /**
   * What the control is bound to while the field itself holds `undefined` — `''`, `false`, or a
   * **module-level** empty array. It must be a stable value: a fresh `[]` per read would hand the
   * control a new prop identity on every render. Left out, the control is handed `undefined` and
   * falls back to whatever default it documents for an unbound `modelValue`.
   */
  empty?: TValue;
  /**
   * The field's own starting value, for a control that picks one itself (a `VariantPicker` starts
   * on the first available option). A `Form`'s `initialValues` still wins over it.
   */
  initialValue?: MaybeRef<TValue>;
  /** Whether the wrapped component takes an `id` prop. `false` for the three fieldset controls. */
  hasIdProp?: boolean;
}

export interface UseFieldControlReturn<TValue> {
  /** The field's value, bound to the control with `v-model`. */
  model: WritableComputedRef<TValue>;
  /** The message to show, or `undefined` while the field has not earned one yet. */
  error: ComputedRef<string | undefined>;
  /** Whether the control should read `aria-invalid="true"`. */
  invalid: ComputedRef<boolean>;
  /**
   * The same message, but only when there is **no** `FieldWrapper` above: inside one, the wrapper
   * draws the error row and a control drawing a second one would say it twice.
   */
  ownError: ComputedRef<string | undefined>;
  /** The `id` to forward to the control, or `undefined` to leave the control's own wiring alone. */
  id: ComputedRef<string | undefined>;
  /** Marks the field touched and, unless `validateOnBlur` is `false`, validates it. */
  onBlur: (event?: Event) => void;
}

/**
 * The whole of what a `Field*` does, minus the one component it renders.
 *
 * Each `Field*` is a thin SFC over this: `useField(name, rules, { label })` for the value and the
 * validation, the message the field **shows**, the `id` the form's error summary links to, and the
 * server error that stops being true as soon as the value changes. Keeping it here is what makes
 * the thirteen components agree on all of that rather than thirteen files drifting apart.
 *
 * **When a field validates, and when its message changes.** The spec's rule (Form layout →
 * Behaviour & motion) is "Validate on submit, then on blur for fields that were invalid after the
 * first submit"; three props per field say which moments apply, and the message on screen changes
 * at those moments and at no other:
 *
 * - **submit**, always: the form validates every field, and each one then shows its result;
 * - **blur**, unless `validateOnBlur` is `false` (default `true`): the field is validated and
 *   shows its result. A blur always marks the field touched;
 * - **a value change**, only with `validateOnValueUpdate`: the message follows every change once
 *   the field has been touched or the form submitted. Default `false` for a typed control, `true`
 *   for a choice control (see the two defaults objects above);
 * - **mount**, only with `validateOnMount` (default `false`): validated and shown at once.
 *
 * So in a typed control, typing changes nothing the customer sees: no message appears, and one
 * already showing stays until the next blur or submit. A choice control answers a click at once.
 *
 * **Why the shown message is held here** rather than read from vee-validate's `errorMessage`. That
 * value can move at moments that are not this field's: with a `validationSchema` on the form,
 * validating one field revalidates every field already validated (`validated-only`), so another
 * field's blur would otherwise clear or change this field's message while it is being typed in.
 * `shown` is a copy taken only at the moments listed above, which is what makes the props true in
 * both setups, per-field `rules` and a form-level schema alike.
 */
export function useFieldControl<TValue>(
  props: FieldControlProps<TValue>,
  options: UseFieldControlOptions<TValue>
): UseFieldControlReturn<TValue> {
  /**
   * Where the value lives. `name` for every control whose `name` is the native form field name;
   * `path` for the one whose is not — a `VariantPicker`'s `name` is the visible option name, so it
   * would otherwise be both the legend and the key in `values`, and one of the two would be wrong.
   */
  const path = computed(() => props.path ?? props.name);

  const rules = computed(() => props.rules);
  /**
   * `validateOnValueUpdate` is vee-validate's own option and is read once, here. `validateOnMount`
   * is not handed over: the mount-time validation is run below instead, so its result can be shown
   * when it settles (vee-validate's own run reports to nobody).
   */
  const { value, errorMessage, handleBlur, meta, validate } = useField<TValue>(path, rules, {
    label: () => props.label,
    initialValue: options.initialValue,
    validateOnValueUpdate: props.validateOnValueUpdate === true,
  });

  const model = computed<TValue>({
    get: () => (value.value ?? options.empty) as TValue,
    set: (next) => {
      value.value = next;
    },
  });

  /**
   * The form above, for `submitCount`. Injected rather than taken from `useFormContext()` so a
   * `Field*` used on its own — a single validated search box, say — works with no form at all.
   */
  const form = inject(FormContextKey, null);
  const submitted = computed(() => (form?.submitCount.value ?? 0) > 0);

  const apiErrors = inject(API_ERRORS_KEY, null);
  const hasApiError = computed(
    () => apiErrors !== null && apiErrors.value[path.value] !== undefined
  );

  /** The message on screen. See the doc comment above for the only moments it changes. */
  const shown = shallowRef<string | undefined>(undefined);

  const messages = inject(FIELD_MESSAGES_KEY, null);

  function show(message: string | undefined): void {
    shown.value = message;
    messages?.report(path.value, message);
  }

  /** Take the field's current validation result as the message to show. */
  function reveal(): void {
    show(errorMessage.value);
  }

  /** Whether a live (`validateOnValueUpdate`) field has earned a message yet. */
  const earned = computed(() => meta.touched || submitted.value);

  watch([errorMessage, earned, hasApiError], ([message, isEarned, isApi], [, , wasApi]) => {
    /**
     * A server error is never held back: it is the answer to a submit the customer has already
     * made, so there is nothing left to wait for — which also covers a form rendered with errors
     * from a round trip that happened before this page existed.
     */
    if (isApi) {
      show(message);
      return;
    }
    /** The server error went (the field was edited, or a new response left it out). */
    if (wasApi) {
      show(props.validateOnValueUpdate && isEarned ? message : undefined);
      return;
    }
    if (props.validateOnValueUpdate && isEarned) {
      show(message);
      return;
    }
    /** A reset form: nothing touched, nothing submitted, nothing wrong — so nothing to show. */
    if (message === undefined && !isEarned && !props.validateOnMount) show(undefined);
  });

  /**
   * Submit. Inside a `Form` the form says when its validation has finished (`settled`). Inside
   * another vee-validate form there is no such signal, so the field validates itself when
   * `submitCount` rises and shows that result.
   */
  if (messages !== null) {
    watch(messages.settled, reveal);
  } else if (form !== null) {
    watch(
      () => form.submitCount.value,
      (count) => {
        if (count > 0) void validate().then(reveal);
      }
    );
  }

  onMounted(() => {
    if (props.validateOnMount) void validate().then(reveal);
  });

  const error = computed(() => shown.value);
  const invalid = computed(() => error.value !== undefined);

  const wrapper = inject(FIELD_KEY, null);
  const ownError = computed(() => (wrapper === null ? error.value : undefined));

  /**
   * The id. A `FieldWrapper` already owns one and has tied its `<label for>` to it, so nothing is
   * forwarded there — handing a `Checkbox` or a `Switch` an explicit `id` is what tells it the
   * wrapper is *not* naming it, and it would draw a second label. Standing on its own, the field
   * generates one so the error summary has something to link to.
   */
  const ownId = useUiId('field');
  const id = computed(
    () => props.id ?? (wrapper === null && options.hasIdProp !== false ? ownId.value : undefined)
  );
  const anchorId = computed(
    () => props.id ?? wrapper?.value.id ?? (options.hasIdProp !== false ? ownId.value : undefined)
  );

  const anchors = inject(FIELD_ANCHORS_KEY, null);
  if (anchors !== null) {
    watch(
      [path, anchorId],
      ([current, target], previous) => {
        const previousPath = previous?.[0];
        if (previousPath !== undefined && previousPath !== current) {
          anchors.unregister(previousPath);
        }
        anchors.register(current, target);
      },
      { immediate: true }
    );
    onScopeDispose(() => anchors.unregister(path.value));
  }

  if (messages !== null) {
    watch(
      path,
      (current, previous) => {
        if (previous !== undefined && previous !== current) messages.forget(previous);
        messages.report(current, shown.value);
      },
      { immediate: true }
    );
    onScopeDispose(() => messages.forget(path.value));
  }

  /**
   * A server error is a statement about the value that was sent, so it stops being true the moment
   * the customer edits the field — and nothing else would clear it, because a rule that already
   * passes produces no new message to overwrite it with. Dropping the entry is what tells the
   * `Form` to unset it (see `context.ts`), and the watcher above takes it off the screen.
   */
  if (apiErrors !== null) {
    watch(value, () => {
      if (!(path.value in apiErrors.value)) return;
      const next = { ...apiErrors.value };
      delete next[path.value];
      apiErrors.value = next;
    });
  }

  /**
   * A blur always marks the field touched (`handleBlur`, told not to validate), and validates it
   * unless `validateOnBlur` is `false`. The message changes when that validation has settled.
   */
  function onBlur(event?: Event): void {
    handleBlur(event, false);
    if (props.validateOnBlur !== false) void validate().then(reveal);
  }

  return { model, error, invalid, ownError, id, onBlur };
}

/**
 * Everything the `Field*` was given, minus what it keeps for itself — the props it forwards to the
 * agnostic component underneath, typed as exactly that `Omit`.
 *
 * Built by walking the props object rather than by destructuring, so a prop added to any of the
 * eleven components is forwarded the day it is added and nothing here has to be told about it.
 * `undefined` values are forwarded too, which is exactly right: Vue applies a component's own
 * `withDefaults` value for a prop that is `undefined`, so an unset prop still lands on its default.
 */
export function useControlProps<TProps extends object, TOmit extends string>(
  props: TProps,
  omit: readonly TOmit[]
): ComputedRef<Omit<TProps, TOmit>> {
  return computed(() => {
    const forwarded: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if ((omit as readonly string[]).includes(key)) continue;
      forwarded[key] = value;
    }
    return forwarded as Omit<TProps, TOmit>;
  });
}
