import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEldraClient,
  EldraHttpError,
  type EldraFormDefinition,
  type EldraHttpRequest,
} from '@eldrajs/sdk';
import { createGatewayStorefront } from '../../app/storefront/gateway';
import { localizeFormDefinition, pickLocalized } from '../../app/storefront/forms';
import type { StorefrontRoute } from '../../app/storefront/types';

/**
 * The forms half of `createGatewayStorefront` over the **real** SDK client with a stub transport:
 * what `forms.definition` serves (a baked definition with no request, any other fetched, every
 * per-locale text resolved for the page) and what `forms.submit` sends and how it reads each answer
 * (`422` field messages, `429`, `413`, an unreachable platform, the `formsEndpoint` override).
 */
const definition: EldraFormDefinition = {
  key: 'contact',
  name: 'Contact',
  fields: [
    {
      id: 'email',
      type: 'email',
      required: true,
      label: { 'en-US': 'Email address', 'is-IS': 'Netfang' },
      placeholder: { 'en-US': 'name@example.com' },
    },
    {
      id: 'topic',
      type: 'select',
      required: false,
      label: { 'en-US': 'Topic' },
      options: [{ value: 'order', label: { 'en-US': 'An order', 'is-IS': 'Pöntun' } }],
      validation: { maxLength: 40 },
    },
  ],
  honeypotField: 'website',
  turnstileSiteKey: '1x00000000000000000000AA',
  success: {
    message: { 'en-US': 'Thanks.', 'is-IS': 'Takk.' },
    redirect: { 'en-US': '/thanks' },
  },
  kinds: ['store', 'notify'],
};

function route(): StorefrontRoute {
  return {
    productHandle: null,
    collectionHandle: null,
    categorySlug: null,
    categoryPath: null,
    orderToken: null,
    query: null,
    page: 1,
    sort: null,
    columns: null,
    filters: {},
    setQuery: () => {},
  };
}

function problem(status: number, body: unknown = {}): EldraHttpError {
  return new EldraHttpError(new Response('{}', { status, statusText: `S${status}` }), body);
}

function setup(
  answer: (request: EldraHttpRequest) => unknown,
  options: Partial<Parameters<typeof createGatewayStorefront>[1]> = {}
) {
  const requests: EldraHttpRequest[] = [];
  const client = createEldraClient({
    apiBaseUrl: 'https://api.example.test/api',
    orgId: 'org-1',
    httpClient: (async (request: EldraHttpRequest) => {
      requests.push(request);
      return answer(request);
    }) as never,
  });
  const storefront = createGatewayStorefront(client, { route: route(), ...options });
  return { storefront, requests };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pickLocalized', () => {
  it('prefers the exact tag, then the same language, then the first entry', () => {
    const map = { 'en-US': 'Name', 'is-IS': 'Nafn' };
    expect(pickLocalized(map, 'is-IS')).toBe('Nafn');
    expect(pickLocalized(map, 'is')).toBe('Nafn');
    expect(pickLocalized({ 'en-GB': 'Colour' }, 'en-US')).toBe('Colour');
    expect(pickLocalized(map, 'fr-FR')).toBe('Name');
    expect(pickLocalized(map, undefined)).toBe('Name');
  });

  it('answers the empty string for nothing', () => {
    expect(pickLocalized({}, 'en-US')).toBe('');
    expect(pickLocalized(undefined, 'en-US')).toBe('');
  });
});

describe('localizeFormDefinition', () => {
  it('resolves every text for the locale and drops what the page does not need', () => {
    const result = localizeFormDefinition(definition, 'is-IS');

    expect(result.fields[0]).toEqual({
      id: 'email',
      type: 'email',
      required: true,
      label: 'Netfang',
      placeholder: 'name@example.com',
    });
    expect(result.fields[1]?.options).toEqual([{ value: 'order', label: 'Pöntun' }]);
    expect(result.fields[1]?.validation).toEqual({ maxLength: 40 });
    expect(result).toMatchObject({
      key: 'contact',
      honeypotField: 'website',
      turnstileSiteKey: '1x00000000000000000000AA',
      successMessage: 'Takk.',
      successRedirect: '/thanks',
    });
    expect(result).not.toHaveProperty('kinds');
  });

  it('resolves the consent sentence for the locale, and is empty without one', () => {
    const subscribing = {
      ...definition,
      consentText: { 'en-US': 'I want mail from Shop.', 'is-IS': 'Ég vil póst frá Shop.' },
    };
    expect(localizeFormDefinition(subscribing, 'is-IS').consentText).toBe('Ég vil póst frá Shop.');
    expect(localizeFormDefinition(definition, 'is-IS').consentText).toBe('');
  });

  it('refuses a field type the theme cannot render rather than showing it as text', () => {
    const odd = {
      ...definition,
      fields: [{ ...definition.fields[0], type: 'signature' }],
    } as unknown as EldraFormDefinition;
    expect(() => localizeFormDefinition(odd, 'en-US')).toThrow(/unsupported field type/);
  });

  it('carries phone and consent fields through', () => {
    const result = localizeFormDefinition(
      {
        ...definition,
        fields: [
          { id: 'phone', type: 'phone', required: true, label: { 'en-US': 'Phone' } },
          { id: 'ok', type: 'consent', required: true, label: { 'en-US': 'I agree' } },
        ],
      },
      'en-US'
    );
    expect(result.fields.map((field) => field.type)).toEqual(['phone', 'consent']);
  });

  it('carries number and url fields through', () => {
    const result = localizeFormDefinition(
      {
        ...definition,
        fields: [
          { id: 'qty', type: 'number', required: true, label: { 'en-US': 'Quantity' } },
          { id: 'site', type: 'url', required: false, label: { 'en-US': 'Website' } },
        ],
      },
      'en-US'
    );
    expect(result.fields.map((field) => field.type)).toEqual(['number', 'url']);
  });

  it('has no redirect when the platform names none', () => {
    const { redirect: _drop, ...success } = definition.success;
    expect(localizeFormDefinition({ ...definition, success }, 'en-US').successRedirect).toBeNull();
  });
});

describe('forms.definition', () => {
  it('serves a baked definition with no request, resolved for the page locale', async () => {
    const { storefront, requests } = setup(() => ({}), {
      formDefinitions: { contact: definition },
      formLocale: () => 'is-IS',
    });

    const result = storefront.forms.definition(ref('contact'));
    await vi.waitFor(() => expect(result.pending.value).toBe(false));

    expect(requests).toHaveLength(0);
    expect(result.data.value?.fields[0]?.label).toBe('Netfang');
  });

  it('replaces the baked definition with the live one in a browser, and keeps it when the read fails', async () => {
    vi.stubGlobal('window', {});
    try {
      const live = {
        ...definition,
        turnstileSiteKey: 'live-key',
        fields: [{ ...definition.fields[0], label: { 'en-US': 'Live email' } }],
      };
      const { storefront, requests } = setup(() => live, {
        formDefinitions: { contact: definition },
      });
      const result = storefront.forms.definition(ref('contact'));
      await vi.waitFor(() => expect(result.data.value?.fields[0]?.label).toBe('Live email'));
      expect(requests).toHaveLength(1);
      expect(result.data.value?.turnstileSiteKey).toBe('live-key');

      const failing = setup(
        () => {
          throw problem(503);
        },
        { formDefinitions: { contact: definition } }
      );
      const kept = failing.storefront.forms.definition(ref('contact'));
      await vi.waitFor(() => expect(failing.requests).toHaveLength(1));
      expect(kept.data.value?.fields[0]?.label).toBe('Email address');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fetches a form that was not baked', async () => {
    const { storefront, requests } = setup(() => definition);

    const result = storefront.forms.definition(ref('contact'));
    await vi.waitFor(() => expect(result.pending.value).toBe(false));

    expect(requests.map((request) => request.url)).toEqual([
      'https://api.example.test/api/site/v1/forms/contact',
    ]);
    expect(result.data.value?.fields[0]?.label).toBe('Email address');
  });

  it('leaves data null, with an error, for a form the platform does not know', async () => {
    const { storefront } = setup(() => {
      throw problem(404);
    });

    const result = storefront.forms.definition(ref('nope'));
    await vi.waitFor(() => expect(result.pending.value).toBe(false));

    expect(result.data.value).toBeNull();
    expect(result.error.value).not.toBeNull();
  });
});

describe('forms.submit', () => {
  const input = { values: { email: 'anna@example.is' } };

  it('posts the values with the locale and page path, and omits an empty honeypot and token', async () => {
    const { storefront, requests } = setup(() => ({ ok: true }), { formLocale: () => 'is-IS' });

    const result = await storefront.forms.submit('contact', { ...input, hp: '' });

    expect(result).toEqual({ ok: true, pending: false });
    expect(requests[0]?.url).toBe('https://api.example.test/api/site/v1/forms/contact/submissions');
    expect(JSON.parse(requests[0]?.body as string)).toEqual({
      values: { email: 'anna@example.is' },
      locale: 'is-IS',
      pagePath: '/',
    });
  });

  it('sends the Turnstile token and what a bot typed into the honeypot', async () => {
    const { storefront, requests } = setup(() => ({ ok: true }));

    await storefront.forms.submit('contact', { ...input, turnstileToken: 'tok', hp: 'spam' });

    expect(JSON.parse(requests[0]?.body as string)).toMatchObject({
      turnstileToken: 'tok',
      hp: 'spam',
      locale: 'en-US',
    });
  });

  it('reports a pending double opt-in', async () => {
    const { storefront } = setup(() => ({ ok: true, pending: true }));

    expect(await storefront.forms.submit('newsletter', input)).toEqual({ ok: true, pending: true });
  });

  it('keeps a 422’s field-keyed messages', async () => {
    const { storefront } = setup(() => {
      throw problem(422, { errors: { email: ['Not an address.'] }, form: ['Check it.'] });
    });

    expect(await storefront.forms.submit('contact', input)).toEqual({
      ok: false,
      reason: 'invalid',
      errors: { email: ['Not an address.'] },
      form: ['Check it.'],
    });
  });

  it.each([
    [429, 'rate-limited'],
    [413, 'too-large'],
    [500, 'unavailable'],
    [404, 'unavailable'],
  ] as const)('reads a %i as %s', async (status, reason) => {
    const { storefront } = setup(() => {
      throw problem(status);
    });

    expect(await storefront.forms.submit('contact', input)).toEqual({ ok: false, reason });
  });

  it('reads an unreachable platform as unavailable, never a throw', async () => {
    const { storefront } = setup(() => {
      throw new TypeError('fetch failed');
    });

    expect(await storefront.forms.submit('contact', input)).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  describe('with a formsEndpoint override', () => {
    it('posts there instead of to the platform, and a 2xx is a success', async () => {
      const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const { storefront, requests } = setup(() => ({ ok: true }), {
        formsEndpoint: 'https://forms.example.test/submit',
        formLocale: () => 'is-IS',
      });

      const result = await storefront.forms.submit('contact', input);

      expect(result).toEqual({ ok: true, pending: false });
      expect(requests).toHaveLength(0);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://forms.example.test/submit');
      expect(JSON.parse(init.body as string)).toEqual({
        kind: 'form',
        key: 'contact',
        values: { email: 'anna@example.is' },
        locale: 'is-IS',
        pagePath: '/',
      });
    });

    it('forwards the honeypot and the Turnstile token to the endpoint', async () => {
      const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const { storefront } = setup(() => ({ ok: true }), {
        formsEndpoint: 'https://forms.example.test/submit',
      });

      await storefront.forms.submit('contact', { ...input, hp: 'bot', turnstileToken: 'tok' });

      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toMatchObject({ hp: 'bot', turnstileToken: 'tok' });
    });

    it.each([
      [429, 'rate-limited'],
      [413, 'too-large'],
      [502, 'unavailable'],
    ] as const)('reads the endpoint’s %i as %s', async (status, reason) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{}', { status }))
      );
      const { storefront } = setup(() => ({}), { formsEndpoint: 'https://forms.example.test/s' });

      expect(await storefront.forms.submit('contact', input)).toEqual({ ok: false, reason });
    });

    it('reads a network failure as unavailable', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Promise.reject(new TypeError('offline')))
      );
      const { storefront } = setup(() => ({}), { formsEndpoint: 'https://forms.example.test/s' });

      expect(await storefront.forms.submit('contact', input)).toEqual({
        ok: false,
        reason: 'unavailable',
      });
    });
  });
});
