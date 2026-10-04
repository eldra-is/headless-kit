<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { useUiId } from '../../utils/id';
import { useMessages } from '../../composables/useMessages';
import { carouselPerViewStyle, useCarousel } from './useCarousel';
import type { CarouselProps } from './types';

const props = withDefaults(defineProps<CarouselProps>(), {
  perView: undefined,
  controls: 'header',
  dots: false,
  counter: false,
  autoplay: 0,
  draggable: true,
  classes: undefined,
});

const emit = defineEmits<{
  /** Spec "Carousel" → Events: "`change`: fires with the new current index when the visible slide
   *  changes." */
  change: [index: number];
}>();

const messages = useMessages();

/** Spec "Carousel" → Properties, `autoplay` row: "Any non-zero value requires the Pause button,
 *  which is always rendered with it" — regardless of `controls`/`dots`/`counter` (WCAG 2.2.2). */
const showPause = computed(() => props.autoplay > 0);

/**
 * Declared locally and passed into `useCarousel` (rather than created and returned by it) — the
 * same shape `Dialog.vue`'s own `dialogEl`/`useDialog` pairing uses: a plain top-level `const x =
 * ref(...)` is what `<script setup>`'s template-ref wiring (`ref="rootRef"` below) recognises,
 * where a destructured property from a composable's return can leave `vue-tsc` unable to tell the
 * binding is read at all.
 */
const rootRef = ref<HTMLElement | null>(null);
const trackRef = ref<HTMLElement | null>(null);

const {
  index,
  count,
  canPrev,
  canNext,
  goTo,
  next,
  prev,
  trackFocusable,
  onTrackKeydown,
  focusItem,
  playing,
  pause,
  resume,
  toggle,
} = useCarousel({
  rootRef,
  trackRef,
  autoplay: () => props.autoplay,
  slideLabel: () => messages.value.slideOf,
  slideClass: () => props.classes?.slide,
  draggable: () => props.draggable,
  onChange: (value) => emit('change', value),
});

/**
 * The keyboard hint a shopper using a screen reader needs, rendered once per carousel and pointed
 * at by the **root's** own `aria-describedby` — so it is read when focus enters the carousel and
 * not again on every slide the arrow keys walk through (a description on each slide would repeat
 * the whole sentence twelve times across one product row).
 *
 * Only while the roving model is live (`trackFocusable === false`, i.e. some slide holds something
 * focusable): a single-slide gallery whose track is itself the one tab stop has nothing to move
 * "within", and both the paragraph and the reference to it are driven by the same condition, so
 * the attribute can never point at an id that is not in the document.
 */
const instructionsId = useUiId('carousel-instructions');

/**
 * Spec "Carousel" → Behaviour & motion: "If the focused arrow becomes disabled, focus moves to
 * the other arrow, so it's never stranded." Only one prev/next pair is ever mounted at a time —
 * `controls` picks the header row or the below row, never both — so one pair of refs covers
 * whichever markup branch is live.
 */
const prevButtonRef = ref<HTMLButtonElement | null>(null);
const nextButtonRef = ref<HTMLButtonElement | null>(null);

watch(canPrev, (can) => {
  if (!can && typeof document !== 'undefined' && document.activeElement === prevButtonRef.value) {
    nextButtonRef.value?.focus();
  }
});
watch(canNext, (can) => {
  if (!can && typeof document !== 'undefined' && document.activeElement === nextButtonRef.value) {
    prevButtonRef.value?.focus();
  }
});

/** Exposed for a caller that needs to drive autoplay from outside — the `Autoplay` story pauses
 *  on mount so its screenshot is never captured mid-transition (see that story's own comment). */
defineExpose({ pause, resume, toggle, playing, index, count, goTo, next, prev, focusItem });

const rootClass = computed(() =>
  partClass(cx('@container flex flex-col gap-4'), props.classes, 'root')
);

const headerClass = computed(() =>
  partClass(cx('flex items-center justify-between gap-4'), props.classes, 'header')
);

/** `sr-only` keeps the hint out of the layout entirely — absolutely positioned, so it is not a
 *  flex item of the root's own `flex-col gap-4` and adds no gap above the header. */
const instructionsClass = computed(() => partClass('sr-only', props.classes, 'instructions'));

/**
 * Spec "Carousel" → Sizes: "Track focus ring: the standard ring with a 4px `focus-inner` gap
 * (sits 4px outside the track)." `eldra-focus` reads `--eldra-focus-offset` for both the inner
 * infill and the outer ring's spread (see `tailwind.css`'s own "The one focus ring" comment); the
 * arbitrary-property class overrides just that one variable on this element, the same way a
 * consumer's own `classes.track` would, rather than a new utility duplicating the whole ring.
 * Reduced motion is `motion-reduce:scroll-auto` here, not a JS check, because CSS already knows
 * `prefers-reduced-motion` at paint time; `useCarousel`'s own `scrollToIndex` still checks it in
 * JavaScript for the *programmatic* scrolls (arrows, dots, autoplay) `scroll-behavior` alone does
 * not cover — see that file's own comment.
 *
 * `touch-pan-x touch-pan-y` (spec-adjacent, operator ruling; fixed 2026-09-26 — was `touch-pan-y`
 * alone). Tailwind's `touch-pan-*` utilities compose into one `touch-action` (each sets its own
 * `--tw-pan-*` variable, the declared property reads both), so this is `touch-action: pan-x
 * pan-y`, not "pan-y, then pan-x overriding it" — declaring only `pan-y` told the browser to
 * handle *just* vertical panning itself, which left a horizontal touch swipe producing pointer
 * events with nothing native to fall back on (the drag state machine above already bails out on
 * `pointerType === 'touch'`, deliberately leaving touch to the browser) — so touch swipe was dead.
 * `pan-x pan-y` hands both axes to native scroll-snap panning (one-finger vertical page scroll
 * still works, horizontal swipe now does too) while still omitting `pinch-zoom`, so pinch-to-zoom
 * stays disabled on the track. See the README's Deviations entry. `cursor-grab`/`-grabbing` and
 * the `data-[dragging=true]:snap-none:scroll-auto:select-none` group are the drag affordance and
 * the snap/smooth-scroll/selection suspension the pointer drag state machine drives (`useCarousel`'s
 * own comment on its `data-dragging` attribute and `setDocumentSelectionSuppressed`) — all stock
 * Tailwind utilities, the `cursor-*` pair gated on `draggable` so a `draggable: false` track shows
 * neither.
 *
 * **Fix (2026-10-04, operator report: a focused card's ring was clipped flat on the top, bottom and
 * outer edges, with only the inner edge toward its neighbour ever visible).** `overflow-x-auto`
 * forces `overflow-y` to compute `auto` too — a scroll container cannot mix `visible` with a
 * non-`visible` axis (CSSOM "Overflow") — so the track clipped every slide's own `eldra-focus` ring
 * (an outline/box-shadow pair drawn *outside* the slide's border box) at its own padding-box edge
 * on every side, and at its left/right edges for the first/last slide specifically. `p-[calc(...)]`
 * reserves exactly the ring's own reach and the matching `-m-[calc(...)]` pulls the track's box back
 * in by the same amount, so the track's rendered footprint — and every slide's position inside it,
 * the header's arrows included — is unchanged. The reach is `--eldra-focus-offset` plus
 * `--eldra-focus-width` (`tailwind.css`'s "The one focus ring"), not a literal `4px`/`p-1`: the
 * `[--eldra-focus-offset:4px]` override just above raises that variable for every descendant that
 * inherits it (plain custom properties inherit; every slide, and every focusable control inside one,
 * reads the track's 4px here instead of the token's own 2px), so a literal guess sized for the
 * default would still clip the ring by the same amount the override adds. `scroll-px-[...]`
 * keeps `scroll-snap-align: start` landing on each slide's own edge rather than the new padding in
 * front of it — without it the first slide snapped with that padding scrolled *past* the start,
 * clipping its outer ring all over again on the one axis the track actually scrolls.
 *
 * **The reservation is per axis, and the inline one is `max(bleed, reach)` (2026-10-04, second
 * operator report: at 1440px the first card's ring was still cut off flat on its *left* edge while
 * the top and right ones drew).** The first version wrote one uniform `p-[reach]`, and a block that
 * bleeds the track to the screen edge below 48rem (`blocks/product-carousel` in the starter) carries
 * its own `px-[gutter] … @tablet:px-0` through `classes.track`. `px-*` and `p-*` are different
 * `tailwind-merge` groups, so both survive the merge — and then `padding-inline` simply wins in the
 * cascade, because Tailwind emits every `padding-inline` rule *after* every `padding` one. The
 * measured result on the deployed site: `padding-top: 6px`, `padding-left: 0px`. A consumer could
 * not fix it on their side either, since the reach is the variable this element itself overrides.
 *
 * So the inline gutter is no longer a padding utility a consumer writes at all: a block sets
 * **`--eldra-carousel-bleed`** (per breakpoint if it likes — `[--eldra-carousel-bleed:1rem]
 * @tablet:[--eldra-carousel-bleed:0px]`) and the three inline utilities here resolve to
 * `max(that, reach)` together, so the padding, the negative margin that cancels it and the scroll
 * padding can never fall out of step, and neither axis can be left below the ring's reach. A custom
 * property declaration shares a merge group with nothing, so the ring's own reservation survives any
 * `classes.track`. `max()` rather than `bleed + reach`: the bleed is the page gutter, the track is
 * already flush with the viewport edge at that width, and widening it by another 6px per side would
 * give the page a horizontal scrollbar — 1rem of gutter is itself more than enough room for a 6px
 * ring, and the `max()` is what still reserves the reach for a consumer whose gutter is smaller.
 */
const trackClass = computed(() =>
  partClass(
    cx(
      'relative flex touch-pan-x touch-pan-y gap-4 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-smooth',
      'motion-reduce:scroll-auto eldra-scrollbar-hide eldra-focus [--eldra-focus-offset:4px]',
      'py-[calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width))]',
      '-my-[calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width))]',
      'px-[max(var(--eldra-carousel-bleed,0px),calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width)))]',
      '-mx-[max(var(--eldra-carousel-bleed,0px),calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width)))]',
      'scroll-px-[max(var(--eldra-carousel-bleed,0px),calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width)))]',
      props.draggable && 'cursor-grab data-[dragging=true]:cursor-grabbing',
      'data-[dragging=true]:snap-none data-[dragging=true]:scroll-auto data-[dragging=true]:select-none',
      'eldra-carousel-track'
    ),
    props.classes,
    'track'
  )
);

/**
 * `perView` reaches the CSS as three inline custom properties, not as classes — see
 * `carouselPerViewStyle`'s own comment in `useCarousel.ts` for the bug that forced that (a class
 * name built by interpolating a number is never in the text Tailwind scans, so a consumer's build
 * emitted no rule and every carousel rendered one full-width slide). `eldra-carousel-track` in
 * `trackClass` above is the static CSS that reads them per container-query breakpoint.
 *
 * A `style` attribute on the consumer's side still wins: Vue merges a fallthrough `style` over a
 * bound one, and this is not on the root element anyway.
 */
const trackStyle = computed(() => carouselPerViewStyle(props.perView));

/** The arrow recipe (spec "Carousel" → Sizes/States): a 2.75rem (`size-11`) circle, 1px
 *  `border-strong`, `text` chevron, hovering to a `text` border and `surface` fill, 45% opacity
 *  and `not-allowed` at an end. Hand-rolled rather than `<Button icon-only>`: no `Button` size is
 *  2.75rem, and this shape (a full circle, not `radius-md`) is unique to this component. */
const ARROW_BASE =
  'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border ' +
  'border-border-strong bg-background text-text eldra-focus ' +
  'hover:border-text hover:bg-surface disabled:cursor-not-allowed disabled:opacity-45 ' +
  'disabled:hover:border-border-strong disabled:hover:bg-background';
const prevClass = computed(() => partClass(ARROW_BASE, props.classes, 'prev'));
const nextClass = computed(() => partClass(ARROW_BASE, props.classes, 'next'));

const dotsClass = computed(() => partClass('flex items-center', props.classes, 'dots'));
/** Spec "Carousel" → Sizes, Dot row: "1.5rem square target ... no gap between dot targets" — the
 *  target itself is a plain `size-6` button; `eldra-carousel-dot` (see `tailwind.css`) draws the
 *  visible ring/pill inside it. */
const dotClass = computed(() =>
  partClass(
    'inline-flex size-6 shrink-0 cursor-pointer items-center justify-center eldra-focus',
    props.classes,
    'dot'
  )
);

/** Spec "Carousel" → Sizes, Counter row: "0.875rem, tabular numbers, min-width 3.5rem, centred" —
 *  `text-body-sm` is already exactly 0.875rem/400 (see `tokens.css`); `min-w-14` is the stock
 *  spacing scale's 3.5rem. Accessibility: "`aria-hidden` (dots and slide labels already say it)". */
const counterClass = computed(() =>
  partClass('min-w-14 text-center text-body-sm text-muted tabular-nums', props.classes, 'counter')
);

/** Spec "Carousel" → Sizes, "Pause / Play" row: "small outline button (2rem tall)" — `Button`'s
 *  own `outline`/`sm` recipe (`control-h-sm` is 2rem), hand-rolled here for the same reason the
 *  arrows are: this is the one place in the component that could reuse `<Button>` byte for byte,
 *  but `data-part="pause"` needs to land on the actual rendered element, and forwarding it through
 *  `Button`'s own fallthrough attrs onto a root that already hard-codes `data-part="container"` is
 *  the kind of "does the parent's attr really win" question `ProductCard.vue`'s own comment had to
 *  verify empirically for `aria-label` — not worth relitigating for one static string here. */
const pauseClass = computed(() =>
  partClass(
    cx(
      'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border',
      'control-h-sm px-3 text-button-sm',
      'border-border-strong bg-background text-text eldra-focus hover:border-text hover:bg-surface'
    ),
    props.classes,
    'pause'
  )
);

const showBelowRow = computed(() => props.controls === 'below' || props.dots || showPause.value);
</script>

<template>
  <section
    ref="rootRef"
    data-part="root"
    :class="rootClass"
    aria-roledescription="carousel"
    :aria-label="ariaLabel"
    :aria-describedby="trackFocusable ? undefined : instructionsId"
  >
    <p
      v-if="!trackFocusable"
      :id="instructionsId"
      data-part="instructions"
      :class="instructionsClass"
    >
      {{ messages.slideInstructions }}
    </p>

    <div v-if="controls === 'header' || $slots.header" data-part="header" :class="headerClass">
      <slot name="header" />
      <div v-if="controls === 'header'" class="flex shrink-0 items-center gap-2">
        <span v-if="counter" data-part="counter" aria-hidden="true" :class="counterClass">
          {{ messages.counter(index + 1, count) }}
        </span>
        <button
          ref="prevButtonRef"
          type="button"
          data-part="prev"
          :class="prevClass"
          :disabled="!canPrev"
          :aria-label="messages.previous"
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
        <button
          ref="nextButtonRef"
          type="button"
          data-part="next"
          :class="nextClass"
          :disabled="!canNext"
          :aria-label="messages.next"
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
    </div>

    <!-- The track's own children are the default slot's content, unwrapped: `useCarousel`
         annotates whatever real DOM elements land here (see its own comment) rather than this
         component cloning slot vnodes, so a consumer's `<li>`/`<figure>`/component root becomes
         the slide directly — `data-part="slide"`, the roving `tabindex` and all.

         `tabindex` only while no slide holds anything focusable (`trackFocusable`): the track is
         then the carousel's one tab stop and `←`/`→` step it, which is the spec's own "Track:
         `tabindex="0"`" case and the `Lightbox` stage's ("Stage / track … focusable"). A product
         row, a testimonial row, a linked hero figure — anything whose slides hold a link or a
         button — moves that one stop onto the active slide instead, so `Tab` does not stop twice
         for one carousel (spec "Keyboard": "Composite widgets … take one tab stop and use arrow
         keys inside"). `useCarousel`'s own `syncFocusModel` carries the rule; see the README. -->
    <div
      ref="trackRef"
      data-part="track"
      :tabindex="trackFocusable ? 0 : undefined"
      :aria-label="messages.slides"
      aria-live="off"
      :class="trackClass"
      :style="trackStyle"
      @keydown="onTrackKeydown"
    >
      <slot />
    </div>

    <div v-if="showBelowRow" class="flex items-center justify-between gap-4">
      <button
        v-if="showPause"
        type="button"
        data-part="pause"
        :class="pauseClass"
        :aria-label="playing ? messages.pause : messages.play"
        @click="toggle"
      >
        {{ playing ? messages.pause : messages.play }}
      </button>
      <span v-else />

      <div v-if="dots" data-part="dots" :class="dotsClass">
        <button
          v-for="dotNumber in count"
          :key="dotNumber"
          type="button"
          data-part="dot"
          :class="dotClass"
          :aria-current="dotNumber - 1 === index ? 'true' : undefined"
          :aria-label="messages.goToSlide(dotNumber)"
          @click="goTo(dotNumber - 1)"
        >
          <span class="eldra-carousel-dot" />
        </button>
      </div>
      <span v-else />

      <div v-if="controls === 'below'" class="flex shrink-0 items-center gap-2">
        <button
          ref="prevButtonRef"
          type="button"
          data-part="prev"
          :class="prevClass"
          :disabled="!canPrev"
          :aria-label="messages.previous"
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
        <span v-if="counter" data-part="counter" aria-hidden="true" :class="counterClass">
          {{ messages.counter(index + 1, count) }}
        </span>
        <button
          ref="nextButtonRef"
          type="button"
          data-part="next"
          :class="nextClass"
          :disabled="!canNext"
          :aria-label="messages.next"
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
      <span v-else />
    </div>
  </section>
</template>
