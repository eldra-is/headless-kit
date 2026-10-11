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
let openClose: (() => void) | null = null;

/**
 * Claim the slot and close whatever held it.
 *
 * The slot is reassigned *before* the previous popup is closed, so the `unregisterOpen` that
 * closing triggers sees a slot that is no longer its own and leaves the new owner alone.
 */
export function registerOpen(close: () => void): void {
  const previous = openClose;
  openClose = close;
  if (previous !== null && previous !== close) previous();
}

/** Release the slot, if it is still this popup's. */
export function unregisterOpen(close: () => void): void {
  if (openClose === close) openClose = null;
}

/** The currently open popup's close function, or `null`. Exposed for tests. */
export function currentOpen(): (() => void) | null {
  return openClose;
}
