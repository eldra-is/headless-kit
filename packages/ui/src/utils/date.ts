/**
 * Format an ISO date as `<time datetime>` text (spec "Content card" → Properties, `date` row:
 * `'Rendered as "12 Sep 2026" in a <time datetime>'`), in whatever style `Intl.DateTimeFormat`
 * gives the locale — `en-US` reads "Sep 12, 2026", `is-IS` reads "12. sep. 2026"; the spec's own
 * "12 Sep 2026" is one locale's rendering, not a format this function reproduces literally.
 *
 * `iso` is parsed by its calendar components (`YYYY-MM-DD`, an optional `T…` time/offset
 * discarded) rather than handed to `new Date(iso)` directly: the ISO 8601 string constructor
 * parses a date-only string as UTC midnight, and formatting that in a locale west of UTC
 * (`America/Los_Angeles`, most of the Americas) rolls it back to the previous day —
 * "2026-09-12" reads as "Sep 11" for a visitor there. Building the `Date` from its year/month/day
 * components in the *local* time zone instead means there is no UTC offset to cross, so the
 * calendar date never shifts.
 *
 * Never throws. `iso` is content — often round-tripped through a CMS field a caller does not fully
 * control — so a malformed, empty or out-of-range value (`''`, `'not-a-date'`, `'2026-02-30'`,
 * which `Date` would otherwise silently roll over to 2 March) returns `null` instead of an Invalid
 * Date or a thrown `RangeError` from `Intl.DateTimeFormat`. `ContentCard` renders no `<time>`
 * element at all when this returns `null` — never a fabricated date like "Jan 1, 1900" (the result
 * of `Number('')` defaulting every component to `0`/`NaN` and formatting anyway). Warns once per
 * distinct bad value in dev, the same "never throw from a computed" rule `Price.vue` documents for
 * an invalid currency code.
 */

const warnedInvalidDates = new Set<string>();

function warnInvalidDate(iso: string): void {
  if (!import.meta.env?.DEV || warnedInvalidDates.has(iso)) return;
  warnedInvalidDates.add(iso);
  console.warn(
    `[@eldrajs/ui] formatDate received an invalid or malformed date ("${iso}"); rendering ` +
      'nothing rather than a fabricated date.'
  );
}

export function formatDate(iso: string, locale?: string): string | null {
  const datePart = iso.split('T')[0] ?? iso;
  const segments = datePart.split('-').map(Number);
  if (segments.length !== 3 || segments.some((n) => !Number.isFinite(n))) {
    warnInvalidDate(iso);
    return null;
  }

  const [year, month, day] = segments as [number, number, number];
  const date = new Date(year, month - 1, day);
  // `Date` silently rolls an out-of-range day/month over into the next one (`2026-02-30` becomes
  // 2 March) instead of producing an Invalid Date — comparing the constructed date's own
  // components back against the input is what catches that case; `Number.isNaN(date.getTime())`
  // alone would not.
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    warnInvalidDate(iso);
    return null;
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
