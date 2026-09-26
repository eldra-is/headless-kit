<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { useMessages } from '../../composables/useMessages';
import { carouselPerViewClasses, useCarousel } from './useCarousel';
import type { CarouselProps } from './types';

const props = withDefaults(defineProps<CarouselProps>(), {
  perView: undefined,
  controls: 'header',
  dots: false,
  counter: false,
  autoplay: 0,
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
  onTrackKeydown,
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
  onChange: (value) => emit('change', value),
});

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
defineExpose({ pause, resume, toggle, playing, index, count, goTo, next, prev });

const rootClass = computed(() =>
  partClass(cx('@container flex flex-col gap-4'), props.classes, 'root')
);

const headerClass = computed(() =>
  partClass(cx('flex items-center justify-between gap-4'), props.classes, 'header')
);

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
 */
const trackClass = computed(() =>
  partClass(
    cx(
      'flex gap-4 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-smooth',
      'motion-reduce:scroll-auto eldra-scrollbar-hide eldra-focus [--eldra-focus-offset:4px]',
      carouselPerViewClasses(props.perView)
    ),
    props.classes,
    'track'
  )
);

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
  >
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
         the slide directly — `data-part="slide"` and all. -->
    <div
      ref="trackRef"
      data-part="track"
      tabindex="0"
      :aria-label="messages.slides"
      aria-live="off"
      :class="trackClass"
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
