import {
  LayoutValidationError,
  layoutRenderNodeId,
  normalizeLayoutDocument,
  type LayoutDocument,
  type LayoutValidationCode,
} from './layout';

/**
 * One reusable-component placement, as it appears in a stored layout document.
 * Page layouts (version 2/3) and route-template layouts (version 1) carry the
 * exact same node, so both expansion paths validate it here rather than each
 * declaring its own shape.
 */
export type ReusableComponentPlacement = {
  id: string;
  type: 'reusable';
  componentId: string;
};

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

/** The authored identity a render id maps back to. */
export type ReusableNodeIdentity = { nodeId: string; placementId?: string };

export type ReusableExpansionRequest = {
  /** The already-parsed root node of the document being expanded. */
  root: unknown;
  /** JSON pointer of that root, for issue paths (`/root`). */
  path: string;
  projection: ReusableComponentProjection;
  /** Whether `type: 'reusable'` is admitted at all (page v2/v3, any template). */
  allowReusable: boolean;
  allowedEntryIds?: ReadonlySet<string>;
  allowedContainerIds?: ReadonlySet<string>;
};

export type ReusableExpansionResult = {
  /** The root with every placement replaced by its component's content. */
  root: unknown;
  /** Render id -> authored identity, for every node in the expanded tree. */
  identities: ReadonlyMap<string, ReusableNodeIdentity>;
  dependencyKey: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NODE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,95}$/;
const MAX_PLACEMENTS = 100;
const MAX_DEFINITIONS = 100;

type RecordValue = Record<string, unknown>;

export function createProjectionResolver(
  projection: ReusableComponentProjection
): ReusableComponentResolver {
  const revisions = validateProjectionRevisions(validateProjection(projection));
  return ({ componentId, siteId, revision }) =>
    revisions.get(revisionKey(componentId, siteId, revision)) ?? null;
}

/**
 * Replaces every reusable placement in a layout tree with the exact revision
 * the projection binds it to, before anything is normalized or rendered.
 * Shared verbatim by page layouts and route-template layouts: the node, its
 * rules, its failure codes and the render identity it hands to the overlay are
 * the same in both, so there is one implementation of all of it.
 */
export function expandReusablePlacements(
  request: ReusableExpansionRequest
): ReusableExpansionResult {
  const projection = validateProjection(request.projection);
  const siteIds = new Set([
    ...projection.bindings.map((binding) => binding.siteId),
    ...projection.revisions.map((revision) => revision.siteId),
  ]);
  if (siteIds.size > 1) failLayout('/reusableComponentProjection', 'COMPONENT_FOREIGN');
  const siteId = siteIds.values().next().value as string | undefined;
  const resolver = createProjectionResolver(projection);
  const bindings = new Map(projection.bindings.map((binding) => [binding.placementId, binding]));
  const identities = new Map<string, ReusableNodeIdentity>();
  const rawIds = new Set<string>();
  const usedPlacements = new Set<string>();
  const usedRevisions = new Set<string>();
  const active = new WeakSet<object>();

  const expand = (nodeValue: unknown, path: string): unknown => {
    const node = asObject(nodeValue, path);
    if (active.has(node)) failLayout(path, 'INVALID_VALUE');
    active.add(node);
    try {
      const id = node.id;
      if (typeof id !== 'string') failLayout(`${path}/id`, 'INVALID_TYPE');
      if (!NODE_ID.test(id)) failLayout(`${path}/id`, 'INVALID_VALUE');
      if (rawIds.has(id)) failLayout(`${path}/id`, 'DUPLICATE_ID');
      rawIds.add(id);

      if (node.type === 'reusable') {
        if (!request.allowReusable) failLayout(`${path}/type`, 'INVALID_VALUE');
        assertClosedKeys(node, ['id', 'type', 'componentId'], path);
        if (typeof node.componentId !== 'string') failLayout(`${path}/componentId`, 'INVALID_TYPE');
        assertUuid(node.componentId, `${path}/componentId`);
        usedPlacements.add(id);
        if (usedPlacements.size > MAX_PLACEMENTS) failLayout(path, 'LIMIT_EXCEEDED');
        const binding = bindings.get(id);
        if (!binding) failLayout(path, 'COMPONENT_NOT_FOUND');
        if (binding.componentId !== node.componentId)
          failLayout(`${path}/componentId`, 'COMPONENT_STALE');
        if (siteId === undefined || binding.siteId !== siteId)
          failLayout(path, 'COMPONENT_FOREIGN');
        const revision = resolver(binding);
        if (!revision) failLayout(path, 'COMPONENT_NOT_FOUND');
        if (
          revision.componentId !== binding.componentId ||
          revision.revision !== binding.revision
        ) {
          failLayout(path, 'COMPONENT_STALE');
        }
        if (revision.siteId !== siteId) failLayout(path, 'COMPONENT_FOREIGN');
        usedRevisions.add(revisionKey(revision.componentId, revision.siteId, revision.revision));
        const normalized = normalizeLayoutDocument(
          revision.document,
          request.allowedEntryIds,
          request.allowedContainerIds
        );
        return cloneComponentNode(normalized.document.root, id, identities, true);
      }

      if (node.type === 'flex' || node.type === 'grid') {
        if (!Array.isArray(node.children)) failLayout(`${path}/children`, 'INVALID_TYPE');
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

  const root = expand(request.root, request.path);
  for (const binding of projection.bindings) {
    if (!usedPlacements.has(binding.placementId))
      failLayout('/reusableComponentProjection/bindings', 'COMPONENT_STALE');
  }
  if (usedRevisions.size !== projection.revisions.length) {
    failLayout('/reusableComponentProjection/revisions', 'COMPONENT_STALE');
  }
  return {
    root,
    identities,
    dependencyKey: projection.bindings
      .map((binding) => `${binding.placementId}:${binding.componentId}:${binding.revision}`)
      .sort()
      .join('|'),
  };
}

/**
 * Restores the authored node id on a rendered tree and records the render id
 * (and owning placement, for expanded component content) beside it, so an
 * editor can address a node inside a reusable component by the pair the
 * overlay reads off the DOM.
 */
export function decorateReusableIdentity(
  node: { id: string },
  identities: ReadonlyMap<string, ReusableNodeIdentity>
): Record<string, unknown> {
  const identity = identities.get(node.id);
  if (!identity) throw new Error('missing reusable render identity');
  const common = { ...node, renderId: node.id, id: identity.nodeId, ...identity };
  const children = (node as { children?: unknown }).children;
  if (!Array.isArray(children)) return common;
  return {
    ...common,
    children: children.map((child) =>
      decorateReusableIdentity(child as { id: string }, identities)
    ),
  };
}

function cloneComponentNode(
  node: LayoutDocument['root'] | LayoutDocument['root']['children'][number],
  placementId: string,
  identities: Map<string, ReusableNodeIdentity>,
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

export function validateProjection(value: unknown): ReusableComponentProjection {
  const projection = asObject(value, '/reusableComponentProjection');
  assertClosedKeys(projection, ['bindings', 'revisions'], '/reusableComponentProjection');
  if (!Array.isArray(projection.bindings))
    failLayout('/reusableComponentProjection/bindings', 'INVALID_TYPE');
  if (!Array.isArray(projection.revisions))
    failLayout('/reusableComponentProjection/revisions', 'INVALID_TYPE');
  assertArrayKeys(projection.bindings, '/reusableComponentProjection/bindings');
  assertArrayKeys(projection.revisions, '/reusableComponentProjection/revisions');
  if (projection.bindings.length > MAX_PLACEMENTS)
    failLayout('/reusableComponentProjection/bindings', 'LIMIT_EXCEEDED');
  if (projection.revisions.length > MAX_DEFINITIONS)
    failLayout('/reusableComponentProjection/revisions', 'LIMIT_EXCEEDED');
  const placements = new Set<string>();
  const selectedRevisions = new Map<string, number>();
  const bindings = projection.bindings.map((item, index) => {
    const path = `/reusableComponentProjection/bindings/${index}`;
    const binding = asObject(item, path);
    assertClosedKeys(binding, ['placementId', 'componentId', 'siteId', 'revision'], path);
    if (typeof binding.placementId !== 'string' || !NODE_ID.test(binding.placementId))
      failLayout(`${path}/placementId`, 'INVALID_VALUE');
    if (placements.has(binding.placementId)) failLayout(`${path}/placementId`, 'DUPLICATE_ID');
    placements.add(binding.placementId);
    assertUuid(binding.componentId, `${path}/componentId`);
    assertUuid(binding.siteId, `${path}/siteId`);
    assertRevision(binding.revision, `${path}/revision`);
    const selectionKey = `${binding.siteId}\0${binding.componentId}`;
    const selected = selectedRevisions.get(selectionKey);
    if (selected !== undefined && selected !== binding.revision)
      failLayout(`${path}/revision`, 'COMPONENT_STALE');
    selectedRevisions.set(selectionKey, binding.revision);
    return binding as ReusableComponentBinding;
  });
  const revisions = projection.revisions.map((item) => item as ReusableComponentRevision);
  validateProjectionRevisions({ bindings, revisions });
  const siteIds = new Set([
    ...bindings.map((binding) => binding.siteId),
    ...revisions.map((revision) => revision.siteId),
  ]);
  if (siteIds.size > 1) failLayout('/reusableComponentProjection', 'COMPONENT_FOREIGN');
  return { bindings, revisions };
}

export function validateProjectionRevisions(
  projection: ReusableComponentProjection
): Map<string, ReusableComponentRevision> {
  if (!Array.isArray(projection.revisions) || projection.revisions.length > MAX_DEFINITIONS) {
    failLayout('/reusableComponentProjection/revisions', 'LIMIT_EXCEEDED');
  }
  const result = new Map<string, ReusableComponentRevision>();
  projection.revisions.forEach((item, index) => {
    const path = `/reusableComponentProjection/revisions/${index}`;
    const revision = asObject(item, path);
    assertClosedKeys(revision, ['componentId', 'siteId', 'revision', 'document'], path);
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
    if (result.has(key)) failLayout(path, 'COMPONENT_STALE');
    result.set(key, value);
  });
  return result;
}

function revisionKey(componentId: string, siteId: string, revision: number): string {
  return `${siteId}\0${componentId}\0${revision}`;
}

export function asObject(value: unknown, path: string): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    failLayout(path, 'INVALID_TYPE');
  return value as RecordValue;
}

export function assertClosedKeys(
  value: RecordValue,
  allowed: readonly string[],
  path: string
): void {
  const set = new Set(allowed);
  const unknown = Object.keys(value)
    .filter((key) => !set.has(key))
    .sort()[0];
  if (unknown !== undefined)
    failLayout(`${path}/${unknown.replaceAll('~', '~0').replaceAll('/', '~1')}`, 'UNKNOWN_KEY');
}

function assertArrayKeys(value: unknown[], path: string): void {
  const unknown = Object.keys(value)
    .filter((key) => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)
    .sort()[0];
  if (unknown !== undefined)
    failLayout(`${path}/${unknown.replaceAll('~', '~0').replaceAll('/', '~1')}`, 'UNKNOWN_KEY');
}

function assertUuid(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') failLayout(path, 'INVALID_TYPE');
  if (!UUID.test(value)) failLayout(path, 'INVALID_VALUE');
}

function assertRevision(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) failLayout(path, 'INVALID_TYPE');
  if (value < 1) failLayout(path, 'INVALID_VALUE');
}

export function hasOwn(value: RecordValue, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function failLayout(path: string, code: LayoutValidationCode): never {
  throw new LayoutValidationError({ path, code });
}
