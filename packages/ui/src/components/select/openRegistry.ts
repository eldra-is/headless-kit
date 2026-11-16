/**
 * "Only one open at a time": the design spec's Select → Behaviour says "opening a select closes
 * any other open select or multi-select".
 *
 * That is cross-component state — two `Select`s know nothing about each other — so it lives in one
 * module-level slot rather than in a provider. A provider would scope the rule to a subtree, and
 * the rule is about the page: a select in a sticky filter bar has to close the one in the form
 * below it, and nothing renders those two under a common ancestor of our making.
 *
 * The slot holds the *close function* of whichever popup is currently open. Opening registers
 * yours and closes the previous one; closing releases the slot, but only if it is still yours —
 * so a close that arrives late (a component unmounting after another has already opened) cannot
 * blank out the popup that took its place.
 *
 * `Select` and `MultiSelect` share this module, which is what makes the rule hold *between* the
 * two rather than only within each.
 */
interface OpenEntry {
  close: () => void;
  contains?: (node: Node) => boolean;
}

export interface RegisterOpenOptions {
  /** The element the opening popup is anchored to — its trigger. */
  anchor?: Node | null;
  /**
   * Whether a node belongs to the opening popup (its `useOverlay` `isInside`). Asked later, when
   * another popup opens: one whose `anchor` this popup contains is *nested* in it — a `Select` in
   * a `Popover`'s panel — and opening it leaves this one open.
   */
  contains?: (node: Node) => boolean;
}

/**
 * The open popups, outermost first. Without nesting it never holds more than one entry; a popup
 * opened from inside another's panel is stacked on it instead of closing it.
 */
let stack: OpenEntry[] = [];

/**
 * Claim the slot and close whatever held it — except the popups the new one is nested in.
 *
 * The slot is reassigned *before* the previous popups are closed, so the `unregisterOpen` that
 * closing triggers sees a slot that is no longer its own and leaves the new owner alone.
 */
export function registerOpen(close: () => void, options: RegisterOpenOptions = {}): void {
  if (stack.at(-1)?.close === close) return;
  const { anchor } = options;
  const kept: OpenEntry[] = [];
  const closed: OpenEntry[] = [];
  for (const entry of stack) {
    if (entry.close === close) continue;
    const isAncestor = anchor !== undefined && anchor !== null && entry.contains?.(anchor) === true;
    (isAncestor ? kept : closed).push(entry);
  }
  stack = [...kept, { close, contains: options.contains }];
  for (const entry of closed) entry.close();
}

/** Release the slot, if it is still this popup's. */
export function unregisterOpen(close: () => void): void {
  stack = stack.filter((entry) => entry.close !== close);
}

/** The innermost open popup's close function, or `null`. Exposed for tests. */
export function currentOpen(): (() => void) | null {
  return stack.at(-1)?.close ?? null;
}
