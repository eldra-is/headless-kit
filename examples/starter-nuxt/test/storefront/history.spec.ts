import { beforeEach, describe, expect, it } from 'vitest';
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

describe('createWishlistStore', () => {
  beforeEach(() => {
    setLocalStorage(memoryStorage());
  });

  it('toggle adds a handle not yet in the wishlist', () => {
    const wishlist = createWishlistStore();
    expect(wishlist.has('merino-crew-sweater')).toBe(false);
    wishlist.toggle('merino-crew-sweater');
    expect(wishlist.has('merino-crew-sweater')).toBe(true);
    expect(wishlist.items.value).toEqual(['merino-crew-sweater']);
  });

  it('toggle removes a handle already in the wishlist', () => {
    const wishlist = createWishlistStore();
    wishlist.toggle('merino-crew-sweater');
    wishlist.toggle('merino-crew-sweater');
    expect(wishlist.has('merino-crew-sweater')).toBe(false);
    expect(wishlist.items.value).toEqual([]);
  });

  it('persists across store instances via localStorage', () => {
    createWishlistStore().toggle('merino-crew-sweater');
    const reloaded = createWishlistStore();
    expect(reloaded.has('merino-crew-sweater')).toBe(true);
  });

  it('degrades to empty state instead of throwing when localStorage is absent', () => {
    setLocalStorage(undefined);
    const wishlist = createWishlistStore();
    expect(wishlist.items.value).toEqual([]);
    expect(() => wishlist.toggle('a')).not.toThrow();
  });

  it('degrades to empty state instead of throwing when localStorage itself throws', () => {
    setLocalStorage(throwingStorage());
    const wishlist = createWishlistStore();
    expect(wishlist.items.value).toEqual([]);
    expect(() => wishlist.toggle('a')).not.toThrow();
  });
});
