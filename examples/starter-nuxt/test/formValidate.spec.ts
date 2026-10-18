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
});
