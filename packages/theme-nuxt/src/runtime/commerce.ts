import type { EldraFeatureClient, EldraOrganizationCommerce } from '@eldrajs/sdk';

/**
 * What the store sells in, as it reaches a theme on `runtimeConfig.public.eldra.commerce`:
 * `{ currency, taxInclusivePricing, defaultTaxRate }`, or `null`.
 *
 * Published as `@eldrajs/theme-nuxt/commerce`, so a theme reading that key types it from here
 * instead of hand-writing the record — it is the public contract of a public runtime-config key,
 * and the first field added to it should not have to be added again in every theme. (Its own
 * subpath rather than the package root: `nuxt-module-build` generates the root's `.d.mts` itself,
 * and that file carries the module and `ModuleOptions` only.)
 *
 * It is the gateway's own organisation `commerce` record unchanged, so the shape is declared **once**
 * — in `@eldrajs/sdk`, which is where the read comes from — and aliased here under the name the
 * runtime config uses.
 *
 * Read **once, at build**, from the organisation the site is deployed for
 * (`@eldrajs/sdk`'s `features.getCommerce()`), because every price a prerendered page carries is
 * formatted against it: a value fetched in the browser would mean every amount on a static page
 * rendering without a currency first and reflowing a tick later.
 *
 * `null` is a real answer, not a failure: a store that has not configured commerce publishes
 * nothing, and a theme that knows that can render a price as a plain number instead of guessing a
 * symbol. The module itself adds **no override** — the platform is the one source for this, and a
 * site whose own currency setting disagreed with the catalogue would relabel real amounts rather
 * than correct them.
 */
export type StoreCommerce = EldraOrganizationCommerce;

/**
 * The slice of an `@eldrajs/sdk` client this read needs — a whole `EldraClient` satisfies it.
 * Narrow on purpose: it is what lets the module's own tests hand `readStoreCommerce` a client that
 * answers, omits or throws with no gateway anywhere near them.
 */
export interface StoreCommerceReader {
  features: Pick<EldraFeatureClient, 'getCommerce'>;
}

/**
 * The one line a theme's build prints when it could not learn the store's currency. It says *plain
 * numbers* because that is what a theme with no currency has to render: there is no code to print
 * either — the "number plus its code" shape belongs to a currency that was published but is
 * unusable, which this warning is never about.
 */
export const NO_CURRENCY_WARNING =
  '[eldra] the store publishes no currency — prices render as plain numbers';

/**
 * How long the build waits for the answer. A bound rather than none, because this read is
 * optional: the page and route-template reads a prerender depends on may hang until the gateway
 * answers or fails, but a currency nobody can fetch must not be the reason a deploy never
 * finishes.
 *
 * Exported so the test that proves the bound can assert the value rather than restate it.
 */
export const READ_TIMEOUT_MS = 10_000;

/**
 * The store's commerce settings for `runtimeConfig.public.eldra`, or `null`.
 *
 * Fail-soft by construction: a gateway that cannot be reached, a read that times out, a response
 * that is not the shape the gateway documents and a store with no commerce at all all end the same
 * way — `null`, **exactly one** warning, and a build that finishes. A theme must stay deployable
 * while the platform is having a bad afternoon, and the only thing lost is a currency symbol.
 *
 * When the read itself failed, that one warning carries the cause: "not configured" and
 * "refused or unreachable" are different problems to whoever is reading the build log, and only
 * the second is a mistake someone can fix. It is still one line, so a build log cannot be read as
 * reporting two separate faults.
 *
 * `reader` is `null` for a site built without gateway credentials (a scaffolded theme nobody has
 * connected yet, a CI build with no secrets). Same outcome, same single warning, no request.
 */
export async function readStoreCommerce(
  reader: StoreCommerceReader | null,
  warn: (message: string) => void = console.warn
): Promise<StoreCommerce | null> {
  const read = reader === null ? { commerce: null, cause: null } : await readOrNull(reader);
  if (read.commerce === null) {
    warn(read.cause === null ? NO_CURRENCY_WARNING : `${NO_CURRENCY_WARNING} (${read.cause})`);
    return null;
  }
  return read.commerce;
}

async function readOrNull(
  reader: StoreCommerceReader
): Promise<{ commerce: StoreCommerce | null; cause: string | null }> {
  // An explicit controller and `setTimeout`, not `AbortSignal.timeout`: the timer is cleared the
  // instant the read settles, so a gateway that answers in 5 ms leaves nothing pending behind it,
  // and the bound is driven by a timer a test can advance rather than by a native one it cannot.
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${READ_TIMEOUT_MS}ms`)),
    READ_TIMEOUT_MS
  );
  let answer: EldraOrganizationCommerce | null;
  try {
    answer = await reader.features.getCommerce(undefined, { signal: controller.signal });
  } catch (error) {
    return { commerce: null, cause: `the organisation read failed: ${describe(error)}` };
  } finally {
    clearTimeout(timer);
  }
  const commerce = toStoreCommerce(answer);
  return {
    commerce,
    cause:
      commerce === null && answer !== null && answer !== undefined
        ? 'the organisation published an incomplete commerce record'
        : null,
  };
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
