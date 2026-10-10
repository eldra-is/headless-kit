import { describe, expect, it } from 'vitest';
import {
  buildDynamicRoutePath,
  catalogRouteTarget,
  matchDynamicRoutePattern,
  parseDynamicRoutePattern,
  resolveRoute,
} from '../dynamicRoute';
import { encodeStega } from '../stega';

const pages = [
  { id: 'home', data: { slug: 'home' } },
  { id: 'static-article', data: { slug: 'fixed', parent: { id: 'articles' } } },
  { id: 'articles', data: { slug: 'articles' } },
];
const templates = [
  {
    id: 'articles-template',
    data: { routePattern: '/articles/:slug', slugField: 'slug', schemaApiId: 'articles' },
  },
  {
    id: 'fallback-template',
    data: { routePattern: '/:handle', slugField: 'handle', schemaApiId: 'products' },
  },
];

describe('dynamic route grammar', () => {
  it.each(['/articles/:slug', '/shop/articles/:articleSlug', '/:slug'])('accepts %s', (pattern) => {
    expect(parseDynamicRoutePattern(pattern)).not.toBeNull();
  });

  it.each([
    '',
    '/',
    'articles/:slug',
    '/articles/:slug/',
    '/articles//:slug',
    '/articles/:slug/edit',
    '/blog/:year/:slug',
    '/articles/*slug',
    '/articles/:bad-name',
    '/articles/:slug?draft=1',
    '/articles/:slug#top',
  ])('rejects %s', (pattern) => {
    expect(parseDynamicRoutePattern(pattern)).toBeNull();
  });

  it('reads a single-segment parameter as not a catch-all', () => {
    expect(parseDynamicRoutePattern('/articles/:slug')).toEqual({
      value: '/articles/:slug',
      prefixSegments: ['articles'],
      paramName: 'slug',
      catchAll: false,
    });
  });

  /**
   * The trailing catch-all a category route is served by (`/categories/:path*`). The star is part of
   * the parameter, never of its name, so `paramName` is what a template's own `slugField` is
   * compared against — `path`, not `path*`.
   */
  it('accepts one trailing catch-all parameter and keeps the star out of its name', () => {
    expect(parseDynamicRoutePattern('/categories/:path*')).toEqual({
      value: '/categories/:path*',
      prefixSegments: ['categories'],
      paramName: 'path',
      catchAll: true,
    });
  });

  /**
   * `*` stays forbidden everywhere else, which is what keeps the catch-all the one wildcard a route
   * template can carry: one star, last, immediately after the parameter name.
   */
  it.each([
    '/categories/:path**',
    '/categories*/:path',
    '/cat*egories/:path*',
    '/categories/:*',
    '/categories/:path*/leaf',
    '/*',
  ])('rejects the misplaced star in %s', (pattern) => {
    expect(parseDynamicRoutePattern(pattern)).toBeNull();
  });
});

describe('catch-all matching', () => {
  const pattern = '/categories/:path*';

  it('joins one or more segments into the parameter without a leading slash', () => {
    expect(matchDynamicRoutePattern(pattern, '/categories/billinn')).toEqual({ path: 'billinn' });
    expect(matchDynamicRoutePattern(pattern, '/categories/billinn/bilstolar')).toEqual({
      path: 'billinn/bilstolar',
    });
    expect(matchDynamicRoutePattern(pattern, '/categories/a/b/c')).toEqual({ path: 'a/b/c' });
  });

  /** Zero segments is the prefix itself, which is not one of the paths the pattern serves. */
  it('refuses the bare prefix and a path outside it', () => {
    expect(matchDynamicRoutePattern(pattern, '/categories')).toBeNull();
    expect(matchDynamicRoutePattern(pattern, '/collections/a/b')).toBeNull();
  });

  /**
   * An encoded separator cannot smuggle a boundary into the joined value: `decodeRequestPath`
   * refuses a segment that decodes to one, so every segment this joins was a segment in the
   * request.
   */
  it('decodes each segment once and refuses an encoded separator', () => {
    expect(matchDynamicRoutePattern(pattern, '/categories/b%C3%ADlinn/barnas%C3%A6ti')).toEqual({
      path: 'bílinn/barnasæti',
    });
    expect(matchDynamicRoutePattern(pattern, '/categories/a%2Fb/c')).toBeNull();
  });

  it('resolves a catch-all template through resolveRoute when its slugField is the param', () => {
    const site = {
      pages: [],
      templates: [
        {
          id: 'category-template',
          data: {
            routePattern: '/categories/:path*',
            slugField: 'path',
            schemaApiId: 'catalog:category',
          },
        },
      ],
    };
    expect(resolveRoute('/categories/billinn/bilstolar', site)).toEqual({
      kind: 'template',
      template: site.templates[0],
      params: { path: 'billinn/bilstolar' },
    });
    // The star is not the field name: a template whose `slugField` carries it matches nothing.
    expect(
      resolveRoute('/categories/billinn', {
        pages: [],
        templates: [
          { id: 'bad', data: { routePattern: '/categories/:path*', slugField: 'path*' } },
        ],
      })
    ).toBeNull();
  });
});

describe('resolveRoute', () => {
  it('gives exact static pages precedence over matching templates', () => {
    expect(resolveRoute('/articles/fixed', { pages, templates })).toEqual({
      kind: 'static',
      entry: pages[1],
    });
  });

  /**
   * **A catalogue page beside a product template.** A storefront seeds `/products` as a static page
   * *and* `/products/:slug` as a route template, and both have to work: the page is where every
   * category crumb points (`/products?category=<slug>`) and the template is every product. They
   * coexist because an exact page is matched before any pattern is tried — nothing about the pattern
   * is excluded, so `/products/ash-glaze-mug` still resolves to the template, and only the bare path
   * is the page's.
   */
  it('lets a static page and a template share a path prefix', () => {
    const storefront = {
      pages: [{ id: 'catalogue', data: { slug: 'products' } }],
      templates: [
        {
          id: 'product-template',
          data: {
            routePattern: '/products/:slug',
            slugField: 'slug',
            schemaApiId: 'catalog:product',
          },
        },
      ],
    };
    expect(resolveRoute('/products', storefront)).toEqual({
      kind: 'static',
      entry: storefront.pages[0],
    });
    expect(resolveRoute('/products/ash-glaze-mug', storefront)).toEqual({
      kind: 'template',
      template: storefront.templates[0],
      params: { slug: 'ash-glaze-mug' },
    });
  });

  it('uses stable template declaration order and extracts the trailing value', () => {
    expect(resolveRoute('/articles/new-story', { pages, templates })).toEqual({
      kind: 'template',
      template: templates[0],
      params: { slug: 'new-story' },
    });
    expect(resolveRoute('/product', { pages, templates })).toEqual({
      kind: 'template',
      template: templates[1],
      params: { handle: 'product' },
    });
    expect(resolveRoute('/articles/new-story/', { pages, templates })).toEqual({
      kind: 'template',
      template: templates[0],
      params: { slug: 'new-story' },
    });
  });

  it('decodes segments once while rejecting malformed and encoded separators', () => {
    expect(matchDynamicRoutePattern('/articles/:slug', '/articles/J%C3%B6kull')).toEqual({
      slug: 'Jökull',
    });
    expect(matchDynamicRoutePattern('/articles/:slug', '/articles/a%2Fb')).toBeNull();
    expect(matchDynamicRoutePattern('/articles/:slug', '/articles/%E0%A4%A')).toBeNull();
  });

  it('returns null for no match, malformed paths, and mismatched slug metadata', () => {
    expect(resolveRoute('/missing/path', { pages, templates })).toBeNull();
    expect(resolveRoute('/articles//bad', { pages, templates })).toBeNull();
    expect(
      resolveRoute('/articles/value', {
        pages: [],
        templates: [{ id: 'bad', data: { routePattern: '/articles/:slug', slugField: 'handle' } }],
      })
    ).toBeNull();
  });
});

describe('catalogRouteTarget', () => {
  it('recognises catalog product, collection and category schema ids', () => {
    expect(catalogRouteTarget('catalog:product')).toBe('product');
    expect(catalogRouteTarget('catalog:collection')).toBe('collection');
    expect(catalogRouteTarget('catalog:category')).toBe('category');
  });

  it('returns null for unrelated or malformed schema ids', () => {
    expect(catalogRouteTarget('guide')).toBeNull();
    expect(catalogRouteTarget('catalog:products')).toBeNull();
    expect(catalogRouteTarget('')).toBeNull();
    expect(catalogRouteTarget(undefined)).toBeNull();
    expect(catalogRouteTarget(null)).toBeNull();
    expect(catalogRouteTarget(42)).toBeNull();
  });

  it('resolves a stega-wrapped schema id', () => {
    const wrapped = encodeStega('catalog:product', {
      entryId: 'template-1',
      fieldPath: 'schemaApiId',
      locale: null,
    });
    expect(catalogRouteTarget(wrapped)).toBe('product');
  });
});

describe('buildDynamicRoutePath', () => {
  it('substitutes and encodes exactly one safe slug segment', () => {
    expect(buildDynamicRoutePath('/articles/:slug', 'Jökull story')).toBe(
      '/articles/J%C3%B6kull%20story'
    );
  });

  it('fails closed for missing and multi-segment slug values', () => {
    expect(buildDynamicRoutePath('/articles/:slug', '')).toBeNull();
    expect(buildDynamicRoutePath('/articles/:slug', 'a/b')).toBeNull();
  });

  /** The round trip the canonical category path relies on: every segment encoded, the separators
   *  kept, so what this builds is what `matchDynamicRoutePattern` reads back. */
  it('encodes each segment of a catch-all value and keeps the separators', () => {
    expect(buildDynamicRoutePath('/categories/:path*', 'billinn/bílstólar')).toBe(
      '/categories/billinn/b%C3%ADlst%C3%B3lar'
    );
    expect(buildDynamicRoutePath('/categories/:path*', 'billinn')).toBe('/categories/billinn');
    expect(
      matchDynamicRoutePattern(
        '/categories/:path*',
        buildDynamicRoutePath('/categories/:path*', 'a/b/c')!
      )
    ).toEqual({ path: 'a/b/c' });
  });

  it('refuses a catch-all value with an empty segment', () => {
    expect(buildDynamicRoutePath('/categories/:path*', '/billinn')).toBeNull();
    expect(buildDynamicRoutePath('/categories/:path*', 'billinn/')).toBeNull();
    expect(buildDynamicRoutePath('/categories/:path*', 'a//b')).toBeNull();
    expect(buildDynamicRoutePath('/categories/:path*', '')).toBeNull();
  });
});
