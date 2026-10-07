import { describe, expect, it } from 'vitest';
import { SWATCH_INK_LUMINANCE_THRESHOLD, swatchInk, swatchLuminance } from '../swatchInk';

/**
 * The design spec's "Filter panel" → Variants names the whole palette and the answer for each
 * colour, which makes this the rare rule with a published expected output. Both halves are
 * checked: the luminance itself (so the boundary can be asserted on either side of 0.35, which is
 * what makes the threshold mutation-proof) and the ink the rule picks from it.
 */

/** The spec's Northwind palette, verbatim. */
const NORTHWIND = {
  black: '#1f1d1b',
  brown: '#7a5236',
  natural: '#dccfb8',
  white: '#f7f5f0',
  charcoal: '#3d3c3b',
  clay: '#b0603f',
  moss: '#5f6b47',
  navy: '#27324a',
  multi:
    'conic-gradient(#b0603f 0deg 90deg, #5f6b47 90deg 180deg, #27324a 180deg 270deg, #dccfb8 270deg 360deg)',
} as const;

describe('swatchInk — the spec’s own palette', () => {
  it.each([
    ['natural', NORTHWIND.natural],
    ['white', NORTHWIND.white],
  ])('%s takes the dark text check', (_name, colour) => {
    expect(swatchInk(colour)).toBe('text');
  });

  it.each([
    ['black', NORTHWIND.black],
    ['brown', NORTHWIND.brown],
    ['charcoal', NORTHWIND.charcoal],
    ['clay', NORTHWIND.clay],
    ['moss', NORTHWIND.moss],
    ['navy', NORTHWIND.navy],
  ])('%s takes the white focus-inner check', (_name, colour) => {
    expect(swatchInk(colour)).toBe('focus-inner');
  });

  /** Spec → Variants: "Gradients and patterns count as dark and get the `focus-inner` check." */
  it('counts the Multi conic gradient as dark', () => {
    expect(swatchLuminance(NORTHWIND.multi)).toBeNull();
    expect(swatchInk(NORTHWIND.multi)).toBe('focus-inner');
  });

  it.each([
    ['a linear gradient', 'linear-gradient(90deg, #fff, #000)'],
    ['a repeating gradient', 'repeating-linear-gradient(45deg, #fff 0 2px, #000 2px 4px)'],
    ['a radial gradient', 'radial-gradient(#ffffff, #f7f5f0)'],
    ['an image pattern', 'url(/patterns/houndstooth.png)'],
    ['an image() pattern', 'image(/patterns/tweed.png)'],
    ['a paint worklet', 'paint(checkerboard)'],
  ])('%s counts as dark however pale its own colours are', (_name, paint) => {
    expect(swatchInk(paint)).toBe('focus-inner');
  });
});

describe('swatchInk — the 0.35 boundary', () => {
  /**
   * The threshold is strictly "above", so a swatch sitting exactly on it takes the white check.
   * These two greys are picked so their luminances fall either side of 0.35 by a hair — which is
   * what turns a changed constant, or a `>=` where the spec says `>`, red.
   */
  it('is above, not at: a swatch just under 0.35 keeps the white check', () => {
    // #9c9c9c: luminance ~0.3250.
    const luminance = swatchLuminance('#9c9c9c');
    expect(luminance).not.toBeNull();
    expect(luminance!).toBeLessThan(SWATCH_INK_LUMINANCE_THRESHOLD);
    expect(swatchInk('#9c9c9c')).toBe('focus-inner');
  });

  it('a swatch just over 0.35 takes the dark check', () => {
    // #a3a3a3: luminance ~0.3564.
    const luminance = swatchLuminance('#a3a3a3');
    expect(luminance).not.toBeNull();
    expect(luminance!).toBeGreaterThan(SWATCH_INK_LUMINANCE_THRESHOLD);
    expect(swatchInk('#a3a3a3')).toBe('text');
  });

  /** The two extremes, as a sanity anchor on the linearisation itself. */
  it('reads black as 0 and white as 1', () => {
    expect(swatchLuminance('#000000')).toBeCloseTo(0, 6);
    expect(swatchLuminance('#ffffff')).toBeCloseTo(1, 6);
  });

  /**
   * The channel weights are the spec's, and they are not equal: pure green is far brighter than
   * pure blue at the same channel value. A naive average would read both as the same grey.
   */
  it('weights the channels 0.2126 / 0.7152 / 0.0722', () => {
    expect(swatchLuminance('#ff0000')).toBeCloseTo(0.2126, 4);
    expect(swatchLuminance('#00ff00')).toBeCloseTo(0.7152, 4);
    expect(swatchLuminance('#0000ff')).toBeCloseTo(0.0722, 4);
    // Which is why green takes the dark check and blue does not, at the same full channel.
    expect(swatchInk('#00ff00')).toBe('text');
    expect(swatchInk('#0000ff')).toBe('focus-inner');
  });
});

describe('swatchLuminance — the notations product data arrives in', () => {
  it('reads a three-digit hex as the doubled six-digit one', () => {
    expect(swatchLuminance('#fff')).toBe(swatchLuminance('#ffffff'));
    expect(swatchLuminance('#abc')).toBe(swatchLuminance('#aabbcc'));
  });

  it('ignores the alpha of a four- or eight-digit hex', () => {
    expect(swatchLuminance('#ffff')).toBe(swatchLuminance('#ffffff'));
    expect(swatchLuminance('#f7f5f080')).toBe(swatchLuminance('#f7f5f0'));
  });

  it('is case-insensitive about hex digits', () => {
    expect(swatchLuminance('#DCCFB8')).toBe(swatchLuminance('#dccfb8'));
  });

  it.each([
    ['legacy rgb', 'rgb(220, 207, 184)'],
    ['legacy rgba', 'rgba(220, 207, 184, 0.5)'],
    ['modern rgb', 'rgb(220 207 184)'],
    ['modern rgb with a slashed alpha', 'rgb(220 207 184 / 50%)'],
    ['percentage channels', 'rgb(86.27%, 81.18%, 72.16%)'],
  ])('reads %s', (_name, colour) => {
    expect(swatchLuminance(colour)).toBeCloseTo(swatchLuminance('#dccfb8')!, 3);
    expect(swatchInk(colour)).toBe('text');
  });

  it.each([
    ['hsl', 'hsl(39, 33%, 79%)'],
    ['hsl with units and a slashed alpha', 'hsl(39deg 33% 79% / 0.5)'],
    ['hsla', 'hsla(39, 33%, 79%, 1)'],
  ])('reads %s', (_name, colour) => {
    expect(swatchInk(colour)).toBe('text');
  });

  it('clamps channels outside the range rather than reading them as a non-colour', () => {
    expect(swatchLuminance('rgb(300, 300, 300)')).toBeCloseTo(1, 6);
    expect(swatchLuminance('rgb(-20, -20, -20)')).toBeCloseTo(0, 6);
  });

  it('turns the hue of an hsl past 360° back into the circle', () => {
    expect(swatchLuminance('hsl(400, 50%, 50%)')).toBe(swatchLuminance('hsl(40, 50%, 50%)'));
    expect(swatchLuminance('hsl(-320, 50%, 50%)')).toBe(swatchLuminance('hsl(40, 50%, 50%)'));
  });

  it('reads a zero-saturation hsl as the grey its lightness names', () => {
    expect(swatchLuminance('hsl(0, 0%, 100%)')).toBeCloseTo(1, 6);
    expect(swatchLuminance('hsl(0, 0%, 0%)')).toBeCloseTo(0, 6);
  });

  /**
   * Everything a pure module cannot resolve without the engine's own colour parser: a named
   * colour, a `color-mix()`, a custom property, a malformed value, or no swatch at all. `null`,
   * and therefore the white check — the safe side of the two, because a white check on a swatch
   * that turned out to be pale is still visible against its 1px `text` edge, while a dark check on
   * a black swatch is not visible at all.
   */
  it.each([
    ['a named colour', 'rebeccapurple'],
    ['white by name', 'white'],
    ['a color-mix', 'color-mix(in oklab, #fff, #000)'],
    ['a custom property', 'var(--eldra-color-primary)'],
    ['a malformed hex', '#12345'],
    ['nonsense', 'not a colour'],
    ['an empty string', ''],
    ['whitespace', '   '],
  ])('answers null for %s, and the white check', (_name, value) => {
    expect(swatchLuminance(value)).toBeNull();
    expect(swatchInk(value)).toBe('focus-inner');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('answers null for %s, and the white check', (_name, value) => {
    expect(swatchLuminance(value)).toBeNull();
    expect(swatchInk(value)).toBe('focus-inner');
  });

  it('trims surrounding whitespace rather than refusing the value', () => {
    expect(swatchLuminance('  #ffffff  ')).toBeCloseTo(1, 6);
  });
});
