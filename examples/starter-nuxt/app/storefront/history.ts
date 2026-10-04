import { computed, ref, type Ref } from 'vue';
import type { HistoryStore, WishlistStore } from './types';

const RECENTLY_VIEWED_KEY = 'eldra.storefront.recentlyViewed';
const WISHLIST_KEY = 'eldra.storefront.wishlist';
const DISMISSED_ANNOUNCEMENTS_KEY = 'eldra.storefront.dismissedAnnouncements';
const MAX_RECENTLY_VIEWED = 12;

/**
 * `localStorage` may be absent (SSR, a unit test running under `environment: 'node'`), disabled
 * (a locked-down browser setting), or full — every read and write here degrades to empty/no-op
 * instead of throwing, the same defensive shape `@eldrajs/sdk`'s own `createCartSession` uses.
 */
function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readStringList(key: string): string[] {
  try {
    const raw = safeStorage()?.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeStringList(key: string, value: string[]): void {
  try {
    safeStorage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable, full, or throwing — the in-memory ref this call already updated is the
    // only state that survives for the rest of this session.
  }
}

/**
 * A short, stable, non-cryptographic hash — just enough to key a dismissal by an announcement's
 * text without storing the whole (possibly long, localized) string as the storage key itself, and
 * without a hashing dependency for something this small.
 */
export function hashMessage(message: string): string {
  let hash = 0;
  for (let index = 0; index < message.length; index += 1) {
    hash = (hash * 31 + message.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Recently-viewed products (`product-detail` records, `product-carousel`'s `recently-viewed`
 * variant reads) and dismissed announcement bars — both `localStorage`-backed, both theme state
 * the SDK has no concept of.
 */
export function createHistoryStore(
  options: { initialRecentlyViewed?: string[] } = {}
): HistoryStore {
  const recentlyViewed = ref<string[]>(
    options.initialRecentlyViewed ?? readStringList(RECENTLY_VIEWED_KEY)
  ) as Ref<string[]>;
  const dismissed = ref<string[]>(readStringList(DISMISSED_ANNOUNCEMENTS_KEY)) as Ref<string[]>;

  return {
    recentlyViewed,
    recordView(handle) {
      const next = [
        handle,
        ...recentlyViewed.value.filter((existing) => existing !== handle),
      ].slice(0, MAX_RECENTLY_VIEWED);
      recentlyViewed.value = next;
      writeStringList(RECENTLY_VIEWED_KEY, next);
    },
    clearViews() {
      recentlyViewed.value = [];
      writeStringList(RECENTLY_VIEWED_KEY, []);
    },
    isAnnouncementDismissed(message) {
      return dismissed.value.includes(hashMessage(message));
    },
    dismissAnnouncement(message) {
      const hash = hashMessage(message);
      if (dismissed.value.includes(hash)) return;
      const next = [...dismissed.value, hash];
      dismissed.value = next;
      writeStringList(DISMISSED_ANNOUNCEMENTS_KEY, next);
    },
  };
}

/**
 * The wishlist: the product handles a shopper saved for later, kept in their own browser.
 *
 * **Local only, on purpose.** There is no account behind it and no platform endpoint for one yet,
 * so the whole list is `localStorage` under `eldra.storefront.wishlist` — the same namespace and the
 * same bare JSON array `createHistoryStore` above persists `recentlyViewed` with, and the same
 * unversioned shape `@eldrajs/sdk`'s `createCartSession` keeps the cart id in. Nothing here is
 * wrapped in a `{ version, data }` envelope because neither of those is: the value is a list of
 * strings, every element that is not a string is dropped on read (`readStringList`), and a stored
 * value this code cannot make sense of degrades to an empty list rather than to an error. A
 * migration, if the shape ever grows, is a new key — which is also how `recentlyViewed` would do it.
 *
 * **Handles, not ids.** A saved product is addressed by its storefront handle, which is what the
 * catalogue's own `filter=slug:in:…` read takes (`StorefrontCatalog.byHandles`), so the wishlist
 * page turns the whole list into one batched products read with no extra id bookkeeping — and a
 * handle is also what every surface that can save a product already has in hand.
 *
 * **`items` is empty until `hydrate()`, and that gate is load-bearing.** A shopper's saved list is
 * their own browser's state, so it is never in the HTML a build wrote: a prerendered page shows no
 * saved hearts and no header count. If the store read `localStorage` at construction instead, the
 * browser's *first* render — the one that has to equal the file it is hydrating — would already
 * know the list, disagree with that markup, and make Vue repaint rather than hydrate. So the read
 * happens in `onMounted` (`app/composables/useWishlist.ts` is the one place that calls it, and
 * every surface goes through it), which never runs on the server and runs after the first client
 * render. It is the same gate `blocks/navigation/Block.vue` puts on the cart count, for the same
 * reason. `hydrate()` is idempotent, and every mutation calls it first so a toggle on a surface
 * that somehow skipped the composable cannot write an empty list over a saved one.
 *
 * **Cross-tab.** Hydration also subscribes to the `storage` event, which fires in every *other*
 * tab of the origin, so saving something in one tab updates the header count and the wishlist page
 * in the rest. No listener is ever removed: the store lives as long as the app does.
 */
export function createWishlistStore(): WishlistStore {
  const items = ref<string[]>([]) as Ref<string[]>;
  let hydrated = false;

  function reread(): void {
    items.value = readStringList(WISHLIST_KEY);
  }

  function hydrate(): void {
    if (hydrated) return;
    hydrated = true;
    reread();
    // `typeof window` rather than a truthiness check: on the server the identifier does not exist
    // at all, and reading an undeclared one throws.
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', (event) => {
      // `key === null` is the whole store being cleared, which includes this key.
      if (event.key !== null && event.key !== WISHLIST_KEY) return;
      reread();
    });
  }

  function write(next: string[]): void {
    items.value = next;
    writeStringList(WISHLIST_KEY, next);
  }

  return {
    items,
    count: computed(() => items.value.length),
    hydrate,
    has(handle) {
      return items.value.includes(handle);
    },
    toggle(handle) {
      hydrate();
      const saved = !items.value.includes(handle);
      // Newest first, like `recentlyViewed`: the wishlist page renders the list in order, and the
      // product a shopper just saved is the one they are most likely looking for.
      write(
        saved ? [handle, ...items.value] : items.value.filter((existing) => existing !== handle)
      );
      return saved;
    },
    remove(handle) {
      hydrate();
      if (!items.value.includes(handle)) return;
      write(items.value.filter((existing) => existing !== handle));
    },
    clear() {
      hydrate();
      if (items.value.length === 0) return;
      write([]);
    },
  };
}
