import { describe, expect, it } from 'vitest';
import { frameAspectRatio } from '../ratio';
import type { ImageRatio } from '../../components/image/types';

describe('frameAspectRatio', () => {
  it.each([
    ['1x1', '1 / 1'],
    ['4x3', '4 / 3'],
    ['3x2', '3 / 2'],
    ['16x9', '16 / 9'],
    ['3x4', '3 / 4'],
    ['4x5', '4 / 5'],
  ] as Array<[ImageRatio, string]>)('%s -> %s, regardless of media', (ratio, expected) => {
    expect(frameAspectRatio(ratio, null)).toBe(expected);
    expect(frameAspectRatio(ratio, { width: 100, height: 50 })).toBe(expected);
  });

  it('"auto" with no media falls back to 4:3', () => {
    expect(frameAspectRatio('auto', null)).toBe('4 / 3');
    expect(frameAspectRatio('auto', undefined)).toBe('4 / 3');
  });

  it('"auto" with media carrying width/height uses the intrinsic ratio', () => {
    expect(frameAspectRatio('auto', { width: 1600, height: 900 })).toBe('1600 / 900');
  });

  it('"auto" with media but no width/height leaves the browser to size it', () => {
    expect(frameAspectRatio('auto', {})).toBe('auto');
    expect(frameAspectRatio('auto', { width: 100 })).toBe('auto');
    expect(frameAspectRatio('auto', { height: 100 })).toBe('auto');
  });
});
