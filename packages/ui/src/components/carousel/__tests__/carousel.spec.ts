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
  it('renders a labelled region with a focusable track', async () => {
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

describe('Carousel — perView CSS variables', () => {
  it('sets the base per-view variable for a plain number', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery', perView: 1 },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    expect(track(wrapper).className).toContain('[--eldra-carousel-per-view:1]');
    wrapper.unmount();
  });

  it('defaults to 1.25 when perView is not given', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Gallery' },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    expect(track(wrapper).className).toContain('[--eldra-carousel-per-view:1.25]');
    wrapper.unmount();
  });

  it('sets @tablet/@content variants for a per-breakpoint object', async () => {
    const wrapper = mountWith(Carousel, {
      props: { ariaLabel: 'Bestsellers', perView: { base: 1.25, md: 3, lg: 4 } },
      slots: { default: THREE_SLIDES },
    });
    await settle();
    const className = track(wrapper).className;
    expect(className).toContain('[--eldra-carousel-per-view:1.25]');
    expect(className).toContain('@tablet:[--eldra-carousel-per-view:3]');
    expect(className).toContain('@content:[--eldra-carousel-per-view:4]');
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
    expect(track(wrapper).className).toContain('[--eldra-carousel-per-view:1.25]');
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

  it('drag starting on an inner button does nothing — the button keeps its own click', async () => {
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
    // Started on the button itself — `isInteractiveDescendant` refuses to track this pointer at
    // all, proven by mutation: removing that guard in `onTrackPointerDown` turns `scrollLeft`
    // below into `60` instead of staying put.
    buttonEl.dispatchEvent(
      pointerEventAt('pointerdown', { clientX: 100, pointerId: 1, button: 0 }, 0)
    );
    trackEl.dispatchEvent(pointerEventAt('pointermove', { clientX: 40, pointerId: 1 }, 10));
    buttonEl.dispatchEvent(pointerEventAt('pointerup', { clientX: 40, pointerId: 1 }, 20));
    expect(trackEl.scrollLeft).toBe(0);
    expect(trackEl.hasAttribute('data-dragging')).toBe(false);
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    buttonEl.dispatchEvent(clickEvent);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(clickEvent.defaultPrevented).toBe(false);
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
