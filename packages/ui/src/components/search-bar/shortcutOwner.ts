/**
 * Who owns the `/` shortcut.
 *
 * The design spec's Search bar → Behaviour says "`/` anywhere on the page … focuses the header
 * search" — *the* header search, singular. A page can hold more than one search bar (a header one
 * and the Search page's own lg field, a collection toolbar), and each listens on `document`, so
 * without an owner every one of them would answer the same keystroke: the last listener to run
 * would win the focus and the others would have already called `preventDefault()`, which is a
 * shortcut that lands somewhere unpredictable.
 *
 * That is cross-component state — two search bars know nothing about each other — so it lives in
 * one module-level list rather than in a provider, exactly as `openRegistry` does for "only one
 * open at a time". The list is **ordered by claim**, so the first instance mounted with `shortcut`
 * on owns the key and the others stand behind it; when the owner unmounts (or its `shortcut` prop
 * goes off), it drops out and the next in line owns it without anything having to be re-mounted.
 *
 * Ownership is read at keystroke time, never cached, so a claim or a release takes effect on the
 * very next `/` with no reactivity involved.
 */
const contenders: object[] = [];

/** Claim the shortcut. Claiming twice is a no-op, so a re-run watcher cannot jump the queue. */
export function claimShortcut(token: object): void {
  if (!contenders.includes(token)) contenders.push(token);
}

/** Give it up. Safe to call for a token that never claimed it. */
export function releaseShortcut(token: object): void {
  const index = contenders.indexOf(token);
  if (index !== -1) contenders.splice(index, 1);
}

/** Whether this token is the one that should answer a `/`. */
export function ownsShortcut(token: object): boolean {
  return contenders[0] === token;
}

/** The current owner, or `null`. Exposed for tests. */
export function shortcutOwner(): object | null {
  return contenders[0] ?? null;
}
