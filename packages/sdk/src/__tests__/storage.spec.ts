import { describe, expect, it } from 'vitest';
import { createCartSession, createOrderAccessTokens } from '../storage';
import type { EldraKeyValueStorage } from '../storage';

function memoryStorage(): EldraKeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('eldra sdk storage', () => {
  it('remembers and forgets the cart id under the configured key', () => {
    const storage = memoryStorage();
    const session = createCartSession({ storage, key: 'shop.cart' });

    expect(session.read()).toBeNull();
    session.remember('cart-1');
    expect(storage.data.get('shop.cart')).toBe('cart-1');
    expect(session.read()).toBe('cart-1');
    session.forget();
    expect(session.read()).toBeNull();
  });

  it('degrades to no storage without throwing', () => {
    const session = createCartSession({ storage: null });
    const throwing: EldraKeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const blocked = createCartSession({ storage: throwing });

    expect(() => session.remember('x')).not.toThrow();
    expect(session.read()).toBeNull();
    expect(() => blocked.remember('x')).not.toThrow();
    expect(blocked.read()).toBeNull();
  });

  it('keeps order tokens per order and ignores a missing token', () => {
    const storage = memoryStorage();
    const tokens = createOrderAccessTokens({ storage });

    tokens.remember('order-1', 'tok-1');
    tokens.remember('order-2', undefined);

    expect(tokens.read('order-1')).toBe('tok-1');
    expect(tokens.read('order-2')).toBeNull();
    expect([...storage.data.keys()]).toEqual(['eldra.orderAccessToken.order-1']);
  });
});
