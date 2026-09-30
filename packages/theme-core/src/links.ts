import {
  buildDynamicRoutePath,
  parseDynamicRoutePattern,
  type RouteTemplateLike,
} from './dynamicRoute';
import { resolvePagePath, type PageLike } from './pagePath';
import { stripStega } from './stega';

/** What a `link` field's value points at. Six are destinations; `none` is a
 * heading — a row that groups the links under it and goes nowhere itself, which
 * is the only shape a mega-menu or footer column heading has. */
export type LinkKind = 'product' | 'collection' | 'category' | 'entry' | 'page' | 'url' | 'none';

/** The reference encoding the platform already uses everywhere else: the exact
 * pair a reference picker writes and a reference parser reads. `_type` mirrors
 * the kind — an entry target carries `"entry"`. */
export interface LinkTarget {
  _type: string;
  id: string;
}

export interface LinkValue {
  kind: LinkKind;
  /** Set for every kind but `url` and `none`. */
  target?: LinkTarget;
  /** Set for `kind: "url"` only. */
  url?: string;
  /** Overrides the target's own title. */
  label?: string;
  openInNewTab?: boolean;
  /** A column heading; meaningful on a child of a mega-menu item. */
  group?: string;
  /** One level deep, never two. */
  children?: LinkValue[];
}

/** What a site knows about one link target, keyed by `${_type}:${id}`. The
 * three keys are all a destination needs: the slug builds the path, the title
 * fills in a label the author left empty, and `schemaApiId` says which route
 * template serves an entry. */
export interface LinkTargetInfo {
  slug?: string;
  title?: string;
  schemaApiId?: string;
}

export interface LinkRouteContext {
  pages: readonly PageLike[];
  templates: readonly RouteTemplateLike[];
  /** Keyed `${_type}:${id}` — see `linkTargetKeys`. */
  targets: ReadonlyMap<string, LinkTargetInfo>;
}

export interface ResolvedLink {
  /** Null whenever nothing addressable was found: the target is unknown, has
   * no slug, or no route template serves its kind. A theme renders the label
   * as plain text then, never a dead anchor. */
  href: string | null;
  label: string | null;
  newTab: boolean;
  group: string | null;
  children: ResolvedLink[];
}

/** The route template `schemaApiId` that serves each catalog kind. The three
 * differ by this constant and nothing else. */
const CATALOG_ROUTE_TARGETS: Readonly<Record<string, string>> = {
  product: 'catalog:product',
  collection: 'catalog:collection',
  category: 'catalog:category',
};

const LINK_KINDS = new Set<string>([
  'product',
  'collection',
  'category',
  'entry',
  'page',
  'url',
  'none',
]);

const MAX_HREF_LENGTH = 2048;
const ALLOWED_PROTOCOLS = ['https:', 'http:', 'mailto:', 'tel:'];

/**
 * An href a theme may render, or null.
 *
 * Allows ordinary site links — a rooted path that is not protocol-relative, an
 * in-page hash, and the four schemes a storefront legitimately links out with —
 * and rejects executable and opaque ones. This is the kit's single
 * implementation: a theme re-exports it rather than keeping a copy that can
 * drift.
 */
export function safeLinkHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const href = stripStega(value).trim();
  if (
    href.length === 0 ||
    href.length > MAX_HREF_LENGTH ||
    href.includes('\\') ||
    Array.from(href).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    return null;
  }
  if (href.startsWith('/')) return href.startsWith('//') ? null : href;
  if (href.startsWith('#')) return href;

  try {
    const protocol = new URL(href).protocol;
    return ALLOWED_PROTOCOLS.includes(protocol) ? href : null;
  } catch {
    return null;
  }
}

/**
 * Every target key one link value names, children included, deduplicated and in
 * the order they appear. `${_type}:${id}`, so a product and a collection that
 * happen to share an id stay two separate lookups.
 *
 * A site reads these in one batch per `_type` before rendering, which is what
 * lets a prerendered page resolve every href with no client request.
 */
export function linkTargetKeys(value: unknown): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  collectTargetKeys(value, keys, seen, 0);
  return keys;
}

function collectTargetKeys(value: unknown, keys: string[], seen: Set<string>, depth: number): void {
  const link = asLinkValue(value);
  if (link === null) return;
  const key = targetKey(link.target);
  if (key !== null && !seen.has(key)) {
    seen.add(key);
    keys.push(key);
  }
  // Depth 2, never 3: a child's own children are not part of the value.
  if (depth > 0 || !Array.isArray(link.children)) return;
  for (const child of link.children) collectTargetKeys(child, keys, seen, depth + 1);
}

function targetKey(target: unknown): string | null {
  if (typeof target !== 'object' || target === null || Array.isArray(target)) return null;
  const record = target as Record<string, unknown>;
  const type = plain(record._type);
  const id = plain(record.id);
  return type === '' || id === '' ? null : `${type}:${id}`;
}

/**
 * One link value resolved against the site's own routes.
 *
 * Null only when the value is not a link at all — a value whose target is
 * missing still resolves, with `href: null`, because the label is worth
 * rendering as plain text and a theme decides for itself whether to show it.
 * A `kind: "none"` heading resolves the same way, deliberately: it has a label
 * and children and never an href.
 * That is the rule a block storing a collection reference already follows:
 * there is no other key a collection page can be addressed by, so the heading
 * simply is not a link until the page is published.
 *
 * Children resolve one level; a child's own `children` are ignored, matching
 * the depth the grammar allows.
 */
export function resolveLink(value: unknown, context: LinkRouteContext): ResolvedLink | null {
  return resolveOne(value, context, 0);
}

function resolveOne(value: unknown, context: LinkRouteContext, depth: number): ResolvedLink | null {
  const link = asLinkValue(value);
  if (link === null) return null;
  const info = targetInfo(link.target, context);
  // `label` and `group` come back **unstripped**. They are the strings a theme
  // renders, and in a Studio preview each carries the invisible payload that
  // makes it inline-editable; handing back a stripped copy would silently end
  // editing for every navigation label. Only the emptiness test uses the
  // stripped value, which is never rendered.
  const ownLabel = typeof link.label === 'string' ? link.label : '';
  const targetTitle = typeof info?.title === 'string' ? info.title : '';
  const group = typeof link.group === 'string' ? link.group : '';
  return {
    // Every string the *route* is derived from is read stega-stripped, `kind`
    // included: in a preview the gateway encodes all string leaves of an
    // entry's data, so a raw `kind` would match no branch at all.
    href: resolveHref(plain(link.kind), link, info, context),
    label: plain(ownLabel) !== '' ? ownLabel : plain(targetTitle) !== '' ? targetTitle : null,
    newTab: link.openInNewTab === true,
    group: plain(group) === '' ? null : group,
    children:
      depth > 0 || !Array.isArray(link.children)
        ? []
        : link.children
            .map((child) => resolveOne(child, context, depth + 1))
            .filter((child): child is ResolvedLink => child !== null),
  };
}

function resolveHref(
  kind: string,
  link: LinkValue,
  info: LinkTargetInfo | undefined,
  context: LinkRouteContext
): string | null {
  // A heading goes nowhere by definition — its whole job is to group the links
  // under it — so it resolves to no href and a theme renders it as text.
  if (kind === 'none') return null;
  if (kind === 'url') return safeLinkHref(link.url);
  if (kind === 'page') return pagePath(link.target, context);
  if (info === undefined) return null;
  // The three catalog kinds and `entry` differ only in which route template
  // serves them: a constant for the first three, the target's own schema for
  // the last.
  const schemaApiId =
    kind === 'entry' ? plain(info.schemaApiId) : (CATALOG_ROUTE_TARGETS[kind] ?? '');
  if (schemaApiId === '') return null;
  const pattern = routePatternFor(schemaApiId, context.templates);
  return pattern === null ? null : buildDynamicRoutePath(pattern, info.slug);
}

/** The pattern of the published route template serving a schema, or null when
 *  the site has none — a theme that ships no category page, for instance. */
function routePatternFor(
  schemaApiId: string,
  templates: readonly RouteTemplateLike[]
): string | null {
  for (const template of templates) {
    if (plain(template.data.schemaApiId) !== schemaApiId) continue;
    const parsed = parseDynamicRoutePattern(plain(template.data.routePattern));
    if (parsed !== null) return parsed.value;
  }
  return null;
}

function pagePath(target: unknown, context: LinkRouteContext): string | null {
  const key = targetKey(target);
  if (key === null) return null;
  const id = key.slice(key.indexOf(':') + 1);
  const page = context.pages.find((candidate) => candidate.id === id);
  if (page === undefined) return null;
  try {
    return resolvePagePath(page, [...context.pages]);
  } catch {
    // A parent cycle is a broken site, not a broken link: render the label.
    return null;
  }
}

function targetInfo(target: unknown, context: LinkRouteContext): LinkTargetInfo | undefined {
  const key = targetKey(target);
  return key === null ? undefined : context.targets.get(key);
}

function asLinkValue(value: unknown): LinkValue | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return LINK_KINDS.has(plain(record.kind)) ? (record as unknown as LinkValue) : null;
}

function plain(value: unknown): string {
  return typeof value === 'string' ? stripStega(value).trim() : '';
}
