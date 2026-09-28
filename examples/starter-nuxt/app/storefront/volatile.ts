import type { StorefrontPrice, StorefrontProductListItem, VolatileSnapshot } from './types';

/**
 * The pure half of the prerender/refresh contract (`types.ts`'s `StorefrontResult` doc comment):
 * which products a page's storefront data is *about*, and how a batch of live volatile values is
 * folded back into that data.
 *
 * Framework-free on purpose — no Vue, no network, no component. A storefront implementation asks
 * `collectVolatileTargets` what to fetch, `chunkIds` how to split the request, and
 * `applyVolatileSnapshots` how to swap the answers in; *when* any of that happens, and what
 * `revalidating` says while it does, is the implementation's own business.
 *
 * **Identity.** A product is addressed by `StorefrontProductListItem.variantId` — the id field
 * every card already carries, which `gateway.ts`'s list mapping fills from the product's own `id`
 * and which the demo fixture fills with its variant key. There is no second id field: adding one
 * would mean two ways to name the same product and two chances to disagree.
 *
 * **Identity, the other kind.** `applyVolatileSnapshots` returns the *same object* when nothing
 * changed, and leaves every untouched item at its own reference when something did. That is not
 * an optimisation for its own sake: a refresh that returns exactly the values the page was built
 * with — the ordinary case — must not make Vue re-render a single card.
 */

/**
 * Ids per batched read. The gateway takes the whole set in one repeatable `id:in:a,b,c` filter
 * token, and a URL has a length; 50 keeps a full collection page to one or two requests without
 * ever writing a query string a proxy might truncate.
 */
export const VOLATILE_CHUNK_SIZE = 50;

/** Splits ids into `size`-long batches, in order. `[]` in, `[]` out — nothing to ask about. */
export function chunkIds(ids: readonly string[], size: number = VOLATILE_CHUNK_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += size) {
    chunks.push(ids.slice(start, start + size));
  }
  return chunks;
}

/**
 * The distinct product ids in any storefront data shape a commerce block renders — a single
 * product (`product-detail`), a card list (`related`/`byHandles`, the carousel), the collection
 * grid's `{ items, total, facets }`, or a search response's `products`. First-seen order, no
 * repeats, so the request a caller builds from it is stable across renders.
 *
 * Anything else — `null`, a cart snapshot, an order, a shape this theme has not grown yet —
 * answers `[]`. Guessing at an unknown shape would mean fetching for a page that cannot use the
 * answer, so the narrow list above is the whole of it.
 */
export function collectVolatileTargets(data: unknown): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of productItemsOf(data)) {
    if (item.variantId === '' || seen.has(item.variantId)) continue;
    seen.add(item.variantId);
    ids.push(item.variantId);
  }
  return ids;
}

/**
 * The same data back, with `price.amount`, `price.compareAt`, `available`, `stock` — and
 * `inventory` where both the snapshot and the product carry one — replaced for every product whose
 * id matches a snapshot. Everything else is the prerendered value, at its original reference.
 *
 * An id no snapshot mentions keeps all of its values (a refresh that could not see a product must
 * not blank it), and a snapshot no item matches is ignored.
 */
export function applyVolatileSnapshots<T>(data: T, snapshots: readonly VolatileSnapshot[]): T {
  if (snapshots.length === 0) return data;
  const byId = new Map<string, VolatileSnapshot>();
  for (const snapshot of snapshots) byId.set(snapshot.id, snapshot);
  return applyToContainer(data, byId) as T;
}

// ---------------------------------------------------------------------------------------------
// Shape narrowing — the concrete containers the commerce blocks read, and nothing else
// ---------------------------------------------------------------------------------------------

/** The keys a storefront container holds its product cards under. */
const PRODUCT_LIST_KEYS = ['items', 'products'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * A product card or a full product — the two shapes that carry volatile values. The check is
 * structural rather than nominal because the data reaches here as plain JSON-ish objects, and it
 * is deliberately narrow: a `StorefrontCartLine` also has a `variantId` and a `title`, but no
 * `handle` and no `price` object, so it is not one of these.
 */
function isProductItem(value: unknown): value is StorefrontProductListItem {
  if (!isRecord(value)) return false;
  if (typeof value.handle !== 'string' || typeof value.variantId !== 'string') return false;
  const price = value.price;
  return isRecord(price) && typeof price.amount === 'number';
}

function productItemsOf(data: unknown): readonly StorefrontProductListItem[] {
  if (isProductItem(data)) return [data];
  if (Array.isArray(data)) return data.filter(isProductItem);
  if (isRecord(data)) {
    for (const key of PRODUCT_LIST_KEYS) {
      const list = data[key];
      if (Array.isArray(list)) return list.filter(isProductItem);
    }
  }
  return [];
}

// ---------------------------------------------------------------------------------------------
// Applying — every step returns its input unchanged when nothing about it changed
// ---------------------------------------------------------------------------------------------

function applyToContainer(data: unknown, byId: Map<string, VolatileSnapshot>): unknown {
  if (isProductItem(data)) return applyToItem(data, byId);
  if (Array.isArray(data)) return applyToList(data, byId);
  if (isRecord(data)) {
    let next: Record<string, unknown> | null = null;
    for (const key of PRODUCT_LIST_KEYS) {
      const list = data[key];
      if (!Array.isArray(list)) continue;
      const mapped = applyToList(list, byId);
      if (mapped === list) continue;
      next ??= { ...data };
      next[key] = mapped;
    }
    return next ?? data;
  }
  return data;
}

/**
 * A card, or a full product — which carries an `inventory` the card does not. One working type
 * rather than a cast: the applying code only ever needs to know whether the field is there.
 */
type VolatileItem = StorefrontProductListItem & { inventory?: number | null };

function applyToList(list: readonly unknown[], byId: Map<string, VolatileSnapshot>): unknown[] {
  let changed = false;
  const next = list.map((entry) => {
    if (!isProductItem(entry)) return entry;
    const updated = applyToItem(entry, byId);
    if (updated !== entry) changed = true;
    return updated;
  });
  return changed ? next : (list as unknown[]);
}

function applyToItem(item: VolatileItem, byId: Map<string, VolatileSnapshot>): VolatileItem {
  const snapshot = byId.get(item.variantId);
  if (snapshot === undefined) return item;

  const price = applyPrice(item.price, snapshot.price);
  // `inventory` only exists on a `StorefrontProduct`; a card must not grow the field, and a
  // snapshot that says nothing about stock counts must not erase one the page already shows.
  const inventoryApplies =
    'inventory' in snapshot && 'inventory' in item && snapshot.inventory !== item.inventory;

  if (
    price === item.price &&
    item.available === snapshot.available &&
    item.stock === snapshot.stock &&
    !inventoryApplies
  ) {
    return item;
  }

  const next: VolatileItem = {
    ...item,
    price,
    available: snapshot.available,
    stock: snapshot.stock,
  };
  if (inventoryApplies) next.inventory = snapshot.inventory ?? null;
  return next;
}

/**
 * `amount` and `compareAt` only. `from` is the price *spread* across a product's variants, which
 * a card shows as "From $X" — it is a shape of the catalogue, not a value that moves between
 * builds, and taking it off the snapshot would let a refresh of a detail product (whose price has
 * no `from`) grow one.
 *
 * `undefined` and `null` both mean "no compare-at price", so a snapshot that spells it the other
 * way round is not a change.
 */
function applyPrice(current: StorefrontPrice, next: StorefrontPrice): StorefrontPrice {
  const compareAt = next.compareAt ?? null;
  if (current.amount === next.amount && (current.compareAt ?? null) === compareAt) return current;
  return { ...current, amount: next.amount, compareAt };
}
