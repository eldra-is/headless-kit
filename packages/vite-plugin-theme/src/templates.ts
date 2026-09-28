import { checkSeedMedia } from './seedData';
import type {
  DeclaredTemplateSeed,
  ManifestTemplateSeed,
  ManifestTemplateSeedBlock,
  TemplateSeedLayout,
  TemplateSeedLayoutNode,
} from './types';

const MAX_TEMPLATES = 8;
const MAX_TEMPLATE_BLOCKS = 50;
const MAX_TITLE_LENGTH = 80;
const MAX_ROUTE_PATTERN_BYTES = 255;
/** The same id shape layout nodes take everywhere else in the kit. */
const NODE_ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;
const SCHEMA_API_IDS = new Set(['catalog:product', 'catalog:collection', 'home']);
const ROLES = new Set(['header', 'footer']);
const ROOT_NODE_ID = 'root';
const ROLE_NODE_IDS = { header: 'role-header', footer: 'role-footer' } as const;

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
  for (const block of seed.blocks) {
    children.push({ id: block.id, type: 'block', entryId: block.id });
  }
  if (seed.footer !== false) {
    children.push({ id: ROLE_NODE_IDS.footer, type: 'reusable', role: 'footer' });
  }
  return {
    version: 1,
    root: { id: ROOT_NODE_ID, type: 'flex', layout: { direction: { normal: 'column' } }, children },
  };
}

/**
 * Validates the theme's declared template seeds against the blocks it ships and
 * returns them in manifest shape: every seed with a layout, and without the
 * `header`/`footer` switches, which steer the generated layout and are never
 * emitted.
 */
export function validateTemplateSeeds(
  seeds: ReadonlyArray<DeclaredTemplateSeed>,
  blocks: ReadonlyArray<Record<string, unknown>>,
  errors: string[]
): ManifestTemplateSeed[] {
  if (seeds.length > MAX_TEMPLATES) {
    errors.push(`templates: contains ${seeds.length} templates — exceeds ${MAX_TEMPLATES}`);
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
  for (const [index, seed] of seeds.slice(0, MAX_TEMPLATES).entries()) {
    const at = `templates[${index}]`;
    if (!SCHEMA_API_IDS.has(seed.schemaApiId)) {
      errors.push(`${at}.schemaApiId — must be "catalog:product", "catalog:collection" or "home"`);
    }
    const title = stripPlainTextControls(seed.title).trim();
    if (codePointLength(title) < 1 || codePointLength(title) > MAX_TITLE_LENGTH) {
      errors.push(`${at}.title — must contain 1..${MAX_TITLE_LENGTH} characters`);
    }
    if (!validRoutePattern(seed.routePattern)) {
      errors.push(`${at}.routePattern — invalid route pattern`);
    } else if (patterns.has(seed.routePattern)) {
      errors.push(`${at}.routePattern — duplicate pattern ${JSON.stringify(seed.routePattern)}`);
    }
    patterns.add(seed.routePattern);

    const seedBlocks = Array.isArray(seed.blocks) ? seed.blocks : [];
    if (seedBlocks.length < 1 || seedBlocks.length > MAX_TEMPLATE_BLOCKS) {
      errors.push(`${at}.blocks — must declare 1..${MAX_TEMPLATE_BLOCKS} blocks`);
    }
    const seedBlockIds = new Set<string>();
    const normalizedBlocks: ManifestTemplateSeedBlock[] = [];
    for (const [blockIndex, block] of seedBlocks.slice(0, MAX_TEMPLATE_BLOCKS).entries()) {
      const blockAt = `${at}.blocks[${blockIndex}]`;
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
        checkSeedMedia(
          (path, message) => `${blockAt}.data — ${path}: ${message}`,
          fields,
          block.data,
          errors
        );
      }
      // Only the three keys Core decodes travel to the manifest.
      normalizedBlocks.push({ id: block.id, apiId: block.apiId, data: block.data });
    }

    const layout =
      seed.layout === undefined
        ? seedLayout({ ...seed, blocks: normalizedBlocks })
        : checkedLayout(at, seed.layout, seedBlockIds, errors);
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
 * A declared layout is held to the one shape a seed may take — a single column
 * of role and block nodes — so the manifest always carries a document the
 * deploy can decode without a fallback.
 */
function checkedLayout(
  at: string,
  layout: TemplateSeedLayout,
  seedBlockIds: ReadonlySet<string>,
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
      normalizedChildren.push({ id, type: 'block', entryId });
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

/** A route pattern Core can parse: absolute, single-segment separators, and
 * free of the characters a static path may never carry. `:param` segments stay
 * legal — that is how a catalog template names its slug. */
function validRoutePattern(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value !== '' &&
    new TextEncoder().encode(value).byteLength <= MAX_ROUTE_PATTERN_BYTES &&
    value.startsWith('/') &&
    !value.includes('//') &&
    !/[?#*\\\s]/.test(value) &&
    (value === '/' || !value.endsWith('/'))
  );
}

function stripPlainTextControls(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, '') : '';
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
