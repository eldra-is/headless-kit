import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEldraClient } from '../client';
import { EldraClientError } from '../clientTypes';
import { decodeStega } from '../stega';

const GATEWAY = 'https://web-gateway.staging.eu.eldra.app';
const ORG = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createEldraClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
  });

  function client(stega = false) {
    return createEldraClient({
      gatewayUrl: GATEWAY,
      orgId: ORG,
      stega,
      fetch: fetchMock as unknown as typeof fetch,
    });
  }

  it('lists entries: URL, X-Org-Id, query serialization', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [],
        meta: {
          hasNext: false,
          hasPrev: false,
          page: 1,
          pageSize: 25,
          rows: 0,
          total: 0,
          totalPages: 0,
        },
      })
    );
    await client().getEntries('page', {
      locale: 'en-US',
      depth: 3,
      page: 2,
      pageSize: 50,
      sort: ['-publishedAt'],
      filter: ['slug:eq:home'],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.origin + u.pathname).toBe(`${GATEWAY}/cms/v1/schema/page/entry`);
    expect(u.searchParams.get('locale')).toBe('en-US');
    expect(u.searchParams.get('depth')).toBe('3');
    expect(u.searchParams.get('page')).toBe('2');
    expect(u.searchParams.get('pageSize')).toBe('50');
    expect(u.searchParams.get('sort')).toBe('-publishedAt');
    expect(u.searchParams.getAll('filter')).toEqual(['slug:eq:home']);
    expect(new Headers((init as RequestInit).headers).get('X-Org-Id')).toBe(ORG);
    expect(new Headers((init as RequestInit).headers).get('X-Preview-Token')).toBeNull();
  });

  it('normalizes an omitted empty-list data field to an empty array', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        meta: {
          hasNext: false,
          hasPrev: false,
          page: 1,
          pageSize: 25,
          rows: 0,
          total: 0,
          totalPages: 0,
        },
      })
    );

    await expect(client().getEntries('route-template')).resolves.toMatchObject({ data: [] });
  });

  it('enablePreview adds X-Preview-Token and cache no-store; disablePreview removes them', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ id: 'e1', data: {} }));
    const c = client();
    c.enablePreview('tok-abc');
    expect(c.previewEnabled).toBe(true);
    await c.getEntry('page', 'e1');
    let init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('X-Preview-Token')).toBe('tok-abc');
    expect(init.cache).toBe('no-store');
    c.disablePreview();
    await c.getEntry('page', 'e1');
    init = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(new Headers(init.headers).get('X-Preview-Token')).toBeNull();
    expect(init.cache).toBeUndefined();
  });

  it('never puts the preview token in the URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'e1', data: {} }));
    const c = client();
    c.enablePreview('tok-abc');
    await c.getEntry('page', 'e1');
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain('tok-abc');
  });

  it('stega-encodes string leaves (incl. nested/arrays) only when stega && preview', async () => {
    const doc = {
      id: 'e1',
      data: { title: 'Hi', n: 3, cta: { label: 'Go' }, items: [{ caption: 'One' }] },
    };
    fetchMock.mockResolvedValue(jsonResponse(doc));
    const c = client(true);
    const plain = await c.getEntry('page', 'e1', { locale: 'en-US' });
    expect(plain.data.title).toBe('Hi'); // preview off: untouched
    c.enablePreview('tok');
    fetchMock.mockResolvedValue(jsonResponse(doc));
    const entry = await c.getEntry('page', 'e1', { locale: 'en-US' });
    const title = decodeStega(entry.data.title as string);
    expect(title).toMatchObject({
      cleaned: 'Hi',
      meta: { entryId: 'e1', fieldPath: 'title', locale: 'en-US' },
    });
    const label = decodeStega((entry.data.cta as { label: string }).label);
    expect(label.meta).toMatchObject({ fieldPath: 'cta.label' });
    const caption = decodeStega((entry.data.items as Array<{ caption: string }>)[0]!.caption);
    expect(caption.meta).toMatchObject({ fieldPath: 'items.0.caption' });
    expect((entry.data as { n: number }).n).toBe(3);
  });

  it('projects legacy localized leaves nested below list/composite fields', async () => {
    const doc = {
      id: 'e1',
      data: {
        heading: 'Testimonials',
        items: [
          {
            quote: { 'en-US': 'English quote', 'is-IS': 'Íslensk tilvitnun' },
            author: { name: 'Anna', role: { 'en-US': 'CTO' } },
          },
        ],
        media: { id: 'asset-1', url: 'https://cdn.example/image.png' },
      },
    };
    fetchMock.mockResolvedValue(jsonResponse(doc));

    const entry = await client().getEntry('page', 'e1', { locale: 'is-IS' });
    const item = (
      entry.data.items as Array<{
        quote: string;
        author: { name: string; role: string };
      }>
    )[0]!;
    expect(item.quote).toBe('Íslensk tilvitnun');
    expect(item.author).toEqual({ name: 'Anna', role: 'CTO' });
    expect(entry.data.media).toEqual(doc.data.media);
  });

  it('re-roots fieldPath/entryId when walking resolved reference entry docs', async () => {
    const doc = {
      id: 'page-1',
      data: { title: 'Page', blocks: [{ id: 'block-1', data: { heading: 'Block heading' } }] },
    };
    fetchMock.mockResolvedValue(jsonResponse(doc));
    const c = client(true);
    c.enablePreview('tok');
    const entry = await c.getEntry('page', 'page-1');
    const block = (entry.data.blocks as Array<{ id: string; data: { heading: string } }>)[0]!;
    const decoded = decodeStega(block.data.heading);
    expect(decoded.meta).toMatchObject({ entryId: 'block-1', fieldPath: 'heading', locale: null });
  });

  it('preserves unresolved reference identity while encoding editable string fields', async () => {
    const doc = {
      id: 'page-1',
      data: {
        blocks: [{ id: 'block-1', _type: 'entry_hero', label: 'Hero' }],
      },
    };
    fetchMock.mockResolvedValue(jsonResponse(doc));
    const c = client(true);
    c.enablePreview('tok');
    const entry = await c.getEntry('page', 'page-1');
    const reference = (
      entry.data.blocks as Array<{ id: string; _type: string; label: string }>
    )[0]!;
    expect(reference.id).toBe('block-1');
    expect(reference._type).toBe('entry_hero');
    expect(decodeStega(reference.label).meta).toMatchObject({
      entryId: 'page-1',
      fieldPath: 'blocks.0.label',
    });
  });

  it('throws a descriptive error on non-2xx (401 invalid preview token)', async () => {
    fetchMock.mockResolvedValue(new Response('{"title":"Unauthorized"}', { status: 401 }));
    const c = client();
    c.enablePreview('bad');
    await expect(c.getEntry('page', 'e1')).rejects.toThrow(/401/);
  });

  it('exposes bounded status and path metadata for a unique-field 404', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404, statusText: 'Not Found' }));
    const failure = client().getEntryByUniqueField('article', 'slug', 'missing value', {
      depth: 3,
    });
    await expect(failure).rejects.toMatchObject({
      status: 404,
      path: '/cms/v1/schema/article/entry/unique/slug/missing%20value',
    });
    await expect(failure).rejects.toBeInstanceOf(EldraClientError);
  });

  it('fetches typescript definitions as text with query params', async () => {
    fetchMock.mockResolvedValue(new Response('export interface CMSPage {}', { status: 200 }));
    const dts = await client().getTypeScriptDefinitions({
      schemas: ['page', 'hero'],
      moduleName: 'Eldra',
    });
    expect(dts).toContain('CMSPage');
    const u = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(u.pathname).toBe('/cms/v1/typescript-definitions');
    expect(u.searchParams.get('schemas')).toBe('page,hero');
    expect(u.searchParams.get('moduleName')).toBe('Eldra');
  });
});
