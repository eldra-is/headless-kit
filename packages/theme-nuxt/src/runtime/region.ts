import type { EldraFeatureClient, EldraOrganizationRegion } from '@eldrajs/sdk';

/**
 * The organisation's **regional format**, as it reaches a theme on
 * `runtimeConfig.public.eldra.region`: `{ countryCode, formatLocale, timeZone }`, or `null`.
 *
 * Published as `@eldrajs/theme-nuxt/region` beside `./commerce` and `./locales`, so a theme reading
 * that key types it from here. The shape is the SDK's own (`features.getRegion()`), aliased under
 * the name the runtime config uses.
 *
 * It is **not** the content locale. A merchant picks the language a page is written in and, in
 * Studio, the regional format money, numbers and dates are written in — an English-language
 * Icelandic store prints "4.790 kr." and "26. nóvember 2026" under English copy. A theme formats
 * with `formatLocale` and shows times in `timeZone`; its strings stay on the content locale.
 *
 * Read **once, at build**, because every price and date a prerendered page carries is formatted
 * with it: a value fetched in the browser would reformat every amount a tick after the page drew.
 *
 * `null` is a real answer: a gateway older than the field publishes none, and a theme then formats
 * in the content locale, exactly as it did before regional formats existed.
 */
export type StoreRegion = EldraOrganizationRegion;

/**
 * The slice of an `@eldrajs/sdk` client this read needs — a whole `EldraClient` satisfies it.
 * Narrow so the module's tests can hand it a client that answers, omits or throws.
 */
export interface StoreRegionReader {
  features: Pick<EldraFeatureClient, 'getRegion'>;
}

/**
 * The one line a build prints when it could not learn the regional format. It names the outcome —
 * the content locale formats everything — because that is indistinguishable on the page from a
 * store whose regional format happens to match its language, and only this case is fixable.
 *
 * No warning when the organisation publishes none: the outcome is the behaviour every site had
 * before the field existed, and a line every such build printed would teach its reader to ignore
 * build warnings.
 */
export const REGION_READ_FAILED_WARNING =
  '[eldra] could not read the organisation’s regional format — prices and dates follow the content locale';

/**
 * How long the build waits for the answer. A bound, because the read is optional: a regional
 * format nobody can fetch must not be the reason a deploy never finishes.
 *
 * Exported so the test that proves the bound can assert the value rather than restate it.
 */
export const READ_TIMEOUT_MS = 10_000;

/**
 * The regional format for `runtimeConfig.public.eldra.region`, or `null`.
 *
 * Fail-soft: a gateway that cannot be reached, a read that times out, a record the SDK refuses and
 * an organisation that publishes none all end with `null` and a build that finishes; only a read
 * that threw prints the one line above, with its cause.
 *
 * `reader` is `null` for a site built without gateway credentials: no request, no warning.
 */
export async function readStoreRegion(
  reader: StoreRegionReader | null,
  warn: (message: string) => void = console.warn
): Promise<StoreRegion | null> {
  if (reader === null) return null;
  // An explicit controller and `setTimeout`, cleared the instant the read settles — the same
  // reasoning as `./locales.ts`: nothing left pending, and a timer a test can advance.
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`timed out after ${READ_TIMEOUT_MS}ms`)),
    READ_TIMEOUT_MS
  );
  try {
    return toStoreRegion(await reader.features.getRegion(undefined, { signal: controller.signal }));
  } catch (error) {
    warn(`${REGION_READ_FAILED_WARNING} (${describe(error)})`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Accepts only a whole, usable record — re-checking what the SDK checked, because this is also
 * what reads the value back **out** of the runtime config (`resolveStoreRegion`), where Nitro
 * serialises an absent one as `''` and a hand-written key could hold anything. Every field ends up
 * in an `Intl` constructor on every price and date, and `Intl` throws on a bad tag or zone.
 */
export function toStoreRegion(value: unknown): StoreRegion | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const { countryCode, formatLocale, timeZone } = record;
  if (typeof countryCode !== 'string' || !/^(?:[A-Z]{2})?$/.test(countryCode)) return null;
  if (typeof formatLocale !== 'string' || formatLocale === '') return null;
  if (!isUsable(() => Intl.getCanonicalLocales(formatLocale))) return null;
  if (typeof timeZone !== 'string' || timeZone === '') return null;
  if (!isUsable(() => new Intl.DateTimeFormat('en', { timeZone }))) return null;
  return { countryCode, formatLocale, timeZone };
}

/**
 * The regional format the **running** site formats with, read off
 * `runtimeConfig.public.eldra.region` (`''` when the build wrote `null`).
 */
export function resolveStoreRegion(value: unknown): StoreRegion | null {
  return toStoreRegion(value);
}

function isUsable(probe: () => unknown): boolean {
  try {
    probe();
    return true;
  } catch {
    return false;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
