import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createEldraClient,
  DEFAULT_ELDRA_API_BASE_URL,
  getEldraClient,
  initEldraClient,
} from '../client';
import type { EldraHttpRequest } from '../types';
import { stubHttpClient } from './support';

describe('eldra sdk client', () => {
  it('defaults to the production web gateway base url', async () => {
    let capturedRequest: EldraHttpRequest | undefined;
    const client = createEldraClient({
      orgId: 'org-123',
      httpClient: stubHttpClient(async (request) => {
        capturedRequest = request;
        return { data: [] };
      }),
    });

    await client.cms.list('blog-post');

    expect(capturedRequest?.url).toBe(
      `${DEFAULT_ELDRA_API_BASE_URL}/cms/v1/schema/blog-post/entry`
    );
  });

  it('sends cms requests through a pluggable http client', async () => {
    let capturedRequest: EldraHttpRequest | undefined;
    const client = createEldraClient({
      apiBaseUrl: 'https://api.example.test/api',
      orgId: 'org-123',
      httpClient: stubHttpClient(async (request) => {
        capturedRequest = request;
        return { data: [] };
      }),
    });

    await client.cms.list('blog-post', {
      depth: 2,
      fields: ['title', 'slug'],
      locale: 'en-US',
    });

    expect(capturedRequest?.method).toBe('GET');
    expect(capturedRequest?.headers.get('X-Org-Id')).toBe('org-123');
    expect(capturedRequest?.url).toBe(
      'https://api.example.test/api/cms/v1/schema/blog-post/entry?depth=2&fields=title%2Cslug&locale=en-US'
    );
  });

  it('sends the configured preview token on all CMS read methods', async () => {
    const requests: EldraHttpRequest[] = [];
    const client = createEldraClient({
      orgId: 'org-123',
      previewToken: 'preview-token',
      headers: { 'X-Preview-Token': 'header-token' },
      httpClient: stubHttpClient(async (request) => {
        requests.push(request);
        return {};
      }),
    });

    await client.cms.list('blog-post', undefined, {
      headers: { 'X-Preview-Token': 'context-token' },
    });
    await client.cms.get('blog-post', 'entry-1');
    await client.cms.getEntryByUniqueField('blog-post', 'slug', 'hello-world');
    await client.cms.resolveEntryList({ schemas: ['blog-post'] });

    expect(requests).toHaveLength(4);
    for (const request of requests) {
      expect(request.headers.get('X-Preview-Token')).toBe('preview-token');
      expect(request.headers.get('X-Org-Id')).toBe('org-123');
      expect(request.url).not.toContain('preview-token');
    }
  });

  it('resolves the preview token for each request and allows returning to published reads', async () => {
    const requests: EldraHttpRequest[] = [];
    let previewToken: string | undefined = 'first-token';
    const client = createEldraClient({
      previewToken: () => previewToken,
      httpClient: stubHttpClient(async (request) => {
        requests.push(request);
        return {};
      }),
    });

    await client.cms.list('blog-post');
    previewToken = 'second-token';
    await client.cms.list('blog-post');
    previewToken = undefined;
    await client.cms.list('blog-post');

    expect(requests.map((request) => request.headers.get('X-Preview-Token'))).toEqual([
      'first-token',
      'second-token',
      null,
    ]);
  });

  it.each([undefined, ''])(
    'preserves custom headers when previewToken is %s',
    async (previewToken) => {
      const requests: EldraHttpRequest[] = [];
      const client = createEldraClient({
        previewToken,
        httpClient: stubHttpClient(async (request) => {
          requests.push(request);
          return {};
        }),
      });

      await client.cms.list('blog-post');
      await client.cms.list('blog-post', undefined, {
        headers: { 'X-Preview-Token': 'custom-token' },
      });

      expect(requests[0]?.headers.has('X-Preview-Token')).toBe(false);
      expect(requests[1]?.headers.get('X-Preview-Token')).toBe('custom-token');
    }
  );

  it('supports one-time init from runtime env values', async () => {
    const requests: EldraHttpRequest[] = [];
    initEldraClient({
      apiBaseUrl: undefined,
      env: {
        VITE_ELDRA_API_BASE_URL: 'https://api.example.test/api',
        VITE_ELDRA_ORG_ID: 'env-org',
      },
      httpClient: stubHttpClient(async (request) => {
        requests.push(request);
        return { id: 'product-1' };
      }),
    });

    const client = getEldraClient();
    await client.catalog.getProduct('product-1', { locale: 'is-IS' });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers.get('X-Org-Id')).toBe('env-org');
    expect(requests[0]?.url).toBe(
      'https://api.example.test/api/catalog/v1/products/product-1?locale=is-IS'
    );
  });

  it('allows request context to override the configured org id', async () => {
    let capturedRequest: EldraHttpRequest | undefined;
    const client = createEldraClient({
      apiBaseUrl: 'https://api.example.test/api',
      orgId: 'default-org',
      httpClient: stubHttpClient(async (request) => {
        capturedRequest = request;
        return {};
      }),
    });

    await client.catalog.listProducts(undefined, { orgId: 'request-org' });

    expect(capturedRequest?.headers.get('X-Org-Id')).toBe('request-org');
  });

  it('gets cms entries by unique field value', async () => {
    let capturedRequest: EldraHttpRequest | undefined;
    const client = createEldraClient({
      apiBaseUrl: 'https://api.example.test/api',
      orgId: 'org-123',
      httpClient: stubHttpClient(async (request) => {
        capturedRequest = request;
        return { data: { slug: 'hello world' } };
      }),
    });

    await client.cms.getEntryByUniqueField('blog-post', 'slug', 'hello world', {
      depth: 3,
      locale: 'en-US',
    });

    expect(capturedRequest?.method).toBe('GET');
    expect(capturedRequest?.headers.get('X-Org-Id')).toBe('org-123');
    expect(capturedRequest?.url).toBe(
      'https://api.example.test/api/cms/v1/schema/blog-post/entry/unique/slug/hello%20world?depth=3&locale=en-US'
    );
  });

  it('resolves cms entry lists from list field metadata', async () => {
    let capturedRequest: EldraHttpRequest | undefined;
    const client = createEldraClient({
      apiBaseUrl: 'https://api.example.test/api',
      orgId: 'org-123',
      httpClient: stubHttpClient(async (request) => {
        capturedRequest = request;
        return { data: [] };
      }),
    });

    await client.cms.resolveEntryList(
      {
        pageSize: 12,
        schemas: ['post-schema-id'],
        filters: [
          {
            schemaId: 'post-schema-id',
            fieldId: 'categories.slug',
            operator: 'eq',
            value: 'news',
          },
        ],
      },
      {
        deep: 1,
        locale: 'en-US',
        page: 2,
      }
    );

    expect(capturedRequest?.method).toBe('POST');
    expect(capturedRequest?.headers.get('X-Org-Id')).toBe('org-123');
    expect(capturedRequest?.headers.get('Content-Type')).toBe('application/json');
    expect(capturedRequest?.url).toBe(
      'https://api.example.test/api/cms/v1/entry-list/resolve?locale=en-US&page=2&deep=1'
    );
    expect(JSON.parse(capturedRequest?.body as string)).toEqual({
      filters: [
        {
          schemaId: 'post-schema-id',
          fieldId: 'categories.slug',
          operator: 'eq',
          value: 'news',
        },
      ],
      pageSize: 12,
      schemas: ['post-schema-id'],
    });
  });

  it('infers resolved entry list item types from the provided list object', async () => {
    interface BlogPostEntry {
      id: string;
      data: {
        title: string;
      };
    }

    const client = createEldraClient({
      apiBaseUrl: 'https://api.example.test/api',
      orgId: 'org-123',
      httpClient: stubHttpClient(async () => ({
        entries: {
          data: [],
          meta: {
            page: 1,
            pageSize: 10,
            total: 0,
            totalPages: 0,
            rows: 0,
            hasNext: false,
            hasPrev: false,
          },
        },
      })),
    });

    const entryList = {
      schemas: ['post-schema-id'],
      entries: {
        data: [] as BlogPostEntry[],
        meta: {
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 0,
          rows: 0,
          hasNext: false,
          hasPrev: false,
        },
      },
    };

    const resolved = await client.cms.resolveEntryList(entryList);

    expectTypeOf(resolved.entries.data[0]).toEqualTypeOf<BlogPostEntry>();
    expectTypeOf(resolved.entries.data[0]?.data.title).toEqualTypeOf<string>();

    const manuallyTyped = await client.cms.resolveEntryList<{ custom: true }>({});

    expectTypeOf(manuallyTyped).toEqualTypeOf<{ custom: true }>();
  });

  it('allows entry list resolve options to override page size', async () => {
    let capturedRequest: EldraHttpRequest | undefined;
    const client = createEldraClient({
      apiBaseUrl: 'https://api.example.test/api',
      orgId: 'org-123',
      httpClient: stubHttpClient(async (request) => {
        capturedRequest = request;
        return { data: [] };
      }),
    });

    await client.cms.resolveEntryList(
      {
        pageSize: 12,
      },
      {
        pageSize: 24,
        depth: 0,
      }
    );

    expect(capturedRequest?.url).toBe(
      'https://api.example.test/api/cms/v1/entry-list/resolve?pageSize=24&depth=0'
    );
    expect(JSON.parse(capturedRequest?.body as string)).toMatchObject({ pageSize: 12 });
  });

  it('maps organization features into storefront capabilities', async () => {
    let capturedRequest: EldraHttpRequest | undefined;
    const client = createEldraClient({
      apiBaseUrl: 'https://api.example.test/api',
      orgId: 'org-123',
      httpClient: stubHttpClient(async (request) => {
        capturedRequest = request;
        return {
          id: 'org-123',
          name: 'Acme',
          features: [
            { feature: 'CMS', enabled: true },
            { feature: 'ECOMMERCE', enabled: false },
          ],
        };
      }),
    });

    const capabilities = await client.features.getCapabilities();

    expect(capturedRequest?.method).toBe('GET');
    expect(capturedRequest?.headers.get('X-Org-Id')).toBe('org-123');
    expect(capturedRequest?.url).toBe('https://api.example.test/api/organization/v1/org-123');
    expect(capabilities).toEqual({
      cms: true,
      catalog: false,
      products: false,
      ecommerce: false,
      features: {
        CMS: true,
        ECOMMERCE: false,
      },
    });
  });

  it('allows organization feature checks for a request-specific org id', async () => {
    let capturedRequest: EldraHttpRequest | undefined;
    const client = createEldraClient({
      apiBaseUrl: 'https://api.example.test/api',
      orgId: 'default-org',
      httpClient: stubHttpClient(async (request) => {
        capturedRequest = request;
        return {
          id: 'request-org',
          name: 'Acme',
          features: [{ feature: 'ECOMMERCE', enabled: true }],
        };
      }),
    });

    await expect(client.features.isEnabled('ECOMMERCE', { orgId: 'request-org' })).resolves.toBe(
      true
    );
    expect(capturedRequest?.headers.get('X-Org-Id')).toBe('request-org');
    expect(capturedRequest?.url).toBe('https://api.example.test/api/organization/v1/request-org');
  });
});
