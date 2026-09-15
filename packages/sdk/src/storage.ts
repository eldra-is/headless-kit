export interface EldraKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface EldraCartSession {
  read(): string | null;
  remember(cartId: string): void;
  forget(): void;
}

export interface EldraOrderAccessTokens {
  remember(orderId: string, token: string | undefined): void;
  read(orderId: string): string | null;
}

export interface EldraCartSessionOptions {
  storage?: EldraKeyValueStorage | null;
  key?: string;
}

export interface EldraOrderAccessTokenOptions {
  storage?: EldraKeyValueStorage | null;
  keyPrefix?: string;
}

const DEFAULT_CART_KEY = 'eldra.cartId';
const DEFAULT_ORDER_TOKEN_PREFIX = 'eldra.orderAccessToken.';

function browserStorage(name: 'localStorage' | 'sessionStorage'): EldraKeyValueStorage | null {
  try {
    const storage = (globalThis as Record<string, unknown>)[name] as
      | EldraKeyValueStorage
      | undefined;
    return storage ?? null;
  } catch {
    return null;
  }
}

function safeRead(storage: EldraKeyValueStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeWrite(storage: EldraKeyValueStorage | null, key: string, value: string | null): void {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Storage can be unavailable or full; the SDK degrades to a request-scoped session.
  }
}

/** The cart id a browser holds between visits. Lives in localStorage so the basket survives a closed tab. */
export function createCartSession(options: EldraCartSessionOptions = {}): EldraCartSession {
  const storage = options.storage === undefined ? browserStorage('localStorage') : options.storage;
  const key = options.key ?? DEFAULT_CART_KEY;
  return {
    read: () => safeRead(storage, key),
    remember: (cartId) => safeWrite(storage, key, cartId),
    forget: () => safeWrite(storage, key, null),
  };
}

/**
 * The one-time order access token, kept in sessionStorage rather than the return URL so it
 * survives the payment provider's redirect without landing in a URL, a log or a Referer.
 */
export function createOrderAccessTokens(
  options: EldraOrderAccessTokenOptions = {}
): EldraOrderAccessTokens {
  const storage =
    options.storage === undefined ? browserStorage('sessionStorage') : options.storage;
  const prefix = options.keyPrefix ?? DEFAULT_ORDER_TOKEN_PREFIX;
  return {
    remember: (orderId, token) => {
      if (token) safeWrite(storage, prefix + orderId, token);
    },
    read: (orderId) => safeRead(storage, prefix + orderId),
  };
}
