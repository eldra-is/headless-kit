/**
 * Format an ISO date as `<time datetime>` text (spec "Content card" → Properties, `date` row:
 * `'Rendered as "12 Sep 2026" in a <time datetime>'`), in whatever style `Intl.DateTimeFormat`
 * gives the locale — `en-US` reads "Sep 12, 2026", `is-IS` reads "12. sep. 2026"; the spec's own
 * "12 Sep 2026" is one locale's rendering, not a format this function reproduces literally.
 *
 * `iso` is parsed by its calendar components (`YYYY-MM-DD`, an optional `T…` time discarded) rather
 * than handed to `new Date(iso)` directly: the ISO 8601 string constructor parses a date-only
 * string as UTC midnight, and formatting that in a locale west of UTC (`America/Los_Angeles`, most
 * of the Americas) rolls it back to the previous day — "2026-09-12" reads as "Sep 11" for a visitor
 * there. Building the `Date` from its year/month/day components in the *local* time zone instead
 * means there is no UTC offset to cross, so the calendar date never shifts.
 */
export function formatDate(iso: string, locale?: string): string {
  const datePart = iso.split('T')[0] ?? iso;
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
