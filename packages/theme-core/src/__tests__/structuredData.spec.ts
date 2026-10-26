import { describe, expect, it } from 'vitest';
import {
  applyStructuredDataPolicy,
  buildBreadcrumbLd,
  buildItemListLd,
  buildOrganizationLd,
  buildProductLd,
  buildWebSiteLd,
  ldPlainText,
  ldPrice,
  serializeLd,
  validGtin,
  type ProductLdVariant,
} from '../structuredData';

const variant = (over: Partial<ProductLdVariant> = {}): ProductLdVariant => ({
  sku: 'SKU-1',
  price: 28,
  availability: 'InStock',
  ...over,
});

const base = { url: 'https://shop.test/products/mug', name: 'Mug', currency: 'USD' };

describe('buildProductLd', () => {
  it('writes one variant as a single Offer with sku, gtin and availability URL', () => {
    const ld = buildProductLd({
      ...base,
      images: ['https://cdn.test/a.jpg'],
      brand: 'Acme',
      variants: [variant({ gtin: '4006381333931', url: 'https://shop.test/products/mug' })],
    });
    expect(ld).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Mug',
      image: ['https://cdn.test/a.jpg'],
      brand: { '@type': 'Brand', name: 'Acme' },
      sku: 'SKU-1',
      gtin: '4006381333931',
      offers: {
        '@type': 'Offer',
        price: 28,
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        gtin: '4006381333931',
      },
    });
  });

  it('writes variants at one price as one Offer, with the most buyable availability', () => {
    const ld = buildProductLd({
      ...base,
      variants: [
        variant({ sku: 'S', availability: 'OutOfStock' }),
        variant({ sku: 'M', availability: 'InStock' }),
      ],
    });
    const offers = ld.offers as Record<string, unknown>;
    expect(offers['@type']).toBe('Offer');
    expect(offers.availability).toBe('https://schema.org/InStock');
    expect(offers.sku).toBeUndefined();
    expect(ld.sku).toBeUndefined();
  });

  it('writes variants at different prices as an AggregateOffer with one Offer each', () => {
    const ld = buildProductLd({
      ...base,
      variants: [variant({ sku: 'S', price: 20 }), variant({ sku: 'L', price: 35.5 })],
    });
    expect(ld.offers).toMatchObject({
      '@type': 'AggregateOffer',
      lowPrice: 20,
      highPrice: 35.5,
      priceCurrency: 'USD',
      offerCount: 2,
    });
    const offers = (ld.offers as { offers: Array<Record<string, unknown>> }).offers;
    expect(offers.map((o) => o.sku)).toEqual(['S', 'L']);
  });

  it('keeps an out-of-stock product as an Offer marked OutOfStock', () => {
    const ld = buildProductLd({ ...base, variants: [variant({ availability: 'OutOfStock' })] });
    expect((ld.offers as Record<string, unknown>).availability).toBe(
      'https://schema.org/OutOfStock'
    );
  });

  it('writes the compare-at price as a list price only when it is above the price', () => {
    const sale = buildProductLd({ ...base, variants: [variant({ price: 20, compareAt: 28 })] });
    expect((sale.offers as Record<string, unknown>).priceSpecification).toMatchObject({
      priceType: 'https://schema.org/ListPrice',
      price: 28,
    });
    const none = buildProductLd({ ...base, variants: [variant({ price: 20, compareAt: 20 })] });
    expect((none.offers as Record<string, unknown>).priceSpecification).toBeUndefined();
  });

  it('rounds to the currency’s own fraction digits (ISK none, USD two, KWD three)', () => {
    expect(ldPrice(2800.4, 'ISK')).toBe(2800);
    expect(ldPrice(28.999, 'USD')).toBe(29);
    expect(ldPrice(28.1234, 'KWD')).toBe(28.123);
    expect(ldPrice(1.5, 'NOT-A-CODE')).toBe(1.5);
    const ld = buildProductLd({ ...base, currency: 'ISK', variants: [variant({ price: 2800 })] });
    expect((ld.offers as Record<string, unknown>).price).toBe(2800);
  });

  it('writes no offers without a currency, and omits every empty value', () => {
    const ld = buildProductLd({
      url: 'https://shop.test/p',
      name: 'Mug',
      description: '  ',
      images: [],
      brand: '',
      currency: '',
      variants: [variant({ sku: '' })],
    });
    expect(ld).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Mug',
      url: 'https://shop.test/p',
    });
    expect(JSON.stringify(ld)).not.toContain('""');
  });

  it('keeps a free product (price 0) and writes ratings only when real', () => {
    const free = buildProductLd({ ...base, variants: [variant({ price: 0 })] });
    expect((free.offers as Record<string, unknown>).price).toBe(0);
    expect(free.aggregateRating).toBeUndefined();
    expect(
      buildProductLd({ ...base, variants: [variant()], ratings: { value: 4.5, count: 0 } })
        .aggregateRating
    ).toBeUndefined();
    expect(
      buildProductLd({ ...base, variants: [variant()], ratings: { value: 4.5, count: 12 } })
        .aggregateRating
    ).toEqual({ '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 12 });
  });
});

describe('validGtin', () => {
  it('accepts GTIN-8/12/13/14 with a correct check digit and strips separators', () => {
    expect(validGtin('96385074')).toBe('96385074');
    expect(validGtin('036000291452')).toBe('036000291452');
    expect(validGtin('4006381333931')).toBe('4006381333931');
    expect(validGtin('4006-3813 33931')).toBe('4006381333931');
    expect(validGtin('10012345678902')).toBe('10012345678902');
  });
  it('rejects wrong length, wrong check digit, letters and empties', () => {
    expect(validGtin('4006381333932')).toBeNull();
    expect(validGtin('12345')).toBeNull();
    expect(validGtin('ABC-123')).toBeNull();
    expect(validGtin('')).toBeNull();
    expect(validGtin(null)).toBeNull();
  });
  it('leaves an invalid barcode out of the offer', () => {
    const ld = buildProductLd({ ...base, variants: [variant({ gtin: 'internal-42' })] });
    expect(JSON.stringify(ld)).not.toContain('gtin');
  });
});

describe('other builders', () => {
  it('builds a BreadcrumbList with positions and URLs', () => {
    expect(
      buildBreadcrumbLd([
        { name: 'Home', url: 'https://shop.test/' },
        { name: '', url: 'https://shop.test/x' },
        { name: 'Mug', url: 'https://shop.test/products/mug' },
      ])
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://shop.test/' },
        { '@type': 'ListItem', position: 2, name: 'Mug', item: 'https://shop.test/products/mug' },
      ],
    });
  });

  it('builds an ItemList', () => {
    expect(buildItemListLd([{ url: '/a', name: 'A' }]).itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, url: '/a', name: 'A' },
    ]);
  });

  it('builds an Organization from what is known, no more', () => {
    expect(
      buildOrganizationLd({
        name: 'Acme',
        url: 'https://shop.test',
        logo: 'https://media.test/icon-512',
        sameAs: ['https://x.test/acme'],
        contact: { email: 'hi@acme.test', telephone: null },
      })
    ).toMatchObject({
      '@type': 'Organization',
      logo: 'https://media.test/icon-512',
      sameAs: ['https://x.test/acme'],
      contactPoint: { '@type': 'ContactPoint', email: 'hi@acme.test' },
    });
    const bare = buildOrganizationLd({ name: 'Acme', url: 'https://shop.test', contact: {} });
    expect(Object.keys(bare).sort()).toEqual(['@context', '@type', 'name', 'url']);
  });

  it('writes the legal name, tax ID and address, and no address when it is all empty', () => {
    const org = buildOrganizationLd({
      name: 'Eldra',
      url: 'https://eldra.is',
      legalName: 'Eldra Tech ehf.',
      taxID: '500826-1770',
      address: { addressLocality: 'Reykjavík', addressCountry: 'IS', streetAddress: ' ' },
    });
    expect(org).toMatchObject({ legalName: 'Eldra Tech ehf.', taxID: '500826-1770' });
    expect(org.address).toEqual({
      '@type': 'PostalAddress',
      addressLocality: 'Reykjavík',
      addressCountry: 'IS',
    });
    const blank = buildOrganizationLd({
      name: 'Eldra',
      url: 'https://eldra.is',
      legalName: '',
      address: { streetAddress: null, postalCode: '' },
    });
    expect(Object.keys(blank).sort()).toEqual(['@context', '@type', 'name', 'url']);
  });

  it('writes a WebSite alternate name only when given one', () => {
    expect(
      buildWebSiteLd({ name: 'Eldra', alternateName: ['eldra.is'], url: 'https://eldra.is' })
        .alternateName
    ).toEqual(['eldra.is']);
    expect(
      buildWebSiteLd({ name: 'Eldra', alternateName: [], url: 'https://eldra.is' }).alternateName
    ).toBeUndefined();
  });

  it('writes a SearchAction only when a search page exists', () => {
    const withSearch = buildWebSiteLd({
      name: 'Acme',
      url: 'https://shop.test/',
      searchPath: '/search',
    });
    expect(withSearch.potentialAction).toEqual({
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://shop.test/search?q={search_term_string}',
      },
      'query-input': 'required name=search_term_string',
    });
    expect(
      buildWebSiteLd({ name: 'Acme', url: 'https://shop.test', searchPath: null }).potentialAction
    ).toBeUndefined();
  });
});

describe('serializeLd', () => {
  it('escapes < so a product cannot close the script tag, and stays valid JSON', () => {
    const ld = buildProductLd({
      ...base,
      name: '</script><script>alert(1)</script> \u2028',
      variants: [],
    });
    const text = serializeLd([ld]);
    expect(text).not.toContain('<');
    expect(text).not.toContain('\u2028');
    expect((JSON.parse(text) as { name: string }).name).toBe(
      '</script><script>alert(1)</script> \u2028'
    );
  });
  it('writes one node as itself and several as an array', () => {
    expect(JSON.parse(serializeLd([{ a: 1 }]))).toEqual({ a: 1 });
    expect(JSON.parse(serializeLd([{ a: 1 }, { b: 2 }]))).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

describe('ldPlainText', () => {
  it('strips tags, flattens a rich-text document and caps at the limit on a word', () => {
    expect(ldPlainText('<p>Hello   <b>world</b></p>')).toBe('Hello world');
    expect(
      ldPlainText({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
      })
    ).toBe('Hi');
    expect(ldPlainText(undefined)).toBe('');
    const long = ldPlainText('word '.repeat(2000));
    expect(long.length).toBeLessThanOrEqual(5000);
    expect(long.endsWith('word')).toBe(true);
  });
});

describe('applyStructuredDataPolicy', () => {
  const entries = [
    { type: 'product' as const, node: { '@type': 'Product' } },
    { type: 'breadcrumb' as const, node: { '@type': 'BreadcrumbList' } },
    { type: 'itemList' as const, node: {} },
  ];
  const ctx = { path: '/p', locale: 'en-US' };

  it('passes every non-empty node by default', () => {
    expect(applyStructuredDataPolicy(entries, {}, ctx)).toHaveLength(2);
  });
  it('disables per kind, or everything with true', () => {
    expect(applyStructuredDataPolicy(entries, { disable: ['product'] }, ctx)).toEqual([
      { '@type': 'BreadcrumbList' },
    ]);
    expect(applyStructuredDataPolicy(entries, { disable: true }, ctx)).toEqual([]);
  });
  it('lets an extender edit or drop a node, with the page context', () => {
    const seen: string[] = [];
    const out = applyStructuredDataPolicy(
      entries,
      {
        extend: (type, node, context) => {
          seen.push(`${type}@${context.path}`);
          return type === 'product' ? { ...node, mpn: 'X' } : null;
        },
      },
      ctx
    );
    expect(out).toEqual([{ '@type': 'Product', mpn: 'X' }]);
    expect(seen).toEqual(['product@/p', 'breadcrumb@/p']);
  });
});

describe('untrusted input stays linear', () => {
  it('strips tags and trailing slashes from hostile strings without backtracking', () => {
    const lt = '<'.repeat(100_000);
    const started = performance.now();
    expect(ldPlainText(`a<b>c ${lt}`)).toBe(`a c ${lt}`.slice(0, 5000).trim());
    const site = buildWebSiteLd({
      name: 'S',
      url: `https://x.is${'/'.repeat(100_000)}`,
      searchPath: '/search',
    });
    expect(JSON.stringify(site)).toContain(
      '"urlTemplate":"https://x.is/search?q={search_term_string}"'
    );
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('drops every closed tag and keeps an unclosed one as text', () => {
    expect(ldPlainText('<p>Hello <b>world</b></p>')).toBe('Hello world');
    expect(ldPlainText('1 < 2 and more')).toBe('1 < 2 and more');
  });
});
