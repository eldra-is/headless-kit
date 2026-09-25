import { computed, toValue, useId, type ComputedRef, type MaybeRefOrGetter } from 'vue';

/**
 * A stable, SSR-safe id for a component part, or the caller's own id when it
 * gave one.
 *
 * Built on Vue's `useId()` (Vue 3.5+), so the server and the client produce the
 * same value and `aria-describedby`/`for` wiring does not break on hydration.
 * Must be called during `setup()`, like every other Vue composable.
 */
export function useUiId(
  prefix: string,
  explicit?: MaybeRefOrGetter<string | undefined>
): ComputedRef<string> {
  const generated = useId();
  return computed(() => toValue(explicit) ?? `eldra-${prefix}-${generated}`);
}
