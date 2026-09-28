import { computed, onMounted, ref, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import type { VolatileKey } from '../storefront/types';

/**
 * A commerce block's read of `StorefrontResult.revalidating` — which volatile values are being
 * refreshed right now, as two booleans a template can bind to `@eldrajs/ui`'s `revalidating` prop
 * (`Price`, `StockBadge`, `ProductCard`).
 *
 * **Why this is not just `result.revalidating.value.has('price')`.** Two reasons, both about the
 * prerendered page:
 *
 * 1. *Hydration.* The server renders with nothing refreshing, and the client's very first render
 *    must produce byte-identical markup or Vue reports a hydration mismatch and repaints. The
 *    refresh is a client-only, after-mount affair (`app/plugins/eldra-storefront.ts` schedules it
 *    on `app:mounted`), but a block must not *depend* on that timing to stay hydration-safe: the
 *    flags here are hard-wired to `false` until `onMounted` — which never fires on the server —
 *    so the first client render is the server's render whatever the storefront is doing.
 * 2. *Announcements.* `Price`/`StockBadge` announce the refresh through a visually hidden live
 *    region. A live region that is already holding its message when it is inserted is announced
 *    unreliably (see `packages/ui/README.md`'s `revalidating` entry): the region has to be in the
 *    document first and change afterwards. Flipping only after mount is exactly that.
 *
 * The argument is a getter rather than the result itself because a block often has more than one
 * result and renders one of them (`product-carousel`'s `related`/`collection`/`recently-viewed`):
 * `useRevalidating(() => activeResult.value.revalidating.value)` follows the active one.
 */
export interface RevalidatingState {
  /** The money amounts are being refreshed — `Price`'s own `revalidating`. */
  price: ComputedRef<boolean>;
  /** The stock line is being refreshed — `StockBadge`'s own `revalidating`. */
  stock: ComputedRef<boolean>;
  /** Either of them — what a `ProductCard` (one flag for both of its values) binds. */
  any: ComputedRef<boolean>;
}

const NONE: ReadonlySet<VolatileKey> = new Set();

export function useRevalidating(
  keys: MaybeRefOrGetter<ReadonlySet<VolatileKey>>
): RevalidatingState {
  const mounted = ref(false);
  onMounted(() => {
    mounted.value = true;
  });
  const current = computed(() => (mounted.value ? toValue(keys) : NONE));
  const price = computed(() => current.value.has('price'));
  const stock = computed(() => current.value.has('stock'));
  return { price, stock, any: computed(() => price.value || stock.value) };
}
