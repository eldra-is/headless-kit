// `useBlockData.ts` imports `useEldraBlockField` from `@eldrajs/theme-vue`;
// its single index entry also re-exports `EldraBlockZone`/`EldraLayout`,
// which import `virtual:eldra/blocks`/`virtual:eldra/manifest`/
// `virtual:eldra/breakpoints` at the top level, normally supplied only by
// the Nuxt build's vite plugin. `vitest.config.ts` aliases all three to
// mocks under `test/mocks/`, so the package resolves for real here — no
// mocking needed.
import { beforeEach, describe, expect, it } from 'vitest';
import { registerBlockFields } from '@eldrajs/theme-core';
import { useBlockData } from '../app/composables/useBlockData';

const entry: EldraBlockEntry<'hero'> = {
  id: 'hero-1',
  data: { heading: 'Warm layers for cold mornings', align: 'left' },
};

describe('useBlockData', () => {
  beforeEach(() => {
    // Block field metadata is a module-level registry (theme-core's
    // registerBlockFields) — reset it so a test that registers a block
    // never leaks into the next one.
    registerBlockFields({});
  });

  it('exposes the typed data and the entry id', () => {
    const { data, entryId } = useBlockData({ entry }, 'hero');
    expect(data.value).toBe(entry.data);
    expect(data.value.heading).toBe('Warm layers for cold mornings');
    expect(data.value.align).toBe('left');
    expect(entryId).toBe('hero-1');
  });

  it('field() wraps useEldraBlockField, threading the block apiId through', () => {
    registerBlockFields({
      hero: [{ fieldId: 'heading', type: 'string', localized: true }],
    });
    const { field } = useBlockData({ entry }, 'hero');
    expect(field('heading')).toEqual({ localized: true });
    expect(field('align')).toEqual({ localized: false });
  });

  it('field() resolves localized: false for a block with no registered fields', () => {
    const { field } = useBlockData({ entry }, 'hero');
    expect(field('heading')).toEqual({ localized: false });
  });
});
