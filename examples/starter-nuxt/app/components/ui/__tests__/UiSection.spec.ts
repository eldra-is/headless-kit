// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiSection from '../UiSection.vue';

describe('UiSection', () => {
  it('defaults to md spacing and no background, wrapping a UiContainer', () => {
    const wrapper = mount(UiSection, { slots: { default: 'Content' } });
    expect(wrapper.classes()).toContain('py-section');
    expect(wrapper.find('.eldra-container').exists()).toBe(true);
    expect(wrapper.text()).toBe('Content');
  });

  it.each([
    ['none', 'py-0'],
    ['sm', 'py-8'],
    ['md', 'py-section'],
  ] as const)('maps spacing="%s" to %s', (spacing, expected) => {
    const wrapper = mount(UiSection, { props: { spacing } });
    expect(wrapper.classes()).toContain(expected);
  });

  it('maps the lg spacing to the section-lg step', () => {
    const wrapper = mount(UiSection, { props: { spacing: 'lg' } });
    expect(wrapper.classes()).toContain('py-section-lg');
  });

  // Every `@`-prefixed container query inside a section — `@eldrajs/ui`'s
  // `@max-tablet:target-touch` on a primary md Button, its two-column form
  // layout — measures the nearest container ancestor. The section is it.
  it('is a container query context', () => {
    const wrapper = mount(UiSection);
    expect(wrapper.classes()).toContain('@container');
  });

  it.each([
    ['primary', 'primary'],
    ['accent', 'accent'],
  ] as const)('marks a %s ground for the components inside it', (background, ground) => {
    const wrapper = mount(UiSection, { props: { background } });
    expect(wrapper.attributes('data-section')).toBe(ground);
    expect(wrapper.classes()).toContain('group/section');
  });

  it.each(['none', 'surface', 'surface-strong'] as const)(
    'leaves a %s ground unmarked',
    (background) => {
      const wrapper = mount(UiSection, { props: { background } });
      expect(wrapper.attributes('data-section')).toBeUndefined();
      expect(wrapper.classes()).not.toContain('group/section');
    }
  );

  it.each([
    ['surface', ['bg-surface']],
    ['surface-strong', ['bg-surface-strong']],
    ['primary', ['bg-primary', 'text-primary-contrast']],
    ['accent', ['bg-accent', 'text-accent-contrast']],
  ] as const)('maps background="%s" to its bg/text pair', (background, expected) => {
    const wrapper = mount(UiSection, { props: { background } });
    for (const cls of expected) expect(wrapper.classes()).toContain(cls);
  });

  it('applies no background classes for background="none"', () => {
    const wrapper = mount(UiSection, { props: { background: 'none' } });
    expect(wrapper.classes().some((c) => c.startsWith('bg-'))).toBe(false);
  });

  it('forwards the containerSize prop to the inner UiContainer', () => {
    const wrapper = mount(UiSection, { props: { containerSize: 'wide' } });
    expect(wrapper.find('.eldra-container').attributes('data-size')).toBe('wide');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiSection, { slots: { default: '<h2>Heading</h2>' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
