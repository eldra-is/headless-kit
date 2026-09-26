import { afterEach, describe, expect, it } from 'vitest';
import { formatDate } from '../date';

afterEach(() => {
  delete process.env.TZ;
});

describe('formatDate', () => {
  it('matches Intl.DateTimeFormat output for en-US', () => {
    const expected = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(2026, 8, 12));
    expect(formatDate('2026-09-12', 'en-US')).toBe(expected);
  });

  it('matches Intl.DateTimeFormat output for is-IS', () => {
    const expected = new Intl.DateTimeFormat('is-IS', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(2026, 8, 12));
    expect(formatDate('2026-09-12', 'is-IS')).toBe(expected);
  });

  it('falls back to the runtime default locale when none is given', () => {
    const expected = new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(2026, 8, 12));
    expect(formatDate('2026-09-12')).toBe(expected);
  });

  it('discards a time component instead of letting it shift the calendar day', () => {
    expect(formatDate('2026-09-12T23:30:00Z', 'en-US')).toBe(formatDate('2026-09-12', 'en-US'));
  });

  /**
   * The defect this guards: `new Date('2026-01-01')` (a bare ISO date-only string) parses as UTC
   * midnight, and formatting that in a zone west of UTC (`America/Los_Angeles`, UTC-8) rolls the
   * calendar day back to 31 December — a card dated "1 Jan" would read "31 Dec" for a visitor
   * there. `formatDate` builds the `Date` from its own year/month/day components instead (in the
   * *local* zone), which never crosses that boundary. Proven by mutation: swapping the
   * implementation for `new Date(iso)` turns this red.
   */
  it('never rolls the date back a day in a zone west of UTC', () => {
    process.env.TZ = 'America/Los_Angeles';
    const result = formatDate('2026-01-01', 'en-US');
    expect(result).toContain('1');
    expect(result).not.toContain('31');
  });

  it('never rolls the date forward a day in a zone east of UTC', () => {
    process.env.TZ = 'Pacific/Kiritimati';
    const result = formatDate('2026-01-31', 'en-US');
    expect(result).toContain('31');
    expect(result).not.toContain('Feb 1');
  });

  it('formats a full ISO date-time with a UTC offset', () => {
    const expected = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(2026, 8, 12));
    expect(formatDate('2026-09-12T23:30:00+02:00', 'en-US')).toBe(expected);
  });

  /**
   * The defect this guards: `Number('not')` is `NaN`, and the old implementation defaulted every
   * `NaN`/undefined component with `??`, which keeps `NaN` (`NaN ?? 1970` is still `NaN`) — handing
   * `Intl.DateTimeFormat().format()` an Invalid Date, which throws `RangeError: Invalid time
   * value`. A bad value must never throw, since this runs inside a `computed` in `ContentCard`.
   */
  it('returns null instead of throwing for a garbage string', () => {
    expect(formatDate('not-a-date', 'en-US')).toBeNull();
  });

  /**
   * The defect this guards: `''.split('-')` is `['']`, and `Number('')` is `0` — not `NaN` — so
   * the old `?? 1970` fallback never triggered and `new Date(0, 0, 1)` formatted as a fabricated
   * "Jan 1, 1900" (`Date`'s two-digit-year rule maps year `0` to 1900) instead of rendering
   * nothing.
   */
  it('returns null instead of a fabricated "Jan 1, 1900" for an empty string', () => {
    expect(formatDate('', 'en-US')).toBeNull();
  });

  /**
   * The defect this guards: `new Date(2026, 1, 30)` does not throw or produce an Invalid Date for
   * a day that does not exist in February — it silently rolls over to 2 March. Comparing the
   * constructed date's own year/month/day back against the parsed input is what catches this;
   * `Number.isNaN(date.getTime())` alone would not.
   */
  it('returns null for a calendar date that does not exist', () => {
    expect(formatDate('2026-02-30', 'en-US')).toBeNull();
  });

  it('never throws for any of the invalid inputs above', () => {
    expect(() => formatDate('not-a-date', 'en-US')).not.toThrow();
    expect(() => formatDate('', 'en-US')).not.toThrow();
    expect(() => formatDate('2026-02-30', 'en-US')).not.toThrow();
  });
});
