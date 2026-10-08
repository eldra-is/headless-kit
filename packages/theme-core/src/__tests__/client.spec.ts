import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBlockFields } from '../blockFields';
import { createEldraClient, isTranslatedValue } from '../client';
import { EldraClientError } from '../clientTypes';
import { decodeStega } from '../stega';

const GATEWAY = 'https://gateway.example.test';
const ORG = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

// Registered fields for the 'cta' schema used by the select-unwrap tests
// below: a top-level select ('variant'), a select nested inside a list's
// composite item ('items.*.variant'), and a composite field whose
// sub-fields are literally named 'value'/'label' ('metric') — the same
// shape a real select produces, but not a select.
const CTA_FIELDS = {
  cta: [
    { fieldId: 'variant', type: 'select' },
    { fieldId: 'heading', type: 'string' },
    {
      fieldId: 'items',
      type: 'list',
      metadata: {
        item: {
          type: 'composite',
          metadata: {
            fields: [
              { fieldId: 'title', type: 'string' },
              { fieldId: 'variant', type: 'select' },
            ],
          },
        },
      },
    },
    {
      fieldId: 'metric',
      type: 'composite',
      metadata: {
        fields: [
          { fieldId: 'value', type: 'string' },
          { fieldId: 'label', type: 'string' },
        ],
      },
    },
  ],
};

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
  afterEach(() => {
    registerBlockFields({});
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

  it('lists categories, with the same URL, header and query plumbing as collections', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [{ id: 'c1', slug: 'tableware' }],
        meta: {
          hasNext: false,
          hasPrev: false,
          page: 1,
          pageSize: 25,
          rows: 1,
          total: 1,
          totalPages: 1,
        },
      })
    );
    // `listCategories` is optional on the reader so an older hand-written one
    // still satisfies the interface; `createEldraClient` always provides it,
    // which is what this asserts before calling it.
    const catalog = client().catalog;
    expect(typeof catalog.listCategories).toBe('function');
    const list = await catalog.listCategories!({ locale: 'en-US', pageSize: 100 });
    const [url, init] = fetchMock.mock.calls[0]!;
    const u = new URL(url as string);
    expect(u.origin + u.pathname).toBe(`${GATEWAY}/catalog/v1/categories`);
    expect(u.searchParams.get('locale')).toBe('en-US');
    expect(u.searchParams.get('pageSize')).toBe('100');
    expect(new Headers((init as RequestInit).headers).get('X-Org-Id')).toBe(ORG);
    expect(list.data).toEqual([{ id: 'c1', slug: 'tableware' }]);
  });

  /**
   * **`GET /catalog/v1/categories` answers the whole tree as a top-level array** — the categories
   * are a handful of rows and the endpoint takes no paging — so a bare array is a list. Reading it
   * as "an object with no `data`" made every category read answer nothing at all: no category
   * target for a `link` field to resolve, and no category route for a build to generate, with
   * nothing anywhere to say so.
   */
  it('reads a bare array response as the list itself', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        { id: 'c1', slug: 'tableware', title: 'Tableware' },
        { id: 'c2', slug: 'cups', title: 'Cups', parentId: 'c1' },
      ])
    );
    const list = await client().catalog.listCategories!({});
    expect(list.data.map((row) => row.slug)).toEqual(['tableware', 'cups']);
    // An array is one whole page, so a pager stops after it rather than asking again for ever.
    expect(list.meta).toMatchObject({ hasNext: false, page: 1, rows: 2, total: 2, totalPages: 1 });
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

  describe('link field locale fallback (defaultLocale)', () => {
    // A `link` field's value is a per-locale record: one node per locale,
    // each carrying its own kind/label/group/children. This is the operator
    // header scenario the fallback fixes — the English child has
    // `group: "Collections"`, the Icelandic child has none — reduced to the
    // smallest doc that reproduces it.
    function linkDoc(enNode: Record<string, unknown>, isNode: Record<string, unknown>) {
      return {
        id: 'e1',
        data: { links: [{ 'en-US': enNode, 'is-IS': isNode }] },
      };
    }

    function firstLink(data: Record<string, unknown>): Record<string, unknown> {
      return (data.links as Array<Record<string, unknown>>)[0]!;
    }

    it("fills an untranslated field (missing group) from the default locale's node, field by field — the own translated field (label) is kept", async () => {
      const doc = linkDoc(
        { kind: 'none', label: 'Collections', group: 'Collections', children: [] },
        { kind: 'none', label: 'Söfn', children: [] } // no group at all
      );
      fetchMock.mockResolvedValue(jsonResponse(doc));
      const c = createEldraClient({
        gatewayUrl: GATEWAY,
        orgId: ORG,
        fetch: fetchMock as unknown as typeof fetch,
        defaultLocale: 'en-US',
      });
      const entry = await c.getEntry('page', 'e1', { locale: 'is-IS' });
      const link = firstLink(entry.data);
      expect(link.group).toBe('Collections'); // filled from the default locale
      expect(link.label).toBe('Söfn'); // the locale's own translation is untouched
    });

    it('keeps a field the active locale already set, rather than overwriting it with the default', async () => {
      const doc = linkDoc(
        { kind: 'none', label: 'Collections', group: 'Collections', children: [] },
        { kind: 'none', label: 'Söfn', group: 'Söfn-hópur', children: [] }
      );
      fetchMock.mockResolvedValue(jsonResponse(doc));
      const c = createEldraClient({
        gatewayUrl: GATEWAY,
        orgId: ORG,
        fetch: fetchMock as unknown as typeof fetch,
        defaultLocale: 'en-US',
      });
      const entry = await c.getEntry('page', 'e1', { locale: 'is-IS' });
      expect(firstLink(entry.data).group).toBe('Söfn-hópur');
    });

    it("takes the default locale's whole children array when the active locale's is missing/empty — never merged by index", async () => {
      const defaultChildren = [{ label: 'Mugs' }, { label: 'Plates' }];
      const doc = linkDoc(
        { kind: 'none', label: 'Collections', group: 'Collections', children: defaultChildren },
        { kind: 'none', label: 'Söfn', children: [] }
      );
      fetchMock.mockResolvedValue(jsonResponse(doc));
      const c = createEldraClient({
        gatewayUrl: GATEWAY,
        orgId: ORG,
        fetch: fetchMock as unknown as typeof fetch,
        defaultLocale: 'en-US',
      });
      const entry = await c.getEntry('page', 'e1', { locale: 'is-IS' });
      expect(firstLink(entry.data).children).toEqual(defaultChildren);
    });

    it('a translated (non-empty) children array is kept, not replaced by the default', async () => {
      const ownChildren = [{ label: 'Bollar' }];
      const doc = linkDoc(
        { kind: 'none', label: 'Collections', group: 'Collections', children: [{ label: 'Mugs' }] },
        { kind: 'none', label: 'Söfn', children: ownChildren }
      );
      fetchMock.mockResolvedValue(jsonResponse(doc));
      const c = createEldraClient({
        gatewayUrl: GATEWAY,
        orgId: ORG,
        fetch: fetchMock as unknown as typeof fetch,
        defaultLocale: 'en-US',
      });
      const entry = await c.getEntry('page', 'e1', { locale: 'is-IS' });
      expect(firstLink(entry.data).children).toEqual(ownChildren);
    });

    it('a whitespace-only field counts as untranslated and is filled from the default', async () => {
      const doc = linkDoc(
        { kind: 'none', label: 'Collections', group: 'Collections', children: [] },
        { kind: 'none', label: '   ', group: 'Söfn', children: [] }
      );
      fetchMock.mockResolvedValue(jsonResponse(doc));
      const c = createEldraClient({
        gatewayUrl: GATEWAY,
        orgId: ORG,
        fetch: fetchMock as unknown as typeof fetch,
        defaultLocale: 'en-US',
      });
      const entry = await c.getEntry('page', 'e1', { locale: 'is-IS' });
      expect(firstLink(entry.data).label).toBe('Collections');
    });

    it('requesting the default locale itself changes nothing — byte-identical to the stored node', async () => {
      const enNode = { kind: 'none', label: 'Collections', group: 'Collections', children: [] };
      const doc = linkDoc(enNode, { kind: 'none', label: 'Söfn', children: [] });
      fetchMock.mockResolvedValue(jsonResponse(doc));
      const c = createEldraClient({
        gatewayUrl: GATEWAY,
        orgId: ORG,
        fetch: fetchMock as unknown as typeof fetch,
        defaultLocale: 'en-US',
      });
      const entry = await c.getEntry('page', 'e1', { locale: 'en-US' });
      expect(firstLink(entry.data)).toEqual(enNode);
    });

    it('with no defaultLocale option, output is byte-identical to today — the whole node, untouched', async () => {
      const doc = linkDoc(
        { kind: 'none', label: 'Collections', group: 'Collections', children: [] },
        { kind: 'none', label: 'Söfn', children: [] }
      );
      fetchMock.mockResolvedValue(jsonResponse(doc));
      // The bare `client()` helper never sets defaultLocale.
      const entry = await client().getEntry('page', 'e1', { locale: 'is-IS' });
      expect(firstLink(entry.data)).toEqual(doc.data.links[0]!['is-IS']);
    });
  });

  describe('isTranslatedValue', () => {
    it('treats missing, empty and whitespace-only values as untranslated', () => {
      expect(isTranslatedValue(undefined)).toBe(false);
      expect(isTranslatedValue(null)).toBe(false);
      expect(isTranslatedValue('')).toBe(false);
      expect(isTranslatedValue('   ')).toBe(false);
      expect(isTranslatedValue([])).toBe(false);
      expect(isTranslatedValue({})).toBe(false);
    });

    it('treats an empty rich-text document (no text leaves) as untranslated', () => {
      expect(isTranslatedValue({ type: 'doc', content: [] })).toBe(false);
      expect(
        isTranslatedValue({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
        })
      ).toBe(false);
    });

    it('treats a rich-text document carrying real text as translated', () => {
      expect(
        isTranslatedValue({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
        })
      ).toBe(true);
    });

    it('treats every other value as translated, including falsy scalars', () => {
      expect(isTranslatedValue('x')).toBe(true);
      expect(isTranslatedValue(0)).toBe(true);
      expect(isTranslatedValue(false)).toBe(true);
      expect(isTranslatedValue([1])).toBe(true);
      expect(isTranslatedValue({ a: 1 })).toBe(true);
    });
  });

  it('unwraps a resolved select field ({value,label}) into its plain value, top-level and nested in a list item', async () => {
    // The CMS gateway replaces a select field's stored string with
    // {value,label} on public reads; themes only ever declare
    // (and compare against) the plain value, so this must round-trip to a
    // bare string or every variant-switch silently renders as the default.
    // Gated on the registered field type, not the shape alone — see the
    // "does not unwrap" tests below.
    registerBlockFields(CTA_FIELDS);
    const doc = {
      id: 'e1',
      schemaApiId: 'cta',
      data: {
        heading: 'CTA',
        variant: { value: 'subtle', label: 'Subtle' },
        items: [{ title: 'A', variant: { value: 'plain', label: 'Plain' } }],
      },
    };
    fetchMock.mockResolvedValue(jsonResponse(doc));
    const entry = await client().getEntry('cta', 'e1', { locale: 'en-US' });
    expect(entry.data.variant).toBe('subtle');
    expect((entry.data.items as Array<{ variant: string }>)[0]!.variant).toBe('plain');
  });

  it('unwraps a resolved multi-select field (array of {value,label}) into plain values', async () => {
    registerBlockFields({
      product: [{ fieldId: 'tags', type: 'select', metadata: { multiple: true } }],
    });
    const doc = {
      id: 'e1',
      schemaApiId: 'product',
      data: {
        tags: [
          { value: 'featured', label: 'Featured' },
          { value: 'sale', label: 'On sale' },
        ],
      },
    };
    fetchMock.mockResolvedValue(jsonResponse(doc));
    const entry = await client().getEntry('product', 'e1', { locale: 'en-US' });
    expect(entry.data.tags).toEqual(['featured', 'sale']);
  });

  it('leaves an ordinary two-string-field composite alone (not a select wrapper)', async () => {
    registerBlockFields(CTA_FIELDS);
    const doc = {
      id: 'e1',
      schemaApiId: 'cta',
      data: { link: { href: 'https://x.test', label: 'Go' } },
    };
    fetchMock.mockResolvedValue(jsonResponse(doc));
    const entry = await client().getEntry('cta', 'e1', { locale: 'en-US' });
    // {href,label} does not have a "value" key, so it must not be unwrapped.
    expect(entry.data.link).toEqual(doc.data.link);
  });

  it('leaves a composite field whose sub-fields are literally "value"/"label" untouched, even though the registry has a real select elsewhere', async () => {
    // Same two-string-key shape resolveSelectLabels produces for a real
    // select, but 'metric' is registered as type "composite", not "select" —
    // the unwrap must be gated on the registered type, not the key names.
    registerBlockFields(CTA_FIELDS);
    const doc = {
      id: 'e1',
      schemaApiId: 'cta',
      data: { metric: { value: '42', label: 'Active users' } },
    };
    fetchMock.mockResolvedValue(jsonResponse(doc));
    const entry = await client().getEntry('cta', 'e1', { locale: 'en-US' });
    expect(entry.data.metric).toEqual(doc.data.metric);
  });

  it('does not unwrap a {value,label} shape when the schema has no registered block fields at all (e.g. a non-block entry such as a page)', async () => {
    // registerBlockFields is deliberately not called for 'page' (pages, and
    // any other non-block schema, are never registered), even though the
    // response carries its schemaApiId like any other entry. Absence of a
    // registration must never be read as permission to unwrap.
    const doc = {
      id: 'e1',
      schemaApiId: 'page',
      data: { variant: { value: 'subtle', label: 'Subtle' } },
    };
    fetchMock.mockResolvedValue(jsonResponse(doc));
    const entry = await client().getEntry('page', 'e1', { locale: 'en-US' });
    expect(entry.data.variant).toEqual(doc.data.variant);
  });

  it('does not unwrap a {value,label} shape when the entry doc carries no schemaApiId at all', async () => {
    registerBlockFields(CTA_FIELDS);
    const doc = { id: 'e1', data: { variant: { value: 'subtle', label: 'Subtle' } } };
    fetchMock.mockResolvedValue(jsonResponse(doc));
    const entry = await client().getEntry('cta', 'e1', { locale: 'en-US' });
    expect(entry.data.variant).toEqual(doc.data.variant);
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

  it("unwraps a nested block's own select field inside a page fetch, even though the page schema itself has no registered block fields", async () => {
    // Reproduces a real page render: getEntry('page', ...) embeds each
    // placed block as an entry doc inside data.blocks[], each carrying its
    // own schemaApiId ('cta' here). The outer entry's apiId is 'page' —
    // never registered as a block — so without re-deriving apiId from the
    // nested doc's own schemaApiId, isBlockFieldSelect('page', ...) is
    // false for every nested path and the block's variant stays wrapped
    // forever, exactly the case the previous test guards for the *page*
    // itself but not for a block it embeds.
    registerBlockFields(CTA_FIELDS);
    const doc = {
      id: 'page-1',
      schemaApiId: 'page',
      data: {
        title: 'Home',
        blocks: [
          {
            id: 'block-1',
            schemaApiId: 'cta',
            data: { heading: 'Sale', variant: { value: 'split', label: 'Split' } },
          },
        ],
      },
    };
    fetchMock.mockResolvedValue(jsonResponse(doc));
    const entry = await client().getEntry('page', 'page-1', { locale: 'en-US' });
    const block = (entry.data.blocks as Array<{ data: { variant: string; heading: string } }>)[0]!;
    expect(block.data.variant).toBe('split');
    expect(block.data.heading).toBe('Sale');
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

  // Preview-token recovery: the editor cannot see the gateway's answer to a
  // theme-side read, so a failure has to be reported to it. The client is the
  // one place every read passes through.
  describe('onRequestError', () => {
    const failure = (status: number) => new Response('nope', { status, statusText: 'nope' });

    it('reports a failed request to every listener, with status and path', async () => {
      const first = vi.fn();
      const second = vi.fn();
      const c = client();
      c.onRequestError?.(first);
      c.onRequestError?.(second);
      fetchMock.mockResolvedValue(failure(401));

      await expect(c.getEntries('page')).rejects.toBeInstanceOf(EldraClientError);
      expect(first).toHaveBeenCalledOnce();
      expect(first.mock.calls[0]![0]).toMatchObject({
        status: 401,
        path: '/cms/v1/schema/page/entry',
      });
      expect(second).toHaveBeenCalledOnce();
    });

    it('stops reporting after the returned unsubscribe', async () => {
      const listener = vi.fn();
      const c = client();
      const stop = c.onRequestError!(listener);
      stop();
      fetchMock.mockResolvedValue(failure(500));

      await expect(c.getEntries('page')).rejects.toBeInstanceOf(EldraClientError);
      expect(listener).not.toHaveBeenCalled();
    });

    it('suppresses a failure whose preview token was already replaced', async () => {
      const listener = vi.fn();
      const c = client();
      c.onRequestError?.(listener);
      c.enablePreview('revoked-token');
      // The editor's recovery lands while the read is still in flight — the
      // rejection that follows belongs to the token it just replaced.
      fetchMock.mockImplementation(async () => {
        c.enablePreview('fresh-token');
        return failure(401);
      });

      await expect(c.getEntries('page')).rejects.toBeInstanceOf(EldraClientError);
      expect(listener).not.toHaveBeenCalled();
    });

    it('still reports when the token is unchanged across the request', async () => {
      const listener = vi.fn();
      const c = client();
      c.onRequestError?.(listener);
      c.enablePreview('revoked-token');
      fetchMock.mockResolvedValue(failure(401));

      await expect(c.getEntries('page')).rejects.toBeInstanceOf(EldraClientError);
      expect(listener).toHaveBeenCalledOnce();
    });

    it('rejects normally when a listener throws', async () => {
      const second = vi.fn();
      const c = client();
      c.onRequestError?.(() => {
        throw new Error('listener blew up');
      });
      c.onRequestError?.(second);
      fetchMock.mockResolvedValue(failure(401));

      await expect(c.getEntries('page')).rejects.toMatchObject({ status: 401 });
      expect(second).toHaveBeenCalledOnce();
    });
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
