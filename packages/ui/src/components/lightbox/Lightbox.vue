<script setup lang="ts">
/**
 * A full-screen modal image viewer for product galleries (design spec "Lightbox", lines
 * 3836-3967): counter, close, previous/next and a caption around a one-image-per-view Carousel
 * track. Use it for zooming into product photos; never for a single small image that is already
 * readable, and never put buy actions in it.
 *
 * Built on `useDialog` (native `<dialog>` + `showModal()`, no custom focus trap, the shared
 * `dialogStack` stack `Dialog`/`Drawer` also push onto — nested modals allowed, `Esc`/a backdrop
 * click act on the topmost one only, operator override, see the README's Deviations entry) and
 * `useCarousel` (index tracking, previous/next/goTo, edge
 * detection, `←`/`→` stepping) unchanged — this file only draws the anatomy, forces the viewer to
 * always fill the viewport, and wires the behaviours neither composable owns on its own: opening
 * at `index` without animation, `←`/`→` working from *anywhere* in the viewer (not only a focused
 * track), initial focus landing on the close button (the opposite of `useDialog`'s own default,
 * the same kind of override `Drawer`'s right side already makes), and every full-resolution
 * `<img>` staying out of the DOM until the viewer actually opens (spec "Do": "load full-resolution
 * images only when the viewer opens" — an eager `<img>` fetches the moment it is *connected*,
 * `display: none` on the closed `<dialog>` notwithstanding, so this is a `v-if` on `Image` itself,
 * not a `loading` attribute (see the template's own comment on the track for why the *wrapper*
 * stays mounted).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useDialog } from '../../composables/useDialog';
import { useMessages } from '../../composables/useMessages';
import { carouselPerViewStyle, useCarousel } from '../carousel/useCarousel';
import Image from '../image/Image.vue';
import type { LightboxProps } from './types';
import { containedRect, MIN_ZOOM_SCALE, type ZoomRect, zoomScale, zoomTransform } from './zoom';
import { useEldraScope } from '../../composables/useEldraScope';

const eldra = useEldraScope();

const props = withDefaults(defineProps<LightboxProps>(), {
  modelValue: undefined,
  index: 0,
  thumbnails: false,
  zoom: false,
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** Fires with the new image index when the shopper moves between images (spec "Events":
   *  `indexChange`). Two-way with `index`. */
  'update:index': [value: number];
}>();

const m = useMessages(() => props.messages);

/** Controlled when the parent binds `v-model`, self-managing when it does not — the same model
 *  every stateful component in this package uses (see `Dialog`, `Drawer`). */
const model = useControllableModel<boolean>(props, emit, () => false);

const dialogEl = ref<HTMLDialogElement | null>(null);
const closeButtonEl = ref<HTMLElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const trackRef = ref<HTMLElement | null>(null);
const prevButtonRef = ref<HTMLButtonElement | null>(null);
const nextButtonRef = ref<HTMLButtonElement | null>(null);

/** Spec "Variants" → "Single image": "No arrows and no counter." A thumbnail strip is not named
 *  there, but there is nothing to pick between with one photo, so it is hidden too — a consumer
 *  who still passes `thumbnails` with one image gets the same result the spec's own rule implies. */
const single = computed(() => props.images.length <= 1);
const showThumbnails = computed(() => props.thumbnails && !single.value);

/** `zoom` state — see the zoom section below. Declared here: `useCarousel`'s `draggable` reads it. */
const zoomed = ref(false);
/** A mouse or pen is over the picture itself (not its letterbox) while not zoomed. */
const hoverImage = ref(false);
/** A mouse or pen is anywhere over the stage — what keeps the zoom button shown on the way to it,
 *  across the letterbox and off the track onto the button itself. */
const hoverStage = ref(false);
const focus = reactive({ x: 0.5, y: 0.5 });

const {
  index: carouselIndex,
  count,
  canPrev,
  canNext,
  goTo,
  next,
  prev,
} = useCarousel({
  rootRef,
  trackRef,
  // Every slide is full width — a Lightbox stage never shows more than one image at a time,
  // unlike Carousel's own default peek. `carouselPerViewStyle`/`eldra-carousel-track`/
  // `eldra-carousel-slide` (all three shared with Carousel, see those own comments) turn
  // `{ base: 1 }` into "100% of the track, no gap" for free (spec "Sizes", Track row).
  slideLabel: () => m.value.imageOf,
  // Always on — unlike `Carousel`, this component has no `draggable` prop of its own (operator
  // decision: "Lightbox inherits it through `useCarousel`"). Dragging on the stage moves
  // between images; the prev/next arrows and the thumbnail strip sit outside `trackRef`, so a
  // drag never reaches (and never needs to suppress a click on) either.
  // …except while zoomed (`zoom`), when dragging over the image pans it instead of changing image.
  draggable: () => !zoomed.value,
  onChange: (value) => emit('update:index', value),
});

/**
 * Moves focus onto `el` even though its `disabled` DOM property may still read stale-`true` for
 * one more instant: these watchers run on Vue's default `'pre'` flush, *before* the render that
 * would actually clear it, and a genuinely `disabled` element refuses focus outright (a real rule,
 * not a test-environment quirk). Whenever this is called, the reactive state driving `:disabled`
 * has already resolved to "enabled" (that is the whole reason focus is moving here) — a gallery
 * with exactly two images moves both arrows' disabled state in the very same tick (the one goes
 * from first to last in a single step), so `el` can be the one still carrying yesterday's `true`.
 * Clearing the property by hand costs nothing: Vue's own patch lands moments later with the exact
 * same `false` this function already knows is coming.
 */
function focusArrow(el: HTMLButtonElement | null): void {
  if (el === null) return;
  el.disabled = false;
  el.focus();
}

// Spec "Behaviour & motion": "if the focused arrow becomes disabled, focus moves to the other
// arrow" — the identical rule and mechanism `Carousel.vue` already uses for its own prev/next.
watch(canPrev, (can) => {
  if (!can && typeof document !== 'undefined' && document.activeElement === prevButtonRef.value) {
    focusArrow(nextButtonRef.value);
  }
});
watch(canNext, (can) => {
  if (!can && typeof document !== 'undefined' && document.activeElement === nextButtonRef.value) {
    focusArrow(prevButtonRef.value);
  }
});

/**
 * Opens at `index` (spec "Behaviour & motion": "Opens at index") by moving the track there
 * **without animation**, regardless of `prefers-reduced-motion` (operator decision) — the spec's own
 * "moving between images scrolls smoothly" describes navigation *after* the viewer is already
 * open, not the initial jump into a gallery at image 4, which would otherwise visibly sweep past
 * every image in between as the viewer fades in.
 *
 * `useCarousel`'s own `goTo` always asks `scrollTo` for `'smooth'` unless the OS-level reduced-
 * motion media query is already on, with no per-call override of its own. Rather than adding one to
 * a composable shared with `Carousel`, this temporarily replaces the track's own `scrollTo` for the
 * duration of this one synchronous `goTo` call — a plain decorator local to this file, restored
 * immediately after.
 */
function openAtIndex(target: number): void {
  const track = trackRef.value;
  const originalFn = track?.scrollTo;
  if (track && typeof originalFn === 'function') {
    const boundOriginal = originalFn.bind(track) as (options?: ScrollToOptions) => void;
    track.scrollTo = ((options?: ScrollToOptions) =>
      boundOriginal({ ...options, behavior: 'auto' })) as typeof track.scrollTo;
  }
  goTo(target);
  // Restored to the exact original reference — not a bound wrapper around it — so a test's own
  // spy (or a real browser's native method) is exactly what `track.scrollTo` is again afterward.
  if (track && typeof originalFn === 'function') track.scrollTo = originalFn;
}

const { close, isTop } = useDialog({
  open: model,
  setOpen: (next) => {
    model.value = next;
  },
  dialog: dialogEl,
  // Spec "Behaviour & motion": "There is no backdrop click: the viewer fills the viewport and its
  // ground is part of the viewer." A literal `false`, not a prop — the spec gives this component
  // no `dismissable` knob at all (the same shape `Drawer` uses for its own unconditional rule,
  // just the opposite direction).
  dismissable: false,
  // `zoom`: `Esc` zooms out first. The press that does is a `keydown` followed by the dialog's own
  // `cancel`, so the flag set in `onViewerKeydown` keeps that same press from also closing.
  closeOnEscape: () => !zoomed.value && !escapeZoomedOut,
  // Spec "Behaviour & motion": "Initial focus: the close button" — the opposite of `useDialog`'s
  // own default (never the close button while a better candidate exists), so, like `Drawer`'s own
  // right side, this passes it explicitly rather than relying on DOM order.
  initialFocus: closeButtonEl,
});

// `immediate: true`: a Lightbox mounted already open (`modelValue: true` at mount, the shape every
// story/test in this package uses) must jump to its starting `index` too, not only a later
// `false -> true` transition a plain `watch` would catch. Safe to run this early because the
// deferred `nextTick()` inside always resolves after `useDialog`'s own `onMounted` has already
// called the *synchronous* `showModal()` — only the focus call after it is itself deferred — so by
// the time `openAtIndex` actually runs, the dialog is already open and its slides are already laid
// out, regardless of which of the two queued `nextTick` callbacks (this one, or `useDialog`'s own
// `focusInitial`) happens to run first.
watch(
  model,
  (isOpen) => {
    if (isOpen) void nextTick(() => openAtIndex(props.index));
  },
  { immediate: true }
);

function onCloseClick(): void {
  close('button');
}

/**
 * Spec "Keyboard": "← / → | Previous / next image, from anywhere in the viewer" — unlike
 * `Carousel`'s own `onTrackKeydown`, which only fires while the track itself is focused, this is
 * bound on the `<dialog>` root so it catches the arrow keys from the close button, an arrow, a
 * thumbnail or the track alike (every one of them lives inside the dialog, so the `keydown` always
 * bubbles up to it). Reimplemented here rather than also binding `useCarousel`'s own
 * `onTrackKeydown` on the track — binding both would fire `next()`/`prev()` twice whenever the
 * track itself has focus, once from each listener.
 */
/** Set for the rest of an `Esc` press that zoomed out — cleared on the next task, after the
 *  dialog's `cancel` for the same press has been dispatched. */
let escapeZoomedOut = false;

/** `zoom`, while zoomed: the arrow keys move the view a tenth of the way per press. */
const PAN_STEP = 0.1;
const PAN_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-PAN_STEP, 0],
  ArrowRight: [PAN_STEP, 0],
  ArrowUp: [0, -PAN_STEP],
  ArrowDown: [0, PAN_STEP],
};

/** `Esc` while zoomed: zooms out, and keeps the rest of the same press from closing the viewer. */
function zoomOutOnEscape(event: Event): void {
  event.preventDefault();
  escapeZoomedOut = true;
  setTimeout(() => {
    escapeZoomedOut = false;
  }, 0);
  setZoomed(false);
}

/** The dialog's own `cancel` (an `Esc` press): it reaches the dialog even when the `keydown` did not
 *  (focus on `<body>`), so zooming out never depends on where focus is. */
function onViewerCancel(event: Event): void {
  if (zoomed.value) zoomOutOnEscape(event);
}

function onViewerKeydown(event: KeyboardEvent): void {
  if (zoomed.value) {
    if (event.key === 'Escape') {
      zoomOutOnEscape(event);
      return;
    }
    const step = PAN_KEYS[event.key];
    if (step) {
      event.preventDefault();
      focus.x = Math.min(1, Math.max(0, focus.x + step[0]));
      focus.y = Math.min(1, Math.max(0, focus.y + step[1]));
    }
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    next();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    prev();
  }
}

// --- zoom ------------------------------------------------------------------------------------------

// `zoom` (an addition beyond the spec, see the README): the current image grows to its real size
// and the mouse picks which part of it shows. `focus` (declared above `useCarousel`) is that pick,
// per axis in `[0, 1]` — `0` the image's leading edge, `1` its trailing edge — and `zoom.ts` turns it
// into a transform. The transform goes on the `<img>`, never on its frame: the frame is what
// `measure()` reads, so it must keep its untransformed box.

/** Whether the current image gains at least `MIN_ZOOM_SCALE` by zooming, as last measured. Layout
 *  is not reactive, so this is refreshed on open, on a change of image and on a window resize. */
const zoomable = ref(false);
const canZoom = computed(() => props.zoom && model.value && zoomable.value);

const toRect = (r: DOMRect): ZoomRect => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
});

function currentSlide(): HTMLElement | null {
  return (trackRef.value?.children[carouselIndex.value] as HTMLElement | undefined) ?? null;
}

/** The current image's geometry, measured now: its frame, the part of the frame the picture
 *  paints (`contain` letterboxes it on a narrow stage), the slide the zoomed image may fill, and how
 *  far it may grow. `null` while there is nothing laid out to measure. */
function measure(): { painted: ZoomRect; stage: ZoomRect; scale: number } | null {
  const slide = currentSlide();
  const image = props.images[carouselIndex.value];
  const frame = slide?.querySelector<HTMLElement>('[data-part="frame"]');
  if (!slide || !frame || !image) return null;
  const painted = containedRect(toRect(frame.getBoundingClientRect()), image.width, image.height);
  if (painted.width <= 0) return null;
  return {
    painted,
    stage: toRect(slide.getBoundingClientRect()),
    scale: zoomScale(image.width, painted.width),
  };
}

function refreshZoomable(): void {
  const geometry = props.zoom && model.value ? measure() : null;
  zoomable.value = geometry !== null && geometry.scale >= MIN_ZOOM_SCALE;
  // A resize that leaves the image near its real size ends the close-up: the scale would otherwise
  // drop toward (or under) 1 while the image still claims to be zoomed.
  if (!zoomable.value && zoomed.value) setZoomed(false);
}

// The zoom button goes away with `canZoom` (a resize, or an image too small to zoom). If it had
// focus, focus would fall to `<body>`, outside the dialog, and the viewer's keys with it; the stage
// takes it instead, before the button is removed (`watch`'s default flush runs ahead of the render).
watch(canZoom, (can) => {
  const button = dialogEl.value?.querySelector('[data-part="zoomButton"]');
  if (!can && button && typeof document !== 'undefined' && document.activeElement === button) {
    trackRef.value?.focus();
  }
});

function setZoomed(on: boolean): void {
  if (on && !canZoom.value) return;
  if (!on) {
    focus.x = 0.5;
    focus.y = 0.5;
  }
  zoomed.value = on;
}

/** Writes the transform onto the current slide's `<img>` and clears it from every other one. */
function applyZoom(): void {
  const track = trackRef.value;
  if (!track) return;
  const slide = currentSlide();
  const geometry = zoomed.value ? measure() : null;
  for (const media of track.querySelectorAll<HTMLElement>('img[data-part="image"]')) {
    if (geometry === null || !slide?.contains(media)) {
      media.style.transform = '';
      continue;
    }
    const { x, y } = zoomTransform(geometry.painted, geometry.stage, geometry.scale, focus);
    media.style.transform = `translate(${x}px, ${y}px) scale(${geometry.scale})`;
  }
}

watch([zoomed, () => focus.x, () => focus.y], applyZoom, { flush: 'post' });
// A different image, or the viewer closing, always starts again from the fitted view.
watch(carouselIndex, () => setZoomed(false));
watch(model, (isOpen) => {
  if (isOpen) return;
  setZoomed(false);
  hoverImage.value = false;
  hoverStage.value = false;
});
watch([model, carouselIndex, () => props.zoom], () => void nextTick(refreshZoomable), {
  immediate: true,
});

function onWindowResize(): void {
  refreshZoomable();
  applyZoom();
}
onMounted(() => window.addEventListener('resize', onWindowResize));
onBeforeUnmount(() => window.removeEventListener('resize', onWindowResize));

/** Inside the painted image, as fractions of it — or `null` for a point outside it. */
function pointInPainted(clientX: number, clientY: number): { x: number; y: number } | null {
  const geometry = measure();
  if (geometry === null) return null;
  const { painted } = geometry;
  const x = (clientX - painted.left) / painted.width;
  const y = (clientY - painted.top) / painted.height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}

/** Where the last press on the track went down: a click that ends more than `CLICK_SLOP` px from it
 *  was a drag between images, not a click on the image. */
const CLICK_SLOP = 4;
let pressAt: { x: number; y: number } | null = null;

function onTrackPointerdown(event: PointerEvent): void {
  pressAt = { x: event.clientX, y: event.clientY };
}

function onStagePointerenter(event: PointerEvent): void {
  if (props.zoom && event.pointerType !== 'touch') hoverStage.value = true;
}

function onStagePointerleave(): void {
  hoverStage.value = false;
}

/**
 * A mouse or pen over the stage. Not zoomed: whether it is over the picture (the zoom-in cursor).
 * Zoomed: where it is over the stage picks the part of the image shown, measured
 * afresh each time so a resized window never pans against a stale box. Touch has neither: it keeps
 * the browser's own pinch-zoom and native swipe.
 */
function onTrackPointermove(event: PointerEvent): void {
  if (!props.zoom || event.pointerType === 'touch') return;
  if (!zoomed.value) {
    hoverImage.value = canZoom.value && pointInPainted(event.clientX, event.clientY) !== null;
    return;
  }
  const geometry = measure();
  if (geometry === null) return;
  const { stage } = geometry;
  focus.x = Math.min(1, Math.max(0, (event.clientX - stage.left) / stage.width));
  focus.y = Math.min(1, Math.max(0, (event.clientY - stage.top) / stage.height));
  applyZoom();
}

function onTrackPointerleave(): void {
  hoverImage.value = false;
}

/** Zoomed, `useCarousel` no longer cancels `dragstart` (its drag is off), so the browser's own image
 *  drag would pick up a ghost copy of the photo and swallow the pan. */
function onTrackDragstart(event: DragEvent): void {
  if (zoomed.value) event.preventDefault();
}

/** A click on the stage: zooms in when it lands on the picture itself (centred on where it
 *  landed), never on the letterbox, the caption or the empty stage; zoomed, any click zooms out. */
function onTrackClick(event: MouseEvent): void {
  if (!props.zoom) return;
  const press = pressAt;
  pressAt = null;
  if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_SLOP) return;
  if (zoomed.value) {
    setZoomed(false);
    return;
  }
  refreshZoomable();
  const point = pointInPainted(event.clientX, event.clientY);
  if (point === null || !canZoom.value) return;
  focus.x = point.x;
  focus.y = point.y;
  setZoomed(true);
}

function onZoomButtonClick(): void {
  setZoomed(!zoomed.value);
}

/** So a consumer can close the viewer with its own action value from outside — the same mechanism
 *  `Dialog`/`Drawer` expose. */
defineExpose({ close, isTop });

const rootClass = [
  // Always the full viewport, at every width (spec "Sizes": "Viewer: the full viewport (inset
  // 0, 100% × 100%)"; "Mobile: The Lightbox is always full screen, at every width") — unlike
  // `Drawer`, which is genuinely windowed above a 48rem viewport, there is no windowed size
  // for this component to fall back to. See the README's Deviations entry for how this reads
  // against the design spec's own general "full-screen variants … apply below a 48rem
  // viewport" line, and `closeClass` below for the one measurement that actually does change
  // at that edge (the close button, exactly like `Drawer`'s own).
  //
  // `hidden open:block`, not bare (fix, from the operator's own finding — see `Dialog`'s own
  // rootClass comment for the full mechanism): without it a closed viewer still painted its
  // full-viewport ground, because an author `display` utility beats the UA's own `display: none`
  // for a closed `<dialog>` regardless of specificity. `open:block`, not `open:flex` like
  // `Drawer`'s/`SearchModal`'s own roots, for the identical reason `Dialog`'s own rootClass
  // comment documents: this root never carried `flex` before (its one `panel` child, already
  // `flex flex-col` internally, is sized by `w-full h-full`, not fit-content, so there is no
  // shrink-to-fit ambiguity for a flex container to resolve differently here — but `open:block`
  // costs nothing and keeps every modal root that never needed `flex` on the same, proven-safe
  // choice rather than two different justifications for the same fix).
  'eldra:hidden eldra:open:block eldra:fixed eldra:inset-0 eldra:m-0 eldra:h-full eldra:max-h-none eldra:w-full eldra:max-w-none eldra:border-0 eldra:bg-transparent eldra:p-0 eldra:text-background',
  'eldra:backdrop:bg-overlay eldra:focus:outline-none',
  'eldra:animate-eldra-lightbox-in eldra:motion-reduce:animate-eldra-dialog-in-reduced',
];

/**
 * The viewer ground (spec "States": "Viewer ground: `text` at 94% (near-opaque ink) background;
 * text/icon: `background`") — an inverted, near-black fill the rest of the anatomy sits on. The
 * native `<dialog>`'s own `::backdrop` still gets `bg-overlay` above (package convention, every
 * modal surface), but this panel covers the entire dialog box, so the backdrop is never actually
 * seen (spec: "Backdrop: `overlay` (covered by the ground)").
 */
const panelClass = computed(() => [
  'eldra:flex eldra:h-full eldra:w-full eldra:flex-col eldra:bg-[color-mix(in_oklab,var(--eldra-color-text)_94%,transparent)]',
  props.classes?.panel,
]);

const barClass =
  'eldra:flex eldra:shrink-0 eldra:items-center eldra:justify-between eldra:gap-4 eldra:px-4 eldra:py-3 eldra:text-body-sm eldra:text-background';

const counterClass = computed(() => [
  'eldra:tabular-nums eldra:text-background',
  props.classes?.counter,
]);

/**
 * Spec "Sizes": "Close: 2.5rem ghost icon button, 2.75rem below 48rem" — the same viewport edge
 * `Drawer`'s own close button grows at (`size-10 max-md:size-11`, stock Tailwind, no custom
 * utility needed — see that component's own comment on why this needs no dedicated built-CSS
 * test). Rest/hover fills and the active press are the same ghost-icon recipe `Dialog`'s own close
 * button uses, inverted for the dark ground (`background`-token fills instead of `text`-token
 * ones) — the spec's own States table gives this component no separate active row, so the press
 * state is this package's own consistent addition, not a literal spec number.
 */
const closeClass = computed(() => [
  'eldra:inline-flex eldra:size-10 eldra:max-md:size-11 eldra:shrink-0 eldra:cursor-pointer eldra:items-center eldra:justify-center eldra:rounded-sm',
  'eldra:text-background eldra:eldra-focus',
  'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-background)_14%,transparent)]',
  'eldra:active:scale-[0.98] eldra:active:bg-[color-mix(in_oklab,var(--eldra-color-background)_20%,transparent)]',
  props.classes?.close,
]);

/** A plain layout wrapper, not a named part (the spec's own anatomy numbers the track/arrows
 *  together as one "stage"; see `Lightbox.vue`'s own file comment). `min-h-0` is what lets `track`
 *  actually scroll within the flex column rather than growing the whole panel. */
const stageClass = computed(() => [
  'eldra:relative eldra:min-h-0 eldra:flex-1',
  // With no thumbnail strip below, the stage mirrors the bar's height (0.75rem padding twice plus
  // the 2.5rem close button, 2.75rem below 48rem) so the image sits centred with equal space
  // above and below instead of running to the viewport's bottom edge.
  !showThumbnails.value && 'eldra:pb-16 eldra:max-md:pb-17',
]);

/**
 * No padding here, deliberately — see `slideClass` below for where the 4rem inset actually lives
 * and why. One slide is always the full track width (`carouselPerViewStyle({ base: 1 })` +
 * `eldra-carousel-track`, shared with `Carousel` — see `eldra-carousel-slide`'s own comment in
 * `tailwind.css`), which needs the track's own content box to be exactly the track's own visible
 * width, no more and no less. The three per-view numbers reach the CSS as an inline style rather
 * than as classes for the reason `carouselPerViewStyle`'s own comment gives; constant here, so the
 * object is hoisted out of the render rather than recomputed per patch.
 */
const TRACK_STYLE = carouselPerViewStyle({ base: 1 });

/**
 * `touch-pan-x touch-pan-y`, `cursor-grab`/`-grabbing` and
 * `data-[dragging=true]:snap-none:scroll-auto:select-none`: the same pointer-drag affordance and
 * fix (operator report, 2026-09-26: broken swipe/drag, text getting highlighted while dragging)
 * `Carousel.vue`'s own `trackClass` carries — see that file's own comment for why `touch-action`
 * needs both axes and why `scroll-auto`/`select-none` need to ride the same `data-dragging`
 * attribute as `snap-none` — always on here, since this component has no `draggable` prop of its
 * own (`useCarousel` call above).
 */
const trackClass = computed(() => [
  'eldra:flex eldra:h-full eldra:touch-pan-x eldra:touch-pan-y eldra:snap-x eldra:snap-mandatory eldra:overflow-x-auto eldra:overscroll-x-contain',
  // `zoom`: a magnifier over the picture, zoom-out anywhere while zoomed, the grab hand otherwise.
  zoomed.value
    ? 'eldra:cursor-zoom-out'
    : hoverImage.value
      ? 'eldra:cursor-zoom-in'
      : 'eldra:cursor-grab',
  // Zoomed, a wheel or trackpad must not scroll to the next image either.
  'eldra:data-[zoomed=true]:overflow-x-hidden',
  'eldra:scroll-smooth eldra:motion-reduce:scroll-auto eldra:eldra-scrollbar-hide eldra:eldra-focus',
  'eldra:[--eldra-focus-offset:4px] eldra:data-[dragging=true]:cursor-grabbing eldra:data-[dragging=true]:snap-none',
  'eldra:data-[dragging=true]:scroll-auto eldra:data-[dragging=true]:select-none',
  'eldra:eldra-carousel-track',
  props.classes?.track,
]);

/**
 * Layout only — width is deliberately left to `eldra-carousel-slide` (added by `useCarousel`'s own
 * `annotate()`, the same as every `Carousel` slide) rather than a static `w-full` here, which would
 * risk a cascade-order tie between two same-specificity classes setting the same property. See
 * `Carousel.vue`'s own slides, which carry no static width class for the identical reason.
 *
 * This wrapper is a plain `<div>`, not itself the `<figure>` the spec's own anatomy names
 * ("Slide: a `<figure>` holding the image") — `useCarousel`'s `annotate()` puts `role="group"` on
 * whichever element it treats as the slide, and axe's `aria-allowed-role` refuses that role on a
 * `<figure>` that itself contains a `<figcaption>` (proven live: only the two captioned images in
 * this file's own stories/tests failed it, the uncaptioned ones did not). `Image`'s own `caption`
 * prop already renders the real `<figure>`/`<figcaption>` pairing one level in, so this outer `div`
 * carries the group semantics and the real figure/figcaption nest inside it undisturbed — the same
 * shape `Carousel`'s own `annotate()` already special-cases for a product row's `<li>` slides.
 * Recorded under Deviations in the README.
 *
 * `px-16` is spec "Sizes": "Stage side padding: 4rem each side (room for the arrows)" — a literal
 * spacing value, the same "component-specific literal, not a shared token" treatment `Dialog`'s own
 * `p-6` gets. It lives here, on the *slide*, rather than on the track itself: padding on the
 * scrolling element (`trackClass`) does not shrink what a scroll-snapped 100%-wide child's own
 * `clientWidth` shows — it only shifts where the content starts, so the very next slide's own
 * padding-width sliver would already be scrolled into view at rest (proven live, in this story's
 * own 360px-wide baseline: a visible peek of slide 2's edge appeared beside slide 1 well before any
 * scroll happened). A slide's own inset costs nothing at the track's box-sizing level — the slide's
 * outer width is still exactly the track's own (border-box already includes the padding) — so the
 * peek disappears and the image alone loses the 4rem the arrows need.
 */
const slideClass = computed(() => [
  'eldra:flex eldra:h-full eldra:px-16',
  // A zoomed image is larger than its slide; the slide is the window it is seen through.
  'eldra:data-[zoomed=true]:overflow-hidden',
  props.classes?.slide,
]);

/** The `<figure>` Image itself renders (given `caption`) — sized to fill the slide and centre its
 *  frame both ways, `flex-col` so the (`flex-1`) frame and the (`shrink-0`) caption stack. */
const imageRootClass = 'eldra:flex eldra:h-full eldra:w-full eldra:flex-col eldra:items-center';

/** While its slide is zoomed, the frame stops clipping (`Image` merges this over its own
 *  `overflow-hidden`): the enlarged `<img>` spills past the frame to the slide's edges. */
const imageFrameClass =
  'eldra:w-auto eldra:max-w-full eldra:flex-1 eldra:min-h-0 eldra:rounded-md eldra:[[data-zoomed=true]_&]:overflow-visible';

/** The zoom transform eases rather than jumps; `zoom` off, nothing ever sets one. */
const imageMediaClass =
  'eldra:transition-transform eldra:duration-fast eldra:ease-out eldra:motion-reduce:transition-none';

/** Spec "Sizes": "Caption: 0.875rem, centred, padding 0.75rem 1rem 1rem" — overriding `Image`'s own
 *  default caption style (`text-caption text-muted mt-2`, sized/coloured for a light card ground)
 *  for this component's dark one. */
const imageCaptionClass =
  'eldra:mt-0 eldra:shrink-0 eldra:px-4 eldra:pt-3 eldra:pb-4 eldra:text-center eldra:text-body-sm eldra:text-background';

/**
 * Spec "Sizes": "Arrows: 2.75rem circles, 1px outline, 0.75rem from the stage edges, centred
 * vertically." "Arrow, rest": transparent fill, `background`-at-70% border, `background` icon;
 * "hover": `background`-at-14% fill; "disabled": icon drops to 45% opacity while the *border* stays
 * put — so the dimming lives on `text-background/45` (the icon's own `currentColor`), never a
 * whole-button `opacity-*`, which would fade the border too.
 */
const ARROW_BASE = [
  'eldra:absolute eldra:top-1/2 eldra:inline-flex eldra:size-11 eldra:shrink-0 eldra:-translate-y-1/2 eldra:cursor-pointer eldra:items-center',
  'eldra:justify-center eldra:rounded-full eldra:border eldra:text-background eldra:eldra-focus',
  'eldra:border-[color-mix(in_oklab,var(--eldra-color-background)_70%,transparent)]',
  'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-background)_14%,transparent)]',
  'eldra:disabled:cursor-not-allowed eldra:disabled:text-background/45',
  'eldra:disabled:hover:bg-transparent',
];
/** `zoom`: the arrows step aside while zoomed — the enlarged image fills the stage they sit on, and
 *  changing image then would throw the shopper out of the close-up. */
const arrowZoomedClass = computed(() => zoomed.value && 'eldra:invisible');
const prevClass = computed(() => [
  ARROW_BASE,
  'eldra:left-3',
  arrowZoomedClass.value,
  props.classes?.prev,
]);
const nextClass = computed(() => [
  ARROW_BASE,
  'eldra:right-3',
  arrowZoomedClass.value,
  props.classes?.next,
]);

/**
 * The zoom button sits in the stage's bottom-right corner, the arrows' circle with a dark fill so it
 * reads over a light photo too. It shows while the pointer is over the image (`hoverImage`), while
 * zoomed, while it has keyboard focus, and always on a device with no hover to reveal it.
 */
const zoomButtonClass = computed(() => [
  'eldra:absolute eldra:right-3 eldra:bottom-3 eldra:inline-flex eldra:size-11 eldra:cursor-pointer eldra:items-center',
  'eldra:justify-center eldra:rounded-full eldra:border eldra:text-background eldra:eldra-focus',
  'eldra:border-[color-mix(in_oklab,var(--eldra-color-background)_70%,transparent)]',
  'eldra:bg-[color-mix(in_oklab,var(--eldra-color-text)_60%,transparent)]',
  'eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text)_80%,transparent)]',
  'eldra:transition-opacity eldra:duration-fast eldra:ease-out eldra:motion-reduce:transition-none',
  hoverStage.value || zoomed.value
    ? 'eldra:opacity-100'
    : 'eldra:opacity-0 eldra:focus-visible:opacity-100 eldra:[@media(hover:none)]:opacity-100',
  props.classes?.zoomButton,
]);

const thumbnailsClass = computed(() => [
  'eldra:flex eldra:shrink-0 eldra:items-center eldra:justify-center eldra:gap-2 eldra:overflow-x-auto eldra:px-4 eldra:pt-2 eldra:pb-4',
  props.classes?.thumbnails,
]);

/** The strip is a scroll container, so it clips anything drawn outside a tile's box: `pt-2` above
 *  gives the current tile's 2px outline + 2px offset room at the top (`pb-4` already covers the
 *  bottom).
 *
 *  Spec "Variants" → "With thumbnails": "Carousel dots styled as small images … 'Go to slide n'
 *  with `aria-current="true"` on the current one" — the selection ring is this package's own
 *  visual choice (the spec names no size/state table for thumbnails), a light `outline` that reads
 *  against the dark ground the same way the focus ring does. */
const thumbnailClass = computed(() => [
  'eldra:inline-flex eldra:size-12 eldra:shrink-0 eldra:cursor-pointer eldra:overflow-hidden eldra:rounded-sm eldra:opacity-60 eldra:eldra-focus',
  'eldra:hover:opacity-100',
  'eldra:aria-[current=true]:opacity-100 eldra:aria-[current=true]:outline-2 eldra:aria-[current=true]:outline-background eldra:aria-[current=true]:outline-offset-2',
  props.classes?.thumbnail,
]);
</script>

<template>
  <dialog
    ref="dialogEl"
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :class="rootClass"
    :aria-label="ariaLabel"
    @keydown="onViewerKeydown"
    @cancel="onViewerCancel"
  >
    <div ref="rootRef" data-part="panel" :class="panelClass">
      <div :class="barClass">
        <span v-if="!single" data-part="counter" aria-hidden="true" :class="counterClass">
          {{ m.counter(carouselIndex + 1, count) }}
        </span>
        <span v-else />
        <button
          ref="closeButtonEl"
          type="button"
          data-part="close"
          :class="closeClass"
          :aria-label="m.closeLightbox"
          @click="onCloseClick"
        >
          <svg
            class="eldra:size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M18 6l-12 12" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div
        :class="stageClass"
        @pointerenter="onStagePointerenter"
        @pointerleave="onStagePointerleave"
      >
        <button
          v-if="!single"
          ref="prevButtonRef"
          type="button"
          data-part="prev"
          :class="prevClass"
          :disabled="!canPrev || zoomed"
          :aria-label="m.previousImage"
          @click="prev"
        >
          <svg
            class="eldra:size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M15 6l-6 6l6 6" />
          </svg>
        </button>

        <div
          ref="trackRef"
          data-part="track"
          tabindex="0"
          :aria-label="m.lightboxImages"
          aria-live="off"
          :class="trackClass"
          :style="TRACK_STYLE"
          :data-zoomed="zoomed ? 'true' : undefined"
          @click="onTrackClick"
          @pointerdown="onTrackPointerdown"
          @pointermove="onTrackPointermove"
          @pointerleave="onTrackPointerleave"
          @dragstart="onTrackDragstart"
        >
          <!-- The wrapper is always rendered — `useCarousel`'s own index/count math reads
               `trackRef.value.children.length`, and keeping that count constant across open/close
               means neither depends on the `MutationObserver` timing a v-if on the wrapper itself
               would introduce. Only the `<Image>` inside it — the element that actually carries a
               `src` — is gated on `model` (fix, Major finding: an eager `<img>` starts
               fetching the instant it is connected to the DOM, `display: none` on an ancestor
               `<dialog>` notwithstanding; a plain `<img>` is not "lazy" merely by sitting inside a
               closed dialog). Every slide stays `priority` (eager) once it exists — by definition
               that is only while the viewer is open, so there is no proximity heuristic to fight
               (the problem the original task's own screenshot-harness finding hit, when only the
               current slide was eager and the rest never left `loading="lazy"`'s own proximity
               heuristic) and no reason to delay any of them once the shopper can already see the
               current one. -->
          <div
            v-for="(img, i) in images"
            :key="`${img.src}-${i}`"
            :class="slideClass"
            :data-zoomed="zoomed && i === carouselIndex ? 'true' : undefined"
          >
            <Image
              v-if="model"
              data-part="image"
              :class="imageRootClass"
              :classes="{
                frame: imageFrameClass,
                media: imageMediaClass,
                caption: imageCaptionClass,
              }"
              :media="{ src: img.src, alt: img.alt, width: img.width, height: img.height }"
              :alt="img.alt"
              :caption="img.caption"
              ratio="auto"
              fit="contain"
              priority
            />
          </div>
        </div>

        <button
          v-if="!single"
          ref="nextButtonRef"
          type="button"
          data-part="next"
          :class="nextClass"
          :disabled="!canNext || zoomed"
          :aria-label="m.nextImage"
          @click="next"
        >
          <svg
            class="eldra:size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M9 6l6 6l-6 6" />
          </svg>
        </button>

        <!-- After the track, so it paints above a zoomed image without a z-index of its own. -->
        <button
          v-if="canZoom"
          type="button"
          data-part="zoomButton"
          :class="zoomButtonClass"
          :aria-label="zoomed ? m.lightboxZoomOut : m.lightboxZoomIn"
          @click="onZoomButtonClick"
        >
          <!-- Tabler's `zoom-in` / `zoom-out`. Decorative: the button is named by aria-label. -->
          <svg
            class="eldra:size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
            <path d="M7 10l6 0" />
            <path v-if="!zoomed" d="M10 7l0 6" />
            <path d="M21 21l-6 -6" />
          </svg>
        </button>
      </div>

      <div v-if="showThumbnails && model" data-part="thumbnails" :class="thumbnailsClass">
        <button
          v-for="(img, i) in images"
          :key="`thumb-${img.src}-${i}`"
          type="button"
          data-part="thumbnail"
          :class="thumbnailClass"
          :aria-current="i === carouselIndex ? 'true' : undefined"
          :aria-label="m.goToImage(i + 1)"
          @click="goTo(i)"
        >
          <Image :media="{ src: img.src, alt: '' }" decorative ratio="1x1" fit="cover" />
        </button>
      </div>
    </div>
  </dialog>
</template>
