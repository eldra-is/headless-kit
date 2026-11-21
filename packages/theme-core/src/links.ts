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
  /** One level deep, never two. Served to a theme that declares no `sections`. */
  children?: LinkValue[];
  /** The second level in columns, served to a theme that declares `sections`; never together with `children`. */
  sections?: LinkSectionValue[];
  /** A promotional card or a plain link; a link's own value overrides its section's. */
  display?: 'card' | 'link';
  /** The media URL of a card's own image. */
  imageUrl?: string;
}

/** One column of a link's `sections`, as a public read serves it. */
export interface LinkSectionValue {
  heading?: string;
  headingLink?: LinkValue;
  display?: 'card' | 'link';
  links?: LinkValue[];
  seeAll?: { label?: string; link?: LinkValue };
}

/** What a site knows about one link target, keyed by `${_type}:${id}`. The
 * slug builds the path, the title fills in a label the author left empty,
 * `schemaApiId` says which route template serves an entry, and `path` is the
 * multi-segment destination a **catch-all** template needs (see below). */
export interface LinkTargetInfo {
  slug?: string;
  title?: string;
  schemaApiId?: string;
  /**
   * The target's canonical path **inside** the route template's prefix, without
   * a leading slash — `billinn/bilstolar` for a category under
   * `/categories/:path*`.
   *
   * Only a catch-all template needs it, and only a filler that can see the
   * whole tree can produce it, so it is optional: a target with no `path` under
   * a catch-all pattern resolves to **no href** rather than to the single-slug
   * path, which on a canonical-only route is a 404 dressed as a link.
   */
  path?: string;
  /** The target's own picture URL: a product's `thumbnail`, a collection's `image`. A card's fallback when its own image is absent. */
  image?: string;
  /** A product's lowest price as the catalog read serves it (major units, no currency: the store's own). Shown on a product card. */
  price?: number;
}

export interface LinkRouteContext {
  pages: readonly PageLike[];
  templates: readonly RouteTemplateLike[];
  /** Keyed `${_type}:${id}` — see `linkTargetKeys`. */
  targets: ReadonlyMap<string, LinkTargetInfo>;
  /** The kinds the theme's `cards.kinds` allows as a card; every kind when absent. */
  cardKinds?: readonly LinkKind[];
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
  /** Present only on a link the read served sections for; `children` is empty then. */
  sections?: ResolvedSection[];
  /** How the link is presented: its own `display`, else its section's. `link` when a card could not be resolved. */
  display?: 'card' | 'link';
  /** The link's own card image, as served. */
  imageUrl?: string;
  /** Present only when `display` is `card` and the card has a picture and a title; without it the link is a plain link. */
  card?: ResolvedCard;
}

/** A resolved card: the picture (the override, else the target's own), the title and, for a product, its price. */
export interface ResolvedCard {
  image: string;
  title: string;
  price?: number;
}

/** One resolved column of a link's `sections`. */
export interface ResolvedSection {
  /** Unstripped, like every label, so a preview can edit it inline. Falls back to the heading link's label; null when both are blank. */
  heading: string | null;
  /** The heading as a link, when the author made it one. */
  headingLink: ResolvedLink | null;
  display?: 'card' | 'link';
  links: ResolvedLink[];
  /** The trailing "see all" link: its own label when set, else its target's. Null when it has neither. */
  seeAll: ResolvedLink | null;
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

/** The cap is on **bytes**, not UTF-16 units, because the write side counts
 *  bytes: a string of 2048 units can be several times that once encoded, and a
 *  renderer that accepted it would render what storage refuses. */
const MAX_HREF_BYTES = 2048;

const HREF_ENCODER = new TextEncoder();

/** The whole Cc category — C0 (U+0000–U+001F), DEL, and C1 (U+0080–U+009F).
 *  C1 matters: several of those code points are ignored or re-interpreted
 *  during URL parsing, so a value carrying one is not the value it looks like. */
function isControlCodePoint(codePoint: number): boolean {
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}

/**
 * An href a theme may render, or null.
 *
 * Allows ordinary site links — a rooted path that is not protocol-relative, an
 * in-page hash, and the four schemes a storefront legitimately links out with —
 * and rejects executable and opaque ones. This is the kit's single
 * implementation: a theme re-exports it rather than keeping a copy that can
 * drift.
 *
 * It is the same allowlist the platform's write side applies, rule for rule, so
 * a value a theme renders is a value that can be stored and a value that is
 * stored is a value that renders. In order: trimmed and non-empty; at most 2048
 * bytes; no backslash anywhere (several browsers normalize `/\host` toward a
 * protocol-relative URL, so a value that looks site-relative here would leave
 * the site there); no control character; then an `http://`/`https://` prefix
 * (case-insensitive) that parses **with a host**, a `/` path that is not `//`,
 * or a `#`, `mailto:` or `tel:` that carries something after the prefix.
 * Nothing else.
 *
 * `new URL(href).protocol` is deliberately not the scheme test: it accepts
 * `https:example.com` and `http:/example.com`, neither of which addresses the
 * host they appear to.
 */
export function safeLinkHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const href = stripStega(value).trim();
  if (href.length === 0 || HREF_ENCODER.encode(href).length > MAX_HREF_BYTES) return null;
  if (href.includes('\\')) return null;
  for (const character of href) {
    if (isControlCodePoint(character.codePointAt(0) ?? 0)) return null;
  }
  const lower = href.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    try {
      return new URL(href).host === '' ? null : href;
    } catch {
      return null;
    }
  }
  if (href.startsWith('//')) return null;
  if (href.startsWith('/')) return href;
  if (href.startsWith('#')) return href.length > '#'.length ? href : null;
  if (lower.startsWith('mailto:')) return href.length > 'mailto:'.length ? href : null;
  if (lower.startsWith('tel:')) return href.length > 'tel:'.length ? href : null;
  return null;
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
  // Depth 2, never 3: a child's own children and sections are not part of the value.
  if (depth > 0) return;
  if (Array.isArray(link.children)) {
    for (const child of link.children) collectTargetKeys(child, keys, seen, depth + 1);
  }
  if (!Array.isArray(link.sections)) return;
  for (const section of link.sections) {
    const record = asRecord(section);
    if (record === null) continue;
    collectTargetKeys(record.headingLink, keys, seen, depth + 1);
    if (Array.isArray(record.links)) {
      for (const child of record.links) collectTargetKeys(child, keys, seen, depth + 1);
    }
    collectTargetKeys(asRecord(record.seeAll)?.link, keys, seen, depth + 1);
  }
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
 * the depth the grammar allows. `sections` (a theme that declares them is served
 * those instead of `children`) resolve the same way: each section's links, its
 * heading link and its see-all link are links of that one level.
 */
export function resolveLink(value: unknown, context: LinkRouteContext): ResolvedLink | null {
  return resolveOne(value, context, 0);
}

function resolveOne(
  value: unknown,
  context: LinkRouteContext,
  depth: number,
  card?: CardSlot
): ResolvedLink | null {
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
  const resolved: ResolvedLink = {
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
            .map((child) => resolveOne(child, context, depth + 1, {}))
            .filter((child): child is ResolvedLink => child !== null),
  };
  if (depth === 0 && Array.isArray(link.sections)) {
    resolved.sections = link.sections
      .map((section) => resolveSection(section, context))
      .filter((section): section is ResolvedSection => section !== null);
  }
  if (typeof link.imageUrl === 'string' && plain(link.imageUrl) !== '') {
    resolved.imageUrl = link.imageUrl;
  }
  // Only a child or a section link may be a card; a link's own display overrides the section's.
  const display =
    card === undefined ? cardDisplay(link.display) : (cardDisplay(link.display) ?? card.display);
  if (display !== undefined) resolved.display = display;
  if (card !== undefined && display === 'card') {
    const resolvedCard = resolveCard(plain(link.kind), link, info, resolved.label, context);
    if (resolvedCard === null) resolved.display = 'link';
    else resolved.card = resolvedCard;
  }
  return resolved;
}

/** What a link may inherit from the section it sits in; its presence marks a link that may be a card. */
interface CardSlot {
  display?: 'card' | 'link';
}

/** A card needs a picture and a title, else it is a plain link. A product or collection card falls back to the target's own picture. */
function resolveCard(
  kind: string,
  link: LinkValue,
  info: LinkTargetInfo | undefined,
  title: string | null,
  context: LinkRouteContext
): ResolvedCard | null {
  if (context.cardKinds !== undefined && !(context.cardKinds as readonly string[]).includes(kind)) {
    return null;
  }
  const own = typeof link.imageUrl === 'string' && plain(link.imageUrl) !== '' ? link.imageUrl : '';
  const targetImage =
    (kind === 'product' || kind === 'collection') && typeof info?.image === 'string'
      ? info.image
      : '';
  const image = own !== '' ? own : targetImage;
  if (plain(image) === '' || title === null) return null;
  const card: ResolvedCard = { image, title };
  if (kind === 'product' && typeof info?.price === 'number' && Number.isFinite(info.price)) {
    card.price = info.price;
  }
  return card;
}

function resolveSection(value: unknown, context: LinkRouteContext): ResolvedSection | null {
  const section = asRecord(value);
  if (section === null) return null;
  const heading = typeof section.heading === 'string' ? section.heading : '';
  const headingLink = resolveOne(section.headingLink, context, 1);
  const sectionDisplay = cardDisplay(section.display);
  // A section with only a heading link is headed by that link's label, as Core's own
  // flattening of sections into `children` does.
  const resolved: ResolvedSection = {
    heading: plain(heading) !== '' ? heading : (headingLink?.label ?? null),
    headingLink,
    links: (Array.isArray(section.links) ? section.links : [])
      .map((link) => resolveOne(link, context, 1, { display: sectionDisplay }))
      .filter((link): link is ResolvedLink => link !== null),
    seeAll: resolveSeeAll(section.seeAll, context),
  };
  if (sectionDisplay !== undefined) resolved.display = sectionDisplay;
  return resolved;
}

function resolveSeeAll(value: unknown, context: LinkRouteContext): ResolvedLink | null {
  const seeAll = asRecord(value);
  if (seeAll === null) return null;
  const link = resolveOne(seeAll.link, context, 1);
  const label = typeof seeAll.label === 'string' ? seeAll.label : '';
  if (plain(label) !== '') {
    return link === null
      ? { href: null, label, newTab: false, group: null, children: [] }
      : { ...link, label };
  }
  return link !== null && link.label !== null ? link : null;
}

function cardDisplay(value: unknown): 'card' | 'link' | undefined {
  const display = plain(value);
  return display === 'card' || display === 'link' ? display : undefined;
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
  if (pattern === null) return null;
  // A catch-all template (`/categories/:path*`) is addressed by the target's
  // whole canonical path, and only by that: its route is canonical-only, so a
  // leaf slug on its own resolves to a path the site answers with its not-found
  // shell. Nothing addressable, therefore no href — the label renders as text,
  // which is what every other unresolvable target already does.
  const value = parseDynamicRoutePattern(pattern)?.catchAll === true ? info.path : info.slug;
  return buildDynamicRoutePath(pattern, value);
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asLinkValue(value: unknown): LinkValue | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return LINK_KINDS.has(plain(record.kind)) ? (record as unknown as LinkValue) : null;
}

function plain(value: unknown): string {
  return typeof value === 'string' ? stripStega(value).trim() : '';
}
