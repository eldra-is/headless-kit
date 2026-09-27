import type { StorefrontCollectionSelector } from './types';

/**
 * Turns what a block knows about "which collection" into the one identifier the
 * storefront layer takes (`StorefrontCollectionSelector`).
 *
 * A `reference` field targeting catalog collections stores the collection's id,
 * so a renamed collection can never silently empty a block. The public read
 * resolves that id into an object carrying the `slug` too — but not always: at
 * depth 0, and while the page builder is showing an unsaved draft overlay, the
 * value is the bare stub `{ id, _type: 'collection' }`. Both are usable, so a
 * picked collection wins over the block's legacy handle field either way; the
 * `slug` is preferred when it is there because every storefront can look a
 * handle up, while resolving an id may cost an extra request or not be possible
 * at all (`gateway.ts`).
 *
 * `fallbackSlugs` are the block's own slug sources, in the order it wants them
 * tried — the legacy handle field, then (for a block that can sit on a
 * collection template) the route's own collection.
 */
export function collectionSelector(
  reference: EldraCollectionReference | null | undefined,
  ...fallbackSlugs: Array<string | null | undefined>
): StorefrontCollectionSelector | null {
  const picked = referenceSelector(reference);
  if (picked !== null) return picked;
  for (const slug of fallbackSlugs) {
    const trimmed = (slug ?? '').trim();
    if (trimmed !== '') return { slug: trimmed };
  }
  return null;
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
