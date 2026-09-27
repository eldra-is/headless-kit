import { ref, type Ref } from 'vue';
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
 * the SDK has no concept of (design doc §"Storefront source").
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

/** The wishlist toggle `product-detail`, `product-carousel` and `collection-grid` cards share. */
export function createWishlistStore(): WishlistStore {
  const items = ref<string[]>(readStringList(WISHLIST_KEY)) as Ref<string[]>;

  return {
    items,
    has(handle) {
      return items.value.includes(handle);
    },
    toggle(handle) {
      const next = items.value.includes(handle)
        ? items.value.filter((existing) => existing !== handle)
        : [...items.value, handle];
      items.value = next;
      writeStringList(WISHLIST_KEY, next);
    },
  };
}
