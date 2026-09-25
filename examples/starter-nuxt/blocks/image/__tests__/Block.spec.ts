// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

// `mock.json` is the seed Studio writes on insert — no `image` yet (see
// task-9b-live-report.md, Finding 2); `preview.json` is the demo-imagery
// overlay `scripts/generate-stories.mjs`'s `Default` story merges onto it.
const withImage = { ...mock, ...preview };

describe('image block', () => {
  it('renders nothing (no crash) for the bare mock.json — the freshly-inserted state', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.find('figure').exists()).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the mock content in a figure/figcaption once preview.json overlays an image', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImage } }));
    expect(wrapper.find('figure').exists()).toBe(true);
    const figcaption = wrapper.get('figcaption');
    expect(figcaption.text()).toBe(withImage.caption);
    expect(wrapper.get('img').attributes('alt')).toBe(withImage.image.altText);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('applies the lg radius to the frame', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImage } }));
    expect(wrapper.get('[data-part="frame"]').classes()).toContain('rounded-lg');
  });

  it('renders nothing when no image is set (caption alone)', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { caption: 'Untitled' } } })
    );
    expect(wrapper.find('figure').exists()).toBe(false);
  });

  it('omits the figcaption when no caption is set', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { image: withImage.image } } })
    );
    expect(wrapper.find('figcaption').exists()).toBe(false);
  });

  it("passes 'auto' aspect through as no forced aspect-ratio", () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...withImage, aspect: 'auto' } } })
    );
    // The frame (not the `<img>` itself, which `Image` from `@eldrajs/ui` now wraps in an
    // aspect-ratio box) carries the CSS `aspect-ratio` keyword `auto` — no fixed preset is
    // forced, so the frame's own size tracks the image the same way "no forced ratio" always did.
    expect(wrapper.get('[data-part="frame"]').attributes('style') ?? '').toContain(
      'aspect-ratio: auto'
    );
  });

  it.each([
    ['16/9', '16 / 9'],
    ['4/3', '4 / 3'],
    ['1/1', '1 / 1'],
    ['3/4', '3 / 4'],
  ] as const)('applies the %s aspect ratio', (aspect, expected) => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...withImage, aspect } } })
    );
    // `Image`'s frame carries the aspect-ratio, not the `<img>` itself — see the module comment
    // on `app/components/ui/UiImage.vue` for the wrapper this block renders through.
    expect(wrapper.get('[data-part="frame"]').attributes('style') ?? '').toContain(
      `aspect-ratio: ${expected}`
    );
  });
});
