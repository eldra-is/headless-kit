import { describe, expect, it } from 'vitest';
import { isChunkError, shouldReload } from '../app/utils/chunkReload';

describe('chunk reload', () => {
  it('recognises the browsers’ messages for a chunk that is gone', () => {
    expect(
      isChunkError(
        new TypeError('Failed to fetch dynamically imported module: https://x/_nuxt/a.js')
      )
    ).toBe(true);
    expect(isChunkError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('reloads once, then not again within the window', () => {
    expect(shouldReload(1_000, null)).toBe(true);
    expect(shouldReload(10_000, 1_000)).toBe(false);
    expect(shouldReload(40_000, 1_000)).toBe(true);
  });
});
