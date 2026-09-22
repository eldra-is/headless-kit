// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiContainer from '../UiContainer.vue';

describe('UiContainer', () => {
  it('defaults to the content size', () => {
    const wrapper = mount(UiContainer, { slots: { default: 'Content' } });
    expect(wrapper.attributes('data-size')).toBe('content');
    expect(wrapper.classes()).toContain('eldra-container');
    expect(wrapper.text()).toBe('Content');
  });

  it.each(['narrow', 'content', 'wide', 'full'] as const)('sets data-size="%s"', (size) => {
    const wrapper = mount(UiContainer, { props: { size } });
    expect(wrapper.attributes('data-size')).toBe(size);
  });

  it('forwards class and other attrs to the root element', () => {
    const wrapper = mount(UiContainer, { attrs: { class: 'extra', 'data-testid': 'wrap' } });
    expect(wrapper.classes()).toContain('eldra-container');
    expect(wrapper.classes()).toContain('extra');
    expect(wrapper.attributes('data-testid')).toBe('wrap');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiContainer, { slots: { default: '<p>Hello</p>' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
