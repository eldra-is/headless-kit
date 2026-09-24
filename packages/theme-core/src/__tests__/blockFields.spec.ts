import { afterEach, describe, expect, it } from 'vitest';
import { isBlockFieldLocalized, isBlockFieldSelect, registerBlockFields } from '../blockFields';

const FIELDS = {
  article: [
    { fieldId: 'title', type: 'string', localized: true },
    { fieldId: 'body', type: 'rich-text' },
    { fieldId: 'notes', type: 'rich-text', metadata: { toolbar: ['bold'] } },
  ],
  cta: [
    { fieldId: 'variant', type: 'select' },
    { fieldId: 'heading', type: 'string' },
  ],
};

afterEach(() => {
  registerBlockFields({});
});

describe('isBlockFieldLocalized', () => {
  it('reads the manifest flag for a known field', () => {
    registerBlockFields(FIELDS);
    expect(isBlockFieldLocalized('article', 'title')).toBe(true);
    expect(isBlockFieldLocalized('article', 'body')).toBe(false);
  });

  it('is false without an apiId, for an unknown block, and for an unknown field', () => {
    registerBlockFields(FIELDS);
    expect(isBlockFieldLocalized(undefined, 'title')).toBe(false);
    expect(isBlockFieldLocalized('ghost', 'title')).toBe(false);
    expect(isBlockFieldLocalized('article', 'missing')).toBe(false);
  });

  it('is false outside a themed build, where registerBlockFields is never called', () => {
    expect(isBlockFieldLocalized('article', 'title')).toBe(false);
  });

  it('replaces the registered map on every call (the plugin re-registers on HMR rescan)', () => {
    registerBlockFields(FIELDS);
    registerBlockFields({ article: [{ fieldId: 'title', type: 'string' }] });
    expect(isBlockFieldLocalized('article', 'title')).toBe(false);
  });
});

describe('isBlockFieldSelect', () => {
  it('reads the manifest type for a known field', () => {
    registerBlockFields(FIELDS);
    expect(isBlockFieldSelect('cta', 'variant')).toBe(true);
    expect(isBlockFieldSelect('cta', 'heading')).toBe(false);
  });

  it('is false without an apiId, for an unknown block, and for an unknown field', () => {
    registerBlockFields(FIELDS);
    expect(isBlockFieldSelect(undefined, 'variant')).toBe(false);
    expect(isBlockFieldSelect('ghost', 'variant')).toBe(false);
    expect(isBlockFieldSelect('cta', 'missing')).toBe(false);
  });

  it('is false outside a themed build, where registerBlockFields is never called', () => {
    expect(isBlockFieldSelect('cta', 'variant')).toBe(false);
  });
});
