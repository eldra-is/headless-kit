import { describe, expect, it } from 'vitest';
import { axe } from '../../../test/axe';
import { mountWith } from '../../../test/mount';
import VisuallyHidden from '../VisuallyHidden.vue';

describe('VisuallyHidden', () => {
  it('renders a span carrying the slot content', () => {
    const wrapper = mountWith(VisuallyHidden, { slots: { default: 'Skip to content' } });
    expect(wrapper.element.tagName.toLowerCase()).toBe('span');
    expect(wrapper.text()).toBe('Skip to content');
    wrapper.unmount();
  });

  it('hides the content visually but not from assistive technology', () => {
    const wrapper = mountWith(VisuallyHidden, { slots: { default: 'Loading' } });
    expect(wrapper.classes()).toContain('sr-only');
    expect(wrapper.attributes('aria-hidden')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders the element given by `as`', () => {
    const wrapper = mountWith(VisuallyHidden, {
      props: { as: 'div' },
      slots: { default: 'Legend' },
    });
    expect(wrapper.element.tagName.toLowerCase()).toBe('div');
    wrapper.unmount();
  });

  it('stays hidden until focus when focusable', () => {
    const wrapper = mountWith(VisuallyHidden, {
      props: { focusable: true },
      slots: { default: 'Skip to content' },
    });
    expect(wrapper.classes()).toContain('sr-only');
    expect(wrapper.classes()).toContain('focus:not-sr-only');
    wrapper.unmount();
  });

  it('does not add the focus escape hatch by default', () => {
    const wrapper = mountWith(VisuallyHidden, { slots: { default: 'Loading' } });
    expect(wrapper.classes()).not.toContain('focus:not-sr-only');
    wrapper.unmount();
  });

  it('merges classes.root', () => {
    const wrapper = mountWith(VisuallyHidden, {
      props: { classes: { root: 'text-caption' } },
      slots: { default: 'Loading' },
    });
    expect(wrapper.classes()).toContain('sr-only');
    expect(wrapper.classes()).toContain('text-caption');
    wrapper.unmount();
  });

  it('has no axe violations', async () => {
    const wrapper = mountWith(VisuallyHidden, { slots: { default: 'Loading' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
