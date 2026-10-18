import { describe, expect, it, vi } from 'vitest';
import type { EldraFormDefinition } from '@eldrajs/sdk';
import {
  FORM_DEFINITION_WARNING,
  readFormDefinitions,
  toFormDefinition,
  type FormDefinitionsReader,
} from '../src/runtime/forms';

const contact: EldraFormDefinition = {
  key: 'contact',
  name: 'Contact',
  fields: [
    {
      id: 'email',
      type: 'email',
      required: true,
      label: { 'en-US': 'Email', 'is-IS': 'Netfang' },
    },
    {
      id: 'topic',
      type: 'select',
      required: false,
      label: { 'en-US': 'Topic' },
      options: [{ value: 'order', label: { 'en-US': 'An order' } }],
      validation: { maxLength: 40 },
    },
  ],
  honeypotField: 'website',
  turnstileSiteKey: null,
  success: { message: { 'en-US': 'Thanks' } },
  kinds: ['store', 'notify'],
};

const reader = (get: FormDefinitionsReader['forms']['get']): FormDefinitionsReader => ({
  forms: { get },
});

describe('readFormDefinitions', () => {
  it('reads every key through forms.get and keys the result by form key', async () => {
    const warn = vi.fn();
    const get = vi.fn(async (key: string) => ({ ...contact, key }));

    const result = await readFormDefinitions(reader(get as never), ['contact', 'newsletter'], warn);

    expect(Object.keys(result)).toEqual(['contact', 'newsletter']);
    expect(get).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('reads a repeated key once', async () => {
    const get = vi.fn(async () => contact);

    await readFormDefinitions(reader(get as never), ['contact', 'contact'], vi.fn());

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('keeps the forms that answered when another fails, with one warning for the failure', async () => {
    const warn = vi.fn();
    const get = vi.fn(async (key: string) => {
      if (key === 'newsletter') throw new Error('Web Studio request failed with 404 Not Found');
      return contact;
    });

    const result = await readFormDefinitions(reader(get as never), ['contact', 'newsletter'], warn);

    expect(Object.keys(result)).toEqual(['contact']);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      `${FORM_DEFINITION_WARNING('newsletter')} (Web Studio request failed with 404 Not Found)`
    );
  });

  it('leaves out an unusable response and says so', async () => {
    const warn = vi.fn();
    const broken = { ...contact, fields: [{ id: 'x', type: 'carrier-pigeon' }] };

    const result = await readFormDefinitions(
      reader((async () => broken) as never),
      ['contact'],
      warn
    );

    expect(result).toEqual({});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('the platform published an unusable response')
    );
  });

  it('warns once per key and reads nothing when there is no client', async () => {
    const warn = vi.fn();

    await expect(readFormDefinitions(null, ['contact', 'newsletter'], warn)).resolves.toEqual({});
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('is silent and makes no request when there is nothing to read', async () => {
    const warn = vi.fn();
    const get = vi.fn();

    await expect(readFormDefinitions(reader(get as never), [], warn)).resolves.toEqual({});
    expect(get).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('aborts a read that never answers', async () => {
    vi.useFakeTimers();
    try {
      const warn = vi.fn();
      const get = vi.fn(
        (_key: string, context?: { signal?: AbortSignal }) =>
          new Promise<never>((_resolve, reject) => {
            context?.signal?.addEventListener('abort', () => reject(context.signal?.reason));
          })
      );
      const pending = readFormDefinitions(reader(get as never), ['contact'], warn);
      await vi.advanceTimersByTimeAsync(10_001);

      await expect(pending).resolves.toEqual({});
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('timed out after 10000ms'));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('toFormDefinition', () => {
  it('accepts a whole definition and drops action kinds it does not know', () => {
    const result = toFormDefinition({ ...contact, kinds: ['store', 'teleport'] }, 'contact');

    expect(result).toEqual({ ...contact, kinds: ['store'] });
  });

  it.each([
    ['another key', { ...contact, key: 'other' }],
    ['no honeypot field', { ...contact, honeypotField: '' }],
    ['a non-string site key', { ...contact, turnstileSiteKey: 7 }],
    [
      'a label with a non-string text',
      { ...contact, fields: [{ ...contact.fields[0], label: { x: 1 } }] },
    ],
    ['a field with no id', { ...contact, fields: [{ ...contact.fields[0], id: '' }] }],
    ['no success message', { ...contact, success: {} }],
    ['kinds that are not a list', { ...contact, kinds: 'store' }],
  ])('refuses %s', (_name, value) => {
    expect(toFormDefinition(value, 'contact')).toBeNull();
  });

  it('reads a missing site key as none', () => {
    const { turnstileSiteKey: _dropped, ...rest } = contact;

    expect(toFormDefinition(rest, 'contact')?.turnstileSiteKey).toBeNull();
  });
});
