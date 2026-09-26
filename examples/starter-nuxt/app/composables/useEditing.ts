import { computed, type ComputedRef } from 'vue';
import { useEldra } from '@eldrajs/theme-vue';

/**
 * Contract addition #4 (design doc "Contract additions this sub-project
 * makes"): `true` only inside the Studio page editor's edit mode
 * (`preview.active && preview.mode === 'edit'`) — never merely because a
 * preview bridge is connected (`preview.active` alone also covers read-only
 * "preview" mode, spec 2's Empty state row: "In the editor, dashed
 * placeholders … show where content goes. On the live site, empty optional
 * parts don't render at all"). Blocks gate `@eldrajs/ui`'s
 * `EditorPlaceholder` on this, never on `preview.active` alone.
 *
 * Follows `useT()`'s own pattern (`app/composables/useT.ts`): `useEldra()`
 * throws with no `provideEldra()` ancestor (a plain `mount()` outside a
 * themed page, a composable used in a context this starter doesn't
 * control), and a live page always renders correctly with no editor hints
 * in that case, so the fallback is `false` rather than propagating the
 * throw.
 */
export function useEditing(): ComputedRef<boolean> {
  const context = tryUseEldra();
  return computed(() => context?.preview.active === true && context?.preview.mode === 'edit');
}

function tryUseEldra(): ReturnType<typeof useEldra> | undefined {
  try {
    return useEldra();
  } catch {
    return undefined;
  }
}
