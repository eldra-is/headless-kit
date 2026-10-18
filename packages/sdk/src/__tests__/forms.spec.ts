import { describe, expect, expectTypeOf, it } from 'vitest';
import { createEldraClient, EldraHttpError } from '../index';
import type {
  EldraFormDefinition,
  EldraFormSubmitInput,
  EldraFormSubmitResult,
  EldraHttpRequest,
} from '../index';
import { stubHttpClient } from './support';

function recording(answer: (request: EldraHttpRequest) => unknown) {
  const requests: EldraHttpRequest[] = [];
  const client = createEldraClient({
    apiBaseUrl: 'https://api.example.test/api',
    orgId: 'org-123',
    httpClient: stubHttpClient((request) => {
      requests.push(request);
      return answer(request);
    }),
  });
  return { client, requests };
}

const input: EldraFormSubmitInput = {
  values: { email: 'a@b.is', consent: true },
  locale: 'is-IS',
  pagePath: '/hafa-samband',
  hp: '',
};

function problem(status: number, body: unknown): EldraHttpError {
  return new EldraHttpError(
    new Response(JSON.stringify(body), { status, statusText: `S${status}` }),
    body
  );
}

describe('eldra sdk forms', () => {
  it('reads a definition by key on the org-scoped site path', async () => {
    const definition = { key: 'contact', name: 'Contact', fields: [] };
    const { client, requests } = recording(() => definition);

    const result = await client.forms.get('contact');

    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('https://api.example.test/api/site/v1/forms/contact');
    expect(requests[0].headers.get('X-Org-Id')).toBe('org-123');
    expect(result).toBe(definition);
    expectTypeOf(result).toEqualTypeOf<EldraFormDefinition>();
  });

  it('encodes the key so it can never reach another route', async () => {
    const { client, requests } = recording(() => ({}));

    await client.forms.get('a/../subscriptions');

    expect(requests[0].url).toBe(
      'https://api.example.test/api/site/v1/forms/a%2F..%2Fsubscriptions'
    );
  });

  it('posts the submission body as JSON and reports ok', async () => {
    const { client, requests } = recording(() => ({ ok: true }));

    const result = await client.forms.submit('contact', input);

    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('https://api.example.test/api/site/v1/forms/contact/submissions');
    expect(JSON.parse(requests[0].body as string)).toEqual(input);
    expect(result).toEqual({ status: 'ok', pending: false });
    expectTypeOf(result).toEqualTypeOf<EldraFormSubmitResult>();
  });

  it('reports pending when a subscribe form sent its opt-in email', async () => {
    const { client } = recording(() => ({ ok: true, pending: true }));

    expect(await client.forms.submit('newsletter', input)).toEqual({
      status: 'ok',
      pending: true,
    });
  });

  it('resolves a 422 as field-keyed errors instead of throwing', async () => {
    const { client } = recording(() => {
      throw problem(422, {
        errors: { email: ['Enter a valid email address.'], message: [] },
        form: ['Check the highlighted fields.'],
      });
    });

    expect(await client.forms.submit('contact', input)).toEqual({
      status: 'invalid',
      errors: { email: ['Enter a valid email address.'] },
      form: ['Check the highlighted fields.'],
    });
  });

  it('reads a malformed 422 body as invalid with no messages', async () => {
    const { client } = recording(() => {
      throw problem(422, { errors: 'nope', form: [1, 'kept'] });
    });

    expect(await client.forms.submit('contact', input)).toEqual({
      status: 'invalid',
      errors: {},
      form: ['kept'],
    });
  });

  it.each([404, 413, 429, 500])('rejects a %i', async (status) => {
    const { client } = recording(() => {
      throw problem(status, {});
    });

    await expect(client.forms.submit('contact', input)).rejects.toMatchObject({ status });
  });

  it('confirms and unsubscribes with the token in the query', async () => {
    const { client, requests } = recording((request) =>
      request.url.includes('unsubscribe') ? { status: 'unsubscribed' } : { status: 'confirmed' }
    );

    expect(await client.forms.confirm('t k')).toEqual({ status: 'confirmed' });
    expect(await client.forms.unsubscribe('t k')).toEqual({ status: 'unsubscribed' });

    expect(requests[0].url).toBe(
      'https://api.example.test/api/site/v1/forms/subscriptions/confirm?token=t+k'
    );
    expect(requests[1].url).toBe(
      'https://api.example.test/api/site/v1/forms/subscriptions/unsubscribe?token=t+k'
    );
  });
});
