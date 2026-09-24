// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

// `mock.json` is the seed Studio writes on insert (no image — see
// task-9b-live-report.md, Finding 2); `preview.json` is the demo-imagery
// overlay `scripts/generate-stories.mjs`'s `Default` story merges onto it.
const withImage = { ...mock, ...preview };

describe('hero block', () => {
  it('renders the mock content', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.heading);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare mock.json axe-clean for every variant, including image-background with no image (regression net for a freshly-inserted block)', async () => {
    for (const variant of ['image-right', 'image-background', 'centered'] as const) {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...mock, variant } } })
      );
      expect(wrapper.find('img').exists()).toBe(false);
      expect(wrapper.findAll('h1')).toHaveLength(1);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  });

  it('image-background falls back to a plain surface (not primary-contrast-on-nothing) when there is no image yet', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'image-background' } } })
    );
    const section = wrapper.get('section');
    expect(section.classes()).toContain('bg-surface-strong');
    expect(section.classes()).not.toContain('text-primary-contrast');
  });

  it.each(['image-right', 'image-background', 'centered'] as const)(
    'renders the heading exactly once for the %s variant, with the preview image',
    async (variant) => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...withImage, variant } } })
      );
      expect(wrapper.findAll('h1')).toHaveLength(1);
      expect(wrapper.get('h1').text()).toBe(withImage.heading);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('carries the framing marker attributes on the rendered image (image-right)', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'hero-1', data: { ...withImage, variant: 'image-right' } } })
    );
    const img = wrapper.get('img');
    expect(img.attributes('data-eldra-framing')).toBe('image');
    expect(img.attributes('data-eldra-framing-entry')).toBe('hero-1');
  });

  it('carries the framing marker attributes on the background image (image-background)', () => {
    const wrapper = mount(
      Block,
      mountOptions({
        entry: { id: 'hero-1', data: { ...withImage, variant: 'image-background' } },
      })
    );
    const img = wrapper.get('img');
    expect(img.attributes('data-eldra-framing')).toBe('image');
    expect(img.attributes('data-eldra-framing-entry')).toBe('hero-1');
  });

  it('falls back to the built-in CTAs when the actions slot is empty', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.ctaLabel);
    expect(wrapper.text()).toContain(mock.secondaryCtaLabel);
  });

  it('renders a placed actions slot instead of the built-in CTAs', () => {
    const wrapper = mount(Block, {
      ...mountOptions({ entry: { id: 'e1', data: mock } }),
      slots: { actions: () => h('button', 'Custom action') },
    });
    expect(wrapper.text()).toContain('Custom action');
    expect(wrapper.text()).not.toContain(mock.ctaLabel);
  });
});
