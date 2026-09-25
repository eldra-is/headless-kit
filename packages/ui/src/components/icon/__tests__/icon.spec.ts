import { describe, expect, it } from 'vitest';
import { IconSearch } from '@tabler/icons-vue';
import { defineComponent, h } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Icon from '../Icon.vue';
import type { IconSize } from '../types';

/**
 * A minimal stand-in for a consumer's own SVG component (not a Tabler icon).
 * It puts the attributes it is given on its `<svg>`, which is the contract
 * `Icon` relies on — Vue only falls `class`, `style` and listeners through to a
 * functional component's root on its own, so an icon component that swallows
 * its attributes would lose the ARIA state `Icon` sets.
 */
const PlainIcon = defineComponent({
  name: 'PlainIcon',
  inheritAttrs: false,
  setup:
    (_props, { attrs }) =>
    () =>
      h('svg', { viewBox: '0 0 24 24', ...attrs }, [h('path')]),
});

describe('Icon', () => {
  it('renders the icon component it is given', () => {
    const wrapper = mountWith(Icon, { props: { icon: PlainIcon } });
    expect(wrapper.element.tagName.toLowerCase()).toBe('svg');
    wrapper.unmount();
  });

  it.each([
    ['sm', 'size-4'],
    ['md', 'size-5'],
    ['lg', 'size-6'],
    ['xl', 'size-8'],
  ] as Array<[IconSize, string]>)('renders size %s as %s', (size, expected) => {
    const wrapper = mountWith(Icon, { props: { icon: PlainIcon, size } });
    expect(wrapper.classes()).toContain(expected);
    wrapper.unmount();
  });

  it('defaults to the medium size', () => {
    const wrapper = mountWith(Icon, { props: { icon: PlainIcon } });
    expect(wrapper.classes()).toContain('size-5');
    wrapper.unmount();
  });

  it('never shrinks in a flex row', () => {
    const wrapper = mountWith(Icon, { props: { icon: PlainIcon } });
    expect(wrapper.classes()).toContain('shrink-0');
    wrapper.unmount();
  });

  it('is hidden from assistive technology without a label', () => {
    const wrapper = mountWith(Icon, { props: { icon: PlainIcon } });
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.attributes('role')).toBeUndefined();
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    wrapper.unmount();
  });

  it('becomes an image with an accessible name when labelled', () => {
    const wrapper = mountWith(Icon, { props: { icon: PlainIcon, label: 'Search' } });
    expect(wrapper.attributes('role')).toBe('img');
    expect(wrapper.attributes('aria-label')).toBe('Search');
    expect(wrapper.attributes('aria-hidden')).toBeUndefined();
    wrapper.unmount();
  });

  it('is never a tab stop', () => {
    const wrapper = mountWith(Icon, { props: { icon: PlainIcon } });
    expect(wrapper.attributes('focusable')).toBe('false');
    wrapper.unmount();
  });

  it('draws a Tabler icon at the design stroke width', () => {
    const wrapper = mountWith(Icon, { props: { icon: IconSearch } });
    expect(wrapper.attributes('stroke-width')).toBe('1.75');
    wrapper.unmount();
  });

  it('lets classes.root replace a conflicting utility', () => {
    const wrapper = mountWith(Icon, {
      props: { icon: PlainIcon, classes: { root: 'size-12 text-accent' } },
    });
    expect(wrapper.classes()).toContain('size-12');
    expect(wrapper.classes()).not.toContain('size-5');
    expect(wrapper.classes()).toContain('text-accent');
    wrapper.unmount();
  });

  it('has no axe violations when decorative', async () => {
    const wrapper = mountWith(Icon, { props: { icon: IconSearch } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations when labelled', async () => {
    const wrapper = mountWith(Icon, { props: { icon: IconSearch, label: 'Search' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('renders in a narrow container', () => {
    const wrapper = mountNarrow(Icon, { props: { icon: IconSearch, size: 'xl' } });
    expect(wrapper.classes()).toContain('size-8');
    wrapper.unmount();
  });
});
