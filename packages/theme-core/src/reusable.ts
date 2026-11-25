import {
  createLayoutRenderModel,
  type LayoutBreakpoints,
  type LayoutDocument,
  type LayoutNode,
  type LayoutRenderNode,
  type LayoutRenderModel,
  type SlotValidationContext,
} from './layout';
import {
  asObject,
  assertClosedKeys,
  decorateReusableIdentity,
  expandReusablePlacements,
  failLayout,
  hasOwn,
  validateProjectionRevisions,
  type ReusableComponentBinding,
  type ReusableComponentPlacement,
  type ReusableComponentProjection,
  type ReusableComponentResolver,
  type ReusableComponentRevision,
  type ReusableRenderIdentity,
} from './reusableExpansion';

export {
  createProjectionResolver,
  type ReusableComponentBinding,
  type ReusableComponentPlacement,
  type ReusableComponentProjection,
  type ReusableComponentResolver,
  type ReusableComponentRevision,
  type ReusableRenderIdentity,
} from './reusableExpansion';

export type PageLayoutNode =
  | Extract<LayoutNode, { type: 'block' }>
  | ReusableComponentPlacement
  | (Omit<Extract<LayoutNode, { type: 'flex' }>, 'children'> & { children: PageLayoutNode[] })
  | (Omit<Extract<LayoutNode, { type: 'grid' }>, 'children'> & { children: PageLayoutNode[] });

export type PageLayoutDocument =
  | LayoutDocument
  | { version: 2; root: Extract<PageLayoutNode, { type: 'flex' | 'grid' }> }
  | { version: 3; root: Extract<PageLayoutNode, { type: 'flex' | 'grid' }> };

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

/**
 * Expands a page and all exact reusable revisions before producing any render
 * output. The returned model is shared by Vue preview and SSR/static output.
 */
export function createReusableLayoutRenderModel(
  value: unknown,
  options: ReusableLayoutOptions
): ReusableLayoutRenderModel {
  const envelope = asObject(value, '');
  assertClosedKeys(envelope, ['version', 'root'], '');
  if (envelope.version !== 1 && envelope.version !== 2 && envelope.version !== 3)
    failLayout('/version', 'INVALID_VALUE');
  if (!hasOwn(envelope, 'root')) failLayout('/root', 'REQUIRED');
  const rootObject = asObject(envelope.root, '/root');
  if (rootObject.type !== 'flex' && rootObject.type !== 'grid')
    failLayout('/root/type', 'INVALID_VALUE');

  const expansion = expandReusablePlacements({
    root: envelope.root,
    path: '/root',
    projection: options.projection,
    // Reusable placements are a page-document feature: a version-1 document is
    // detached content, which renders through the same entrypoint but may not
    // reference a component.
    allowReusable: envelope.version === 2 || envelope.version === 3,
    ...(options.allowedEntryIds === undefined ? {} : { allowedEntryIds: options.allowedEntryIds }),
    ...(options.allowedContainerIds === undefined
      ? {}
      : { allowedContainerIds: options.allowedContainerIds }),
  });

  // Keep the envelope version so v3 slots on top-level blocks survive expansion
  // (reusable nodes themselves are top-level only and expand away).
  const expanded = { version: envelope.version as 1 | 2 | 3, root: expansion.root };
  const base = createLayoutRenderModel(
    expanded,
    options.allowedEntryIds,
    options.allowedContainerIds,
    options.slotContext,
    options.breakpoints
  );
  return {
    ...base,
    root: decorateReusableIdentity(base.root, expansion.identities) as Extract<
      ReusableLayoutRenderNode,
      { type: 'flex' | 'grid' }
    >,
    dependencyKey: expansion.dependencyKey,
  };
}

function assertPerspective(value: unknown): asserts value is ReusablePerspective {
  if (value !== 'draft' && value !== 'published')
    throw new TypeError('invalid reusable perspective');
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

/**
 * A layout document with reusable placements, in the shape Core's **public** read serves it: each
 * placement replaced in place by its component's content, the component's root taking the
 * placement id and every node inside it the `r` + SHA-256 render id
 * (`docs/theme-reusable-components.md`), and no projection left anywhere.
 *
 * A preview read keeps the placements and the projection, because Studio's overlay addresses a
 * node inside a component by its authored id and its placement. A draft preview session has no
 * overlay, and must render exactly what the published page renders, so it renders this shape
 * instead (`@eldrajs/theme-nuxt`, WS-1358). Throws a `LayoutValidationError` for what the render
 * would refuse; the caller keeps the document as it was, and the render then fails closed on it.
 *
 * `routeTemplate` admits placements in a version-1 document, as a route template does.
 */
export function expandReusableLayout(
  value: unknown,
  projection: unknown,
  options: { routeTemplate?: boolean } = {}
): { version: 1 | 2 | 3; root: unknown } {
  const envelope = asObject(value, '');
  if (envelope.version !== 1 && envelope.version !== 2 && envelope.version !== 3)
    failLayout('/version', 'INVALID_VALUE');
  const expansion = expandReusablePlacements({
    root: envelope.root,
    path: '/root',
    projection: projection as ReusableComponentProjection,
    allowReusable: options.routeTemplate === true || envelope.version !== 1,
  });
  return { version: envelope.version, root: expansion.root };
}

type JsonRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is JsonRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * A preview read's answer, in the shape Core's public read gives the same records (WS-1358): every
 * entry in it — the answer itself, every list item, every resolved reference at any depth (a page's
 * `parent`, a block, a list field's entries) — that carries a `reusableComponentProjection` is
 * turned into its public read (`expandReusableComponentsForPublic` in Core's cms-service):
 *
 *  - every placement expanded in place (`expandReusableLayout`; a document with `routePattern` is a
 *    route template, whose version-1 layout may place a component), and the projection dropped;
 *  - `blocks` put in the expanded layout's depth-first order (slot children by sorted slot id);
 *  - every node naming a block that is not among `blocks` removed, slot children with it, and
 *    `blocks` rebuilt from what remains;
 *  - every entry's `status` dropped (an object with `id`, `schemaId` and `data`, the envelope Core
 *    writes around a record): the public read has none.
 *
 * Anything else is left as it is: a document with no projection is served the same by both reads
 * (Core prunes only a document that places a component), and a projection that does not expand is
 * left for the render to fail closed on, as it would have. What the two reads differ in beyond
 * this — an entry's `publishedAt` and `updatedAt` (Publish sets them) and a media item's `linkId`
 * (one link row per owner) — is the draft's own and stays.
 *
 * A draft preview session's client applies it to every CMS answer (`enableSessionPreview`): a
 * session has no overlay to address a component's nodes by their authored ids, and what it must
 * render is what Publish puts live.
 */
export function asPublicRead<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => asPublicRead(item)) as T;
  if (!isPlainRecord(value)) return value;
  const walked: JsonRecord = {};
  for (const [key, child] of Object.entries(value)) {
    walked[key] = key === 'reusableComponentProjection' ? child : asPublicRead(child);
  }
  return publicDocument(withoutEntryStatus(walked)) as T;
}

/** An entry's envelope without `status`: the public read drops it, a preview read keeps it. */
function withoutEntryStatus(record: JsonRecord): JsonRecord {
  if (!('status' in record && 'id' in record && 'schemaId' in record && 'data' in record)) {
    return record;
  }
  const { status: _status, ...rest } = record;
  return rest;
}

function publicDocument(doc: JsonRecord): JsonRecord {
  if (!('reusableComponentProjection' in doc) || !isPlainRecord(doc.data)) return doc;
  const { reusableComponentProjection, ...rest } = doc;
  const data = doc.data;
  let layout: { version: 1 | 2 | 3; root: unknown };
  try {
    layout = expandReusableLayout(data.layout, reusableComponentProjection, {
      routeTemplate: typeof data.routePattern === 'string',
    });
  } catch {
    return doc;
  }
  if (!Array.isArray(data.blocks)) return { ...rest, data: { ...data, layout } };
  const byId = new Map<string, unknown>();
  for (const block of data.blocks) {
    if (isPlainRecord(block) && typeof block.id === 'string' && !byId.has(block.id)) {
      byId.set(block.id, block);
    }
  }
  const missing = new Set(layoutBlockEntryIds(layout.root).filter((id) => !byId.has(id)));
  const root = missing.size === 0 ? layout.root : pruneLayoutBlocks(layout.root, missing);
  const blocks = layoutBlockEntryIds(root).map((id) => byId.get(id));
  return { ...rest, data: { ...data, layout: { ...layout, root }, blocks } };
}

/** A layout's block entry ids, depth-first, slot children by sorted slot id (Core's order). */
function layoutBlockEntryIds(node: unknown, into: string[] = []): string[] {
  if (!isPlainRecord(node)) return into;
  if (typeof node.entryId === 'string' && node.entryId !== '') into.push(node.entryId);
  if (Array.isArray(node.children))
    for (const child of node.children) layoutBlockEntryIds(child, into);
  if (isPlainRecord(node.slots)) {
    const slots = node.slots;
    for (const slot of Object.keys(slots).sort()) {
      const children = slots[slot];
      if (Array.isArray(children)) for (const child of children) layoutBlockEntryIds(child, into);
    }
  }
  return into;
}

function pruneLayoutBlocks(node: unknown, missing: ReadonlySet<string>): unknown {
  if (!isPlainRecord(node)) return node;
  const keep = (children: unknown[]): unknown[] =>
    children
      .filter(
        (child) =>
          !(isPlainRecord(child) && typeof child.entryId === 'string' && missing.has(child.entryId))
      )
      .map((child) => pruneLayoutBlocks(child, missing));
  const out: JsonRecord = { ...node };
  if (Array.isArray(node.children)) out.children = keep(node.children);
  if (isPlainRecord(node.slots)) {
    out.slots = Object.fromEntries(
      Object.entries(node.slots).map(([slot, children]) => [
        slot,
        Array.isArray(children) ? keep(children) : children,
      ])
    );
  }
  return out;
}
