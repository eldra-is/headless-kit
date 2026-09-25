import { FormContextKey, useField } from 'vee-validate';
import {
  computed,
  inject,
  onScopeDispose,
  watch,
  type ComputedRef,
  type MaybeRef,
  type WritableComputedRef,
} from 'vue';
import { FIELD_KEY } from '../components/field-wrapper/context';
import { useUiId } from '../utils/id';
import { API_ERRORS_KEY, FIELD_ANCHORS_KEY } from './context';
import type { FieldBinding } from './types';

/** The props every `Field*` passes in: its `FieldBinding`, plus the control's own `id` if it has one. */
type FieldControlProps<TValue> = FieldBinding<TValue> & { id?: string };

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
  /** Marks the field touched, which is what reveals a message it already has. */
  onBlur: (event?: Event) => void;
}

/**
 * The whole of what a `Field*` does, minus the one component it renders.
 *
 * Each `Field*` is a thin SFC over this: `useField(name, rules, { label })` for the value and the
 * message, a gate that keeps a message hidden until the customer has left the field or submitted
 * the form, the `id` the form's error summary links to, and the server error that stops being true
 * as soon as the value changes. Keeping it here is what makes the eleven components agree on all
 * of that rather than eleven files drifting apart.
 *
 * **The gate** is the spec's own rule (Form layout → Behaviour & motion: "Validate on submit, then
 * on blur for fields that were invalid after the first submit"). vee-validate revalidates on every
 * keystroke, so the field always *knows* its message; showing it only once `meta.touched` or the
 * form has been submitted is what stops an error appearing under a half-typed email address.
 */
export function useFieldControl<TValue>(
  props: FieldControlProps<TValue>,
  options: UseFieldControlOptions<TValue>
): UseFieldControlReturn<TValue> {
  const rules = computed(() => props.rules);
  const { value, errorMessage, handleBlur, meta } = useField<TValue>(() => props.name, rules, {
    label: () => props.label,
    initialValue: options.initialValue,
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
    () => apiErrors !== null && apiErrors.value[props.name] !== undefined
  );

  /**
   * A server error is never held back: it is the answer to a submit the customer has already made,
   * so there is nothing left to wait for — which also covers a form rendered with errors from a
   * round trip that happened before this page existed.
   */
  const error = computed(() =>
    meta.touched || submitted.value || hasApiError.value ? errorMessage.value : undefined
  );
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
      [() => props.name, anchorId],
      ([name, target], previous) => {
        const previousName = previous?.[0];
        if (previousName !== undefined && previousName !== name) anchors.unregister(previousName);
        anchors.register(name, target);
      },
      { immediate: true }
    );
    onScopeDispose(() => anchors.unregister(props.name));
  }

  /**
   * A server error is a statement about the value that was sent, so it stops being true the moment
   * the customer edits the field — and nothing else would clear it, because a rule that already
   * passes produces no new message to overwrite it with. Dropping the entry is what tells the
   * `Form` to unset it (see `context.ts`).
   */
  if (apiErrors !== null) {
    watch(value, () => {
      if (!(props.name in apiErrors.value)) return;
      const next = { ...apiErrors.value };
      delete next[props.name];
      apiErrors.value = next;
    });
  }

  return { model, error, invalid, ownError, id, onBlur: handleBlur };
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
