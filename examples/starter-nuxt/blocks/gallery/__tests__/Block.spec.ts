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
    // `@eldrajs/ui`'s `Lightbox` own counter format: "n / total" (its `useMessages` default,
    // shared with `Carousel`).
    expect(wrapper.text()).toContain(`2 / ${withImages.images.length}`);
  });

  it('steps forward and back inside the lightbox', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImages } }));
    await wrapper.findAll('button')[0]!.trigger('click');
    await nextTick();

    const dialog = wrapper.get('dialog');
    // `Lightbox`'s arrows are icon-only — found by accessible name ("Next image"/"Previous
    // image", `@eldrajs/ui`'s default English messages), not visible text.
    await dialog
      .findAll('button')
      .find((button) => button.attributes('aria-label') === 'Next image')!
      .trigger('click');
    expect(wrapper.text()).toContain(`2 / ${withImages.images.length}`);
    await dialog
      .findAll('button')
      .find((button) => button.attributes('aria-label') === 'Previous image')!
      .trigger('click');
    expect(wrapper.text()).toContain(`1 / ${withImages.images.length}`);
  });

  it('steps forward and back inside the lightbox with ArrowRight/ArrowLeft, never wrapping', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImages } }));
    await wrapper.findAll('button')[0]!.trigger('click');
    await nextTick();

    const dialog = wrapper.get('dialog');
    await dialog.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.text()).toContain(`2 / ${withImages.images.length}`);
    await dialog.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.text()).toContain(`1 / ${withImages.images.length}`);

    // `Lightbox` never loops (only autoplay would, and it has none): ArrowLeft at the first image
    // stays put instead of wrapping to the last one, unlike the old hand-rolled implementation.
    await dialog.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.text()).toContain(`1 / ${withImages.images.length}`);
  });

  it('closes the lightbox via the dialog close button', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImages } }));
    await wrapper.findAll('button')[0]!.trigger('click');
    await nextTick();
    expect(wrapper.get('dialog').attributes('open')).toBe('');

    const dialog = wrapper.get('dialog');
    await dialog
      .findAll('button')
      .find((button) => button.attributes('aria-label') === 'Close image viewer')!
      .trigger('click');
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
  });

  it('steps the carousel track with ArrowRight/ArrowLeft', async () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...withImages, variant: 'carousel' } } })
    );
    // `Carousel`'s root is a `<section>` named by `ariaLabel` — an *implicit* ARIA `region` role,
    // not an explicit `role` attribute — so this scopes by the attribute it actually renders.
    const track = wrapper.get('section[aria-roledescription="carousel"] [tabindex="0"]');
    await track.trigger('keydown', { key: 'ArrowRight' });
    // `Carousel`'s own counter format: "n / total".
    expect(wrapper.text()).toContain(`2 / ${withImages.images.length}`);
  });
});
