import { describe, expect, it } from 'vitest';
import { dateTimeFormat } from '../date';

const MOMENT = new Date(Date.UTC(2026, 9, 12, 23, 30));

describe('dateTimeFormat', () => {
  it('formats in UTC unless told otherwise', () => {
    expect(dateTimeFormat('is-IS', { timeStyle: 'short' }).format(MOMENT)).toBe('23:30');
  });

  it('accepts Reykjavík, which is UTC', () => {
    expect(
      dateTimeFormat('is-IS', { timeStyle: 'short', timeZone: 'Atlantic/Reykjavik' }).format(MOMENT)
    ).toBe('23:30');
  });

  it('accepts any spelling of UTC', () => {
    for (const timeZone of ['utc', 'Etc/GMT+0', 'Iceland', 'Africa/Abidjan']) {
      expect(dateTimeFormat('is-IS', { timeStyle: 'short', timeZone }).format(MOMENT)).toBe(
        '23:30'
      );
    }
  });

  it('refuses another zone for Icelandic rather than printing UTC under its name', () => {
    expect(() => dateTimeFormat('is-IS', { timeZone: 'Europe/Prague' })).toThrow(RangeError);
  });

  it('leaves other locales to the runtime, zones included', () => {
    expect(
      dateTimeFormat('de-DE', { timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(MOMENT)
    ).toBe('01:30');
  });
});
