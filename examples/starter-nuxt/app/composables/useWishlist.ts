import { onMounted, onUnmounted } from 'vue';
import { useStorefront } from './useStorefront';
import type { WishlistStore } from '../storefront/types';

/**
 * The wishlist, hydrated from the shopper's browser **after** the first client render.
 *
 * Every surface that shows saved state — the product page's heart, the header's heart and count,
 * the `/wishlist` page itself — reads the store through here rather than off `useStorefront()`
 * directly, because the hydration gate is the whole contract: `WishlistStore.items` is empty until
 * `hydrate()`, this calls it in `onMounted`, and `onMounted` never runs on the server and runs
 * after the browser's first render. So the prerendered HTML carries no saved state, the browser's
 * first render of that file is identical to it, and the saved list arrives as an ordinary reactive
 * update a moment later — instead of a hydration mismatch that makes Vue repaint the header on
 * every reload for anyone who has ever saved a product.
 *
 * It is the same gate `blocks/navigation/Block.vue` puts on the cart count and
 * `app/composables/useRevalidating.ts` puts on the refresh treatment; this one lives in the store
 * rather than in each component because three surfaces share it, and `hydrate()` is idempotent, so
 * calling this from all three costs one read.
 *
 * **`release()` on unmount is the other half of that call**, not tidiness: hydration subscribes the
 * store to the `storage` event for cross-tab saves, and `useStorefront()` builds a *fallback*
 * storefront per calling component whenever nothing is provided — which is every Storybook story
 * and every block mount. Without the release each of those would leave a subscription behind
 * holding a dead `items` ref. The store counts consumers, so the last component to leave is the one
 * that drops the listener, and a component mounting later re-subscribes.
 *
 * The store itself is returned unchanged: `items`, `count`, `has`, `toggle`, `remove`, `clear`,
 * plus the `hydrate`/`release` pair this composable owns (`app/storefront/types.ts`).
 */
export function useWishlist(): WishlistStore {
  const wishlist = useStorefront().wishlist;
  onMounted(() => {
    wishlist.hydrate();
  });
  // Only ever after an `onMounted` that ran, so the counts cannot go out of step.
  onUnmounted(() => {
    wishlist.release();
  });
  return wishlist;
}
