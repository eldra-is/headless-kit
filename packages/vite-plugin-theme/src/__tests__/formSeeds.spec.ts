import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateFormSeeds } from '../formSeeds';
import { scanTheme } from '../scan';
import type { DeclaredFormSeed } from '../types';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

const contactSeed = (): DeclaredFormSeed => ({
  key: 'contact',
  name: 'Contact',
  fields: [
    { id: 'name', type: 'text', required: true, label: { 'en-US': 'Name', 'is-IS': 'Nafn' } },
    { id: 'email', type: 'email', required: true, label: { 'en-US': 'Email' } },
    {
      id: 'topic',
      type: 'select',
      required: false,
      label: { 'en-US': 'Topic' },
      options: [{ value: 'order', label: { 'en-US': 'An order' } }],
    },
    {
      id: 'message',
      type: 'textarea',
      required: true,
      label: { 'en-US': 'Message' },
      validation: { minLength: 5, maxLength: 2000 },
    },
  ],
  actions: { notify: true, confirm: true },
  success: { message: { 'en-US': 'Thanks, we reply within a day.' } },
});

const validate = (seeds: unknown) => {
  const errors: string[] = [];
  const normalized = validateFormSeeds(seeds as DeclaredFormSeed[], errors);
  return { normalized, errors };
};

describe('validateFormSeeds', () => {
  it('accepts a whole seed and returns it unchanged', () => {
    const { normalized, errors } = validate([contactSeed()]);

    expect(errors).toEqual([]);
    expect(normalized).toEqual([contactSeed()]);
  });

  it('accepts phone and consent fields (a quote request) and refuses the old `tel`', () => {
    const quote = (type: string): unknown[] => [
      {
        ...contactSeed(),
        key: 'quote',
        actions: { notify: true, confirm: false },
        fields: [
          { id: 'phone', type, required: true, label: { 'en-US': 'Phone' } },
          { id: 'agree', type: 'consent', required: true, label: { 'en-US': 'I agree' } },
        ],
      },
    ];
    expect(validate(quote('phone')).errors).toEqual([]);
    expect(validate(quote('tel')).errors.join('\n')).toContain('.type');
  });

  it('accepts a subscribe form with a list', () => {
    const seed = {
      ...contactSeed(),
      key: 'newsletter',
      fields: [contactSeed().fields[1]],
      actions: { notify: false, confirm: false, subscribe: { list: 'newsletter' } },
    };

    expect(validate([seed]).errors).toEqual([]);
  });

  it('means "none" for no seeds', () => {
    expect(validate(undefined)).toEqual({ normalized: [], errors: [] });
    expect(validate([])).toEqual({ normalized: [], errors: [] });
  });

  it.each([
    ['an uppercase key', { key: 'Contact' }, 'formSeeds[0].key'],
    ['the reserved key', { key: 'subscriptions' }, 'reserved'],
    ['a key that is too long', { key: `a${'b'.repeat(40)}` }, 'formSeeds[0].key'],
    ['a blank name', { name: '  ' }, 'formSeeds[0].name'],
    ['no fields', { fields: [] }, 'formSeeds[0].fields'],
    ['an unknown seed key', { extra: true }, 'formSeeds[0].extra — unknown key'],
    ['no success message', { success: {} }, 'success.message'],
    [
      'a success message with a bad locale tag',
      { success: { message: { 'not a tag': 'x' } } },
      'not a locale tag',
    ],
    [
      'an unknown action',
      { actions: { notify: true, confirm: false, push: true } },
      'actions.push',
    ],
    ['a non-boolean notify', { actions: { notify: 'yes', confirm: false } }, 'actions.notify'],
  ])('refuses %s', (_name, patch, message) => {
    const { errors } = validate([{ ...contactSeed(), ...patch }]);

    expect(errors.join('\n')).toContain(message);
  });

  it('refuses a duplicate key and a duplicate field id', () => {
    const twice = validate([contactSeed(), contactSeed()]);
    expect(twice.errors.join('\n')).toContain('duplicate key "contact"');

    const seed = contactSeed();
    seed.fields.push({ ...seed.fields[0]! });
    expect(validate([seed]).errors.join('\n')).toContain('duplicate id "name"');
  });

  describe('Core parity', () => {
    const withField = (field: Record<string, unknown>) => [
      {
        ...contactSeed(),
        actions: { notify: false, confirm: false },
        fields: [{ id: 'x', required: false, label: { 'en-US': 'X' }, ...field }],
      },
    ];
    it.each([
      ['a number field', { type: 'number' }, '.type'],
      ['a url field', { type: 'url' }, '.type'],
      ['the reserved id "all"', { type: 'text', id: 'All' }, 'reserved'],
      [
        'validation on a select',
        {
          type: 'select',
          options: [{ value: 'a', label: { 'en-US': 'A' } }],
          validation: { maxLength: 3 },
        },
        'takes no validation',
      ],
      [
        'validation on a consent',
        { type: 'consent', validation: { maxLength: 3 } },
        'no validation',
      ],
      ['a length above 8000', { type: 'text', validation: { maxLength: 8001 } }, '0..8000'],
      ['a lookahead', { type: 'text', validation: { pattern: '^(?=a)a' } }, 'lookaround'],
      ['a lookbehind', { type: 'text', validation: { pattern: '(?<!a)b' } }, 'lookaround'],
      ['a backreference', { type: 'text', validation: { pattern: '(a)\\1' } }, 'backreference'],
    ])('refuses %s', (_name, field, message) => {
      expect(validate(withField(field)).errors.join('\n')).toContain(message);
    });

    it('accepts RE2 syntax, including a class holding lookaround characters', () => {
      const field = { type: 'text', validation: { pattern: '[(?=\\d]+(?:ab|cd)\\d{2}' } };
      expect(validate(withField(field)).errors).toEqual([]);
    });

    it('compares field ids ignoring case', () => {
      const seed = contactSeed();
      seed.fields.push({ ...seed.fields[0]!, id: 'NAME' });
      expect(validate([seed]).errors.join('\n')).toContain('duplicate id "NAME"');
    });

    it('caps a list key at 40 characters', () => {
      const seed = {
        ...contactSeed(),
        actions: { notify: false, confirm: false, subscribe: { list: `a${'b'.repeat(40)}` } },
      };
      expect(validate([seed]).errors.join('\n')).toContain('subscribe.list');
    });

    it('requires a redirect to be a path or an http(s) URL', () => {
      const redirect = (target: string) => ({
        ...contactSeed(),
        success: { message: { 'en-US': 'ok' }, redirect: { 'en-US': target } },
      });
      expect(validate([redirect('/thanks')]).errors).toEqual([]);
      expect(validate([redirect('https://example.com/t')]).errors).toEqual([]);
      expect(validate([redirect('thanks')]).errors.join('\n')).toContain('success.redirect');
      expect(validate([redirect('javascript:alert(1)')]).errors.join('\n')).toContain(
        'success.redirect'
      );
    });
  });

  it('refuses more than eight seeds', () => {
    const seeds = Array.from({ length: 9 }, (_, index) => ({
      ...contactSeed(),
      key: `form-${index}`,
    }));

    expect(validate(seeds).errors.join('\n')).toContain('exceeds 8');
  });

  describe('fields', () => {
    const withField = (field: Record<string, unknown>) => ({
      ...contactSeed(),
      fields: [contactSeed().fields[1], field],
    });
    const field = (patch: Record<string, unknown>) => ({
      id: 'extra',
      type: 'text',
      required: false,
      label: { 'en-US': 'Extra' },
      ...patch,
    });

    it.each([
      ['an unknown type', { type: 'carrier-pigeon' }, '.type'],
      ['an id that is not an identifier', { id: '1st' }, '.id'],
      ['a missing required flag', { required: undefined }, '.required'],
      ['no label', { label: {} }, '.label'],
      ['an empty label text', { label: { 'en-US': ' ' } }, '.label.en-US'],
      [
        'options on a text field',
        { options: [{ value: 'a', label: { 'en-US': 'A' } }] },
        'only a select',
      ],
      ['a select with no options', { type: 'select' }, '1..50 options'],
      [
        'a select option with a duplicate value',
        {
          type: 'select',
          options: [
            { value: 'a', label: { 'en-US': 'A' } },
            { value: 'a', label: { 'en-US': 'B' } },
          ],
        },
        'duplicate value',
      ],
      [
        'a min length above the max',
        { validation: { minLength: 9, maxLength: 3 } },
        'minLength exceeds',
      ],
      [
        'a pattern that is not a regular expression',
        { validation: { pattern: '(' } },
        'not a valid regular expression',
      ],
      ['an unknown validation rule', { validation: { shape: 'x' } }, 'validation.shape'],
      ['an unknown field key', { hint: 'x' }, '.hint'],
    ])('refuses %s', (_name, patch, message) => {
      expect(validate([withField(field(patch))]).errors.join('\n')).toContain(message);
    });
  });

  describe('actions needing an email field', () => {
    const textOnly = (actions: Record<string, unknown>) => ({
      ...contactSeed(),
      fields: [contactSeed().fields[0]],
      actions,
    });

    it('refuses confirm without an email field', () => {
      expect(validate([textOnly({ notify: true, confirm: true })]).errors.join('\n')).toContain(
        'actions.confirm — needs an email field'
      );
    });

    it('refuses subscribe without an email field, and a bad list', () => {
      const errors = validate([
        textOnly({ notify: false, confirm: false, subscribe: { list: 'Bad List' } }),
      ]).errors.join('\n');

      expect(errors).toContain('actions.subscribe.list');
      expect(errors).toContain('actions.subscribe — needs an email field');
    });
  });
});

describe('scanTheme formSeeds', () => {
  it('writes the seeds into the manifest', () => {
    const { manifest, errors } = scanTheme({
      themeDir: fixture('valid-theme'),
      formSeeds: [contactSeed()],
    });

    expect(errors).toEqual([]);
    expect(manifest?.formSeeds).toEqual([contactSeed()]);
  });

  it('leaves the key out when the theme seeds no forms', () => {
    const { manifest } = scanTheme({ themeDir: fixture('valid-theme') });

    expect(manifest).not.toBeNull();
    expect(manifest && 'formSeeds' in manifest).toBe(false);
  });

  it('reports a bad seed as a scan error and writes no manifest', () => {
    const { manifest, errors } = scanTheme({
      themeDir: fixture('valid-theme'),
      formSeeds: [{ ...contactSeed(), key: 'Bad' }],
    });

    expect(manifest).toBeNull();
    expect(errors.join('\n')).toContain('formSeeds[0].key');
  });
});
