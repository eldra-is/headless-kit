import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue';
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
  /** Give the panel a `minWidth` equal to the control's. */
  matchWidth?: boolean;
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
  /** `useFloating`'s position plus the two entrance variables the keyframes read. */
  panelStyle: ComputedRef<Record<string, string>>;
  /** The placement actually used, after flipping. */
  placement: ComputedRef<string>;
  /** Put these two on the trigger to get the label-forwarded-click rule (see below). */
  onTriggerPointerDown(): void;
  onTriggerClick(event: MouseEvent): void;
}

/**
 * The open/closed life of a **non-modal popup** anchored to a control: `Select`'s panel,
 * `MultiSelect`'s, and the `SearchBar`'s results panel.
 *
 * Every one of them needs the same five things, and before this composable the first two controls
 * held a line-identical copy of all of them:
 *
 * - **"Only one open at a time"** (`openRegistry`): opening claims a module-level slot and closes
 *   whatever held it. The handle is stable per instance, so a late close cannot blank out the
 *   popup that took its place.
 * - **Closing** (`useOverlay`): an outside pointer press, focus leaving, `Escape`. Non-modal, so
 *   nothing is trapped and `Tab` always moves on.
 * - **Positioning** (`useFloating`), plus the `--eldra-popover-origin`/`--eldra-popover-slide`
 *   pair the entrance keyframes read, so a panel that flips after floating-ui measures changes a
 *   custom property rather than its `animation-name` (which would replay the entrance).
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

  const { styles: floatingStyles, placement } = useFloating(trigger, content, {
    placement: options.placement ?? 'auto',
    offset: options.offset,
    matchWidth: options.matchWidth,
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
   * Which edge the panel grows from. Two CSS variables rather than two animation classes: see the
   * composable's own comment above.
   */
  const isAbove = computed(() => placement.value.startsWith('top'));
  const panelStyle = computed<Record<string, string>>(() => ({
    ...floatingStyles.value,
    '--eldra-popover-origin': isAbove.value ? 'bottom' : 'top',
    '--eldra-popover-slide': isAbove.value ? '0.25rem' : '-0.25rem',
  }));

  return {
    isOpen,
    setOpen,
    open,
    close,
    panelStyle,
    placement,
    onTriggerPointerDown,
    onTriggerClick,
  };
}
