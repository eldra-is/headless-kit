import { computed, ref, watch, type Ref } from 'vue';

/**
 * A model that works both ways round: controlled when the parent passes
 * `modelValue`, self-managing when it does not.
 *
 * Every stateful component in this package uses it, so a consumer can drop a
 * `Select` in with no `v-model` and still get a working control, while a
 * consumer that does bind `v-model` stays the single source of truth — writes
 * are emitted and never applied locally, so a parent that refuses a value
 * actually refuses it.
 *
 * `fallback` supplies the uncontrolled starting value and is called once.
 */
export function useControllableModel<T>(
  props: { modelValue?: T },
  emit: (event: 'update:modelValue', value: T) => void,
  fallback: () => T
): Ref<T> {
  const internal = ref(props.modelValue === undefined ? fallback() : props.modelValue) as Ref<T>;

  // Mirror every value the parent supplies while it is in control, so that a
  // component handed back its own state (`v-model` behind a `v-if`, a form that
  // stops binding after it resets) continues from the value that was on screen
  // rather than snapping back to whatever was there at mount.
  watch(
    () => props.modelValue,
    (value) => {
      if (value !== undefined) internal.value = value;
    }
  );

  return computed<T>({
    get: () => (props.modelValue === undefined ? internal.value : props.modelValue),
    set: (value) => {
      if (props.modelValue === undefined) internal.value = value;
      emit('update:modelValue', value);
    },
  });
}
