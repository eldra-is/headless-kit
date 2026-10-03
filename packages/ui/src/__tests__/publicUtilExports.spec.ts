import { describe, expect, it } from 'vitest';
import * as ui from '../index';

/**
 * A batch of this package's own utils (`frameAspectRatio`, `formatDate`, `useSlotPresence`,
 * `roundRatingToHalf`/`ratingStarStates`, `initialsFromName`) were missing from `src/index.ts`
 * while their earlier peers (`cx`, `mixToward`, `useUiId`, `createNumberFormat`, …) are all public
 * — a consumer composing a wrapper around this package's components could not reach them. Calls
 * each one through the public entry, not just checks it is defined, so a re-export of the wrong
 * value (or one whose signature drifted) would fail here too.
 */
describe('public util exports', () => {
  it('exports frameAspectRatio, and it turns an ImageRatio into a real aspect-ratio value', () => {
    expect(ui.frameAspectRatio('16x9', null)).toBe('16 / 9');
  });

  it('exports formatDate, and it never throws on a malformed date', () => {
    expect(ui.formatDate('not-a-date', 'en-US')).toBeNull();
    expect(typeof ui.formatDate('2026-09-12', 'en-US')).toBe('string');
  });

  it('exports useSlotPresence as a function', () => {
    expect(typeof ui.useSlotPresence).toBe('function');
  });

  it('exports roundRatingToHalf and ratingStarStates, matching Rating’s own rounding rule', () => {
    expect(ui.roundRatingToHalf(4.26)).toBe(4.5);
    expect(ui.ratingStarStates(4.5)).toEqual(['full', 'full', 'full', 'full', 'half']);
  });

  it('exports initialsFromName, matching Avatar’s own two-letter rule', () => {
    expect(ui.initialsFromName('Maya Okafor')).toBe('MO');
  });

  it('keeps tagRecipe/listFormat/valueTransition internal (class recipes and a join helper, not public API)', () => {
    expect((ui as Record<string, unknown>).TAG_FILL).toBeUndefined();
    expect((ui as Record<string, unknown>).formatConjunctionList).toBeUndefined();
    expect((ui as Record<string, unknown>).VALUE_FADE).toBeUndefined();
  });
});
