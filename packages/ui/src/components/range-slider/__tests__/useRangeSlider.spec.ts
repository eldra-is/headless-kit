import { describe, expect, it } from 'vitest';
import {
  clampRangeThumb,
  fractionDigits,
  nearestRangeThumb,
  normalizeRangeValue,
  rangeKeyTransition,
  rangePositionToValue,
  rangeStepDigits,
  rangeThumbLimits,
  rangeValueToPercent,
  snapToRangeStep,
  type RangeSliderMath,
} from '../useRangeSlider';

/** A whole-number grid, the price-filter default. */
const UNITS: RangeSliderMath = { min: 0, max: 100, step: 1, largeStep: 10 };
/** The fractional grid the accumulation rule is about. */
const TENTHS: RangeSliderMath = { min: 0, max: 10, step: 0.1, largeStep: 1 };

describe('fractionDigits', () => {
  it('counts the digits a number is written with', () => {
    expect(fractionDigits(1)).toBe(0);
    expect(fractionDigits(100)).toBe(0);
    expect(fractionDigits(0.1)).toBe(1);
    expect(fractionDigits(0.125)).toBe(3);
    expect(fractionDigits(-0.25)).toBe(2);
  });

  it('reads the exponent form the runtime prints for a small step', () => {
    // `String(1e-7)` is "1e-7", not "0.0000001": a dot-based count reads 0 and every value on a
    // 1e-7 grid would then be rounded to a whole number.
    expect(fractionDigits(1e-7)).toBe(7);
    expect(fractionDigits(1.5e-7)).toBe(8);
  });

  it('answers 0 for a value that is not a finite number', () => {
    expect(fractionDigits(Number.NaN)).toBe(0);
    expect(fractionDigits(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('rangeStepDigits', () => {
  it('takes whichever of the step and the lower bound is written with more digits', () => {
    expect(rangeStepDigits({ min: 0, step: 0.1 })).toBe(1);
    // A bound off the step's own grid: 0.05, 0.15, 0.25 all need two digits, not one.
    expect(rangeStepDigits({ min: 0.05, step: 0.1 })).toBe(2);
  });
});

describe('snapToRangeStep', () => {
  it('lands on the nearest multiple of the step, counted from min', () => {
    expect(snapToRangeStep(37, { min: 0, max: 100, step: 10 })).toBe(40);
    expect(snapToRangeStep(34, { min: 0, max: 100, step: 10 })).toBe(30);
    // Counted from `min`, not from zero: the grid is 5, 15, 25…
    expect(snapToRangeStep(12, { min: 5, max: 100, step: 10 })).toBe(15);
  });

  it('keeps both endpoints reachable when they are off the grid', () => {
    // Stops: 0, 3, 6, 9 — and 10, because each bound is a stop of its own.
    expect(snapToRangeStep(10, { min: 0, max: 10, step: 3 })).toBe(10);
    expect(snapToRangeStep(9.6, { min: 0, max: 10, step: 3 })).toBe(10);
    expect(snapToRangeStep(99, { min: 0, max: 10, step: 3 })).toBe(10);
    expect(snapToRangeStep(-5, { min: 0, max: 10, step: 3 })).toBe(0);
    // ...and the grid still wins wherever it is the nearer stop.
    expect(snapToRangeStep(8, { min: 0, max: 10, step: 3 })).toBe(9);
    expect(snapToRangeStep(1, { min: 0, max: 10, step: 3 })).toBe(0);
  });

  it('rounds a fractional grid to the digits the step is written with', () => {
    // 0.1 × 3 is 0.30000000000000004 before the rounding.
    expect(snapToRangeStep(0.3, TENTHS)).toBe(0.3);
    expect(snapToRangeStep(0.7000000000000001, TENTHS)).toBe(0.7);
    expect(String(snapToRangeStep(2.9, TENTHS))).toBe('2.9');
  });

  it('only clamps when the step is not a positive number', () => {
    expect(snapToRangeStep(37.5, { min: 0, max: 100, step: 0 })).toBe(37.5);
    expect(snapToRangeStep(137.5, { min: 0, max: 100, step: 0 })).toBe(100);
  });

  it('answers min for a value that is not a number', () => {
    expect(snapToRangeStep(Number.NaN, UNITS)).toBe(0);
  });
});

describe('rangeValueToPercent', () => {
  it('maps a value onto the track', () => {
    expect(rangeValueToPercent(0, UNITS)).toBe(0);
    expect(rangeValueToPercent(25, UNITS)).toBe(25);
    expect(rangeValueToPercent(100, UNITS)).toBe(100);
    expect(rangeValueToPercent(1200, { min: 1200, max: 4800 })).toBe(0);
    expect(rangeValueToPercent(3000, { min: 1200, max: 4800 })).toBe(50);
  });

  it('clamps a value outside the bounds onto the track rather than past it', () => {
    expect(rangeValueToPercent(-20, UNITS)).toBe(0);
    expect(rangeValueToPercent(120, UNITS)).toBe(100);
  });

  it('answers 0 for a collapsed or inverted range instead of dividing by zero', () => {
    expect(rangeValueToPercent(5, { min: 5, max: 5 })).toBe(0);
    expect(rangeValueToPercent(5, { min: 10, max: 0 })).toBe(0);
  });
});

describe('rangePositionToValue', () => {
  const rect = { left: 100, width: 200 };

  it('reads a pointer position as a value on the step grid', () => {
    expect(rangePositionToValue(100, rect, UNITS)).toBe(0);
    expect(rangePositionToValue(200, rect, UNITS)).toBe(50);
    expect(rangePositionToValue(300, rect, UNITS)).toBe(100);
    // 37.5% of the range, snapped to the 10 grid.
    expect(rangePositionToValue(175, rect, { min: 0, max: 100, step: 10 })).toBe(40);
  });

  it('resolves a press outside the rail to the nearer end, so a drag that leaves it keeps working', () => {
    expect(rangePositionToValue(-500, rect, UNITS)).toBe(0);
    expect(rangePositionToValue(5000, rect, UNITS)).toBe(100);
  });

  it('answers min for a rect that has no width yet', () => {
    expect(rangePositionToValue(150, { left: 0, width: 0 }, UNITS)).toBe(0);
  });
});

describe('rangeThumbLimits', () => {
  it("gives each thumb the other one's value as its inner limit", () => {
    expect(rangeThumbLimits('min', [20, 60], UNITS)).toEqual({ lo: 0, hi: 60 });
    expect(rangeThumbLimits('max', [20, 60], UNITS)).toEqual({ lo: 20, hi: 100 });
  });
});

describe('clampRangeThumb', () => {
  it('stops each thumb where the other one is', () => {
    expect(clampRangeThumb(80, 'min', [20, 60], UNITS)).toBe(60);
    expect(clampRangeThumb(5, 'max', [20, 60], UNITS)).toBe(20);
  });

  it('parks a thumb exactly on an off-grid neighbour rather than before it', () => {
    const math = { min: 0, max: 100, step: 10 };
    expect(clampRangeThumb(90, 'min', [20, 57], math)).toBe(57);
    expect(clampRangeThumb(0, 'max', [23, 60], math)).toBe(23);
  });

  it('still clamps to the bounds', () => {
    expect(clampRangeThumb(-40, 'min', [20, 60], UNITS)).toBe(0);
    expect(clampRangeThumb(400, 'max', [20, 60], UNITS)).toBe(100);
  });
});

describe('normalizeRangeValue', () => {
  it('puts the two ends in order', () => {
    expect(normalizeRangeValue([60, 20], UNITS)).toEqual([20, 60]);
  });

  it('snaps both ends into the bounds', () => {
    expect(normalizeRangeValue([-30, 400], UNITS)).toEqual([0, 100]);
    expect(normalizeRangeValue([12, 37], { min: 0, max: 100, step: 10 })).toEqual([10, 40]);
  });
});

describe('nearestRangeThumb', () => {
  it('picks the nearer thumb', () => {
    expect(nearestRangeThumb(10, [20, 60])).toBe('min');
    expect(nearestRangeThumb(55, [20, 60])).toBe('max');
  });

  it('breaks a tie between collapsed thumbs by direction, so the range can reopen either way', () => {
    expect(nearestRangeThumb(10, [40, 40])).toBe('min');
    expect(nearestRangeThumb(80, [40, 40])).toBe('max');
  });
});

describe('rangeKeyTransition', () => {
  it('steps by the step and by the large step', () => {
    expect(rangeKeyTransition('ArrowRight', false, 'min', [20, 60], UNITS)).toBe(21);
    expect(rangeKeyTransition('ArrowUp', false, 'min', [20, 60], UNITS)).toBe(21);
    expect(rangeKeyTransition('ArrowLeft', false, 'min', [20, 60], UNITS)).toBe(19);
    expect(rangeKeyTransition('ArrowDown', false, 'min', [20, 60], UNITS)).toBe(19);
    expect(rangeKeyTransition('ArrowRight', true, 'min', [20, 60], UNITS)).toBe(30);
    expect(rangeKeyTransition('ArrowDown', true, 'min', [20, 60], UNITS)).toBe(10);
    expect(rangeKeyTransition('PageUp', false, 'min', [20, 60], UNITS)).toBe(30);
    expect(rangeKeyTransition('PageDown', false, 'min', [20, 60], UNITS)).toBe(10);
  });

  it('sends Home and End to the focused thumb own limits', () => {
    expect(rangeKeyTransition('Home', false, 'min', [20, 60], UNITS)).toBe(0);
    expect(rangeKeyTransition('End', false, 'min', [20, 60], UNITS)).toBe(60);
    expect(rangeKeyTransition('Home', false, 'max', [20, 60], UNITS)).toBe(20);
    expect(rangeKeyTransition('End', false, 'max', [20, 60], UNITS)).toBe(100);
  });

  it('clamps a stepped move against the other thumb and the bounds', () => {
    expect(rangeKeyTransition('PageUp', false, 'min', [55, 60], UNITS)).toBe(60);
    expect(rangeKeyTransition('PageDown', false, 'max', [20, 25], UNITS)).toBe(20);
    expect(rangeKeyTransition('PageDown', false, 'min', [5, 60], UNITS)).toBe(0);
    expect(rangeKeyTransition('PageUp', false, 'max', [20, 95], UNITS)).toBe(100);
  });

  it('does not drift over a long run on a fractional grid', () => {
    let value: [number, number] = [0, 10];
    for (let press = 0; press < 20; press += 1) {
      const next = rangeKeyTransition('ArrowRight', false, 'min', value, TENTHS);
      expect(next).not.toBeNull();
      value = [next as number, value[1]];
    }
    // 0.1 added twenty times is 1.9999999999999998 without the rounding.
    expect(value[0]).toBe(2);
    expect(String(value[0])).toBe('2');
  });

  it('owns no other key, so Tab and the letters stay with the browser', () => {
    expect(rangeKeyTransition('Tab', false, 'min', [20, 60], UNITS)).toBeNull();
    expect(rangeKeyTransition('Enter', false, 'min', [20, 60], UNITS)).toBeNull();
    expect(rangeKeyTransition('a', false, 'min', [20, 60], UNITS)).toBeNull();
  });
});
