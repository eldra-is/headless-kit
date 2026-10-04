import { onMounted } from 'vue';
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
 * Nothing is returned beyond the store itself: `items`, `count`, `has`, `toggle`, `remove`,
 * `clear` are the whole interface (`app/storefront/types.ts`).
 */
export function useWishlist(): WishlistStore {
  const wishlist = useStorefront().wishlist;
  onMounted(() => {
    wishlist.hydrate();
  });
  return wishlist;
}
