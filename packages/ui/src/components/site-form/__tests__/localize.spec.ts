import type { EldraFormDefinition } from '@eldrajs/sdk';
import { describe, expect, it } from 'vitest';
import { localizeSiteForm, pickLocalized, safeRedirect } from '../localize';

describe('pickLocalized', () => {
  const map = { 'en-US': 'Name', 'is-IS': 'Nafn' };

  it('takes the exact tag, then the same language, then the first tag', () => {
    expect(pickLocalized(map, 'is-IS')).toBe('Nafn');
    expect(pickLocalized(map, 'is')).toBe('Nafn');
    expect(pickLocalized({ 'en-GB': 'Name' }, 'en-US')).toBe('Name');
    expect(pickLocalized(map, 'pl-PL')).toBe('Name');
    expect(pickLocalized(undefined, 'is-IS')).toBe('');
  });
});

describe('safeRedirect', () => {
  it('keeps a site path or an http(s) address and drops anything else', () => {
    expect(safeRedirect('/takk')).toBe('/takk');
    expect(safeRedirect('https://eldra.is/takk')).toBe('https://eldra.is/takk');
    expect(safeRedirect('//evil.example')).toBeNull();
    expect(safeRedirect('/\\evil.example')).toBeNull();
    expect(safeRedirect('javascript:alert(1)')).toBeNull();
  });
});

describe('localizeSiteForm', () => {
  const raw: EldraFormDefinition = {
    key: 'contact',
    name: 'Contact',
    fields: [
      {
        id: 'topic',
        type: 'select',
        required: true,
        label: { 'en-US': 'Topic', 'is-IS': 'Efni' },
        options: [{ value: 'sales', label: { 'is-IS': 'Sala' } }],
      },
    ],
    honeypotField: 'website',
    turnstileSiteKey: null,
    success: { message: { 'is-IS': 'Takk.' }, redirect: { 'is-IS': 'javascript:alert(1)' } },
    kinds: ['store', 'subscribe'],
    consentText: { 'is-IS': ' Ég vil fá fréttabréf. ' },
  };

  it('resolves every text for the locale and drops an unsafe redirect', () => {
    const form = localizeSiteForm(raw, 'is-IS');
    expect(form.fields[0]).toMatchObject({ label: 'Efni', options: [{ label: 'Sala' }] });
    expect(form.successMessage).toBe('Takk.');
    expect(form.successRedirect).toBeNull();
    expect(form.consentText).toBe('Ég vil fá fréttabréf.');
  });

  it('refuses a field type it cannot draw', () => {
    const future = {
      ...raw,
      fields: [{ ...raw.fields[0]!, type: 'date' as never }],
    };
    expect(() => localizeSiteForm(future, 'is-IS')).toThrow(/unsupported field type "date"/);
  });
});
