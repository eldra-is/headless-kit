// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

describe('article block', () => {
  it('renders the mock content', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.text()).toContain(mock.meta);
    expect(wrapper.text()).toContain(mock.lead);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders exactly one h1 with the heading', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.findAll('h1')).toHaveLength(1);
    expect(wrapper.get('h1').text()).toBe(mock.heading);
  });

  it('omits the meta and lead lines when unset', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, meta: undefined, lead: undefined } } })
    );
    expect(wrapper.text()).not.toContain(mock.meta);
    expect(wrapper.text()).not.toContain(mock.lead);
  });

  it('renders the body through EldraRichText with the prose-eldra typography class', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    const root = wrapper.get('[data-eldra-rich-text]');
    expect(root.classes()).toContain('prose-eldra');
    expect(root.attributes('data-eldra-field')).toBe('body');
    expect(root.attributes('data-eldra-entry')).toBe('e1');
  });

  it.each(['narrow', 'content'] as const)(
    'renders the %s width container with no axe violations',
    async (width) => {
      const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: { ...mock, width } } }));
      expect(wrapper.get('.eldra-container').attributes('data-size')).toBe(width);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );
});
