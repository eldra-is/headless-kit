import { describe, expect, it } from 'vitest';
import { validateField } from '../blocks/form/validate';
import type { StorefrontFormField } from '../app/storefront/types';

const t = (key: string): string => key;
const text = (validation: StorefrontFormField['validation']): StorefrontFormField => ({
  id: 'code',
  type: 'text',
  required: false,
  label: 'Code',
  validation,
});

describe('validateField', () => {
  it('matches a pattern against the whole value, as the platform does', () => {
    const field = text({ pattern: '[0-9]{3}' });
    expect(validateField(field, '123', t)).toBeNull();
    expect(validateField(field, 'abc123def', t)).toBe('form.invalidFormat');
    expect(validateField(field, '1234', t)).toBe('form.invalidFormat');
  });

  it('keeps an alternation inside the whole-value match', () => {
    const field = text({ pattern: 'ab|cd' });
    expect(validateField(field, 'cd', t)).toBeNull();
    expect(validateField(field, 'abcd', t)).toBe('form.invalidFormat');
  });

  it('accepts only a finite number in a number field', () => {
    const field: StorefrontFormField = { id: 'qty', type: 'number', required: true, label: 'Qty' };
    for (const ok of ['12', '-3.5', '.5', '1e3', '3,5']) {
      expect(validateField(field, ok, t)).toBeNull();
    }
    for (const bad of ['abc', '1,2,3', '1e999', '12px']) {
      expect(validateField(field, bad, t)).toBe('form.invalidNumber');
    }
  });

  it('accepts only an absolute http(s) address in a url field', () => {
    const field: StorefrontFormField = { id: 'site', type: 'url', required: false, label: 'Site' };
    expect(validateField(field, 'https://example.com/a?b=1', t)).toBeNull();
    expect(validateField(field, '', t)).toBeNull();
    for (const bad of ['example.com', 'javascript:alert(1)', 'ftp://x.test']) {
      expect(validateField(field, bad, t)).toBe('form.invalidUrl');
    }
  });
});
