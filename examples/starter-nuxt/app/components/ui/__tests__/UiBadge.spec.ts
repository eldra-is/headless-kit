// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiBadge from '../UiBadge.vue';

describe('UiBadge', () => {
  it('defaults to the neutral tone', () => {
    const wrapper = mount(UiBadge, { slots: { default: 'New' } });
    expect(wrapper.classes()).toContain('bg-surface-strong');
    expect(wrapper.text()).toBe('New');
  });

  it.each([
    ['primary', 'bg-primary'],
    ['accent', 'bg-accent'],
    ['success', 'bg-success'],
    ['warning', 'bg-warning'],
    ['danger', 'bg-danger'],
  ] as const)('maps tone="%s" to %s', (tone, expected) => {
    const wrapper = mount(UiBadge, { props: { tone } });
    expect(wrapper.classes()).toContain(expected);
  });

  it('forwards class and other attrs to the root element', () => {
    const wrapper = mount(UiBadge, { attrs: { class: 'ml-2', 'data-testid': 'sale-badge' } });
    expect(wrapper.classes()).toContain('ml-2');
    expect(wrapper.attributes('data-testid')).toBe('sale-badge');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiBadge, { slots: { default: 'Sale' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
