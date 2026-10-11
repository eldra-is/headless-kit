/**
 * The canonical request path, and the route key built from it.
 *
 * A generated site is `<route>/index.html`, and static hosts disagree about which URL that file
 * lives at: the deployed Eldra preview host answers `/products/ash-glaze-mug` with a 308 to
 * `/products/ash-glaze-mug/`, while the artifact was prerendered at the path without the slash.
 * Everything the theme keys by the path has to call both of those the same route, or Nuxt's
 * hydration re-navigates between them and rebuilds the page — see `src/runtime/routePath.ts` and
 * `examples/starter-nuxt/test/prerenderRefresh.browser.spec.ts`, which proves the consequence in a
 * real browser.
 */
import { describe, expect, it } from 'vitest';
import { canonicalRoutePath, eldraRouteKey } from '../src/runtime/routePath';

describe('canonicalRoutePath', () => {
  it('calls a path and the same path with a trailing slash one route', () => {
    expect(canonicalRoutePath('/products/ash-glaze-mug/')).toBe('/products/ash-glaze-mug');
    expect(canonicalRoutePath('/products/ash-glaze-mug')).toBe('/products/ash-glaze-mug');
  });

  it('keeps the site root a single slash, however many it arrives with', () => {
    expect(canonicalRoutePath('/')).toBe('/');
    expect(canonicalRoutePath('//')).toBe('/');
  });

  it('strips every trailing slash, not just the last one', () => {
    expect(canonicalRoutePath('/collections/the-winter-edit//')).toBe(
      '/collections/the-winter-edit'
    );
  });

  it('leaves an interior slash alone', () => {
    expect(canonicalRoutePath('/a/b/c')).toBe('/a/b/c');
  });
});

describe('eldraRouteKey', () => {
  it('gives the two spellings of one page the same key', () => {
    expect(eldraRouteKey({ path: '/products/ash-glaze-mug/' })).toBe(
      eldraRouteKey({ path: '/products/ash-glaze-mug' })
    );
  });

  it('still tells two different pages apart', () => {
    expect(eldraRouteKey({ path: '/products/a' })).not.toBe(eldraRouteKey({ path: '/products/b' }));
  });
});
