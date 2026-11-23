import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { createCurrencyPreference, type EldraCurrencyPreference } from '@eldrajs/sdk';
import { resolveVisitorCurrency, VISITOR_COUNTRY_PATH } from '@eldrajs/theme-core';
import type { CartStore } from './cart';
import type { StorefrontFailure } from './feedback';

/** The visitor's currency, derived: the cart's, else the preference, else `base` (docs/starter-kit.md, "Currencies"). */
export interface CurrencyStore {
  /** The store's own currency, or `undefined` when it publishes none. */
  base: string | undefined;
  /** What the visitor may pick from, `base` first. One entry or none: no picker. */
  offered: Ref<readonly string[]>;
  /** The currency the site shows: `base` until `start` settles, then the cart's, the preference's or `base`. */
  active: ComputedRef<string | undefined>;
  /** `start` has settled. */
  started: Ref<boolean>;
  /** Prices on screen may still change currency: more than one is offered and `start` has not settled. */
  pending: ComputedRef<boolean>;
  /** A move of the cart is in flight or queued. */
  busy: ComputedRef<boolean>;
  /** The currency catalog reads ask for, or `undefined` to read in `base` exactly as the build did. */
  requested: ComputedRef<string | undefined>;
  /** Set when the visitor was moved off a currency, for a one-time notice. */
  movedTo: Ref<string | null>;
  /** A cart move that failed for another reason than the currency, for an error toast. */
  failure: Ref<StorefrontFailure | null>;
  /** The visitor's explicit choice. With a cart it moves the cart, last choice wins. */
  choose(code: string): void;
  chooseBase(): void;
  /** Reads the stored preference, else the visitor's country. Call once, after mount. */
  start(country: () => Promise<string | null>): Promise<void>;
}

export const CURRENCY_NOT_SOLD = 'CART_CURRENCY_NOT_SOLD';
const CURRENCY_PREFERENCE_KEY = 'eldra.currency';

function refusedForCurrency(failure: StorefrontFailure | null): boolean {
  return failure?.errorId === CURRENCY_NOT_SOLD;
}

/** Builds the store over `cart`; the returned cart's `add` retries once when its currency is refused. */
export function createCurrencyStore(
  commerce: { currency: string; currencies?: readonly string[] } | null,
  cart: CartStore,
  preference: EldraCurrencyPreference = createCurrencyPreference()
): { currency: CurrencyStore; cart: CartStore } {
  const base = commerce?.currency;
  const offered = ref<readonly string[]>(
    base === undefined ? [] : (commerce?.currencies ?? [base])
  );
  const preferred = ref<string | null>(null);
  const started = ref(false);
  const movedTo = ref<string | null>(null);
  const failure = ref<StorefrontFailure | null>(null);

  const active = computed(() => {
    if (!started.value) return base;
    const own = cart.currency.value;
    if (own !== undefined) return own;
    return preferred.value !== null && offered.value.includes(preferred.value)
      ? preferred.value
      : base;
  });
  const requested = computed(() => (active.value === base ? undefined : active.value));
  const pending = computed(() => !started.value && offered.value.length > 1);

  function withdraw(code: string): void {
    if (code === base) return;
    offered.value = offered.value.filter((offer) => offer !== code);
    if (preference.read() === code) preference.forget();
    if (preferred.value === code) preferred.value = null;
  }

  // Moves go through the cart's own write queue, where a newer choice replaces a waiting one.
  const busy = computed(() => cart.pending.value);

  async function move(code: string, notice = false): Promise<void> {
    const answer = await cart.setCurrency(code);
    // A later choice replaced this one before it was sent.
    if (answer === undefined) return;
    if (answer === null) {
      // No cart came of the work this choice waited behind: it is the preference.
      if (hasNoCart()) {
        preferred.value = code;
        preference.remember(code);
      } else if (cart.currency.value === code) {
        preferred.value = code;
        preference.remember(code);
        if (notice) movedTo.value = code;
      }
    } else {
      if (refusedForCurrency(answer)) withdraw(code);
      failure.value = answer;
    }
  }

  // A cart that is remembered but not read is still a cart; one without a currency (a demo) is not.
  const hasNoCart = (): boolean =>
    cart.loadState.value !== 'unloaded' && cart.currency.value === undefined;

  const leavingDropped = (): boolean => {
    const own = cart.currency.value;
    return own !== undefined && base !== undefined && !offered.value.includes(own);
  };

  // A cart in a currency this build no longer offers is moved to the store's own; the watch fires on a change only, so a failed move is not retried in a loop.
  watch([started, cart.currency], ([isStarted, own]) => {
    if (!isStarted || own === undefined || base === undefined) return;
    if (offered.value.includes(own)) return;
    void move(base, true);
  });

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event) => {
      if (event.key !== CURRENCY_PREFERENCE_KEY) return;
      preferred.value = event.newValue;
      if (cart.currency.value !== undefined) void cart.reload();
    });
  }

  const currency: CurrencyStore = {
    base,
    offered,
    active,
    started,
    pending,
    busy,
    requested,
    movedTo,
    failure,
    choose(code) {
      if (!offered.value.includes(code)) return;
      // Only with no cart and nothing in flight is a choice just a preference; else it queues behind that work.
      if (hasNoCart() && !cart.pending.value) {
        preferred.value = code;
        preference.remember(code);
        return;
      }
      void move(code);
    },
    chooseBase() {
      if (base !== undefined) currency.choose(base);
    },
    async start(country) {
      let forgotten = false;
      if (base !== undefined && offered.value.length > 1) {
        const stored = preference.read();
        if (stored !== null && offered.value.includes(stored)) {
          if (preferred.value === null) preferred.value = stored;
        } else {
          if (stored !== null) preference.forget();
          forgotten = stored !== null;
          const visitorCountry = await country();
          // A choice made during the lookup, or a cart, wins over the country.
          if (cart.currency.value === undefined && preferred.value === null) {
            const fromCountry = resolveVisitorCurrency({
              base,
              offered: offered.value,
              country: visitorCountry,
            });
            if (fromCountry !== base) preferred.value = fromCountry;
          }
        }
      }
      started.value = true;
      if (forgotten) movedTo.value = active.value ?? null;
    },
  };

  const followingCart: CartStore = {
    ...cart,
    async add(input) {
      // The visitor's next cart action tries again to leave a currency the store no longer offers.
      if (leavingDropped() && base !== undefined) await move(base, true);
      const hadCart = cart.currency.value !== undefined;
      const sentIn = active.value;
      const answer = await cart.add(input);
      // The store checks the currency only when the add creates the cart.
      if (hadCart || !refusedForCurrency(answer) || sentIn === undefined || sentIn === base) {
        return answer;
      }
      withdraw(sentIn);
      if (active.value !== sentIn) movedTo.value = active.value ?? null;
      return cart.add(input);
    },
  };

  return { currency, cart: followingCart };
}

/** The visitor's country from the site's own edge route; `null` on any failure or after `timeoutMs`, so a slow edge never holds Add to cart. */
export function fetchVisitorCountry(timeoutMs = 1500): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(VISITOR_COUNTRY_PATH, { signal: controller.signal })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { country?: string | null } | null) => body?.country ?? null)
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}
