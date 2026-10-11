import { describe, expect, it } from 'vitest';
import { ratingStarStates, roundRatingToHalf } from '../rating';

describe('roundRatingToHalf', () => {
  it('rounds down at the lower boundary (4.24 -> 4.0)', () => {
    expect(roundRatingToHalf(4.24)).toBe(4);
  });

  it('rounds up at the upper boundary (4.25 -> 4.5)', () => {
    expect(roundRatingToHalf(4.25)).toBe(4.5);
  });

  it('leaves an exact half step unchanged', () => {
    expect(roundRatingToHalf(4.5)).toBe(4.5);
  });

  it('leaves a whole number unchanged', () => {
    expect(roundRatingToHalf(4)).toBe(4);
  });

  it('rounds 0.1 down to 0', () => {
    expect(roundRatingToHalf(0.1)).toBe(0);
  });

  it('rounds 4.9 up to 5', () => {
    expect(roundRatingToHalf(4.9)).toBe(5);
  });

  it('clamps a value above 5', () => {
    expect(roundRatingToHalf(5.3)).toBe(5);
  });

  it('clamps a negative value to 0', () => {
    expect(roundRatingToHalf(-1)).toBe(0);
  });
});

describe('ratingStarStates', () => {
  it('renders four full stars and one half for 4.5', () => {
    expect(ratingStarStates(4.5)).toEqual(['full', 'full', 'full', 'full', 'half']);
  });

  it('renders every star empty for 0', () => {
    expect(ratingStarStates(0)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
  });

  it('renders every star full for 5', () => {
    expect(ratingStarStates(5)).toEqual(['full', 'full', 'full', 'full', 'full']);
  });

  it('rounds before computing states, so 4.24 has no half star', () => {
    expect(ratingStarStates(4.24)).toEqual(['full', 'full', 'full', 'full', 'empty']);
  });

  it('rounds before computing states, so 4.25 has a half star', () => {
    expect(ratingStarStates(4.25)).toEqual(['full', 'full', 'full', 'full', 'half']);
  });

  it('places the half star at the first star for a 0.5 rating', () => {
    expect(ratingStarStates(0.5)).toEqual(['half', 'empty', 'empty', 'empty', 'empty']);
  });

  it('places the half star at the third position for a 2.5 rating', () => {
    expect(ratingStarStates(2.5)).toEqual(['full', 'full', 'half', 'empty', 'empty']);
  });
});
