import { describe, expect, it } from 'vitest';
import {
  collectionSelector,
  selectorNeedsPublish,
  selectorSlug,
} from '../../app/storefront/collectionSelector';

/**
 * The resolution order the three commerce blocks share (`product-carousel`,
 * `collection-grid`, `collection-header`): the picked collection's resolved
 * `slug`, then its bare id, then — for a block that can sit on a collection
 * template — the route's own collection. Asserted here rather than only through
 * the blocks, because the demo storefront answers a slug and an id equally well
 * — so a block test cannot tell the two apart, and the order would go
 * unguarded.
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

  it('reads a seed reference, which names its collection by slug and carries no id', () => {
    // What `pages/home.page.json` ships and Core writes when it cannot resolve
    // the slug to one of the organisation's own collections: the block still
    // has a usable selector without the round trip.
    expect(
      collectionSelector({
        _type: 'collection',
        slug: 'the-winter-edit',
      } as EldraCollectionReference)
    ).toEqual({ slug: 'the-winter-edit' });
  });

  it('lets a reference with a slug beat the route', () => {
    expect(collectionSelector({ id: ID, _type: 'collection', slug: 'picked' }, 'route')).toEqual({
      slug: 'picked',
    });
  });

  it('lets a stub reference beat the route too — the field overrides it', () => {
    expect(collectionSelector({ id: ID, _type: 'collection' }, 'route')).toEqual({ id: ID });
  });

  it('falls back to the route’s collection, and to nothing at all', () => {
    expect(collectionSelector(null, 'route')).toEqual({ slug: 'route' });
    expect(collectionSelector(null, '  ')).toBeNull();
    expect(collectionSelector(null, null)).toBeNull();
    expect(collectionSelector(undefined)).toBeNull();
  });

  it('trims the route’s handle and ignores a reference with neither key', () => {
    expect(collectionSelector(null, '  spaced  ')).toEqual({ slug: 'spaced' });
    expect(
      collectionSelector({ slug: '   ' } as unknown as EldraCollectionReference, 'route')
    ).toEqual({ slug: 'route' });
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
