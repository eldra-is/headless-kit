import {
  LayoutValidationError,
  createLayoutRenderModel,
  layoutRenderNodeId,
  normalizeLayoutDocument,
  type LayoutBreakpoints,
  type LayoutDocument,
  type LayoutNode,
  type LayoutRenderModel,
  type LayoutRenderNode,
  type LayoutValidationCode,
  type SlotValidationContext,
} from './layout';

export type ReusableComponentPlacement = {
  id: string;
  type: 'reusable';
  componentId: string;
};

export type PageLayoutNode =
  | Extract<LayoutNode, { type: 'block' }>
  | ReusableComponentPlacement
  | (Omit<Extract<LayoutNode, { type: 'flex' }>, 'children'> & { children: PageLayoutNode[] })
  | (Omit<Extract<LayoutNode, { type: 'grid' }>, 'children'> & { children: PageLayoutNode[] });

export type PageLayoutDocument =
  | LayoutDocument
  | { version: 2; root: Extract<PageLayoutNode, { type: 'flex' | 'grid' }> }
  | { version: 3; root: Extract<PageLayoutNode, { type: 'flex' | 'grid' }> };

export type ReusableComponentBinding = {
  placementId: string;
  componentId: string;
  siteId: string;
  revision: number;
};

export type ReusableComponentRevision = {
  componentId: string;
  siteId: string;
  revision: number;
  document: LayoutDocument;
};

export type ReusableComponentProjection = {
  bindings: ReusableComponentBinding[];
  revisions: ReusableComponentRevision[];
};

export type ReusableComponentResolver = (
  request: Readonly<{ componentId: string; siteId: string; revision: number }>
) => ReusableComponentRevision | null;

export type ReusableRenderIdentity = {
  renderId: string;
  nodeId: string;
  placementId?: string;
};

export type ReusableLayoutRenderNode =
  | (Extract<LayoutRenderNode, { type: 'block' }> & ReusableRenderIdentity)
  | (Omit<Extract<LayoutRenderNode, { type: 'flex' | 'grid' }>, 'children'> &
      ReusableRenderIdentity & { children: ReusableLayoutRenderNode[] });

export type ReusableLayoutRenderModel = Omit<LayoutRenderModel, 'root'> & {
  root: Extract<ReusableLayoutRenderNode, { type: 'flex' | 'grid' }>;
  dependencyKey: string;
};

export type ReusableLayoutOptions = {
  projection: ReusableComponentProjection;
  allowedEntryIds?: ReadonlySet<string>;
  allowedContainerIds?: ReadonlySet<string>;
  slotContext?: SlotValidationContext;
  breakpoints?: LayoutBreakpoints;
};

export type ReusablePerspective = 'draft' | 'published';

/**
 * Perspective-fenced exact-revision cache. Invalid snapshots never mutate the
 * cache, and replacing one perspective reports only its known page consumers.
 */
export class ReusableComponentSnapshotCache {
  private readonly snapshots = new Map<string, ReusableComponentRevision>();
  private readonly current = new Map<string, number>();
  private readonly consumers = new Map<string, Set<string>>();

  put(perspective: ReusablePerspective, value: unknown): ReadonlySet<string> {
    assertPerspective(perspective);
    const revision = validateProjectionRevisions({
      bindings: [],
      revisions: [value as ReusableComponentRevision],
    })
      .values()
      .next().value as ReusableComponentRevision;
    const currentKey = componentPerspectiveKey(perspective, revision.siteId, revision.componentId);
    const previous = this.current.get(currentKey);
    if (previous !== undefined && previous !== revision.revision) {
      this.snapshots.delete(
        snapshotKey(perspective, revision.componentId, revision.siteId, previous)
      );
    }
    this.snapshots.set(
      snapshotKey(perspective, revision.componentId, revision.siteId, revision.revision),
      revision
    );
    this.current.set(currentKey, revision.revision);
    if (previous === undefined || previous === revision.revision) return new Set();
    return new Set(this.consumers.get(currentKey) ?? []);
  }

  resolve(perspective: ReusablePerspective): ReusableComponentResolver {
    assertPerspective(perspective);
    return ({ componentId, siteId, revision }) => {
      if (
        this.current.get(componentPerspectiveKey(perspective, siteId, componentId)) !== revision
      ) {
        return null;
      }
      return this.snapshots.get(snapshotKey(perspective, componentId, siteId, revision)) ?? null;
    };
  }

  trackPage(
    perspective: ReusablePerspective,
    pageKey: string,
    bindings: readonly ReusableComponentBinding[]
  ): void {
    assertPerspective(perspective);
    this.untrackPage(perspective, pageKey);
    for (const binding of bindings) {
      const key = componentPerspectiveKey(perspective, binding.siteId, binding.componentId);
      const pages = this.consumers.get(key) ?? new Set<string>();
      pages.add(pageKey);
      this.consumers.set(key, pages);
    }
  }

  untrackPage(perspective: ReusablePerspective, pageKey: string): void {
    assertPerspective(perspective);
    for (const [key, pages] of this.consumers) {
      if (!key.startsWith(`${perspective}\0`)) continue;
      pages.delete(pageKey);
      if (pages.size === 0) this.consumers.delete(key);
    }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NODE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,95}$/;
const MAX_PLACEMENTS = 100;
const MAX_DEFINITIONS = 100;

type RecordValue = Record<string, unknown>;
type Identity = { nodeId: string; placementId?: string };

export function createProjectionResolver(
  projection: ReusableComponentProjection
): ReusableComponentResolver {
  const revisions = validateProjectionRevisions(validateProjection(projection));
  return ({ componentId, siteId, revision }) =>
    revisions.get(revisionKey(componentId, siteId, revision)) ?? null;
}

/**
 * Expands a page and all exact reusable revisions before producing any render
 * output. The returned model is shared by Vue preview and SSR/static output.
 */
export function createReusableLayoutRenderModel(
  value: unknown,
  options: ReusableLayoutOptions
): ReusableLayoutRenderModel {
  const projection = validateProjection(options.projection);
  const siteIds = new Set([
    ...projection.bindings.map((binding) => binding.siteId),
    ...projection.revisions.map((revision) => revision.siteId),
  ]);
  if (siteIds.size > 1) fail('/reusableComponentProjection', 'COMPONENT_FOREIGN');
  const siteId = siteIds.values().next().value as string | undefined;
  const resolver = createProjectionResolver(projection);
  const bindings = new Map(projection.bindings.map((binding) => [binding.placementId, binding]));
  const identities = new Map<string, Identity>();
  const rawIds = new Set<string>();
  const usedPlacements = new Set<string>();
  const usedRevisions = new Set<string>();
  const active = new WeakSet<object>();

  const envelope = object(value, '');
  keys(envelope, ['version', 'root'], '');
  if (envelope.version !== 1 && envelope.version !== 2 && envelope.version !== 3)
    fail('/version', 'INVALID_VALUE');
  if (!has(envelope, 'root')) fail('/root', 'REQUIRED');
  const rootObject = object(envelope.root, '/root');
  if (rootObject.type !== 'flex' && rootObject.type !== 'grid') fail('/root/type', 'INVALID_VALUE');

  const expand = (nodeValue: unknown, path: string): unknown => {
    const node = object(nodeValue, path);
    if (active.has(node)) fail(path, 'INVALID_VALUE');
    active.add(node);
    try {
      const id = node.id;
      if (typeof id !== 'string') fail(`${path}/id`, 'INVALID_TYPE');
      if (!NODE_ID.test(id)) fail(`${path}/id`, 'INVALID_VALUE');
      if (rawIds.has(id)) fail(`${path}/id`, 'DUPLICATE_ID');
      rawIds.add(id);

      if (node.type === 'reusable') {
        if (envelope.version !== 2 && envelope.version !== 3) fail(`${path}/type`, 'INVALID_VALUE');
        keys(node, ['id', 'type', 'componentId'], path);
        if (typeof node.componentId !== 'string') fail(`${path}/componentId`, 'INVALID_TYPE');
        assertUuid(node.componentId, `${path}/componentId`);
        usedPlacements.add(id);
        if (usedPlacements.size > MAX_PLACEMENTS) fail(path, 'LIMIT_EXCEEDED');
        const binding = bindings.get(id);
        if (!binding) fail(path, 'COMPONENT_NOT_FOUND');
        if (binding.componentId !== node.componentId)
          fail(`${path}/componentId`, 'COMPONENT_STALE');
        if (siteId === undefined || binding.siteId !== siteId) fail(path, 'COMPONENT_FOREIGN');
        const revision = resolver(binding);
        if (!revision) fail(path, 'COMPONENT_NOT_FOUND');
        if (
          revision.componentId !== binding.componentId ||
          revision.revision !== binding.revision
        ) {
          fail(path, 'COMPONENT_STALE');
        }
        if (revision.siteId !== siteId) fail(path, 'COMPONENT_FOREIGN');
        usedRevisions.add(revisionKey(revision.componentId, revision.siteId, revision.revision));
        const normalized = normalizeLayoutDocument(
          revision.document,
          options.allowedEntryIds,
          options.allowedContainerIds
        );
        const clone = cloneComponentNode(normalized.document.root, id, identities, true);
        return clone;
      }

      if (node.type === 'flex' || node.type === 'grid') {
        if (!Array.isArray(node.children)) fail(`${path}/children`, 'INVALID_TYPE');
        const clone = {
          ...node,
          children: node.children.map((child, index) => expand(child, `${path}/children/${index}`)),
        };
        identities.set(id, { nodeId: id });
        return clone;
      }
      identities.set(id, { nodeId: id });
      return { ...node };
    } finally {
      active.delete(node);
    }
  };

  // Keep the envelope version so v3 slots on top-level blocks survive expansion
  // (reusable nodes themselves are top-level only and expand away).
  const expanded = { version: envelope.version as 1 | 2 | 3, root: expand(envelope.root, '/root') };
  for (const binding of projection.bindings) {
    if (!usedPlacements.has(binding.placementId))
      fail('/reusableComponentProjection/bindings', 'COMPONENT_STALE');
  }
  if (usedRevisions.size !== projection.revisions.length) {
    fail('/reusableComponentProjection/revisions', 'COMPONENT_STALE');
  }
  const base = createLayoutRenderModel(
    expanded,
    options.allowedEntryIds,
    options.allowedContainerIds,
    options.slotContext,
    options.breakpoints
  );
  const decorate = (node: LayoutRenderNode): ReusableLayoutRenderNode => {
    const identity = identities.get(node.id);
    if (!identity) throw new Error('missing reusable render identity');
    const common = { ...node, renderId: node.id, id: identity.nodeId, ...identity };
    if (node.type === 'block')
      return common as Extract<ReusableLayoutRenderNode, { type: 'block' }>;
    return {
      ...common,
      children: node.children.map(decorate),
    } as Extract<ReusableLayoutRenderNode, { type: 'flex' | 'grid' }>;
  };
  return {
    ...base,
    root: decorate(base.root) as Extract<ReusableLayoutRenderNode, { type: 'flex' | 'grid' }>,
    dependencyKey: projection.bindings
      .map((binding) => `${binding.placementId}:${binding.componentId}:${binding.revision}`)
      .sort()
      .join('|'),
  };
}

function cloneComponentNode(
  node: LayoutDocument['root'] | LayoutDocument['root']['children'][number],
  placementId: string,
  identities: Map<string, Identity>,
  placementRoot = false
): unknown {
  const renderId = placementRoot ? placementId : layoutRenderNodeId(`${placementId}\0${node.id}`);
  identities.set(renderId, { nodeId: node.id, placementId });
  if (node.type === 'block') return { ...node, id: renderId };
  return {
    ...node,
    id: renderId,
    children: node.children.map((child) => cloneComponentNode(child, placementId, identities)),
  };
}

function validateProjection(value: unknown): ReusableComponentProjection {
  const projection = object(value, '/reusableComponentProjection');
  keys(projection, ['bindings', 'revisions'], '/reusableComponentProjection');
  if (!Array.isArray(projection.bindings))
    fail('/reusableComponentProjection/bindings', 'INVALID_TYPE');
  if (!Array.isArray(projection.revisions))
    fail('/reusableComponentProjection/revisions', 'INVALID_TYPE');
  arrayKeys(projection.bindings, '/reusableComponentProjection/bindings');
  arrayKeys(projection.revisions, '/reusableComponentProjection/revisions');
  if (projection.bindings.length > MAX_PLACEMENTS)
    fail('/reusableComponentProjection/bindings', 'LIMIT_EXCEEDED');
  if (projection.revisions.length > MAX_DEFINITIONS)
    fail('/reusableComponentProjection/revisions', 'LIMIT_EXCEEDED');
  const placements = new Set<string>();
  const selectedRevisions = new Map<string, number>();
  const bindings = projection.bindings.map((item, index) => {
    const path = `/reusableComponentProjection/bindings/${index}`;
    const binding = object(item, path);
    keys(binding, ['placementId', 'componentId', 'siteId', 'revision'], path);
    if (typeof binding.placementId !== 'string' || !NODE_ID.test(binding.placementId))
      fail(`${path}/placementId`, 'INVALID_VALUE');
    if (placements.has(binding.placementId)) fail(`${path}/placementId`, 'DUPLICATE_ID');
    placements.add(binding.placementId);
    assertUuid(binding.componentId, `${path}/componentId`);
    assertUuid(binding.siteId, `${path}/siteId`);
    assertRevision(binding.revision, `${path}/revision`);
    const selectionKey = `${binding.siteId}\0${binding.componentId}`;
    const selected = selectedRevisions.get(selectionKey);
    if (selected !== undefined && selected !== binding.revision)
      fail(`${path}/revision`, 'COMPONENT_STALE');
    selectedRevisions.set(selectionKey, binding.revision);
    return binding as ReusableComponentBinding;
  });
  const revisions = projection.revisions.map((item) => item as ReusableComponentRevision);
  validateProjectionRevisions({ bindings, revisions });
  const siteIds = new Set([
    ...bindings.map((binding) => binding.siteId),
    ...revisions.map((revision) => revision.siteId),
  ]);
  if (siteIds.size > 1) fail('/reusableComponentProjection', 'COMPONENT_FOREIGN');
  return { bindings, revisions };
}

function validateProjectionRevisions(
  projection: ReusableComponentProjection
): Map<string, ReusableComponentRevision> {
  if (!Array.isArray(projection.revisions) || projection.revisions.length > MAX_DEFINITIONS) {
    fail('/reusableComponentProjection/revisions', 'LIMIT_EXCEEDED');
  }
  const result = new Map<string, ReusableComponentRevision>();
  projection.revisions.forEach((item, index) => {
    const path = `/reusableComponentProjection/revisions/${index}`;
    const revision = object(item, path);
    keys(revision, ['componentId', 'siteId', 'revision', 'document'], path);
    assertUuid(revision.componentId, `${path}/componentId`);
    assertUuid(revision.siteId, `${path}/siteId`);
    assertRevision(revision.revision, `${path}/revision`);
    const normalized = normalizeLayoutDocument(revision.document);
    const value: ReusableComponentRevision = {
      componentId: revision.componentId as string,
      siteId: revision.siteId as string,
      revision: revision.revision as number,
      document: normalized.document,
    };
    const key = revisionKey(value.componentId, value.siteId, value.revision);
    if (result.has(key)) fail(path, 'COMPONENT_STALE');
    result.set(key, value);
  });
  return result;
}

function revisionKey(componentId: string, siteId: string, revision: number): string {
  return `${siteId}\0${componentId}\0${revision}`;
}

function object(value: unknown, path: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    fail(path, 'INVALID_TYPE');
  return value as RecordValue;
}

function keys(value: RecordValue, allowed: readonly string[], path: string): void {
  const set = new Set(allowed);
  const unknown = Object.keys(value)
    .filter((key) => !set.has(key))
    .sort()[0];
  if (unknown !== undefined)
    fail(`${path}/${unknown.replaceAll('~', '~0').replaceAll('/', '~1')}`, 'UNKNOWN_KEY');
}

function arrayKeys(value: unknown[], path: string): void {
  const unknown = Object.keys(value)
    .filter((key) => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)
    .sort()[0];
  if (unknown !== undefined)
    fail(`${path}/${unknown.replaceAll('~', '~0').replaceAll('/', '~1')}`, 'UNKNOWN_KEY');
}

function assertUuid(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') fail(path, 'INVALID_TYPE');
  if (!UUID.test(value)) fail(path, 'INVALID_VALUE');
}

function assertRevision(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(path, 'INVALID_TYPE');
  if (value < 1) fail(path, 'INVALID_VALUE');
}

function assertPerspective(value: unknown): asserts value is ReusablePerspective {
  if (value !== 'draft' && value !== 'published')
    throw new TypeError('invalid reusable perspective');
}

function has(value: RecordValue, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function componentPerspectiveKey(
  perspective: ReusablePerspective,
  siteId: string,
  componentId: string
): string {
  return `${perspective}\0${siteId}\0${componentId}`;
}

function snapshotKey(
  perspective: ReusablePerspective,
  componentId: string,
  siteId: string,
  revision: number
): string {
  return `${componentPerspectiveKey(perspective, siteId, componentId)}\0${revision}`;
}

function fail(path: string, code: LayoutValidationCode): never {
  throw new LayoutValidationError({ path, code });
}
