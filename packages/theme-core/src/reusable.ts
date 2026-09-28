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
