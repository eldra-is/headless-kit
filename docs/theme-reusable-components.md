# Reusable page components

The theme packages consume the exact reusable projection attached to a Core Page read — and,
since route templates place components too, to a Core **route-template** read:

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

## Route templates

A route template's version-1 layout may hold the same
`{ id, type: 'reusable', componentId }` placements beside its `template-block`
leaves — that is how a seeded template's header and footer **roles** reach the
site's own shared components (see [themes.md](themes.md#seeding-default-templates)).
Core's route-template read carries a `reusableComponentProjection` of exactly the
same shape as a Page's, and the runtime consumes it exactly the same way:

- `useEldraPage()` (`@eldrajs/theme-nuxt`) returns the page document's projection
  when the route resolved a Page, and the **template document's** when it
  resolved a route template. A route resolves one or the other, so this is a
  fallback and never a merge — the expansion refuses a projection carrying a
  binding the rendered document does not place (`COMPONENT_STALE`), which is
  what a merged projection would be.
- `EldraLayout` passes it, together with the resolved `blocks`, into
  `createTemplateLayoutRenderModel`. An absent projection is the empty
  projection, so a placement fails closed with the same issue a Page reports.
- Expansion, identity and overlay behaviour are byte-for-byte the Page
  behaviour: the component's nodes keep their authored ids, take the
  deterministic `renderId`/class namespace described above, and expose the
  template-local `placementId` to the preview bridge — Studio addresses a
  placement inside a template exactly as it addresses one inside a Page. Studio
  drafts for a shared component's entries overlay a template's placements the
  way they overlay a Page's.
- A `block` node is still refused in a route-template document, and a placement
  may not be the template layout's root.
