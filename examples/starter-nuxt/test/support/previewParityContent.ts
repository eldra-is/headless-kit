import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The content of the preview parity harness (WS-1358), and **Core's two read perspectives** over it:
 * `coreRead(perspective, published, request)` answers a CMS request the way Core's public read does
 * (what a build prerenders) or the way its preview read does (what a draft preview session reads
 * through `X-Preview-Session`). It is the one module that knows Core's shapes, so it can be swapped
 * for golden vectors recorded from Core's own read code without touching the servers or the spec.
 *
 * What it encodes of Core (`internal/modules/cms/service`):
 *  - every entry is `MergeData`'s envelope: `id`, `createdAt`, `updatedAt`, `schemaId`, `status`,
 *    `publishedAt`, `data`; a resolved reference (a block, a page's `parent`) also carries
 *    `_type: entry_<apiId>` and `schemaApiId` (`entry_preload.go`);
 *  - the public read expands each reusable placement in place (the component's root takes the
 *    placement id, every node inside it `r` + SHA-256) and, for a document that places one, puts
 *    `blocks` in the expanded layout's depth-first order and drops every node naming a block that
 *    does not resolve (`expandReusableComponentsForPublic`, `reorderResolvedLayoutBlocks`,
 *    `pruneUnresolvedLayoutBlocks`); a document without placements is served as stored;
 *  - the preview read keeps the placements, attaches a `reusableComponentProjection`, and serves
 *    `blocks` as the relation holds them — the stored mirror, not reordered, not pruned
 *    (`injectReusableComponentProjection`);
 *  - a top-level localized field is answered in the locale asked for, the default one otherwise;
 *  - the preview read's metadata is the draft's: `status` (`CHANGED`, or `DRAFT` for an entry never
 *    published, whose `publishedAt` is `null`) and its own `updatedAt`; the public read drops
 *    `status` and carries the published snapshot's `publishedAt` and `updatedAt`. `createdAt`,
 *    `id`, `schemaId`, `_type` and `schemaApiId` are the same in both;
 *  - a media item's `linkId` is its owner's link row, so it differs between the two reads.
 */

const blocksDir = fileURLToPath(new URL('../../blocks', import.meta.url));

/** Every block type the starter ships, in name order. */
export const STARTER_BLOCK_TYPES: string[] = readdirSync(blocksDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(blocksDir, entry.name, 'block.json')))
  .map((entry) => entry.name)
  .sort();

/** A block's content as Studio's stories render it: what an insert seeds, plus the demo media. */
export function sampleData(apiId: string): Record<string, unknown> {
  const read = (file: string): Record<string, unknown> => {
    const path = join(blocksDir, apiId, file);
    return existsSync(path)
      ? (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>)
      : {};
  };
  return { ...read('mock.json'), ...read('preview.json') };
}

/** A v4-shaped uuid, stable per name: a layout node's `entryId` must be one. */
export function uuidFor(name: string): string {
  const hex = createHash('sha256').update(name).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function expandedNodeId(placementId: string, nodeId: string): string {
  return `r${createHash('sha256').update(`${placementId}\0${nodeId}`).digest('hex')}`;
}

/**
 * Which version of the content: `next` is what the merchant is about to publish (the draft, and
 * what a Publish rebuild bakes in); `pinned` is what was live when the deployment a session pins
 * was built.
 */
export type ContentVersion = 'next' | 'pinned';
export type Perspective = 'public' | 'draft';

export const SITE_ID = 'a1b2c3d4-0000-4000-8000-00000000c0de';
const LOCALES = ['en-US', 'is-IS'] as const;
const SCHEMA_IDS: Record<string, string> = {};
const schemaIdOf = (apiId: string): string => (SCHEMA_IDS[apiId] ??= uuidFor(`schema:${apiId}`));

/** When each version was written: the pinned build's content, the draft, and the Publish. */
const CREATED_AT = '2026-10-01T09:00:00Z';
const PINNED_AT = '2026-11-01T10:00:00Z';
const DRAFTED_AT = '2026-11-20T10:00:00Z';
const PUBLISHED_AT = '2026-11-21T10:00:00Z';

/**
 * The envelope Core puts around an entry. The pinned build read the then-published snapshot; the
 * session reads the draft, which was saved after it; the live build reads the snapshot Publish made
 * of that draft.
 */
function envelope(
  perspective: Perspective,
  version: ContentVersion,
  everPublished: boolean
): Record<string, unknown> {
  if (perspective === 'draft') {
    return {
      createdAt: CREATED_AT,
      updatedAt: DRAFTED_AT,
      status: everPublished ? 'CHANGED' : 'DRAFT',
      publishedAt: everPublished ? PINNED_AT : null,
    };
  }
  // The public read drops `status` altogether.
  const at = version === 'pinned' ? PINNED_AT : PUBLISHED_AT;
  return { createdAt: CREATED_AT, updatedAt: at, publishedAt: at };
}

/**
 * Every media item carries the `linkId` of asset-service's link row, one per owner — the draft and
 * each published snapshot are different owners — so the same image has a different `linkId` in
 * each read.
 */
function withLinkIds(value: unknown, owner: string): unknown {
  if (Array.isArray(value)) return value.map((item) => withLinkIds(item, owner));
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const walked = Object.fromEntries(
    Object.entries(record).map(([key, child]) => [key, withLinkIds(child, owner)])
  );
  return typeof record.assetId === 'string' && typeof record.url === 'string'
    ? { ...walked, linkId: `${owner}-${record.assetId}` }
    : walked;
}

interface Block {
  id: string;
  schemaApiId: string;
  data: Record<string, unknown>;
}

type LayoutNode = Record<string, unknown> & { id: string; type: string };

interface Component {
  componentId: string;
  revision: number;
  root: LayoutNode & { children: LayoutNode[] };
  blocks: Block[];
}

type Child =
  | { block: Block; style?: Record<string, unknown> }
  | { placement: string; component: Component }
  /** A node naming a block entry that does not resolve (deleted, or unpublished since). */
  | { dangling: string };

interface PageSource {
  id: string;
  slug: string;
  title: string;
  parent?: string;
  /** Never published before this draft: the pinned build has no such page. */
  draftOnly?: boolean;
  children: Child[];
}

function block(name: string, apiId: string, data: Record<string, unknown>): Block {
  return { id: uuidFor(`${name}:${apiId}`), schemaApiId: apiId, data };
}

function sharedComponents(next: boolean): { header: Component; footer: Component } {
  const header: Component = {
    componentId: 'c0ffee00-0000-4000-8000-0000000000a1',
    revision: next ? 4 : 3,
    root: {
      id: 'header-root',
      type: 'flex',
      layout: { direction: { normal: 'column' } },
      children: [{ id: 'header-nav', type: 'block', entryId: '' }],
    },
    blocks: [block('shared-header', 'navigation', sampleData('navigation'))],
  };
  const footer: Component = {
    componentId: 'c0ffee00-0000-4000-8000-0000000000b2',
    revision: 2,
    root: {
      id: 'footer-root',
      type: 'flex',
      layout: { direction: { normal: 'column' }, gap: { normal: '8px' } },
      children: [{ id: 'footer-main', type: 'block', entryId: '' }],
    },
    blocks: [block('shared-footer', 'footer', sampleData('footer'))],
  };
  for (const component of [header, footer]) {
    component.root.children[0]!.entryId = component.blocks[0]!.id;
  }
  return { header, footer };
}

/** A small page for one kind of edit: the same blocks in both versions unless the edit says so. */
function editPage(slug: string, title: string, blocks: Block[]): PageSource {
  return { id: `page-${slug}`, slug, title, children: blocks.map((one) => ({ block: one })) };
}

const withItems = (apiId: 'faq' | 'tabs', extra: boolean): Record<string, unknown> => {
  const data = sampleData(apiId);
  const key = apiId === 'faq' ? 'items' : 'tabs';
  const items = data[key] as Array<Record<string, unknown>>;
  const added =
    apiId === 'faq'
      ? { ...items[0], question: 'Do you ship to Iceland?', open: false }
      : { ...items[0], label: 'Linen', heading: 'Linen softens with every wash' };
  return { ...data, [key]: extra ? [...items, added] : items };
};

function pageSources(version: ContentVersion): PageSource[] {
  const next = version === 'next';
  const { header, footer } = sharedComponents(next);
  const hero = (name: string): Block =>
    block(name, 'hero', {
      ...sampleData('hero'),
      heading: next ? `Made slowly, used daily (${name})` : `Pinned heading (${name})`,
    });

  // Every block type of the starter, `search` first, where its results-page variant stands on a
  // real site: it focuses its field on mount, and the page scrolls to it.
  const everyBlockData = (apiId: string): Record<string, unknown> => {
    const data = sampleData(apiId);
    if (apiId === 'hero') data.heading = next ? 'Made slowly, used daily' : 'Pinned build heading';
    if (apiId === 'cta' && !next) data.heading = 'Pinned call to action';
    if (apiId === 'faq' && !next) data.heading = 'Pinned questions';
    return data;
  };
  const everyBlock: PageSource = {
    id: 'page-every-block',
    slug: 'home',
    title: next ? 'Every block' : 'Every block (pinned)',
    children: ['search', ...STARTER_BLOCK_TYPES.filter((apiId) => apiId !== 'search')].map(
      (apiId) => ({ block: block('every', apiId, everyBlockData(apiId)) })
    ),
  };
  // The same blocks in name order, so the search field stands mid-page.
  const focusMid: PageSource = {
    id: 'page-focus-mid',
    slug: 'focus-mid',
    title: 'Focus mid-page',
    children: STARTER_BLOCK_TYPES.map((apiId) => ({
      block: block('focus-mid', apiId, everyBlockData(apiId)),
    })),
  };

  const shared: PageSource = {
    id: 'page-shared',
    slug: 'shared',
    title: 'Shared component',
    children: [
      { placement: 'site-header', component: header },
      {
        block: block('shared-body', 'hero', {
          ...sampleData('hero'),
          heading: next ? 'Between the shared header and footer' : 'Pinned shared body',
        }),
      },
      { placement: 'site-footer', component: footer },
    ],
  };
  // A page under the shared page: its `parent` is that page, resolved as a nested entry.
  const child: PageSource = {
    id: 'page-shared-child',
    slug: 'child',
    title: 'Child',
    parent: 'page-shared',
    children: [{ block: hero('child') }],
  };
  // A page placing a component, one of whose block nodes names an entry that no longer resolves.
  const dangling: PageSource = {
    id: 'page-dangling',
    slug: 'dangling',
    title: 'Dangling',
    children: [
      { placement: 'site-header', component: header },
      { block: hero('dangling') },
      { dangling: uuidFor('deleted:quote') },
      { block: block('dangling', 'cta', sampleData('cta')) },
    ],
  };

  const localized: PageSource = {
    id: 'page-localized',
    slug: 'localized',
    title: 'Localized',
    children: [
      {
        block: block('localized', 'hero', {
          ...sampleData('hero'),
          eyebrow: { 'en-US': 'New season', 'is-IS': 'Ný árstíð' },
          heading: next
            ? { 'en-US': 'Made slowly', 'is-IS': 'Gert hægt' }
            : { 'en-US': 'Pinned', 'is-IS': 'Fest' },
        }),
      },
      {
        block: block('localized', 'cta', {
          ...sampleData('cta'),
          eyebrow: { 'en-US': 'Visit the studio', 'is-IS': 'Heimsæktu verkstæðið' },
          primaryCtaLabel: { 'en-US': 'Book a session', 'is-IS': 'Bóka tíma' },
        }),
      },
    ],
  };

  const image = sampleData('image').image as Record<string, unknown>;
  const heroImage = sampleData('hero').image as Record<string, unknown>;
  const framing: PageSource = {
    id: 'page-framing',
    slug: 'framing',
    title: 'Framing',
    children: [
      {
        block: block('framing', 'image', {
          ...sampleData('image'),
          image: {
            ...image,
            framing: next ? { x: 0.2, y: 0.6, zoom: 2 } : { x: 0.5, y: 0.5, zoom: 1 },
          },
        }),
      },
      {
        block: block('framing', 'hero', {
          ...sampleData('hero'),
          image: { ...heroImage, framing: next ? { x: 0.05, y: 0.95, zoom: 3.5 } : null },
        }),
        style: { width: { normal: '100%', mobile: '100%' } },
      },
    ],
  };

  // One page per kind of structural edit (`EDIT_CASES`).
  const b = (page: string, apiId: string, data = sampleData(apiId)): Block =>
    block(page, apiId, data);
  const edits: PageSource[] = [
    editPage('edit-add', 'Add', [
      hero('edit-add'),
      ...(next ? [b('edit-add', 'quote')] : []),
      b('edit-add', 'tabs'),
      b('edit-add', 'faq'),
    ]),
    editPage('edit-remove', 'Remove', [
      hero('edit-remove'),
      ...(next ? [] : [b('edit-remove', 'quote')]),
      b('edit-remove', 'tabs'),
      b('edit-remove', 'faq'),
    ]),
    editPage(
      'edit-reorder',
      'Reorder',
      next
        ? [hero('edit-reorder'), b('edit-reorder', 'faq'), b('edit-reorder', 'tabs')]
        : [hero('edit-reorder'), b('edit-reorder', 'tabs'), b('edit-reorder', 'faq')]
    ),
    editPage('edit-type', 'Change type', [
      hero('edit-type'),
      next ? b('edit-type', 'cta') : b('edit-type', 'quote'),
      b('edit-type', 'faq'),
    ]),
    editPage('edit-faq-item', 'FAQ item', [
      hero('edit-faq-item'),
      b('edit-faq-item', 'faq', withItems('faq', next)),
      b('edit-faq-item', 'tabs'),
    ]),
    editPage('edit-tab-item', 'Tab item', [
      hero('edit-tab-item'),
      b('edit-tab-item', 'tabs', withItems('tabs', next)),
      b('edit-tab-item', 'faq'),
    ]),
    {
      ...editPage('draft-only', 'Draft only', [
        hero('draft-only'),
        b('draft-only', 'tabs'),
        b('draft-only', 'faq'),
      ]),
      draftOnly: true,
    },
  ];

  return [everyBlock, focusMid, shared, child, dangling, localized, framing, ...edits].filter(
    (page) => next || page.draftOnly !== true
  );
}

/** The paths whose session must be the live page exactly. */
export const PARITY_PATHS = [
  '/',
  '/shared',
  '/shared/child',
  '/dangling',
  '/localized',
  '/is-IS/localized',
  '/framing',
  '/journal/first-light',
];

/**
 * The structural edits, each a page whose draft differs from the pinned build's in one way. Which
 * of them renumber `useId()` ids is pinned in the spec (`EDIT_EXPECTATIONS`).
 */
export const EDIT_CASES = [
  'edit-add',
  'edit-remove',
  'edit-reorder',
  'edit-type',
  'edit-faq-item',
  'edit-tab-item',
  'draft-only',
] as const;
export type EditCase = (typeof EDIT_CASES)[number];

/** The page whose search field focuses on mount mid-page. */
export const FOCUS_MID_PATH = '/focus-mid';

/** A block entry id on a page of the harness, by page slug and block type. */
export function blockIdOf(page: string, apiId: string): string {
  return uuidFor(`${page}:${apiId}`);
}

// ---- the read shapes.

/** A layout's block entry ids, depth-first, slot children by sorted slot id. */
function layoutEntryIds(node: LayoutNode, into: string[] = []): string[] {
  if (typeof node.entryId === 'string' && node.entryId !== '') into.push(node.entryId);
  for (const child of (node.children as LayoutNode[] | undefined) ?? [])
    layoutEntryIds(child, into);
  const slots = node.slots as Record<string, LayoutNode[]> | undefined;
  for (const slot of Object.keys(slots ?? {}).sort()) {
    for (const child of slots![slot]!) layoutEntryIds(child, into);
  }
  return into;
}

function pruneLayout(node: LayoutNode, missing: ReadonlySet<string>): LayoutNode {
  const children = node.children as LayoutNode[] | undefined;
  if (children === undefined) return node;
  return {
    ...node,
    children: children
      .filter((child) => !(typeof child.entryId === 'string' && missing.has(child.entryId)))
      .map((child) => pruneLayout(child, missing)),
  };
}

function expandComponent(placement: string, component: Component): LayoutNode {
  const clone = (node: LayoutNode, root: boolean): LayoutNode => {
    const id = root ? placement : expandedNodeId(placement, node.id);
    const children = node.children as LayoutNode[] | undefined;
    return children === undefined
      ? { ...node, id }
      : { ...node, id, children: children.map((child) => clone(child, false)) };
  };
  return clone(component.root, true);
}

function blockEntry(
  one: Block,
  perspective: Perspective,
  version: ContentVersion
): Record<string, unknown> {
  return {
    id: one.id,
    ...envelope(perspective, version, true),
    schemaId: schemaIdOf(one.schemaApiId),
    data: withLinkIds(one.data, `cms_entry-${perspective === 'draft' ? 'draft' : version}`),
    _type: `entry_${one.schemaApiId}`,
    schemaApiId: one.schemaApiId,
  };
}

/**
 * The layout and blocks of one layout document, in the perspective's shape. `children` are the root
 * container's; `version` the document's.
 */
function layoutAndBlocks(
  children: Child[],
  layoutVersion: 1 | 2,
  perspective: Perspective,
  version: ContentVersion,
  extraBlocks: Block[] = [],
  extraNodes: LayoutNode[] = []
): { layout: Record<string, unknown>; blocks: unknown[]; projection?: Record<string, unknown> } {
  const stored: Block[] = [];
  const nodes: LayoutNode[] = [];
  const components: Array<{ placement: string; component: Component }> = [];
  for (const child of children) {
    if ('block' in child) {
      stored.push(child.block);
      nodes.push({
        id: `node-${child.block.id.slice(0, 8)}`,
        type: 'block',
        entryId: child.block.id,
        ...(child.style === undefined ? {} : { style: child.style }),
      });
    } else if ('dangling' in child) {
      nodes.push({
        id: `node-${child.dangling.slice(0, 8)}`,
        type: 'block',
        entryId: child.dangling,
      });
    } else {
      components.push(child);
      nodes.push(
        perspective === 'public'
          ? expandComponent(child.placement, child.component)
          : { id: child.placement, type: 'reusable', componentId: child.component.componentId }
      );
    }
  }
  nodes.push(...extraNodes);
  // The relation as stored: the document's own blocks, then the components' — not layout order.
  const relation = [
    ...stored,
    ...extraBlocks,
    ...components.flatMap(({ component }) => component.blocks),
  ];
  const root: LayoutNode = {
    id: 'root',
    type: 'flex',
    layout: { direction: { normal: 'column' } },
    children: nodes,
  };
  const entries = relation.map((one) => blockEntry(one, perspective, version));
  if (components.length === 0) {
    return { layout: { version: layoutVersion, root }, blocks: entries };
  }
  if (perspective === 'draft') {
    return {
      layout: { version: layoutVersion, root },
      blocks: entries,
      projection: {
        bindings: components.map(({ placement, component }) => ({
          placementId: placement,
          componentId: component.componentId,
          siteId: SITE_ID,
          revision: component.revision,
        })),
        revisions: components.map(({ component }) => ({
          componentId: component.componentId,
          siteId: SITE_ID,
          revision: component.revision,
          document: { version: 1, root: component.root },
        })),
      },
    };
  }
  // Public: blocks in layout order; a node naming a block that does not resolve is dropped.
  const byId = new Map(entries.map((entry) => [entry.id as string, entry]));
  const missing = new Set(layoutEntryIds(root).filter((id) => !byId.has(id)));
  const pruned = pruneLayout(root, missing);
  return {
    layout: { version: layoutVersion, root: pruned },
    blocks: layoutEntryIds(pruned).map((id) => byId.get(id)!),
  };
}

function pageEntry(
  source: PageSource,
  perspective: Perspective,
  version: ContentVersion,
  all: readonly PageSource[]
): Record<string, unknown> {
  const { layout, blocks, projection } = layoutAndBlocks(source.children, 2, perspective, version);
  const parentSource = all.find((page) => page.id === source.parent);
  const entry: Record<string, unknown> = {
    id: source.id,
    ...envelope(perspective, version, source.draftOnly !== true),
    schemaId: schemaIdOf('page'),
    data: {
      title: source.title,
      slug: source.slug,
      ...(parentSource === undefined
        ? {}
        : {
            parent: {
              ...pageEntry(parentSource, perspective, version, all),
              _type: 'entry_page',
              schemaApiId: 'page',
            },
          }),
      layout,
      blocks,
    },
  };
  if (projection !== undefined) entry.reusableComponentProjection = projection;
  return entry;
}

// ---- a route template: a dynamic route placing the shared header.

const JOURNAL_HERO = block('journal', 'hero', sampleData('hero'));

function journalEntries(perspective: Perspective, version: ContentVersion): unknown[] {
  const next = perspective === 'draft' || version === 'next';
  return [
    {
      id: uuidFor('journal:first-light'),
      ...envelope(perspective, version, true),
      schemaId: schemaIdOf('journal'),
      data: { slug: 'first-light', title: next ? 'First light' : 'First light (pinned)' },
    },
  ];
}

function routeTemplateEntries(perspective: Perspective, version: ContentVersion): unknown[] {
  const { header } = sharedComponents(perspective === 'draft' || version === 'next');
  const { layout, blocks, projection } = layoutAndBlocks(
    [{ placement: 'journal-header', component: header }],
    1,
    perspective,
    version,
    [JOURNAL_HERO],
    [
      {
        id: 'journal-hero',
        type: 'template-block',
        apiId: 'hero',
        entryId: JOURNAL_HERO.id,
        templates: { heading: 'Journal: {{ title }}' },
      },
    ]
  );
  const entry: Record<string, unknown> = {
    id: 'rt-journal',
    ...envelope(perspective, version, true),
    schemaId: schemaIdOf('route-template'),
    data: {
      title: 'Journal entry',
      routePattern: '/journal/:slug',
      schemaApiId: 'journal',
      slugField: 'slug',
      layout,
      blocks,
    },
  };
  if (projection !== undefined) entry.reusableComponentProjection = projection;
  return [entry];
}

// ---- localized fields.

/**
 * Core answers a top-level localized field in the locale asked for. The starter's sample data has no
 * object whose keys are all locale tags (the spec asserts it), so this changes only the harness's
 * own translated fields, never a block's stored shape.
 */
export function inLocale(value: unknown, locale: string): unknown {
  if (Array.isArray(value)) return value.map((item) => inLocale(item, locale));
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length > 0 && keys.every((key) => (LOCALES as readonly string[]).includes(key))) {
    return record[locale] ?? record['en-US'];
  }
  return Object.fromEntries(keys.map((key) => [key, inLocale(record[key], locale)]));
}

function listResponse(data: unknown[]): Record<string, unknown> {
  return {
    data,
    meta: {
      hasNext: false,
      hasPrev: false,
      page: 1,
      pageSize: 100,
      rows: data.length,
      total: data.length,
      totalPages: 1,
    },
  };
}

/** Whether `coreRead` answers this path (the CMS reads); everything else is the starter's mock. */
export function isCoreRead(pathname: string): boolean {
  return pathname.startsWith('/cms/v1/schema/');
}

/**
 * One CMS read, answered as Core would: `perspective` is the read's (a request carrying
 * `X-Preview-Session` reads `draft`, which is always the `next` content), `published` which version
 * the public read currently serves.
 */
export function coreRead(
  perspective: Perspective,
  published: ContentVersion,
  url: URL
): { status: number; body: unknown } {
  const version: ContentVersion = perspective === 'draft' ? 'next' : published;
  const locale = url.searchParams.get('locale') ?? 'en-US';
  const local = (value: unknown): unknown => inLocale(value, locale);
  const path = url.pathname;
  const found = (entry: unknown): { status: number; body: unknown } =>
    entry === undefined ? { status: 404, body: {} } : { status: 200, body: local(entry) };

  if (path.startsWith('/cms/v1/schema/page/entry')) {
    const sources = pageSources(version);
    const entries = sources.map((source) => pageEntry(source, perspective, version, sources));
    if (path === '/cms/v1/schema/page/entry')
      return { status: 200, body: local(listResponse(entries)) };
    return found(entries.find((entry) => entry.id === path.split('/').pop()));
  }
  if (path.startsWith('/cms/v1/schema/route-template/entry')) {
    const templates = routeTemplateEntries(perspective, version);
    if (path === '/cms/v1/schema/route-template/entry') {
      return { status: 200, body: local(listResponse(templates)) };
    }
    return found(templates.find((entry) => (entry as { id: string }).id === path.split('/').pop()));
  }
  if (path.startsWith('/cms/v1/schema/journal/entry')) {
    const entries = journalEntries(perspective, version);
    if (path === '/cms/v1/schema/journal/entry')
      return { status: 200, body: local(listResponse(entries)) };
    const slug = decodeURIComponent(path.split('/').pop() ?? '');
    return found(entries.find((entry) => (entry as { data: { slug: string } }).data.slug === slug));
  }
  return { status: 404, body: {} };
}
