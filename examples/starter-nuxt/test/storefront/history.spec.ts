// @vitest-environment jsdom
//
// jsdom rather than the suite's default node environment, for one reason: the wishlist's cross-tab
// sync is a `window` `storage` listener, and `window`/`StorageEvent` only exist here. Every
// `localStorage` in this file is still the in-memory stub installed below — `setLocalStorage`
// redefines the global, so jsdom's own implementation is never what is being tested, and the two
// "storage is absent/throwing" cases stay exactly as honest as they were under node.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHistoryStore, createWishlistStore, hashMessage } from '../../app/storefront/history';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

function throwingStorage(): Storage {
  const explode = () => {
    throw new Error('localStorage is blocked');
  };
  return {
    getItem: explode,
    setItem: explode,
    removeItem: explode,
    clear: explode,
    key: explode,
    length: 0,
  } as Storage;
}

function setLocalStorage(value: Storage | undefined): void {
  Object.defineProperty(globalThis, 'localStorage', { value, configurable: true, writable: true });
}

describe('createHistoryStore', () => {
  beforeEach(() => {
    setLocalStorage(memoryStorage());
  });

  it('recordView adds the newest handle to the front', () => {
    const history = createHistoryStore();
    history.recordView('merino-crew-sweater');
    history.recordView('speckled-latte-mug');
    expect(history.recentlyViewed.value).toEqual(['speckled-latte-mug', 'merino-crew-sweater']);
  });

  it('recordView caps the list at 12, dropping the oldest', () => {
    const history = createHistoryStore();
    for (let i = 1; i <= 13; i += 1) history.recordView(`product-${i}`);
    expect(history.recentlyViewed.value).toHaveLength(12);
    expect(history.recentlyViewed.value[0]).toBe('product-13');
    expect(history.recentlyViewed.value).not.toContain('product-1');
  });

  it('recordView moves an already-viewed handle to the front instead of duplicating it', () => {
    const history = createHistoryStore();
    history.recordView('a');
    history.recordView('b');
    history.recordView('a');
    expect(history.recentlyViewed.value).toEqual(['a', 'b']);
  });

  it('clearViews empties the list', () => {
    const history = createHistoryStore();
    history.recordView('a');
    history.clearViews();
    expect(history.recentlyViewed.value).toEqual([]);
  });

  it('persists recently-viewed across store instances via localStorage', () => {
    createHistoryStore().recordView('merino-crew-sweater');
    const reloaded = createHistoryStore();
    expect(reloaded.recentlyViewed.value).toEqual(['merino-crew-sweater']);
  });

  it('initialRecentlyViewed overrides whatever localStorage already holds', () => {
    createHistoryStore().recordView('stale');
    const history = createHistoryStore({ initialRecentlyViewed: ['fresh'] });
    expect(history.recentlyViewed.value).toEqual(['fresh']);
  });

  it('dismissAnnouncement keys the dismissal by a hash of the message', () => {
    const history = createHistoryStore();
    const message = 'Free shipping over $80';
    expect(history.isAnnouncementDismissed(message)).toBe(false);
    history.dismissAnnouncement(message);
    expect(history.isAnnouncementDismissed(message)).toBe(true);
    expect(history.isAnnouncementDismissed('A different message')).toBe(false);
  });

  it('hashMessage is stable for identical text and differs for different text', () => {
    expect(hashMessage('Free shipping over $80')).toBe(hashMessage('Free shipping over $80'));
    expect(hashMessage('Free shipping over $80')).not.toBe(hashMessage('30-day returns'));
  });

  it('degrades to empty state instead of throwing when localStorage is absent', () => {
    setLocalStorage(undefined);
    const history = createHistoryStore();
    expect(history.recentlyViewed.value).toEqual([]);
    expect(() => history.recordView('a')).not.toThrow();
    expect(() => history.dismissAnnouncement('x')).not.toThrow();
    expect(history.isAnnouncementDismissed('x')).toBe(true);
  });

  it('degrades to empty state instead of throwing when localStorage itself throws', () => {
    setLocalStorage(throwingStorage());
    const history = createHistoryStore();
    expect(history.recentlyViewed.value).toEqual([]);
    expect(() => history.recordView('a')).not.toThrow();
    expect(() => history.dismissAnnouncement('x')).not.toThrow();
  });
});

/** The key `createWishlistStore` persists under (`app/storefront/history.ts`). */
const WISHLIST_STORAGE_KEY = 'eldra.storefront.wishlist';

describe('createWishlistStore', () => {
  beforeEach(() => {
    setLocalStorage(memoryStorage());
  });

  /** Every `storage` registration or removal on `window` since the spy went up. */
  function storageCalls(spy: { mock: { calls: unknown[][] } }): unknown[][] {
    return spy.mock.calls.filter(([type]) => type === 'storage');
  }

  /**
   * **First two in this describe on purpose.** They count `window.addEventListener('storage')`, and
   * the listener they are about is module level: registered for the first store that hydrates and
   * dropped by the last one to release. A test above them that hydrated a store and never released
   * it would leave it up and make both of these vacuous.
   *
   * Why there is one listener rather than one per store: `useStorefront()` builds a fallback demo
   * storefront *per calling component* when nothing is provided — every Storybook story and every
   * block mount does that — so a listener per store would leave one behind for each, each holding a
   * dead `items` ref and re-reading storage on every event.
   */
  it('registers one storage listener for any number of stores, and drops it with the last release', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    try {
      const first = createWishlistStore();
      const second = createWishlistStore();
      first.hydrate();
      second.hydrate();
      expect(storageCalls(add)).toHaveLength(1);

      // One consumer gone, one still interested: the listener stays.
      first.release();
      expect(storageCalls(remove)).toHaveLength(0);

      second.release();
      expect(storageCalls(remove)).toHaveLength(1);

      // And a store hydrating afterwards registers it again rather than going deaf.
      const third = createWishlistStore();
      third.hydrate();
      expect(storageCalls(add)).toHaveLength(2);
      third.release();
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  /** A mutation reads storage for itself but must not subscribe: nothing would ever release what it
   *  registered. */
  it('registers nothing for a store nobody hydrated, mutations included', () => {
    const add = vi.spyOn(window, 'addEventListener');
    try {
      const wishlist = createWishlistStore();
      wishlist.toggle('merino-crew-sweater');
      wishlist.remove('merino-crew-sweater');
      wishlist.clear();
      expect(storageCalls(add)).toHaveLength(0);
    } finally {
      add.mockRestore();
    }
  });

  /** A released store stops following other tabs — the leak this closes. */
  it('stops following the storage event once released', () => {
    const wishlist = createWishlistStore();
    wishlist.hydrate();
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(['from-another-tab']));
    window.dispatchEvent(new StorageEvent('storage', { key: WISHLIST_STORAGE_KEY }));
    expect(wishlist.items.value).toEqual(['from-another-tab']);

    wishlist.release();
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(['later']));
    window.dispatchEvent(new StorageEvent('storage', { key: WISHLIST_STORAGE_KEY }));
    expect(wishlist.items.value).toEqual(['from-another-tab']);
  });

  /**
   * The hydration gate (`app/storefront/history.ts`, `app/composables/useWishlist.ts`): a fresh
   * store knows nothing, whatever the browser already holds, until `hydrate()` — which is what
   * keeps a visitor's saved list out of the HTML a build wrote and makes the browser's first render
   * of that file identical to it. Asserted first because every test below depends on it.
   */
  it('starts empty and stays empty until hydrate(), even with a saved list in storage', () => {
    createWishlistStore().toggle('merino-crew-sweater');

    const wishlist = createWishlistStore();
    expect(wishlist.items.value).toEqual([]);
    expect(wishlist.count.value).toBe(0);
    expect(wishlist.has('merino-crew-sweater')).toBe(false);

    wishlist.hydrate();
    expect(wishlist.items.value).toEqual(['merino-crew-sweater']);
    expect(wishlist.count.value).toBe(1);
    expect(wishlist.has('merino-crew-sweater')).toBe(true);
  });

  it('hydrate is idempotent and does not discard changes made since', () => {
    createWishlistStore().toggle('stored');
    const wishlist = createWishlistStore();
    wishlist.hydrate();
    wishlist.toggle('added');
    wishlist.hydrate();
    expect(wishlist.items.value).toEqual(['added', 'stored']);
  });

  it('toggle adds a handle not yet in the wishlist, newest first, and says it is now saved', () => {
    const wishlist = createWishlistStore();
    wishlist.hydrate();
    expect(wishlist.has('merino-crew-sweater')).toBe(false);
    expect(wishlist.toggle('merino-crew-sweater')).toBe(true);
    expect(wishlist.toggle('speckled-latte-mug')).toBe(true);
    expect(wishlist.has('merino-crew-sweater')).toBe(true);
    expect(wishlist.items.value).toEqual(['speckled-latte-mug', 'merino-crew-sweater']);
    expect(wishlist.count.value).toBe(2);
  });

  it('toggle removes a handle already in the wishlist, and says it is no longer saved', () => {
    const wishlist = createWishlistStore();
    wishlist.hydrate();
    wishlist.toggle('merino-crew-sweater');
    expect(wishlist.toggle('merino-crew-sweater')).toBe(false);
    expect(wishlist.has('merino-crew-sweater')).toBe(false);
    expect(wishlist.items.value).toEqual([]);
  });

  it('remove drops one handle and ignores one that was never saved', () => {
    const wishlist = createWishlistStore();
    wishlist.hydrate();
    wishlist.toggle('a');
    wishlist.toggle('b');
    wishlist.remove('a');
    expect(wishlist.items.value).toEqual(['b']);
    expect(() => wishlist.remove('never-saved')).not.toThrow();
    expect(wishlist.items.value).toEqual(['b']);
  });

  it('clear empties the list, in storage as well as in memory', () => {
    const wishlist = createWishlistStore();
    wishlist.hydrate();
    wishlist.toggle('a');
    wishlist.clear();
    expect(wishlist.items.value).toEqual([]);
    const reloaded = createWishlistStore();
    reloaded.hydrate();
    expect(reloaded.items.value).toEqual([]);
  });

  it('persists across store instances via localStorage', () => {
    createWishlistStore().toggle('merino-crew-sweater');
    const reloaded = createWishlistStore();
    reloaded.hydrate();
    expect(reloaded.has('merino-crew-sweater')).toBe(true);
  });

  /**
   * The defect the mutations' own `hydrate()` call closes: a toggle on a store nobody hydrated
   * would otherwise write `[handle]` over whatever the browser already held, silently emptying a
   * shopper's saved list the first time they pressed a heart.
   */
  it('a mutation on an un-hydrated store keeps the stored list instead of replacing it', () => {
    createWishlistStore().toggle('stored');
    const fresh = createWishlistStore();
    fresh.toggle('added');
    expect(fresh.items.value).toEqual(['added', 'stored']);
    const reloaded = createWishlistStore();
    reloaded.hydrate();
    expect(reloaded.items.value).toEqual(['added', 'stored']);
  });

  it('follows the storage event so another tab saving a product reaches this one', () => {
    const wishlist = createWishlistStore();
    wishlist.hydrate();
    expect(wishlist.items.value).toEqual([]);

    // What another tab's write leaves behind, and the event the browser then fires here.
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(['from-another-tab']));
    window.dispatchEvent(new StorageEvent('storage', { key: WISHLIST_STORAGE_KEY }));
    expect(wishlist.items.value).toEqual(['from-another-tab']);

    // `key: null` is the whole origin's storage being cleared, which includes this key.
    localStorage.removeItem(WISHLIST_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(wishlist.items.value).toEqual([]);
  });

  it('ignores a storage event about another key', () => {
    const wishlist = createWishlistStore();
    wishlist.hydrate();
    wishlist.toggle('mine');
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(['overwritten']));
    window.dispatchEvent(new StorageEvent('storage', { key: 'eldra.storefront.recentlyViewed' }));
    expect(wishlist.items.value).toEqual(['mine']);
  });

  it('degrades to empty state instead of throwing when localStorage is absent', () => {
    setLocalStorage(undefined);
    const wishlist = createWishlistStore();
    expect(() => wishlist.hydrate()).not.toThrow();
    expect(wishlist.items.value).toEqual([]);
    expect(() => wishlist.toggle('a')).not.toThrow();
    expect(() => wishlist.clear()).not.toThrow();
  });

  it('degrades to empty state instead of throwing when localStorage itself throws', () => {
    setLocalStorage(throwingStorage());
    const wishlist = createWishlistStore();
    expect(() => wishlist.hydrate()).not.toThrow();
    expect(wishlist.items.value).toEqual([]);
    expect(() => wishlist.toggle('a')).not.toThrow();
  });
});
