import { afterEach, describe, expect, it } from 'vitest';
import { isBlockFieldLocalized, isBlockFieldSelect, registerBlockFields } from '../blockFields';
import {
  blockApiIdOf,
  getRegisteredThemeId,
  registerThemeId,
  registeredBlockApiId,
  themeSchemaApiId,
} from '../themeId';

afterEach(() => {
  registerBlockFields({});
  registerThemeId(undefined);
});

describe('blockApiIdOf (wire to bare)', () => {
  it('strips the prefix of the given theme', () => {
    expect(blockApiIdOf('soley:hero', 'soley')).toBe('hero');
  });

  it('leaves a bare id untouched', () => {
    expect(blockApiIdOf('hero', 'soley')).toBe('hero');
  });

  it('strips only its own theme id, never another prefix', () => {
    expect(blockApiIdOf('starter:hero', 'soley')).toBe('starter:hero');
    expect(blockApiIdOf('catalog:product', 'soley')).toBe('catalog:product');
  });

  it('does not strip a prefix that merely starts with the theme id', () => {
    expect(blockApiIdOf('soley-extra:hero', 'soley')).toBe('soley-extra:hero');
  });

  it('is a no-op without a theme id, and never returns an empty id', () => {
    expect(blockApiIdOf('soley:hero', undefined)).toBe('soley:hero');
    expect(blockApiIdOf('soley:hero', '')).toBe('soley:hero');
    expect(blockApiIdOf('soley:', 'soley')).toBe('soley:');
  });
});

describe('themeSchemaApiId (bare to wire)', () => {
  it('prefixes a bare id', () => {
    expect(themeSchemaApiId('hero', 'soley')).toBe('soley:hero');
  });

  it('is idempotent and leaves catalog targets alone', () => {
    expect(themeSchemaApiId('soley:hero', 'soley')).toBe('soley:hero');
    expect(themeSchemaApiId('catalog:product', 'soley')).toBe('catalog:product');
  });

  it('round-trips with blockApiIdOf', () => {
    expect(blockApiIdOf(themeSchemaApiId('hero', 'soley'), 'soley')).toBe('hero');
  });
});

describe('registered theme id', () => {
  it('is set by registerBlockFields and drives the block field lookups with a wire id', () => {
    registerBlockFields(
      {
        hero: [
          { fieldId: 'title', type: 'string', localized: true },
          { fieldId: 'variant', type: 'select' },
        ],
      },
      'soley'
    );
    expect(getRegisteredThemeId()).toBe('soley');
    expect(registeredBlockApiId('soley:hero')).toBe('hero');
    expect(isBlockFieldLocalized('soley:hero', 'title')).toBe(true);
    expect(isBlockFieldSelect('soley:hero', 'variant')).toBe(true);
    // The bare spelling keeps working (overlay, drafts the editor sent bare).
    expect(isBlockFieldSelect('hero', 'variant')).toBe(true);
    // Another theme's block is not this theme's.
    expect(isBlockFieldSelect('starter:hero', 'variant')).toBe(false);
  });

  it('does nothing before a theme id is registered', () => {
    registerBlockFields({ hero: [{ fieldId: 'variant', type: 'select' }] });
    expect(isBlockFieldSelect('soley:hero', 'variant')).toBe(false);
  });
});
