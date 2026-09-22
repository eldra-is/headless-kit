import { describe, expect, it } from 'vitest';
import {
  buildDynamicRoutePath,
  matchDynamicRoutePattern,
  parseDynamicRoutePattern,
  resolveRoute,
} from '../dynamicRoute';

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
});

describe('resolveRoute', () => {
  it('gives exact static pages precedence over matching templates', () => {
    expect(resolveRoute('/articles/fixed', { pages, templates })).toEqual({
      kind: 'static',
      entry: pages[1],
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
});
