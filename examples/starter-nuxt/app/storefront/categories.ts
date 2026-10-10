/**
 * The store's **category tree**, and the four things a theme does with it: a product's breadcrumb
 * trail, the category page's own trail and child strip, the parent rows the collection grid's
 * category facet is drawn with, and the canonical path every category link is addressed by.
 *
 * `GET /catalog/v1/categories` answers the whole list in one read — `{id, slug, title, parentId}`
 * per row, a tree by `parentId` — and a product carries `primaryCategoryId` (plus `categoryIds`, the
 * full set). Neither read carries a *trail* or a *path*: the ancestors are the theme's own walk up
 * the tree, which is what this file is.
 *
 * Everything here is pure — no Vue, no client, no module state — so both storefront sources share it
 * (`gateway.ts` builds the index from the live read, `demo.ts` from its fixture) and
 * `test/storefront/categories.spec.ts` can pin every bound without mounting anything.
 *
 * `ancestorsOf` is also the demo storefront's own expansion of a ticked **parent** category
 * (`app/storefront/facets.ts`), which is what makes the demo behave like the platform it stands in
 * for rather than like a flat list.
 *
 * **Where a category crumb links to.** The theme ships a category *page* now
 * (`pages/category.page.json`, route template `/categories/:path*`), and a category is addressed by
 * its **canonical path**: the slugs of its ancestors, root first, then its own, joined with `/`.
 * That path is the one thing the route answers — canonical only, no redirects — so it is what
 * `pathOf` computes, what `idByPath` reads back, and what `categoryHref`
 * (`app/utils/links.ts`) turns into a destination. A category the list cannot place has no path at
 * all, which is also honest: there is no page to link to.
 */
import { categoryHref } from '../utils/links';
import type { StorefrontCategory, StorefrontCategoryRef } from './types';

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
 * The store's categories, by id, by slug and by canonical path.
 *
 * Each lookup is needed and for a different job: `byId` walks a product's `primaryCategoryId` up to
 * its root (and gives a facet term its parent), `idBySlug` turns a shopper's `?category=ceramics`
 * into the `categoryId` the catalog list filters by, and the two path maps are the category
 * **page**'s — `idByPath` resolves the path a route carried, `pathById` builds the href a crumb,
 * a child chip or a product's category label points at.
 *
 * A category whose ancestor chain does not reach a root through rows this list holds — a parent
 * since unpublished, a `parentId` cycle — is in `byId` and in **neither** path map: it has no
 * canonical path, so it has no page, and a path built over that gap would address a different
 * category.
 */
export interface CategoryIndex {
  byId: ReadonlyMap<string, CategoryNode>;
  idBySlug: ReadonlyMap<string, string>;
  /** Canonical path → category id. */
  idByPath: ReadonlyMap<string, string>;
  /** Category id → canonical path. */
  pathById: ReadonlyMap<string, string>;
}

export const EMPTY_CATEGORY_INDEX: CategoryIndex = {
  byId: new Map(),
  idBySlug: new Map(),
  idByPath: new Map(),
  pathById: new Map(),
};

/**
 * How deep a chain may go before this stops walking.
 *
 * A guard against a cycle in the data, not a product decision: a category whose `parentId` points at
 * a descendant (or at itself) would otherwise walk for ever inside a `computed`, where a throw takes
 * the whole block down. Six is well past any storefront's real depth, and the `seen` set below
 * already catches an outright loop — this catches the pathological chain too.
 */
const MAX_TRAIL_DEPTH = 6;

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

  const idByPath = new Map<string, string>();
  const pathById = new Map<string, string>();
  for (const node of byId.values()) {
    const chain = chainOf(byId, node);
    if (chain === null) continue;
    const path = [...chain, node].map((level) => level.slug).join('/');
    pathById.set(node.id, path);
    // First row wins a duplicate path too — two siblings sharing a slug are one page, and the
    // second cannot be reached by a URL whatever this did.
    if (!idByPath.has(path)) idByPath.set(path, node.id);
  }
  return { byId, idBySlug, idByPath, pathById };
}

/**
 * The node's ancestors, root first, or `null` when the chain does not reach a root through rows the
 * index holds — a missing parent, or a cycle. `null` is the answer that costs the node its path.
 */
function chainOf(
  byId: ReadonlyMap<string, CategoryNode>,
  node: CategoryNode
): CategoryNode[] | null {
  const chain: CategoryNode[] = [];
  const seen = new Set<string>([node.id]);
  let parentId = node.parentId;
  for (let depth = 0; depth < MAX_TRAIL_DEPTH; depth += 1) {
    if (parentId === null || parentId === '') return chain;
    if (seen.has(parentId)) return null;
    const parent = byId.get(parentId);
    if (parent === undefined) return null;
    seen.add(parentId);
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return null;
}

/**
 * The path the catalogue grid lives at — `pages/products.page.json`'s own slug. One constant so the
 * paging links, the docs and the specs cannot drift from the page.
 */
export const CATALOGUE_PATH = '/products';

/**
 * A category's canonical path, or `null` for a category the index cannot place. The one place a
 * caller should get a path from: never `node.slug` on its own, which is a path only for a root.
 */
export function pathOf(index: CategoryIndex, categoryId: string | null | undefined): string | null {
  if (typeof categoryId !== 'string' || categoryId === '') return null;
  return index.pathById.get(categoryId) ?? null;
}

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
 * reach), a category the list holds but cannot place (its own parent is gone, so there is no page to
 * link to), or an index that is empty because the read failed. A product page without a category
 * crumb is a page; a page with a crumb reading `undefined` is a bug, so there is no fallback label
 * here.
 *
 * Every level is a real category **page** now, and every level's href is that page's canonical path
 * — which is why the trail is walked **down** the leaf's own path rather than up the tree: each
 * prefix of a canonical path is itself a canonical path, so the ancestors come out already placed.
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
  const leafPath = pathOf(index, categoryId);
  if (leafPath === null) return [];
  const segments = leafPath.split('/');
  return segments.flatMap((_segment, depth) => {
    const path = segments.slice(0, depth + 1).join('/');
    const id = index.idByPath.get(path);
    const node = id === undefined ? undefined : index.byId.get(id);
    return node === undefined ? [] : [{ label: node.title, href: categoryHref(path) }];
  });
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

/**
 * The **direct** children of a category, in the order the list served them — what the category
 * page's child strip is drawn from, and never a whole subtree: the strip is one level, so a
 * grandchild belongs under its own parent's page.
 *
 * A child the index cannot place is left out, because it has no page to link to.
 */
export function childrenOf(index: CategoryIndex, categoryId: string): CategoryNode[] {
  const out: CategoryNode[] = [];
  if (categoryId === '') return out;
  for (const node of index.byId.values()) {
    if (node.parentId === categoryId && index.pathById.has(node.id)) out.push(node);
  }
  return out;
}

/**
 * Whether a category is the given one or a descendant of it — the test a **category page's** own
 * scope is held to.
 *
 * The platform's `categoryId` filter matches a whole subtree, so a category page asks for its own
 * id and a shopper ticking a child narrows *within* that subtree. A ticked value that is not in the
 * subtree would widen it instead (the parameter is an OR over a list), which is a category page
 * showing products that are not in its category — so the scope is intersected through this rather
 * than trusted.
 */
export function isInSubtree(index: CategoryIndex, categoryId: string, rootId: string): boolean {
  if (categoryId === '' || rootId === '') return false;
  if (categoryId === rootId) return true;
  return ancestorsOf(index, categoryId).some((ancestor) => ancestor.id === rootId);
}

/**
 * **One category placed in the tree, by its canonical path** — what a category page is drawn from,
 * and the one implementation both storefront sources answer `catalog.category` with.
 *
 * `null` for a path no category occupies: a leaf without its ancestors, a wrong parent, a trailing
 * extra segment, or a category the tree cannot place at all. The route is canonical only, so those
 * are the same answer — there is no page here — and the block draws its own empty state rather than
 * a heading with nothing under it.
 *
 * The ancestors come out of the path's own prefixes rather than a second walk up the tree: every
 * prefix of a canonical path is itself a canonical path, so they are already placed and already in
 * order.
 */
export function placeCategory(index: CategoryIndex, path: string): StorefrontCategory | null {
  const id = index.idByPath.get(path);
  const node = id === undefined ? undefined : index.byId.get(id);
  if (id === undefined || node === undefined) return null;
  const segments = path.split('/');
  const ancestors = segments.slice(0, -1).flatMap((_segment, depth) => {
    const ancestorPath = segments.slice(0, depth + 1).join('/');
    const ancestorId = index.idByPath.get(ancestorPath);
    const ancestor = ancestorId === undefined ? undefined : index.byId.get(ancestorId);
    return ancestor === undefined ? [] : [refOf(ancestor, ancestorPath)];
  });
  return {
    id,
    slug: node.slug,
    title: node.title,
    path,
    ancestors,
    children: childrenOf(index, id).map((child) =>
      refOf(child, index.pathById.get(child.id) ?? '')
    ),
  };
}

function refOf(node: CategoryNode, path: string): StorefrontCategoryRef {
  return { slug: node.slug, title: node.title, path };
}
