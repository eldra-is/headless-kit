// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

describe('footer block', () => {
  it('renders the mock content', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.brand);
    expect(wrapper.text()).toContain(mock.legal);
    for (const group of mock.groups) expect(wrapper.text()).toContain(group.title);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('minimal variant renders only the brand and legal line, no groups', async () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'minimal' } } })
    );
    expect(wrapper.text()).toContain(mock.brand);
    expect(wrapper.text()).toContain(mock.legal);
    expect(wrapper.text()).not.toContain(mock.groups[0]!.title);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders a placed newsletter slot child', () => {
    const wrapper = mount(Block, {
      ...mountOptions({ entry: { id: 'e1', data: mock } }),
      slots: { newsletter: () => h('p', 'Sign up for 10% off') },
    });
    expect(wrapper.text()).toContain('Sign up for 10% off');
  });
});
