export type LayoutBreakpoint = 'normal' | 'tablet' | 'mobile';
export type Responsive<T> = { normal: T; tablet?: T; mobile?: T };
export type CssLength = `${number}px` | `${number}rem` | `${number}%`;
export type SizingLength = CssLength | 'auto';
/** `width` only: a length/`auto`, plus the two intrinsic-sizing keywords —
 * `fill` (grow to the available space) and `fit-content` (shrink to the
 * content). `minWidth`/`maxWidth`/`minHeight` stay `SizingLength`; only
 * `width` accepts these. */
export type WidthLength = SizingLength | 'fill' | 'fit-content';
export type Spacing = { top: CssLength; right: CssLength; bottom: CssLength; left: CssLength };

export type LayoutStyle = {
  container?: Responsive<string>;
  margin?: Responsive<Partial<Spacing>>;
  padding?: Responsive<Partial<Spacing>>;
  width?: Responsive<WidthLength>;
  minWidth?: Responsive<SizingLength>;
  maxWidth?: Responsive<SizingLength>;
  minHeight?: Responsive<SizingLength>;
  alignSelf?: Responsive<'auto' | 'start' | 'center' | 'end' | 'stretch'>;
  visible?: Responsive<boolean>;
};

/**
 * Structural twin of @eldrajs/vite-plugin-theme's BlockSlotDefinition (theme-core
 * cannot import from the Vite plugin, which depends on this package). Keep in
 * sync: `id` ^[a-z][a-z0-9-]{0,47}$, `maxItems` 1..20, `minItems` only 0.
 */
export interface BlockSlotDefinition {
  id: string;
  label: string;
  description?: string;
  minItems?: 0;
  maxItems: number;
  allowedBlockApiIds?: string[];
}

/** Theme manifest catalog checks injected by the caller (entry fetch, catalog). */
export interface SlotValidationContext {
  // The theme's own manifest catalog: apiId -> declared slots in declaration order.
  slotCatalog: Record<string, ReadonlyArray<BlockSlotDefinition>>;
  // Resolves a block entry id to its schema apiId (from the fetched entries).
  entryApiId: (entryId: string) => string | undefined;
}

export type LayoutBlockNode = {
  id: string;
  type: 'block';
  entryId: string;
  style?: LayoutStyle;
  slots?: Record<string, LayoutBlockNode[]>; // v3 only
};

export type LayoutNode =
  | LayoutBlockNode
  | {
      id: string;
      type: 'flex';
      children: LayoutNode[];
      style?: LayoutStyle;
      layout: {
        direction: Responsive<'row' | 'column'>;
        wrap?: Responsive<'nowrap' | 'wrap'>;
        gap?: Responsive<CssLength>;
        justify?: Responsive<
          'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly'
        >;
        align?: Responsive<'start' | 'center' | 'end' | 'stretch' | 'baseline'>;
      };
    }
  | {
      id: string;
      type: 'grid';
      children: LayoutNode[];
      style?: LayoutStyle;
      layout: {
        columns: Responsive<number>;
        rows?: Responsive<number | 'auto'>;
        columnGap?: Responsive<CssLength>;
        rowGap?: Responsive<CssLength>;
        justifyItems?: Responsive<'start' | 'center' | 'end' | 'stretch'>;
        alignItems?: Responsive<'start' | 'center' | 'end' | 'stretch'>;
      };
    };

export type LayoutContainerNode = Extract<LayoutNode, { type: 'flex' | 'grid' }>;
export type LayoutDocument = { version: 1 | 2 | 3; root: LayoutContainerNode };

/**
 * A theme's own tablet/normal layout breakpoints, as min-width px: mobile is
 * `< tablet`, tablet is `tablet…normal-1`, normal is `>= normal`. The one
 * source every breakpoint-dependent CSS (`cssForDocument`'s three `@media`
 * ranges) and the `theme:ready` bridge negotiation (`breakpoints`, additive
 * — see `./bridge`'s protocol) both read from.
 */
export interface LayoutBreakpoints {
  tablet: number;
  normal: number;
}

/** The theme's breakpoints when it configures none — today's numbers,
 * unchanged, so an unconfigured theme's CSS is byte-identical to before this
 * type existed. */
export const DEFAULT_LAYOUT_BREAKPOINTS: LayoutBreakpoints = { tablet: 768, normal: 1024 };

const MIN_TABLET_BREAKPOINT = 320;
const MAX_NORMAL_BREAKPOINT = 4096;

/**
 * Validates a theme-configured breakpoints pair and falls back to
 * `DEFAULT_LAYOUT_BREAKPOINTS`, with a console warning, on anything that
 * cannot be turned into three non-overlapping, non-empty ranges: both must be
 * finite integers, `320 <= tablet < normal <= 4096`. `undefined`/`null` (not
 * configured) resolves to the defaults silently — that is the common case,
 * not a mistake worth warning about.
 */
export function resolveLayoutBreakpoints(
  breakpoints?: LayoutBreakpoints | null
): LayoutBreakpoints {
  if (breakpoints === undefined || breakpoints === null) return DEFAULT_LAYOUT_BREAKPOINTS;
  const { tablet, normal } = breakpoints;
  const valid =
    Number.isInteger(tablet) &&
    Number.isInteger(normal) &&
    tablet >= MIN_TABLET_BREAKPOINT &&
    tablet < normal &&
    normal <= MAX_NORMAL_BREAKPOINT;
  if (valid) return { tablet, normal };
  console.warn(
    `[eldra] invalid layout breakpoints ${JSON.stringify(breakpoints)} ` +
      `(expected integers with ${MIN_TABLET_BREAKPOINT} <= tablet < normal <= ${MAX_NORMAL_BREAKPOINT}); ` +
      `falling back to the defaults (${DEFAULT_LAYOUT_BREAKPOINTS.tablet}/${DEFAULT_LAYOUT_BREAKPOINTS.normal}).`
  );
  return DEFAULT_LAYOUT_BREAKPOINTS;
}

/** @deprecated derived px ranges for `DEFAULT_LAYOUT_BREAKPOINTS`, kept for
 * existing consumers. A theme with custom breakpoints is not reflected here —
 * read `resolveLayoutBreakpoints`'s result instead. */
export const LAYOUT_BREAKPOINTS = {
  mobileMax: DEFAULT_LAYOUT_BREAKPOINTS.tablet - 1,
  tabletMin: DEFAULT_LAYOUT_BREAKPOINTS.tablet,
  tabletMax: DEFAULT_LAYOUT_BREAKPOINTS.normal - 1,
  normalMin: DEFAULT_LAYOUT_BREAKPOINTS.normal,
} as const;

export type LayoutValidationCode =
  | 'INVALID_TYPE'
  | 'UNKNOWN_KEY'
  | 'REQUIRED'
  | 'INVALID_VALUE'
  | 'LIMIT_EXCEEDED'
  | 'DUPLICATE_ID'
  | 'BLOCK_NOT_FOUND'
  | 'COMPONENT_NOT_FOUND'
  | 'COMPONENT_STALE'
  | 'COMPONENT_FOREIGN'
  | 'SLOT_VERSION'
  | 'SLOT_UNKNOWN'
  | 'SLOT_DISALLOWED'
  | 'SLOT_FULL';

export type LayoutValidationIssue = { path: string; code: LayoutValidationCode };

export class LayoutValidationError extends Error {
  readonly issue: LayoutValidationIssue;

  constructor(issue: LayoutValidationIssue) {
    super(`invalid layout at ${JSON.stringify(issue.path)}: ${issue.code}`);
    this.name = 'LayoutValidationError';
    this.issue = issue;
  }
}

export type NormalizedLayoutResult = {
  document: LayoutDocument;
  blockEntryIds: string[];
};

export type ResolvedLayoutStyle = {
  container?: string;
  margin?: Partial<Spacing>;
  padding?: Partial<Spacing>;
  width?: WidthLength;
  minWidth?: SizingLength;
  maxWidth?: SizingLength;
  minHeight?: SizingLength;
  alignSelf?: 'auto' | 'start' | 'center' | 'end' | 'stretch';
  visible: boolean;
};

export type ResolvedLayoutNode =
  | { id: string; type: 'block'; entryId: string; style: ResolvedLayoutStyle }
  | {
      id: string;
      type: 'flex';
      children: ResolvedLayoutNode[];
      style: ResolvedLayoutStyle;
      layout: {
        direction: 'row' | 'column';
        wrap?: 'nowrap' | 'wrap';
        gap?: CssLength;
        justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
        align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
      };
    }
  | {
      id: string;
      type: 'grid';
      children: ResolvedLayoutNode[];
      style: ResolvedLayoutStyle;
      layout: {
        columns: number;
        rows?: number | 'auto';
        columnGap?: CssLength;
        rowGap?: CssLength;
        justifyItems?: 'start' | 'center' | 'end' | 'stretch';
        alignItems?: 'start' | 'center' | 'end' | 'stretch';
      };
    };

export type ResolvedLayoutDocument = {
  version: 1;
  breakpoint: LayoutBreakpoint;
  root: Extract<ResolvedLayoutNode, { type: 'flex' | 'grid' }>;
};

// Its own `slots` narrows to render nodes (className included), not the plain
// LayoutBlockNode slots inherited from LayoutNode — renderNode() (below)
// recurses into slot children the same way it recurses into flex/grid children.
export type LayoutRenderBlockNode = Omit<Extract<LayoutNode, { type: 'block' }>, 'slots'> & {
  className: string;
  slots?: Record<string, LayoutRenderBlockNode[]>;
};

export type LayoutRenderNode =
  | LayoutRenderBlockNode
  | (Omit<Extract<LayoutNode, { type: 'flex' }>, 'children'> & {
      className: string;
      children: LayoutRenderNode[];
    })
  | (Omit<Extract<LayoutNode, { type: 'grid' }>, 'children'> & {
      className: string;
      children: LayoutRenderNode[];
    });

export type LayoutRenderModel = NormalizedLayoutResult & {
  root: Extract<LayoutRenderNode, { type: 'flex' | 'grid' }>;
  css: string;
};

const MAX_BYTES = 262_144;
const MAX_NODES = 500;
const MAX_DEPTH = 12;
const MAX_SLOTS_PER_NODE = 12;
const MAX_SLOT_CHILDREN = 20;
const SLOT_ID = /^[a-z][a-z0-9-]{0,47}$/;
const NODE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,95}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LENGTH = /^(0|[1-9][0-9]*)(\.[0-9]{1,4})?(px|rem|%)$/;
const BREAKPOINT_KEYS = ['normal', 'tablet', 'mobile'] as const;
const SPACING_KEYS = ['top', 'right', 'bottom', 'left'] as const;
const STYLE_KEYS = [
  'container',
  'margin',
  'padding',
  'width',
  'minWidth',
  'maxWidth',
  'minHeight',
  'alignSelf',
  'visible',
] as const;

type JsonObject = Record<string, unknown>;
type ScalarNormalizer<T> = (value: unknown, path: string) => T;

class Validator {
  readonly blockEntryIds: string[] = [];
  private readonly active = new WeakSet<object>();
  private readonly ids = new Set<string>();
  private nodeCount = 0;
  private documentVersion: 1 | 2 | 3 = 1;

  constructor(
    private readonly allowedEntryIds?: ReadonlySet<string>,
    private readonly allowedContainerIds?: ReadonlySet<string>,
    private readonly slotContext?: SlotValidationContext
  ) {}

  document(value: unknown): LayoutDocument {
    const object = this.object(value, '');
    return this.withActive(object, '', () => {
      this.keys(object, ['version', 'root'], '');
      if (!has(object, 'version')) fail('/version', 'REQUIRED');
      if (typeof object.version !== 'number' || !Number.isInteger(object.version))
        fail('/version', 'INVALID_TYPE');
      if (object.version !== 1 && object.version !== 2 && object.version !== 3)
        fail('/version', 'INVALID_VALUE');
      this.documentVersion = object.version as 1 | 2 | 3;
      if (!has(object, 'root')) fail('/root', 'REQUIRED');
      const root = this.node(object.root, '/root', 1);
      if (root.type === 'block') fail('/root/type', 'INVALID_VALUE');
      return { version: this.documentVersion, root };
    });
  }

  private node(value: unknown, path: string, depth: number): LayoutNode {
    if (depth > MAX_DEPTH) fail(path, 'LIMIT_EXCEEDED');
    this.nodeCount += 1;
    if (this.nodeCount > MAX_NODES) fail(path, 'LIMIT_EXCEEDED');
    const object = this.object(value, path);
    return this.withActive(object, path, () => {
      if (!has(object, 'id')) fail(`${path}/id`, 'REQUIRED');
      if (typeof object.id !== 'string') fail(`${path}/id`, 'INVALID_TYPE');
      if (!NODE_ID.test(object.id)) fail(`${path}/id`, 'INVALID_VALUE');
      if (this.ids.has(object.id)) fail(`${path}/id`, 'DUPLICATE_ID');
      this.ids.add(object.id);
      if (!has(object, 'type')) fail(`${path}/type`, 'REQUIRED');
      if (typeof object.type !== 'string') fail(`${path}/type`, 'INVALID_TYPE');
      if (object.type === 'block') return this.block(object, path, object.id, depth);
      if (object.type === 'flex' || object.type === 'grid') {
        return this.container(object, path, depth, object.id, object.type);
      }
      fail(`${path}/type`, 'INVALID_VALUE');
    });
  }

  private block(
    object: JsonObject,
    path: string,
    id: string,
    depth: number
  ): Extract<LayoutNode, { type: 'block' }> {
    // 'slots' is admitted at every version so v1/v2 documents report the
    // version gate (SLOT_VERSION) instead of an unrelated UNKNOWN_KEY.
    this.keys(object, ['id', 'type', 'entryId', 'style', 'slots'], path);
    if (!has(object, 'entryId')) fail(`${path}/entryId`, 'REQUIRED');
    if (typeof object.entryId !== 'string') fail(`${path}/entryId`, 'INVALID_TYPE');
    if (!UUID.test(object.entryId)) fail(`${path}/entryId`, 'INVALID_VALUE');
    if (this.allowedEntryIds && !this.allowedEntryIds.has(object.entryId)) {
      fail(`${path}/entryId`, 'BLOCK_NOT_FOUND');
    }
    this.blockEntryIds.push(object.entryId);
    const normalized: Extract<LayoutNode, { type: 'block' }> = {
      id,
      type: 'block',
      entryId: object.entryId,
    };
    if (has(object, 'style')) normalized.style = this.style(object.style, `${path}/style`);
    if (has(object, 'slots')) {
      if (this.documentVersion !== 3) fail(`${path}/slots`, 'SLOT_VERSION');
      normalized.slots = this.validateSlots(
        this.object(object.slots, `${path}/slots`),
        path,
        depth,
        object.entryId
      );
    }
    return normalized;
  }

  private validateSlots(
    raw: Record<string, unknown>,
    path: string,
    depth: number,
    hostEntryId: string
  ): Record<string, LayoutBlockNode[]> {
    // Fail closed: without a manifest catalog there is nothing to check against.
    if (!this.slotContext) fail(`${path}/slots`, 'SLOT_UNKNOWN');
    const hostApiId = this.slotContext.entryApiId(hostEntryId);
    const catalog = hostApiId === undefined ? undefined : this.slotContext.slotCatalog[hostApiId];
    if (catalog === undefined) fail(`${path}/slots`, 'SLOT_UNKNOWN');

    const docKeys = Object.keys(raw);
    if (docKeys.length > MAX_SLOTS_PER_NODE) fail(`${path}/slots`, 'LIMIT_EXCEEDED');
    const catalogById = new Map(catalog.map((slot) => [slot.id, slot]));
    for (const slotId of docKeys) {
      if (!SLOT_ID.test(slotId)) fail(`${path}/slots/${pointerToken(slotId)}`, 'INVALID_VALUE');
      if (!catalogById.has(slotId)) fail(`${path}/slots/${pointerToken(slotId)}`, 'SLOT_UNKNOWN');
    }
    const out: Record<string, LayoutBlockNode[]> = {};
    // Manifest declaration order (spec §1.2) — deterministic blockEntryIds.
    for (const def of catalog) {
      if (!has(raw, def.id)) continue;
      const childrenRaw = raw[def.id];
      if (!Array.isArray(childrenRaw))
        fail(`${path}/slots/${pointerToken(def.id)}`, 'INVALID_TYPE');
      if (childrenRaw.length > MAX_SLOT_CHILDREN)
        fail(`${path}/slots/${pointerToken(def.id)}`, 'LIMIT_EXCEEDED');
      if (childrenRaw.length > def.maxItems)
        fail(`${path}/slots/${pointerToken(def.id)}`, 'SLOT_FULL');
      const children: LayoutBlockNode[] = [];
      for (let index = 0; index < childrenRaw.length; index += 1) {
        const childPath = `${path}/slots/${pointerToken(def.id)}/${index}`;
        const child = childrenRaw[index];
        if (typeof child !== 'object' || child === null || (child as JsonObject).type !== 'block') {
          fail(`${childPath}/type`, 'INVALID_TYPE');
        }
        // Slot children flow through the same node() counters (depth, node
        // count), so every existing limit applies slot-expanded; nested slots
        // recurse through block().
        const childNode = this.node(child as JsonObject, childPath, depth + 1) as LayoutBlockNode;
        // Allowlist: explicit list, or (omitted) any apiId except the host's own.
        const childApiId = this.slotContext.entryApiId(childNode.entryId);
        let allowed = childApiId !== undefined && childApiId !== hostApiId;
        if (def.allowedBlockApiIds && def.allowedBlockApiIds.length > 0) {
          allowed = def.allowedBlockApiIds.includes(childApiId ?? '');
        }
        if (!allowed) fail(childPath, 'SLOT_DISALLOWED');
        children.push(childNode);
      }
      out[def.id] = children;
    }
    return out;
  }

  private container(
    object: JsonObject,
    path: string,
    depth: number,
    id: string,
    type: 'flex' | 'grid'
  ): Extract<LayoutNode, { type: typeof type }> {
    this.keys(object, ['id', 'type', 'children', 'style', 'layout'], path);
    if (!has(object, 'children')) fail(`${path}/children`, 'REQUIRED');
    if (!Array.isArray(object.children)) fail(`${path}/children`, 'INVALID_TYPE');
    const childValues = object.children as unknown[];
    const children = this.withActive(childValues, `${path}/children`, () => {
      this.arrayKeys(childValues, `${path}/children`);
      return childValues.map((child, index) =>
        this.node(child, `${path}/children/${index}`, depth + 1)
      );
    });
    const style = has(object, 'style') ? this.style(object.style, `${path}/style`) : undefined;
    if (!has(object, 'layout')) fail(`${path}/layout`, 'REQUIRED');
    if (type === 'flex') {
      const node: Extract<LayoutNode, { type: 'flex' }> = {
        id,
        type,
        children,
        layout: this.flexLayout(object.layout, `${path}/layout`),
      };
      if (style) node.style = style;
      return node;
    }
    const node: Extract<LayoutNode, { type: 'grid' }> = {
      id,
      type,
      children,
      layout: this.gridLayout(object.layout, `${path}/layout`),
    };
    if (style) node.style = style;
    return node;
  }

  private style(value: unknown, path: string): LayoutStyle {
    const object = this.object(value, path);
    return this.withActive(object, path, () => {
      this.keys(object, [...STYLE_KEYS], path);
      const result: LayoutStyle = {};
      if (has(object, 'container')) {
        result.container = this.responsive(
          object.container,
          `${path}/container`,
          (item, itemPath) => {
            if (typeof item !== 'string') fail(itemPath, 'INVALID_TYPE');
            if (!/^[a-z][a-z0-9-]{0,48}$/.test(item)) fail(itemPath, 'INVALID_VALUE');
            if (!this.allowedContainerIds?.has(item)) fail(itemPath, 'INVALID_VALUE');
            return item;
          }
        );
      }
      if (has(object, 'margin')) result.margin = this.spacing(object.margin, `${path}/margin`);
      if (has(object, 'padding')) result.padding = this.spacing(object.padding, `${path}/padding`);
      if (has(object, 'width'))
        result.width = this.responsive(object.width, `${path}/width`, widthLength);
      if (has(object, 'minWidth'))
        result.minWidth = this.responsive(object.minWidth, `${path}/minWidth`, sizingLength);
      if (has(object, 'maxWidth'))
        result.maxWidth = this.responsive(object.maxWidth, `${path}/maxWidth`, sizingLength);
      if (has(object, 'minHeight'))
        result.minHeight = this.responsive(object.minHeight, `${path}/minHeight`, sizingLength);
      if (has(object, 'alignSelf'))
        result.alignSelf = this.responsive(
          object.alignSelf,
          `${path}/alignSelf`,
          enumeration(['auto', 'start', 'center', 'end', 'stretch'] as const)
        );
      if (has(object, 'visible'))
        result.visible = this.responsive(object.visible, `${path}/visible`, booleanValue);
      return result;
    });
  }

  private flexLayout(
    value: unknown,
    path: string
  ): Extract<LayoutNode, { type: 'flex' }>['layout'] {
    const object = this.object(value, path);
    return this.withActive(object, path, () => {
      this.keys(object, ['direction', 'wrap', 'gap', 'justify', 'align'], path);
      if (!has(object, 'direction')) fail(`${path}/direction`, 'REQUIRED');
      const result: Extract<LayoutNode, { type: 'flex' }>['layout'] = {
        direction: this.responsive(
          object.direction,
          `${path}/direction`,
          enumeration(['row', 'column'] as const)
        ),
      };
      if (has(object, 'wrap'))
        result.wrap = this.responsive(
          object.wrap,
          `${path}/wrap`,
          enumeration(['nowrap', 'wrap'] as const)
        );
      if (has(object, 'gap')) result.gap = this.responsive(object.gap, `${path}/gap`, cssLength);
      if (has(object, 'justify'))
        result.justify = this.responsive(
          object.justify,
          `${path}/justify`,
          enumeration([
            'start',
            'center',
            'end',
            'space-between',
            'space-around',
            'space-evenly',
          ] as const)
        );
      if (has(object, 'align'))
        result.align = this.responsive(
          object.align,
          `${path}/align`,
          enumeration(['start', 'center', 'end', 'stretch', 'baseline'] as const)
        );
      return result;
    });
  }

  private gridLayout(
    value: unknown,
    path: string
  ): Extract<LayoutNode, { type: 'grid' }>['layout'] {
    const object = this.object(value, path);
    return this.withActive(object, path, () => {
      this.keys(
        object,
        ['columns', 'rows', 'columnGap', 'rowGap', 'justifyItems', 'alignItems'],
        path
      );
      if (!has(object, 'columns')) fail(`${path}/columns`, 'REQUIRED');
      const result: Extract<LayoutNode, { type: 'grid' }>['layout'] = {
        columns: this.responsive(
          object.columns,
          `${path}/columns`,
          gridInteger(false) as ScalarNormalizer<number>
        ),
      };
      if (has(object, 'rows'))
        result.rows = this.responsive(object.rows, `${path}/rows`, gridInteger(true));
      if (has(object, 'columnGap'))
        result.columnGap = this.responsive(object.columnGap, `${path}/columnGap`, cssLength);
      if (has(object, 'rowGap'))
        result.rowGap = this.responsive(object.rowGap, `${path}/rowGap`, cssLength);
      if (has(object, 'justifyItems'))
        result.justifyItems = this.responsive(
          object.justifyItems,
          `${path}/justifyItems`,
          enumeration(['start', 'center', 'end', 'stretch'] as const)
        );
      if (has(object, 'alignItems'))
        result.alignItems = this.responsive(
          object.alignItems,
          `${path}/alignItems`,
          enumeration(['start', 'center', 'end', 'stretch'] as const)
        );
      return result;
    });
  }

  private responsive<T>(
    value: unknown,
    path: string,
    normalize: ScalarNormalizer<T>
  ): Responsive<T> {
    const object = this.object(value, path);
    return this.withActive(object, path, () => {
      this.keys(object, [...BREAKPOINT_KEYS], path);
      if (!has(object, 'normal')) fail(`${path}/normal`, 'REQUIRED');
      const result: Responsive<T> = { normal: normalize(object.normal, `${path}/normal`) };
      if (has(object, 'tablet')) result.tablet = normalize(object.tablet, `${path}/tablet`);
      if (has(object, 'mobile')) result.mobile = normalize(object.mobile, `${path}/mobile`);
      return result;
    });
  }

  private spacing(value: unknown, path: string): Responsive<Partial<Spacing>> {
    return this.responsive(value, path, (spacing, spacingPath) => {
      const object = this.object(spacing, spacingPath);
      return this.withActive(object, spacingPath, () => {
        this.keys(object, [...SPACING_KEYS], spacingPath);
        const result: Partial<Spacing> = {};
        for (const side of SPACING_KEYS) {
          if (has(object, side)) result[side] = cssLength(object[side], `${spacingPath}/${side}`);
        }
        return result;
      });
    });
  }

  private object(value: unknown, path: string): JsonObject {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      fail(path, 'INVALID_TYPE');
    return value as JsonObject;
  }

  private keys(object: JsonObject, allowed: readonly string[], path: string): void {
    const allowedSet = new Set(allowed);
    const unknown = Object.keys(object)
      .filter((key) => !allowedSet.has(key))
      .sort()[0];
    if (unknown !== undefined) fail(`${path}/${pointerToken(unknown)}`, 'UNKNOWN_KEY');
  }

  private arrayKeys(array: unknown[], path: string): void {
    const unknown = Object.keys(array)
      .filter((key) => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= array.length)
      .sort()[0];
    if (unknown !== undefined) fail(`${path}/${pointerToken(unknown)}`, 'UNKNOWN_KEY');
  }

  private withActive<T>(object: object, path: string, visit: () => T): T {
    if (this.active.has(object)) fail(path, 'INVALID_VALUE');
    this.active.add(object);
    try {
      return visit();
    } finally {
      this.active.delete(object);
    }
  }
}

export function validateLayoutDocument(
  value: unknown,
  allowedEntryIds?: ReadonlySet<string>,
  allowedContainerIds?: ReadonlySet<string>,
  slotContext?: SlotValidationContext
): LayoutValidationIssue | null {
  try {
    normalizeLayoutDocument(value, allowedEntryIds, allowedContainerIds, slotContext);
    return null;
  } catch (error) {
    if (error instanceof LayoutValidationError) return error.issue;
    throw error;
  }
}

export function normalizeLayoutDocument(
  value: unknown,
  allowedEntryIds?: ReadonlySet<string>,
  allowedContainerIds?: ReadonlySet<string>,
  slotContext?: SlotValidationContext
): NormalizedLayoutResult {
  const validator = new Validator(allowedEntryIds, allowedContainerIds, slotContext);
  const document = validator.document(value);
  if (new TextEncoder().encode(canonicalJson(document)).byteLength > MAX_BYTES)
    fail('', 'LIMIT_EXCEEDED');
  return { document, blockEntryIds: validator.blockEntryIds };
}

export function resolveLayoutDocument(
  value: unknown,
  breakpoint: LayoutBreakpoint,
  allowedEntryIds?: ReadonlySet<string>,
  allowedContainerIds?: ReadonlySet<string>
): ResolvedLayoutDocument {
  const { document } = normalizeLayoutDocument(value, allowedEntryIds, allowedContainerIds);
  return {
    version: 1,
    breakpoint,
    root: resolveNode(document.root, breakpoint) as Extract<
      ResolvedLayoutNode,
      { type: 'flex' | 'grid' }
    >,
  };
}

export function layoutNodeClass(nodeId: string): string {
  if (!NODE_ID.test(nodeId)) throw new TypeError('layout node id must be canonical');
  return `eldra-layout-${sha256Hex(new TextEncoder().encode(nodeId))}`;
}

/** A canonical, collision-resistant node id for framework render identities. */
export function layoutRenderNodeId(identity: string): string {
  if (typeof identity !== 'string' || identity.length === 0) {
    throw new TypeError('layout render identity must be non-empty');
  }
  return `r${sha256Hex(new TextEncoder().encode(identity))}`;
}

export function generateLayoutCss(
  value: unknown,
  allowedEntryIds?: ReadonlySet<string>,
  allowedContainerIds?: ReadonlySet<string>,
  breakpoints?: LayoutBreakpoints
): string {
  const { document } = normalizeLayoutDocument(value, allowedEntryIds, allowedContainerIds);
  return cssForDocument(document, breakpoints);
}

export function createLayoutRenderModel(
  value: unknown,
  allowedEntryIds?: ReadonlySet<string>,
  allowedContainerIds?: ReadonlySet<string>,
  slotContext?: SlotValidationContext,
  breakpoints?: LayoutBreakpoints
): LayoutRenderModel {
  const normalized = normalizeLayoutDocument(
    value,
    allowedEntryIds,
    allowedContainerIds,
    slotContext
  );
  return {
    ...normalized,
    root: renderNode(normalized.document.root) as Extract<
      LayoutRenderNode,
      { type: 'flex' | 'grid' }
    >,
    css: cssForDocument(normalized.document, breakpoints),
  };
}

function resolveNode(node: LayoutNode, breakpoint: LayoutBreakpoint): ResolvedLayoutNode {
  const style = resolveStyle(node.style, breakpoint);
  if (node.type === 'block') return { id: node.id, type: node.type, entryId: node.entryId, style };
  if (node.type === 'flex') {
    return {
      id: node.id,
      type: node.type,
      children: node.children.map((child) => resolveNode(child, breakpoint)),
      style,
      layout: {
        direction: scalar(node.layout.direction, breakpoint),
        ...(node.layout.wrap ? { wrap: scalar(node.layout.wrap, breakpoint) } : {}),
        ...(node.layout.gap ? { gap: scalar(node.layout.gap, breakpoint) } : {}),
        ...(node.layout.justify ? { justify: scalar(node.layout.justify, breakpoint) } : {}),
        ...(node.layout.align ? { align: scalar(node.layout.align, breakpoint) } : {}),
      },
    };
  }
  return {
    id: node.id,
    type: node.type,
    children: node.children.map((child) => resolveNode(child, breakpoint)),
    style,
    layout: {
      columns: scalar(node.layout.columns, breakpoint),
      ...(node.layout.rows ? { rows: scalar(node.layout.rows, breakpoint) } : {}),
      ...(node.layout.columnGap ? { columnGap: scalar(node.layout.columnGap, breakpoint) } : {}),
      ...(node.layout.rowGap ? { rowGap: scalar(node.layout.rowGap, breakpoint) } : {}),
      ...(node.layout.justifyItems
        ? { justifyItems: scalar(node.layout.justifyItems, breakpoint) }
        : {}),
      ...(node.layout.alignItems ? { alignItems: scalar(node.layout.alignItems, breakpoint) } : {}),
    },
  };
}

function resolveStyle(
  style: LayoutStyle | undefined,
  breakpoint: LayoutBreakpoint
): ResolvedLayoutStyle {
  if (!style) return { visible: true };
  return {
    ...(style.container ? { container: scalar(style.container, breakpoint) } : {}),
    ...(style.margin ? { margin: spacing(style.margin, breakpoint) } : {}),
    ...(style.padding ? { padding: spacing(style.padding, breakpoint) } : {}),
    ...(style.width ? { width: scalar(style.width, breakpoint) } : {}),
    ...(style.minWidth ? { minWidth: scalar(style.minWidth, breakpoint) } : {}),
    ...(style.maxWidth ? { maxWidth: scalar(style.maxWidth, breakpoint) } : {}),
    ...(style.minHeight ? { minHeight: scalar(style.minHeight, breakpoint) } : {}),
    ...(style.alignSelf ? { alignSelf: scalar(style.alignSelf, breakpoint) } : {}),
    visible: style.visible ? scalar(style.visible, breakpoint) : true,
  };
}

function scalar<T>(responsive: Responsive<T>, breakpoint: LayoutBreakpoint): T {
  if (breakpoint === 'mobile') return responsive.mobile ?? responsive.tablet ?? responsive.normal;
  if (breakpoint === 'tablet') return responsive.tablet ?? responsive.normal;
  return responsive.normal;
}

function spacing(
  responsive: Responsive<Partial<Spacing>>,
  breakpoint: LayoutBreakpoint
): Partial<Spacing> {
  const normal = responsive.normal;
  if (breakpoint === 'normal') return { ...normal };
  const tablet = { ...normal, ...responsive.tablet };
  return breakpoint === 'tablet' ? tablet : { ...tablet, ...responsive.mobile };
}

function renderNode(node: LayoutNode): LayoutRenderNode {
  const className = layoutNodeClass(node.id);
  if (node.type === 'block') {
    if (!node.slots) return { ...node, className } as LayoutRenderBlockNode;
    const slots: Record<string, LayoutRenderBlockNode[]> = {};
    for (const [slotId, children] of Object.entries(node.slots)) {
      slots[slotId] = children.map((child) => renderNode(child) as LayoutRenderBlockNode);
    }
    return { ...node, className, slots };
  }
  return { ...node, className, children: node.children.map(renderNode) } as LayoutRenderNode;
}

function cssForDocument(document: LayoutDocument, breakpoints?: LayoutBreakpoints): string {
  const { tablet, normal } = resolveLayoutBreakpoints(breakpoints);
  const entries: Array<{ node: LayoutNode; parent: LayoutContainerNode | null }> = [];
  walk(document.root, null, (node, parent) => entries.push({ node, parent }));
  const nodes = entries.map(({ node }) => node);
  const resolved = BREAKPOINT_KEYS.map((breakpoint) =>
    entries.map(({ node, parent }) =>
      declarations(
        resolveNode(node, breakpoint),
        node,
        breakpoint,
        parentContext(parent, breakpoint)
      )
    )
  );
  const normalRules = nodes.map((node, index) => rule(node, resolved[0]![index]!)).join('');
  const tabletRules = nodes.map((node, index) => rule(node, resolved[1]![index]!)).join('');
  const mobileRules = nodes.map((node, index) => rule(node, resolved[2]![index]!)).join('');
  return `${normalRules ? `@media (min-width:${normal}px){${normalRules}}` : ''}${tabletRules ? `@media (min-width:${tablet}px) and (max-width:${normal - 1}px){${tabletRules}}` : ''}${mobileRules ? `@media (max-width:${tablet - 1}px){${mobileRules}}` : ''}`;
}

/** The flex/grid container immediately holding a node, resolved to what
 * `widthDeclarations` needs for that breakpoint — or `'none'` when there is
 * none: the document root, or a block's slot child (nested in the block's
 * own render, not arranged by any flex/grid container the outer block sits
 * in). */
type ParentContext =
  | { type: 'flex'; direction: 'row' | 'column' }
  | { type: 'grid' }
  | { type: 'none' };

function parentContext(
  parent: LayoutContainerNode | null,
  breakpoint: LayoutBreakpoint
): ParentContext {
  if (parent === null) return { type: 'none' };
  if (parent.type === 'grid') return { type: 'grid' };
  return { type: 'flex', direction: scalar(parent.layout.direction, breakpoint) };
}

function declarations(
  node: ResolvedLayoutNode,
  source: LayoutNode,
  breakpoint: LayoutBreakpoint,
  parent: ParentContext
): Record<string, string> {
  const result: Record<string, string> = {};
  if (node.type === 'flex') {
    result.display = 'flex';
    result['flex-direction'] = node.layout.direction;
    if (node.layout.wrap !== undefined) result['flex-wrap'] = node.layout.wrap;
    if (node.layout.gap !== undefined) result.gap = node.layout.gap;
    if (node.layout.justify !== undefined) result['justify-content'] = node.layout.justify;
    if (node.layout.align !== undefined) result['align-items'] = node.layout.align;
  } else if (node.type === 'grid') {
    result.display = 'grid';
    result['grid-template-columns'] = `repeat(${node.layout.columns},minmax(0,1fr))`;
    if (node.layout.rows !== undefined)
      result['grid-template-rows'] =
        node.layout.rows === 'auto' ? 'auto' : `repeat(${node.layout.rows},minmax(0,1fr))`;
    if (node.layout.columnGap !== undefined) result['column-gap'] = node.layout.columnGap;
    if (node.layout.rowGap !== undefined) result['row-gap'] = node.layout.rowGap;
    if (node.layout.justifyItems !== undefined) result['justify-items'] = node.layout.justifyItems;
    if (node.layout.alignItems !== undefined) result['align-items'] = node.layout.alignItems;
  }
  const style = node.style;
  if (style.container !== undefined) {
    result.width = '100%';
    result['max-width'] = `var(--eldra-container-${style.container}-max-width)`;
    result['margin-left'] = 'auto';
    result['margin-right'] = 'auto';
    result['padding-left'] = `var(--eldra-container-${style.container}-gutter-${breakpoint})`;
    result['padding-right'] = `var(--eldra-container-${style.container}-gutter-${breakpoint})`;
  }
  for (const side of SPACING_KEYS) {
    const margin = style.margin?.[side];
    const padding = style.padding?.[side];
    if (margin !== undefined) result[`margin-${side}`] = margin;
    if (padding !== undefined) result[`padding-${side}`] = padding;
  }
  const isBlock = node.type === 'block';
  if (style.width !== undefined) {
    Object.assign(result, widthDeclarations(style.width, parent, isBlock));
  } else if (isBlock && parent.type === 'flex' && parent.direction === 'row') {
    // Every block root is a `container-type: inline-size` query container
    // (size containment), so it has no intrinsic inline size: an `auto`
    // flex-item basis resolves to 0 and the block collapses. Sizing it like
    // `fill` gives it a real basis. A block in a flex column already
    // stretches to the cross-axis width by default, so nothing is needed
    // there; container (flex/grid) nodes are never affected by this branch.
    Object.assign(result, widthDeclarations('fill', parent, true));
  }
  if (style.minWidth !== undefined) result['min-width'] = style.minWidth;
  if (style.maxWidth !== undefined) result['max-width'] = style.maxWidth;
  if (style.minHeight !== undefined) result['min-height'] = style.minHeight;
  if (style.alignSelf !== undefined) result['align-self'] = style.alignSelf;
  if (!style.visible) result.display = 'none';
  else if (node.type === 'block' && source.style?.visible !== undefined) result.display = 'block';
  return result;
}

/**
 * A length/`auto` `width` emits exactly as before (`width:<value>`), so
 * existing documents are byte-identical. The two intrinsic-sizing keywords
 * depend on the immediate parent context (a plain length/`auto` never does):
 *
 * - `fill`: parent flex row -> `flex:1 1 0%; min-width:0` (no `width` at
 *   all — a flex item's width comes from `flex-basis`); parent flex column
 *   or no flex parent -> `width:100%`; parent grid -> `justify-self:stretch;
 *   width:100%`.
 * - `fit-content`: parent flex row -> `flex:0 0 auto; width:fit-content`;
 *   parent flex column or no flex parent -> `width:fit-content`; parent grid
 *   -> `justify-self:start; width:fit-content`.
 *
 * Every block root is a `container-type: inline-size` query container, so a
 * block node has no intrinsic inline size under CSS size containment: it
 * contributes 0 to `fit-content` and to a flex item's `auto` basis. For
 * `node.type === 'block'` only, this is worked around by treating
 * `fit-content` as an alias for `fill` — a block never actually shrinks to
 * its content width, in any parent context — and by the caller
 * additionally synthesizing a `fill` in the one context where an *absent*
 * `width` would otherwise leave the block with no rule at all: a flex row
 * parent. Container nodes (`flex`/`grid`) are never affected by either
 * behaviour; their `fit-content` and unset-`width` output is unchanged.
 *
 * An explicit `minWidth`/`maxWidth`/`minHeight` on the same node is applied
 * by the caller after this (unconditionally, from `style`), so it always
 * wins over the implicit `min-width:0` a flex-row `fill` sets here.
 */
function widthDeclarations(
  width: WidthLength,
  parent: ParentContext,
  isBlock: boolean
): Record<string, string> {
  if (width !== 'fill' && width !== 'fit-content') return { width };
  const flexRow = parent.type === 'flex' && parent.direction === 'row';
  if (width === 'fill' || isBlock) {
    if (flexRow) return { flex: '1 1 0%', 'min-width': '0' };
    if (parent.type === 'grid') return { 'justify-self': 'stretch', width: '100%' };
    return { width: '100%' };
  }
  if (flexRow) return { flex: '0 0 auto', width: 'fit-content' };
  if (parent.type === 'grid') return { 'justify-self': 'start', width: 'fit-content' };
  return { width: 'fit-content' };
}

function rule(node: LayoutNode, values: Record<string, string>): string {
  const body = Object.entries(values)
    .map(([property, value]) => `${property}:${value};`)
    .join('');
  return body ? `.${layoutNodeClass(node.id)}{${body}}` : '';
}

function walk(
  node: LayoutNode,
  parent: LayoutContainerNode | null,
  visit: (node: LayoutNode, parent: LayoutContainerNode | null) => void
): void {
  visit(node, parent);
  if (node.type === 'block') {
    // Slot children share the block style surface with top-level nodes, so
    // CSS rules must descend into slots too (normalized slot order is
    // catalog order) — but a block is never itself a flex/grid parent, so
    // its slot children get the same "no flex parent" width treatment as
    // the document root, not the outer block's own parent container.
    Object.values(node.slots ?? {})
      .flat()
      .forEach((child) => walk(child, null, visit));
    return;
  }
  node.children.forEach((child) => walk(child, node, visit));
}

function has(object: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function fail(path: string, code: LayoutValidationCode): never {
  throw new LayoutValidationError({ path, code });
}

function pointerToken(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function cssLength(value: unknown, path: string): CssLength {
  if (typeof value !== 'string') fail(path, 'INVALID_TYPE');
  const match = LENGTH.exec(value);
  if (!match) fail(path, 'INVALID_VALUE');
  const magnitude = Number(`${match[1]}${match[2] ?? ''}`);
  const unit = match[3]!;
  const maximum = unit === 'px' ? 4096 : unit === 'rem' ? 256 : 100;
  if (magnitude > maximum) fail(path, 'INVALID_VALUE');
  const canonical = String(magnitude);
  return `${canonical}${unit}` as CssLength;
}

function sizingLength(value: unknown, path: string): SizingLength {
  return value === 'auto' ? value : cssLength(value, path);
}

/** `width` only — a `SizingLength` plus `fill`/`fit-content`. Rejected on
 * `minWidth`/`maxWidth`/`minHeight`, which stay plain `sizingLength`. */
function widthLength(value: unknown, path: string): WidthLength {
  if (value === 'fill' || value === 'fit-content') return value;
  return sizingLength(value, path);
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'INVALID_TYPE');
  return value;
}

function enumeration<const T extends readonly string[]>(allowed: T): ScalarNormalizer<T[number]> {
  return (value, path) => {
    if (typeof value !== 'string') fail(path, 'INVALID_TYPE');
    if (!(allowed as readonly string[]).includes(value)) fail(path, 'INVALID_VALUE');
    return value as T[number];
  };
}

function gridInteger(allowAuto: boolean): ScalarNormalizer<number | 'auto'> {
  return (value, path) => {
    if (allowAuto && value === 'auto') return value;
    if (typeof value !== 'number' || !Number.isInteger(value)) fail(path, 'INVALID_TYPE');
    if (value < 1 || value > 24) fail(path, 'LIMIT_EXCEEDED');
    return value;
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value as JsonObject)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as JsonObject)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

// Pure, synchronous SHA-256 keeps node classes byte-identical in browsers, SSR,
// and static generation without importing a Node-only crypto implementation.
function sha256Hex(bytes: Uint8Array): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const initial = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);
  const hash = initial.slice();
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4);
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15]!;
      const y = words[index - 2]!;
      const s0 = rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3);
      const s1 = rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10);
      words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + constants[index]! + words[index]!) >>> 0;
      const sum0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }
  return hash.map((value) => value.toString(16).padStart(8, '0')).join('');
}

function rotate(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}
