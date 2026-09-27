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
import { computed, nextTick, ref, watch } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useDialog } from '../../composables/useDialog';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import { carouselPerViewStyle, useCarousel } from '../carousel/useCarousel';
import Image from '../image/Image.vue';
import type { LightboxProps } from './types';

const props = withDefaults(defineProps<LightboxProps>(), {
  modelValue: undefined,
  index: 0,
  thumbnails: false,
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
  // ruling: "Lightbox inherits it through `useCarousel`"). Dragging on the stage moves
  // between images; the prev/next arrows and the thumbnail strip sit outside `trackRef`, so a
  // drag never reaches (and never needs to suppress a click on) either.
  draggable: true,
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
 * **without animation**, regardless of `prefers-reduced-motion` (operator ruling) — the spec's own
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
function onViewerKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    next();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    prev();
  }
}

/** So a consumer can close the viewer with its own action value from outside — the same mechanism
 *  `Dialog`/`Drawer` expose. */
defineExpose({ close, isTop });

const rootClass = computed(() =>
  partClass(
    cx(
      // Always the full viewport, at every width (spec "Sizes": "Viewer: the full viewport (inset
      // 0, 100% × 100%)"; "Mobile: The Lightbox is always full screen, at every width") — unlike
      // `Drawer`, which is genuinely windowed above a 48rem viewport, there is no windowed size
      // for this component to fall back to. See the README's Deviations entry for how this reads
      // against the design spec's own general "full-screen variants … apply below a 48rem
      // viewport" line, and `closeClass` below for the one measurement that actually does change
      // at that edge (the close button, exactly like `Drawer`'s own).
      //
      // `hidden open:block`, not bare (fix round 2, the operator's own finding — see `Dialog`'s own
      // rootClass comment for the full mechanism): without it a closed viewer still painted its
      // full-viewport ground, because an author `display` utility beats the UA's own `display: none`
      // for a closed `<dialog>` regardless of specificity. `open:block`, not `open:flex` like
      // `Drawer`'s/`SearchModal`'s own roots, for the identical reason `Dialog`'s own rootClass
      // comment documents: this root never carried `flex` before (its one `panel` child, already
      // `flex flex-col` internally, is sized by `w-full h-full`, not fit-content, so there is no
      // shrink-to-fit ambiguity for a flex container to resolve differently here — but `open:block`
      // costs nothing and keeps every modal root that never needed `flex` on the same, proven-safe
      // choice rather than two different justifications for the same fix).
      'hidden open:block fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 text-background',
      'backdrop:bg-overlay',
      'animate-eldra-lightbox-in motion-reduce:animate-eldra-dialog-in-reduced'
    ),
    props.classes,
    'root'
  )
);

/**
 * The viewer ground (spec "States": "Viewer ground: `text` at 94% (near-opaque ink) background;
 * text/icon: `background`") — an inverted, near-black fill the rest of the anatomy sits on. The
 * native `<dialog>`'s own `::backdrop` still gets `bg-overlay` above (package convention, every
 * modal surface), but this panel covers the entire dialog box, so the backdrop is never actually
 * seen (spec: "Backdrop: `overlay` (covered by the ground)").
 */
const panelClass = computed(() =>
  partClass(
    cx(
      'flex h-full w-full flex-col bg-[color-mix(in_oklab,var(--eldra-color-text)_94%,transparent)]'
    ),
    props.classes,
    'panel'
  )
);

const barClass =
  'flex shrink-0 items-center justify-between gap-4 px-4 py-3 text-body-sm text-background';

const counterClass = computed(() =>
  partClass('tabular-nums text-background', props.classes, 'counter')
);

/**
 * Spec "Sizes": "Close: 2.5rem ghost icon button, 2.75rem below 48rem" — the same viewport edge
 * `Drawer`'s own close button grows at (`size-10 max-md:size-11`, stock Tailwind, no custom
 * utility needed — see that component's own comment on why this needs no dedicated built-CSS
 * test). Rest/hover fills and the active press are the same ghost-icon recipe `Dialog`'s own close
 * button uses, inverted for the dark ground (`background`-token fills instead of `text`-token
 * ones) — the spec's own States table gives this component no separate active row, so the press
 * state is this package's own consistent addition, not a literal spec number.
 */
const closeClass = computed(() =>
  partClass(
    cx(
      'inline-flex size-10 max-md:size-11 shrink-0 cursor-pointer items-center justify-center rounded-sm',
      'text-background eldra-focus',
      'hover:bg-[color-mix(in_oklab,var(--eldra-color-background)_14%,transparent)]',
      'active:scale-[0.98] active:bg-[color-mix(in_oklab,var(--eldra-color-background)_20%,transparent)]'
    ),
    props.classes,
    'close'
  )
);

/** A plain layout wrapper, not a named part (the spec's own anatomy numbers the track/arrows
 *  together as one "stage"; see `Lightbox.vue`'s own file comment). `min-h-0` is what lets `track`
 *  actually scroll within the flex column rather than growing the whole panel. */
const stageClass = 'relative min-h-0 flex-1';

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
const trackClass = computed(() =>
  partClass(
    cx(
      'flex h-full touch-pan-x touch-pan-y cursor-grab snap-x snap-mandatory overflow-x-auto overscroll-x-contain',
      'scroll-smooth motion-reduce:scroll-auto eldra-scrollbar-hide eldra-focus',
      '[--eldra-focus-offset:4px] data-[dragging=true]:cursor-grabbing data-[dragging=true]:snap-none',
      'data-[dragging=true]:scroll-auto data-[dragging=true]:select-none',
      'eldra-carousel-track'
    ),
    props.classes,
    'track'
  )
);

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
const slideClass = computed(() => partClass('flex h-full px-16', props.classes, 'slide'));

/** The `<figure>` Image itself renders (given `caption`) — sized to fill the slide and centre its
 *  frame both ways, `flex-col` so the (`flex-1`) frame and the (`shrink-0`) caption stack. */
const imageRootClass = 'flex h-full w-full flex-col items-center';

const imageFrameClass = 'w-auto max-w-full flex-1 min-h-0 rounded-md';

/** Spec "Sizes": "Caption: 0.875rem, centred, padding 0.75rem 1rem 1rem" — overriding `Image`'s own
 *  default caption style (`text-caption text-muted mt-2`, sized/coloured for a light card ground)
 *  for this component's dark one. */
const imageCaptionClass = 'mt-0 shrink-0 px-4 pt-3 pb-4 text-center text-body-sm text-background';

/**
 * Spec "Sizes": "Arrows: 2.75rem circles, 1px outline, 0.75rem from the stage edges, centred
 * vertically." "Arrow, rest": transparent fill, `background`-at-70% border, `background` icon;
 * "hover": `background`-at-14% fill; "disabled": icon drops to 45% opacity while the *border* stays
 * put — so the dimming lives on `text-background/45` (the icon's own `currentColor`), never a
 * whole-button `opacity-*`, which would fade the border too.
 */
const ARROW_BASE = cx(
  'absolute top-1/2 inline-flex size-11 shrink-0 -translate-y-1/2 cursor-pointer items-center',
  'justify-center rounded-full border text-background eldra-focus',
  'border-[color-mix(in_oklab,var(--eldra-color-background)_70%,transparent)]',
  'hover:bg-[color-mix(in_oklab,var(--eldra-color-background)_14%,transparent)]',
  'disabled:cursor-not-allowed disabled:text-background/45',
  'disabled:hover:bg-transparent'
);
const prevClass = computed(() => partClass(cx(ARROW_BASE, 'left-3'), props.classes, 'prev'));
const nextClass = computed(() => partClass(cx(ARROW_BASE, 'right-3'), props.classes, 'next'));

const thumbnailsClass = computed(() =>
  partClass(
    'flex shrink-0 items-center justify-center gap-2 overflow-x-auto px-4 pt-2 pb-4',
    props.classes,
    'thumbnails'
  )
);

/** The strip is a scroll container, so it clips anything drawn outside a tile's box: `pt-2` above
 *  gives the current tile's 2px outline + 2px offset room at the top (`pb-4` already covers the
 *  bottom).
 *
 *  Spec "Variants" → "With thumbnails": "Carousel dots styled as small images … 'Go to slide n'
 *  with `aria-current="true"` on the current one" — the selection ring is this package's own
 *  visual choice (the spec names no size/state table for thumbnails), a light `outline` that reads
 *  against the dark ground the same way the focus ring does. */
const thumbnailClass = computed(() =>
  partClass(
    cx(
      'inline-flex size-12 shrink-0 cursor-pointer overflow-hidden rounded-sm opacity-60 eldra-focus',
      'hover:opacity-100',
      'aria-[current=true]:opacity-100 aria-[current=true]:outline-2 aria-[current=true]:outline-background aria-[current=true]:outline-offset-2'
    ),
    props.classes,
    'thumbnail'
  )
);
</script>

<template>
  <dialog
    ref="dialogEl"
    data-part="root"
    :class="rootClass"
    :aria-label="ariaLabel"
    @keydown="onViewerKeydown"
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
            class="size-4"
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

      <div :class="stageClass">
        <button
          v-if="!single"
          ref="prevButtonRef"
          type="button"
          data-part="prev"
          :class="prevClass"
          :disabled="!canPrev"
          :aria-label="m.previousImage"
          @click="prev"
        >
          <svg
            class="size-5"
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
        >
          <!-- The wrapper is always rendered — `useCarousel`'s own index/count math reads
               `trackRef.value.children.length`, and keeping that count constant across open/close
               means neither depends on the `MutationObserver` timing a v-if on the wrapper itself
               would introduce. Only the `<Image>` inside it — the element that actually carries a
               `src` — is gated on `model` (fix round 1, Major finding: an eager `<img>` starts
               fetching the instant it is connected to the DOM, `display: none` on an ancestor
               `<dialog>` notwithstanding; a plain `<img>` is not "lazy" merely by sitting inside a
               closed dialog). Every slide stays `priority` (eager) once it exists — by definition
               that is only while the viewer is open, so there is no proximity heuristic to fight
               (the problem the original task's own screenshot-harness finding hit, when only the
               current slide was eager and the rest never left `loading="lazy"`'s own proximity
               heuristic) and no reason to delay any of them once the shopper can already see the
               current one. -->
          <div v-for="(img, i) in images" :key="`${img.src}-${i}`" :class="slideClass">
            <Image
              v-if="model"
              data-part="image"
              :class="imageRootClass"
              :classes="{ frame: imageFrameClass, caption: imageCaptionClass }"
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
          :disabled="!canNext"
          :aria-label="m.nextImage"
          @click="next"
        >
          <svg
            class="size-5"
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
      </div>

      <div v-if="thumbnails && !single && model" data-part="thumbnails" :class="thumbnailsClass">
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
