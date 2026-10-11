import { afterEach, describe, expect, it } from 'vitest';
import { registerBlockFields } from '@eldrajs/theme-core';
import { useEldraBlockField } from '../useEldraBlockField';

const FIELDS = {
  article: [
    { fieldId: 'title', type: 'string', localized: true },
    { fieldId: 'body', type: 'rich-text' },
  ],
};

afterEach(() => {
  registerBlockFields({});
});

/**
 * The registry and the lookup live in `@eldrajs/theme-core` (see its
 * blockFields suite) so every framework binding shares one implementation.
 * All this wrapper owes is the composable-shaped return.
 */
describe('useEldraBlockField', () => {
  it('returns the manifest localized flag, and nothing else', () => {
    registerBlockFields(FIELDS);

    expect(useEldraBlockField('article', 'title')).toEqual({ localized: true });
    expect(useEldraBlockField('article', 'body')).toEqual({ localized: false });
  });

  it('is safe without an apiId and outside a themed build', () => {
    expect(useEldraBlockField(undefined, 'title')).toEqual({ localized: false });
    expect(useEldraBlockField('ghost', 'title')).toEqual({ localized: false });
  });

  it('needs no Vue context: a block rendered in isolation must not warn', () => {
    registerBlockFields(FIELDS);
    // Called entirely outside setup(); the old implementation reached for an
    // injected preview context here purely to gate a toolbar warning.
    expect(() => useEldraBlockField('article', 'title')).not.toThrow();
  });
});
