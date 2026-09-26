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
});
