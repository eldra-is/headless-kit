import type { StorefrontCollectionSelector } from './types';

/**
 * Turns what a block knows about "which collection" into the one identifier the
 * storefront layer takes (`StorefrontCollectionSelector`).
 *
 * A `reference` field targeting catalog collections is the only way a block
 * names a collection — the legacy handle fields are gone. It normally stores the
 * collection's id, so a renamed collection can never silently empty a block, and
 * the public read resolves that id into an object carrying the `slug` too — but
 * not always: at depth 0, and while the page builder is showing an unsaved draft
 * overlay, the value is the bare stub `{ id, _type: 'collection' }`. A theme's
 * own seed is the mirror image (`{ _type: 'collection', slug }`, which Core
 * resolves against the organisation's catalog on deploy). All three are usable,
 * and the `slug` is preferred when it is there because every storefront can look
 * a handle up, while resolving an id may cost an extra request or not be
 * possible at all (`gateway.ts`).
 *
 * `routeSlug` is the collection template's own segment
 * (`storefront.route.collectionHandle`), the fallback for a block dropped onto a
 * collection page with the field left empty — "field wins, route is the
 * fallback". `product-carousel` passes none: it never sits on a collection
 * route's own subject.
 */
export function collectionSelector(
  reference: EldraCollectionReference | null | undefined,
  routeSlug?: string | null
): StorefrontCollectionSelector | null {
  const picked = referenceSelector(reference);
  if (picked !== null) return picked;
  const trimmed = (routeSlug ?? '').trim();
  return trimmed === '' ? null : { slug: trimmed };
}

/** The slug a selector names, or `null` when it names a collection by id — what
 *  a block needs for anything a slug is the only key to, such as a
 *  `/collections/<slug>` link. */
export function selectorSlug(selector: StorefrontCollectionSelector | null): string | null {
  return selector !== null && 'slug' in selector ? selector.slug : null;
}

/** Whether the selector can only be resolved by id: the case a storefront may
 *  not be able to answer, where the block shows its empty state and, in the
 *  editor, the "publish to load products" hint rather than an error. */
export function selectorNeedsPublish(selector: StorefrontCollectionSelector | null): boolean {
  return selector !== null && !('slug' in selector);
}

/** The reference's own identifier. Field data is CMS-authored, so neither key is
 *  assumed to be present at runtime even though the generated type declares
 *  `id` as required. */
function referenceSelector(
  reference: EldraCollectionReference | null | undefined
): StorefrontCollectionSelector | null {
  if (reference === null || reference === undefined) return null;
  const slug = typeof reference.slug === 'string' ? reference.slug.trim() : '';
  if (slug !== '') return { slug };
  const id = typeof reference.id === 'string' ? reference.id.trim() : '';
  return id !== '' ? { id } : null;
}
