import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSeo, type SeoSetting } from '@eldrajs/theme-core';
import { READ_TIMEOUT_MS, readSeo, SEO_WARNING, type SeoReader } from '../src/runtime/seo';
import { buildSeoHead } from '../src/runtime/seoHead';

const reader = (request: SeoReader['request']): SeoReader => ({ request });

const SETTING: SeoSetting = {
  revision: 3,
  syntax: 1,
  site: {
    name: null,
    titlePattern: { 'en-US': '{{page.title}} · {{site.name}}' },
    description: { 'en-US': 'Handmade ceramics.' },
    imageAssetId: 'asset',
    imageUrl: 'https://cdn.example.test/asset/og',
    twitterHandle: '@soley',
  },
  templates: { 'catalog:product': { titlePattern: { 'en-US': '{{product.name}}' } } },
};

afterEach(() => {
  vi.useRealTimers();
});

describe('readSeo', () => {
  it('passes the platform’s setting through and asks the documented path', async () => {
    const warn = vi.fn();
    const request = vi.fn(async () => SETTING);

    const result = await readSeo(reader(request as never), warn);

    expect(result?.site.titlePattern).toEqual(SETTING.site.titlePattern);
    expect(result?.templates['catalog:product']?.titlePattern).toEqual({
      'en-US': '{{product.name}}',
    });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: '/site/v1/seo' }));
    expect(warn).not.toHaveBeenCalled();
  });

  it('treats a never-configured setting as an answer, not a failure', async () => {
    const warn = vi.fn();
    const unset = {
      revision: 0,
      syntax: 1,
      site: {
        name: null,
        titlePattern: {},
        description: {},
        imageAssetId: null,
        imageUrl: null,
        twitterHandle: null,
      },
      templates: {},
    };

    await expect(readSeo(reader(async () => unset) as never, warn)).resolves.toMatchObject({
      revision: 0,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once and returns null with no client', async () => {
    const warn = vi.fn();
    await expect(readSeo(null, warn)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledExactlyOnceWith(SEO_WARNING);
  });

  it('warns once and returns null when the gateway fails', async () => {
    const warn = vi.fn();
    const failing = reader((async () => {
      throw new Error('connect ECONNREFUSED');
    }) as never);
    await expect(readSeo(failing, warn)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledExactlyOnceWith(`${SEO_WARNING} (connect ECONNREFUSED)`);
  });

  it.each([
    ['not an object', 'nope'],
    ['an unknown syntax', { ...SETTING, syntax: 2 }],
    [
      'a pattern that is not a string',
      { ...SETTING, site: { ...SETTING.site, titlePattern: { 'en-US': 4 } } },
    ],
    ['a template entry that is not an object', { ...SETTING, templates: { page: 'x' } }],
    ['a missing revision', { ...SETTING, revision: undefined }],
  ])('refuses %s with one warning', async (_label, body) => {
    const warn = vi.fn();
    await expect(readSeo(reader((async () => body) as never), warn)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('gives up after the read timeout and aborts the request', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    let signal: AbortSignal | undefined;
    const hanging = reader(((options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason));
      });
    }) as never);

    const pending = readSeo(hanging, warn);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);

    await expect(pending).resolves.toBeNull();
    expect(signal?.aborted).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('buildSeoHead', () => {
  const input = {
    locale: 'en-US',
    context: 'catalog:product' as const,
    site: SETTING,
    siteName: 'Sóley',
    siteUrl: 'https://shop.example',
    path: '/products/mug',
    data: { product: { name: 'Mug' } },
  };

  it('writes title, description, canonical, og, twitter and no robots for an indexable page', () => {
    const head = buildSeoHead(resolveSeo(input), { locale: 'en-US', siteName: 'Sóley' });
    expect(head.title).toBe('Mug');
    expect(head.link).toEqual([{ rel: 'canonical', href: 'https://shop.example/products/mug' }]);
    const tags = Object.fromEntries(
      head.meta.map((tag) => [tag.name ?? tag.property, tag.content])
    );
    expect(tags).toMatchObject({
      description: 'Handmade ceramics.',
      'og:title': 'Mug',
      'og:type': 'product',
      'og:url': 'https://shop.example/products/mug',
      'og:image': 'https://cdn.example.test/asset/og',
      'og:locale': 'en_US',
      'og:site_name': 'Sóley',
      'twitter:card': 'summary_large_image',
      'twitter:site': '@soley',
    });
    expect(tags.robots).toBeUndefined();
  });

  it('writes robots noindex for a preview build', () => {
    const head = buildSeoHead(resolveSeo({ ...input, isPreview: true }), {
      locale: 'en-US',
      siteName: 'Sóley',
    });
    expect(head.meta).toContainEqual({ name: 'robots', content: 'noindex' });
  });

  it('omits canonical, og:url and the image when nothing absolute is known', () => {
    const head = buildSeoHead(resolveSeo({ ...input, site: null, siteUrl: null }), {
      locale: null,
      siteName: 'Sóley',
    });
    expect(head.link).toEqual([]);
    const names = head.meta.map((tag) => tag.name ?? tag.property);
    expect(names).not.toContain('og:url');
    expect(names).not.toContain('og:image');
    expect(names).not.toContain('og:locale');
    expect(head.meta).toContainEqual({ name: 'twitter:card', content: 'summary' });
  });
});
