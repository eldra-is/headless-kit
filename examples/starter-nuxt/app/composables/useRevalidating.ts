import { computed, onMounted, ref, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import type { VolatileKey } from '../storefront/types';

/**
 * A commerce block's whole "a fresher value is on its way" state, as booleans a template binds to
 * `@eldrajs/ui`'s `revalidating` prop (`Price`, `StockBadge`, `ProductCard`) and to its own
 * `aria-busy`.
 *
 * Two different things arrive here and are deliberately answered by one flag each way:
 *
 * - `keys` — `StorefrontResult.revalidating`, the volatile refresh: *these* values are being
 *   re-read (`app/storefront/refresh.ts`).
 * - `refreshing` — a whole read in flight over data that is already on screen
 *   (`loading && data !== null`): a filter, a sort, a page, a different product. Every value on
 *   screen is about to be replaced, so it is treated exactly like the volatile refresh — the value
 *   stays, dimmed, with a spinner — and it is what a block marks itself `aria-busy` from.
 *
 * **Everything here is `false` until `onMounted`, and that gate is the point of the composable.**
 * A prerendered page's client-side storefront is *already* in both of these states during the first
 * client render: `createGatewayResult` (`app/storefront/gateway.ts`) sets `loading = true`
 * synchronously, fills `data` from the hydration payload in the same turn, and only clears
 * `loading` after `await handle.settled` — so a block reading either signal straight through would
 * paint `aria-busy`, dimmed values and spinners that the server never wrote, and Vue would report a
 * hydration mismatch and repaint the block. `onMounted` never runs on the server and runs after the
 * first client render, so the gate makes the two renders equal by construction. It is also what
 * makes the refresh *announceable*: a live region that arrives already holding its message is
 * announced unreliably, and this is what guarantees it arrives empty and changes afterwards.
 *
 * Both inputs are getters rather than the result itself because a block often has more than one
 * result and renders one of them (`product-carousel`'s `related`/`collection`/`recently-viewed`).
 */
export interface RevalidatingSource {
  /** `StorefrontResult.revalidating` — the volatile keys being re-read. */
  keys: MaybeRefOrGetter<ReadonlySet<VolatileKey>>;
  /** A whole read in flight over data already on screen — `loading && data !== null`. */
  refreshing?: MaybeRefOrGetter<boolean>;
}

export interface RevalidatingState {
  /** The money amounts are being refreshed — `Price`'s own `revalidating`. */
  price: ComputedRef<boolean>;
  /** The stock line is being refreshed — `StockBadge`'s own `revalidating`. */
  stock: ComputedRef<boolean>;
  /** Either of them — what a `ProductCard` (one flag for both of its values) binds. */
  any: ComputedRef<boolean>;
  /**
   * The whole result is reloading over data on screen — `source.refreshing`, gated. What a block
   * marks itself `aria-busy` from, and says "Updating…" from. Already folded into `price`/`stock`/
   * `any` above, so a template never has to write `revalidating.price || refreshing`.
   */
  refreshing: ComputedRef<boolean>;
}

const NONE: ReadonlySet<VolatileKey> = new Set();

export function useRevalidating(source: RevalidatingSource): RevalidatingState {
  const mounted = ref(false);
  onMounted(() => {
    mounted.value = true;
  });

  const refreshing = computed(
    () => mounted.value && source.refreshing !== undefined && toValue(source.refreshing)
  );
  const keys = computed(() => (mounted.value ? toValue(source.keys) : NONE));
  const price = computed(() => refreshing.value || keys.value.has('price'));
  const stock = computed(() => refreshing.value || keys.value.has('stock'));
  return { price, stock, any: computed(() => price.value || stock.value), refreshing };
}
