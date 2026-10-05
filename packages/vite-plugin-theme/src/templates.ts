import { parseDynamicRoutePattern } from '@eldrajs/theme-core';
import { checkSeedData } from './seedData';
import type {
  DeclaredPageSeed,
  DeclaredPageSeedBlock,
  DeclaredPageSeedRegion,
  DeclaredSeed,
  DeclaredTemplateSeed,
  DeclaredTemplateSeedBlock,
  ManifestPageSeed,
  ManifestPageSeedEntry,
  ManifestTemplateRoles,
  ManifestTemplateSeed,
  ManifestTemplateSeedBlock,
  TemplateSeedLayout,
  TemplateSeedLayoutNode,
} from './types';
import { codePointLength, isRecord, stripPlainTextControls } from './util';

const MAX_TEMPLATES = 8;
const MAX_PAGE_SEEDS = 16;
const MAX_TEMPLATE_BLOCKS = 50;
const MAX_TITLE_LENGTH = 80;
const HOME_ROUTE_PATTERN = '/';
const CATALOG_SLUG_PARAM = 'slug';
/** The same id shape layout nodes take everywhere else in the kit. */
const NODE_ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;
const SCHEMA_API_IDS = new Set(['catalog:product', 'catalog:collection', 'home']);
/** The target the home seed also emits a page seed for, and the slug it takes:
 * the site root Page Core has always created from it. */
const HOME_SCHEMA_API_ID = 'home';
const HOME_PAGE_SLUG = 'home';
/** Core's own page-seed slug rule, mirrored exactly so the scan refuses what
 * the ingest refuses: lowercase words joined by single hyphens, starting with a
 * letter. The length cap is the kit's own — a slug is one path segment. */
const PAGE_SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MAX_PAGE_SLUG_LENGTH = 64;
const MAX_PAGE_SEED_BLOCKS = 50;
/** The two reserved entry types a page seed places a shared region with. They
 * begin with `@`, which no block apiId may, so they can never collide. */
const REGION_TYPES = { header: '@header', footer: '@footer' } as const;
const ROLES = new Set(['header', 'footer']);
const ROOT_NODE_ID = 'root';
const ROLE_NODE_IDS = { header: 'role-header', footer: 'role-footer' } as const;
/** A target path into a block's fields, the grammar `@eldrajs/theme-core`'s
 * template layout already reads: identifier segments, list indices allowed
 * (`heading`, `items.0.label`). The first segment must be a field the block
 * declares. */
const TARGET_FIELD_PATH = /^[a-z][a-zA-Z0-9]{0,48}(?:\.(?:[a-z][a-zA-Z0-9]{0,48}|0|[1-9][0-9]*))*$/;
/** The two maps a seed block may carry for its layout node. */
const NODE_BINDING_KEYS = ['templates', 'bindings'] as const;
type NodeBindingKey = (typeof NODE_BINDING_KEYS)[number];
/** What a validated seed block contributes to its layout node. */
type NodeBindings = Partial<Record<NodeBindingKey, Record<string, string>>>;

/**
 * The layout a seed gets when it declares none: one column of its blocks in
 * order, framed by the header and footer roles unless the seed opts out. The
 * roles are resolved to the site's own reusable components on deploy, which is
 * why they travel as a role rather than an id.
 */
export function seedLayout(seed: DeclaredTemplateSeed): TemplateSeedLayout {
  const children: TemplateSeedLayoutNode[] = [];
  if (seed.header !== false) {
    children.push({ id: ROLE_NODE_IDS.header, type: 'reusable', role: 'header' });
  }
  for (const block of Array.isArray(seed.blocks) ? seed.blocks : []) {
    children.push({ id: block.id, type: 'block', entryId: block.id, ...nodeBindingsOf(block) });
  }
  if (seed.footer !== false) {
    children.push({ id: ROLE_NODE_IDS.footer, type: 'reusable', role: 'footer' });
  }
  return {
    version: 1,
    root: { id: ROOT_NODE_ID, type: 'flex', layout: { direction: { normal: 'column' } }, children },
  };
}

/** The `templates`/`bindings` a seed block carries, as the keys its layout node
 * takes — omitted entirely when it declared neither, so a seed without bindings
 * emits exactly the node it always did. */
function nodeBindingsOf(block: DeclaredTemplateSeedBlock | undefined): NodeBindings {
  const carried: NodeBindings = {};
  for (const key of NODE_BINDING_KEYS) {
    const value = block?.[key];
    if (value !== undefined) carried[key] = value;
  }
  return carried;
}

/** Which target a declared seed names: a route template (or home), a static
 * page, both — which is the error the two forms exist to keep apart — or
 * neither. A page target is the presence of `page`, a template target the
 * presence of either of the two keys one needs, so a seed that half-declares
 * one still reports against that form rather than silently becoming the other.
 */
function seedTargetOf(entry: Record<string, unknown>): 'template' | 'page' | 'both' | 'none' {
  const page = entry.page !== undefined;
  const template = entry.schemaApiId !== undefined || entry.routePattern !== undefined;
  if (page && template) return 'both';
  if (page) return 'page';
  if (template) return 'template';
  return 'none';
}

/** The declared entries that name a template target, with their index in the
 * declared list — the index every error path is written against, so an author
 * reads it against the array they wrote. Entries naming a page target belong to
 * `validatePageSeeds`; one naming both is reported here, once, and belongs to
 * neither. */
function templateEntriesOf(
  seeds: ReadonlyArray<DeclaredSeed>,
  errors: string[]
): Array<[number, Record<string, unknown>]> {
  const entries: Array<[number, Record<string, unknown>]> = [];
  for (const [index, entry] of seeds.entries()) {
    // A theme's options are plain JS: a stray null or a string in the array
    // must read as a validation error against its own index, never as a crash
    // deep inside the scan.
    if (!isRecord(entry)) {
      errors.push(`templates[${index}] — must be an object`);
      continue;
    }
    const target = seedTargetOf(entry);
    if (target === 'page') continue;
    if (target === 'both') {
      errors.push(
        `templates[${index}] — declares both a template target (schemaApiId) and a page target ` +
          '(page.slug): a seed names one or the other'
      );
      continue;
    }
    entries.push([index, entry]);
  }
  return entries;
}

/**
 * Validates the theme's declared template seeds against the blocks it ships and
 * returns them in manifest shape: every seed with a layout, and without the
 * `header`/`footer` switches, which steer the generated layout and are never
 * emitted.
 *
 * The declared list also carries static **page** seeds (`page: { slug }`);
 * those are skipped here and validated by `validatePageSeeds`, which reads the
 * same list. Only the template seeds count against the template cap.
 */
export function validateTemplateSeeds(
  seeds: ReadonlyArray<DeclaredSeed>,
  blocks: ReadonlyArray<Record<string, unknown>>,
  errors: string[]
): ManifestTemplateSeed[] {
  if (!Array.isArray(seeds)) {
    errors.push('templates — must be an array');
    return [];
  }
  const entries = templateEntriesOf(seeds, errors);
  if (entries.length > MAX_TEMPLATES) {
    errors.push(`templates: contains ${entries.length} templates — exceeds ${MAX_TEMPLATES}`);
  }
  const blockFields = new Map<string, Array<Record<string, unknown>>>();
  for (const block of blocks) {
    if (typeof block.apiId !== 'string') continue;
    blockFields.set(
      block.apiId,
      Array.isArray(block.fields) ? (block.fields as Array<Record<string, unknown>>) : []
    );
  }

  const normalized: ManifestTemplateSeed[] = [];
  const patterns = new Set<string>();
  for (const [index, entry] of entries.slice(0, MAX_TEMPLATES)) {
    const at = `templates[${index}]`;
    // Past the target split the declared type is assumed again — every field
    // it promises is validated below.
    const seed = entry as unknown as DeclaredTemplateSeed;
    if (!SCHEMA_API_IDS.has(seed.schemaApiId)) {
      errors.push(
        `${at}.schemaApiId — must be "catalog:product", "catalog:collection" or "home" (a static ` +
          'page seed names `page: { slug }` instead)'
      );
    } else {
      checkRoutePattern(at, seed, errors);
    }
    const title = stripPlainTextControls(seed.title).trim();
    if (codePointLength(title) < 1 || codePointLength(title) > MAX_TITLE_LENGTH) {
      errors.push(`${at}.title — must contain 1..${MAX_TITLE_LENGTH} characters`);
    }
    if (patterns.has(seed.routePattern)) {
      errors.push(`${at}.routePattern — duplicate pattern ${JSON.stringify(seed.routePattern)}`);
    }
    patterns.add(seed.routePattern);

    const seedBlocks = Array.isArray(seed.blocks) ? seed.blocks : [];
    if (seedBlocks.length < 1 || seedBlocks.length > MAX_TEMPLATE_BLOCKS) {
      errors.push(`${at}.blocks — must declare 1..${MAX_TEMPLATE_BLOCKS} blocks`);
    }
    const seedBlockIds = new Set<string>();
    const normalizedBlocks: ManifestTemplateSeedBlock[] = [];
    // Kept beside the emitted blocks rather than on them: a block's template
    // bindings belong to its *node* in the layout, and `blocks[]` carries only
    // the three keys Core decodes.
    const nodeBindings = new Map<string, NodeBindings>();
    for (const [blockIndex, blockEntry] of seedBlocks.slice(0, MAX_TEMPLATE_BLOCKS).entries()) {
      const blockAt = `${at}.blocks[${blockIndex}]`;
      if (!isRecord(blockEntry)) {
        errors.push(`${blockAt} — must be an object`);
        continue;
      }
      const block = blockEntry as DeclaredTemplateSeedBlock;
      // `required` locks the layout node Core creates, and only a page's root
      // takes a locked node: a route template's layout is rebuilt from the
      // seed on every reseed, so there would be nothing for a lock to protect.
      if ((blockEntry as Record<string, unknown>).required !== undefined) {
        errors.push(`${blockAt}.required — only a page seed's blocks may be required`);
      }
      const id = typeof block.id === 'string' ? block.id : '';
      if (!NODE_ID_PATTERN.test(id)) {
        errors.push(
          `${blockAt}.id — invalid id "${String(block.id)}" (expected ${NODE_ID_PATTERN.source})`
        );
      } else if (seedBlockIds.has(id)) {
        errors.push(`${blockAt}.id — duplicate id "${id}"`);
      } else {
        seedBlockIds.add(id);
      }
      const fields = blockFields.get(block.apiId);
      if (fields === undefined) {
        errors.push(`${blockAt}.apiId — unknown block "${String(block.apiId)}"`);
      } else if (!isRecord(block.data)) {
        errors.push(`${blockAt}.data — must be an object`);
      } else {
        // The same walk the scanner applies to a block's mock.json: a seed is
        // the write Core makes on deploy, so it obeys the same media rule.
        checkSeedData(
          (path, message) => `${blockAt}.data — ${path}: ${message}`,
          fields,
          block.data,
          errors
        );
      }
      const carried = checkedNodeBindings(blockAt, block, fields, errors);
      if (Object.keys(carried).length > 0 && typeof block.id === 'string') {
        nodeBindings.set(block.id, carried);
      }
      // Only the three keys Core decodes travel to the manifest's `blocks[]`;
      // `templates`/`bindings` travel on the layout node instead.
      normalizedBlocks.push({ id: block.id, apiId: block.apiId, data: block.data });
    }

    const layout =
      seed.layout === undefined
        ? seedLayout({
            ...seed,
            blocks: normalizedBlocks.map((block) => ({ ...block, ...nodeBindings.get(block.id) })),
          })
        : checkedLayout(at, seed.layout, seedBlockIds, nodeBindings, errors);
    normalized.push({
      routePattern: seed.routePattern,
      schemaApiId: seed.schemaApiId,
      title,
      blocks: normalizedBlocks,
      layout,
    });
  }
  return normalized;
}

/**
 * Validates the theme's declared **page** seeds — the entries of the same
 * `templates` list that name `page: { slug }` instead of a template target —
 * and returns them in manifest shape.
 *
 * A page seed is the simplest seed there is: a slug, a title and the page's
 * content in document order. There is no `layout` and there are no node ids:
 * the `blocks` array **is** the page, and Core synthesises the one-column
 * layout from it. An entry is either
 *
 * - a **block** — `{ apiId, data, required? }`, emitted as
 *   `{ type: apiId, data, required? }`. `required: true` makes the node Core
 *   creates locked: the author reorders it and edits its fields but cannot
 *   delete it or move it out of the page root, so a cart page cannot lose its
 *   cart.
 * - a **region placement** — `{ role: 'header' | 'footer' }`, emitted as the
 *   reserved `{ type: '@header' }` / `{ type: '@footer' }`. It carries no data:
 *   the block behind the region is `templateRoles`, and Core resolves the
 *   placement to the site's own reusable component, so every seeded page shares
 *   one header and one footer. A region may sit anywhere in the order — which
 *   is what lets an announcement bar precede the header — at most once each, and
 *   only when the theme declares that role.
 *
 * The **home** page is not a page seed. It keeps being the `templates` entry it
 * has always been, which Core maps to the site's root Page itself, so the home
 * seed on the wire is byte-identical to the one every theme has emitted; a page
 * seed may therefore not claim the slug `home` while that template seed exists.
 *
 * Every rule a seed's data obeys is the one `validateTemplateSeeds` applies —
 * the same `checkSeedData` walk, because a page seed is the same kind of write
 * Core makes on deploy.
 */
export function validatePageSeeds(
  seeds: ReadonlyArray<DeclaredSeed>,
  blocks: ReadonlyArray<Record<string, unknown>>,
  templates: ReadonlyArray<ManifestTemplateSeed>,
  roles: ManifestTemplateRoles | undefined,
  errors: string[]
): ManifestPageSeed[] {
  if (!Array.isArray(seeds)) return [];
  const blockFields = new Map<string, Array<Record<string, unknown>>>();
  for (const block of blocks) {
    if (typeof block.apiId !== 'string') continue;
    blockFields.set(
      block.apiId,
      Array.isArray(block.fields) ? (block.fields as Array<Record<string, unknown>>) : []
    );
  }

  const normalized: ManifestPageSeed[] = [];
  const slugs = new Set<string>();
  // Reserved while the home template seed exists: Core creates the root Page
  // from that seed, and two seeds for one slug is one of them being ignored.
  const homeSeeded = templates.some((seed) => seed.schemaApiId === HOME_SCHEMA_API_ID);

  const entries: Array<[number, Record<string, unknown>]> = [];
  for (const [index, entry] of seeds.entries()) {
    if (!isRecord(entry)) continue;
    if (seedTargetOf(entry) !== 'page') continue;
    entries.push([index, entry]);
  }
  if (entries.length > MAX_PAGE_SEEDS) {
    errors.push(`templates: contains ${entries.length} page seeds — exceeds ${MAX_PAGE_SEEDS}`);
  }

  for (const [index, entry] of entries.slice(0, MAX_PAGE_SEEDS)) {
    const at = `templates[${index}]`;
    const seed = entry as unknown as DeclaredPageSeed;
    const target: Record<string, unknown> = isRecord(seed.page) ? seed.page : {};
    const slug = typeof target.slug === 'string' ? target.slug : '';
    const extra = Object.keys(target).filter((key) => key !== 'slug');
    if (!PAGE_SLUG_PATTERN.test(slug) || slug.length > MAX_PAGE_SLUG_LENGTH) {
      errors.push(
        `${at}.page.slug — invalid slug ${JSON.stringify(target.slug)} (expected ${PAGE_SLUG_PATTERN.source}, at most ${MAX_PAGE_SLUG_LENGTH} characters)`
      );
    } else if (slug === HOME_PAGE_SLUG && homeSeeded) {
      errors.push(
        `${at}.page.slug — "home" is the home template seed's own page: drop that seed or pick another slug`
      );
    } else if (slugs.has(slug)) {
      errors.push(`${at}.page.slug — duplicate slug ${JSON.stringify(slug)}`);
    } else {
      slugs.add(slug);
    }
    // A page target is exactly one key: anything else is a theme reaching for
    // a knob that does not exist (a parent page, a layout) and Core's ingest
    // refuses an unknown key outright rather than ignoring it.
    for (const key of extra) {
      errors.push(`${at}.page.${key} — unknown key (a page seed names only its slug)`);
    }
    const title = stripPlainTextControls(seed.title).trim();
    if (codePointLength(title) < 1 || codePointLength(title) > MAX_TITLE_LENGTH) {
      errors.push(`${at}.title — must contain 1..${MAX_TITLE_LENGTH} characters`);
    }

    const seedBlocks = Array.isArray(seed.blocks) ? seed.blocks : [];
    if (seedBlocks.length < 1 || seedBlocks.length > MAX_PAGE_SEED_BLOCKS) {
      errors.push(`${at}.blocks — must declare 1..${MAX_PAGE_SEED_BLOCKS} entries`);
    }
    const placedRoles = new Set<string>();
    const normalizedBlocks: ManifestPageSeedEntry[] = [];
    for (const [blockIndex, blockEntry] of seedBlocks.slice(0, MAX_PAGE_SEED_BLOCKS).entries()) {
      const blockAt = `${at}.blocks[${blockIndex}]`;
      if (!isRecord(blockEntry)) {
        errors.push(`${blockAt} — must be a block or a region placement`);
        continue;
      }
      if (blockEntry.role !== undefined) {
        const region = checkedRegion(blockAt, blockEntry, roles, placedRoles, errors);
        if (region !== null) normalizedBlocks.push(region);
        continue;
      }
      const block = blockEntry as DeclaredPageSeedBlock;
      const fields = blockFields.get(block.apiId);
      if (fields === undefined) {
        errors.push(`${blockAt}.apiId — unknown block "${String(block.apiId)}"`);
      } else if (!isRecord(block.data)) {
        errors.push(`${blockAt}.data — must be an object`);
      } else {
        checkSeedData(
          (path, message) => `${blockAt}.data — ${path}: ${message}`,
          fields,
          block.data,
          errors
        );
      }
      // `true` or absent, never `false`: "required" is one state a node is in,
      // and an explicit `false` in a manifest would read as a decision Core
      // has to carry rather than the absence it actually is.
      const required = (blockEntry as Record<string, unknown>).required;
      if (required !== undefined && required !== true) {
        errors.push(`${blockAt}.required — must be true when present (omit it otherwise)`);
      }
      normalizedBlocks.push({
        type: block.apiId,
        data: isRecord(block.data) ? block.data : {},
        ...(required === true ? { required: true } : {}),
      });
    }
    normalized.push({ slug, title, blocks: normalizedBlocks });
  }
  return normalized;
}

/**
 * One region placement, or null when the theme declared something that is not
 * one. A region is a placement and nothing else: it names a role the theme
 * actually declares the block data for (otherwise Core has nothing to resolve
 * it to), it appears at most once in a page — a page with two headers is one of
 * them being wrong — and it carries neither data nor `required`, because the
 * block behind it is `templateRoles` and a shared region is not a node an
 * author can delete in the first place.
 */
function checkedRegion(
  blockAt: string,
  entry: Record<string, unknown>,
  roles: ManifestTemplateRoles | undefined,
  placed: Set<string>,
  errors: string[]
): ManifestPageSeedEntry | null {
  const role = entry.role as DeclaredPageSeedRegion['role'];
  if (!ROLES.has(role)) {
    errors.push(`${blockAt}.role — must be "header" or "footer"`);
    return null;
  }
  const stray = ['apiId', 'data', 'required'].filter((key) => entry[key] !== undefined);
  for (const key of stray) {
    errors.push(
      `${blockAt}.${key} — a region placement carries only its role (the block behind it is templateRoles.${role})`
    );
  }
  if (placed.has(role)) {
    errors.push(`${blockAt}.role — duplicate role "${role}"`);
    return null;
  }
  placed.add(role);
  if (roles?.[role] === undefined) {
    errors.push(`${blockAt}.role — placing the ${role} region needs templateRoles.${role}`);
  }
  return { type: REGION_TYPES[role] };
}

/**
 * Validates the `templates` / `bindings` a seed block declares for its layout
 * node and returns them in the shape the node carries.
 *
 * Both are maps from a **target path into the block's own fields** — the same
 * grammar the theme's template layout reads (identifier segments, list indices
 * allowed: `heading`, `items.0.label`), whose first segment must be a field the
 * block declares — to a non-empty string: a text template (`{{ title }}`) for
 * `templates`, a path on the routed entry for `bindings`. What the value
 * resolves to is the deploy's to check against the entry it renders; a theme
 * can only be held to the grammar and to fields it actually ships.
 */
function checkedNodeBindings(
  blockAt: string,
  block: DeclaredTemplateSeedBlock,
  fields: ReadonlyArray<Record<string, unknown>> | undefined,
  errors: string[]
): NodeBindings {
  const carried: NodeBindings = {};
  for (const key of NODE_BINDING_KEYS) {
    const declared = block[key];
    if (declared === undefined) continue;
    if (!isRecord(declared)) {
      errors.push(`${blockAt}.${key} — must be an object`);
      continue;
    }
    // An unknown block already reported its own error; there are no fields to
    // hold the paths against, so nothing more is claimed about them here.
    if (fields === undefined) continue;
    const declaredFields = new Set(
      fields
        .map((field) => field.fieldId)
        .filter((fieldId): fieldId is string => typeof fieldId === 'string')
    );
    const validated: Record<string, string> = {};
    for (const [path, value] of Object.entries(declared)) {
      const at = `${blockAt}.${key}.${path}`;
      if (!TARGET_FIELD_PATH.test(path) || !declaredFields.has(path.split('.')[0]!)) {
        errors.push(
          `${at} — must be a path into ${String(block.apiId)}'s fields (expected ${TARGET_FIELD_PATH.source})`
        );
        continue;
      }
      if (typeof value !== 'string' || value === '') {
        errors.push(`${at} — must be a non-empty string`);
        continue;
      }
      validated[path] = value;
    }
    if (Object.keys(validated).length > 0) carried[key] = validated;
  }
  return carried;
}

/**
 * A declared layout is held to the one shape a seed may take — a single column
 * of role and block nodes — so the manifest always carries a document the
 * deploy can decode without a fallback.
 */
function checkedLayout(
  at: string,
  layout: TemplateSeedLayout,
  seedBlockIds: ReadonlySet<string>,
  nodeBindings: ReadonlyMap<string, NodeBindings>,
  errors: string[]
): TemplateSeedLayout {
  if (!isRecord(layout)) {
    errors.push(`${at}.layout — must be a layout document`);
    return layout;
  }
  if (layout.version !== 1) {
    errors.push(`${at}.layout.version — must be 1`);
    return layout;
  }
  const root = layout.root;
  if (
    !isRecord(root) ||
    root.type !== 'flex' ||
    !isRecord(root.layout) ||
    !isRecord(root.layout.direction) ||
    root.layout.direction.normal !== 'column'
  ) {
    errors.push(`${at}.layout.root — must be a flex container with direction.normal "column"`);
    return layout;
  }
  const nodeIds = new Set<string>();
  if (!NODE_ID_PATTERN.test(String(root.id))) {
    errors.push(
      `${at}.layout.root.id — invalid node id "${String(root.id)}" (expected ${NODE_ID_PATTERN.source})`
    );
  } else {
    nodeIds.add(String(root.id));
  }
  const children = Array.isArray(root.children) ? (root.children as unknown[]) : [];
  const placed = new Set<string>();
  const roles = new Set<string>();
  const normalizedChildren: TemplateSeedLayoutNode[] = [];
  for (const [index, child] of children.entries()) {
    const childAt = `${at}.layout.root.children[${index}]`;
    if (!isRecord(child)) {
      errors.push(`${childAt} — must be a reusable or block node`);
      continue;
    }
    const id = typeof child.id === 'string' ? child.id : '';
    if (!NODE_ID_PATTERN.test(id)) {
      errors.push(
        `${childAt}.id — invalid node id "${String(child.id)}" (expected ${NODE_ID_PATTERN.source})`
      );
    } else if (nodeIds.has(id)) {
      errors.push(`${childAt}.id — duplicate node id "${id}"`);
    } else {
      nodeIds.add(id);
    }
    if (child.type === 'block') {
      const entryId = typeof child.entryId === 'string' ? child.entryId : '';
      if (!seedBlockIds.has(entryId)) {
        errors.push(`${childAt}.entryId — no seed block with id "${String(child.entryId)}"`);
      } else {
        placed.add(entryId);
      }
      normalizedChildren.push({ id, type: 'block', entryId, ...nodeBindings.get(entryId) });
      continue;
    }
    if (child.type === 'reusable') {
      const role = typeof child.role === 'string' ? child.role : '';
      if (!ROLES.has(role)) {
        errors.push(`${childAt}.role — must be "header" or "footer"`);
      } else if (roles.has(role)) {
        errors.push(`${childAt}.role — duplicate role "${role}"`);
      } else {
        roles.add(role);
      }
      normalizedChildren.push({ id, type: 'reusable', role: role as 'header' | 'footer' });
      continue;
    }
    // Nesting a container would emit a document the deploy's decoder does not
    // accept, so a seed's layout stays one flat column.
    errors.push(`${childAt}.type — must be "reusable" or "block" (got "${String(child.type)}")`);
  }
  for (const id of seedBlockIds) {
    if (!placed.has(id)) {
      errors.push(`${at}.layout — seed block "${id}" is not placed in the layout`);
    }
  }
  // Rebuilt rather than passed through, so a key the theme added to a node
  // never reaches the manifest: the deploy decodes exactly these.
  return {
    version: 1,
    root: {
      id: String(root.id),
      type: 'flex',
      layout: { direction: { normal: 'column' } },
      children: normalizedChildren,
    },
  };
}

/**
 * A seed's pattern has to agree with what it is a template for: the home seed
 * owns the site root, and a catalog template is resolved by looking its slug up
 * in the catalog, so its pattern must end in the `:slug` parameter Core reads.
 * The parse is Core's own (`parseDynamicRoutePattern`): a static prefix plus one
 * trailing parameter, nothing else.
 */
function checkRoutePattern(at: string, seed: DeclaredTemplateSeed, errors: string[]): void {
  if (seed.schemaApiId === 'home') {
    if (seed.routePattern !== HOME_ROUTE_PATTERN) {
      errors.push(
        `${at}.routePattern — the home seed must be "${HOME_ROUTE_PATTERN}" (got ${JSON.stringify(seed.routePattern)})`
      );
    }
    return;
  }
  const parsed = parseDynamicRoutePattern(seed.routePattern);
  if (parsed === null) {
    errors.push(
      `${at}.routePattern — a catalog template needs a static prefix and one ":${CATALOG_SLUG_PARAM}" parameter (got ${JSON.stringify(seed.routePattern)})`
    );
    return;
  }
  if (parsed.paramName !== CATALOG_SLUG_PARAM) {
    errors.push(
      `${at}.routePattern — a catalog template is resolved by slug, so its parameter must be ":${CATALOG_SLUG_PARAM}" (got ":${parsed.paramName}")`
    );
  }
}

/**
 * Validates the block data a theme declares behind the `header`/`footer`
 * roles its template seed layouts may reference, and returns it in manifest
 * shape. A role's `apiId` must be a block the theme ships and its `data` is
 * validated exactly like a seed block's data (the same media walk `mock.json`
 * and `templates[].blocks[].data` go through) — the manifest write it becomes
 * is the same kind of write. Cross-checked against the already-validated
 * `templates`: a role a seed's layout places (whether generated or declared)
 * and that the theme did not declare is an error naming the seed that needs
 * it, so Core is never handed a template it cannot seed a site with.
 */
export function validateTemplateRoles(
  roles: ManifestTemplateRoles | undefined,
  blocks: ReadonlyArray<Record<string, unknown>>,
  templates: ReadonlyArray<ManifestTemplateSeed>,
  errors: string[]
): ManifestTemplateRoles | undefined {
  const blockFields = new Map<string, Array<Record<string, unknown>>>();
  for (const block of blocks) {
    if (typeof block.apiId !== 'string') continue;
    blockFields.set(
      block.apiId,
      Array.isArray(block.fields) ? (block.fields as Array<Record<string, unknown>>) : []
    );
  }

  // The first seed (by index) whose layout places each role, so a missing
  // role's error can point at the seed that needs it. Read defensively
  // through `unknown` rather than trusting `ManifestTemplateSeed`'s type: a
  // seed whose declared layout failed validation still reaches here (the
  // scan keeps going to collect every error), carrying whatever malformed
  // document it was given.
  const placedBy = new Map<'header' | 'footer', number>();
  for (const [index, seed] of templates.entries()) {
    const layout: unknown = seed.layout;
    const root = isRecord(layout) ? layout.root : undefined;
    const children = isRecord(root) && Array.isArray(root.children) ? root.children : [];
    for (const child of children) {
      if (
        isRecord(child) &&
        child.type === 'reusable' &&
        ROLES.has(child.role as string) &&
        !placedBy.has(child.role as 'header' | 'footer')
      ) {
        placedBy.set(child.role as 'header' | 'footer', index);
      }
    }
  }

  const input = isRecord(roles) ? (roles as Record<string, unknown>) : {};
  const normalized: ManifestTemplateRoles = {};
  for (const role of ROLES as Set<'header' | 'footer'>) {
    const at = `templateRoles.${role}`;
    const entry = input[role];
    if (entry === undefined) {
      const placedAt = placedBy.get(role);
      if (placedAt !== undefined) {
        errors.push(`${at} — required: templates[${placedAt}] places the ${role} role`);
      }
      continue;
    }
    if (!isRecord(entry)) {
      errors.push(`${at} — must be an object`);
      continue;
    }
    const apiId = typeof entry.apiId === 'string' ? entry.apiId : '';
    const fields = blockFields.get(apiId);
    const data = isRecord(entry.data) ? entry.data : {};
    if (fields === undefined) {
      errors.push(`${at}.apiId — unknown block "${String(entry.apiId)}"`);
    } else if (!isRecord(entry.data)) {
      errors.push(`${at}.data — must be an object`);
    } else {
      // The same walk the scanner applies to a block's mock.json and to a
      // template seed's block data: a role's data is the same kind of write.
      checkSeedData((path, message) => `${at}.data — ${path}: ${message}`, fields, data, errors);
    }
    normalized[role] = { apiId, data };
  }
  return normalized.header === undefined && normalized.footer === undefined
    ? undefined
    : normalized;
}
