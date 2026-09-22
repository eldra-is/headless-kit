// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

describe('image block', () => {
  it('renders the mock content in a figure/figcaption', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.find('figure').exists()).toBe(true);
    const figcaption = wrapper.get('figcaption');
    expect(figcaption.text()).toBe(mock.caption);
    expect(wrapper.get('img').attributes('alt')).toBe(mock.image.altText);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders nothing when no image is set', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { caption: 'Untitled' } } })
    );
    expect(wrapper.find('figure').exists()).toBe(false);
  });

  it('omits the figcaption when no caption is set', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { image: mock.image } } })
    );
    expect(wrapper.find('figcaption').exists()).toBe(false);
  });

  it("passes 'auto' aspect through as no forced aspect-ratio", () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, aspect: 'auto' } } })
    );
    expect(wrapper.get('img').attributes('style') ?? '').not.toContain('aspect-ratio');
  });

  it.each(['16/9', '4/3', '1/1', '3/4'] as const)('applies the %s aspect ratio', (aspect) => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: { ...mock, aspect } } }));
    expect(wrapper.get('img').attributes('style') ?? '').toContain(`aspect-ratio: ${aspect}`);
  });
});
