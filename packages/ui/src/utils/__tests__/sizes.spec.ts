import { describe, expect, it } from 'vitest';
import { zoomSizes } from '../sizes';

describe('zoomSizes', () => {
  it.each([
    ['100vw', 'calc(100vw * 3)'],
    ['400px', 'calc(400px * 3)'],
    ['(min-width: 1024px) 50vw, 100vw', '(min-width: 1024px) calc(50vw * 3), calc(100vw * 3)'],
    [
      '(min-width: 1280px) 320px, (min-width: 1024px) 25vw, 50vw',
      '(min-width: 1280px) calc(320px * 3), (min-width: 1024px) calc(25vw * 3), calc(50vw * 3)',
    ],
    [
      '(min-width: 768px) calc(50vw - 2rem), calc(100vw - 1rem)',
      '(min-width: 768px) calc(calc(50vw - 2rem) * 3), calc(calc(100vw - 1rem) * 3)',
    ],
    ['min(100vw, 1200px)', 'calc(min(100vw, 1200px) * 3)'],
    [
      '(min-width: 640px) and (max-width: 1023px) 50vw, 100vw',
      '(min-width: 640px) and (max-width: 1023px) calc(50vw * 3), calc(100vw * 3)',
    ],
  ])('scales %s', (sizes, expected) => {
    expect(zoomSizes(sizes, 3)).toBe(expected);
  });

  it('writes a fractional zoom as given', () => {
    expect(zoomSizes('(max-width: 639px) 178vw, 100vw', 1.6)).toBe(
      '(max-width: 639px) calc(178vw * 1.6), calc(100vw * 1.6)'
    );
  });

  it('normalises the whitespace around entries', () => {
    expect(zoomSizes('  (min-width: 1024px)   50vw ,100vw ', 2)).toBe(
      '(min-width: 1024px)   calc(50vw * 2), calc(100vw * 2)'
    );
  });

  it('leaves auto, a zero and a condition with no size alone', () => {
    expect(zoomSizes('auto, 100vw', 3)).toBe('auto, calc(100vw * 3)');
    expect(zoomSizes('(max-width: 0px) 0, 100vw', 3)).toBe('(max-width: 0px) 0, calc(100vw * 3)');
    expect(zoomSizes('(min-width: 1024px), 100vw', 3)).toBe('(min-width: 1024px), calc(100vw * 3)');
  });

  it.each([1, 0.5, 0, -2, Number.NaN, Number.POSITIVE_INFINITY])(
    'returns the list untouched at zoom %s',
    (zoom) => {
      const sizes = '(min-width: 1024px) 50vw, 100vw';
      expect(zoomSizes(sizes, zoom)).toBe(sizes);
    }
  );
});
