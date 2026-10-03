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
import { prefersReducedMotion } from '../../utils/cssTiming';
import type { CarouselPerViewBreakpoints } from './types';

/**
 * `true` under `prefers-reduced-motion: reduce`. Defined in `src/utils/cssTiming.ts` and
 * re-exported here, which is where this package's public entry has always taken it from: three
 * independent things in this module's own family read it (`useCarousel` below, to keep autoplay
 * from ever starting; `Carousel.vue`, to scroll instantly instead of smoothly; `Lightbox`, which
 * reuses this whole module, for its own `←`/`→` stepping), and the package's two JavaScript
 * animations read it from the util directly.
 */
export { prefersReducedMotion } from '../../utils/cssTiming';

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
 * The three custom properties that carry a resolved `perView` to the CSS, bound as an **inline
 * style** on the track: `--eldra-carousel-per-view-base`, `-md` and `-lg`. The `eldra-carousel-
 * track` utility (`tailwind.css`, "Carousel") is what reads them and picks one per container-query
 * breakpoint into `--eldra-carousel-per-view`, which `eldra-carousel-slide`'s width formula reads.
 *
 * **Why a style and not a class (bug, fixed 2026-09-27 — see the README's Deviations entry and the
 * CHANGELOG).** This used to return interpolated Tailwind arbitrary-property classes
 * (`` `[--eldra-carousel-per-view:${resolved.base}]` ``, plus `@tablet:`/`@content:` steps). Those
 * work in this package's own Storybook only by accident: Tailwind has no runtime: it *scans source
 * text* for class names, and a template literal's interpolated value is never in the text it
 * scans. A consumer's build (`@import '@eldrajs/ui/tailwind.css'`, whose `@source './'` scans
 * `dist/*.js`) therefore emitted no rule for any of them, so `--eldra-carousel-per-view` was never
 * set at all, `eldra-carousel-slide` fell back to its own `1`, and every carousel in the built
 * starter rendered one full-width slide — testimonials, product-carousel, the `split-carousel` hero
 * and the `carousel` gallery all at once. An inline style needs no scanner, so the compiled CSS
 * stays entirely static (three literal container-query rules in `tailwind.css`) while the numbers
 * stay fully dynamic.
 *
 * Every slot is always written, resolved narrowest-first (`md` falls back to `base`, `lg` to `md`),
 * so the breakpoint steps hold even for a caller that gives only some of them — the `var()`
 * fallback chain in `eldra-carousel-track` says the same thing a second time, for a consumer who
 * sets one of these properties by hand.
 *
 * The breakpoints themselves are the package's own 48rem/64rem container-query edges
 * (`Container`'s own gutter step reads the same two), measured against the nearest `@container`
 * ancestor — the `Carousel` root — never the viewport, so a `Carousel` inside a narrow
 * page-builder column keeps its mobile `perView` even on a wide screen.
 */
export function carouselPerViewStyle(
  perView: number | CarouselPerViewBreakpoints | undefined
): Record<string, string> {
  const resolved = resolveCarouselPerView(perView);
  const md = resolved.md ?? resolved.base;
  const lg = resolved.lg ?? md;
  return {
    '--eldra-carousel-per-view-base': String(resolved.base),
    '--eldra-carousel-per-view-md': String(md),
    '--eldra-carousel-per-view-lg': String(lg),
  };
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
  /**
   * Enables mouse/pen pointer drag on the track (operator ruling: "the carousel should
   * be draggable/swipeable"). Touch already swipes for free through native scroll-snap — this
   * only adds the equivalent for a pointer type that has no native swipe gesture of its own.
   * Defaults to `true` when omitted, which is what `Lightbox` relies on: it passes no option of
   * its own and still drags, per the same ruling ("Lightbox inherits it through `useCarousel`").
   * `Carousel.vue` exposes this as its own `draggable` prop, default `true`.
   */
  draggable?: MaybeRefOrGetter<boolean | undefined>;
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
   * A slide's start as a scroll position of the track. `offsetLeft` is measured from the
   * `offsetParent`, which is the track itself (it is positioned) — but a consumer's `classes.track`
   * override can drop that positioning, and then every slide reports its distance from some outer
   * ancestor instead, shifted by the track's own offset. Comparing such values with `scrollLeft`
   * made "closest slide" pick the previous one after every snap (the counter read 1 / 6 while the
   * track sat on slide 2) and `scrollTo` overshoot by the same amount, so the offset is removed here
   * whenever the slide's `offsetParent` is not the track.
   */
  function slideStart(child: HTMLElement, track: HTMLElement): number {
    return child.offsetParent === track ? child.offsetLeft : child.offsetLeft - track.offsetLeft;
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
      left: slideStart(child, track),
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

  /**
   * The slide whose `offsetLeft` sits closest to a given scroll position — "current index is the
   * slide whose start is closest to the track's scroll position" (spec "Carousel" → Behaviour).
   * Shared by the scroll-settle sync below and by the pointer-drag release handler further down,
   * which needs the exact same "closest slide to *this* scroll position" question answered for
   * wherever the drag let go, not only for wherever a real `scroll` event last settled.
   */
  function closestChildIndex(scrollLeft: number): number {
    const kids = children();
    const track = trackRef.value;
    if (kids.length === 0 || !track) return 0;
    let closest = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    kids.forEach((child, i) => {
      const distance = Math.abs(slideStart(child, track) - scrollLeft);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = i;
      }
    });
    return closest;
  }

  // --- Scroll-settle index sync (spec: "everything re-syncs after scrolling settles, about 60ms
  // after the last scroll event") -------------------------------------------------------------
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  function syncIndexFromScroll(): void {
    const track = trackRef.value;
    if (!track || children().length === 0) return;
    const closest = closestChildIndex(track.scrollLeft);
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
  /** `true` for the span of an actual pointer drag (past the 6px threshold, see the drag state
   *  machine below) — not merely a `pointerdown` that never moved. Folded into `suspended` the
   *  same way `hovered`/`focusedWithin` are, rather than calling `pause()`: a drag is a momentary
   *  interruption, not the shopper asking to stop the slideshow, so the Pause/Play button's own
   *  label must not flip (operator ruling: "autoplay pauses during a drag and resumes
   *  after"). */
  const dragging = ref(false);
  const suspended = computed(
    () => hovered.value || focusedWithin.value || hidden.value || dragging.value
  );

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

  // --- Pointer drag (operator ruling) ------------------------------------------------
  //
  // Touch already swipes the track for free through native scroll-snap (spec "Carousel" →
  // Behaviour & motion: "Scrolling is native: touch, trackpad and shift-wheel all work"); this
  // only teaches mouse/pen — pointer types with no native swipe gesture of their own — the same
  // trick. State machine, one pointer at a time (`dragPointerId`):
  //
  //   pointerdown (primary button, mouse/pen, not on an editable/range control or an explicit
  //   `data-no-drag` opt-out — see `isNoDragTarget`)
  //     -> remember the start position; not yet "dragging", and pointer capture is NOT requested
  //        yet either (see the threshold branch below for why). Operator fix (2026-09-26, round 2):
  //        "we are not able to drag on a card, we have to place the cursor between cards" — a
  //        slide's own link/button (a `ProductCard`'s stretched title link covers the whole card) is
  //        tracked exactly like the track's bare background now; the previous round's blanket
  //        bail-out on any interactive descendant is what caused the complaint. This never calls
  //        `preventDefault()` — see `onTrackPointerDown`'s own comment for why keeping the
  //        pointerdown's native effect (focus, the eventual click) matters.
  //   pointermove, |dx| < 6px
  //     -> still not dragging: `scrollLeft` is untouched, nothing was prevented, and the pointer is
  //        not captured, so a plain click or tap-to-focus on whatever the gesture started over still
  //        lands exactly as if this file did not exist (ruling: "the click stays functional").
  //   pointermove, |dx| >= 6px (first time)
  //     -> now dragging: `data-dragging="true"` goes on the track (the CSS this attribute
  //        drives — `data-[dragging=true]:snap-none:scroll-auto:select-none`/`:cursor-grabbing` —
  //        lives in `Carousel.vue` and `Lightbox.vue`, not here; this file only ever sets/clears
  //        the attribute), `document.documentElement`'s own `user-select` (the pointer can leave
  //        the track mid-drag, where the track's own `select-none` no longer reaches), the pointer
  //        is captured only now — not at `pointerdown` — because a mouse pointer's capture
  //        retargets its eventual `click` to the capturing element too, which broke a plain,
  //        never-moved click on a link/button before this was deferred (see this branch's own
  //        in-line comment), and any text selection the native `mousedown` already anchored is
  //        cleared (`window.getSelection()?.removeAllRanges()` — the pointerdown was never
  //        prevented, so a press over selectable text starts a selection anchor the instant the
  //        button goes down, before any `pointermove` fires at all; this is the moment the gesture
  //        commits to being a drag rather than a click, so it is also the moment that anchor stops
  //        being wanted). Autoplay suspends via `dragging` above, and every subsequent move drags
  //        `scrollLeft` 1:1 with the pointer.
  //   pointerup / pointercancel / lostpointercapture
  //     -> if it was dragging: release the pointer, clear the attribute and the documentElement
  //        `user-select` override, force a reflow so the class change is in effect before the
  //        release snap starts (operator fix, 2026-09-26: `scroll-smooth` fighting the drag's own
  //        `scrollLeft` writes — see `endTrackDrag`'s own comment), arm `suppressNextClick` (the
  //        click a mouse drag always fires on release must not reach whatever was under the
  //        pointer — the *only* thing that ever cancels that click; a drag that never crossed the
  //        threshold arms nothing, so an ordinary click or link navigation is untouched), then
  //        `goTo()` the release position's nearest slide, nudged one further by a fast flick (see
  //        `endDrag` below) — never past `[0, count - 1]`, `goTo`'s own clamp. If it never crossed
  //        the threshold: nothing to undo, the browser's own click just happens. `lostpointercapture`
  //        is treated identically to `pointercancel` (see `onTrackLostPointerCapture`'s own comment
  //        below) — capture can be lost with no preceding `pointerup`/`pointercancel` at all, and
  //        without this branch the drag state would stay stuck.
  const DRAG_THRESHOLD_PX = 6;
  const FLICK_VELOCITY_PX_MS = 0.5;

  function draggableEnabled(): boolean {
    const value = toValue(options.draggable);
    return value === undefined ? true : value;
  }

  /**
   * Operator ruling (2026-09-26, round 2): a drag may start on *any* pointer press inside the
   * track — buttons and links included — except an editable or range control (typing/selecting a
   * value must never be hijacked into a swipe) or an element an author has explicitly opted out
   * with `data-no-drag`. `input` alone already covers `input[type="range"]`; both are named here
   * because the ruling names both. Renamed from the previous round's `isInteractiveDescendant`,
   * which this replaces rather than narrows — that function refused *every* link/button, which is
   * the exact behaviour the operator reported as broken ("we have to place the cursor between
   * cards").
   */
  function isNoDragTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return (
      target.closest(
        'input, textarea, select, [contenteditable], input[type="range"], [data-no-drag]'
      ) !== null
    );
  }

  /**
   * Toggles `document.documentElement`'s own `user-select` for the drag's span (called from
   * `onTrackPointerMove` once the 6px threshold crosses, restored in `endTrackDrag`) — the pointer
   * can leave the track mid-drag, past where the track's own `data-[dragging=true]:select-none`
   * reaches. This alone stops a selection from *visibly extending* as the pointer keeps moving, but
   * it does not undo an anchor the browser already started at `mousedown` before the threshold ever
   * crossed (operator fix, 2026-09-26: "while dragging we are highlighting stuff") — see
   * `onTrackPointerMove`'s own `window.getSelection()?.removeAllRanges()` call for the other half of
   * that fix. Both together replace round one's approach of calling `preventDefault()` on every
   * qualifying `pointerdown`, which stopped the selection anchor from ever starting but also broke
   * native focus/click on the very targets this fix now needs to keep working — see
   * `onTrackPointerDown`'s own comment for why that no longer happens.
   */
  function setDocumentSelectionSuppressed(suppressed: boolean): void {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.style.userSelect = suppressed ? 'none' : '';
  }

  let dragPointerId: number | null = null;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;
  let dragCrossedThreshold = false;
  // The last two pointermove samples (position + `event.timeStamp`), used only to compute the
  // release velocity — the *instantaneous* speed of the final movement, not the average speed of
  // the whole gesture, which is what lets a slow drag ending in a fast flick still count as one
  // (spec ruling: "a fast flick of > 0.5 px/ms advances one slide in the flick direction").
  let dragSampleX = 0;
  let dragSampleT = 0;
  let dragPrevSampleX = 0;
  let dragPrevSampleT = 0;
  let suppressNextClick = false;

  function onTrackPointerDown(event: PointerEvent): void {
    if (!draggableEnabled()) return;
    if (event.pointerType === 'touch') return;
    if (event.button !== 0) return;
    if (isNoDragTarget(event.target)) return;
    const track = trackRef.value;
    if (!track) return;
    // Operator fix (2026-09-26, round 2): unlike the previous round, this deliberately does NOT
    // call `preventDefault()` — the ruling is explicit: "Do NOT preventDefault() the pointerdown
    // (keep native focus/click behaviour)". A pointer press that reaches this point may still turn
    // out to be nothing more than a click or a focus move on a slide's own button/link (below the
    // 6px threshold, see `onTrackPointerMove`), and preventing the pointerdown's default would have
    // suppressed exactly that. Whatever native effect a real drag's `mousedown` incidentally starts
    // (a text-selection anchor) is cleaned up once, only once the gesture actually crosses the
    // threshold — see `onTrackPointerMove` and `setDocumentSelectionSuppressed`'s own comments.
    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartScrollLeft = track.scrollLeft;
    dragCrossedThreshold = false;
    dragSampleX = event.clientX;
    dragSampleT = event.timeStamp;
    dragPrevSampleX = event.clientX;
    dragPrevSampleT = event.timeStamp;
    // Pointer capture is deliberately NOT requested here — see `onTrackPointerMove`'s own comment,
    // where it is requested instead, for why capturing on every qualifying pointerdown broke a
    // plain click on a slide's own link/button.
  }

  function onTrackPointerMove(event: PointerEvent): void {
    if (dragPointerId === null || event.pointerId !== dragPointerId) return;
    const track = trackRef.value;
    if (!track) return;
    const dx = event.clientX - dragStartX;
    if (!dragCrossedThreshold) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      dragCrossedThreshold = true;
      dragging.value = true;
      track.setAttribute('data-dragging', 'true');
      setDocumentSelectionSuppressed(true);
      /**
       * Real-browser-only bug, caught by `scripts/drag-smoke.mjs` (a real Chromium, not
       * happy-dom — the unit specs dispatch `click` directly and so never exercise real capture
       * semantics): a mouse-type pointer's capture retargets its `click` event to the *capturing*
       * element too, not only `pointermove`/`pointerup` — proven with a minimal Playwright repro
       * outside this file before landing the fix here. Requesting capture unconditionally on every
       * qualifying `pointerdown` (this round's first pass) meant a plain click on a slide's own
       * link/button — even one that never moved at all — fired with `event.target` retargeted to
       * the track instead of the link, so the browser's own default action (the link's navigation)
       * had nothing to act on: the ruling's "the click stays functional" broke for *every* click in
       * the carousel, not only ones that followed a drag. Requesting capture here instead — the
       * gesture is already a confirmed drag by this line — means a sub-threshold press never
       * captures at all, so its `click` keeps the real link/button as its target and the browser's
       * own default runs untouched; a real drag's own release `click`, deliberately cancelled below
       * by `onTrackClickCapture` regardless of which element it nominally targets, is unaffected.
       */
      if (typeof track.setPointerCapture === 'function') {
        try {
          track.setPointerCapture(event.pointerId);
        } catch {
          // A pointer capture request can be refused (or throw, in some test environments) with no
          // effect on the gesture itself — capture is only an enhancement that keeps pointermove
          // arriving if the cursor leaves the track's own bounds mid-drag, not a requirement.
        }
      }
      // The other half of the operator fix (round 2): `onTrackPointerDown` no longer prevents the
      // pointerdown's default, so a press over selectable text has already anchored a native
      // selection by the time a real drag is confirmed here. Clearing it the instant the gesture
      // commits to being a drag (not on every pointerdown, which would also fire for a press that
      // turns out to be a plain click) is what round one's `preventDefault()` used to buy for free.
      // Guarded the same way `setDocumentSelectionSuppressed` guards `document`: `window` itself can
      // be absent (SSR), `getSelection` can be missing on it (a bare test environment), and the call
      // itself can still return `null` per spec.
      if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
        window.getSelection()?.removeAllRanges();
      }
    }
    event.preventDefault();
    track.scrollLeft = dragStartScrollLeft - dx;
    dragPrevSampleX = dragSampleX;
    dragPrevSampleT = dragSampleT;
    dragSampleX = event.clientX;
    dragSampleT = event.timeStamp;
  }

  function endTrackDrag(event: PointerEvent): void {
    if (dragPointerId === null || event.pointerId !== dragPointerId) return;
    const track = trackRef.value;
    if (track && typeof track.releasePointerCapture === 'function') {
      const stillCaptured =
        typeof track.hasPointerCapture !== 'function' || track.hasPointerCapture(dragPointerId);
      if (stillCaptured) {
        try {
          track.releasePointerCapture(dragPointerId);
        } catch {
          // Already released (e.g. by the browser itself on pointercancel).
        }
      }
    }
    const wasDragging = dragCrossedThreshold;
    dragPointerId = null;
    dragCrossedThreshold = false;
    if (!wasDragging || !track) {
      setDocumentSelectionSuppressed(false);
      return;
    }
    dragging.value = false;
    track.removeAttribute('data-dragging');
    setDocumentSelectionSuppressed(false);
    // Operator fix (2026-09-26): "swiping/dragging ... starts and then kind of cancels." The track
    // keeps `scroll-smooth` at rest, so every `track.scrollLeft = …` write during the drag above
    // (real, instant assignments) was starting a smooth-scroll animation the *next* write then
    // interrupted — `data-[dragging=true]:scroll-auto` (`Carousel.vue`/`Lightbox.vue`'s own
    // `trackClass`) is what turns that off for the drag's duration, matched by `snap-none` so
    // scroll-snap does not fight the raw `scrollLeft` writes either. Removing `data-dragging` above
    // already flips both back on for the CSSOM, but nothing has forced the browser to recompute
    // style from that change yet — reading a layout property does, synchronously — which is what
    // makes the `goTo()` call below actually animate instead of either jumping instantly (still
    // reading the just-removed `scroll-auto`) or fighting the drag's own last write (still mid an
    // interrupted smooth scroll from before this line).
    void track.offsetWidth;
    // The mouse's own `click`, firing right after this `pointerup`, must not reach whatever was
    // under the cursor at release — `onTrackClickCapture` below consumes exactly one.
    suppressNextClick = true;
    const elapsed = dragSampleT - dragPrevSampleT;
    const velocity = elapsed > 0 ? (dragSampleX - dragPrevSampleX) / elapsed : 0;
    let target = closestChildIndex(track.scrollLeft);
    // Pointer moving right (`velocity > 0`) drags the track's content right, i.e. *toward* the
    // previous slide (`scrollLeft` falls); moving left does the opposite. A flick past the 0.5
    // px/ms line nudges one slide further than the release position alone would land on, in
    // that same direction — proven by mutation: dropping this `if`/`else if` pair leaves the
    // "flick advances" spec red (it lands on the merely-nearest slide instead of one further).
    if (velocity > FLICK_VELOCITY_PX_MS) target -= 1;
    else if (velocity < -FLICK_VELOCITY_PX_MS) target += 1;
    goTo(target);
  }

  function onTrackPointerUp(event: PointerEvent): void {
    endTrackDrag(event);
  }
  function onTrackPointerCancel(event: PointerEvent): void {
    endTrackDrag(event);
  }
  /**
   * Review t15-M1: capture can be lost with no preceding `pointerup`/`pointercancel` — another
   * element calling `setPointerCapture` for the same pointer, the OS/browser revoking it (an
   * edge-swipe gesture, a system UI interruption), or the captured element becoming disabled.
   * Without this, `endTrackDrag` never runs in that case: `dragging.value` stays `true` forever
   * (autoplay permanently suspended), `data-dragging="true"` stays on the track (scroll-snap
   * permanently disabled, cursor stuck on `grabbing`), with no further user action guaranteed to
   * clear it. Treated exactly like `pointercancel` — capture is already gone by the time this
   * fires, so there is nothing left to release, only the same drag-state cleanup to run.
   */
  function onTrackLostPointerCapture(event: PointerEvent): void {
    endTrackDrag(event);
  }

  /**
   * Capture phase, deliberately: this must run *before* the click reaches whatever the pointer
   * was actually released over (a slide's own link, a product card's `Add to cart`), which a
   * bubble-phase listener on the track — after the descendant's own handler has already run —
   * would be too late to stop. One `click` consumed per drag (`suppressNextClick` resets itself
   * immediately), so a plain click right after a drag-free click still works normally.
   */
  function onTrackClickCapture(event: MouseEvent): void {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  /**
   * Browsers make an `<img>`/`<a>` draggable by default, entirely independently of the Pointer
   * Events this file otherwise relies on — without this, starting a mouse drag over a slide's own
   * image (every Carousel/Lightbox slide has one) fires the native "drag this image out" gesture
   * instead, which swallows the `pointermove` events the drag above needs.
   */
  function onTrackDragStart(event: DragEvent): void {
    if (draggableEnabled()) event.preventDefault();
  }

  let observer: MutationObserver | undefined;
  let resizeObserver: ResizeObserver | undefined;

  onMounted(() => {
    annotate();

    const track = trackRef.value;
    if (track) {
      track.addEventListener('scroll', onScroll, { passive: true });
      track.addEventListener('pointerdown', onTrackPointerDown);
      track.addEventListener('pointermove', onTrackPointerMove);
      track.addEventListener('pointerup', onTrackPointerUp);
      track.addEventListener('pointercancel', onTrackPointerCancel);
      track.addEventListener('lostpointercapture', onTrackLostPointerCapture);
      track.addEventListener('click', onTrackClickCapture, true);
      track.addEventListener('dragstart', onTrackDragStart);
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
    track?.removeEventListener('pointerdown', onTrackPointerDown);
    track?.removeEventListener('pointermove', onTrackPointerMove);
    track?.removeEventListener('pointerup', onTrackPointerUp);
    track?.removeEventListener('pointercancel', onTrackPointerCancel);
    track?.removeEventListener('lostpointercapture', onTrackLostPointerCapture);
    track?.removeEventListener('click', onTrackClickCapture, true);
    track?.removeEventListener('dragstart', onTrackDragStart);
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
