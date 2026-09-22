// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

describe('cta block', () => {
  it('renders the mock content', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.text()).toContain(mock.buttonLabel);
    expect(wrapper.text()).toContain(mock.secondaryButtonLabel);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['primary', 'subtle', 'split'] as const)(
    'renders the %s variant with both buttons and no axe violations',
    async (variant) => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...mock, variant } } })
      );
      expect(wrapper.get('a[href="/shop"]').text()).toBe(mock.buttonLabel);
      expect(wrapper.get('a[href="/shipping-returns"]').text()).toBe(mock.secondaryButtonLabel);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('omits the secondary link when no secondary label/href is set', () => {
    const wrapper = mount(
      Block,
      mountOptions({
        entry: {
          id: 'e1',
          data: { ...mock, secondaryButtonLabel: undefined, secondaryButtonHref: undefined },
        },
      })
    );
    expect(wrapper.text()).not.toContain(mock.secondaryButtonLabel);
  });
});
