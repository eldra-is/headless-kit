# Reusable page components

The theme packages consume the exact reusable projection attached to a Core Page read:

```ts
type ReusableComponentProjection = {
  bindings: Array<{
    placementId: string;
    componentId: string;
    siteId: string;
    revision: number;
  }>;
  revisions: Array<{
    componentId: string;
    siteId: string;
    revision: number;
    document: LayoutDocument;
  }>;
};
```

Pass `layout`, `blocks`, and `reusableComponentProjection` to `EldraLayout`.
The theme packages derive and validate exactly one Site id from the bindings and
revision records; the Page itself does not need a synthetic `siteId` field.
Version-1 detached layouts continue through the same renderer.
Version-2 Pages may contain `{ id, type: 'reusable', componentId }` placements.

The framework-neutral renderer resolves each placement by the exact
site/component/revision tuple. It rejects missing, stale, cross-Site, nested,
recursive, unknown, and excessive data before returning a render model. The
fully expanded Page must still fit the existing 500-node, depth-12, and 256 KiB
layout limits. Repeated attached placements retain the component-internal node
id and expose the page-local placement id to the authenticated preview bridge.
In expanded version-1 documents the component root takes the placement id;
each descendant id is lowercase `r` plus SHA-256 of the placement id, a NUL
separator, and the internal node id. Vue keys and CSS identities use that same
deterministic namespace.

`ReusableComponentSnapshotCache` keeps draft and published snapshots in
separate perspectives. Replacing a current revision makes the old exact tuple
unresolvable and reports every tracked Page consumer for invalidation.

Core public reads are already expanded and redacted version-1 layouts. Theme
Nuxt passes them through without synthesizing Site or component metadata, so
component/Site UUIDs, bindings, and revision records do not enter generated
HTML or fetchable hydration payloads. An authenticated client-side Studio read
retains its memory-only projection so attached block and field messages can
send both `layoutNodeId` and the optional `reusablePlacementId` over the
existing exact-origin bridge.
