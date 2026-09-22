// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

describe('hero block', () => {
  it('renders the mock content', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.heading);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['image-right', 'image-background', 'centered'] as const)(
    'renders the heading exactly once for the %s variant',
    async (variant) => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...mock, variant } } })
      );
      expect(wrapper.findAll('h1')).toHaveLength(1);
      expect(wrapper.get('h1').text()).toBe(mock.heading);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('carries the framing marker attributes on the rendered image (image-right)', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'hero-1', data: { ...mock, variant: 'image-right' } } })
    );
    const img = wrapper.get('img');
    expect(img.attributes('data-eldra-framing')).toBe('image');
    expect(img.attributes('data-eldra-framing-entry')).toBe('hero-1');
  });

  it('carries the framing marker attributes on the background image (image-background)', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'hero-1', data: { ...mock, variant: 'image-background' } } })
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
