// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

/** `mock.json` is Studio's insert seed — six captioned items, no images yet, since media is never
 *  present there (`scan.ts` only accepts `{assetId}` or absence); `preview.json` is the demo
 *  imagery overlay a story/preview merges on top of it (shallow merge — `items` is replaced whole,
 *  not merged element-by-element, which is why `preview.json` repeats every caption). */
const withImages = { ...mock, ...preview };
const VARIANTS = ['grid', 'masonry', 'carousel'] as const;

function mountGallery(data: Record<string, unknown>, options: { editing?: boolean } = {}) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const opts = {
    ...base,
    // Real focus tracking (`document.activeElement`) needs the tree connected to the document —
    // jsdom does not reliably track focus on a detached mount (see the navigation/contact blocks'
    // own specs for the same note). Auto-unmount (`test/setup.ts`) detaches it again afterward.
    attachTo: document.body,
  };
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  return mount(Block, opts);
}

function tiles(wrapper: ReturnType<typeof mountGallery>) {
  return wrapper.findAll('button[aria-haspopup="dialog"]');
}

describe('gallery block', () => {
  it('renders the bare mock.json content — heading only, no images yet, no crash', async () => {
    const wrapper = mountGallery(mock);
    await flushPromises();
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.findAll('img')).toHaveLength(0);
    expect(wrapper.find('ul').exists()).toBe(false);
    expect(wrapper.find('dialog').exists()).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(VARIANTS)(
    'renders the bare mock.json %s variant axe-clean with zero images',
    async (variant) => {
      const wrapper = mountGallery({ ...mock, variant });
      await flushPromises();
      expect(wrapper.findAll('img')).toHaveLength(0);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('renders the full (mock + preview) content with no axe violations', async () => {
    const wrapper = mountGallery(withImages);
    await flushPromises();
    expect(wrapper.text()).toContain(withImages.heading);
    expect(wrapper.findAll('img')).toHaveLength(withImages.items.length);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(VARIANTS)('renders the %s variant with no axe violations', async (variant) => {
    const wrapper = mountGallery({ ...withImages, variant });
    await flushPromises();
    expect(wrapper.findAll('img')).toHaveLength(withImages.items.length);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('applies the lg radius to every tile frame across variants', async () => {
    for (const variant of VARIANTS) {
      const wrapper = mountGallery({ ...withImages, variant });
      await flushPromises();
      const frames = wrapper.findAll('[data-part="frame"]');
      expect(frames.length).toBe(withImages.items.length);
      for (const frame of frames) expect(frame.classes()).toContain('rounded-lg');
    }
  });

  it('every tile is a button with aria-haspopup="dialog" naming its position and alt text', async () => {
    const wrapper = mountGallery(withImages);
    await flushPromises();
    const buttons = tiles(wrapper);
    expect(buttons).toHaveLength(withImages.items.length);
    buttons.forEach((button, index) => {
      const item = withImages.items[index]!;
      expect(button.attributes('aria-label')).toBe(
        `View larger, image ${index + 1} of ${withImages.items.length}: ${item.image.altText}`
      );
    });
  });

  it('renders an always-visible aria-hidden zoom badge on every tile, never hover-only', async () => {
    const wrapper = mountGallery(withImages);
    await flushPromises();
    const buttons = tiles(wrapper);
    for (const button of buttons) {
      const badge = button.get('span[aria-hidden="true"]');
      // No hover-only visibility gate (e.g. an opacity/visibility class that only reveals it on
      // `:hover`/`group-hover`) — the badge is unconditionally in the DOM and visible.
      const classes = badge.classes();
      expect(classes.some((c) => c.includes('opacity-0') || c.includes('invisible'))).toBe(false);
    }
  });

  it.each(['Enter', ' '] as const)(
    '%s on tile 3 opens the Lightbox at index 2, and Esc closes it and returns focus to tile 3',
    async (key) => {
      const wrapper = mountGallery(withImages);
      await flushPromises();
      const tile3 = tiles(wrapper)[2]!;
      tile3.element.focus();
      await tile3.trigger('keydown', { key });
      await nextTick();

      const dialog = wrapper.get('dialog');
      expect(dialog.attributes('open')).toBe('');
      expect(wrapper.text()).toContain(`3 / ${withImages.items.length}`);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((resolve) => setTimeout(resolve));
      await nextTick();

      expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
      expect(document.activeElement).toBe(tile3.element);
    }
  );

  it('ArrowRight/ArrowLeft inside the dialog change the image, never wrapping past the ends', async () => {
    const wrapper = mountGallery(withImages);
    await flushPromises();
    await tiles(wrapper)[0]!.trigger('click');
    await nextTick();
    const dialog = wrapper.get('dialog');
    expect(wrapper.text()).toContain(`1 / ${withImages.items.length}`);

    await dialog.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.text()).toContain(`2 / ${withImages.items.length}`);
    await dialog.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.text()).toContain(`1 / ${withImages.items.length}`);
    // Never loops: ArrowLeft at the first image stays put.
    await dialog.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.text()).toContain(`1 / ${withImages.items.length}`);

    // The visible counter is intentionally `aria-hidden` — `@eldrajs/ui`'s own Lightbox carries
    // the position through each slide's own "n of total" label instead of a live region on the
    // counter (see `01-core-components.md`'s "Lightbox" acceptance criteria: "the counter is not
    // read"). Assert that real, documented shape rather than an `aria-live` the component does not
    // (and by that same criterion, must not) carry.
    expect(wrapper.get('[data-part="counter"]').attributes('aria-hidden')).toBe('true');
  });

  it('closes the lightbox via the dialog close button', async () => {
    const wrapper = mountGallery(withImages);
    await flushPromises();
    await tiles(wrapper)[0]!.trigger('click');
    await nextTick();
    expect(wrapper.get('dialog').attributes('open')).toBe('');

    await wrapper
      .get('dialog')
      .findAll('button')
      .find((button) => button.attributes('aria-label') === 'Close image viewer')!
      .trigger('click');
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
  });

  /**
   * Every tile in this variant is a "view larger" `<button>`, so the carousel takes its one tab
   * stop on the active tile's button and the track itself is not focusable — the arrow keys move
   * between tiles from there (`@eldrajs/ui`'s `Carousel`; `test/carouselKeyboard.spec.ts` holds
   * the whole rule, including the gallery's own Enter-opens-the-viewer path).
   */
  it('steps between tiles with ArrowRight/ArrowLeft and disables arrows at the ends', async () => {
    const wrapper = mountGallery({ ...withImages, variant: 'carousel' });
    await flushPromises();
    // `Carousel`'s root is a `<section>` named by `ariaLabel` (an implicit ARIA `region` role, not
    // an explicit attribute) — this scopes by the attribute it actually renders.
    const carouselRegion = wrapper.get('section[aria-roledescription="carousel"]');
    const track = carouselRegion.get('[data-part="track"]');
    expect(track.attributes('tabindex')).toBeUndefined();
    const tileButton = (index: number) =>
      (track.element.children[index] as HTMLElement).querySelector<HTMLButtonElement>('button')!;
    // One stop for the row: the first tile's own button, every other tile's parked.
    expect(tileButton(0).getAttribute('tabindex')).toBeNull();
    expect(tileButton(1).getAttribute('tabindex')).toBe('-1');

    const prevArrow = wrapper.get('[data-part="prev"]');
    const nextArrow = wrapper.get('[data-part="next"]');
    expect(prevArrow.attributes('disabled')).toBeDefined();
    expect(nextArrow.attributes('disabled')).toBeUndefined();

    tileButton(0).focus();
    tileButton(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await nextTick();
    expect(document.activeElement).toBe(tileButton(1));
    expect(tileButton(0).getAttribute('tabindex')).toBe('-1');
    // Several tiles show at once, so the row renders no "n / total" counter (spec "Carousel" →
    // Product row) — the Lightbox further down keeps its own; the move shows through the arrows'
    // state instead.
    expect(carouselRegion.find('[data-part="counter"]').exists()).toBe(false);
    expect(prevArrow.attributes('disabled')).toBeUndefined();

    tileButton(1).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await nextTick();
    expect(document.activeElement).toBe(tileButton(0));
    expect(prevArrow.attributes('disabled')).toBeDefined();
  });

  it("masonry renders tiles in DOM order with the block's responsive column classes", async () => {
    const wrapper = mountGallery({ ...withImages, variant: 'masonry', columns: '4' });
    await flushPromises();
    const list = wrapper.get('ul');
    expect(list.classes()).toEqual(
      expect.arrayContaining(['columns-2', '@tablet:columns-3', '@content:columns-4'])
    );
    const items = list.findAll('li');
    expect(items).toHaveLength(withImages.items.length);
    for (const item of items) expect(item.classes()).toContain('break-inside-avoid');
    // DOM order matches the data order — `columns` is a layout-only CSS property, it never
    // reorders content, so reading order (screen reader, `Tab`) matches the visual column flow.
    expect(items.map((item) => item.get('figcaption').text())).toEqual(
      withImages.items.map((item) => item.caption)
    );
  });

  it('renders nothing live with only one real image (heading still renders)', async () => {
    const wrapper = mountGallery({
      ...mock,
      items: [
        { image: preview.items[0]!.image, caption: 'Bowls drying before their first firing' },
      ],
    });
    await flushPromises();
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.find('ul').exists()).toBe(false);
    expect(tiles(wrapper)).toHaveLength(0);
    expect(wrapper.find('dialog').exists()).toBe(false);
  });

  it('renders 24 tiles for 24 items', async () => {
    const image = preview.items[0]!.image;
    const items = Array.from({ length: 24 }, (_, index) => ({
      image: { ...image, assetId: `demo-gallery-item-${index}` },
      caption: `Item ${index + 1}`,
    }));
    const wrapper = mountGallery({ ...mock, items });
    await flushPromises();
    expect(tiles(wrapper)).toHaveLength(24);
  });

  it('hides captions when showCaptions is false, but the Lightbox still shows them', async () => {
    const wrapper = mountGallery({ ...withImages, showCaptions: false });
    await flushPromises();
    expect(wrapper.find('figcaption').exists()).toBe(false);
    await tiles(wrapper)[0]!.trigger('click');
    await nextTick();
    expect(wrapper.get('dialog').text()).toContain(withImages.items[0]!.caption);
  });

  it('shows a per-item "Choose an image" placeholder while editing an item with no image yet, keeping its caption', async () => {
    const wrapper = mountGallery(mock, { editing: true });
    await flushPromises();
    expect(tiles(wrapper)).toHaveLength(0);
    expect(wrapper.text()).toContain('Choose an image');
    expect(wrapper.text()).toContain(mock.items[0]!.caption);
  });

  it('shows the block-level "Add images" editor hint for a genuinely empty item list', async () => {
    const wrapper = mountGallery({ ...mock, items: [] }, { editing: true });
    await flushPromises();
    expect(wrapper.text()).toContain('Add images');
    expect(tiles(wrapper)).toHaveLength(0);
  });

  it('shows the heading editor hint while editing with no heading', async () => {
    const wrapper = mountGallery({ ...withImages, heading: '' }, { editing: true });
    await flushPromises();
    expect(wrapper.text()).toContain('Add a heading');
  });
});
