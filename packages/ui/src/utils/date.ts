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
 *
 * `options` (added 2026-09-27) widens the *style* without widening the contract: a caller that
 * needs a spelled-out month ("12 September 2026" beside a `Section`'s wide layout, the short form
 * in a narrow one — the starter's `article` block renders both and picks one with a container
 * query) passes `{ month: 'long' }` rather than reaching for `Intl.DateTimeFormat` itself and
 * losing every guarantee above. Only the four date parts are exposed, deliberately: this is a
 * *date* formatter, the `<time datetime>` attribute it pairs with carries a date-only value, and
 * there is no time in the parsed input to format.
 */

/**
 * The `Intl.DateTimeFormatOptions` subset `formatDate` accepts. Each key defaults to what the
 * spec's own "12 Sep 2026" needs (`day: 'numeric'`, `month: 'short'`, `year: 'numeric'`), and
 * `weekday` is off unless asked for — omitting a key keeps its default rather than dropping that
 * part from the output, so `{ month: 'long' }` is a one-key change to the long form and nothing
 * else moves.
 */
export interface FormatDateOptions {
  /** `'numeric'` (default) → "12"; `'2-digit'` → "05" for May's 5th. */
  day?: 'numeric' | '2-digit';
  /** `'short'` (default) → "Sep"; `'long'` → "September"; `'numeric'`/`'2-digit'`/`'narrow'` too. */
  month?: 'numeric' | '2-digit' | 'short' | 'long' | 'narrow';
  /** `'numeric'` (default) → "2026"; `'2-digit'` → "26". */
  year?: 'numeric' | '2-digit';
  /** Off by default. `'long'` → "Saturday", `'short'` → "Sat", `'narrow'` → "S". */
  weekday?: 'long' | 'short' | 'narrow';
}

const DEFAULT_PARTS = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
} as const satisfies Intl.DateTimeFormatOptions;

const warnedInvalidDates = new Set<string>();

function warnInvalidDate(iso: string): void {
  if (!import.meta.env?.DEV || warnedInvalidDates.has(iso)) return;
  warnedInvalidDates.add(iso);
  console.warn(
    `[@eldrajs/ui] formatDate received an invalid or malformed date ("${iso}"); rendering ` +
      'nothing rather than a fabricated date.'
  );
}

/** Option values already warned about, so a bad `month` in a component's `computed` says so once
 *  rather than on every render. Keyed by the whole option object's JSON, which is stable for the
 *  literal a caller writes. */
const warnedInvalidOptions = new Set<string>();

function warnInvalidOptions(key: string): void {
  if (!import.meta.env?.DEV || warnedInvalidOptions.has(key)) return;
  warnedInvalidOptions.add(key);
  console.warn(
    `[@eldrajs/ui] formatDate received an option value Intl.DateTimeFormat rejects (${key}); ` +
      'falling back to the default day/month/year style. See FormatDateOptions for the accepted ' +
      'values.'
  );
}

export function formatDate(
  iso: string,
  locale?: string,
  options?: FormatDateOptions
): string | null {
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

  // The same never-throw rule the date itself gets, now applied to the *options*: a `month` value
  // outside the union (a JavaScript consumer, a value out of a CMS field, a typo TypeScript never
  // saw) makes `Intl.DateTimeFormat` throw a `RangeError`, and a formatter throwing from inside a
  // `computed` takes the whole render down. A bad style is a strictly smaller problem than a blank
  // page, so it falls back to the default style and says so once in dev.
  const requested: Intl.DateTimeFormatOptions = { ...DEFAULT_PARTS, ...options };
  try {
    return new Intl.DateTimeFormat(locale, requested).format(date);
  } catch {
    warnInvalidOptions(JSON.stringify(options ?? {}));
    // `locale` itself can be the invalid one (`Intl` rejects a malformed language tag), so the
    // retry drops it too rather than re-throwing — the runtime default locale still formats.
    try {
      return new Intl.DateTimeFormat(locale, DEFAULT_PARTS).format(date);
    } catch {
      return new Intl.DateTimeFormat(undefined, DEFAULT_PARTS).format(date);
    }
  }
}
