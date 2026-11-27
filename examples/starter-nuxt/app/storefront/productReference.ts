/**
 * The handle a block's product `reference` field names, or `null`.
 *
 * Like a collection reference (`collectionSelector.ts`), the value takes three shapes: the public
 * read resolves a stored `{ _type: 'product', id }` into the product, `slug` included; a theme's own
 * seed is `{ _type: 'product', slug }`, which Core resolves on deploy; and at depth 0, or while the
 * page builder shows an unsaved draft, it is the bare stub `{ _type: 'product', id }`. Only a slug is
 * something every storefront can look up, so the stub names nothing yet. Field data is
 * CMS-authored, so no key is assumed to be present.
 */
export function productReferenceSlug(reference: unknown): string | null {
  if (reference === null || typeof reference !== 'object') return null;
  const { _type: type, slug } = reference as { _type?: unknown; slug?: unknown };
  if (type !== undefined && type !== 'product') return null;
  const trimmed = typeof slug === 'string' ? slug.trim() : '';
  return trimmed === '' ? null : trimmed;
}
