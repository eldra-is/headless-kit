/**
 * The store's **category tree**, and the two things a theme does with it: a product's breadcrumb
 * trail, and the parent rows the collection grid's category facet is drawn with.
 *
 * `GET /catalog/v1/categories` answers the whole list in one read — `{id, slug, title, parentId}`
 * per row, a tree by `parentId` — and a product carries `primaryCategoryId` (plus `categoryIds`, the
 * full set). Neither read carries a *trail*: the ancestors are the theme's own walk up the tree,
 * which is what this file is.
 *
 * Everything here is pure — no Vue, no client, no module state — so both storefront sources share it
 * (`gateway.ts` builds the index from the live read, `demo.ts` from its fixture) and
 * `test/storefront/categories.spec.ts` can pin every bound without mounting anything.
 *
 * **Where a category crumb links to.** This theme has no `/categories/<slug>` route: the only
 * catalogue surfaces are `/collections/<slug>` (one authored collection) and `/products` (the whole
 * catalogue, seeded by `pages/products.page.json`), and a category is neither a collection nor a
 * page. So a crumb links to the catalogue filtered by that category — `/products?category=<slug>` —
 * which is the `collection-grid` query vocabulary that page's own grid already reads back
 * (`QUERY_KEY.category`), so following a crumb lands on a grid with that category ticked, its chip
 * drawn and the URL shareable. A theme that grows a real category route changes `categoryHref`
 * and nothing else.
 */

/** One row of the store's category list. Loose, like every raw gateway shape this theme reads. */
export interface CategoryRow {
  id?: string;
  slug?: string;
  title?: string;
  /** `null`/absent for a root. */
  parentId?: string | null;
}

/** One category, as this theme needs it: always identified, always named, parent or root. */
export interface CategoryNode {
  id: string;
  slug: string;
  title: string;
  parentId: string | null;
}

/**
 * The store's categories, by id and by slug.
 *
 * Both lookups are needed and for different jobs: `byId` walks a product's `primaryCategoryId` up to
 * its root (and gives a facet term its parent), `idBySlug` turns a shopper's `?category=ceramics`
 * into the `categoryId` the catalog list filters by.
 */
export interface CategoryIndex {
  byId: ReadonlyMap<string, CategoryNode>;
  idBySlug: ReadonlyMap<string, string>;
}

export const EMPTY_CATEGORY_INDEX: CategoryIndex = { byId: new Map(), idBySlug: new Map() };

/**
 * A row is only usable with all three of an id, a slug and a title: the id is what a product and a
 * facet term name it by, the slug is what a URL and a filter are spelled with, and the title is the
 * only thing a shopper can read. A row missing any of them is dropped rather than shown as a crumb
 * labelled with a uuid.
 */
export function buildCategoryIndex(rows: readonly CategoryRow[] | null | undefined): CategoryIndex {
  const byId = new Map<string, CategoryNode>();
  const idBySlug = new Map<string, string>();
  for (const row of rows ?? []) {
    const { id, slug, title } = row;
    if (typeof id !== 'string' || id === '') continue;
    if (typeof slug !== 'string' || slug === '') continue;
    if (typeof title !== 'string' || title === '') continue;
    byId.set(id, { id, slug, title, parentId: row.parentId ?? null });
    // First row wins a duplicate slug, the same way the whole-store slug→id lookup always behaved.
    if (!idBySlug.has(slug)) idBySlug.set(slug, id);
  }
  return { byId, idBySlug };
}

/**
 * The path the catalogue grid lives at — `pages/products.page.json`'s own slug. One constant so the
 * trail, the docs and the specs cannot drift from the page.
 */
export const CATALOGUE_PATH = '/products';

/** Where a category crumb goes: the catalogue, filtered by that category. See the file comment. */
export function categoryHref(slug: string): string {
  return `${CATALOGUE_PATH}?category=${encodeURIComponent(slug)}`;
}

/**
 * How deep a trail may go before this stops walking.
 *
 * A guard against a cycle in the data, not a product decision: a category whose `parentId` points at
 * a descendant (or at itself) would otherwise walk for ever inside a `computed`, where a throw takes
 * the whole block down. Six is well past any storefront's real depth, and the `seen` set below
 * already catches an outright loop — this catches the pathological chain too.
 */
const MAX_TRAIL_DEPTH = 6;

/** One crumb: what the shopper reads, and where it goes. */
export interface CategoryCrumb {
  label: string;
  href: string;
}

/**
 * A product's category trail, **root ancestor first, the product's own category last**.
 *
 * `[]` for every honest "no trail": a product with no category (`null`/`''`), a `primaryCategoryId`
 * the category list does not hold (a category since unpublished, or a list this read could not
 * reach), or an index that is empty because the read failed. A product page without a category crumb
 * is a page; a page with a crumb reading `undefined` is a bug, so there is no fallback label here.
 *
 * The last level is still a link. A product's category is not the current page — the product is — so
 * every level stays followable, which is also why `product-detail` draws the trail itself rather
 * than through `@eldrajs/ui`'s `Breadcrumb` (that one always renders its last item as the current
 * page).
 */
export function categoryTrailFor(
  index: CategoryIndex,
  categoryId: string | null | undefined
): CategoryCrumb[] {
  const trail: CategoryCrumb[] = [];
  const seen = new Set<string>();
  let id = categoryId ?? null;
  while (id !== null && id !== '' && trail.length < MAX_TRAIL_DEPTH && !seen.has(id)) {
    seen.add(id);
    const node = index.byId.get(id);
    if (node === undefined) break;
    trail.unshift({ label: node.title, href: categoryHref(node.slug) });
    id = node.parentId;
  }
  return trail;
}

/** The ancestors of a category, root first, excluding the category itself. */
export function ancestorsOf(index: CategoryIndex, categoryId: string): CategoryNode[] {
  const out: CategoryNode[] = [];
  const seen = new Set<string>([categoryId]);
  let id = index.byId.get(categoryId)?.parentId ?? null;
  while (id !== null && id !== '' && out.length < MAX_TRAIL_DEPTH && !seen.has(id)) {
    seen.add(id);
    const node = index.byId.get(id);
    if (node === undefined) break;
    out.unshift(node);
    id = node.parentId;
  }
  return out;
}

/** The shape `completeCategoryTerms` reads and writes — `CatalogFacetTerm`, structurally. */
export interface CategoryTermLike {
  id: string;
  slug: string;
  title: string;
  count: number;
  parentId?: string | null;
}

/**
 * The category facet's terms, **completed into a tree the panel can nest**: every term gains the
 * `parentId` the store's category list knows for it, and every missing ancestor is appended as a
 * term of its own with a count of 0.
 *
 * Both halves exist because of what a facet *is*. The platform counts the categories products are
 * **assigned** to, which in a real store are the leaves: a catalogue of cups, bowls and dishes
 * answers three terms and never names Tableware, so a flat list of the three is all the panel could
 * draw. The parent row the shopper actually wants to tick has to be synthesised, and the only place
 * its slug and title exist is the category list.
 *
 * A count of 0 on a synthesised parent is not a claim: `collection-grid` rolls a parent's count up
 * from its descendants before it decides anything (see `parts/groups.ts`), and until Core sends
 * ancestor counts that roll-up is the only number there is.
 *
 * **Core's own `parentId` wins when it sends one.** This runs only over terms that carry none
 * (`gateway.ts`'s `withCategoryTree` skips the whole pass, and the categories read with it, once the
 * platform's facets describe their own tree), so a term the platform has placed is never re-parented
 * from a list read that may be a request older.
 */
export function completeCategoryTerms<T extends CategoryTermLike>(
  terms: readonly T[],
  index: CategoryIndex
): Array<T | CategoryTermLike> {
  if (terms.length === 0 || index.byId.size === 0) return [...terms];
  const out: Array<T | CategoryTermLike> = terms.map((term) =>
    term.parentId === undefined
      ? { ...term, parentId: index.byId.get(term.id)?.parentId ?? null }
      : term
  );
  const listed = new Set(out.map((term) => term.id));
  for (const term of terms) {
    for (const ancestor of ancestorsOf(index, term.id)) {
      if (listed.has(ancestor.id)) continue;
      listed.add(ancestor.id);
      out.push({
        id: ancestor.id,
        slug: ancestor.slug,
        title: ancestor.title,
        count: 0,
        parentId: ancestor.parentId,
      });
    }
  }
  return out;
}
