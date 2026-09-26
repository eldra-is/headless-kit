/**
 * Who owns a global shortcut key.
 *
 * The design spec's Search bar → Behaviour says "`/` anywhere on the page … focuses the header
 * search" — *the* header search, singular. A page can hold more than one search bar (a header one
 * and the Search page's own lg field, a collection toolbar), and each listens on `document`, so
 * without an owner every one of them would answer the same keystroke: the last listener to run
 * would win the focus and the others would have already called `preventDefault()`, which is a
 * shortcut that lands somewhere unpredictable. The Search modal (spec "Search modal" → Behaviour)
 * shares the exact same `/` rule with `SearchBar` — "If the page uses SearchModal instead, it opens
 * that" — so it claims the identical queue below rather than a queue of its own: whichever of them
 * mounted first (with its own shortcut turned on) owns the key, which is what "`/` opens it only
 * when no SearchBar currently owns the `/` shortcut" reduces to.
 *
 * `⌘K`/`Ctrl+K` is a second, independent key: the spec's own "Only one search modal on a page may
 * enable it" rule needs a queue that a `SearchBar` never joins (it has no `⌘K` shortcut of its
 * own), so contenders are grouped by `kind` rather than kept in one list. `'/'` is the default, so
 * every existing call site (`claimShortcut(token)`, with no second argument) keeps claiming exactly
 * the queue it always has.
 *
 * That is cross-component state — instances know nothing about each other — so it lives in one
 * module-level list per kind rather than in a provider, exactly as `openRegistry` does for "only one
 * open at a time". Each list is **ordered by claim**, so the first instance mounted with its
 * shortcut on owns that key and the others stand behind it; when the owner unmounts (or its
 * shortcut prop goes off), it drops out and the next in line owns it without anything having to be
 * re-mounted.
 *
 * Ownership is read at keystroke time, never cached, so a claim or a release takes effect on the
 * very next keystroke with no reactivity involved.
 */
export type ShortcutKind = '/' | 'modal';

const contenders: Record<ShortcutKind, object[]> = { '/': [], modal: [] };

/** Claim a shortcut. Claiming twice is a no-op, so a re-run watcher cannot jump the queue. */
export function claimShortcut(token: object, kind: ShortcutKind = '/'): void {
  const queue = contenders[kind];
  if (!queue.includes(token)) queue.push(token);
}

/** Give it up. Safe to call for a token that never claimed it. */
export function releaseShortcut(token: object, kind: ShortcutKind = '/'): void {
  const queue = contenders[kind];
  const index = queue.indexOf(token);
  if (index !== -1) queue.splice(index, 1);
}

/** Whether this token is the one that should answer this kind of shortcut. */
export function ownsShortcut(token: object, kind: ShortcutKind = '/'): boolean {
  return contenders[kind][0] === token;
}

/** The current owner of a kind, or `null`. Exposed for tests. */
export function shortcutOwner(kind: ShortcutKind = '/'): object | null {
  return contenders[kind][0] ?? null;
}
