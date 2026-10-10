import {
  buildDynamicRoutePath,
  type CatalogDoc,
  type EldraClient,
  type EntryDoc,
} from '@eldrajs/theme-core';
import { localeQuery } from './locale';

export type CatalogRouteKind = 'product' | 'collection' | 'category';

/** Which catalog object a resolved route is showing, and under which slug. */
export interface CatalogRouteRef {
  kind: CatalogRouteKind;
  /** The object's own slug — for a category, the **leaf's**. */
  slug: string;
  /**
   * A category's canonical path, root slug first, joined with `/` and without a
   * leading slash (`billinn/bilstolar`) — the value the route's catch-all
   * parameter carried. Set for `kind: 'category'` and for nothing else, because
   * a product and a collection are addressed by one segment.
   */
  path?: string;
}

/** The public list endpoints cap a page at 200; 100 keeps one response small
 * while halving the request count of the gateway's default page. */
const CATALOG_PAGE_SIZE = 100;

/** The only catalog status a storefront route may be generated for. */
const ACTIVE_STATUS = 'ACTIVE';

/**
 * Map a public catalog response onto the binding paths a catalog-backed route
 * template exposes. These keys are the documented, stable surface a template's
 * `bindings`/`templates` address — a product's `title`, `variants.0.price`,
 * `images.0.url` — so every one of them is always present, whatever the
 * response omitted. The gateway resolves a product's or collection's title and
 * description for the requested locale (falling back to the default one)
 * before serving it, so no translation table is walked here.
 *
 * Returns null when the response carries no id: an entry without one cannot be
 * addressed, overlaid or keyed, and inventing one would hide a broken read.
 */
export function projectCatalogEntry(
  /**
   * A category is not one of the two: its binding fields are the **tree's** —
   * the canonical path, the ancestors and the children — so none of them is
   * knowable from one response and `projectCategoryNode` is what builds them.
   */
  kind: 'product' | 'collection',
  doc: unknown
): EntryDoc | null {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return null;
  const raw = doc as CatalogDoc;
  const id = text(raw.id);
  if (id === '') return null;
  return {
    id,
    data: kind === 'product' ? productProjection(raw) : collectionProjection(raw),
  };
}

function productProjection(raw: CatalogDoc): Record<string, unknown> {
  return {
    slug: text(raw.slug),
    title: text(raw.title),
    // Rich text: handed to the theme's rich-text renderer unchanged.
    description: raw.description ?? null,
    status: text(raw.status),
    categoryId: optionalText(raw.categoryId),
    tags: stringList(raw.tags),
    variants: list(raw.variants).map((variant) => ({
      sku: text(variant.sku),
      price: optionalNumber(variant.price),
      compareAtPrice: optionalNumber(variant.compareAtPrice),
      optionValues: list(variant.optionValues).map((value) => ({
        id: text(value.id),
        name: text(value.name),
        optionId: text(value.optionId),
        optionValueId: text(value.optionValueId),
      })),
    })),
    images: mediaList(raw.mediaLinks),
  };
}

function collectionProjection(raw: CatalogDoc): Record<string, unknown> {
  return {
    slug: text(raw.slug),
    title: text(raw.title),
    description: optionalText(raw.description),
    productCount: typeof raw.productCount === 'number' ? raw.productCount : 0,
    image: mediaItem(raw.image),
  };
}

// ---------------------------------------------------------------------------------------------
// Categories: the tree, the canonical path, and the projection built from both
// ---------------------------------------------------------------------------------------------

/**
 * How deep a category chain may go before the walk stops.
 *
 * A guard against a `parentId` that points at a descendant (or at itself), not
 * a product decision: the walk runs during a request and during a prerender, and
 * a cycle there is a hang rather than a wrong page. Six is well past any
 * storefront's real depth, and the `seen` set catches an outright loop as well.
 */
const MAX_CATEGORY_DEPTH = 6;

/** One category as the tree needs it. The id and the slug are the two a row
 *  cannot be placed without — the id is what a child names its parent by, the
 *  slug is what the path is spelled with — while the title follows this file's
 *  standing projection rule and is `''` when the read carried none, rather than
 *  being a reason to drop a category the merchant really has. */
interface CategoryRow {
  id: string;
  slug: string;
  title: string;
  parentId: string | null;
  raw: CatalogDoc;
}

/** One level of a category's trail, as the binding fields carry it. */
export interface CatalogCategoryRef {
  slug: string;
  title: string;
  /** Canonical path, root slug first, no leading slash. */
  path: string;
}

/** One category placed in the tree: everything a route and its template need. */
export interface CatalogCategoryNode extends CatalogCategoryRef {
  id: string;
  /** Root first, the category itself excluded. */
  ancestors: CatalogCategoryRef[];
  /** Direct children only, in the order the list served them. */
  children: CatalogCategoryRef[];
  raw: CatalogDoc;
}

/**
 * **Every category the site can address, keyed by its canonical path** —
 * `billinn/bilstolar`, root slug first, joined with `/`.
 *
 * `GET /catalog/v1/categories` answers `{id, slug, title, parentId}` rows and no
 * trail at all, so the chain is this walk and nothing else. A row is dropped
 * whenever it cannot have a canonical path: no id or no slug, or a `parentId`
 * naming a row this list does not hold (a category whose parent was
 * unpublished) — a path built over that gap would address a different category,
 * so the subtree under such a row is dropped with it. The **first** row wins a
 * duplicate path, the same rule the slug lookups in the kit already use.
 */
export function buildCategoryTree(
  docs: readonly CatalogDoc[]
): ReadonlyMap<string, CatalogCategoryNode> {
  const rows = new Map<string, CategoryRow>();
  const order: CategoryRow[] = [];
  for (const doc of docs) {
    const id = text(doc.id);
    const slug = text(doc.slug);
    const title = text(doc.title);
    if (id === '' || slug === '' || rows.has(id)) continue;
    const row: CategoryRow = { id, slug, title, parentId: optionalText(doc.parentId), raw: doc };
    rows.set(id, row);
    order.push(row);
  }

  /** The row's ancestors, root first, or null when the chain does not reach a
   *  root through rows this list holds. */
  const chainOf = (row: CategoryRow): CategoryRow[] | null => {
    const chain: CategoryRow[] = [];
    const seen = new Set<string>([row.id]);
    let parentId = row.parentId;
    for (let depth = 0; depth < MAX_CATEGORY_DEPTH; depth += 1) {
      if (parentId === null) return chain;
      if (seen.has(parentId)) return null;
      const parent = rows.get(parentId);
      if (parent === undefined) return null;
      seen.add(parentId);
      chain.unshift(parent);
      parentId = parent.parentId;
    }
    return null;
  };

  const chains = new Map<string, CategoryRow[]>();
  const pathOf = new Map<string, string>();
  for (const row of order) {
    const chain = chainOf(row);
    if (chain === null) continue;
    chains.set(row.id, chain);
    pathOf.set(row.id, [...chain, row].map((level) => level.slug).join('/'));
  }

  const childrenOf = new Map<string, CategoryRow[]>();
  for (const row of order) {
    const parentId = row.parentId;
    if (parentId === null || !pathOf.has(row.id) || !pathOf.has(parentId)) continue;
    const siblings = childrenOf.get(parentId);
    if (siblings === undefined) childrenOf.set(parentId, [row]);
    else siblings.push(row);
  }

  const refOf = (row: CategoryRow): CatalogCategoryRef => ({
    slug: row.slug,
    title: row.title,
    path: pathOf.get(row.id) ?? '',
  });

  const tree = new Map<string, CatalogCategoryNode>();
  for (const row of order) {
    const path = pathOf.get(row.id);
    if (path === undefined || tree.has(path)) continue;
    tree.set(path, {
      id: row.id,
      slug: row.slug,
      title: row.title,
      path,
      ancestors: (chains.get(row.id) ?? []).map(refOf),
      children: (childrenOf.get(row.id) ?? []).map(refOf),
      raw: row.raw,
    });
  }
  return tree;
}

/**
 * A placed category as the binding paths a `catalog:category` route template
 * addresses: `slug`, `title`, `path`,
 * `ancestors[]` and `children[]` are always present, because a template binds
 * them and an absent path renders as nothing.
 *
 * `description` and `productCount` are carried **only when the public read
 * carried them**, which is the one place this projection differs from the
 * product's and the collection's. The catalog category model may have neither,
 * and a key invented here would bind a template to an empty value for every
 * category on every site that does not have one. `description` is **plain
 * text** — a string, like a collection's and unlike a product's rich-text
 * document — so a non-string is no description at all rather than something a
 * text template would render as `[object Object]`.
 */
export function projectCategoryNode(node: CatalogCategoryNode): EntryDoc {
  const description = node.raw.description;
  const productCount = node.raw.productCount;
  return {
    id: node.id,
    data: {
      slug: node.slug,
      title: node.title,
      path: node.path,
      ancestors: node.ancestors.map(plainRef),
      children: node.children.map(plainRef),
      ...(typeof description === 'string' && description !== '' ? { description } : {}),
      ...(typeof productCount === 'number' ? { productCount } : {}),
    },
  };
}

function plainRef(ref: CatalogCategoryRef): Record<string, unknown> {
  return { slug: ref.slug, title: ref.title, path: ref.path };
}

/**
 * The category a canonical path names, or null.
 *
 * **Canonical only, no redirects**: the path's segments must be exactly a
 * root→descendant slug chain, so a leaf on its own (`/categories/bilstolar`), a
 * wrong parent and a trailing extra segment are all misses — and a miss is the
 * theme's not-found shell, not an error.
 */
export function findCategoryByPath(
  tree: ReadonlyMap<string, CatalogCategoryNode>,
  path: string
): CatalogCategoryNode | null {
  return tree.get(path) ?? null;
}

/** Read one catalog object by slug and project it. A 404 is the caller's to
 * handle — it is the not-found shell, not an error.
 *
 * A **category** is resolved differently and deliberately: there is no read that
 * takes a path, so the whole category list is read (cached per request by
 * `listCatalogDocs`'s caller) and the path's segments are walked down the tree
 * by slug. A reader with no `listCategories` resolves none, which is the same
 * answer as a path no category occupies. */
export async function loadCatalogEntry(
  client: EldraClient,
  kind: CatalogRouteKind,
  slug: string,
  locale?: string
): Promise<EntryDoc | null> {
  const query = localeQuery(locale);
  if (kind === 'category') {
    const node = findCategoryByPath(
      buildCategoryTree(await listCatalogDocs(client, 'category', locale)),
      slug
    );
    return node === null ? null : projectCategoryNode(node);
  }
  const doc =
    kind === 'product'
      ? await client.catalog.getProduct(slug, query)
      : await client.catalog.getCollection(slug, query);
  return projectCatalogEntry(kind, doc);
}

/** Page through every catalog object a storefront route may exist for. The
 * product list endpoint filters on status server-side; the collection list
 * serves published collections only and exposes no status field, so anything
 * it does report is filtered again below, client-side.
 *
 * The **category** list is optional on the reader (`EldraCatalogReader`), so one
 * that predates it answers no categories at all — which is the same answer as a
 * store with none, and leaves a category template generating nothing rather than
 * failing the build. */
export async function listCatalogDocs(
  client: EldraClient,
  kind: CatalogRouteKind,
  locale?: string
): Promise<CatalogDoc[]> {
  const listCategories = client.catalog.listCategories?.bind(client.catalog);
  if (kind === 'category' && listCategories === undefined) return [];
  const docs: CatalogDoc[] = [];
  let page = 1;
  for (;;) {
    const query = { page, pageSize: CATALOG_PAGE_SIZE, ...localeQuery(locale) };
    const list =
      kind === 'product'
        ? await client.catalog.listProducts({ ...query, filter: [`status:eq:${ACTIVE_STATUS}`] })
        : kind === 'collection'
          ? await client.catalog.listCollections(query)
          : await listCategories!(query);
    docs.push(...list.data);
    // A page that claims a successor but serves nothing would loop forever.
    if (list.meta.hasNext !== true || list.data.length === 0) return docs;
    page += 1;
  }
}

/**
 * Turn catalog documents into the routes a template generates. A slug that
 * cannot become a path is skipped with a warning naming it; the build goes on,
 * because one unusable merchant record must not cost every other page.
 *
 * A **category** template generates one route per **canonical path** rather than
 * per slug, because that is the only path its route answers: the tree is built
 * from the same list and a row it cannot place — a missing field, a parent the
 * list does not hold — has no route at all, which is exactly what the resolver
 * would answer for it at request time.
 */
export function catalogDocRoutes(
  kind: CatalogRouteKind,
  docs: readonly CatalogDoc[],
  pattern: string,
  warn: (message: string) => void = (message) => console.warn(message)
): string[] {
  const paths: string[] = [];
  if (kind === 'category') {
    for (const node of buildCategoryTree(docs).values()) {
      const path = buildDynamicRoutePath(pattern, node.path);
      if (path === null) {
        warn(
          `[eldra] skipped ${routeLabel(pattern, node.path)}: unusable category path ${JSON.stringify(node.path)}`
        );
        continue;
      }
      paths.push(path);
    }
    return paths;
  }
  for (const doc of docs) {
    if (!isActive(doc)) continue;
    const path = buildDynamicRoutePath(pattern, doc.slug);
    if (path === null) {
      warn(
        `[eldra] skipped ${routeLabel(pattern, doc.slug)}: unusable catalog slug ${JSON.stringify(
          text(doc.slug)
        )}`
      );
      continue;
    }
    paths.push(path);
  }
  return paths;
}

function isActive(doc: CatalogDoc): boolean {
  const status = doc.status;
  return typeof status !== 'string' || status.toUpperCase() === ACTIVE_STATUS;
}

/** The path the slug would have occupied, so a warning points at a route a
 * reader can recognise rather than at an opaque record id. */
function routeLabel(pattern: string, slug: unknown): string {
  return `${pattern.replace(/:[^/]*$/, '')}${text(slug)}`;
}

function mediaList(value: unknown): Array<{ url: string; alt: string }> {
  return list(value)
    .filter((item) => text(item.url) !== '')
    .map((item, index) => ({ item, index }))
    .sort((a, b) => sortOrder(a.item) - sortOrder(b.item) || a.index - b.index)
    .map(({ item }) => ({ url: text(item.url), alt: text(item.altText) }));
}

function mediaItem(value: unknown): { url: string; alt: string } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as CatalogDoc;
  const url = text(record.url);
  return url === '' ? null : { url, alt: text(record.altText) };
}

function sortOrder(item: CatalogDoc): number {
  return typeof item.sortOrder === 'number' ? item.sortOrder : Number.MAX_SAFE_INTEGER;
}

function list(value: unknown): CatalogDoc[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is CatalogDoc =>
          typeof item === 'object' && item !== null && !Array.isArray(item)
      )
    : [];
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}
