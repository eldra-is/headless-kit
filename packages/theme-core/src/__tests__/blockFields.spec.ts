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
    {
      fieldId: 'items',
      type: 'list',
      metadata: {
        item: {
          type: 'composite',
          metadata: {
            fields: [
              { fieldId: 'title', type: 'string' },
              { fieldId: 'variant', type: 'select' },
            ],
          },
        },
      },
    },
    // Two string sub-fields literally named "value"/"label" — the same
    // shape web-studio-core's resolveSelectLabels produces for a real
    // select, but declared here as an ordinary composite, not a select.
    {
      fieldId: 'metric',
      type: 'composite',
      metadata: {
        fields: [
          { fieldId: 'value', type: 'string' },
          { fieldId: 'label', type: 'string' },
        ],
      },
    },
    {
      fieldId: 'tags',
      type: 'list',
      metadata: { item: { type: 'select' } },
    },
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

  it('resolves a select field nested inside a list item, skipping the array index segment', () => {
    registerBlockFields(FIELDS);
    expect(isBlockFieldSelect('cta', 'items.0.variant')).toBe(true);
    expect(isBlockFieldSelect('cta', 'items.3.variant')).toBe(true);
    expect(isBlockFieldSelect('cta', 'items.0.title')).toBe(false);
  });

  it('resolves a list whose item is itself a select (not composite-wrapped)', () => {
    registerBlockFields(FIELDS);
    expect(isBlockFieldSelect('cta', 'tags.0')).toBe(true);
  });

  it('is false for a composite whose sub-fields are literally "value"/"label" — that shape alone is not a select', () => {
    registerBlockFields(FIELDS);
    expect(isBlockFieldSelect('cta', 'metric')).toBe(false);
    expect(isBlockFieldSelect('cta', 'metric.value')).toBe(false);
  });

  it('is false for a path that does not resolve (unknown nested field, or descending through a non-list/composite field)', () => {
    registerBlockFields(FIELDS);
    expect(isBlockFieldSelect('cta', 'items.0.missing')).toBe(false);
    expect(isBlockFieldSelect('cta', 'variant.nested')).toBe(false);
  });
});
