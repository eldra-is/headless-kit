import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { createCurrencyPreference, type EldraCurrencyPreference } from '@eldrajs/sdk';
import { resolveVisitorCurrency, VISITOR_COUNTRY_PATH } from '@eldrajs/theme-core';
import type { CartStore } from './cart';
import type { StorefrontFailure } from './feedback';

/** The visitor's currency, derived: the cart's, else the preference, else the default (docs/starter-kit.md, "Currencies"). */
export interface CurrencyStore {
  /** The store's own currency, or `undefined` when it publishes none. Offered or not, every product has a price in it. */
  base: string | undefined;
  /** What pages are built in and a visitor starts in: `base` unless the store turned it off. */
  defaultCurrency: string | undefined;
  /** What the visitor may pick from, `defaultCurrency` first. One entry or none: no picker. */
  offered: Ref<readonly string[]>;
  /** The currency the site shows: `defaultCurrency` until `start` settles, then the cart's, the preference's or the default. */
  active: ComputedRef<string | undefined>;
  /** `start` has settled. */
  started: Ref<boolean>;
  /** Prices on screen may still change currency: more than one is offered and `start` has not settled. */
  pending: ComputedRef<boolean>;
  /** A move of the cart is in flight or queued. */
  busy: ComputedRef<boolean>;
  /** The currency catalog reads ask for, or `undefined` to read in `base`, as a read naming none does. */
  requested: ComputedRef<string | undefined>;
  /** A business customer, whose cart the store keeps in `base` even while it is not offered: no picker, no move. */
  ownCurrencyOnly: Ref<boolean>;
  /** Set when the visitor was moved off a currency, for a one-time notice. */
  movedTo: Ref<string | null>;
  /** A cart move that failed for another reason than the currency, for an error toast. */
  failure: Ref<StorefrontFailure | null>;
  /** The visitor's explicit choice. With a cart it moves the cart, last choice wins. */
  choose(code: string): void;
  /** Chooses `defaultCurrency`; named for when the default was always the store's own. */
  chooseBase(): void;
  /** For a theme with business sign-in, on every page load while signed in: keeps them in `base` and moves a cart there; `false` on sign-out. */
  keepOwnCurrency(on?: boolean): void;
  /** Stops following other tabs; for a store made for one component (a demo, a story), not the app's. */
  dispose(): void;
  /** Reads the stored preference, else the visitor's country. Call once, after mount. */
  start(country: () => Promise<string | null>): Promise<void>;
}

export const CURRENCY_NOT_SOLD = 'CART_CURRENCY_NOT_SOLD';
export const CUSTOMER_ISK_ONLY = 'CART_CURRENCY_CUSTOMER_ISK_ONLY';
const CURRENCY_PREFERENCE_KEY = 'eldra.currency';

function refusedForCurrency(failure: StorefrontFailure | null): boolean {
  return failure?.errorId === CURRENCY_NOT_SOLD;
}

/** Builds the store over `cart`; the returned cart's `add` retries once when its currency is refused. */
export function createCurrencyStore(
  commerce: { currency: string; currencies?: readonly string[]; defaultCurrency?: string } | null,
  cart: CartStore,
  preference: EldraCurrencyPreference = createCurrencyPreference()
): { currency: CurrencyStore; cart: CartStore } {
  const base = commerce?.currency;
  const defaultCurrency = commerce?.defaultCurrency ?? base;
  const listed: readonly string[] =
    defaultCurrency === undefined ? [] : (commerce?.currencies ?? [defaultCurrency]);
  const offered = ref<readonly string[]>(listed);
  const preferred = ref<string | null>(null);
  const started = ref(false);
  const movedTo = ref<string | null>(null);
  const failure = ref<StorefrontFailure | null>(null);
  const ownCurrencyOnly = ref(false);
  const fallback = (): string | undefined => (ownCurrencyOnly.value ? base : defaultCurrency);

  const active = computed(() => {
    if (!started.value) return defaultCurrency;
    const own = cart.currency.value;
    if (own !== undefined) return own;
    if (preferred.value !== null && offered.value.includes(preferred.value)) return preferred.value;
    return fallback();
  });
  const requested = computed(() => (active.value === base ? undefined : active.value));
  const pending = computed(() => !started.value && offered.value.length > 1);

  function withdraw(code: string): void {
    if (code === defaultCurrency) return;
    offered.value = offered.value.filter((offer) => offer !== code);
    if (preference.read() === code) preference.forget();
    if (preferred.value === code) preferred.value = null;
  }

  async function keepInBase(): Promise<void> {
    if (base === undefined) return;
    ownCurrencyOnly.value = true;
    offered.value = [base];
    const own = cart.currency.value;
    if (own !== undefined && own !== base) await move(base, true);
  }

  function leaveBase(): void {
    ownCurrencyOnly.value = false;
    offered.value = listed;
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
        // A business customer's ISK is the store's rule, not a choice to keep for whoever comes next.
        if (!ownCurrencyOnly.value) preference.remember(code);
        if (notice) movedTo.value = code;
      }
    } else if (answer.errorId === CUSTOMER_ISK_ONLY) {
      // The store's own move off a dropped currency is no choice of the visitor's, so nothing to report.
      if (!notice) failure.value = answer;
      await keepInBase();
    } else if (ownCurrencyOnly.value && code === base && refusedForCurrency(answer)) {
      // The store sees no business customer after all (signed out, or no token on the cart): back to what it offers.
      leaveBase();
      if (!notice) failure.value = answer;
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
    return own !== undefined && defaultCurrency !== undefined && !offered.value.includes(own);
  };

  // A cart in a currency this build no longer offers is moved to the default; the watch fires on a change only, so a failed move is not retried in a loop.
  watch([started, cart.currency], ([isStarted, own]) => {
    const to = fallback();
    if (!isStarted || own === undefined || to === undefined) return;
    if (offered.value.includes(own)) return;
    void move(to, true);
  });

  const onStorage = (event: StorageEvent): void => {
    if (event.key !== CURRENCY_PREFERENCE_KEY) return;
    preferred.value = event.newValue;
    if (cart.currency.value !== undefined) void cart.reload();
  };
  const listens = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
  if (listens) window.addEventListener('storage', onStorage);

  const currency: CurrencyStore = {
    base,
    defaultCurrency,
    offered,
    active,
    started,
    pending,
    busy,
    requested,
    movedTo,
    failure,
    ownCurrencyOnly,
    keepOwnCurrency(on = true) {
      if (on) {
        void keepInBase();
        return;
      }
      leaveBase();
      const own = cart.currency.value;
      if (own !== undefined && defaultCurrency !== undefined && !offered.value.includes(own)) {
        void move(defaultCurrency, true);
      }
    },
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
    dispose() {
      if (listens) window.removeEventListener('storage', onStorage);
    },
    chooseBase() {
      if (defaultCurrency !== undefined) currency.choose(defaultCurrency);
    },
    async start(country) {
      let forgotten = false;
      const stored = defaultCurrency === undefined ? null : preference.read();
      // With one currency there is no picker and nothing on screen moves, so a stale choice goes quietly.
      const quietlyStale =
        stored !== null && stored !== defaultCurrency && offered.value.length === 1;
      if (quietlyStale && defaultCurrency !== base) preference.forget();
      if (defaultCurrency !== undefined && offered.value.length > 1) {
        if (stored !== null && offered.value.includes(stored)) {
          if (preferred.value === null) preferred.value = stored;
        } else {
          if (stored !== null) preference.forget();
          forgotten = stored !== null;
          const visitorCountry = await country();
          // A choice made during the lookup, or a cart, wins over the country.
          if (cart.currency.value === undefined && preferred.value === null) {
            const fromCountry = resolveVisitorCurrency({
              base: defaultCurrency,
              offered: offered.value,
              country: visitorCountry,
            });
            if (fromCountry !== defaultCurrency) preferred.value = fromCountry;
          }
        }
      }
      started.value = true;
      // A cart in a dropped currency is about to move; the move says where prices are.
      if (forgotten && !leavingDropped()) movedTo.value = active.value ?? null;
    },
  };

  const followingCart: CartStore = {
    ...cart,
    async add(input) {
      // The visitor's next cart action tries again to leave a currency the store no longer offers.
      const to = fallback();
      if (leavingDropped() && to !== undefined) await move(to, true);
      const hadCart = cart.currency.value !== undefined;
      const sentIn = active.value;
      const answer = await cart.add(input);
      if (answer?.errorId === CUSTOMER_ISK_ONLY && sentIn !== base) {
        await keepInBase();
        return cart.add(input);
      }
      // The store checks the currency only when the add creates the cart.
      if (
        hadCart ||
        !refusedForCurrency(answer) ||
        sentIn === undefined ||
        sentIn === defaultCurrency
      ) {
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
