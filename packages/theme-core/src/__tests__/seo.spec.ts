import { describe, expect, it } from 'vitest';
import vectors from './fixtures/seo-vectors.json';
import { pickSeoLocale, renderSeoTitle, resolveSeo, type SeoSetting, tidySeoTitle } from '../seo';

describe('shared SEO vectors', () => {
  for (const vector of vectors.vectors) {
    it(vector.name, () => {
      expect(renderSeoTitle(vector.pattern, vector.data)).toBe(vector.expected);
    });
  }
});

describe('tidySeoTitle', () => {
  it('keeps separators that sit between words', () => {
    expect(tidySeoTitle('A · B')).toBe('A · B');
  });
  it('drops a title that is only separators', () => {
    expect(tidySeoTitle(' · | - ')).toBe('');
  });
});

const SITE: SeoSetting = {
  revision: 1,
  syntax: 1,
  site: {
    name: null,
    titlePattern: {
      'en-US': '{{page.title}} | {{site.name}}',
      'is-IS': '{{page.title}} · {{site.name}}',
    },
    description: { 'en-US': 'Handmade ceramics from {{site.name}}.' },
    imageAssetId: 'a1',
    imageUrl: 'https://media.example/a1/og',
    twitterHandle: 'soley',
  },
  templates: {
    'catalog:product': {
      titlePattern: { 'en-US': '{{product.name}} - buy at {{site.name}}' },
      descriptionPattern: { 'en-US': '{{product.shortDescription}}' },
    },
  },
};

const base = {
  locale: 'en-US',
  site: SITE,
  siteName: 'Sóley',
  siteUrl: 'https://shop.example/',
  path: '/about',
  data: { page: { title: 'About' } },
} as const;

describe('resolveSeo', () => {
  it('uses the site pattern, the theme site name and the description', () => {
    const seo = resolveSeo({ ...base, context: 'page' });
    expect(seo.title).toBe('About | Sóley');
    expect(seo.description).toBe('Handmade ceramics from Sóley.');
    expect(seo.canonical).toBe('https://shop.example/about');
    expect(seo.image).toBe('https://media.example/a1/og');
    expect(seo.twitterSite).toBe('@soley');
    expect(seo.noindex).toBe(false);
    expect(seo.ogType).toBe('website');
  });

  it('prefers the template pattern for its context over the site pattern', () => {
    const seo = resolveSeo({
      ...base,
      context: 'catalog:product',
      data: { product: { name: 'Mug', shortDescription: 'A mug.' } },
    });
    expect(seo.title).toBe('Mug - buy at Sóley');
    expect(seo.description).toBe('A mug.');
    expect(seo.ogType).toBe('product');
  });

  it('takes the entry override whole, without the site pattern, but with variables', () => {
    const seo = resolveSeo({
      ...base,
      context: 'page',
      entry: { title: { 'en-US': 'Our story · {{site.name}}' }, description: 'Own text' },
    });
    expect(seo.title).toBe('Our story · Sóley');
    expect(seo.description).toBe('Own text');
  });

  it('picks the locale, then the same language, then the default locale', () => {
    expect(resolveSeo({ ...base, locale: 'is-IS', context: 'page' }).title).toBe('About · Sóley');
    expect(resolveSeo({ ...base, locale: 'en-GB', context: 'page' }).title).toBe('About | Sóley');
    expect(
      resolveSeo({ ...base, locale: 'de-DE', defaultLocale: 'is-IS', context: 'page' }).title
    ).toBe('About · Sóley');
  });

  it('falls back to the default pattern with no setting, and to the site name alone on home', () => {
    const noSite = { ...base, site: null };
    expect(resolveSeo({ ...noSite, context: 'page' }).title).toBe('About · Sóley');
    expect(resolveSeo({ ...noSite, context: 'home' }).title).toBe('Sóley');
    expect(resolveSeo({ ...noSite, context: 'page' }).description).toBe('');
    expect(resolveSeo({ ...noSite, context: 'page' }).image).toBeNull();
  });

  it('falls back to the page title, then the site name, when a pattern renders empty', () => {
    const empty = { ...SITE, site: { ...SITE.site, titlePattern: { 'en-US': '{{nope.x}}' } } };
    expect(resolveSeo({ ...base, site: empty, context: 'page' }).title).toBe('About');
    expect(resolveSeo({ ...base, site: empty, context: 'page', data: {} }).title).toBe('Sóley');
  });

  it('the setting’s own site name wins over the theme’s', () => {
    const named = { ...SITE, site: { ...SITE.site, name: 'Soley Pottery' } };
    expect(resolveSeo({ ...base, site: named, context: 'page' }).title).toBe(
      'About | Soley Pottery'
    );
  });

  it('orders the share image: entry, content, site', () => {
    expect(
      resolveSeo({
        ...base,
        context: 'page',
        entry: { imageUrl: '/media/e.png' },
        contentImage: 'https://c/x.png',
      }).image
    ).toBe('https://shop.example/media/e.png');
    expect(resolveSeo({ ...base, context: 'page', contentImage: 'https://c/x.png' }).image).toBe(
      'https://c/x.png'
    );
  });

  it('omits canonical and relative images without a site origin', () => {
    const seo = resolveSeo({
      ...base,
      siteUrl: null,
      context: 'page',
      entry: { imageUrl: '/e.png' },
    });
    expect(seo.canonical).toBeNull();
    expect(seo.image).toBe('https://media.example/a1/og');
  });

  it('uses an entry canonical, resolving a relative one against the origin', () => {
    expect(
      resolveSeo({ ...base, context: 'page', entry: { canonicalUrl: '/{{page.title}}' } }).canonical
    ).toBe('https://shop.example/About');
    expect(
      resolveSeo({ ...base, context: 'page', entry: { canonicalUrl: 'javascript:alert(1)' } })
        .canonical
    ).toBeNull();
  });

  it('noindex comes from the entry, the template, or a preview build', () => {
    expect(resolveSeo({ ...base, context: 'page', entry: { noindex: true } }).noindex).toBe(true);
    expect(resolveSeo({ ...base, context: 'page', template: { noindex: true } }).noindex).toBe(
      true
    );
    expect(resolveSeo({ ...base, context: 'page', isPreview: true }).noindex).toBe(true);
    expect(
      resolveSeo({ ...base, context: 'page', isPreview: false, entry: { noindex: false } }).noindex
    ).toBe(false);
  });

  it('strips the query and fragment from the derived canonical', () => {
    expect(resolveSeo({ ...base, context: 'page', path: '/about?x=1#y' }).canonical).toBe(
      'https://shop.example/about'
    );
  });
});

describe('pickSeoLocale', () => {
  it('returns a plain string as it is and junk as empty', () => {
    expect(pickSeoLocale('x', 'en-US')).toBe('x');
    expect(pickSeoLocale(null, 'en-US')).toBe('');
    expect(pickSeoLocale({ 'en-US': 5 as never }, 'en-US')).toBe('');
  });
});
