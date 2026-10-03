// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { enUS as uiEnUS } from '@eldrajs/ui';
import { axe } from './support/axe';
import { mountOptions } from './support/mountBlock';
import ProductCarouselBlock from '../blocks/product-carousel/Block.vue';
import productCarouselMock from '../blocks/product-carousel/mock.json';
import GalleryBlock from '../blocks/gallery/Block.vue';
import galleryMock from '../blocks/gallery/mock.json';
import galleryPreview from '../blocks/gallery/preview.json';
import HeroBlock from '../blocks/hero/Block.vue';
import heroMock from '../blocks/hero/mock.json';
import heroPreview from '../blocks/hero/preview.json';
import TestimonialsBlock from '../blocks/testimonials/Block.vue';
import testimonialsMock from '../blocks/testimonials/mock.json';

/**
 * The carousel keyboard across every block that renders `@eldrajs/ui`'s `Carousel`
 * (product-carousel, gallery, hero's `split-carousel`, testimonials).
 *
 * The component's own specs cover the model in isolation; this file is about what the model does
 * to real slide content — a `ProductCard`'s stretched title link, a gallery tile's "view larger"
 * button, a hero figure wrapped in a link, a testimonial card with nothing to activate at all.
 * Which keyboard a carousel gets is decided by that content and nothing else (no prop chooses it),
 * so this is the only place where the choice is tested against the markup the blocks really ship:
 *
 * - a slide holding something focusable ⇒ **roving**: one entry point for the whole row (the
 *   active slide's first control), `←`/`→` move between slides, `Tab` moves *within* the active
 *   slide and then straight out of the carousel, never into the next card;
 * - no slide holding anything focusable ⇒ the **track** stays the one tab stop with `←`/`→`
 *   stepping it, which is the shape the spec names for a single-slide gallery.
 *
 * Lives in `test/` rather than in each block's own `__tests__/` on purpose: it is one rule shared
 * by four blocks, and reading it in one file is what makes "every card is a tab stop" impossible
 * to reintroduce in one of them without noticing.
 */

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
});

function mountBlock(
  component: Parameters<typeof mount>[0],
  data: Record<string, unknown>
): VueWrapper {
  const wrapper = mount(component, {
    ...mountOptions({ entry: { id: 'e1', data } }),
    attachTo: document.body,
  }) as VueWrapper;
  wrappers.push(wrapper);
  return wrapper;
}

function track(wrapper: VueWrapper): HTMLElement {
  return wrapper.get('[data-part="track"]').element as HTMLElement;
}

function slides(wrapper: VueWrapper): HTMLElement[] {
  return Array.from(track(wrapper).children) as HTMLElement[];
}

/**
 * Everything inside `el` that `Tab` would really stop on: natively focusable elements plus
 * anything carrying an explicit `tabindex`, minus whatever sits at `-1`. Every claim below is a
 * claim about this list — "one tab stop", "Tab leaves the carousel" and "never the next card" are
 * all statements about what is tabbable and in which order, which no single attribute can show.
 */
function tabbableIn(el: HTMLElement): HTMLElement[] {
  const candidates = el.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]'
  );
  return Array.from(candidates).filter((node) => node.getAttribute('tabindex') !== '-1');
}

function press(from: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  from.dispatchEvent(event);
  return event;
}

describe('product-carousel — one tab stop for the whole row', () => {
  it('leaves only the active card in the tab sequence, and its own controls inside it', async () => {
    const wrapper = mountBlock(ProductCarouselBlock, productCarouselMock);
    await flushPromises();
    const cards = slides(wrapper);
    expect(cards.length).toBeGreaterThan(2);

    // The track is not a stop of its own any more: the old model stopped once for the track and
    // then once per card, so reaching the content below a six-card row took seven presses.
    expect(track(wrapper).getAttribute('tabindex')).toBeNull();
    const tabbable = tabbableIn(track(wrapper));
    expect(tabbable).toEqual(
      Array.from(cards[0]!.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
    );
    // The product's own link is where the arrows land and what `Enter` then follows.
    expect(tabbable[0]).toBe(cards[0]!.querySelector('[data-part="link"]'));
    for (const card of cards.slice(1)) expect(tabbableIn(card)).toHaveLength(0);
  });

  it('hands Tab out of the carousel from the active card, never to the next card', async () => {
    const wrapper = mountBlock(ProductCarouselBlock, productCarouselMock);
    await flushPromises();
    const cards = slides(wrapper);
    const all = tabbableIn(wrapper.element as HTMLElement);
    const inside = tabbableIn(track(wrapper));

    // Everything tabbable in the whole block, in document order: the heading link and the two
    // arrows (all before the track), then exactly the active card's own controls — and nothing
    // after them, so the next `Tab` leaves the block for the page below.
    expect(all.slice(all.length - inside.length)).toEqual(inside);
    for (const node of inside) expect(cards[0]!.contains(node)).toBe(true);
    // Shift+Tab from the first control leaves the same way: nothing tabbable sits between it and
    // the arrows outside the track.
    expect(all[all.length - inside.length - 1]).toBe(
      wrapper.get('[data-part="next"]').element as HTMLElement
    );
  });

  it('moves between cards with the arrow keys from inside a card, and follows with focus', async () => {
    const wrapper = mountBlock(ProductCarouselBlock, productCarouselMock);
    await flushPromises();
    const cards = slides(wrapper);
    const link = (i: number) => cards[i]!.querySelector<HTMLElement>('[data-part="link"]')!;
    link(0).focus();
    expect(document.activeElement).toBe(link(0));

    press(link(0), 'ArrowRight');
    await nextTick();
    expect(document.activeElement).toBe(link(1));
    expect(tabbableIn(cards[0]!)).toHaveLength(0);
    expect(tabbableIn(cards[1]!).length).toBeGreaterThan(0);

    press(link(1), 'End');
    await nextTick();
    expect(document.activeElement).toBe(link(cards.length - 1));

    // Clamped, never wrapping — the arrow buttons and dots do not wrap either.
    press(link(cards.length - 1), 'ArrowRight');
    await nextTick();
    expect(document.activeElement).toBe(link(cards.length - 1));

    press(link(cards.length - 1), 'Home');
    await nextTick();
    expect(document.activeElement).toBe(link(0));
  });

  it('leaves Enter on a card’s link to the browser', async () => {
    const wrapper = mountBlock(ProductCarouselBlock, productCarouselMock);
    await flushPromises();
    const link = slides(wrapper)[0]!.querySelector<HTMLElement>('[data-part="link"]')!;
    link.focus();
    // Nothing intercepts it: the focused element is the product link, and the browser's own
    // activation is the navigation the shopper expects.
    expect(press(link, 'Enter').defaultPrevented).toBe(false);
    expect(press(link, ' ').defaultPrevented).toBe(false);
  });

  it('describes the carousel once for a screen reader, and stays axe-clean', async () => {
    const wrapper = mountBlock(ProductCarouselBlock, productCarouselMock);
    await flushPromises();
    const carousel = wrapper.get('[aria-roledescription="carousel"]');
    const instructions = wrapper.get('[data-part="instructions"]');
    expect(instructions.text()).toBe(uiEnUS.slideInstructions);
    // On the carousel root, so it is announced on entering the row rather than again on every
    // card the arrow keys walk through.
    expect(carousel.attributes('aria-describedby')).toBe(instructions.attributes('id'));
    for (const card of slides(wrapper)) {
      expect(card.getAttribute('aria-roledescription')).toBe('slide');
      expect(card.getAttribute('aria-describedby')).toBeNull();
    }
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});

describe('gallery — the tile button is the entry point', () => {
  it('parks every tile but the active one, and opens the lightbox from the active tile', async () => {
    // `mock.json` is Studio's insert seed, captions only — a tile without an image renders a
    // hint, not a button, so the demo imagery overlay is what gives this carousel real tiles.
    const wrapper = mountBlock(GalleryBlock, {
      ...galleryMock,
      ...galleryPreview,
      variant: 'carousel',
    });
    await flushPromises();
    const tiles = slides(wrapper);
    expect(track(wrapper).getAttribute('tabindex')).toBeNull();
    const first = tiles[0]!.querySelector<HTMLButtonElement>('button')!;
    expect(tabbableIn(track(wrapper))).toEqual([first]);

    first.focus();
    press(first, 'ArrowRight');
    await nextTick();
    const second = tiles[1]!.querySelector<HTMLButtonElement>('button')!;
    expect(document.activeElement).toBe(second);
    expect(first.getAttribute('tabindex')).toBe('-1');

    // Its own `keydown.enter` still opens the viewer — the carousel never took the key.
    expect(press(second, 'Enter').defaultPrevented).toBe(true);
    await nextTick();
    expect(wrapper.get('dialog').attributes('open')).toBe('');
  });
});

describe('hero split-carousel — linked and unlinked slides in one row', () => {
  it('gives the active slide one entry point whether or not it holds a link', async () => {
    const wrapper = mountBlock(HeroBlock, {
      ...heroMock,
      ...heroPreview,
      variant: 'split-carousel',
      slides: [{ ...heroPreview.slides[0]!, href: '' }, { ...heroPreview.slides[1]! }],
    });
    await nextTick();
    const figures = slides(wrapper);
    expect(track(wrapper).getAttribute('tabindex')).toBeNull();
    // Slide 1 holds no link, so the slide element itself is the stop; slide 2's link is parked.
    expect(figures[0]?.getAttribute('tabindex')).toBe('0');
    expect(tabbableIn(track(wrapper))).toEqual([figures[0]]);

    press(figures[0]!, 'ArrowRight');
    await nextTick();
    // Slide 2 holds a link, so the link is the stop and the slide element is not.
    const link = figures[1]!.querySelector<HTMLElement>('a[href]')!;
    expect(document.activeElement).toBe(link);
    expect(figures[1]?.getAttribute('tabindex')).toBe('-1');
    expect(tabbableIn(track(wrapper))).toEqual([link]);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});

describe('testimonials — slides with nothing to activate', () => {
  it('keeps the track as the one tab stop while no card holds a control', async () => {
    const wrapper = mountBlock(TestimonialsBlock, { ...testimonialsMock, variant: 'carousel' });
    await nextTick();
    // The mock's quotes carry no product link, so there is nothing in a card to rove between:
    // the track itself stays the single stop and `←`/`→` step it, the spec's own shape for a
    // gallery-style carousel.
    expect(track(wrapper).getAttribute('tabindex')).toBe('0');
    for (const card of slides(wrapper)) expect(card.getAttribute('tabindex')).toBeNull();
    expect(wrapper.find('[data-part="instructions"]').exists()).toBe(false);

    press(track(wrapper), 'ArrowRight');
    await nextTick();
    expect(wrapper.get('[data-part="prev"]').attributes('disabled')).toBeUndefined();
  });

  it('switches to the roving model as soon as a card links to its product', async () => {
    const items = testimonialsMock.items.map((item) => ({
      ...item,
      productHref: 'https://example.com/products/mug',
    }));
    const wrapper = mountBlock(TestimonialsBlock, {
      ...testimonialsMock,
      variant: 'carousel',
      items,
    });
    await nextTick();
    const cards = slides(wrapper);
    expect(track(wrapper).getAttribute('tabindex')).toBeNull();
    expect(tabbableIn(track(wrapper))).toEqual([cards[0]?.querySelector('a[href]')]);
    expect(wrapper.find('[data-part="instructions"]').exists()).toBe(true);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
