import { onBeforeUpdate, shallowRef, type ShallowRef, type Slots } from 'vue';

/**
 * Which of the named slots the component currently has content for — reactively.
 *
 * **Slots are not reactive in Vue.** `instance.slots` is a plain object the parent mutates in
 * place, so `computed(() => slots.error !== undefined)` caches whatever was true when it first ran
 * and never invalidates. A `<template #error v-if="failed">` toggled after mount therefore left a
 * `FieldWrapper` describing a state the markup no longer had — the field stayed valid while the
 * error was on screen — and the same defect was sitting, unnoticed, in `FormLayout`'s
 * `hasActions`/`hasErrorSummary`.
 *
 * Reading them in the template (`$slots.error`) fixes the `v-if` and nothing else: anything the
 * component *derives* from a slot — an `aria-describedby`, a provided context — still needs a
 * reactive source. So the presence of each named slot is re-read from the live slots object in
 * `onBeforeUpdate`, which Vue runs after it has swapped the new slots in and before the component
 * renders: the template and everything derived from it see the slots this render actually has.
 *
 * The write is guarded on a real change, so a re-render for any other reason costs nothing.
 *
 * ```ts
 * const slots = useSlots();
 * const present = useSlotPresence(slots, ['error', 'help'] as const);
 * const hasError = computed(() => Boolean(props.error) || present.value.error);
 * ```
 *
 * Internal: every component in this package that branches on a slot uses it, so the defect cannot
 * be reintroduced one component at a time. Like every composable it must be called from `setup()`.
 */
export function useSlotPresence<Name extends string>(
  slots: Slots,
  names: readonly Name[]
): Readonly<ShallowRef<Record<Name, boolean>>> {
  const read = (): Record<Name, boolean> => {
    const present = {} as Record<Name, boolean>;
    for (const name of names) present[name] = slots[name] !== undefined;
    return present;
  };

  const present = shallowRef(read());

  onBeforeUpdate(() => {
    const next = read();
    if (names.some((name) => next[name] !== present.value[name])) present.value = next;
  });

  return present;
}
