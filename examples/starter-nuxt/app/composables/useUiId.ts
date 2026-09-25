import { useId as vueUseId } from 'vue';

/**
 * Thin wrapper around Vue 3.5's built-in `useId()` (stable across server and
 * client renders, so a label's `for` and an input's `id` always match after
 * hydration). Kept as its own composable — rather than every primitive
 * importing `useId` from `vue` directly — so a future SSR id collision (this
 * starter is `ssr: false` today; a customer could still flip that on) only
 * needs a fix here, e.g. prefixing with a per-app id. Named `useUiId` (not
 * `useId`) because Nuxt auto-imports Vue's own `useId` under that exact
 * name; a same-named local composable collided with it and warned at
 * `nuxi prepare`. See `app/components/ui/UiDialog.vue` and the `gallery` /
 * `navigation` blocks for callers (`@eldrajs/ui`'s own controls have their
 * own equivalent, `useUiId` in that package).
 */
export function useUiId(): string {
  return vueUseId();
}
