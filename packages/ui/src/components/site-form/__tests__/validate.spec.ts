import { describe, expect, it } from 'vitest';
import { enUS } from '../../../messages/en-US';
import type { SiteFormField } from '../types';
import { normalizeSiteFormText, validateSiteFormValue } from '../validate';

const field = (overrides: Partial<SiteFormField> = {}): SiteFormField => ({
  id: 'answer',
  type: 'text',
  required: false,
  label: 'Answer',
  ...overrides,
});

const check = (f: SiteFormField, value: string | boolean | undefined) =>
  validateSiteFormValue(f, value, enUS);

describe('normalizeSiteFormText', () => {
  it('drops control characters, collapses spaces and trims like the platform', () => {
    expect(normalizeSiteFormText({ type: 'text' }, '  Anna\u0007   Jóns \t dóttir ')).toBe(
      'Anna Jóns dóttir'
    );
  });

  it('collapses the spaces Go collapses, not the ones JavaScript’s \\s adds', () => {
    expect(normalizeSiteFormText({ type: 'text' }, 'a\u0085b')).toBe('a b');
    expect(normalizeSiteFormText({ type: 'text' }, 'a\ufeffb')).toBe('a\ufeffb');
  });

  it('keeps a textarea’s line breaks and inner spacing', () => {
    expect(normalizeSiteFormText({ type: 'textarea' }, '  line one\n\n  line two  ')).toBe(
      'line one\n\n  line two'
    );
  });
});

describe('validateSiteFormValue', () => {
  it('requires a required field and lets an empty optional one through', () => {
    expect(check(field({ required: true }), '   ')).toBe(enUS.formRequired);
    expect(check(field({ required: false, type: 'email' }), '')).toBeNull();
  });

  it('requires a required checkbox or consent to be ticked', () => {
    expect(check(field({ type: 'consent', required: true }), false)).toBe(
      enUS.formRequiredCheckbox
    );
    expect(check(field({ type: 'checkbox', required: true }), true)).toBeNull();
    expect(check(field({ type: 'checkbox', required: false }), false)).toBeNull();
  });

  it('applies the platform’s length ceiling per type, lowered by maxLength', () => {
    expect(check(field({ type: 'phone' }), '1'.repeat(51))).toBe(enUS.formTooLong(50));
    expect(check(field({ type: 'text' }), 'a'.repeat(501))).toBe(enUS.formTooLong(500));
    expect(check(field({ type: 'textarea' }), 'a'.repeat(8000))).toBeNull();
    expect(check(field({ validation: { maxLength: 3 } }), 'abcd')).toBe(enUS.formTooLong(3));
    expect(check(field({ type: 'phone', validation: { maxLength: 900 } }), '1'.repeat(51))).toBe(
      enUS.formTooLong(50)
    );
  });

  it('counts characters, not UTF-16 units', () => {
    expect(check(field({ validation: { maxLength: 3 } }), 'þ😀ð')).toBeNull();
    expect(check(field({ validation: { minLength: 3 } }), '😀😀')).toBe(enUS.formTooShort(3));
  });

  it('checks the length ceiling before the shape, as the platform does', () => {
    expect(check(field({ type: 'email', validation: { maxLength: 5 } }), 'not-an-email')).toBe(
      enUS.formTooLong(5)
    );
  });

  it('checks the shape before minLength and the pattern', () => {
    expect(check(field({ type: 'email', validation: { minLength: 50 } }), 'nope')).toBe(
      enUS.formInvalidEmail
    );
  });

  it('accepts an email address and refuses a malformed one', () => {
    const email = field({ type: 'email' });
    expect(check(email, 'anna@example.is')).toBeNull();
    for (const bad of ['anna', 'anna@example', 'anna @example.is', 'a<b>@example.is']) {
      expect(check(email, bad), bad).toBe(enUS.formInvalidEmail);
    }
  });

  it('accepts a number written with a decimal comma or point', () => {
    const number = field({ type: 'number' });
    for (const good of ['12', '3,5', '-0.25', '1e3', '.5']) expect(check(number, good)).toBeNull();
    for (const bad of ['twelve', '1,2,3', '1e999']) {
      expect(check(number, bad), bad).toBe(enUS.formInvalidNumber);
    }
  });

  it('accepts only an absolute http(s) address for a url field', () => {
    const url = field({ type: 'url' });
    expect(check(url, 'https://eldra.is/verd')).toBeNull();
    for (const bad of ['eldra.is', 'ftp://eldra.is', 'javascript:alert(1)']) {
      expect(check(url, bad), bad).toBe(enUS.formInvalidUrl);
    }
  });

  it('accepts only one of a select’s options', () => {
    const select = field({
      type: 'select',
      options: [
        { value: 'small', label: 'Small' },
        { value: 'large', label: 'Large' },
      ],
    });
    expect(check(select, 'large')).toBeNull();
    expect(check(select, 'medium')).toBe(enUS.formInvalidOption);
  });

  it('matches the pattern against the whole value', () => {
    const kennitala = field({ validation: { pattern: '\\d{6}-?\\d{4}' } });
    expect(check(kennitala, '010190-2939')).toBeNull();
    expect(check(kennitala, 'x010190-2939')).toBe(enUS.formInvalidFormat);
    expect(check(kennitala, '010190-29391')).toBe(enUS.formInvalidFormat);
  });

  it('matches the pattern against the value the platform matches: an email lowercased, a decimal point', () => {
    expect(
      check(field({ type: 'email', validation: { pattern: '.+@eldra\\.is' } }), 'bjorn@Eldra.is')
    ).toBeNull();
    expect(
      check(
        field({ type: 'email', validation: { pattern: '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}' } }),
        'Anna@Example.is'
      )
    ).toBeNull();
    expect(
      check(field({ type: 'number', validation: { pattern: '\\d+(\\.\\d)?' } }), '3,5')
    ).toBeNull();
    expect(check(field({ type: 'number', validation: { pattern: '\\d+' } }), '3,5')).toBe(
      enUS.formInvalidFormat
    );
  });

  it('leaves the pattern to the platform when the engines would read the value differently', () => {
    expect(check(field({ validation: { pattern: '\\S+' } }), 'abc\ufeffdef')).toBeNull();
  });

  it('leaves a pattern this engine cannot compile to the platform', () => {
    expect(check(field({ validation: { pattern: '(?P<x>a' } }), 'b')).toBeNull();
  });

  it('never refuses a value with RE2 syntax a JavaScript pattern would read another way', () => {
    expect(check(field({ validation: { pattern: '\\pL+' } }), 'Anna')).toBeNull();
    expect(check(field({ validation: { pattern: '\\A[0-9]+\\z' } }), '42')).toBeNull();
    expect(check(field({ validation: { pattern: '[[:alpha:]]+' } }), 'Anna')).toBeNull();
  });
});
