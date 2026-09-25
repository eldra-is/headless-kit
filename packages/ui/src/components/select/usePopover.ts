import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import { useFloating, type FloatingPlacement } from '../../composables/useFloating';
import { useOverlay } from '../../composables/useOverlay';
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
 *   `<Teleport>` to `body` — or to the open `<dialog>` the trigger is in, which is the one place
 *   `body` would be *behind* — and positioned with floating-ui's `fixed` strategy, so no ancestor's
 *   `overflow: hidden` clips it and no later stacking context paints over it.
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

  useOverlay({
    open: isOpen,
    trigger,
    content,
    setOpen: (next) => setOpen(next),
  });

  // --- where the panel is rendered ----------------------------------------------------------------

  const teleport = options.teleport ?? true;

  /**
   * Only `true` after `onMounted`, which never runs on the server. Everything that reads the
   * document below is behind it.
   */
  const isMounted = ref(false);
  onMounted(() => {
    isMounted.value = true;
  });

  const teleportDisabled = computed(() => teleport === false || !isMounted.value);

  /**
   * A native `<dialog>` opened as a modal renders in the browser's **top layer**, above every
   * z-index on the page — which is exactly why the design spec's non-negotiable 2 puts every modal
   * surface in one. A panel teleported to `body` would therefore render *behind* the dialog that
   * opened it, with no `z-index` able to help. So a trigger inside an open dialog teleports into
   * that dialog instead: same escape from clipping and stacking, same top layer.
   *
   * `isOpen` is read so the target is resolved afresh on every open — a dialog that was closed the
   * last time this popup opened may be open now, and `closest()` answers about the DOM as it is,
   * not reactively.
   */
  const teleportTo = computed<HTMLElement | string>(() => {
    if (!isMounted.value) return 'body';
    if (typeof teleport === 'string') return teleport;
    void isOpen.value;
    return trigger.value?.closest('dialog[open]') ?? document.body;
  });

  const { styles: floatingStyles, placement } = useFloating(trigger, content, {
    placement: options.placement ?? 'auto',
    offset: options.offset,
    matchWidth: options.matchWidth,
    // A teleported panel has left its control's positioning context behind, so the viewport is the
    // only frame both elements still share. `autoUpdate` observes the reference's scroll ancestors
    // either way, so the panel follows a trigger that scrolls under it.
    strategy: teleport === false ? 'absolute' : 'fixed',
  });

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
