import { onScopeDispose, watch, type Ref } from 'vue';

/**
 * Toggles `overflow: hidden` on `document.documentElement` while `active` is
 * true, restoring whatever inline `overflow` value was there before (so it
 * composes with anything else that might set one). Used by `UiDialog` (and,
 * through it, `UiDrawer`) to lock body scroll while open. Idempotent and
 * ref-counted-by-caller: each `useScrollLock()` instance only ever
 * lock/unlocks its own single toggle, so nesting two dialogs still leaves the
 * page scroll-locked until the last one closes as long as each watches its
 * own `open` state (the second `lock()` call is a no-op since
 * `previousOverflow` is already captured).
 */
export function useScrollLock(active: Ref<boolean>): void {
  let previousOverflow: string | null = null;

  function lock(): void {
    if (previousOverflow !== null) return;
    previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
  }

  function unlock(): void {
    if (previousOverflow === null) return;
    document.documentElement.style.overflow = previousOverflow;
    previousOverflow = null;
  }

  watch(active, (value) => (value ? lock() : unlock()), { immediate: true });
  onScopeDispose(unlock);
}
