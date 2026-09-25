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

/**
 * Compose an `aria-describedby` (or `aria-labelledby`) value from ids that may
 * be absent.
 *
 * One rule, everywhere in this package: **a control's own ids come first, then
 * whatever the field context adds.** `aria-describedby` is read in document
 * order of the listed ids, so the control's own error, counter or description is
 * what a screen reader hears first, and the wrapper's help text follows. Nothing
 * ever *replaces* the context — a `describedBy` prop adds to it, so
 * `<FieldWrapper error="…"><Input described-by="x"/></FieldWrapper>` still
 * describes the error.
 *
 * Duplicates are dropped (the same id listed twice is announced twice), and an
 * empty result is `undefined` rather than `""`, so the attribute is omitted
 * instead of rendered empty.
 */
export function joinIds(...ids: Array<string | false | null | undefined>): string | undefined {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id === 'string' && id.length > 0) seen.add(id);
  }
  return seen.size > 0 ? [...seen].join(' ') : undefined;
}
