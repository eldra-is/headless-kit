import type { EldraFeatureClient, EldraOrganizationCommerce } from '@eldrajs/sdk';

/**
 * What the store sells in, as it reaches a theme on `runtimeConfig.public.eldra.commerce`.
 *
 * Read **once, at build**, from the organisation the site is deployed for
 * (`@eldrajs/sdk`'s `features.getCommerce()`), because every price a prerendered page carries is
 * formatted against it: a value fetched in the browser would mean every amount on a static page
 * rendering without a currency first and reflowing a tick later.
 *
 * `null` is a real answer, not a failure: a store that has not configured commerce publishes
 * nothing, and a theme that knows that can render a price as a number with its code instead of
 * guessing a symbol. There is deliberately **no environment override** — the platform is the one
 * source for this, and a site whose own `ELDRA_CURRENCY` disagreed with the catalogue would
 * relabel real amounts rather than correct them.
 */
export interface StoreCommerce {
  /** ISO 4217 code every catalog price is quoted in, e.g. `ISK`. */
  currency: string;
  /** Prices already contain VAT; a storefront shows them as they are. */
  taxInclusivePricing: boolean;
  /** Fraction, e.g. `0.24` — applies to shipping and to products without their own rate. */
  defaultTaxRate: number;
}

/**
 * The slice of an `@eldrajs/sdk` client this read needs — a whole `EldraClient` satisfies it.
 * Narrow on purpose: it is what lets the module's own tests hand `readStoreCommerce` a client that
 * answers, omits or throws with no gateway anywhere near them.
 */
export interface StoreCommerceReader {
  features: Pick<EldraFeatureClient, 'getCommerce'>;
}

/** The one line a theme's build prints when it could not learn the store's currency. */
export const NO_CURRENCY_WARNING =
  '[eldra] the store publishes no currency — prices render as a number with the code';

/**
 * How long the build waits for the answer. A bound rather than none, because this read is
 * optional: the page and route-template reads a prerender depends on may hang until the gateway
 * answers or fails, but a currency nobody can fetch must not be the reason a deploy never
 * finishes.
 */
const READ_TIMEOUT_MS = 10_000;

/**
 * The store's commerce settings for `runtimeConfig.public.eldra`, or `null`.
 *
 * Fail-soft by construction: a gateway that cannot be reached, a read that times out, a response
 * that is not the shape the gateway documents and a store with no commerce at all all end the same
 * way — `null`, one warning, and a build that finishes. A theme must stay deployable while the
 * platform is having a bad afternoon, and the only thing lost is a currency symbol.
 *
 * `reader` is `null` for a site built without gateway credentials (a scaffolded theme nobody has
 * connected yet, a CI build with no secrets). Same outcome, same single warning, no request.
 */
export async function readStoreCommerce(
  reader: StoreCommerceReader | null,
  warn: (message: string) => void = console.warn
): Promise<StoreCommerce | null> {
  const commerce = reader === null ? null : await readOrNull(reader, warn);
  if (commerce === null) {
    warn(NO_CURRENCY_WARNING);
    return null;
  }
  return commerce;
}

async function readOrNull(
  reader: StoreCommerceReader,
  warn: (message: string) => void
): Promise<StoreCommerce | null> {
  let answer: EldraOrganizationCommerce | null;
  try {
    answer = await reader.features.getCommerce(undefined, {
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
  } catch (error) {
    // Named, because "the store publishes no currency" and "the organisation read was refused"
    // are different problems to whoever is reading the build log, and only the second is a
    // mistake someone can fix.
    warn(`[eldra] could not read the store's currency: ${describe(error)}`);
    return null;
  }
  return toStoreCommerce(answer);
}

/**
 * Accepts only a complete answer. A partial one — a currency with no tax fields, a `currency` that
 * is not a string — is treated as no answer at all rather than passed on half-filled, so a theme
 * reading `commerce.taxInclusivePricing` gets a boolean or nothing, never `undefined` wearing
 * `false`'s clothes. It also makes the value safe to serialise into the runtime config as-is.
 */
function toStoreCommerce(
  value: EldraOrganizationCommerce | null | undefined
): StoreCommerce | null {
  if (value === null || typeof value !== 'object') return null;
  const { currency, taxInclusivePricing, defaultTaxRate } = value;
  if (typeof currency !== 'string' || currency === '') return null;
  if (typeof taxInclusivePricing !== 'boolean' || typeof defaultTaxRate !== 'number') return null;
  return { currency, taxInclusivePricing, defaultTaxRate };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
