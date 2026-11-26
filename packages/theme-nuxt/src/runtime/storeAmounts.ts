import type { EldraFeatureClient, StoreAmounts } from '@eldrajs/sdk';

/**
 * The store's amounts for `⟦store …⟧` price tokens (WS-1473): today the free-shipping threshold
 * per currency, the lowest among the organisation's active delivery methods
 * (`features.getStoreAmounts()`), in minor units.
 *
 * Read once at build time, like the currency and the regional format, and baked into
 * `runtimeConfig.public.eldra.storeAmounts`: every currency's amount is there, so a shopper who
 * switches currency after the page loads needs no request. **Fail-soft**: a gateway that cannot be
 * reached, or a credential-less build, answers `null` with one warning, and a token naming a store
 * setting then hides its sentence; the build never fails over it.
 */
export interface StoreAmountsReader {
  features: Pick<EldraFeatureClient, 'getStoreAmounts'>;
}

export const STORE_AMOUNTS_READ_FAILED_WARNING =
  '[eldra] could not read the store’s delivery thresholds — sentences naming one are left out';

export const READ_TIMEOUT_MS = 10_000;

export async function readStoreAmounts(
  reader: StoreAmountsReader | null,
  warn: (message: string) => void = console.warn
): Promise<StoreAmounts | null> {
  if (reader === null) return null;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${READ_TIMEOUT_MS}ms`)),
    READ_TIMEOUT_MS
  );
  try {
    return toStoreAmounts(await reader.features.getStoreAmounts({ signal: controller.signal }));
  } catch (error) {
    warn(
      `${STORE_AMOUNTS_READ_FAILED_WARNING} (${error instanceof Error ? error.message : String(error)})`
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The amounts, kept only where every value is a currency code and a non-negative integer. */
export function toStoreAmounts(value: unknown): StoreAmounts | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: StoreAmounts = {};
  for (const [name, amounts] of Object.entries(value as Record<string, unknown>)) {
    if (amounts === null || typeof amounts !== 'object' || Array.isArray(amounts)) continue;
    const clean: Record<string, number> = {};
    for (const [code, amount] of Object.entries(amounts as Record<string, unknown>)) {
      if (/^[A-Z]{3}$/.test(code) && Number.isSafeInteger(amount) && (amount as number) >= 0) {
        clean[code] = amount as number;
      }
    }
    if (Object.keys(clean).length > 0) out[name] = clean;
  }
  return out;
}
