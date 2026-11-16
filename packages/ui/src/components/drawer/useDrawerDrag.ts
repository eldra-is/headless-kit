import { onBeforeUnmount, onMounted, type Ref } from 'vue';

/**
 * Drag-to-dismiss for `Drawer`: a side drawer swiped toward its own edge, and a `mobileSheet`
 * drawer pulled down below the 48rem viewport edge. The panel follows the pointer one to one, the
 * backdrop fades with the distance (`--eldra-drawer-drag`, read by `eldra-drawer-motion`), and on
 * release the drawer closes past a third of its size or on a quick flick, else springs back.
 *
 * Nothing moves until the pointer has travelled the dead zone along the closing direction and
 * more along it than across it: 24px for a side swipe (`--eldra-drawer-swipe-threshold`), so a
 * stray mouse movement or a scroll never drags the drawer, and 4px on a sheet's handle and header,
 * which exist to be grabbed. The panel then starts from 0, not from the dead zone.
 *
 * Where a drag may start: never on a control (a button, link, field, or anything editable) or
 * inside something that scrolls sideways. A mouse or pen drags a side drawer by its header only,
 * so selecting text in the body still works; a finger may swipe it from anywhere. A sheet is
 * dragged by its handle and header, and by its body when the body is scrolled to the top and the
 * finger moves down, the way a native sheet hands a scroll over to the sheet.
 */

const INTERACTIVE =
  'button, a[href], input, textarea, select, label, summary, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="button"], [role="link"], [role="tab"], [role="option"]';

/** A third of the panel, or a flick at least this fast toward the edge, closes the drawer. */
const DISMISS_FRACTION = 0.35;
const FLICK_SPEED = 0.45;
const SHEET_THRESHOLD = 4;
const SIDE_THRESHOLD = 24;

export interface DrawerDragOptions {
  dialog: Ref<HTMLDialogElement | null>;
  panel: Ref<HTMLElement | null>;
  body: Ref<HTMLElement | null>;
  side: () => 'left' | 'right';
  /** The `mobileSheet` prop; the sheet itself only exists below the 48rem viewport edge. */
  sheet: () => boolean;
  /** The `swipe` prop. */
  enabled: () => boolean;
  /** Closes the drawer; called once the panel has been let go past the dismiss point. */
  dismiss: () => void;
}

interface Gesture {
  axis: 'x' | 'y';
  /** +1 when the closing direction is positive on `axis` (right edge, or down), else -1. */
  dir: 1 | -1;
  threshold: number;
  startX: number;
  startY: number;
  /** The distance along the closing direction at which the panel started following. */
  origin: number;
  engaged: boolean;
  size: number;
  position: number;
  samples: { t: number; p: number }[];
}

function isSheetViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(width < 48rem)').matches;
}

function scrollsSideways(target: Element, stop: Element): boolean {
  for (let el: Element | null = target; el && el !== stop; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

export function useDrawerDrag(options: DrawerDragOptions) {
  let gesture: Gesture | null = null;
  let pointerId: number | null = null;
  let suppressClick = false;

  function thresholdFor(axis: 'x' | 'y'): number {
    if (axis === 'y') return SHEET_THRESHOLD;
    const raw = options.dialog.value
      ? getComputedStyle(options.dialog.value).getPropertyValue('--eldra-drawer-swipe-threshold')
      : '';
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : SIDE_THRESHOLD;
  }

  function begin(x: number, y: number, axis: 'x' | 'y'): void {
    const panel = options.panel.value;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    gesture = {
      axis,
      dir: axis === 'y' || options.side() === 'right' ? 1 : -1,
      threshold: thresholdFor(axis),
      startX: x,
      startY: y,
      origin: 0,
      engaged: false,
      size: axis === 'x' ? rect.width : rect.height,
      position: 0,
      samples: [],
    };
  }

  /** Feeds a pointer position; returns whether the drag is engaged (the panel is following). */
  function track(x: number, y: number): boolean {
    const g = gesture;
    if (!g) return false;
    const along = (g.axis === 'x' ? x - g.startX : y - g.startY) * g.dir;
    const across = Math.abs(g.axis === 'x' ? y - g.startY : x - g.startX);
    if (!g.engaged) {
      if (Math.abs(along) < g.threshold && across < g.threshold) return false;
      if (along < g.threshold || across > along) {
        gesture = null;
        return false;
      }
      g.engaged = true;
      g.origin = along;
      options.dialog.value?.setAttribute('data-dragging', '');
      window.getSelection?.()?.removeAllRanges();
    }
    // The panel stops at its resting position: dragged back past it, it stays put.
    g.position = Math.max(along - g.origin, 0);
    const now = performance.now();
    g.samples.push({ t: now, p: g.position });
    while (g.samples.length > 2 && now - g.samples[0]!.t > 100) g.samples.shift();
    paint(g);
    return true;
  }

  function paint(g: Gesture): void {
    const panel = options.panel.value;
    const dialog = options.dialog.value;
    if (!panel || !dialog) return;
    const offset = g.position * g.dir;
    panel.style.translate = g.axis === 'x' ? `${offset}px 0` : `0 ${offset}px`;
    const progress = Math.min(Math.max(g.position / g.size, 0), 1);
    dialog.style.setProperty('--eldra-drawer-drag', progress.toFixed(4));
  }

  function release(): void {
    const g = gesture;
    gesture = null;
    if (!g?.engaged) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const first = g.samples[0];
    const last = g.samples[g.samples.length - 1];
    // A pointer that stopped before letting go is not flicking, however fast it moved before.
    const held = last ? performance.now() - last.t > 80 : true;
    const velocity =
      !held && first && last && last.t > first.t ? (last.p - first.p) / (last.t - first.t) : 0;
    const dismissed =
      g.position > g.size * DISMISS_FRACTION || (velocity > FLICK_SPEED && g.position > 8);
    const dialog = options.dialog.value;
    const panel = options.panel.value;
    if (dialog && dismissed) {
      // Leave from where the finger let go, at the speed it was moving, and all the way off the
      // edge rather than back to the short entrance offset.
      const remaining = Math.max(g.size - g.position, 0);
      const duration = Math.round(
        Math.min(Math.max(remaining / Math.max(velocity, 1.2), 140), 320)
      );
      dialog.style.setProperty('--eldra-drawer-exit-duration', `${duration}ms`);
      dialog.style.setProperty('--eldra-drawer-from-opacity', '1');
      if (g.axis === 'x') {
        dialog.style.setProperty('--eldra-drawer-axis-x', '0');
        dialog.style.setProperty('--eldra-drawer-away-x', String(g.dir));
      }
    }
    dialog?.removeAttribute('data-dragging');
    dialog?.style.removeProperty('--eldra-drawer-drag');
    if (panel) panel.style.translate = '';
    if (dismissed) options.dismiss();
  }

  /** Clears what a swipe-dismiss left on the root, so the next opening enters the usual way. */
  function reset(): void {
    const dialog = options.dialog.value;
    if (!dialog) return;
    for (const name of [
      '--eldra-drawer-exit-duration',
      '--eldra-drawer-from-opacity',
      '--eldra-drawer-axis-x',
      '--eldra-drawer-away-x',
      '--eldra-drawer-drag',
    ]) {
      dialog.style.removeProperty(name);
    }
    dialog.removeAttribute('data-dragging');
    if (options.panel.value) options.panel.value.style.translate = '';
  }

  // --- Pointer: a side swipe, and a sheet's handle and header ---------------------------------

  function onPointerDown(event: PointerEvent): void {
    if (!options.enabled() || gesture || event.button !== 0 || !event.isPrimary) return;
    const panel = options.panel.value;
    const target = event.target as Element | null;
    if (!panel || !target || target.closest(INTERACTIVE)) return;
    const sheet = options.sheet() && isSheetViewport();
    const grip = target.closest('[data-part="handle"], [data-part="header"]');
    if (sheet) {
      if (!grip) return;
    } else {
      if (event.pointerType !== 'touch' && !grip) return;
      if (scrollsSideways(target, panel)) return;
    }
    begin(event.clientX, event.clientY, sheet ? 'y' : 'x');
    pointerId = event.pointerId;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerCancel);
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;
    if (track(event.clientX, event.clientY)) event.preventDefault();
  }

  function stopPointer(): void {
    pointerId = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerEnd);
    window.removeEventListener('pointercancel', onPointerCancel);
  }

  function onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;
    stopPointer();
    release();
  }

  /** The browser took the gesture over (a scroll): put the panel back. */
  function onPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;
    stopPointer();
    if (gesture?.engaged) gesture.position = 0;
    release();
  }

  /** A drag that ended over the panel must not also click what it ended on. */
  function onClickCapture(event: MouseEvent): void {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  // --- Touch: a sheet's body, handed over from its scroll at the top ---------------------------

  let touchId: number | null = null;

  function onTouchStart(event: TouchEvent): void {
    const body = options.body.value;
    if (!options.enabled() || !options.sheet() || !isSheetViewport() || gesture || !body) return;
    const touch = event.changedTouches[0];
    const target = event.target as Element | null;
    if (!touch || event.touches.length > 1 || !target || target.closest(INTERACTIVE)) return;
    if (body.scrollTop > 0) return;
    touchId = touch.identifier;
    begin(touch.clientX, touch.clientY, 'y');
  }

  function onTouchMove(event: TouchEvent): void {
    if (touchId === null) return;
    const touch = [...event.changedTouches].find((t) => t.identifier === touchId);
    if (!touch) return;
    if ((options.body.value?.scrollTop ?? 0) > 0 && !gesture?.engaged) {
      touchId = null;
      gesture = null;
      return;
    }
    if (track(touch.clientX, touch.clientY)) event.preventDefault();
    else if (!gesture) touchId = null;
  }

  function onTouchEnd(event: TouchEvent): void {
    if (touchId === null) return;
    if (![...event.changedTouches].some((t) => t.identifier === touchId)) return;
    touchId = null;
    release();
  }

  // A plain listener, not a template `@click.capture`: Vue stamps an event with the time its first
  // Vue listener saw it and skips any handler attached in that same millisecond, so a capturing
  // Vue listener on the root could swallow the close button's own click right after mounting.
  onMounted(() => options.dialog.value?.addEventListener('click', onClickCapture, true));
  onBeforeUnmount(() => {
    options.dialog.value?.removeEventListener('click', onClickCapture, true);
    stopPointer();
  });

  return { onPointerDown, onTouchStart, onTouchMove, onTouchEnd, reset };
}
