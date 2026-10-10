import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useFloating, type FloatingPlacement } from '../../composables/useFloating';
import { useTeleportTarget } from '../../composables/teleportTarget';
import { OVERLAY_OWNER_ATTRIBUTE, useOverlay } from '../../composables/useOverlay';
import { registerOpen, unregisterOpen } from './openRegistry';

export interface UsePopoverOptions {
  /** The control that opens the popup, and the element focus goes back to. */
  trigger: Ref<HTMLElement | null>;
  /** The popup element itself. A `computed` over a child component's exposed root is fine. */
  content: Ref<HTMLElement | null> | ComputedRef<HTMLElement | null>;
  /** Whether the control may open at all (a disabled or read-only field may not). Default `true`. */
  canOpen?: () => boolean;
  /** Read once, like every `useFloating` option. Default `'auto'`. */
  placement?: FloatingPlacement;
  /** The gap between the control and the panel, in pixels. Default `4` (0.25rem). */
  offset?: number;
  /** Give the panel a `minWidth` equal to the control's — and, under `'exact'`, a `maxWidth` too. */
  matchWidth?: boolean | 'exact';
  /**
   * Where the panel is rendered. Read once, like every `useFloating` option.
   *
   * - `true` (the default) — through a `<Teleport>` to `document.body`, or to the nearest **open
   *   native `<dialog>`** above the trigger when there is one (see `teleportTo` below).
   * - a string — a CSS selector, passed to `<Teleport to>` verbatim.
   * - `false` — no teleport: the panel stays where the consumer renders it, positioned
   *   `absolute`ly, which is what this package did before.
   *
   * The default is `true` because a panel rendered inside its own control is at the mercy of
   * everything above it: an ancestor with `overflow: hidden` (a card, a table cell, a carousel
   * track) clips it, and any later sibling that starts a stacking context (a sticky header with a
   * `z-index`, a section with `isolate`) paints over it however high the panel's own `z-index` is.
   * On `body` neither can happen, and `z-popover` is then measured against the page.
   */
  teleport?: boolean | string;
  /**
   * Keep the panel in the `Tab` walk while it is teleported. Read on every keystroke, so a control
   * whose panel only sometimes holds focusables can answer per state.
   *
   * Sequential focus follows the **DOM**, and a teleported panel is no longer after its control in
   * it — so `Tab` from the control would step past the panel to whatever comes next on the page,
   * and the popup would close with its own controls never reached. Two of this package's panels
   * have real tab stops in them (a multi-select's footer Clear and Done; whatever a consumer puts
   * in the `SearchBar`'s row slot), and the design spec's Multi-select Keyboard table is explicit
   * that `Tab` walks "from the search field (or the trigger) to the footer's Clear, then Done, with
   * the popover still open".
   *
   * Turn this on and `usePopover` restores exactly that walk, and nothing more:
   *
   * - `Tab` on the **last** tab stop the control still holds — its trigger, or the clear button
   *   beside it when one is rendered, or whatever else claims the panel's id with
   *   `data-eldra-overlay-owner` — moves focus to the panel's **first** focusable. The steps
   *   *within* the control are untouched: those elements are still siblings in the DOM, so the
   *   browser walks trigger → clear button on its own, and only the step that would leave the
   *   control is redirected;
   * - `Shift+Tab` on the panel's first focusable moves it back to that same last stop — the clear
   *   button when there is one, else the trigger — from which the browser's own reverse order
   *   finishes the walk;
   * - `Tab` on the panel's **last** focusable is left alone — focus leaves for the next thing on
   *   the page, and `useOverlay` closes the popup behind it.
   *
   * That last one is what keeps this a redirect rather than a focus trap: there is an exit forward
   * (past the last row) and an exit backward (`Shift+Tab` to the trigger, then on), so WCAG 2.1.2
   * is satisfied — a keyboard user is never held anywhere. It is also why nothing here is a
   * `focusin` correction: only the two boundary keystrokes are touched, and every other `Tab`
   * inside the panel is the browser's own.
   *
   * Off by default, and inert while the panel is not teleported (in place, the DOM order is
   * already right) or holds no focusable at all.
   */
  tabRedirect?: boolean | (() => boolean);
  /** Ran while opening, after the registry slot is claimed: reset state, emit `open`. */
  onOpen?: () => void;
  /** Ran while closing, after the registry slot is released: reset state, emit `close`. */
  onClose?: () => void;
  /** Ran a tick after an open that was actually a *change*: move focus into the panel. */
  afterOpen?: () => void | Promise<void>;
  /** What a pointer press on the trigger should open, when the popup is closed. */
  openFromPointer?: () => void;
}

export interface UsePopoverReturn {
  /** Whether the popup is showing. Written only through the functions below. */
  isOpen: Ref<boolean>;
  /** Open or close, with the registry and the two hooks. Ignores a no-op. */
  setOpen(next: boolean): void;
  /**
   * Open, then make something active (the caller's listbox), then run `afterOpen` — the last one
   * only when this call is what opened it, so re-opening an open panel never re-focuses it.
   */
  open(activate?: (wasOpen: boolean) => void): void;
  /** Close, putting focus back on the trigger unless told not to. */
  close(returnFocus?: boolean): void;
  /** `useFloating`'s position plus the entrance origin the keyframes read. */
  panelStyle: ComputedRef<Record<string, string>>;
  /** The placement actually used, after flipping. */
  placement: ComputedRef<string>;
  /**
   * `<Teleport to>`: the open `<dialog>` the trigger sits in, or `document.body`, or the
   * consumer's own selector. An **element** rather than a selector wherever one is known, so two
   * open dialogs cannot both answer the same query.
   */
  teleportTo: ComputedRef<HTMLElement | string>;
  /**
   * `<Teleport disabled>`: `true` until this component is mounted, and for good when
   * `teleport: false`.
   *
   * The mounted flag is what makes the teleport SSR-safe. `<Teleport>` renders its content into a
   * separate buffer on the server, and hydration then has to find it somewhere the server never
   * put it; `disabled` renders in place on both sides instead, and the real teleport happens once,
   * after mount, when Vue simply moves the nodes. (These popups also start closed, so a server
   * render emits no panel at all — this is the second lock on the same door.)
   */
  teleportDisabled: ComputedRef<boolean>;
  /** Put these two on the trigger to get the label-forwarded-click rule (see below). */
  onTriggerPointerDown(): void;
  onTriggerClick(event: MouseEvent): void;
}

/**
 * The open/closed life of a **non-modal popup** anchored to a control: `Select`'s panel,
 * `MultiSelect`'s, and the `SearchBar`'s results panel.
 *
 * Every one of them needs the same six things, and before this composable the first two controls
 * held a line-identical copy of all of them:
 *
 * - **"Only one open at a time"** (`openRegistry`): opening claims a module-level slot and closes
 *   whatever held it. The handle is stable per instance, so a late close cannot blank out the
 *   popup that took its place.
 * - **Closing** (`useOverlay`): an outside pointer press, focus leaving, `Escape`. Non-modal, so
 *   nothing is trapped and `Tab` always moves on.
 * - **Getting out of the way of the page** (`teleport`): the panel is rendered through a
 *   `<Teleport>` to `body` — or to the modal `<dialog>` the trigger is in, which is the one place
 *   `body` would be *behind* — and positioned with floating-ui's `fixed` strategy, so no ancestor's
 *   `overflow: hidden` clips it and no later stacking context paints over it. `tabRedirect` puts a
 *   panel that has real tab stops back into the `Tab` walk it left with its place in the DOM.
 * - **Positioning** (`useFloating`), plus the `--eldra-popover-origin` the entrance keyframes read,
 *   so a panel that flips after floating-ui measures changes a custom property rather than its
 *   `animation-name` (which would replay the entrance).
 * - **The open sequence**: open, make a row active, and — only when the call actually changed the
 *   state — run `afterOpen` a tick later, which is where focus moves into the panel.
 * - **The label-forwarded-click latch**: a `<label for>` naming the trigger forwards its click to
 *   it, and the spec is explicit that clicking a field's label focuses the control **without**
 *   opening it. A forwarded click is indistinguishable from a real one except that no pointer was
 *   pressed on the trigger and its `detail` is 0 — the same shape as a programmatic
 *   `element.click()`. The latch is armed on `pointerdown` and released on the `pointerup` or
 *   `pointercancel` that follows, wherever it lands: a press that ends off the trigger (a drag, a
 *   cancelled touch) would otherwise leave the latch standing and arm the *next* click.
 *
 * What stays with each control is what actually differs: which rows there are, what choosing one
 * does, and which element the popup is anchored to.
 */
export function usePopover(options: UsePopoverOptions): UsePopoverReturn {
  const { trigger, content } = options;
  const canOpen = (): boolean => options.canOpen?.() !== false;

  const isOpen = ref(false);

  /** The registry's handle on this popup. Stable, so the registry can tell ours from another's. */
  const closeFromRegistry = (): void => setOpen(false);

  function setOpen(next: boolean): void {
    if (next === isOpen.value) return;
    if (next) {
      if (!canOpen()) return;
      isOpen.value = true;
      registerOpen(closeFromRegistry);
      options.onOpen?.();
      return;
    }
    isOpen.value = false;
    unregisterOpen(closeFromRegistry);
    options.onClose?.();
  }

  const overlay = useOverlay({
    open: isOpen,
    trigger,
    content,
    setOpen: (next) => setOpen(next),
  });

  // --- where the panel is rendered ----------------------------------------------------------------

  const teleport = options.teleport ?? true;

  /**
   * A native `<dialog>` opened as a modal renders in the browser's **top layer**, above every
   * z-index on the page — which is exactly why the design spec's non-negotiable 2 puts every modal
   * surface in one. A panel teleported to `body` would therefore render *behind* the dialog that
   * opened it, with no `z-index` able to help. So a trigger inside an open dialog teleports into
   * that dialog instead: same escape from clipping and stacking, same top layer. See
   * `../../composables/teleportTarget`, shared with `Tooltip`.
   */
  const { teleportTo, teleportDisabled } = useTeleportTarget({ trigger, teleport, isOpen });

  const { styles: floatingStyles, placement } = useFloating(trigger, content, {
    placement: options.placement ?? 'auto',
    offset: options.offset,
    matchWidth: options.matchWidth,
    // A teleported panel has left its control's positioning context behind, so the viewport is the
    // only frame both elements still share. `autoUpdate` observes the reference's scroll ancestors
    // either way, so the panel follows a trigger that scrolls under it.
    strategy: teleport === false ? 'absolute' : 'fixed',
  });

  // --- keeping the teleported panel in the Tab walk ------------------------------------------------

  const wantsTabRedirect = (): boolean => {
    const setting = options.tabRedirect ?? false;
    return typeof setting === 'function' ? setting() : setting;
  };

  /**
   * Every tab stop of this overlay that is **not** in the panel, in document order — the trigger,
   * plus anything claiming the panel's id with `data-eldra-overlay-owner` (a multi-select's clear
   * button). These keep their natural place in the walk: the redirect happens at the **last** of
   * them, so `Tab` still passes each one on the way to the panel.
   *
   * The owner elements are found with a plain attribute-presence selector and filtered by value in
   * JavaScript, for the reason `useOverlay` walks the attribute by hand: an id is merchant-settable
   * through the `id` prop, and one holding a character CSS would need escaped must not break this.
   */
  function stopsBeforePanel(panel: HTMLElement): HTMLElement[] {
    const roots: HTMLElement[] = [];
    if (trigger.value !== null) roots.push(trigger.value);
    const id = panel.id;
    if (id !== '') {
      for (const owner of document.querySelectorAll<HTMLElement>(`[${OVERLAY_OWNER_ATTRIBUTE}]`)) {
        if (owner.getAttribute(OVERLAY_OWNER_ATTRIBUTE) !== id) continue;
        if (panel.contains(owner) || roots.includes(owner)) continue;
        roots.push(owner);
      }
    }
    const stops = roots.flatMap((root) => overlay.focusables(root));
    // `querySelectorAll` is in document order within each root, but the roots themselves arrive in
    // the order they were collected, which is not necessarily theirs.
    return stops.sort((a, b) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) === 0 ? 1 : -1
    );
  }

  /**
   * The two boundary keystrokes of the walk described on the `tabRedirect` option: into the panel
   * from the last tab stop the control still holds, and back out of the panel's first row to that
   * same stop. Everything else about `Tab` is left to the browser, which is what keeps this a
   * redirect rather than a trap — including the steps *within* the control, so a multi-select's
   * clear button is passed on the way in and returned to on the way back.
   *
   * It listens in the **capture** phase, before the control's own `keydown` reaches its handler:
   * `useListbox`'s `Tab` case asks the caller to close (the `SearchBar` does), and a popup that has
   * already closed has nothing left to walk into. Propagation is stopped only on the two keystrokes
   * actually redirected, so every other `Tab` arrives at the control untouched.
   */
  function onTabKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
    if (!isOpen.value || teleportDisabled.value || !wantsTabRedirect()) return;

    const panel = content.value;
    const active = document.activeElement;
    if (panel === null || active === null) return;

    // A panel with no tab stop of its own is not in the walk at all: there is nothing to walk into,
    // and stepping past it is the right answer.
    const first = overlay.focusables()[0];
    if (first === undefined) return;

    const before = stopsBeforePanel(panel);
    const last = before.at(-1);

    if (event.shiftKey) {
      // Backwards out of the panel's first row, onto the control's last stop — its clear button
      // when one is rendered, else the trigger. Anywhere else in the panel, the browser's own
      // reverse order is already correct.
      if (active !== first) return;
      event.preventDefault();
      event.stopPropagation();
      (last ?? trigger.value)?.focus();
      return;
    }

    // Forwards, into the panel. `isInside` rather than `trigger.contains`, so a part of the overlay
    // that is not in the panel either counts as being in the control; and only from its **last**
    // stop, so the browser still walks the control's own controls first.
    if (panel.contains(active) || !overlay.isInside(active)) return;
    if (last !== undefined && active !== last) return;
    event.preventDefault();
    event.stopPropagation();
    first.focus();
  }

  const attachTabRedirect = (): void => {
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', onTabKeyDown, true);
  };

  const detachTabRedirect = (): void => {
    if (typeof document === 'undefined') return;
    document.removeEventListener('keydown', onTabKeyDown, true);
  };

  watch(isOpen, (open) => (open ? attachTabRedirect() : detachTabRedirect()), { immediate: true });

  function open(activate?: (wasOpen: boolean) => void): void {
    if (!canOpen()) return;
    const wasOpen = isOpen.value;
    setOpen(true);
    if (!isOpen.value) return;
    activate?.(wasOpen);
    if (!wasOpen) void options.afterOpen?.();
  }

  function close(returnFocus = true): void {
    if (!isOpen.value) return;
    setOpen(false);
    if (returnFocus) trigger.value?.focus();
  }

  // --- the trigger's pointer latch ---------------------------------------------------------------

  let pressedTrigger = false;

  function releaseTrigger(event: Event): void {
    detachTriggerRelease();
    const target = event.target;
    if (target instanceof Node && trigger.value?.contains(target) === true) return;
    pressedTrigger = false;
  }

  function detachTriggerRelease(): void {
    if (typeof document === 'undefined') return;
    document.removeEventListener('pointerup', releaseTrigger, true);
    document.removeEventListener('pointercancel', releaseTrigger, true);
  }

  function onTriggerPointerDown(): void {
    pressedTrigger = true;
    if (typeof document === 'undefined') return;
    document.addEventListener('pointerup', releaseTrigger, true);
    document.addEventListener('pointercancel', releaseTrigger, true);
  }

  function onTriggerClick(event: MouseEvent): void {
    const fromPointer = pressedTrigger || event.detail > 0;
    pressedTrigger = false;
    if (!canOpen()) return;
    if (!fromPointer) {
      trigger.value?.focus();
      return;
    }
    if (isOpen.value) close();
    else options.openFromPointer?.();
  }

  onBeforeUnmount(() => {
    unregisterOpen(closeFromRegistry);
    detachTriggerRelease();
    detachTabRedirect();
  });

  /**
   * Which corner the panel grows from: the one it is anchored by, so the entrance reads as the
   * control opening out rather than as a box arriving from somewhere. A panel below the control
   * grows from `top left`, a flipped one from `bottom left`. A custom property rather than a second
   * animation class: see the composable's own comment above, and the keyframes in `tailwind.css`.
   *
   * Logical directions are deliberately not used. `transform-origin` takes physical keywords only
   * (`left`/`right`, never `inline-start`), and every panel in this package is `start`-aligned and
   * at least as wide as its control, so the horizontal half barely moves the result either way.
   */
  const isAbove = computed(() => placement.value.startsWith('top'));
  const panelStyle = computed<Record<string, string>>(() => ({
    ...floatingStyles.value,
    '--eldra-popover-origin': isAbove.value ? 'bottom left' : 'top left',
  }));

  return {
    isOpen,
    setOpen,
    open,
    close,
    panelStyle,
    placement,
    teleportTo,
    teleportDisabled,
    onTriggerPointerDown,
    onTriggerClick,
  };
}
