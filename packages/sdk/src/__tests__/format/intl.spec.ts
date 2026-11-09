import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installIcelandicIntl } from '../../format/intl';
import { withoutIcelandic } from './withoutIcelandic';

const RUNTIME_METHODS = [
  Number.prototype.toLocaleString,
  Date.prototype.toLocaleString,
  Date.prototype.toLocaleDateString,
  Date.prototype.toLocaleTimeString,
];
const MOMENT = new Date(Date.UTC(2026, 9, 12, 23, 30));
const DATE = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' } as const;

describe('installIcelandicIntl, where the runtime has no Icelandic', () => {
  let restoreRuntime: () => void;
  let uninstall: () => void;

  beforeEach(() => {
    restoreRuntime = withoutIcelandic();
    uninstall = installIcelandicIntl();
  });
  afterEach(() => {
    uninstall();
    restoreRuntime();
  });

  it('formats Icelandic numbers and dates from its own data', () => {
    expect(new Intl.NumberFormat('is-IS').format(1234.5)).toBe('1.234,5');
    expect(new Intl.DateTimeFormat('is-IS', DATE).format(MOMENT)).toBe('12. október 2026');
    expect(Intl.DateTimeFormat('is', { dateStyle: 'long', timeZone: 'UTC' }).format(MOMENT)).toBe(
      '12. október 2026'
    );
  });

  it('leaves every other locale to the runtime', () => {
    expect(new Intl.DateTimeFormat('en-GB', DATE).format(MOMENT)).toBe('12 October 2026');
    expect(
      new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeZone: 'UTC' }).format(MOMENT)
    ).toBe('12/10/2026');
    expect(new Intl.NumberFormat('de-DE').format(1234.5)).toBe('1.234,5');
    expect(new Intl.DateTimeFormat('en-GB')).toBeInstanceOf(Intl.DateTimeFormat);
  });

  it('follows the runtime for a list that names a supported locale before Icelandic', () => {
    expect(new Intl.DateTimeFormat(['en-GB', 'is-IS'], DATE).format(MOMENT)).toBe(
      '12 October 2026'
    );
    expect(new Intl.DateTimeFormat(['xx', 'is-IS'], DATE).format(MOMENT)).toBe('12. október 2026');
  });

  it('patches toLocaleString and friends, with their default fields', () => {
    expect((1234.5).toLocaleString('is-IS')).toBe('1.234,5');
    expect(MOMENT.toLocaleDateString('is-IS', { timeZone: 'UTC' })).toBe('12.10.2026');
    expect(MOMENT.toLocaleTimeString('is-IS', { timeZone: 'UTC' })).toBe('23:30:00');
    expect(MOMENT.toLocaleString('is-IS', { timeZone: 'UTC' })).toBe('12.10.2026, 23:30:00');
    expect(MOMENT.toLocaleDateString('is-IS', { month: 'long', timeZone: 'UTC' })).toBe('október');
    expect(MOMENT.toLocaleDateString('en-GB', { timeZone: 'UTC' })).toBe('12/10/2026');
    expect(new Date(Number.NaN).toLocaleDateString('is-IS')).toBe('Invalid Date');
  });

  it('leaves a date in a zone other than UTC to the runtime', () => {
    const berlin = new Intl.DateTimeFormat('is-IS', { ...DATE, timeZone: 'Europe/Berlin' });
    expect(berlin.resolvedOptions().timeZone).toBe('Europe/Berlin');
    expect(berlin.format(MOMENT)).not.toContain('október');
  });

  it('answers supportedLocalesOf with Icelandic included', () => {
    expect(Intl.DateTimeFormat.supportedLocalesOf(['is-IS', 'en-GB'])).toEqual(['is-IS', 'en-GB']);
    expect(Intl.NumberFormat.supportedLocalesOf('is')).toEqual(['is']);
  });

  it('installs once, and its restore puts the runtime back', () => {
    const patched = Intl.DateTimeFormat;
    installIcelandicIntl()();
    expect(Intl.DateTimeFormat).toBe(patched);
    uninstall();
    uninstall = () => {};
    // The runtime's silent English fallback, as before installing.
    expect(new Intl.DateTimeFormat('is-IS', DATE).format(MOMENT)).toBe('October 12, 2026');
    expect([
      Number.prototype.toLocaleString,
      Date.prototype.toLocaleString,
      Date.prototype.toLocaleDateString,
      Date.prototype.toLocaleTimeString,
    ]).toEqual(RUNTIME_METHODS);
  });
});

describe('installIcelandicIntl, where the runtime has Icelandic', () => {
  it('changes nothing unless forced', () => {
    const original = Intl.DateTimeFormat;
    const restore = installIcelandicIntl();
    expect(Intl.DateTimeFormat).toBe(original);
    restore();
  });

  it('formats from its own data when forced, so every runtime prints the same', () => {
    const original = Intl.DateTimeFormat;
    const restore = installIcelandicIntl({ force: true });
    expect(Intl.DateTimeFormat).not.toBe(original);
    expect(new Intl.DateTimeFormat('is-IS', DATE).format(MOMENT)).toBe('12. október 2026');
    restore();
    expect(Intl.DateTimeFormat).toBe(original);
  });
});
