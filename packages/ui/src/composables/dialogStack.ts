import { shallowRef, type Ref } from 'vue';

/**
 * Nested modals (operator override, 2026-09-26 — see the README's Deviations entry): the design
 * spec's shared modal rules say "Never stack two modals" (line ~240), but the operator asked for
 * the opposite — a modal may open another modal on top of it (a cart `Drawer`'s "Remove" opening a
 * confirm `Dialog`, say) — with one restriction: `Esc` and a backdrop click only ever act on the
 * **topmost** one. A lower modal stays open underneath, untouched, until the one above it closes.
 *
 * That is cross-component state the same way `src/components/select/openRegistry.ts` is for
 * non-modal popups — no `Dialog`/`Drawer`/`Lightbox`/`SearchModal` instance knows about any other,
 * so the stack lives in one module-level array rather than in a provider a common ancestor would
 * have to render. Unlike the popup registry (which *closes* the previous panel when a new one
 * opens), a lower modal is never closed or otherwise touched by a higher one opening — it is simply
 * no longer the top of the stack, which is what `isOpenDialog` (and `useDialog`'s own `isTop`) now
 * means: "the topmost entry", not "the only entry".
 */
interface OpenDialog {
  readonly dialog: HTMLDialogElement;
}

/** Bottom to top: `stack[0]` opened first, `stack.at(-1)` is the current top. */
const stack: OpenDialog[] = [];

/** The `<html>` inline `overflow` this module overwrote, restored when the lock is released. */
let previousHtmlOverflow: string | null = null;
/** The `<html>` inline `padding-right` this module overwrote, restored when the lock is released. */
let previousHtmlPaddingRight: string | null = null;
/** The `<html>` inline `--eldra-scrollbar-width` this module overwrote, restored on release. */
let previousScrollbarWidthVar: string | null = null;

/**
 * Set on `<html>` while a modal holds the lock: the width of the scrollbar the lock hid (`0px` when
 * it hid none). Padding `<html>` holds the page's own content still, but a `position: fixed` element
 * is laid out against the viewport, not `<html>`'s content box, so a full-width fixed header still
 * widens into the freed strip. Such an element opts in by padding itself with this variable,
 * `padding-right: var(--eldra-scrollbar-width, 0px)` (`pr-[var(--eldra-scrollbar-width,0px)]`).
 */
const SCROLLBAR_WIDTH_VAR = '--eldra-scrollbar-width';

/**
 * The width the root's classic scrollbar takes from the viewport, `0` when there is none to take:
 * a page short enough not to scroll, or a platform drawing overlay scrollbars (macOS's default,
 * every phone) that never take layout space. A `clientWidth` of `0` means no layout at all (a
 * DOM-less test environment), not a scrollbar as wide as the window.
 */
function rootScrollbarWidth(html: HTMLElement): number {
  if (html.clientWidth === 0) return 0;
  return Math.max(0, window.innerWidth - html.clientWidth);
}

/**
 * `overflow: hidden` on `<html>` removes a classic scrollbar, and the page's content widens into the
 * space it leaves — everything centred or right-aligned jumps sideways the moment a modal opens and
 * back when it closes. The lock pads `<html>` on the right by exactly the scrollbar's width for as
 * long as it holds, so the content box stays where it was.
 *
 * Padding rather than `scrollbar-gutter: stable`: a gutter keeps the strip but leaves it empty, so
 * the dialog's `::backdrop` stops short of the right edge and a right-hand `Drawer` docks against
 * the gutter instead of the window's edge, an undimmed bar beside it. Padding sits inside `<html>`'s
 * box, which the top layer covers whole. The cost is that a `position: fixed` element does not
 * move with that padding; `SCROLLBAR_WIDTH_VAR` is what lets one follow.
 */
function lockScroll(): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  const scrollbarWidth = rootScrollbarWidth(html);
  previousHtmlOverflow = html.style.overflow;
  previousHtmlPaddingRight = html.style.paddingRight;
  previousScrollbarWidthVar = html.style.getPropertyValue(SCROLLBAR_WIDTH_VAR);
  html.style.setProperty(SCROLLBAR_WIDTH_VAR, `${scrollbarWidth}px`);
  if (scrollbarWidth > 0) {
    // Measured before `overflow` changes, while the scrollbar is still there to measure; added to
    // whatever padding the page already gives `<html>`, not written over it.
    const padding = Number.parseFloat(getComputedStyle(html).paddingRight) || 0;
    html.style.paddingRight = `${padding + scrollbarWidth}px`;
  }
  html.style.overflow = 'hidden';
}

function unlockScroll(): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.style.overflow = previousHtmlOverflow ?? '';
  html.style.paddingRight = previousHtmlPaddingRight ?? '';
  if (previousScrollbarWidthVar)
    html.style.setProperty(SCROLLBAR_WIDTH_VAR, previousScrollbarWidthVar);
  else html.style.removeProperty(SCROLLBAR_WIDTH_VAR);
  previousHtmlOverflow = null;
  previousHtmlPaddingRight = null;
  previousScrollbarWidthVar = null;
}

/**
 * The DOM element a `Toaster` should render its live region into while a modal dialog is open, or
 * `null` while none is — **the topmost one** when more than one is open (design spec, shared modal
 * rules: "a toast raised while a modal is open is rendered inside the open dialog, so it isn't
 * inert" — with more than one open, the toast has to land in the one that is not itself covered).
 *
 * **Not a Vue injection key**, despite the name matching this package's `*_KEY` convention
 * (`FIELD_KEY`, `MESSAGES_KEY`, …) — those all connect a provider to its own *descendants*, and a
 * `Toaster` is not one: the design spec's own toast region "lives outside the dialog" (shared modal
 * rules), which in practice means an app mounts one `<Toaster />` near its root, a sibling of
 * whatever page content opens a `Dialog` somewhere else in the tree. `provide`/`inject` cannot
 * connect two siblings, so the hand-off has to be a plain shared reference both sides read and
 * write independently — exactly what a module-level `Ref` is, and exactly the same reasoning
 * `usePopover`'s `topLayerDialog()` already leans on to teleport a non-modal panel into a modal
 * dialog it did not render.
 *
 * It holds the open dialog's own root element — the `Dialog` anatomy has no separate "toast host"
 * part to render (`DialogPart` is `root | panel | header | title | close | description | body |
 * footer`), so `Toaster` renders its live region as an appended child of this element (a
 * `<dialog>` accepts ordinary children anywhere in its box) rather than one this package declares
 * a slot or a `data-part` for.
 */
export const TOAST_HOST_KEY: Ref<HTMLDialogElement | null> = shallowRef(null);

/**
 * Push `dialog` onto the stack, making it the new top.
 *
 * Idempotent for a dialog that is already in the stack (a spurious re-open is a no-op, not a
 * duplicate entry) — every other dialog is simply pushed on top, no refusal, no warning: nested
 * modals are allowed.
 *
 * The *first* claim (the stack going from empty to non-empty) locks the page's scroll (`<html>`
 * gets `overflow: hidden`, the shared modal rule: "While any modal surface is open … the root
 * element does not scroll"), padding `<html>` by the scrollbar's width so nothing shifts — later
 * pushes leave it locked, already true. `TOAST_HOST_KEY` always
 * points at the new top.
 */
export function openDialog(dialog: HTMLDialogElement): void {
  if (stack.some((entry) => entry.dialog === dialog)) return;
  if (stack.length === 0) lockScroll();
  stack.push({ dialog });
  TOAST_HOST_KEY.value = dialog;
}

/**
 * Pop `dialog` off the stack, wherever it sits in it. Safe to call on a dialog that is not in the
 * stack (already closed, or never opened).
 *
 * `TOAST_HOST_KEY` falls back to whatever is now on top (`null` once the stack is empty), and the
 * scroll lock is released only once the stack actually *is* empty — one modal closing while another
 * is still open must leave the page exactly as locked as it was.
 */
export function closeDialog(dialog: HTMLDialogElement): void {
  const index = stack.findIndex((entry) => entry.dialog === dialog);
  if (index === -1) return;
  stack.splice(index, 1);
  TOAST_HOST_KEY.value = stack.at(-1)?.dialog ?? null;
  if (stack.length === 0) unlockScroll();
}

/** Whether `dialog` is the **topmost** entry in the stack — what `Esc` and a backdrop click are
 *  gated on (`useDialog`'s own `isTop`). A dialog lower in the stack answers `false`: it is open,
 *  but not the one those routes may act on. */
export function isOpenDialog(dialog: HTMLDialogElement): boolean {
  return stack.at(-1)?.dialog === dialog;
}

/** The topmost dialog's element, or `null` while the stack is empty. Exposed for tests. */
export function currentDialog(): HTMLDialogElement | null {
  return stack.at(-1)?.dialog ?? null;
}
