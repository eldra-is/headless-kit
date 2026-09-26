import { shallowRef, type Ref } from 'vue';

/**
 * "Never stack two modals" (design spec's shared modal rules, line ~240; non-negotiable 2):
 * exactly one native `<dialog>` may be `showModal()`-open at a time across the whole page.
 *
 * That is cross-component state the same way `src/components/select/openRegistry.ts` is for
 * non-modal popups — two `Dialog`s (or a `Dialog` and a future `Drawer`/`Lightbox`/`SearchModal`,
 * which `useDialog` is built to serve too) know nothing about each other, so the rule lives in one
 * module-level slot rather than in a provider a common ancestor would have to render.
 *
 * Unlike the popup registry, a second modal is not allowed to *close the first one and take its
 * place* — the spec's rule is "never stack", not "only the newest one shows" — so a second
 * `showModal()` request while one is already open is refused outright, with a dev-only warning,
 * and the caller (`useDialog`) is expected to put its own `open` state back to `false` so a
 * consumer's `v-model` reflects what actually happened.
 */
interface OpenDialog {
  readonly dialog: HTMLDialogElement;
}

let current: OpenDialog | null = null;

/** The `<html>` inline `overflow` this module overwrote, restored when the lock is released. */
let previousHtmlOverflow: string | null = null;

function lockScroll(): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  previousHtmlOverflow = html.style.overflow;
  html.style.overflow = 'hidden';
}

function unlockScroll(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.overflow = previousHtmlOverflow ?? '';
  previousHtmlOverflow = null;
}

/**
 * The DOM element a `Toaster` (plan-3 Task 3) should render its live region into while a modal
 * dialog is open, or `null` while none is.
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
 * footer`), so Task 3's `Toaster` is expected to render its live region as an appended child of
 * this element (a `<dialog>` accepts ordinary children anywhere in its box) rather than one this
 * package declares a slot or a `data-part` for.
 */
export const TOAST_HOST_KEY: Ref<HTMLDialogElement | null> = shallowRef(null);

/**
 * Claim the single modal slot for `dialog`.
 *
 * Idempotent for the dialog that already holds it (a spurious re-open while already registered is
 * a no-op, not a warning) — refused for any other dialog while one is open, with a dev-only console
 * warning, so the mistake is loud in development and silent (just refused) in a production build.
 *
 * The first successful claim also locks the page's scroll (`<html>` gets `overflow: hidden`, the
 * shared modal rule: "While any modal surface is open … the root element does not scroll") and
 * points `TOAST_HOST_KEY` at the dialog; both are released by the matching `closeDialog`.
 */
export function openDialog(dialog: HTMLDialogElement): boolean {
  if (current !== null) {
    if (current.dialog === dialog) return true;
    if (import.meta.env?.DEV) {
      console.warn(
        '[@eldrajs/ui] a modal dialog was asked to open while another one is already open; ' +
          'refused. Never stack two modals — close the first one before opening the next ' +
          '(design spec, shared modal rules).'
      );
    }
    return false;
  }
  current = { dialog };
  TOAST_HOST_KEY.value = dialog;
  lockScroll();
  return true;
}

/** Release the slot, if it is still this dialog's. Safe to call on a dialog that never held it. */
export function closeDialog(dialog: HTMLDialogElement): void {
  if (current?.dialog !== dialog) return;
  current = null;
  TOAST_HOST_KEY.value = null;
  unlockScroll();
}

/** Whether `dialog` is the currently registered modal. Exposed for `useDialog`'s `isTop`. */
export function isOpenDialog(dialog: HTMLDialogElement): boolean {
  return current?.dialog === dialog;
}

/** The currently registered modal's element, or `null`. Exposed for tests. */
export function currentDialog(): HTMLDialogElement | null {
  return current?.dialog ?? null;
}
