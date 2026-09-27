import { describe, expect, it } from 'vitest';
import {
  collectionSelector,
  selectorNeedsPublish,
  selectorSlug,
} from '../../app/storefront/collectionSelector';

/**
 * The resolution order two blocks share (`product-carousel`, `collection-grid`):
 * a picked collection always wins over the slug sources behind it, and its
 * resolved `slug` is preferred over its bare id. Asserted here rather than only
 * through the blocks, because the demo storefront answers a slug and an id
 * equally well — so a block test cannot tell the two apart, and the order would
 * go unguarded.
 */
const ID = '2f1b8d54-0d3a-4a6f-9a0b-7f6c1d2e3a01';

describe('collectionSelector', () => {
  it('prefers the reference’s resolved slug over its own id', () => {
    expect(collectionSelector({ id: ID, _type: 'collection', slug: 'winter-knitwear' })).toEqual({
      slug: 'winter-knitwear',
    });
  });

  it('falls back to the reference’s id when it carries no slug', () => {
    expect(collectionSelector({ id: ID, _type: 'collection' })).toEqual({ id: ID });
  });

  it('lets a reference with a slug beat every fallback slug', () => {
    expect(
      collectionSelector({ id: ID, _type: 'collection', slug: 'picked' }, 'legacy-handle', 'route')
    ).toEqual({ slug: 'picked' });
  });

  it('lets a stub reference beat every fallback slug too — the field overrides the handle', () => {
    expect(collectionSelector({ id: ID, _type: 'collection' }, 'legacy-handle', 'route')).toEqual({
      id: ID,
    });
  });

  it('takes the fallbacks in the order the block gave them', () => {
    expect(collectionSelector(null, 'legacy-handle', 'route')).toEqual({ slug: 'legacy-handle' });
    expect(collectionSelector(null, '', 'route')).toEqual({ slug: 'route' });
    expect(collectionSelector(null, '  ', null)).toBeNull();
    expect(collectionSelector(undefined)).toBeNull();
  });

  it('trims a hand-typed handle and ignores a reference with neither key', () => {
    expect(collectionSelector(null, '  spaced  ')).toEqual({ slug: 'spaced' });
    expect(
      collectionSelector({ slug: '   ' } as unknown as EldraCollectionReference, 'legacy')
    ).toEqual({ slug: 'legacy' });
  });

  it('reports the slug, and whether only an id is known', () => {
    expect(selectorSlug({ slug: 'winter-knitwear' })).toBe('winter-knitwear');
    expect(selectorSlug({ id: ID })).toBeNull();
    expect(selectorSlug(null)).toBeNull();
    expect(selectorNeedsPublish({ id: ID })).toBe(true);
    expect(selectorNeedsPublish({ slug: 'winter-knitwear' })).toBe(false);
    expect(selectorNeedsPublish(null)).toBe(false);
  });
});
