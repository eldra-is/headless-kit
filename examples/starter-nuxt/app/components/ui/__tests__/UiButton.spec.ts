// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiButton from '../UiButton.vue';

const NuxtLinkStub = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: [String, Object], default: '' } },
  setup(props, { slots, attrs }) {
    return () => h('a', { ...attrs, href: props.to as string }, slots.default?.());
  },
});

const mountOptions = { global: { stubs: { NuxtLink: NuxtLinkStub } } };

describe('UiButton', () => {
  it('renders a native button by default with type="button"', () => {
    const wrapper = mount(UiButton, { slots: { default: 'Save' }, ...mountOptions });
    const button = wrapper.find('button');
    expect(button.exists()).toBe(true);
    expect(button.attributes('type')).toBe('button');
    expect(button.text()).toBe('Save');
  });

  it('applies the variant and size classes', () => {
    const wrapper = mount(UiButton, {
      props: { variant: 'outline', size: 'lg' },
      ...mountOptions,
    });
    expect(wrapper.classes()).toContain('border-border');
    expect(wrapper.classes()).toContain('h-12');
  });

  it('sets aria-busy and disables the button while loading', () => {
    const wrapper = mount(UiButton, { props: { loading: true }, ...mountOptions });
    const button = wrapper.find('button');
    expect(button.attributes('aria-busy')).toBe('true');
    expect(button.attributes('disabled')).toBeDefined();
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('disables the button when the disabled prop is set', () => {
    const wrapper = mount(UiButton, { props: { disabled: true }, ...mountOptions });
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
  });

  it('renders a UiLink when href is set, instead of a button', () => {
    const wrapper = mount(UiButton, { props: { href: '/contact' }, ...mountOptions });
    expect(wrapper.find('button').exists()).toBe(false);
    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('/contact');
  });

  it('marks the href variant aria-disabled and aria-busy while loading', () => {
    const wrapper = mount(UiButton, {
      props: { href: '/contact', loading: true },
      ...mountOptions,
    });
    const link = wrapper.find('a');
    expect(link.attributes('aria-busy')).toBe('true');
    expect(link.attributes('aria-disabled')).toBe('true');
  });

  it('forwards class and other attrs to the rendered root', () => {
    const wrapper = mount(UiButton, { attrs: { 'data-testid': 'save-button' }, ...mountOptions });
    expect(wrapper.attributes('data-testid')).toBe('save-button');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiButton, { slots: { default: 'Save' }, ...mountOptions });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('has no axe violations while loading', async () => {
    const wrapper = mount(UiButton, {
      props: { loading: true },
      slots: { default: 'Saving' },
      ...mountOptions,
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
