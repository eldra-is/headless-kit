/**
 * The layout identity of a rendered element: the nearest
 * `[data-eldra-layout-node]` ancestor's node id and, when the placement is a
 * reusable one, its `data-eldra-reusable-placement` id.
 *
 * Both the overlay runtime (block/field clicks, framing) and the §18 in-theme
 * rich-text editor (`theme:rich-text-edited`) must resolve this the same way,
 * so the two share this one implementation rather than each closing over a
 * private copy. Keys are omitted — never set to `undefined` — so a payload
 * built by spreading the result matches the bridge's optional fields exactly.
 */
export function layoutIdentityOf(element: Element | null): {
  layoutNodeId?: string;
  reusablePlacementId?: string;
} {
  const layoutNode = element?.closest<HTMLElement>('[data-eldra-layout-node]') ?? null;
  const layoutNodeId = layoutNode?.getAttribute('data-eldra-layout-node') || undefined;
  const reusablePlacementId =
    layoutNode?.getAttribute('data-eldra-reusable-placement') || undefined;
  return {
    ...(layoutNodeId ? { layoutNodeId } : {}),
    ...(reusablePlacementId ? { reusablePlacementId } : {}),
  };
}
