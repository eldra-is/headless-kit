import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { enUS } from '../../../messages/en-US';
import Carousel from '../Carousel.vue';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

/**
 * The ring's own reach, and the inline reservation that composes a block's bleed with it — written
 * here exactly as `Carousel.vue` writes them inside its arbitrary values (Tailwind spells a space
 * `_`), so a change to either side fails here rather than in a screenshot three releases later.
 */
const RING_REACH = 'calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width))';
const INLINE_RESERVE = `max(var(--eldra-carousel-bleed,0px),${RING_REACH})`;

/** Three plain `<li>` slides, the shape a product row's own story passes. */
const THREE_SLIDES = `
  <li>Alpha</li>
  <li>Bravo</li>
  <li>Charlie</li>
`;

function track(wrapper: { find: (selector: string) => { element: Element } }): HTMLElement {
  return wrapper.find('[data-part="track"]').element as HTMLElement;
}

function slidesOf(wrapper: { find: (selector: string) => { element: Element } }): HTMLElement[] {
  return Array.from(track(wrapper).children) as HTMLElement[];
}

/**
 * happy-dom lays out no real geometry (`scrollWidth`/`clientWidth` are both always `0`), which
 * `useCarousel`'s `updateEdges()` already treats as "no real layout" and falls back to index-based
 * edges (see that file's own comment) — so most specs below need no stubbing at all. Only the
 * "disables at a real scrolled end" spec needs genuine numbers, stubbed here the same way a real
 * browser would report an overflowing track.
 */
function stubOverflow(
  el: HTMLElement,
  { scrollWidth, clientWidth, scrollLeft = 0 } = { scrollWidth: 400, clientWidth: 100 }
): void {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
  Object.defineProperty(el, 'scrollLeft', {
    value: scrollLeft,
    configurable: true,
    writable: true,
  });
  el.scrollTo = vi.fn();
}

async function settle(): Promise<void> {
  await nextTick();
  await Promise.resolve();
}

/**
 * `offsetLeft` is real-layout geometry too (`useCarousel`'s own drag-release "nearest slide" math
 * reads it, the same way `syncIndexFromScroll` already did before this file existed) — always `0`
 * in happy-dom for the same reason `scrollWidth`/`clientWidth` are, so the drag specs below stub
 * it per slide the same way `stubOverflow` stubs the track's own geometry, standing in for a real
 * browser's laid-out slide positions.
 */
function stubSlideOffsets(wrapper: { find: (selector: string) => { element: Element } }): void {
  slidesOf(wrapper).forEach((slide, i) => {
    Object.defineProperty(slide, 'offsetLeft', { value: i * 100, configurable: true });
  });
}

/**
 * A `PointerEvent` with `timeStamp` pinned to `t` — real `Event.timeStamp` is read-only and set at
 * construction to "whenever `new PointerEvent(...)` happened to run", which in a synchronous test
 * leaves every dispatched event a fraction of a millisecond apart regardless of what the test is
 * trying to simulate. `useCarousel`'s own release-velocity math (`endTrackDrag`) divides by the
 * gap between the last two samples' `timeStamp`s, so the "flick advances" vs. "plain release
 * doesn't" specs below need to control it directly rather than relying on however fast this
 * process happens to dispatch events.
 */
function pointerEventAt(
  type: string,
  init: PointerEventInit & { clientX: number },
  t: number
): PointerEvent {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'timeStamp', { value: t, configurable: true });
  return event;
}

describe('Carousel — element and structure', () => {
  /**
   * `THREE_SLIDES` holds no link, button or anything else focusable, which is the one case where
   * the track itself is the carousel's single tab stop (spec "Carousel" → Accessibility: 'Track:
   * `tabindex="0"`'). A carousel whose slides *do* hold controls moves that stop onto the active
   * slide instead — "Carousel — roving focus" further down covers both halves of that rule.
   */
  it('renders a labelled region with a focusable track, no slide holding anything focusable', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    expect(wrapper.element.tagName).toBe('SECTION');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.attributes('aria-roledescription')).toBe('carousel');
    expect(wrapper.attributes('aria-label')).toBe('Bestsellers');
    const trackEl = track(wrapper);
    expect(trackEl.getAttribute('tabindex')).toBe('0');
    expect(trackEl.getAttribute('aria-live')).toBe('off');
    expect(trackEl.getAttribute('aria-label')).toBe(enUS.slides);
    wrapper.unmount();
  });

  it('renders header arrows by default, none below', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES, header: '<h2>Bestsellers</h2>' },
    });
    await settle();
    expect(wrapper.find('[data-part="header"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="header"] [data-part="prev"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="header"] [data-part="next"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="pause"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="dots"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('passes a classes.track override through tailwind-merge', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers', classes: { track: 'gap-8' } },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    expect(track(wrapper).className).toContain('gap-8');
    expect(track(wrapper).className).not.toContain('gap-4');
    wrapper.unmount();
  });
});

const THREE_DIV_SLIDES = `
  <div>Alpha</div>
  <div>Bravo</div>
  <div>Charlie</div>
`;

describe('Carousel — slide labelling', () => {
  it('gives every slide role=group, a slide roledescription and an "n of total" label', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_DIV_SLIDES },
    });
    await settle();
    const slides = slidesOf(wrapper);
    expect(slides).toHaveLength(3);
    slides.forEach((slide, i) => {
      expect(slide.getAttribute('data-part')).toBe('slide');
      expect(slide.getAttribute('role')).toBe('group');
      expect(slide.getAttribute('aria-roledescription')).toBe('slide');
      expect(slide.getAttribute('aria-label')).toBe(enUS.slideOf(i + 1, 3));
      expect(slide.classList.contains('eldra-carousel-slide')).toBe(true);
    });
    wrapper.unmount();
  });

  it("keeps a product row's own <li> as the slide, without an invalid role=group on it", async () => {
    // ARIA's role-allowed-on-element rules do not permit `group` on `<li>` (its native `listitem`
    // role is owned by its list ancestor) — proven by mutation: `annotate()`'s own `LI` guard,
    // removed, turns this assertion and the axe check below red.
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const slides = slidesOf(wrapper);
    slides.forEach((slide, i) => {
      expect(slide.tagName).toBe('LI');
      expect(slide.hasAttribute('role')).toBe(false);
      expect(slide.getAttribute('aria-roledescription')).toBe('slide');
      expect(slide.getAttribute('aria-label')).toBe(enUS.slideOf(i + 1, 3));
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('re-labels every slide when the slot content changes', async () => {
    const wrapper = mountWith(
      {
        components: { Carousel },
        props: ['items'],
        template: `
          <Carousel aria-label="Bestsellers">
            <li v-for="item in items" :key="item">{{ item }}</li>
          </Carousel>
        `,
      },
      { props: { items: ['A', 'B'] } }
    );
    await settle();
    expect(slidesOf(wrapper)).toHaveLength(2);

    await wrapper.setProps({ items: ['A', 'B', 'C', 'D'] });
    await settle();
    const slides = slidesOf(wrapper);
    expect(slides).toHaveLength(4);
    expect(slides[3]?.getAttribute('aria-label')).toBe(enUS.slideOf(4, 4));
    wrapper.unmount();
  });

  it('applies a classes.slide override to every slide', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers', classes: { slide: 'custom-slide' } },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    for (const slide of slidesOf(wrapper)) {
      expect(slide.classList.contains('custom-slide')).toBe(true);
    }
    wrapper.unmount();
  });
});

/**
 * `perView` reaches the CSS as an **inline style** on the track, never as a class (bug, fixed
 * 2026-09-27 — see `carouselPerViewStyle`'s own comment in `useCarousel.ts`): an interpolated
 * arbitrary-property class name is never in the text Tailwind's scanner reads, so a consumer's
 * build emitted no rule for it and every carousel in the built starter rendered one full-width
 * slide. Each assertion below therefore reads the resolved custom properties off `track.style` —
 * the same three the static `eldra-carousel-track` utility reads — and the last one pins that no
 * class-shaped spelling of the variable comes back.
 */
function perView(wrapper: ReturnType<typeof mountWith>): Record<string, string> {
  const style = track(wrapper).style;
  return {
    base: style.getPropertyValue('--eldra-carousel-per-view-base'),
    md: style.getPropertyValue('--eldra-carousel-per-view-md'),
    lg: style.getPropertyValue('--eldra-carousel-per-view-lg'),
  };
}

describe('Carousel — perView CSS variables', () => {
  it('sets all three per-view properties for a plain number', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery', perView: 1 },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    expect(perView(wrapper)).toEqual({ base: '1', md: '1', lg: '1' });
    expect(track(wrapper).className).toContain('eldra-carousel-track');
    wrapper.unmount();
  });

  it('defaults to 1.25 when perView is not given', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    expect(perView(wrapper)).toEqual({ base: '1.25', md: '1.25', lg: '1.25' });
    wrapper.unmount();
  });

  it('resolves each breakpoint step narrowest-first for a per-breakpoint object', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers', perView: { base: 1.25, md: 3, lg: 4 } },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    expect(perView(wrapper)).toEqual({ base: '1.25', md: '3', lg: '4' });
    wrapper.unmount();
  });

  it('carries md forward to lg when only md is given, and base forward when neither is', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers', perView: { base: 1.25, md: 3 } },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    expect(perView(wrapper)).toEqual({ base: '1.25', md: '3', lg: '3' });
    wrapper.unmount();
  });

  it('never emits the interpolated arbitrary-property class Tailwind could not scan', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers', perView: { base: 1.25, md: 3, lg: 4 } },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    // The pattern, not a literal class name: writing one here would put it back into the text the
    // package's own Storybook build scans, which is exactly how the bug stayed invisible.
    expect(track(wrapper).className).not.toMatch(/--eldra-carousel-per-view\s*:/);
    wrapper.unmount();
  });
});

describe('Carousel — arrows', () => {
  it('disables previous at the start and enables next when more slides follow', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const prevBtn = wrapper.find('[data-part="prev"]').element as HTMLButtonElement;
    const nextBtn = wrapper.find('[data-part="next"]').element as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
    expect(nextBtn.disabled).toBe(false);
    wrapper.unmount();
  });

  it('disables next at the end (index-based fallback with no real layout)', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    await wrapper.find('[data-part="next"]').trigger('click');
    await wrapper.find('[data-part="next"]').trigger('click');
    await settle();
    const prevBtn = wrapper.find('[data-part="prev"]').element as HTMLButtonElement;
    const nextBtn = wrapper.find('[data-part="next"]').element as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(false);
    expect(nextBtn.disabled).toBe(true);
    wrapper.unmount();
  });

  it('never loops past the last slide, disabling the button before a third click', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    await wrapper.find('[data-part="next"]').trigger('click');
    await wrapper.find('[data-part="next"]').trigger('click');
    await wrapper.find('[data-part="next"]').trigger('click');
    await settle();
    expect(wrapper.emitted('change')).toEqual([[1], [2]]);
    wrapper.unmount();
  });

  it('clamps ArrowRight on the track past the last slide, a path the disabled arrow cannot gate', async () => {
    // The track's own `keydown` calls `next()` directly with no `:disabled` check of its own — a
    // real disabled `<button>` blocks a synthetic click at the end (the spec above), but the
    // keyboard path only stays in bounds because `useCarousel`'s own `clampIndex` does. Proven by
    // mutation: replacing `clampIndex` with an identity function (`return target`) turns this red
    // — index 3 of a 3-slide track — while the button-click spec above stays green regardless,
    // since it never reaches `next()` a third time either way.
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = wrapper.find('[data-part="track"]');
    await trackEl.trigger('keydown', { key: 'ArrowRight' });
    await trackEl.trigger('keydown', { key: 'ArrowRight' });
    await trackEl.trigger('keydown', { key: 'ArrowRight' });
    await trackEl.trigger('keydown', { key: 'ArrowRight' });
    await settle();
    expect(wrapper.emitted('change')).toEqual([[1], [2]]);
    wrapper.unmount();
  });

  it('disables both arrows with real overflow geometry showing nothing to scroll', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    stubOverflow(track(wrapper), { scrollWidth: 100, clientWidth: 100, scrollLeft: 0 });
    track(wrapper).dispatchEvent(new Event('scroll'));
    await settle();
    const prevBtn = wrapper.find('[data-part="prev"]').element as HTMLButtonElement;
    const nextBtn = wrapper.find('[data-part="next"]').element as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
    expect(nextBtn.disabled).toBe(true);
    wrapper.unmount();
  });

  it('moves focus off a disabled arrow onto the other one', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const prevBtn = wrapper.find('[data-part="prev"]').element as HTMLButtonElement;
    const nextBtn = wrapper.find('[data-part="next"]').element as HTMLButtonElement;
    // `next` starts enabled (index 0 of 3) — focus it directly, since a disabled button cannot
    // take focus at all.
    nextBtn.focus();
    expect(document.activeElement).toBe(nextBtn);
    await wrapper.find('[data-part="next"]').trigger('click');
    await wrapper.find('[data-part="next"]').trigger('click');
    await settle();
    // `next` is now disabled (both slides scrolled through, index 2 of 3); focus should have
    // moved off it onto `prev`, which is enabled again.
    expect(nextBtn.disabled).toBe(true);
    expect(document.activeElement).toBe(prevBtn);
    wrapper.unmount();
  });
});

describe('Carousel — dots', () => {
  it('renders one dot per slide, the current one aria-current, and selects on click', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery', controls: 'below', dots: true },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const dots = wrapper.findAll('[data-part="dot"]');
    expect(dots).toHaveLength(3);
    expect(dots[0]?.attributes('aria-current')).toBe('true');
    expect(dots[1]?.attributes('aria-current')).toBeUndefined();
    expect(dots[0]?.attributes('aria-label')).toBe(enUS.goToSlide(1));

    await dots[2]?.trigger('click');
    await settle();
    expect(wrapper.emitted('change')).toEqual([[2]]);
    const dotsAfter = wrapper.findAll('[data-part="dot"]');
    expect(dotsAfter[2]?.attributes('aria-current')).toBe('true');
    expect(dotsAfter[0]?.attributes('aria-current')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('Carousel — counter', () => {
  it('renders the aria-hidden "n / total" counter between the arrows', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers', counter: true },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const counterEl = wrapper.find('[data-part="counter"]');
    expect(counterEl.attributes('aria-hidden')).toBe('true');
    expect(counterEl.text()).toBe(enUS.counter(1, 3));

    await wrapper.find('[data-part="next"]').trigger('click');
    await settle();
    expect(wrapper.find('[data-part="counter"]').text()).toBe(enUS.counter(2, 3));
    wrapper.unmount();
  });
});

describe('Carousel — autoplay', () => {
  it('does not render Pause when autoplay is off', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    expect(wrapper.find('[data-part="pause"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('always renders Pause when autoplay is on, and advances on a timer', async () => {
    vi.useFakeTimers();
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery', autoplay: 3000 },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const pauseBtn = wrapper.find('[data-part="pause"]');
    expect(pauseBtn.exists()).toBe(true);
    expect(pauseBtn.text()).toBe(enUS.pause);

    await vi.advanceTimersByTimeAsync(3000);
    expect(wrapper.emitted('change')).toEqual([[1]]);

    // Wraps back to the first slide after the last one.
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(wrapper.emitted('change')).toEqual([[1], [2], [0]]);
    wrapper.unmount();
  });

  it('toggles to Play on click and stops advancing', async () => {
    vi.useFakeTimers();
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery', autoplay: 1000 },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    await wrapper.find('[data-part="pause"]').trigger('click');
    await settle();
    const pauseBtn = wrapper.find('[data-part="pause"]');
    expect(pauseBtn.text()).toBe(enUS.play);

    await vi.advanceTimersByTimeAsync(5000);
    expect(wrapper.emitted('change')).toBeUndefined();
    wrapper.unmount();
  });

  it('pauses while the pointer is over the carousel and resumes on leave', async () => {
    vi.useFakeTimers();
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery', autoplay: 1000 },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    wrapper.element.dispatchEvent(new Event('pointerenter'));
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(wrapper.emitted('change')).toBeUndefined();

    wrapper.element.dispatchEvent(new Event('pointerleave'));
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.emitted('change')).toEqual([[1]]);
    wrapper.unmount();
  });

  it('pauses while focus is inside the carousel and resumes when it leaves', async () => {
    vi.useFakeTimers();
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery', autoplay: 1000 },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    trackEl.focus();
    trackEl.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(wrapper.emitted('change')).toBeUndefined();

    trackEl.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body })
    );
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.emitted('change')).toEqual([[1]]);
    wrapper.unmount();
  });

  it('never starts under reduced motion, and shows Play', async () => {
    const original = window.matchMedia;
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    vi.useFakeTimers();
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery', autoplay: 1000 },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    expect(wrapper.find('[data-part="pause"]').text()).toBe(enUS.play);
    await vi.advanceTimersByTimeAsync(5000);
    expect(wrapper.emitted('change')).toBeUndefined();
    wrapper.unmount();
    window.matchMedia = original;
  });

  /**
   * Final review item 3/M3: `playing`'s initial value already checked `prefersReducedMotion()`, but
   * `resume()` — reached only by pressing `Play` — did not, so a reduced-motion user pressing the
   * button the spec still shows them got a running slideshow anyway (spec: "autoplay never
   * starts"). Pressing `Play` must stay a no-op under reduced motion, not just never auto-arm.
   */
  it('pressing Play under reduced motion does not re-arm autoplay (M3)', async () => {
    const original = window.matchMedia;
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    vi.useFakeTimers();
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery', autoplay: 1000 },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const pauseButton = wrapper.find('[data-part="pause"]');
    expect(pauseButton.text()).toBe(enUS.play);
    await pauseButton.trigger('click');
    await settle();
    // Still showing "Play": the click did not flip it into a playing state.
    expect(wrapper.find('[data-part="pause"]').text()).toBe(enUS.play);
    await vi.advanceTimersByTimeAsync(5000);
    expect(wrapper.emitted('change')).toBeUndefined();
    wrapper.unmount();
    window.matchMedia = original;
  });
});

describe('Carousel — keyboard', () => {
  it('moves one slide with ArrowLeft/ArrowRight on the focused track', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    await wrapper.find('[data-part="track"]').trigger('keydown', { key: 'ArrowRight' });
    await settle();
    expect(wrapper.emitted('change')).toEqual([[1]]);
    await wrapper.find('[data-part="track"]').trigger('keydown', { key: 'ArrowLeft' });
    await settle();
    expect(wrapper.emitted('change')).toEqual([[1], [0]]);
    void trackEl;
    wrapper.unmount();
  });

  it('activates arrows, dots and Pause with Enter and Space (native button behaviour)', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery', controls: 'below', dots: true, autoplay: 1000 },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    // Native <button> elements activate on Enter/Space with no extra handling — asserted here as
    // "every control is a real <button>", which is what makes that true.
    for (const part of ['prev', 'next', 'pause', 'dot']) {
      const el = wrapper.find(`[data-part="${part}"]`).element;
      expect(el.tagName).toBe('BUTTON');
      expect((el as HTMLButtonElement).type).toBe('button');
    }
    wrapper.unmount();
  });
});

/**
 * Two product-card-shaped slides per card: a title link and a secondary control, the shape the
 * starter's own product row renders (`ProductCard`'s stretched title link, then its quick-add
 * button) and the one the roving model exists for.
 */
const THREE_CARD_SLIDES = `
  <li><a href="/alpha">Alpha</a><button type="button">Save Alpha</button></li>
  <li><a href="/bravo">Bravo</a><button type="button">Save Bravo</button></li>
  <li><a href="/charlie">Charlie</a><button type="button">Save Charlie</button></li>
`;

/**
 * Everything inside `el` that `Tab` would actually stop on: natively focusable elements and
 * anything with an explicit `tabindex`, minus whatever sits at `-1`. The whole roving model is a
 * claim about this list, so every assertion below reads it rather than one attribute at a time —
 * an element parked at `-1` and an element that never had a `tabindex` are the same thing to a
 * shopper pressing `Tab`, and only the resulting list says whether the carousel takes one stop or
 * thirteen.
 */
function tabbableIn(el: HTMLElement): HTMLElement[] {
  const candidates = el.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]'
  );
  return Array.from(candidates).filter(
    (node) =>
      node.getAttribute('tabindex') !== '-1' &&
      // `disabled` is inherited: a control inside a disabled fieldset carries no attribute of its
      // own and the platform still refuses to focus it, so neither does this list.
      node.closest('fieldset[disabled], optgroup[disabled]') === null
  );
}

function controlsOf(slide: HTMLElement): HTMLElement[] {
  return Array.from(slide.querySelectorAll<HTMLElement>('a[href], button, input'));
}

describe('Carousel — roving focus', () => {
  it('takes one tab stop for the whole row: only the active slide keeps its own controls', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_CARD_SLIDES },
    });
    await settle();
    const slides = slidesOf(wrapper);
    // The entry point is the active card's own first control, so the track itself must not be a
    // stop as well — spec "Keyboard": one tab stop for a composite widget, not two.
    expect(track(wrapper).getAttribute('tabindex')).toBeNull();
    expect(tabbableIn(track(wrapper))).toEqual(controlsOf(slides[0]!));
    // Both of the active card's controls, in DOM order: `Tab` moves within the card (operator
    // ruling), and the last of them is the last tabbable thing in the track, so the next `Tab`
    // leaves the carousel instead of walking into slide 2.
    expect(tabbableIn(track(wrapper))).toHaveLength(2);
    // No `tabindex` is written onto a slide that holds controls: the entry point is the control,
    // so a `-1` there would have no reader — and would make a click on the card's padding focus
    // the `<li>` itself.
    for (const slide of slides) expect(slide.getAttribute('tabindex')).toBeNull();
    for (const slide of slides) expect(slide.classList.contains('eldra-focus')).toBe(false);
    for (const slide of slides.slice(1)) {
      for (const control of controlsOf(slide)) {
        expect(control.getAttribute('tabindex')).toBe('-1');
      }
    }
    wrapper.unmount();
  });

  it('is the active slide element itself when that slide holds no control of its own', async () => {
    // A hero's `split-carousel`: some figures are linked, some are not. Every slide still has
    // exactly one entry point, and the carousel still exactly one.
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Hero' },
      slots: {
        default: `
          <figure><span>Unlinked</span></figure>
          <figure><a href="/linked">Linked</a></figure>
        `,
      },
    });
    await settle();
    const slides = slidesOf(wrapper);
    expect(slides[0]?.getAttribute('tabindex')).toBe('0');
    // The package's own focus ring, on the one stop that has no control of its own to bring one.
    expect(slides[0]?.classList.contains('eldra-focus')).toBe(true);
    expect(slides[1]?.getAttribute('tabindex')).toBeNull();
    expect(tabbableIn(track(wrapper))).toEqual([slides[0]]);

    await wrapper.find('[data-part="track"]').trigger('keydown', { key: 'ArrowRight' });
    await settle();
    // Slide 1 keeps the stop it can still take — a `-1`, so the arrows and a click can reach it
    // and `Tab` cannot — and loses the ring with the stop.
    expect(slides[0]?.getAttribute('tabindex')).toBe('-1');
    expect(slides[0]?.classList.contains('eldra-focus')).toBe(true);
    // Slide 2 has a link, so the link is the entry point and the slide element carries nothing.
    expect(slides[1]?.getAttribute('tabindex')).toBeNull();
    expect(slides[1]?.classList.contains('eldra-focus')).toBe(false);
    expect(tabbableIn(track(wrapper))).toEqual([slides[1]?.querySelector('a')]);
    wrapper.unmount();
  });

  it('keeps the track focusable, and the slides not, when no slide holds anything focusable', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Photo gallery', controls: 'below', dots: true },
      slots: { default: '<figure>One</figure><figure>Two</figure>' },
    });
    await settle();
    expect(track(wrapper).getAttribute('tabindex')).toBe('0');
    for (const slide of slidesOf(wrapper)) expect(slide.getAttribute('tabindex')).toBeNull();
    wrapper.unmount();
  });

  it('hands the parked controls back their own tabindex when their slide becomes active', async () => {
    // The middle card's link carries an author's own `tabindex="0"`: parking must remember it and
    // give that exact value back, not a guess — removing the attribute would leave a link whose
    // author deliberately pinned it behaving differently after one arrow press.
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default: `
          <li><a href="/alpha">Alpha</a></li>
          <li><a href="/bravo" tabindex="0">Bravo</a></li>
        `,
      },
    });
    await settle();
    const slides = slidesOf(wrapper);
    const alpha = slides[0]!.querySelector('a')!;
    const bravo = slides[1]!.querySelector('a')!;
    expect(alpha.getAttribute('tabindex')).toBeNull();
    expect(bravo.getAttribute('tabindex')).toBe('-1');

    await wrapper.find('[data-part="track"]').trigger('keydown', { key: 'ArrowRight' });
    await settle();
    expect(bravo.getAttribute('tabindex')).toBe('0');
    expect(alpha.getAttribute('tabindex')).toBe('-1');

    await wrapper.find('[data-part="track"]').trigger('keydown', { key: 'ArrowLeft' });
    await settle();
    expect(alpha.getAttribute('tabindex')).toBeNull();
    expect(bravo.getAttribute('tabindex')).toBe('-1');

    // And again, so the round trip is not a one-off: what parking remembers the second time is
    // the value it restored the first time, not the `-1` it wrote over it.
    await wrapper.find('[data-part="track"]').trigger('keydown', { key: 'ArrowRight' });
    await settle();
    expect(bravo.getAttribute('tabindex')).toBe('0');
    wrapper.unmount();
  });

  it('parks the controls of slides that arrive after mount', async () => {
    const wrapper = mountWith(
      {
        components: { Carousel },
        props: ['items'],
        template: `
          <Carousel aria-label="Bestsellers">
            <li v-for="item in items" :key="item"><a :href="'/' + item">{{ item }}</a></li>
          </Carousel>
        `,
      },
      { props: { items: ['a'] } }
    );
    await settle();
    expect(tabbableIn(track(wrapper))).toHaveLength(1);

    await wrapper.setProps({ items: ['a', 'b', 'c'] });
    await settle();
    const slides = slidesOf(wrapper);
    expect(slides).toHaveLength(3);
    expect(tabbableIn(track(wrapper))).toEqual([slides[0]?.querySelector('a')]);
    wrapper.unmount();
  });

  /**
   * The case a product row actually lives through: four skeleton slides with nothing focusable in
   * them (so the track is the one stop) are replaced by cards whose links arrive *inside* already
   * mounted slides. Only the subtree observer can see that, and without it every card's link would
   * sit in the tab sequence at once while the track stayed a stop of its own — two models at the
   * same time.
   */
  it('switches model when a slide gains focusable content without the slide itself changing', async () => {
    const wrapper = mountWith(
      {
        components: { Carousel },
        props: ['loaded'],
        template: `
          <Carousel aria-label="Bestsellers">
            <li v-for="n in 2" :key="n">
              <a v-if="loaded" :href="'/p' + n">Product {{ n }}</a>
              <span v-else>Loading</span>
            </li>
          </Carousel>
        `,
      },
      { props: { loaded: false } }
    );
    await settle();
    expect(track(wrapper).getAttribute('tabindex')).toBe('0');

    await wrapper.setProps({ loaded: true });
    await settle();
    expect(track(wrapper).getAttribute('tabindex')).toBeNull();
    const slides = slidesOf(wrapper);
    expect(tabbableIn(track(wrapper))).toEqual([slides[0]?.querySelector('a')]);
    expect(slides[1]?.querySelector('a')?.getAttribute('tabindex')).toBe('-1');
    wrapper.unmount();
  });

  it('moves the active slide and focus with ArrowRight/ArrowLeft from inside a card', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_CARD_SLIDES },
    });
    await settle();
    const slides = slidesOf(wrapper);
    const link = (i: number) => slides[i]!.querySelector('a')!;
    link(0).focus();
    expect(document.activeElement).toBe(link(0));

    // From the card's own link, not from the slide element — the ruling's "from anywhere inside a
    // card", which is where focus really is once the entry point is a link.
    link(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(document.activeElement).toBe(link(1));
    expect(wrapper.emitted('change')).toEqual([[1]]);
    expect(tabbableIn(track(wrapper))).toEqual(controlsOf(slides[1]!));

    // And from a *secondary* control of the card, which is just as much "inside" it.
    slides[1]!
      .querySelector('button')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await settle();
    expect(document.activeElement).toBe(link(0));
    wrapper.unmount();
  });

  it('clamps at both ends and jumps to first/last with Home/End', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_CARD_SLIDES },
    });
    await settle();
    const slides = slidesOf(wrapper);
    const link = (i: number) => slides[i]!.querySelector('a')!;
    const press = (from: HTMLElement, key: string) =>
      from.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

    press(link(0), 'ArrowLeft');
    await settle();
    expect(document.activeElement).toBe(link(0));
    expect(wrapper.emitted('change')).toBeUndefined();

    press(link(0), 'End');
    await settle();
    expect(document.activeElement).toBe(link(2));

    press(link(2), 'ArrowRight');
    await settle();
    expect(document.activeElement).toBe(link(2));

    press(link(2), 'Home');
    await settle();
    expect(document.activeElement).toBe(link(0));
    expect(wrapper.emitted('change')).toEqual([[2], [0]]);
    wrapper.unmount();
  });

  it('leaves the arrow keys alone inside a control that owns them itself', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default: `
          <li><a href="/alpha">Alpha</a><input aria-label="Quantity" value="1" /></li>
          <li><a href="/bravo">Bravo</a></li>
        `,
      },
    });
    await settle();
    const field = wrapper.find('input').element as HTMLInputElement;
    field.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(event);
    await settle();
    // The caret moves, the row does not: nothing prevented, nothing emitted, focus untouched.
    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.emitted('change')).toBeUndefined();
    expect(document.activeElement).toBe(field);
    wrapper.unmount();
  });

  it('leaves Enter and Space to the focused control', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_CARD_SLIDES },
    });
    await settle();
    const link = slidesOf(wrapper)[0]!.querySelector('a')!;
    link.focus();
    for (const key of ['Enter', ' ']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      await settle();
      // Never intercepted: the browser's own activation of the focused link is the right one, and
      // a `preventDefault()` here would be what stopped the navigation.
      expect(event.defaultPrevented).toBe(false);
    }
    expect(wrapper.emitted('change')).toBeUndefined();
    wrapper.unmount();
  });

  it('follows the arrow buttons and the dots, so Tab lands on the slide in view', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers', controls: 'below', dots: true },
      slots: { default: THREE_CARD_SLIDES },
    });
    await settle();
    const slides = slidesOf(wrapper);
    await wrapper.find('[data-part="next"]').trigger('click');
    await settle();
    expect(tabbableIn(track(wrapper))).toEqual(controlsOf(slides[1]!));

    await wrapper.findAll('[data-part="dot"]')[2]!.trigger('click');
    await settle();
    expect(tabbableIn(track(wrapper))).toEqual(controlsOf(slides[2]!));
    wrapper.unmount();
  });

  it('describes the whole carousel once, not every slide', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_CARD_SLIDES },
    });
    await settle();
    const instructions = wrapper.find('[data-part="instructions"]');
    expect(instructions.exists()).toBe(true);
    expect(instructions.text()).toBe(enUS.slideInstructions);
    expect(instructions.classes()).toContain('sr-only');
    // On the root, so it is read on entering the group and not once per slide the arrows walk
    // through; no slide carries a description of its own.
    expect(wrapper.attributes('aria-describedby')).toBe(instructions.attributes('id'));
    for (const slide of slidesOf(wrapper)) {
      expect(slide.getAttribute('aria-describedby')).toBeNull();
    }
    // Still announced as a carousel of slides, with the position spelled out (spec "Carousel" →
    // Accessibility), which is what pairs with the hint.
    expect(wrapper.attributes('aria-roledescription')).toBe('carousel');
    expect(slidesOf(wrapper)[1]?.getAttribute('aria-roledescription')).toBe('slide');
    expect(slidesOf(wrapper)[1]?.getAttribute('aria-label')).toBe(enUS.slideOf(2, 3));
    wrapper.unmount();
  });

  it('renders no instructions when the track itself is the tab stop', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Photo gallery' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    expect(wrapper.find('[data-part="instructions"]').exists()).toBe(false);
    expect(wrapper.attributes('aria-describedby')).toBeUndefined();
    wrapper.unmount();
  });

  /**
   * A1. A slide can hold something focusable that is not a *tab stop candidate* — an author's own
   * `tabindex="-1"` focus target (a heading a skip link moves to, a scroll box; this kit's own
   * blocks use the pattern), or a decorative link marked `aria-hidden="true"`. The value-blind
   * selector that decides which model the carousel is in counts both, so without a separate
   * entry-point rule the slide element was left at `-1` with nothing tabbable inside it: a
   * carousel with **no tab stop at all**, unreachable by keyboard wherever the arrows are hidden
   * because everything already fits.
   */
  it('makes the slide itself the stop when its only focusable content cannot take one', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default: `
          <li><h3 tabindex="-1">Alpha</h3></li>
          <li><h3 tabindex="-1">Bravo</h3></li>
        `,
      },
    });
    await settle();
    const slides = slidesOf(wrapper);
    expect(track(wrapper).getAttribute('tabindex')).toBeNull();
    expect(slides[0]?.getAttribute('tabindex')).toBe('0');
    expect(slides[1]?.getAttribute('tabindex')).toBe('-1');
    // Exactly one, never zero: the author's own `-1` heading is still not tabbable.
    expect(tabbableIn(track(wrapper))).toEqual([slides[0]]);

    await wrapper.find('[data-part="track"]').trigger('keydown', { key: 'ArrowRight' });
    await settle();
    expect(document.activeElement).toBe(slides[1]);
    expect(tabbableIn(track(wrapper))).toEqual([slides[1]]);
    wrapper.unmount();
  });

  it('never lands focus on aria-hidden content, taking the real control behind it', async () => {
    // The ordinary shape: a decorative image link ahead of the title link in the DOM.
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default: `
          <li>
            <a href="/alpha-image" aria-hidden="true" tabindex="-1">image</a>
            <a href="/alpha">Alpha</a>
          </li>
          <li>
            <a href="/bravo-image" aria-hidden="true" tabindex="-1">image</a>
            <a href="/bravo">Bravo</a>
          </li>
        `,
      },
    });
    await settle();
    const slides = slidesOf(wrapper);
    const title = (i: number) =>
      slides[i]!.querySelector<HTMLElement>('a[href]:not([aria-hidden="true"])')!;
    expect(tabbableIn(track(wrapper))).toEqual([title(0)]);

    title(0).focus();
    title(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    // Focus inside `aria-hidden="true"` announces nothing at all and is an axe `aria-hidden-focus`
    // failure, so the arrows step past it to the control a reader can actually hear.
    expect(document.activeElement).toBe(title(1));
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  /**
   * B1. `FOCUSABLE_SLIDE_CONTENT_SELECTOR` holds a bare `[tabindex]` on purpose: it is read both to
   * decide which model the carousel is in and to park the non-active slides' controls, so a
   * selector that excluded `[tabindex="-1"]` would stop matching the very elements the parking pass
   * had just written. This is that invariant as a test — a custom control (`div[tabindex="0"]`,
   * which only the bare `[tabindex]` matches) through two moves of the active slide. Narrow the
   * selector and the model collapses on the second move: the track becomes a second tab stop and
   * both controls are stranded at `-1`.
   */
  it('keeps the model stable across moves for a custom control with only a tabindex', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default: `
          <li><div role="button" tabindex="0">Alpha</div></li>
          <li><div role="button" tabindex="0">Bravo</div></li>
        `,
      },
    });
    await settle();
    const slides = slidesOf(wrapper);
    const control = (i: number) => slides[i]!.querySelector<HTMLElement>('[role="button"]')!;
    expect(track(wrapper).getAttribute('tabindex')).toBeNull();
    expect(tabbableIn(track(wrapper))).toEqual([control(0)]);

    await wrapper.find('[data-part="next"]').trigger('click');
    await settle();
    expect(track(wrapper).getAttribute('tabindex')).toBeNull();
    expect(tabbableIn(track(wrapper))).toEqual([control(1)]);

    await wrapper.find('[data-part="prev"]').trigger('click');
    await settle();
    expect(track(wrapper).getAttribute('tabindex')).toBeNull();
    // Back to the author's own `0`, not to the `-1` the parking pass wrote over it.
    expect(control(0).getAttribute('tabindex')).toBe('0');
    expect(control(1).getAttribute('tabindex')).toBe('-1');
    expect(tabbableIn(track(wrapper))).toEqual([control(0)]);
    wrapper.unmount();
  });

  /**
   * The subtree observer watches three attributes as well as children, because a control can stop
   * being a tab stop candidate without anything being added or removed: a quick-add button going
   * `disabled` while its variant is out of stock is the ordinary case. When it was the slide's only
   * control, the slide element has to take the stop over — otherwise that card holds none at all.
   */
  it('re-reads the model when a control is disabled in place', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default: `
          <li><button type="button">Add Alpha</button></li>
          <li><a href="/bravo">Bravo</a></li>
        `,
      },
    });
    await settle();
    const slides = slidesOf(wrapper);
    const button = slides[0]!.querySelector('button')!;
    expect(tabbableIn(track(wrapper))).toEqual([button]);
    expect(slides[0]?.getAttribute('tabindex')).toBeNull();

    button.setAttribute('disabled', '');
    await settle();
    await settle();
    expect(slides[0]?.getAttribute('tabindex')).toBe('0');
    expect(slides[0]?.classList.contains('eldra-focus')).toBe(true);
    expect(tabbableIn(track(wrapper))).toEqual([slides[0]]);
    wrapper.unmount();
  });

  /**
   * B4. A checkbox does not do anything with `←`/`→`, so claiming the keys for it only stopped the
   * row from moving, with nothing taking their place. Text-like inputs still own them — the spec
   * above this one.
   */
  it('still moves the row from a checkbox, which owns no horizontal arrows of its own', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default: `
          <li><a href="/alpha">Alpha</a><input type="checkbox" aria-label="Compare Alpha" /></li>
          <li><a href="/bravo">Bravo</a></li>
        `,
      },
    });
    await settle();
    const box = wrapper.find('input[type="checkbox"]').element as HTMLInputElement;
    box.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    box.dispatchEvent(event);
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted('change')).toEqual([[1]]);
    expect(document.activeElement).toBe(slidesOf(wrapper)[1]?.querySelector('a'));
    wrapper.unmount();
  });

  /**
   * `disabled` is inherited. A `<button>` inside a `<fieldset disabled>` carries no attribute of its
   * own and the platform refuses to focus it, so counting it as the slide's entry point left the
   * slide element without the stop and pointed the arrow keys at something that cannot take focus —
   * the zero-tab-stop case through a different door.
   */
  it('counts a control inside a disabled fieldset as no candidate, so the slide takes the stop', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default: `
          <li><fieldset disabled><button type="button">Add Alpha</button></fieldset></li>
          <li><a href="/bravo">Bravo</a></li>
        `,
      },
    });
    await settle();
    const slides = slidesOf(wrapper);
    expect(slides[0]?.getAttribute('tabindex')).toBe('0');
    expect(slides[0]?.classList.contains('eldra-focus')).toBe(true);
    expect(tabbableIn(track(wrapper))).toEqual([slides[0]]);

    await wrapper.find('[data-part="track"]').trigger('keydown', { key: 'ArrowRight' });
    await settle();
    expect(document.activeElement).toBe(slides[1]?.querySelector('a'));
    wrapper.unmount();
  });

  /**
   * "Never zero tab stops" is a promise about carousels that are reachable at all. One mounted
   * inside a *visible* `aria-hidden="true"` subtree — a decorative duplicate, a panel hidden from
   * the accessibility tree but not from the eye — is not: a tab stop there is the same
   * `aria-hidden-focus` violation the entry-point rule removes for controls, so the slide element
   * must not stand in for one either.
   */
  it('gives no slide a stop while the whole carousel is hidden from the accessibility tree', async () => {
    const wrapper = mountWith(
      {
        components: { Carousel },
        template: `
          <div aria-hidden="true">
            <Carousel aria-label="Decorative">
              <li><h3 tabindex="-1">Alpha</h3></li>
              <li><h3 tabindex="-1">Bravo</h3></li>
            </Carousel>
          </div>
        `,
      },
      {}
    );
    await settle();
    const trackEl = wrapper.find('[data-part="track"]').element as HTMLElement;
    const slides = Array.from(trackEl.children) as HTMLElement[];
    expect(trackEl.getAttribute('tabindex')).toBeNull();
    for (const slide of slides) {
      expect(slide.getAttribute('tabindex')).toBeNull();
      expect(slide.classList.contains('eldra-focus')).toBe(false);
    }
    expect(tabbableIn(trackEl)).toHaveLength(0);
    wrapper.unmount();
  });

  /**
   * An author can opt a control out of the tab sequence after mount. Because this composable parks
   * controls at `-1` itself, "the author wrote this" has to be told apart from "we wrote this": the
   * value last written by the pass is remembered, so a live value that differs from it can only be
   * somebody else's. Without that, the opt-out was restored away the moment its slide became active
   * and the control was chosen as the entry point — the composable contradicting an instruction.
   */
  it('takes a post-mount tabindex="-1" on a parked control as the author\'s own', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default: `
          <li><a href="/alpha">Alpha</a></li>
          <li><a href="/bravo-skip">Skip me</a><a href="/bravo">Bravo</a></li>
        `,
      },
    });
    await settle();
    const slides = slidesOf(wrapper);
    const skip = slides[1]!.querySelector<HTMLElement>('a[href="/bravo-skip"]')!;
    const bravo = slides[1]!.querySelector<HTMLElement>('a[href="/bravo"]')!;
    expect(skip.getAttribute('tabindex')).toBe('-1');

    skip.setAttribute('tabindex', '-1');
    await settle();
    await settle();
    await wrapper.find('[data-part="track"]').trigger('keydown', { key: 'ArrowRight' });
    await settle();
    // The author's own `-1` survives its slide becoming active, and the entry point is the link
    // behind it.
    expect(skip.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(bravo);
    expect(tabbableIn(track(wrapper))).toEqual([bravo]);
    wrapper.unmount();
  });

  /**
   * The subtree observer watches `tabindex`, which the pass writes itself, and an attribute write
   * queues a record even when the value is unchanged — so the pass runs with the observer
   * disconnected, or it feeds itself forever. One `disconnect()` is one pass, so counting them
   * states both halves at once: twelve slides changing in a single tick cost **one** pass, and that
   * pass disconnects. Without the disconnect the suite hangs rather than failing, which is how that
   * mutation shows up; this is the spec that says what the shape should be instead.
   */
  it('runs one disconnected pass for a whole burst of slot updates', async () => {
    const wrapper = mountWith(
      {
        components: { Carousel },
        props: ['items'],
        template: `
          <Carousel aria-label="Bestsellers">
            <li v-for="item in items" :key="item"><a :href="'/' + item">{{ item }}</a></li>
          </Carousel>
        `,
      },
      { props: { items: ['a'] } }
    );
    await settle();
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');

    await wrapper.setProps({
      items: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'],
    });
    await settle();

    expect(disconnect).toHaveBeenCalledTimes(1);
    const slides = slidesOf(wrapper);
    expect(slides).toHaveLength(12);
    // Converged, not merely cheap: one tab stop for the row, every other card parked.
    expect(tabbableIn(track(wrapper))).toEqual([slides[0]?.querySelector('a')]);
    disconnect.mockRestore();
    wrapper.unmount();
  });

  /**
   * The pass owns `eldra-focus` on a slide, which is a *public* utility a consumer may also have
   * asked for through `classes.slide`. Taking theirs away because this slide is not the tab stop
   * would be the component quietly overriding a style the consumer wrote.
   */
  it("keeps a consumer's own eldra-focus from classes.slide", async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers', classes: { slide: 'eldra-focus custom-slide' } },
      slots: { default: THREE_CARD_SLIDES },
    });
    await settle();
    for (const slide of slidesOf(wrapper)) {
      expect(slide.classList.contains('eldra-focus')).toBe(true);
      expect(slide.classList.contains('custom-slide')).toBe(true);
    }
    wrapper.unmount();
  });

  /**
   * Fix (2026-10-04, operator report "does the ring paint at all?"). `eldra-focus` is keyed to the
   * element's *own* `:focus-visible`, and in the roving model a slide that holds a control is not
   * focusable at all — so the ring a consumer asked for through `classes.slide` was drawn in full
   * by the computed style with `--eldra-focus-alpha: 0` and could never appear, on any interaction.
   * `eldra-focus-proxy` (`&:has(:focus-visible)`, `tailwind.css`'s "Proxy focus") is what turns it
   * on from the card's own link instead. Proven by mutation: dropping the `!stands && consumerRing`
   * half of the toggle in `syncFocusModel` leaves the class off every slide here.
   */
  it("adds eldra-focus-proxy beside a consumer's slide ring when the stop is inside the slide", async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers', classes: { slide: 'eldra-focus' } },
      slots: { default: THREE_CARD_SLIDES },
    });
    await settle();
    for (const slide of slidesOf(wrapper)) {
      expect(slide.classList.contains('eldra-focus')).toBe(true);
      expect(slide.classList.contains('eldra-focus-proxy')).toBe(true);
    }
    wrapper.unmount();
  });

  /**
   * The other half of the rule, and why there is never a ring inside a ring: a slide *is* the stop
   * only when it holds nothing focusable, and then its own `:focus-visible` lights the ring — a
   * proxy there would also light it from a descendant that cannot be focused in the first place.
   */
  it('leaves eldra-focus-proxy off a slide that is itself the tab stop', async () => {
    // A mixed row (a hero's linked and unlinked figures): the first slide holds nothing focusable,
    // so it stands in for a control and rings on its own `:focus-visible`; the second holds a link.
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default: `
          <li><figure>Alpha</figure></li>
          <li><a href="/bravo">Bravo</a></li>
        `,
      },
    });
    await settle();
    const slides = slidesOf(wrapper);
    expect(slides[0]?.getAttribute('tabindex')).toBe('0');
    expect(slides[0]?.classList.contains('eldra-focus')).toBe(true);
    expect(slides[0]?.classList.contains('eldra-focus-proxy')).toBe(false);
    // And the slide that holds the link rings neither way: its card is what carries a ring.
    expect(slides[1]?.classList.contains('eldra-focus')).toBe(false);
    expect(slides[1]?.classList.contains('eldra-focus-proxy')).toBe(false);
    wrapper.unmount();
  });

  it('has no axe violations with cards in the slides', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_CARD_SLIDES, header: '<h2>Bestsellers</h2>' },
    });
    await settle();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Carousel — slide geometry measured from an outer offsetParent', () => {
  it('scrolls to and re-syncs against the slide start relative to the track, not the page', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers', counter: true },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    // A consumer's `classes.track` dropped the track's own positioning: every slide now reports its
    // `offsetLeft` from an ancestor 200px further left, and so does the track.
    Object.defineProperty(trackEl, 'offsetLeft', { value: 200, configurable: true });
    slidesOf(wrapper).forEach((slide, i) => {
      Object.defineProperty(slide, 'offsetLeft', { value: 200 + i * 100, configurable: true });
      Object.defineProperty(slide, 'offsetParent', { value: document.body, configurable: true });
    });
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    trackEl.scrollTo = vi.fn();

    await wrapper.find('[data-part="next"]').trigger('click');
    await settle();
    expect(trackEl.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 100 }));
    expect(wrapper.find('[data-part="counter"]').text()).toContain('2');

    // The snap settles the track on slide 2 (scrollLeft 100): the settle sync must keep index 1
    // rather than falling back to slide 1 (whose page offset of 200 is nearer to 100 than 300 is).
    Object.defineProperty(trackEl, 'scrollLeft', {
      value: 100,
      configurable: true,
      writable: true,
    });
    vi.useFakeTimers();
    try {
      trackEl.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(100);
    } finally {
      vi.useRealTimers();
    }
    await settle();
    expect(wrapper.find('[data-part="counter"]').text()).toContain('2');
    wrapper.unmount();
  });
});

describe('Carousel — reduced motion', () => {
  it('scrolls instantly instead of smoothly', async () => {
    const original = window.matchMedia;
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    trackEl.scrollTo = vi.fn();
    await wrapper.find('[data-part="next"]').trigger('click');
    await settle();
    expect(trackEl.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    wrapper.unmount();
    window.matchMedia = original;
  });
});

describe('Carousel — narrow (peek)', () => {
  it('renders in a 20rem container with no overflow, showing a peek of the next slide', async () => {
    const wrapper = mountNarrow(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    expect(track(wrapper).style.getPropertyValue('--eldra-carousel-per-view-base')).toBe('1.25');
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Carousel — pointer drag', () => {
  it('crosses the 6px threshold and moves scrollLeft 1:1 with the pointer, marking the track dragging', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 80, pointerId: 1 }, 10));
    expect(trackEl.scrollLeft).toBe(20);
    expect(trackEl.getAttribute('data-dragging')).toBe('true');
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 80, pointerId: 1 }, 20));
    wrapper.unmount();
  });

  /**
   * Operator fix (2026-09-26): "swiping/dragging ... starts and then kind of cancels" traced to
   * `scroll-behavior: smooth` fighting the drag's own instant `scrollLeft` writes — `scroll-auto`
   * (alongside the existing `snap-none`) must ride the same `data-dragging` attribute so it turns
   * off for the drag's duration; `select-none` on the same attribute is the track's own half of the
   * text-selection fix (the `document.documentElement` half is proven separately below); `touch-
   * pan-x` alongside the existing `touch-pan-y` is what restores native horizontal touch swipe
   * (`touch-pan-y` alone told the browser to handle only the vertical axis, leaving horizontal touch
   * events to a handler that deliberately ignores `pointerType === 'touch'`).
   */
  it('carries scroll-auto/select-none on data-dragging and pan-x/pan-y touch-action on the track', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const classes = track(wrapper).className;
    expect(classes).toContain('data-[dragging=true]:scroll-auto');
    expect(classes).toContain('data-[dragging=true]:select-none');
    expect(classes).toContain('touch-pan-x');
    expect(classes).toContain('touch-pan-y');
    wrapper.unmount();
  });

  /**
   * Fix (2026-10-04, operator report): a focused slide's `eldra-focus` ring was clipped flat on
   * every side but the one facing a neighbouring slide. `overflow-x-auto` forces `overflow-y` to
   * compute `auto` too, so the track clipped the ring (an outline/box-shadow pair drawn outside a
   * slide's own box) at its own edges. The track now carries matching padding and a negative
   * margin of the same size (so its rendered footprint is unchanged) plus a matching scroll
   * padding (so `scroll-snap-align: start` still lands on a slide's own edge, not the new padding
   * in front of it) — all three sized from the same `--eldra-focus-offset`/`--eldra-focus-width`
   * pair the ring itself reads, not a literal guess.
   */
  it('reserves room for a slide ring with padding, a matching negative margin and scroll padding', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const classes = track(wrapper).className;
    expect(classes).toContain(`py-[${RING_REACH}]`);
    expect(classes).toContain(`-my-[${RING_REACH}]`);
    expect(classes).toContain(`px-[${INLINE_RESERVE}]`);
    expect(classes).toContain(`-mx-[${INLINE_RESERVE}]`);
    expect(classes).toContain(`scroll-px-[${INLINE_RESERVE}]`);
    // And never the uniform `p-*`/`-m-*` pair this replaced: a consumer's own `px-*` is a different
    // `tailwind-merge` group from `p-*`, so both survived the merge and `padding-inline` — which
    // Tailwind emits after `padding` — won in the cascade, leaving `padding-left: 0`.
    expect(classes).not.toMatch(/(^|\s)-?p-\[/);
    expect(classes).not.toMatch(/(^|\s)-?m-\[/);
    wrapper.unmount();
  });

  /**
   * Fix (2026-10-04, second operator report: at 1440px the first card's ring was still cut off flat
   * on its left edge while the top and right ones drew — measured `padding-top: 6px`,
   * `padding-left: 0px` on the deployed track). The inline gutter a bleeding block needs is a
   * variable now, not a padding utility it writes itself, so the reservation and the gutter compose
   * into one `max()` instead of one silently replacing the other. A custom-property declaration
   * shares a merge group with nothing, so every part of the reservation survives `classes.track`.
   */
  it('keeps the whole ring reservation when a consumer sets the bleed through classes.track', async () => {
    const wrapper = mountWith(Carousel, {
      props: {
        ariaLabel: 'Bestsellers',
        classes: { track: '[--eldra-carousel-bleed:var(--eldra-gutter-mobile)]' },
      },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const classes = track(wrapper).className;
    expect(classes).toContain('[--eldra-carousel-bleed:var(--eldra-gutter-mobile)]');
    for (const reserved of [
      `py-[${RING_REACH}]`,
      `-my-[${RING_REACH}]`,
      `px-[${INLINE_RESERVE}]`,
      `-mx-[${INLINE_RESERVE}]`,
      `scroll-px-[${INLINE_RESERVE}]`,
    ]) {
      expect(classes).toContain(reserved);
    }
    wrapper.unmount();
  });

  /**
   * The failure the fix is really about, at the level a class list can see it: the gutter utilities
   * a block used to pass take `px-*`/`-mx-*`/`scroll-px-*` away from the track — `scroll-px-*`
   * visibly (same merge group, so `tailwind-merge` drops the package's) and the other two in the
   * cascade. Nothing stops a consumer writing them, so this records what it costs: the inline axis
   * is theirs, and with it the ring's reach on that axis.
   */
  it("a consumer's own inline padding still takes over the inline axis — the documented reason not to", async () => {
    const wrapper = mountWith(Carousel, {
      props: {
        ariaLabel: 'Bestsellers',
        classes: {
          track: 'px-[var(--eldra-gutter-mobile)] scroll-px-[var(--eldra-gutter-mobile)]',
        },
      },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const classes = track(wrapper).className;
    expect(classes).not.toContain(`scroll-px-[${INLINE_RESERVE}]`);
    // The block axis is untouched either way, which is why only the inline one was ever clipped.
    expect(classes).toContain(`py-[${RING_REACH}]`);
    wrapper.unmount();
  });

  /**
   * Operator fix (2026-09-26, round 2): "Do NOT preventDefault() the pointerdown (keep native
   * focus/click behaviour)" — round one's `preventDefault()` on every qualifying pointerdown is
   * gone entirely, proven on both a pointerdown that may go on to start a drag (the track's own
   * background) and one landing directly on a slide's own link (round one refused to track this
   * pointer at all and asserted the identical `false` for the opposite reason — see the drag-starts-
   * on-a-link specs below for what tracking it now actually does).
   */
  it('never prevents default on pointerdown — native focus/click behaviour is kept', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default:
          '<li><a href="/products/1" data-testid="details">Details</a></li><li>Bravo</li><li>Charlie</li>',
      },
    });
    await settle();
    const trackEl = track(wrapper);
    const trackDown = pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0);
    trackEl.dispatchEvent(trackDown);
    expect(trackDown.defaultPrevented).toBe(false);
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 100, pointerId: 1 }, 10));

    const linkEl = wrapper.find('[data-testid="details"]').element as HTMLAnchorElement;
    const linkDown = pointerEventAt('pointerdown', { clientX: 50, pointerId: 2, button: 0 }, 20);
    linkEl.dispatchEvent(linkDown);
    expect(linkDown.defaultPrevented).toBe(false);
    linkEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 50, pointerId: 2 }, 30));
    wrapper.unmount();
  });

  /**
   * Operator ruling (2026-09-26, round 2): "we are not able to drag on a card, we have to place the
   * cursor between cards ... if it's a clickable entry we should cancel the click ... if we swipe
   * over some offset. That way the click stays functional but we can still swipe." Starting the
   * pointerdown directly on a slide's own link, then crossing the 6px threshold, both starts the
   * drag (`scrollLeft`/`data-dragging`) and arms the same click suppression a drag starting on the
   * track's bare background already gets — proven by mutation: reinstating round one's
   * `isInteractiveDescendant` bail-out in `onTrackPointerDown` leaves `scrollLeft` at `0` and the
   * click un-prevented.
   */
  it('a drag starting directly on a slide’s own link crosses the threshold and cancels the link’s click', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default:
          '<li><a href="/products/1" data-testid="details">Details</a></li><li>Bravo</li><li>Charlie</li>',
      },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    const linkEl = wrapper.find('[data-testid="details"]').element as HTMLAnchorElement;
    const handler = vi.fn();
    linkEl.addEventListener('click', handler);
    linkEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 200, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 160, pointerId: 1 }, 10));
    expect(trackEl.scrollLeft).toBe(40);
    expect(trackEl.getAttribute('data-dragging')).toBe('true');
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 160, pointerId: 1 }, 20));
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    linkEl.dispatchEvent(clickEvent);
    expect(handler).not.toHaveBeenCalled();
    expect(clickEvent.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  /**
   * The other half of the same ruling: "the click stays functional" below the threshold, even when
   * the pointerdown that may have started a drag landed directly on the link itself.
   */
  it('a sub-threshold drag starting directly on a slide’s own link leaves its click alone', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default:
          '<li><a href="/products/1" data-testid="details">Details</a></li><li>Bravo</li><li>Charlie</li>',
      },
    });
    await settle();
    const trackEl = track(wrapper);
    const linkEl = wrapper.find('[data-testid="details"]').element as HTMLAnchorElement;
    const handler = vi.fn();
    linkEl.addEventListener('click', handler);
    linkEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 200, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 197, pointerId: 1 }, 5));
    linkEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 197, pointerId: 1 }, 10));
    expect(trackEl.hasAttribute('data-dragging')).toBe(false);
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    linkEl.dispatchEvent(clickEvent);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(clickEvent.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  /**
   * `isNoDragTarget`'s editable-control carve-out — an `<input>` must never lose a click/typing
   * gesture to the drag machinery, unlike a plain link or button. Proven by mutation: dropping the
   * `input` clause from `isNoDragTarget`'s selector turns `scrollLeft` below into `60`.
   */
  it('pointerdown on an <input> inside a slide never starts a drag', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: '<li><input data-testid="qty" /></li><li>Bravo</li><li>Charlie</li>' },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    const inputEl = wrapper.find('[data-testid="qty"]').element as HTMLInputElement;
    inputEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 40, pointerId: 1 }, 10));
    inputEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 40, pointerId: 1 }, 20));
    expect(trackEl.scrollLeft).toBe(0);
    expect(trackEl.hasAttribute('data-dragging')).toBe(false);
    wrapper.unmount();
  });

  /**
   * `data-no-drag` — an author's explicit opt-out (ruling: "and any element with `data-no-drag`"),
   * for a slide's own control that needs every pointer gesture for itself (a swatch picker, an
   * embedded range slider) even though it is neither an editable nor a `<input>`-family element.
   * Proven by mutation: dropping `[data-no-drag]` from `isNoDragTarget`'s selector turns
   * `scrollLeft` below into `60`.
   */
  it('data-no-drag opts an element out of starting a drag', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default:
          '<li><div data-testid="swatches" data-no-drag>Swatches</div></li><li>Bravo</li><li>Charlie</li>',
      },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    const swatchesEl = wrapper.find('[data-testid="swatches"]').element as HTMLElement;
    swatchesEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 40, pointerId: 1 }, 10));
    swatchesEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 40, pointerId: 1 }, 20));
    expect(trackEl.scrollLeft).toBe(0);
    expect(trackEl.hasAttribute('data-dragging')).toBe(false);
    wrapper.unmount();
  });

  /**
   * Operator fix (2026-09-26, round 2): the other half of "while dragging we are highlighting
   * stuff" now that `onTrackPointerDown` no longer prevents the pointerdown's default — a press over
   * selectable text has already anchored a native selection by the time a real drag is confirmed, so
   * `onTrackPointerMove` clears it (`window.getSelection()?.removeAllRanges()`) the instant the
   * threshold crosses, not before. Proven by mutation: deleting that call leaves `removeAllRanges`
   * uncalled below.
   */
  it('clears any started text selection the instant the drag threshold crosses', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    const removeAllRanges = vi.fn();
    const getSelectionSpy = vi
      .spyOn(window, 'getSelection')
      .mockReturnValue({ removeAllRanges } as unknown as Selection);
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 97, pointerId: 1 }, 5));
    expect(removeAllRanges).not.toHaveBeenCalled();
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 80, pointerId: 1 }, 10));
    expect(removeAllRanges).toHaveBeenCalledTimes(1);
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 80, pointerId: 1 }, 20));
    getSelectionSpy.mockRestore();
    wrapper.unmount();
  });

  /**
   * Real-browser bug this guards the *shape* of (the actual retargeting behaviour is only provable
   * in a real Chromium — see `scripts/drag-smoke.mjs`'s own "plain click on card title link" check,
   * happy-dom implements `setPointerCapture` as a no-op with no click-retargeting side effect of its
   * own to observe): a mouse pointer's capture retargets its eventual `click` to the *capturing*
   * element too, not only `pointermove`/`pointerup`. Requesting capture unconditionally on every
   * qualifying `pointerdown` broke a plain, never-moved click on a slide's own link/button, because
   * the click fired with `event.target` retargeted away from the link to the track. Capture must
   * only be requested once the gesture is a confirmed drag. Proven by mutation: moving the
   * `setPointerCapture` call back into `onTrackPointerDown` turns the first assertion below red.
   */
  it('defers pointer capture to the confirmed-drag moment, not the initial pointerdown', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    const captureSpy = vi.spyOn(trackEl, 'setPointerCapture');
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    expect(captureSpy).not.toHaveBeenCalled();
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 97, pointerId: 1 }, 5));
    expect(captureSpy).not.toHaveBeenCalled();
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 80, pointerId: 1 }, 10));
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy).toHaveBeenCalledWith(1);
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 80, pointerId: 1 }, 20));
    wrapper.unmount();
  });

  /**
   * Operator fix (2026-09-26): the belt-and-braces half of the text-selection fix —
   * `document.documentElement`'s own `user-select` is suppressed for the drag's duration (the
   * pointer can leave the track mid-drag, past the track's own `select-none`) and restored once the
   * drag ends, whether that end is a plain `pointerup` or (proven in the `lostpointercapture` spec
   * below) capture being revoked with no preceding `pointerup`/`pointercancel` at all.
   */
  it('suppresses document.documentElement user-select while dragging, restoring it on pointerup', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    expect(document.documentElement.style.userSelect).toBe('');
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 80, pointerId: 1 }, 10));
    expect(document.documentElement.style.userSelect).toBe('none');
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 80, pointerId: 1 }, 20));
    await settle();
    expect(document.documentElement.style.userSelect).toBe('');
    wrapper.unmount();
  });

  it('release snaps to the nearest slide by position, clears data-dragging and emits change', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    stubSlideOffsets(wrapper); // slide offsets 0, 100, 200
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    // scrollLeft lands at 130 — closer to slide 1 (offset 100, distance 30) than slide 2 (offset
    // 200, distance 70) — and the second, stationary sample keeps the release velocity at 0, so
    // no flick bias applies (see the next spec for that).
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: -30, pointerId: 1 }, 10));
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: -30, pointerId: 1 }, 40));
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: -30, pointerId: 1 }, 50));
    await settle();
    expect(trackEl.hasAttribute('data-dragging')).toBe(false);
    expect(wrapper.emitted('change')).toEqual([[1]]);
    wrapper.unmount();
  });

  it('a fast flick advances one slide further than the release position alone', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    stubSlideOffsets(wrapper); // slide offsets 0, 100, 200
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 70, pointerId: 1 }, 5));
    // The final sample moves 40px in 1ms — a -40 px/ms flick, well past the 0.5 px/ms line.
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 30, pointerId: 1 }, 6));
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 30, pointerId: 1 }, 7));
    await settle();
    // scrollLeft lands at 70, whose nearest slide by position alone is slide 1 (offset 100,
    // distance 30, vs. slide 0's distance 70) — the flick pushes one further, straight to slide 2.
    // Proven by mutation: deleting `endTrackDrag`'s velocity `if`/`else if` pair lands this on
    // slide 1 instead (the previous spec's own scenario).
    expect(wrapper.emitted('change')).toEqual([[2]]);
    wrapper.unmount();
  });

  it('a rightward flick moves one slide further back than the release position alone', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    stubSlideOffsets(wrapper); // slide offsets 0, 100, 200
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 400, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 100, pointerId: 1 }, 5));
    // The final sample moves 110px in 1ms rightward (100 -> 210) — a +110 px/ms flick, well past
    // the 0.5 px/ms line the other direction from the existing leftward-flick spec above. Release
    // scrollLeft (400 - 210 = 190) is nearest slide 2 (offset 200, distance 10, vs. slide 1's
    // distance 90) before any flick adjustment.
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 210, pointerId: 1 }, 6));
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 210, pointerId: 1 }, 7));
    await settle();
    // The rightward flick nudges one slide further *back* than the merely-nearest slide 2, landing
    // on slide 1. Proven by mutation: deleting the `velocity > FLICK_VELOCITY_PX_MS` branch lands
    // this on slide 2 instead.
    expect(wrapper.emitted('change')).toEqual([[1]]);
    wrapper.unmount();
  });

  it('lostpointercapture mid-drag ends the drag exactly like pointercancel — snaps, clears data-dragging, resumes autoplay', async () => {
    vi.useFakeTimers();
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery', autoplay: 1000 },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    stubSlideOffsets(wrapper); // slide offsets 0, 100, 200
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    // Crosses the threshold, landing scrollLeft at 130 — nearest slide 1 (see the release spec
    // above) — with a stationary final sample so no flick bias applies.
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: -30, pointerId: 1 }, 10));
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: -30, pointerId: 1 }, 40));
    expect(trackEl.getAttribute('data-dragging')).toBe('true');
    expect(document.documentElement.style.userSelect).toBe('none');
    // The browser revokes capture with no preceding pointerup/pointercancel — an edge-swipe
    // gesture, another element stealing capture, the captured element becoming disabled. Without
    // a `lostpointercapture` listener, `endTrackDrag` never runs and the drag state (and autoplay
    // suspension) is stuck forever.
    trackEl.dispatchEvent(pointerEventAt('lostpointercapture', { clientX: -30, pointerId: 1 }, 41));
    await settle();
    expect(trackEl.hasAttribute('data-dragging')).toBe(false);
    // `document.documentElement`'s own `user-select` override is restored on `lostpointercapture`
    // exactly like on a plain `pointerup` — proven in the dedicated pointerup spec above; this
    // proves the "stuck forever" hazard that spec's own comment describes doesn't apply here either.
    expect(document.documentElement.style.userSelect).toBe('');
    expect(wrapper.emitted('change')).toEqual([[1]]);
    // Autoplay resumes — proven the same way the pointerup pause/resume spec above proves it: the
    // timer fires again after release.
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.emitted('change')).toEqual([[1], [2]]);
    wrapper.unmount();
  });

  it('a sub-threshold drag still lets a slide’s own button click through', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default:
          '<li><button type="button" data-testid="buy">Buy</button></li><li>Bravo</li><li>Charlie</li>',
      },
    });
    await settle();
    const trackEl = track(wrapper);
    const buttonEl = wrapper.find('[data-testid="buy"]').element as HTMLButtonElement;
    const handler = vi.fn();
    buttonEl.addEventListener('click', handler);
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 103, pointerId: 1 }, 5));
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 103, pointerId: 1 }, 10));
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    buttonEl.dispatchEvent(clickEvent);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(clickEvent.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  /**
   * Operator ruling (2026-09-26, round 2): "buttons and links included" — a drag starting directly
   * on a slide's own button behaves exactly like one starting on its own link (the dedicated link
   * specs above): crossing the threshold drags the track and cancels the button's own click.
   * Proven by mutation: reinstating round one's `isInteractiveDescendant` bail-out in
   * `onTrackPointerDown` leaves `scrollLeft` at `0` and the click un-prevented.
   */
  it('drag starting directly on an inner button also drags and cancels the button’s click', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default:
          '<li><button type="button" data-testid="buy">Buy</button></li><li>Bravo</li><li>Charlie</li>',
      },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    const buttonEl = wrapper.find('[data-testid="buy"]').element as HTMLButtonElement;
    const handler = vi.fn();
    buttonEl.addEventListener('click', handler);
    buttonEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 40, pointerId: 1 }, 10));
    expect(trackEl.scrollLeft).toBe(60);
    expect(trackEl.getAttribute('data-dragging')).toBe('true');
    buttonEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 40, pointerId: 1 }, 20));
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    buttonEl.dispatchEvent(clickEvent);
    expect(handler).not.toHaveBeenCalled();
    expect(clickEvent.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it('cancels the click that follows a real drag, wherever the pointer lands', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: {
        default:
          '<li><button type="button" data-testid="buy">Buy</button></li><li>Bravo</li><li>Charlie</li>',
      },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    const buttonEl = wrapper.find('[data-testid="buy"]').element as HTMLButtonElement;
    const handler = vi.fn();
    buttonEl.addEventListener('click', handler);
    // The drag starts on the track's own background (not the button), crosses the threshold, and
    // happens to release with the pointer over the button — the ordinary shape of a real mouse
    // drag that ends over a slide's own link.
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 200, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 100, pointerId: 1 }, 10));
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 100, pointerId: 1 }, 20));
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    buttonEl.dispatchEvent(clickEvent);
    expect(handler).not.toHaveBeenCalled();
    expect(clickEvent.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it('draggable: false disables pointer drag entirely', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers', draggable: false },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 40, pointerId: 1 }, 10));
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 40, pointerId: 1 }, 20));
    expect(trackEl.scrollLeft).toBe(0);
    expect(trackEl.hasAttribute('data-dragging')).toBe(false);
    wrapper.unmount();
  });

  it('pauses autoplay while dragging and resumes after release, without flipping the Pause label', async () => {
    vi.useFakeTimers();
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery', autoplay: 1000 },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const trackEl = track(wrapper);
    stubOverflow(trackEl, { scrollWidth: 300, clientWidth: 100, scrollLeft: 0 });
    trackEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 93, pointerId: 1 }, 10));
    // A second, stationary sample zeroes the release velocity — this spec is only about the
    // pause/resume timing, not the flick bias the earlier specs already cover — so the release
    // below lands back on the (untouched, still tied at slide 0) nearest slide and emits nothing
    // of its own.
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 93, pointerId: 1 }, 15));
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(wrapper.emitted('change')).toBeUndefined();
    expect(wrapper.find('[data-part="pause"]').text()).toBe(enUS.pause);
    trackEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 93, pointerId: 1 }, 5020));
    await settle();
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.emitted('change')).toEqual([[1]]);
    wrapper.unmount();
  });
});

describe('Carousel — accessibility', () => {
  it('has no axe violations, header controls', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers' },
      slots: { default: THREE_SLIDES, header: '<h2>Bestsellers</h2>' },
    });
    await settle();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations, gallery with dots, counter and autoplay', async () => {
    const wrapper = mountWith(Carousel, {
      props: {
        ariaLabel: 'Photo gallery',
        controls: 'below',
        dots: true,
        counter: true,
        autoplay: 6000,
      },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
