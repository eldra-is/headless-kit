// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

// `mock.json` is the seed Studio writes on insert — no `images` yet (see
// task-9b-live-report.md, Finding 2); `preview.json` is the demo-imagery
// overlay `scripts/generate-stories.mjs`'s `Default` story merges onto it.
const withImages = { ...mock, ...preview };

describe('gallery block', () => {
  it('renders the bare mock.json content — heading only, no images yet, no crash (the freshly-inserted state)', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.findAll('img')).toHaveLength(0);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['grid', 'masonry', 'carousel'] as const)(
    'renders the bare mock.json %s variant axe-clean with zero images (regression net for a freshly-inserted block)',
    async (variant) => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...mock, variant } } })
      );
      expect(wrapper.findAll('img')).toHaveLength(0);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('renders the mock content once preview.json overlays images', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImages } }));
    expect(wrapper.text()).toContain(withImages.heading);
    expect(wrapper.findAll('img')).toHaveLength(withImages.images.length);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['grid', 'masonry', 'carousel'] as const)(
    'renders the %s variant with no axe violations',
    async (variant) => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...withImages, variant } } })
      );
      expect(wrapper.findAll('img')).toHaveLength(withImages.images.length);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it.each(['grid', 'masonry', 'carousel'] as const)(
    'applies the md radius to every thumbnail frame in the %s variant',
    (variant) => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...withImages, variant } } })
      );
      const frames = wrapper.findAll('[data-part="frame"]');
      expect(frames.length).toBeGreaterThan(0);
      for (const frame of frames) expect(frame.classes()).toContain('rounded-md');
    }
  );

  /**
   * The lightbox's full-image view must never crop ("gallery lightbox constraint lost", fix round
   * 1 ruling 3). `fit="contain"` maps to `Image`'s `media` part; the height cap that used to sit on
   * the `<img>` itself (`max-h-[85vh]`) now has to sit on the `frame` `Image` wraps it in, since a
   * caller's `classes` land on named parts, not the media element directly.
   *
   * Fix round 2 ruling 2: a portrait image must be scaled down to fit inside the 85vh cap,
   * never clipped by the frame's `overflow-hidden` — `fit="contain"` shrink-wraps the frame
   * (`w-auto max-w-full`, on top of `max-h-[85vh]`) and gives the media a `max-h-[inherit]` that
   * reads the frame's own height cap back onto it, alongside `h-auto w-auto` so the browser scales
   * the image to fit both constraints together instead of a percentage height that ignores the cap.
   */
  it('lets the lightbox image show uncropped, capped at 85vh on the frame (and inherited onto the media)', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImages } }));
    await wrapper.findAll('button')[0]!.trigger('click');
    await nextTick();

    const dialog = wrapper.get('dialog');
    const media = dialog.get('[data-part="media"]');
    expect(media.classes()).toEqual(
      expect.arrayContaining(['object-contain', 'h-auto', 'w-auto', 'max-h-[inherit]'])
    );
    expect(media.classes()).not.toContain('object-cover');
    expect(media.classes()).not.toContain('h-full');
    const frame = dialog.get('[data-part="frame"]');
    expect(frame.classes()).toEqual(
      expect.arrayContaining(['max-h-[85vh]', 'w-auto', 'max-w-full'])
    );
    expect(frame.classes()).not.toContain('w-full');
  });

  it('renders plain (non-interactive) thumbnails when lightbox is disabled', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...withImages, lightbox: false } } })
    );
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(wrapper.find('dialog').exists()).toBe(false);
  });

  it('opens the lightbox on a thumbnail click and shows the clicked image with a counter', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImages } }));
    const thumbnails = wrapper.findAll('button');
    await thumbnails[1]!.trigger('click');
    await nextTick();

    const dialog = wrapper.get('dialog');
    expect(dialog.attributes('open')).toBe('');
    expect(wrapper.text()).toContain(`2 of ${withImages.images.length}`);
  });

  it('steps forward and back inside the lightbox', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImages } }));
    await wrapper.findAll('button')[0]!.trigger('click');
    await nextTick();

    const dialog = wrapper.get('dialog');
    await dialog
      .findAll('button')
      .find((button) => button.text() === 'Next')!
      .trigger('click');
    expect(wrapper.text()).toContain('2 of');
    await dialog
      .findAll('button')
      .find((button) => button.text() === 'Previous')!
      .trigger('click');
    expect(wrapper.text()).toContain('1 of');
  });

  it('steps forward and back inside the lightbox with ArrowRight/ArrowLeft', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImages } }));
    await wrapper.findAll('button')[0]!.trigger('click');
    await nextTick();

    const dialog = wrapper.get('dialog');
    await dialog.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.text()).toContain('2 of');
    await dialog.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.text()).toContain('1 of');

    await dialog.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.text()).toContain(`${withImages.images.length} of`);
  });

  it('closes the lightbox via the dialog close button', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImages } }));
    await wrapper.findAll('button')[0]!.trigger('click');
    await nextTick();
    expect(wrapper.get('dialog').attributes('open')).toBe('');

    const dialog = wrapper.get('dialog');
    await dialog.findAll('button')[0]!.trigger('click');
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
  });

  it('steps the carousel track with ArrowRight/ArrowLeft', async () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...withImages, variant: 'carousel' } } })
    );
    const track = wrapper.get('[tabindex="0"]');
    await track.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.text()).toContain(`Slide 2 of ${withImages.images.length}`);
  });
});
