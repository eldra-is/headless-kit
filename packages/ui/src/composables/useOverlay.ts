import { onScopeDispose, watch, type Ref } from 'vue';

/**
 * Anything the platform lets a user reach with `Tab`, plus the elements a component has opted in
 * with a `tabindex`. `tabindex="-1"` is deliberately excluded: it is programmatically focusable,
 * not part of the sequence a keyboard user walks, and `focusFirst()` exists to put focus where a
 * user would have put it themselves.
 */
const FOCUSABLE =
  'a[href], area[href], button, input, select, textarea, details > summary:first-of-type, iframe, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex^="-"])';

/**
 * Marks an element that belongs to an overlay whose content element has this `id`.
 *
 * Exported for `usePopover`, which has to find those elements rather than only recognise one it is
 * handed: a teleported panel's `Tab` walk runs through them (see its `tabRedirect` option).
 */
export const OVERLAY_OWNER_ATTRIBUTE = 'data-eldra-overlay-owner';

export interface UseOverlayOptions {
  /** Whether the overlay is showing. Owned by the consumer; this composable only reads it. */
  open: Ref<boolean>;
  /** The element that opens the overlay, and the element focus goes back to. */
  trigger: Ref<HTMLElement | null>;
  /** The popup itself. Give it an `id` if any part of it is teleported (see below). */
  content: Ref<HTMLElement | null>;
  /** Asked to close. The consumer writes `open`; nothing here does. */
  setOpen: (open: boolean) => void;
  /**
   * Close when a pointer press lands outside the overlay — and, unless `closeOnFocusOutside` says
   * otherwise, when focus does. Default `true`. A getter is asked on every event.
   */
  closeOnOutsideClick?: boolean | (() => boolean);
  /** Close when focus moves outside the overlay. Default: whatever `closeOnOutsideClick` is. */
  closeOnFocusOutside?: boolean | (() => boolean);
  /** Close on `Escape`. Default `true`. A getter is asked on every keystroke. */
  closeOnEscape?: boolean | (() => boolean);
  /** Put focus back on the trigger when closing would otherwise lose it. Default `true`. */
  returnFocus?: boolean | (() => boolean);
}

const read = (setting: boolean | (() => boolean) | undefined, fallback: boolean): boolean =>
  setting === undefined ? fallback : typeof setting === 'function' ? setting() : setting;

export interface UseOverlayReturn {
  /** Ask the consumer to close. */
  close(): void;
  /** Focus the first focusable element inside the content, if there is one. */
  focusFirst(): void;
  /**
   * Every element in the tab sequence inside `root`, in document order, plus `root` itself when it
   * is one. Defaults to the content, which is what `focusFirst` walks.
   *
   * The argument is for an overlay whose parts are not all in one element — a teleported panel and
   * the trigger-side controls that belong to it — so that one answer to "what is a tab stop" serves
   * both halves.
   */
  focusables(root?: HTMLElement | null): HTMLElement[];
  /**
   * Whether a node counts as part of this overlay: the trigger, the content, or anything under an
   * element carrying `data-eldra-overlay-owner="<the content's id>"`.
   *
   * The same question the closing rules ask themselves, exposed because a consumer moving focus
   * around a teleported overlay has to ask it too — `usePopover`'s `Tab` walk decides from it
   * whether focus is still inside the control or has left it.
   */
  isInside(node: EventTarget | null): boolean;
}

/**
 * The closing and focus rules shared by every **non-modal** popup in this package — the Select and
 * Multi-select panels, the Search bar's results panel, menus.
 *
 * Non-modal is the whole point. The design spec's non-negotiables put every *modal* surface in a
 * native `<dialog>` opened with `showModal()`, and say in the same breath that these popups are not
 * dialogs: "Non-modal popups (select panels, search results panel, mega-menus, tooltips) are **not**
 * dialogs." So there is no focus trap here and no `Tab` cycling — `Tab` simply moves on, and focus
 * landing outside is what closes the popup (WCAG 2.1.2: no keyboard trap). Everything this
 * composable does is close at the right moment and leave focus somewhere sensible.
 *
 * What it listens for, and only while `open` is `true`:
 *
 * - **A pointer press outside** (`pointerdown`, captured, so a handler inside the page that stops
 *   propagation cannot hide the press from us). Inside is the trigger, the content, and anything
 *   under an element carrying `data-eldra-overlay-owner="<the content's id>"` — which is how a
 *   panel rendered through a `<Teleport>` still counts as part of the overlay. Closing this way
 *   never moves focus: the user is pressing something else, and pulling focus back to the trigger
 *   would take it off whatever they just pressed.
 * - **Focus leaving** (`focusout`). If the new focus owner is outside the overlay, the popup
 *   closes and focus stays where the user sent it. If focus went *nowhere* (`relatedTarget` is
 *   `null` — the content is about to be removed from under it), `returnFocus` puts it back on the
 *   trigger rather than letting it fall to `<body>`.
 * - **`Escape`** (`keydown`, bubbling, so a component that wants the first go at `Escape` — the
 *   Select clears its search query before it closes — can handle it and stop propagation). It
 *   closes, returns focus to the trigger, and both `preventDefault()`s and stops propagation: a
 *   popup inside a native `<dialog>` must consume the key, or the dialog closes behind it.
 *
 * Listeners go on `document` when the overlay opens and come off when it closes or the scope is
 * disposed, so a closed overlay costs nothing and an unmounted one leaves nothing behind. Nothing
 * touches the DOM during SSR.
 *
 * ```ts
 * const open = ref(false);
 * const trigger = ref<HTMLElement | null>(null);
 * const content = ref<HTMLElement | null>(null);
 * const overlay = useOverlay({ open, trigger, content, setOpen: (next) => (open.value = next) });
 * ```
 */
export function useOverlay(options: UseOverlayOptions): UseOverlayReturn {
  const { open, trigger, content, setOpen } = options;
  const closeOnOutsideClick = (): boolean => read(options.closeOnOutsideClick, true);
  const closeOnFocusOutside = (): boolean =>
    read(options.closeOnFocusOutside, closeOnOutsideClick());
  const closeOnEscape = (): boolean => read(options.closeOnEscape, true);
  const returnFocus = (): boolean => read(options.returnFocus, true);

  const focusables = (from?: HTMLElement | null): HTMLElement[] => {
    const root = from === undefined ? content.value : from;
    if (!root) return [];
    // `root` first, and only when it is a tab stop itself: a panel never is, but a trigger passed
    // in from outside is exactly one, and document order puts it before its own descendants.
    return [root, ...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) =>
        element.matches(FOCUSABLE) &&
        // The selector cannot express this on its own: `tabindex="-1"` on a natively focusable
        // element (`<button tabindex="-1">`) is still matched by the `button` term, so the
        // platform's own answer to "is this in the tab sequence" is what decides.
        element.tabIndex >= 0 &&
        !element.hasAttribute('disabled') &&
        element.getAttribute('aria-hidden') !== 'true' &&
        element.closest('[hidden]') === null
    );
  };

  const focusFirst = (): void => {
    focusables()[0]?.focus();
  };

  const close = (): void => setOpen(false);

  /**
   * A teleported part of the overlay is in the DOM somewhere else entirely, so containment says
   * nothing about it. It is claimed one of two ways, both followed transitively:
   *
   * - **An owner marker**: an ancestor carrying `data-eldra-overlay-owner` names the content's id —
   *   or the id of any element that is itself inside this overlay, so a picker teleported out of a
   *   panel can point at the field inside the panel it belongs to.
   * - **An open control inside the overlay**: an element with `aria-expanded="true"` inside this
   *   overlay names, in `aria-controls`, an element in the node's popup — the owner-marked panel
   *   that element sits in, or the element itself. That is a nested popup (a `Select` or another
   *   `Popover` opened from this panel) whose own panel is teleported too.
   *
   * Walked by hand rather than through selectors so an id with a character CSS would have to
   * escape cannot break the check.
   */
  const isInside = (node: EventTarget | null, visited = new Set<Node>()): boolean => {
    if (!(node instanceof Node) || visited.has(node)) return false;
    visited.add(node);
    if (trigger.value?.contains(node) === true) return true;
    if (content.value?.contains(node) === true) return true;

    const id = content.value?.id;
    if (id === undefined || id === '' || typeof document === 'undefined') return false;
    for (
      let element = node instanceof Element ? node : node.parentElement;
      element !== null;
      element = element.parentElement
    ) {
      const owner = element.getAttribute(OVERLAY_OWNER_ATTRIBUTE);
      if (owner === id) return true;
      if (owner === null || owner === '') continue;
      const named = document.getElementById(owner);
      if (named !== null && !named.contains(element) && isInside(named, visited)) return true;
    }

    for (const control of document.querySelectorAll<HTMLElement>('[aria-controls]')) {
      if (control.getAttribute('aria-expanded') !== 'true' || control.contains(node)) continue;
      for (const controlled of (control.getAttribute('aria-controls') ?? '').split(/\s+/)) {
        const target = controlled === '' ? null : document.getElementById(controlled);
        if (target === null) continue;
        // The popup the control opens: the owner-marked panel its target sits in, else the target.
        const popup = target.closest(`[${OVERLAY_OWNER_ATTRIBUTE}]`) ?? target;
        if (!popup.contains(node) || popup.contains(control)) continue;
        if (isInside(control, visited)) return true;
      }
    }
    return false;
  };

  const onPointerDown = (event: Event): void => {
    if (!open.value || !closeOnOutsideClick() || isInside(event.target)) return;
    close();
  };

  const onFocusOut = (event: FocusEvent): void => {
    if (!open.value || !closeOnFocusOutside()) return;
    // `focusout` bubbles from everywhere; only focus leaving *this* overlay is ours to act on.
    if (!isInside(event.target)) return;
    const next = event.relatedTarget;
    if (isInside(next)) return;
    close();
    if (returnFocus() && next === null) trigger.value?.focus();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!open.value || event.key !== 'Escape' || !closeOnEscape()) return;
    event.preventDefault();
    event.stopPropagation();
    close();
    if (returnFocus()) trigger.value?.focus();
  };

  let listening = false;

  const attach = (): void => {
    if (listening || typeof document === 'undefined') return;
    listening = true;
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKeyDown);
  };

  const detach = (): void => {
    if (!listening) return;
    listening = false;
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('focusout', onFocusOut);
    document.removeEventListener('keydown', onKeyDown);
  };

  watch(open, (isOpen) => (isOpen ? attach() : detach()), { immediate: true });
  onScopeDispose(detach);

  return { close, focusFirst, focusables, isInside: (node) => isInside(node) };
}
