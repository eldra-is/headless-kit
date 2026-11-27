import { computed, inject, toValue, type ComputedRef, type InjectionKey } from 'vue';
import { LOCALE_KEY, formatDate, type FormatDateOptions } from '@eldrajs/ui';
import { useEldra } from '@eldrajs/theme-vue';
import type { StoreRegion } from '@eldrajs/theme-nuxt/region';

/**
 * The organisation's **regional format** — the locale money, numbers and dates are written in and
 * the time zone they are shown in — as `app/plugins/eldra-ui-messages.ts` provides it from
 * `runtimeConfig.public.eldra.region` (`@eldrajs/theme-nuxt` reads it once at build). `null` when
 * the build could not learn one; Storybook and the block specs provide nothing, which reads the
 * same.
 *
 * Deliberately separate from the content locale: an English-language Icelandic store writes its
 * copy in English and its prices and dates as "4.790 kr." and "26. nóvember 2026". Strings
 * (`useI18n`, `@eldrajs/ui`'s messages, a list's "and") stay on the content locale; only numbers,
 * money and dates follow this.
 *
 * A plain `inject`, not a Nuxt global, so a block may call it.
 */
export const REGION_KEY: InjectionKey<StoreRegion | null> = Symbol('starter-region');

export function useRegion(): StoreRegion | null {
  return inject(REGION_KEY, null);
}

/**
 * The locale a page formats in: the regional format when the organisation published one, else the
 * content locale (what every page did before regional formats existed). What the plugin provides
 * as `LOCALE_KEY`, as a pure function so a spec can pin it.
 */
export function regionalFormatLocale(
  region: StoreRegion | null,
  contentLocale: string | undefined
): string | undefined {
  return region?.formatLocale ?? contentLocale;
}

/**
 * The locale this page formats numbers, money and dates in: the plugin's `LOCALE_KEY` (the
 * regional format, else the content locale), else — with no plugin, in a story or a spec — the
 * content locale off the theme context, else `en-US`.
 */
export function useFormatLocale(): ComputedRef<string> {
  const provided = inject(LOCALE_KEY, undefined);
  const context = tryUseEldra();
  return computed(
    () => toValue(provided) ?? context?.locales?.active ?? context?.preview.locale ?? 'en-US'
  );
}

/**
 * `@eldrajs/ui`'s `formatDate` in the regional format: the regional locale, and a timestamp's
 * calendar day **in the organisation's time zone** — an order placed at 23:30 UTC in a UTC−5 shop
 * was placed on the day before, whatever zone the build machine or the visitor is in. A bare
 * `YYYY-MM-DD` is a calendar day already and is passed through. Never throws; `null` for a value
 * `formatDate` cannot read, exactly as it answers.
 */
export function useFormatDate(): (iso: string, options?: FormatDateOptions) => string | null {
  const locale = useFormatLocale();
  const timeZone = useRegion()?.timeZone;
  return (iso, options) => formatDate(calendarDayIn(iso, timeZone), locale.value, options);
}

/**
 * The `YYYY-MM-DD` calendar day `iso` falls on in `timeZone`. A value with no time part, no zone
 * to convert to, or a timestamp `Date` cannot parse is returned unchanged (`formatDate` takes the
 * date part as it stands, which is what it always did).
 */
export function calendarDayIn(iso: string, timeZone: string | undefined): string {
  if (timeZone === undefined || !iso.includes('T')) return iso;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return iso;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const part = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((entry) => entry.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return iso;
  }
}

function tryUseEldra(): ReturnType<typeof useEldra> | undefined {
  try {
    return useEldra();
  } catch {
    return undefined;
  }
}
