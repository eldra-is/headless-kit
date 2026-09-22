import { useId as vueUseId } from 'vue';

/**
 * Thin wrapper around Vue 3.5's built-in `useId()` (stable across server and
 * client renders, so a label's `for` and an input's `id` always match after
 * hydration). Kept as its own composable — rather than every primitive
 * importing `useId` from `vue` directly — so a future SSR id collision (this
 * starter is `ssr: false` today; a customer could still flip that on) only
 * needs a fix here, e.g. prefixing with a per-app id. See `app/components/ui/UiInput.vue`,
 * `UiTextarea.vue`, `UiSelect.vue`, `UiCheckbox.vue`, `UiDialog.vue` for callers.
 */
export function useId(): string {
  return vueUseId();
}
