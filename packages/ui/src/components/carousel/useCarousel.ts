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

/**
 * Everything inside a slide that can take focus, by element rather than by current `tabindex`
 * value — the same list the private Eldra library's own carousel row parks, plus
 * `[data-carousel-action]` for an author's explicit nomination.
 *
 * **`[tabindex]` is in here on purpose, and the selector must stay value-blind.** `syncFocusModel`
 * below reads this twice: once to decide *which model the carousel is in* (does any slide hold
 * something focusable?) and once to park the non-active slides' controls at `tabindex="-1"`. A
 * selector that excluded `[tabindex="-1"]` would stop matching the very elements the parking pass
 * had just written, so the model would flip back to "no slide holds anything focusable" on the
 * next pass and the track would become a second tab stop. Matching any `[tabindex]`, whatever its
 * value, makes both reads idempotent.
 */
const FOCUSABLE_SLIDE_CONTENT_SELECTOR = [
  '[data-carousel-action]',
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

/**
 * Controls whose own meaning for `←`/`→` outranks the carousel's (operator ruling: "inside a text
 * input or a control that consumes arrows … do not intercept"): a caret moving through typed text,
 * a native `<select>`'s own option stepping, a slider's value, and the ARIA widget roles whose
 * Authoring Practices pattern already claims the horizontal arrows. `[data-no-arrow-keys]` is the
 * explicit opt-out for anything else an author builds in a slide, the same shape as `data-no-drag`
 * for the pointer drag further down.
 *
 * This replaces the private library's own guard rather than narrowing it: that one answered the
 * question by *position* (`event.target !== event.currentTarget` — act only on the slide element
 * itself), which cannot work now that the arrows have to move between slides from anywhere inside
 * one, a card's own link included.
 */
const ARROW_CONSUMER_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="combobox"]',
  '[role="grid"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="radiogroup"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="tablist"]',
  '[role="textbox"]',
  '[role="tree"]',
  '[role="treegrid"]',
  'audio[controls]',
  'video[controls]',
  '[data-no-arrow-keys]',
].join(',');

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
  /**
   * `true` while **no** slide holds anything focusable, which is the one case where the track
   * itself is the carousel's single tab stop (`tabindex="0"`) and `ArrowLeft`/`ArrowRight` step
   * it: a single-slide image gallery, or a `Lightbox` stage (spec "Lightbox" → Anatomy, part 5:
   * "Stage / track … focusable"). `false` as soon as any slide holds a link, a button or anything
   * else focusable — then the roving model below owns the keyboard and the track must not be a tab
   * stop of its own, or `Tab` would stop twice in a row for one carousel. Bind the track's
   * `tabindex` to it; `syncFocusModel` carries the whole rule.
   */
  trackFocusable: ComputedRef<boolean>;
  /**
   * The keyboard for both models — bind it to the **track's** own `keydown` and nothing else: a
   * key pressed on a slide, or on a link inside a slide, bubbles to the track, so one listener
   * serves slide content this composable never renders. See the function's own comment for which
   * branch handles what, and which targets it deliberately keeps its hands off.
   */
  onTrackKeydown: (event: KeyboardEvent) => void;
  /**
   * Makes a slide the active one — moving the carousel's single entry point onto it, focusing
   * that entry point (the slide's first control, or the slide itself when it holds none) and
   * scrolling it into view, clamped to `[0, count - 1]`. The arrow keys call it; exposed for a
   * caller driving the same move from a control of its own. A no-op shape under the
   * track-focusable model, where slides are not focusable at all.
   */
  focusItem: (target: number) => void;
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

  /** `true` once any slide holds something focusable — see `trackFocusable`, its inverse. */
  const slidesFocusable = ref(false);
  const trackFocusable = computed(() => !slidesFocusable.value);

  function children(): HTMLElement[] {
    const track = trackRef.value;
    return track ? (Array.from(track.children) as HTMLElement[]) : [];
  }

  function focusableContent(item: HTMLElement): HTMLElement[] {
    return Array.from(item.querySelectorAll<HTMLElement>(FOCUSABLE_SLIDE_CONTENT_SELECTOR));
  }

  /**
   * What each parked control's `tabindex` attribute was before this composable wrote `-1` over it,
   * so becoming the active slide gives its controls back their **natural** tab behaviour rather
   * than a guess at one: `null` for the overwhelming majority (a link or a button that never had
   * the attribute at all, where restoring means *removing* it, not writing `"0"` — `tabindex="0"`
   * on an `<a href>` would pull it out of its natural document order on a page that reorders with
   * CSS), and the author's own value for a slide that shipped one.
   *
   * A `WeakMap` rather than a `data-` attribute of our own: slide content belongs to the consumer,
   * and an entry costs nothing once the element is gone.
   */
  const parkedTabIndex = new WeakMap<HTMLElement, string | null>();

  function park(el: HTMLElement): void {
    if (!parkedTabIndex.has(el)) parkedTabIndex.set(el, el.getAttribute('tabindex'));
    el.setAttribute('tabindex', '-1');
  }

  function unpark(el: HTMLElement): void {
    if (!parkedTabIndex.has(el)) return;
    const original = parkedTabIndex.get(el) ?? null;
    parkedTabIndex.delete(el);
    if (original === null) el.removeAttribute('tabindex');
    else el.setAttribute('tabindex', original);
  }

  /**
   * **One entry point per carousel, and `Tab` never walks the row.**
   *
   * Spec "Keyboard" (`01-core-components.md`): "Composite widgets (tabs, listboxes, menus,
   * carousels, radio groups) take one tab stop and use arrow keys inside, following the WAI-ARIA
   * Authoring Practices patterns named in each section." A carousel whose track was focusable
   * *and* whose every card kept its links in the tab sequence took one stop for the track plus one
   * per link — a shopper tabbing to the content under a twelve-card row pressed `Tab` thirteen
   * times to get past it.
   *
   * So, re-run on every mount, slot change, subtree change and active-slide change:
   *
   * - **No slide holds anything focusable** (a single-slide image gallery, a `Lightbox` stage):
   *   nothing here is a tab stop, the slides' own `tabindex` is cleared, and `trackFocusable`
   *   leaves the track itself as the one stop with `←`/`→` stepping it — the spec's own "Track:
   *   `tabindex="0"`" case, unchanged.
   * - **Otherwise** the active slide owns the single entry point and the others are parked:
   *   - the active slide's own controls keep their natural `tabindex`, so `Tab`/`Shift+Tab` move
   *     through *that card's* link, wishlist and quick-add in DOM order (operator ruling) and the
   *     last one hands `Tab` straight out of the carousel, because there is nothing tabbable left
   *     between it and the page below;
   *   - every other slide's controls are parked at `tabindex="-1"`, which is what keeps `Tab` from
   *     ever reaching the next card;
   *   - the slide **element** is a tab stop (`tabindex="0"`) only when it is active *and* holds no
   *     control of its own — a mixed row (a hero's linked and unlinked figures) then still has
   *     exactly one entry point on every slide, never two on one and none on another. Every other
   *     slide element, the active-with-controls one included, is `tabindex="-1"`: reachable by
   *     `focusItem` and by a click, never by `Tab`.
   */
  function syncFocusModel(): void {
    const kids = children();
    const content = kids.map(focusableContent);
    slidesFocusable.value = content.some((list) => list.length > 0);
    kids.forEach((item, i) => {
      const own = content[i] ?? [];
      if (!slidesFocusable.value) {
        item.removeAttribute('tabindex');
        return;
      }
      const active = i === index.value;
      item.setAttribute('tabindex', active && own.length === 0 ? '0' : '-1');
      for (const el of own) {
        if (active) unpark(el);
        else park(el);
      }
    });
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
    syncFocusModel();
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

  /**
   * The slide a key event came from: the track's own direct child on the path from `event.target`
   * up, so a key pressed on a product card's link three levels in still answers "slide 2". `-1`
   * for the track itself and for anything outside it.
   */
  function slideIndexOf(target: EventTarget | null): number {
    const track = trackRef.value;
    if (!track || !(target instanceof Node)) return -1;
    let node: Node | null = target;
    while (node !== null && node.parentNode !== track) node = node.parentNode;
    return node === null ? -1 : children().indexOf(node as HTMLElement);
  }

  function consumesArrowKeys(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest(ARROW_CONSUMER_SELECTOR) !== null;
  }

  /**
   * Moves the carousel's single entry point onto a slide and puts real focus on it: the slide's
   * first control when it has one (a product card's title link), the slide element itself when it
   * does not (an unlinked figure, which `syncFocusModel` made `tabindex="0"` for exactly this).
   *
   * `focus({ preventScroll: true })` first and the scroll second, deliberately: letting the
   * browser scroll to the newly focused element itself would jump the track by whatever
   * `scrollIntoView` thinks is right and fight scroll-snap on the way. `scrollToIndex` then does
   * the move the rest of this file already does for arrows, dots and autoplay — snapping to the
   * slide's own start, instantly under `prefers-reduced-motion` (see its own comment).
   */
  function focusItem(target: number): void {
    const clamped = clampIndex(target);
    const item = children()[clamped];
    if (!item) return;
    const changed = clamped !== index.value;
    index.value = clamped;
    // Synchronously, not through the `index` watcher below: the entry point has to be on this
    // slide *before* focus lands, or a `Tab` pressed in the same breath would read the old one.
    syncFocusModel();
    const entry = focusableContent(item)[0] ?? item;
    entry.focus({ preventScroll: true });
    scrollToIndex(clamped);
    updateEdges();
    if (changed) options.onChange?.(clamped);
  }

  /**
   * Both keyboard models, one listener on the track (a slide's own key event bubbles to it).
   *
   * - **Track-focusable** (no slide holds anything focusable): `←`/`→` step the track, exactly as
   *   before — the track is the focused element in that model, so this is the only way its arrows
   *   can fire at all.
   * - **Roving**: `←`/`→` move the active slide one step and `Home`/`End` jump to the first/last,
   *   from anywhere inside a slide (operator ruling) — focus follows onto the new slide's entry
   *   point, clamped at both ends, never wrapping (the arrows and dots do not wrap either).
   *   `Enter`/`Space` are deliberately *not* handled: the focused element is the card's own link
   *   or button by then, and the browser's own activation is both correct and the one the shopper
   *   expects. `Tab` is not handled either — it is what leaves the carousel, and `syncFocusModel`
   *   is what makes sure it leaves rather than walking into the next card.
   *
   * Nothing is intercepted inside a control that owns the horizontal arrows itself
   * (`ARROW_CONSUMER_SELECTOR`): typing in a slide's own search field moves the caret, not the
   * row.
   */
  function onTrackKeydown(event: KeyboardEvent): void {
    if (trackFocusable.value) {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        prev();
      }
      return;
    }
    if (consumesArrowKeys(event.target)) return;
    const from = slideIndexOf(event.target);
    const current = from >= 0 ? from : index.value;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusItem(current + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusItem(current - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(count.value - 1);
    }
  }

  /**
   * The entry point follows the carousel wherever it goes, not only where the keyboard took it:
   * an arrow button, a dot, autoplay, a pointer drag and a plain two-finger scroll all end in a
   * new `index`, and `Tab` must then land on the card the shopper is actually looking at rather
   * than one scrolled out of sight.
   */
  watch(index, syncFocusModel);

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
  let contentObserver: MutationObserver | undefined;
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
        /**
         * A slide's *contents* arriving later is just as much a change to the focus model as a
         * slide arriving: a product row renders four skeletons while its collection loads and then
         * swaps in cards with a link and a quick-add button each, and a Studio editor adds a link
         * to a hero figure that had none. Without this pass those controls would sit in the tab
         * sequence on every card at once — the exact defect the roving model exists to fix — until
         * something else happened to re-run `annotate`.
         *
         * Separate from `observer` above, and `syncFocusModel` rather than `annotate`, because
         * this one fires for every DOM change anywhere inside the track: re-labelling twelve
         * cards on each is work for nothing, and `annotate`'s own `count`/`index` reasoning is
         * about the slides themselves, which only the direct-children observer can see change.
         *
         * No feedback loop: both passes only ever write attributes and class names, and neither
         * observer asks for `attributes`.
         */
        contentObserver = new MutationObserver(syncFocusModel);
        contentObserver.observe(track, { childList: true, subtree: true });
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
    contentObserver?.disconnect();
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
    trackFocusable,
    onTrackKeydown,
    focusItem,
    playing,
    pause,
    resume,
    toggle,
  };
}
