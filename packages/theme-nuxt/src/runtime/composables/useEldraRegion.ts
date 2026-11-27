import { useRuntimeConfig } from 'nuxt/app';
import { resolveStoreRegion, type StoreRegion } from '../region';

/**
 * The organisation's regional format — `{ countryCode, formatLocale, timeZone }` — or `null` when
 * the build could not learn one (`../region.ts`). Format money, numbers and dates with
 * `formatLocale` and show times in `timeZone`; keep strings on the content locale
 * (`useEldraLocale().active`). With `null`, format in the content locale, as before.
 *
 * Read off `runtimeConfig.public.eldra.region`, which the module bakes in once at build, so the
 * server render and the browser agree on every formatted value.
 */
export function useEldraRegion(): StoreRegion | null {
  const eldra = useRuntimeConfig().public.eldra as { region?: unknown } | undefined;
  return resolveStoreRegion(eldra?.region);
}
