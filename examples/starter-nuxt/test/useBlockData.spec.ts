// `useBlockData.ts` imports `useEldraBlockField` from `@eldrajs/theme-vue`,
// whose single index entry also re-exports `EldraBlockZone`, which pulls in
// a `virtual:eldra/blocks` module supplied only by the Nuxt build's vite
// plugin (see test/framing.spec.ts and test/richText.spec.ts for the same
// underlying issue). Re-export the real `useEldraBlockField` straight from
// its source file instead (its own dependency chain never touches the
// virtual module), so the assertions below still exercise the genuine
// composable, not a stub.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBlockFields } from '@eldrajs/theme-core';

vi.mock('@eldrajs/theme-vue', async () => {
  const { useEldraBlockField } = await import('../../../packages/theme-vue/src/useEldraBlockField');
  return { useEldraBlockField };
});

const { useBlockData } = await import('../app/composables/useBlockData');

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
