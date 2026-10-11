import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import { closeDialog, isOpenDialog, openDialog } from './dialogStack';

export interface UseDialogOptions {
  /** Whether the dialog should be showing. Owned by the consumer; this composable only reads it. */
  open: Ref<boolean>;
  /** Asked to change `open`, on every route that closes the dialog (never to open it). */
  setOpen: (open: boolean) => void;
  /** The `<dialog>` element itself. Must be a real `<dialog>`; every part of this composable is
   *  built on `HTMLDialogElement`'s own `showModal()`/`close()`/`cancel`/`close` contract. */
  dialog: Ref<HTMLDialogElement | null>;
  /** Whether a backdrop click closes the dialog. `Esc` and `close()` always do. Default `true`. */
  dismissable?: MaybeRefOrGetter<boolean>;
  /** Focused once the dialog opens, instead of the first meaningful control. */
  initialFocus?: Ref<HTMLElement | null>;
  /** Ran when `Esc` is pressed (the native `cancel` event), before the dialog actually closes. */
  onCancel?: () => void;
}

export interface UseDialogReturn {
  /** Closes the dialog, the same way a `<button value>` inside `<form method="dialog">` would:
   *  `returnValue` becomes the reason a consumer's own `close` handler reads back. No-op if the
   *  dialog is not open. */
  close(returnValue?: string): void;
  /** Whether this dialog is the **topmost** one — `dialogStack`'s own top of stack. `true` for a
   *  modal opened alone; `false` for one still open but covered by another opened on top of it. */
  isTop: ComputedRef<boolean>;
}

/**
 * Every element the platform lets a keyboard user reach, the same list `useOverlay` builds for its
 * own (non-modal) overlays. Duplicated rather than imported: `useOverlay`'s copy is private to that
 * module, and the two composables solve unrelated problems (tab *cycling* there, initial focus only
 * here — a native modal `<dialog>` already contains `Tab` on its own, see this file's own doc
 * comment below).
 */
const FOCUSABLE =
  'a[href], area[href], button, input, select, textarea, details > summary:first-of-type, iframe, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex^="-"])';

function isReachable(element: HTMLElement): boolean {
  return (
    element.tabIndex >= 0 &&
    !element.hasAttribute('disabled') &&
    element.getAttribute('aria-hidden') !== 'true' &&
    element.closest('[hidden]') === null
  );
}

/**
 * The dialog's first meaningful control (design spec, shared modal rules: "focus moves to the
 * element marked for initial focus, else the first meaningful control (never the close button when
 * the dialog has a primary field)") — every reachable focusable inside `root`, **excluding**
 * whatever carries `data-part="close"`.
 *
 * `data-part` is this package's own convention ("`data-part` on every part" — every component's own
 * anatomy uses it), not a one-off marker invented here: any modal built on this composable
 * (`Dialog` today; `Drawer`/`Lightbox`/`SearchModal` next) names its own close button the same way,
 * so this exclusion works for all of them without a second constant to keep in sync.
 */
function firstMeaningfulControl(root: HTMLElement): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
    (element) => isReachable(element) && element.closest('[data-part="close"]') === null
  );
}

/**
 * The lifecycle of one **modal surface**: the design spec's shared "Modal dialogs" rules, applied
 * to whichever native `<dialog>` a component hands this composable. `Dialog` is the first consumer;
 * `Drawer`, `Lightbox` and `SearchModal` are built on the same contract rather than reimplementing
 * it, which is why every rule below lives here instead of in `Dialog.vue`.
 *
 * What it owns, entirely through the native element — **no custom focus trap, no `role="dialog"`**
 * (the design spec's own non-negotiable 2, and this file's whole reason to exist):
 *
 * - **Open/close**, synced to `open`: `showModal()` when it becomes `true`, `.close()` when it
 *   becomes `false`. A native modal `<dialog>` already makes the rest of the page `inert` (nothing
 *   outside it is focusable or reachable by a screen reader's virtual cursor) and already contains
 *   `Tab`/`Shift+Tab` to its own controls for free — that is the entire point of using one, so
 *   nothing here re-implements either.
 * - **Nested modals** (`dialogStack`, operator override, 2026-09-26 — see the README's Deviations
 *   entry): opening a dialog pushes it onto the shared stack; a dialog already open when another
 *   one opens is left open, underneath — no refusal, no warning. `Esc` and a backdrop click,
 *   though, only ever act on the **topmost** dialog (`isTop` below): a lower one ignores both,
 *   even if one somehow reaches its own listeners directly (native top-layer stacking already
 *   routes `Esc` to the top only; this is defence in depth, not the primary mechanism).
 * - **Scroll lock and the toast host** (`dialogStack`, shared with every future modal built on this
 *   composable): the page behind does not scroll while the stack is non-empty (released only once
 *   every open modal has closed), and `TOAST_HOST_KEY` tracks the **topmost** dialog a `Toaster`
 *   should render into.
 * - **Initial focus**: `initialFocus`, else the first meaningful control (never the close button —
 *   see `firstMeaningfulControl` above), else the close button itself as a last resort, else
 *   whatever the platform already focused. Applied a tick after `showModal()`, so slot content that
 *   mounts alongside the dialog (a form's first field) already exists in the DOM to focus.
 * - **Focus return**: whatever had focus immediately before `showModal()` gets it back the moment
 *   the dialog actually closes, by any route — the page's own opener for the bottom of the stack,
 *   or, for a modal opened from inside another one, whichever control still had focus in the modal
 *   underneath (captured the same way, just a tick earlier), so closing the top one lands focus
 *   back in the modal below rather than on the page.
 * - **`Esc`** (the native `cancel` event): closes the dialog, never `dismissable`-gated (the shared
 *   rule: "`Esc` … always closes it") — but only while this dialog is the top of the stack; a lower
 *   one ignores it outright (`preventDefault()`ed, so even the platform's own default action cannot
 *   close it). `onCancel` is a notification, not a guard — it cannot prevent the close, matching
 *   the interface below (`() => void`, nothing to call `preventDefault()` on).
 * - **Backdrop click**: a `click` whose `target` is the `<dialog>` element itself — not a
 *   descendant, which stops the target at that descendant — closes it when `dismissable` is `true`
 *   (default) **and** this dialog is the top of the stack; a lower dialog's own backdrop click
 *   (unreachable in a real browser, where the topmost modal's full-viewport surface covers it, but
 *   reachable from a test dispatching the event directly) does nothing. `dismissable` is read on
 *   every click, so a consumer can flip it while the dialog is open (a form that becomes dirty
 *   part-way through).
 *
 * ```ts
 * const open = ref(false);
 * const dialog = ref<HTMLDialogElement | null>(null);
 * const { close, isTop } = useDialog({
 *   open,
 *   setOpen: (next) => (open.value = next),
 *   dialog,
 *   dismissable: () => !formIsDirty.value,
 *   onCancel: () => emit('cancel'),
 * });
 * ```
 */
export function useDialog(options: UseDialogOptions): UseDialogReturn {
  const { open, setOpen, dialog } = options;
  const dismissable = (): boolean => toValue(options.dismissable) ?? true;

  /** Whatever had focus right before this dialog opened. Restored once it actually closes. */
  let opener: HTMLElement | null = null;

  function focusInitial(): void {
    const el = dialog.value;
    if (el === null) return;
    const explicit = options.initialFocus?.value;
    if (explicit != null) {
      explicit.focus();
      return;
    }
    const target =
      firstMeaningfulControl(el) ?? el.querySelector<HTMLElement>('[data-part="close"]');
    target?.focus();
  }

  function show(): void {
    const el = dialog.value;
    if (el === null || el.open) return;
    // Captured before `showModal()` moves focus — for a modal opened from inside another one, this
    // is whatever control still had focus in the modal underneath, which is exactly what makes
    // `onNativeClose`'s own `opener?.focus()` land back there instead of on the page.
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialog(el);
    el.showModal();
    void nextTick(focusInitial);
  }

  function hide(): void {
    const el = dialog.value;
    if (el === null) return;
    // `'programmatic'`, not a bare `close()`: an argument-less native close leaves `returnValue`
    // at whatever the *previous* close set it to (the HTML `close(returnValue)` steps only touch
    // `returnValue` when an argument is passed), so a consumer's own `close('button')` followed
    // later by a plain `modelValue = false` would otherwise still read back `"button"` for a close
    // that was not a button press. Passing a reason here resets it on every route through `hide()`.
    if (el.open) el.close('programmatic');
    closeDialog(el);
  }

  function close(returnValue?: string): void {
    const el = dialog.value;
    if (el === null || !el.open) return;
    el.close(returnValue);
    // The native `close` listener below does the rest: unregisters, syncs `open`, returns focus.
  }

  function onNativeCancel(event: Event): void {
    const el = dialog.value;
    if (el === null || !isOpenDialog(el)) {
      // Not the top of the stack: ignore it outright, including the platform's own default action
      // (which would otherwise close this dialog anyway even though nothing here called `close()`).
      // Real top-layer stacking already keeps this from happening — `Esc` only ever reaches the
      // topmost modal's close watcher — so this is defence in depth, not the primary mechanism.
      event.preventDefault();
      return;
    }
    options.onCancel?.();
    // Never `dismissable`-gated: the shared modal rules make `Esc` close unconditionally.
    close('escape');
  }

  function onNativeClose(): void {
    const el = dialog.value;
    if (el !== null) closeDialog(el);
    if (open.value) setOpen(false);
    opener?.focus();
    opener = null;
  }

  function onNativeClick(event: MouseEvent): void {
    const el = dialog.value;
    if (el === null || event.target !== el || !dismissable() || !isOpenDialog(el)) return;
    close('backdrop');
  }

  function attach(el: HTMLDialogElement): void {
    el.addEventListener('cancel', onNativeCancel);
    el.addEventListener('close', onNativeClose);
    el.addEventListener('click', onNativeClick);
  }

  function detach(el: HTMLDialogElement): void {
    el.removeEventListener('cancel', onNativeCancel);
    el.removeEventListener('close', onNativeClose);
    el.removeEventListener('click', onNativeClick);
  }

  function sync(value: boolean): void {
    if (value) show();
    else hide();
  }

  // `onMounted`, not an immediate watcher: the dialog's template ref and an immediate watcher's
  // first run are both scheduled during this same `setup()` call, and the watcher (registered
  // first, in program order) would see `dialog.value === null` on a dialog that starts open —
  // `onMounted` is guaranteed to run after this component's own refs are assigned, so it sees the
  // real element instead.
  onMounted(() => {
    const el = dialog.value;
    if (el !== null) attach(el);
    sync(open.value);
  });
  watch(open, sync);

  onBeforeUnmount(() => {
    const el = dialog.value;
    if (el === null) return;
    detach(el);
    if (el.open) closeDialog(el);
  });

  const isTop = computed(() => dialog.value !== null && isOpenDialog(dialog.value));

  return { close, isTop };
}
