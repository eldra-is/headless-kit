import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import type { CarouselPerViewBreakpoints } from './types';

/**
 * `true` under `prefers-reduced-motion: reduce`. Exported (not folded into `useCarousel` itself)
 * because two independent things read it: `useCarousel` below, to keep autoplay from ever
 * starting, and `Carousel.vue`, to scroll instantly instead of smoothly. `Lightbox` (which reuses
 * this whole module) reads the same signal for its own `←`/`→` stepping.
 *
 * `window.matchMedia` is guarded rather than assumed: this file has no DOM-environment
 * requirement of its own beyond what `useCarousel`'s own refs already need, and a node-environment
 * caller (there are none today, but nothing here should throw if one shows up) gets `false` — the
 * same "motion is fine" default an engine with no media query support would produce.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Normalises `CarouselProps['perView']` into the three breakpoint slots, `base` always present.
 * Exported so `Carousel.vue` and a future `Lightbox` share one reading of the prop rather than
 * two — a `Lightbox` slide is always full width regardless of container size, i.e. `{ base: 1 }`,
 * still expressed through the same shape.
 */
export function resolveCarouselPerView(
  perView: number | CarouselPerViewBreakpoints | undefined
): CarouselPerViewBreakpoints {
  if (perView === undefined) return { base: 1.25 };
  if (typeof perView === 'number') return { base: perView };
  return perView;
}

/**
 * The Tailwind classes that turn a resolved `perView` into the `--eldra-carousel-per-view`
 * variable `eldra-carousel-slide` reads (see `tailwind.css`'s own comment on that utility) — one
 * class for `base`, and one per breakpoint actually given. `@tablet`/`@content` are the package's
 * own 48rem/64rem container-query breakpoints (`Container`'s own gutter step reads the same two),
 * measured against the nearest `@container` ancestor, never the viewport — a `Carousel` inside a
 * narrow page-builder column keeps its mobile `perView` even on a wide screen.
 */
export function carouselPerViewClasses(
  perView: number | CarouselPerViewBreakpoints | undefined
): string {
  const resolved = resolveCarouselPerView(perView);
  const classes = [`[--eldra-carousel-per-view:${resolved.base}]`];
  if (resolved.md !== undefined) classes.push(`@tablet:[--eldra-carousel-per-view:${resolved.md}]`);
  if (resolved.lg !== undefined)
    classes.push(`@content:[--eldra-carousel-per-view:${resolved.lg}]`);
  return classes.join(' ');
}

export interface UseCarouselOptions {
  /** The carousel's own outer element, declared and bound to the template (`ref="rootRef"`) by
   *  the caller — the same shape `useDialog`'s own `dialog` option takes, so `<script setup>`'s
   *  template-ref detection (a local top-level `const x = ref(...)`) sees a real binding rather
   *  than a destructured one it cannot always type-check as "used". Hover, focus-within and
   *  tab-visibility pause autoplay while any of them hold, per spec "Carousel" → Behaviour &
   *  motion. */
  rootRef: Ref<HTMLElement | null>;
  /** The scrolling track, declared and bound the same way as `rootRef`. Its children are read
   *  directly (not through Vue's slot vnodes, which this composable never touches) so `count`,
   *  the per-slide `aria-label`s and the scroll math all agree with what the browser actually
   *  laid out. */
  trackRef: Ref<HTMLElement | null>;
  /** Milliseconds between automatic advances; `0`/`undefined` disables autoplay. */
  autoplay?: MaybeRefOrGetter<number | undefined>;
  /**
   * Formats a slide's accessible label from its 1-based position and the total (spec "Carousel" →
   * Accessibility: `aria-label="2 of 4"`). Defaults to that exact English shape so a caller with no
   * locale of its own still gets a real label; `Carousel.vue` passes `messages.value.slideOf`.
   */
  slideLabel?: MaybeRefOrGetter<(position: number, total: number) => string>;
  /** Extra class name(s) added to every slide alongside `eldra-carousel-slide` — `Carousel.vue`
   *  passes its own `classes.slide` here, so a consumer's per-part override reaches slides the
   *  same way `data-part="slide"` does, without this composable knowing about `classes` objects
   *  at all. */
  slideClass?: MaybeRefOrGetter<string | undefined>;
  /** Called after the current slide actually changes, with the new index — `Carousel`'s own
   *  `change` event. */
  onChange?: (index: number) => void;
}

export interface UseCarouselReturn {
  /** The current slide, 0-based — the slide whose start is closest to the track's scroll
   *  position, re-synced ~60ms after the last scroll event settles. */
  index: Ref<number>;
  /** The track's current child count, read from the live DOM. */
  count: Ref<number>;
  /** `false` at the track's start. */
  canPrev: ComputedRef<boolean>;
  /** `false` when the track's end is visible (including when nothing overflows at all). */
  canNext: ComputedRef<boolean>;
  /** Scrolls to a slide, clamped to `[0, count - 1]`. Instant under reduced motion. */
  goTo: (target: number) => void;
  next: () => void;
  prev: () => void;
  /** `ArrowLeft`/`ArrowRight` on the focused track — bind to the track's `keydown`. */
  onTrackKeydown: (event: KeyboardEvent) => void;
  /** The user's own toggle state — `true` unless `autoplay` is off, reduced motion is on, or the
   *  Pause button was pressed. Hovering/focusing the carousel halts the timer without flipping
   *  this (the button's own label reflects intent, not the momentary pause — see `Carousel.vue`). */
  playing: Ref<boolean>;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
}

/**
 * The scroll-snap carousel's behaviour: index tracking, previous/next/goTo, edge detection for
 * disabling the arrows, and autoplay with the spec's pause rules. `Carousel.vue` renders the
 * arrows/dots/counter/Pause markup around it; `Lightbox` reuses this file unchanged for its own
 * track.
 *
 * Deliberately DOM-first rather than slot-first: this package's other multi-child components
 * (`Tabs`, `Accordion`) read their children through Vue's own slot/registration mechanisms, but a
 * carousel's whole job is scroll geometry — `scrollLeft`, `offsetLeft`, `scrollWidth` — which only
 * exists once the browser has actually laid the slides out. Reading `trackRef.value.children`
 * directly means `count`, the index-from-scroll math and the per-slide labelling below all agree
 * with what is really on screen, however the slide markup got there (a plain `v-for`, a
 * conditionally rendered slide, a slide added by a parent that re-renders on its own schedule).
 */
export function useCarousel(options: UseCarouselOptions): UseCarouselReturn {
  const { rootRef, trackRef } = options;

  const index = ref(0);
  const count = ref(0);
  const atStart = ref(true);
  const atEnd = ref(true);

  const canPrev = computed(() => !atStart.value);
  const canNext = computed(() => !atEnd.value);

  function children(): HTMLElement[] {
    const track = trackRef.value;
    return track ? (Array.from(track.children) as HTMLElement[]) : [];
  }

  /**
   * Spec "Carousel" → Accessibility: "Gallery slides: `role="group" aria-roledescription="slide"
   * aria-label="2 of 4"`." Applied to every slide uniformly rather than only in the spec's own
   * "gallery" variant (recorded under Deviations in the README): `CarouselProps` carries nothing
   * that distinguishes a product row from a gallery, and the shared track this composable drives
   * needs one consistent labelling rule regardless of which block renders it.
   *
   * `role="group"` is skipped on an `<li>` — a product row's own slide element (spec: "Product
   * row slides are list items holding Product cards") — because ARIA's role-allowed-on-element
   * rules do not permit `group` there (`li`'s implicit `listitem` role is owned by its list
   * ancestor; axe's `aria-allowed-role` flags it, proven by mutation: removing this guard turns
   * every `<li>`-slide axe assertion in `carousel.spec.ts` red). `aria-roledescription` and the
   * "n of total" `aria-label` still apply — both are valid on an element that keeps its native
   * `listitem` role, so an `<li>` slide is still announced as "slide, 2 of 4", just without a
   * conflicting explicit role.
   */
  function annotate(): void {
    const track = trackRef.value;
    const kids = children();
    count.value = kids.length;
    const total = kids.length;
    const format = toValue(options.slideLabel) ?? ((n: number, t: number) => `${n} of ${t}`);
    const extraClass = toValue(options.slideClass);
    kids.forEach((child, i) => {
      child.setAttribute('data-part', 'slide');
      if (child.tagName !== 'LI') child.setAttribute('role', 'group');
      child.setAttribute('aria-roledescription', 'slide');
      child.setAttribute('aria-label', format(i + 1, total));
      child.classList.add('eldra-carousel-slide');
      if (extraClass) {
        for (const name of extraClass.split(/\s+/).filter(Boolean)) child.classList.add(name);
      }
    });
    // A product row's own `<li>` slides need a real (or ARIA) list ancestor — axe's `listitem`
    // rule flags an orphaned `<li>` otherwise. The track itself is always a plain `<div>`
    // regardless of slide markup (see `Carousel.vue`'s own comment), so it reasserts `role="list"`
    // itself whenever every slide happens to be an `<li>`, and drops it otherwise — a gallery's
    // `<figure>`/`<div>` slides carry `role="group"` above, and a `role="list"` ancestor over
    // `role="group"` children would be its own axe violation the other way round.
    if (track) {
      const allListItems = total > 0 && kids.every((child) => child.tagName === 'LI');
      if (allListItems) track.setAttribute('role', 'list');
      else track.removeAttribute('role');
    }
    if (total > 0 && index.value > total - 1) index.value = total - 1;
    updateEdges();
  }

  /**
   * Spec "Carousel" → Behaviour: "Previous is disabled when the track is at its start; next is
   * disabled when the track's end is visible." Real scroll geometry drives this whenever it
   * exists. Where it does not — `scrollWidth`/`clientWidth` both `0`, true of every element in a
   * layout-free test environment, and momentarily true of a real one before the first paint — the
   * index is the only honest signal, so edges fall back to it: disabled at the first/last slide.
   * `annotate()`/`goTo()` both call this immediately after changing `index`, so the fallback stays
   * right even where no real `scroll` event will ever fire to correct it.
   */
  function updateEdges(): void {
    const track = trackRef.value;
    if (!track) {
      atStart.value = true;
      atEnd.value = true;
      return;
    }
    if (track.scrollWidth <= 0 && track.clientWidth <= 0) {
      atStart.value = index.value <= 0;
      atEnd.value = index.value >= count.value - 1;
      return;
    }
    const maxScroll = track.scrollWidth - track.clientWidth;
    atStart.value = track.scrollLeft <= 1;
    atEnd.value = maxScroll <= 1 || track.scrollLeft >= maxScroll - 1;
  }

  function scrollToIndex(target: number): void {
    const track = trackRef.value;
    const child = children()[target];
    if (!track || !child || typeof track.scrollTo !== 'function') return;
    track.scrollTo({
      left: child.offsetLeft,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  function clampIndex(target: number): number {
    if (count.value === 0) return 0;
    return Math.min(Math.max(target, 0), count.value - 1);
  }

  /** Never loops — spec "Carousel" → Behaviour: arrows/dots disable at the ends rather than
   *  wrapping. Autoplay's own `tick()` below wraps instead, deliberately bypassing this. */
  function goTo(target: number): void {
    const clamped = clampIndex(target);
    if (clamped === index.value) {
      // Still worth a nudge: a caller pressing "next" at the end should not silently do nothing
      // to the scroll position if it has drifted (e.g. a resize changed how many slides fit).
      scrollToIndex(clamped);
      return;
    }
    index.value = clamped;
    scrollToIndex(clamped);
    updateEdges();
    options.onChange?.(clamped);
  }

  function next(): void {
    goTo(index.value + 1);
  }

  function prev(): void {
    goTo(index.value - 1);
  }

  function onTrackKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      prev();
    }
  }

  // --- Scroll-settle index sync (spec: "everything re-syncs after scrolling settles, about 60ms
  // after the last scroll event") -------------------------------------------------------------
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  function syncIndexFromScroll(): void {
    const track = trackRef.value;
    const kids = children();
    if (!track || kids.length === 0) return;
    let closest = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    kids.forEach((child, i) => {
      const distance = Math.abs(child.offsetLeft - track.scrollLeft);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = i;
      }
    });
    if (closest !== index.value) {
      index.value = closest;
      options.onChange?.(closest);
    }
  }

  function onScroll(): void {
    updateEdges();
    if (settleTimer !== undefined) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = undefined;
      syncIndexFromScroll();
    }, 60);
  }

  // --- Autoplay (spec "Carousel" → Behaviour & motion) ----------------------------------------
  const playing = ref(
    toValue(options.autoplay) !== undefined &&
      (toValue(options.autoplay) ?? 0) > 0 &&
      !prefersReducedMotion()
  );
  const hovered = ref(false);
  const focusedWithin = ref(false);
  const hidden = ref(typeof document !== 'undefined' && document.hidden);
  const suspended = computed(() => hovered.value || focusedWithin.value || hidden.value);

  function tick(): void {
    if (count.value <= 1) return;
    const nextIndex = (index.value + 1) % count.value;
    index.value = nextIndex;
    scrollToIndex(nextIndex);
    updateEdges();
    options.onChange?.(nextIndex);
  }

  let timer: ReturnType<typeof setInterval> | undefined;
  function armTimer(): void {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
    const ms = toValue(options.autoplay) ?? 0;
    if (playing.value && !suspended.value && ms > 0 && count.value > 1) {
      timer = setInterval(tick, ms);
    }
  }

  watch([playing, suspended, count, () => toValue(options.autoplay)], armTimer);

  function pause(): void {
    playing.value = false;
  }
  /**
   * Final review item 3/M3: `playing`'s own initial value already checks `prefersReducedMotion()`
   * ("autoplay never starts" — spec), but this — the `Play` button's own handler, via `toggle()`
   * below — did not, so a reduced-motion user who explicitly pressed `Play` got a running
   * slideshow the spec never intends this control to reach. Re-checking here, not only at
   * initialisation, closes that: `resume()` is a no-op under reduced motion regardless of what
   * called it.
   */
  function resume(): void {
    if ((toValue(options.autoplay) ?? 0) > 0 && !prefersReducedMotion()) playing.value = true;
  }
  function toggle(): void {
    if (playing.value) pause();
    else resume();
  }

  function onPointerEnter(): void {
    hovered.value = true;
  }
  function onPointerLeave(): void {
    hovered.value = false;
  }
  function onFocusIn(): void {
    focusedWithin.value = true;
  }
  function onFocusOut(event: FocusEvent): void {
    const root = rootRef.value;
    const related = event.relatedTarget as Node | null;
    if (!root || related === null || !root.contains(related)) focusedWithin.value = false;
  }
  function onVisibilityChange(): void {
    hidden.value = typeof document !== 'undefined' && document.hidden;
  }

  let observer: MutationObserver | undefined;
  let resizeObserver: ResizeObserver | undefined;

  onMounted(() => {
    annotate();

    const track = trackRef.value;
    if (track) {
      track.addEventListener('scroll', onScroll, { passive: true });
      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(annotate);
        observer.observe(track, { childList: true });
      }
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          updateEdges();
        });
        resizeObserver.observe(track);
      }
    }

    const root = rootRef.value;
    if (root) {
      root.addEventListener('pointerenter', onPointerEnter);
      root.addEventListener('pointerleave', onPointerLeave);
      root.addEventListener('focusin', onFocusIn);
      root.addEventListener('focusout', onFocusOut);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
  });

  onBeforeUnmount(() => {
    if (timer !== undefined) clearInterval(timer);
    if (settleTimer !== undefined) clearTimeout(settleTimer);
    observer?.disconnect();
    resizeObserver?.disconnect();
    const track = trackRef.value;
    track?.removeEventListener('scroll', onScroll);
    const root = rootRef.value;
    root?.removeEventListener('pointerenter', onPointerEnter);
    root?.removeEventListener('pointerleave', onPointerLeave);
    root?.removeEventListener('focusin', onFocusIn);
    root?.removeEventListener('focusout', onFocusOut);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  });

  return {
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
  };
}
