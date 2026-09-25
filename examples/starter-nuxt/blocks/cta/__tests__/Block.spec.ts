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

  it('routes both same-site actions through the router, not a document navigation', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    // Both destinations are same-site, so both must go through `EldraRouterLink` -> `NuxtLink`.
    // `Button` reaches it through the same `as` prop `Link` uses, and hands it the destination as
    // `to`: asserting the component's prop (not the rendered `href`) is what tells the two apart,
    // since the stub renders an `<a href>` either way.
    const destinations = wrapper
      .findAllComponents({ name: 'NuxtLink' })
      .map((link) => link.props('to'));
    expect(destinations).toEqual(['/shop', '/shipping-returns']);
  });

  it('leaves an off-site action a plain document navigation', () => {
    const wrapper = mount(
      Block,
      mountOptions({
        entry: { id: 'e1', data: { ...mock, buttonHref: 'https://example.com/shop' } },
      })
    );
    expect(wrapper.findAllComponents({ name: 'NuxtLink' }).map((l) => l.props('to'))).toEqual([
      '/shipping-returns',
    ]);
    expect(wrapper.get('a[href="https://example.com/shop"]').text()).toBe(mock.buttonLabel);
  });

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
