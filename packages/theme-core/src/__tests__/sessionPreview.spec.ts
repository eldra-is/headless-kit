/**
 * `enableSessionPreview`: a draft preview session's reads (WS-1303).
 *
 * The page is served by Eldra's preview router on a host of its own, which holds the session's
 * credential in an HttpOnly cookie and proxies the draft reads same-origin at `/__eldra/gateway`.
 * So in session mode a CMS read goes there, carries no credential header of any kind, is never
 * cached, and is refused unless the answer says it is a draft. Commerce reads are untouched.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEldraClient } from '../client';
import { EldraClientError } from '../clientTypes';

const GATEWAY = 'https://gateway.example.test/api';
const ORG = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const PROXY = `${location.origin}/__eldra/gateway`;

function draft(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': 'application/json', 'eldra-preview': 'draft', ...init.headers },
  });
}

function problem(status: number, errorId: string): Response {
  return new Response(JSON.stringify({ status, errorId, title: 'refused' }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

const LIST = { data: [], meta: { hasNext: false, hasPrev: false, page: 1, pageSize: 0 } };

describe('enableSessionPreview', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
  });

  const sessionClient = () => {
    const client = createEldraClient({
      gatewayUrl: GATEWAY,
      orgId: ORG,
      fetch: fetchMock as unknown as typeof fetch,
      buildToken: 'eldra_bld_secret',
      stega: true,
      retry: { attempts: 1 },
    });
    client.enableSessionPreview?.({ proxyBase: PROXY });
    return client;
  };

  const call = (index: number): { url: string; init: RequestInit; headers: Headers } => {
    const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
    return { url, init, headers: new Headers(init.headers) };
  };

  it('sends every CMS read same-origin to the proxy, uncached, with no credential header', async () => {
    fetchMock.mockImplementation(async () => draft(LIST));
    const client = sessionClient();
    client.enablePreview('should-never-be-sent');

    await client.getEntries('page', { locale: 'is', depth: 3 });
    fetchMock.mockImplementationOnce(async () => draft({ id: 'p1', data: {} }));
    await client.getEntry('page', 'p1');
    fetchMock.mockImplementationOnce(async () => draft({ id: 'a1', data: {} }));
    await client.getEntryByUniqueField('article', 'slug', 'hello');
    fetchMock.mockImplementationOnce(async () => draft({}));
    await client.resolveEntryListField('e1', 'items');
    fetchMock.mockImplementationOnce(async () => draft({}));
    await client.resolveEntryList({ schemas: ['article'] });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${PROXY}/cms/v1/schema/page/entry?locale=is&depth=3`,
      `${PROXY}/cms/v1/schema/page/entry/p1`,
      `${PROXY}/cms/v1/schema/article/entry/unique/slug/hello`,
      `${PROXY}/cms/v1/entry/e1/list/items`,
      `${PROXY}/cms/v1/entry-list/resolve`,
    ]);
    for (let i = 0; i < fetchMock.mock.calls.length; i++) {
      const { init, headers } = call(i);
      expect(init.cache).toBe('no-store');
      expect(init.credentials).toBe('same-origin');
      expect(headers.has('x-preview-token')).toBe(false);
      expect(headers.has('x-preview-session')).toBe(false);
      expect(headers.has('x-org-id')).toBe(false);
      expect(headers.has('x-eldra-build-token')).toBe(false);
      expect(headers.has('authorization')).toBe(false);
    }
    expect(call(4).init.method).toBe('POST');
    expect(call(4).headers.get('content-type')).toBe('application/json');
    expect(client.sessionPreviewEnabled).toBe(true);
  });

  it('never stega-encodes a session read: the page must match what Publish puts live', async () => {
    fetchMock.mockImplementation(async () => draft({ id: 'p1', data: { title: 'Plain' } }));
    const client = sessionClient();
    const entry = await client.getEntry('page', 'p1');
    expect(entry.data.title).toBe('Plain');
  });

  it('keeps commerce reads on the gateway, published, and never sends a preview token there', async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ id: 'prod', slug: 'merino' }), { status: 200 })
    );
    const client = sessionClient();
    client.enablePreview('should-never-be-sent');
    await client.catalog.getProduct('merino');
    const { url, init, headers } = call(0);
    expect(url).toBe(`${GATEWAY}/catalog/v1/products/merino`);
    expect(headers.get('x-org-id')).toBe(ORG);
    expect(headers.has('x-preview-token')).toBe(false);
    expect(init.credentials).toBeUndefined();
  });

  it('refuses a CMS answer without the draft marker rather than show it', async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ id: 'p1', data: {} }), { status: 200 })
    );
    const client = sessionClient();
    const failures: EldraClientError[] = [];
    client.onRequestError?.((error) => failures.push(error));
    const error = await client.getEntry('page', 'p1').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(EldraClientError);
    expect((error as EldraClientError).status).toBe(502);
    expect((error as EldraClientError).errorId).toBe('PREVIEW_UPSTREAM_NOT_PREVIEW');
    expect((error as EldraClientError).sessionPreview).toBe(true);
    expect(failures).toEqual([error]);
  });

  it("reads a refusal's errorId and reports it to listeners", async () => {
    fetchMock.mockImplementation(async () => problem(401, 'SITE_PREVIEW_SESSION_REVOKED'));
    const client = sessionClient();
    const failures: EldraClientError[] = [];
    client.onRequestError?.((error) => failures.push(error));
    const error = (await client.getEntries('page').catch((cause: unknown) => cause)) as
      | EldraClientError
      | undefined;
    expect(error?.status).toBe(401);
    expect(error?.errorId).toBe('SITE_PREVIEW_SESSION_REVOKED');
    expect(error?.path).toBe('/__eldra/gateway/cms/v1/schema/page/entry');
    expect(failures).toHaveLength(1);
  });

  it('refuses a proxy base on another origin', () => {
    const client = createEldraClient({
      gatewayUrl: GATEWAY,
      orgId: ORG,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(() =>
      client.enableSessionPreview?.({ proxyBase: 'https://elsewhere.example/__eldra/gateway' })
    ).toThrow(/own origin/);
    expect(() => client.enableSessionPreview?.({ proxyBase: '/__eldra/gateway' })).toThrow(
      /absolute/
    );
    expect(client.sessionPreviewEnabled).toBe(false);
  });

  it('leaves a client that never enables it exactly as it was', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(LIST), { status: 200 }));
    const client = createEldraClient({
      gatewayUrl: GATEWAY,
      orgId: ORG,
      fetch: fetchMock as unknown as typeof fetch,
    });
    client.enablePreview('tok');
    await client.getEntries('page');
    const { url, init, headers } = call(0);
    expect(url).toBe(`${GATEWAY}/cms/v1/schema/page/entry`);
    expect(headers.get('x-org-id')).toBe(ORG);
    expect(headers.get('x-preview-token')).toBe('tok');
    expect(init.cache).toBe('no-store');
    expect(init.credentials).toBeUndefined();
  });

  it('hands every CMS answer over in the public read\u2019s shape (WS-1358)', async () => {
    // Core's own preview read of a page whose parent places a shared component: the projection is
    // on the nested parent, not on the answer itself.
    const vector = (await import('./fixtures/preview-parity/get-page-nested-page-reference.json'))
      .default as { preview: { body: unknown } };
    fetchMock.mockImplementation(async () => draft(vector.preview.body));
    const client = sessionClient();
    const page = await client.getEntry('page', 'p1');
    expect(JSON.stringify(page)).toContain('"type":"flex"');
    expect(JSON.stringify(page)).not.toContain('reusableComponentProjection');
    expect(JSON.stringify(page)).not.toContain('"type":"reusable"');
    // And a list of such pages, the projection on every item's parent.
    fetchMock.mockImplementation(async () => draft({ ...LIST, data: [vector.preview.body] }));
    const list = await client.getEntries('page');
    expect(list.data).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain('reusableComponentProjection');
  });

  it('leaves a client outside a session reading the preview shape as it is', async () => {
    const vector = (await import('./fixtures/preview-parity/get-page-shared-component.json'))
      .default as { preview: { body: unknown } };
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify(vector.preview.body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    const client = createEldraClient({
      gatewayUrl: GATEWAY,
      orgId: ORG,
      fetch: fetchMock as unknown as typeof fetch,
      retry: { attempts: 1 },
    });
    expect(JSON.stringify(await client.getEntry('page', 'p1'))).toContain(
      'reusableComponentProjection'
    );
  });
});

describe('getSiteSetting', () => {
  const TOKENS = { revision: 4, resolved: { colors: {}, containers: {} } };
  const json = (body: unknown, init: ResponseInit = {}): Response =>
    new Response(JSON.stringify(body), {
      status: 200,
      ...init,
      headers: { 'content-type': 'application/json', ...init.headers },
    });
  const client = (fetchMock: ReturnType<typeof vi.fn>, session: boolean) => {
    const created = createEldraClient({
      gatewayUrl: GATEWAY,
      orgId: ORG,
      fetch: fetchMock as unknown as typeof fetch,
      buildToken: 'eldra_bld_secret',
      retry: { attempts: 1 },
    });
    if (session) created.enableSessionPreview?.({ proxyBase: PROXY });
    return created;
  };

  it('reads a site setting through the proxy in a session: no credential, no draft marker asked', async () => {
    const fetchMock = vi.fn(async () => json(TOKENS));
    const session = client(fetchMock, true);
    session.enablePreview('should-never-be-sent');
    await expect(session.getSiteSetting?.('/site/v1/design-tokens')).resolves.toEqual(TOKENS);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${PROXY}/site/v1/design-tokens`);
    expect(init.cache).toBe('no-store');
    expect(init.credentials).toBe('same-origin');
    const headers = new Headers(init.headers);
    expect([...headers.keys()]).toEqual(['accept']);
  });

  it('throws a session failure to the caller only, never to the refusal listeners', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 404, errorId: 'PREVIEW_GATEWAY_PATH_NOT_ALLOWED' }), {
          status: 404,
          headers: { 'content-type': 'application/problem+json' },
        })
    );
    const session = client(fetchMock, true);
    const listener = vi.fn();
    session.onRequestError?.(listener);
    const error = await session.getSiteSetting?.('/site/v1/theme-messages').catch((e) => e);
    expect(error).toBeInstanceOf(EldraClientError);
    expect(error).toMatchObject({
      status: 404,
      errorId: 'PREVIEW_GATEWAY_PATH_NOT_ALLOWED',
      sessionPreview: true,
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('is an ordinary gateway read outside a session', async () => {
    const fetchMock = vi.fn(async () => json(TOKENS));
    await expect(
      client(fetchMock, false).getSiteSetting?.('/site/v1/design-tokens')
    ).resolves.toEqual(TOKENS);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${GATEWAY}/site/v1/design-tokens`);
    expect(new Headers(init.headers).get('x-org-id')).toBe(ORG);
  });
});
