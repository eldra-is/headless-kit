// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiLink from '../UiLink.vue';

const NuxtLinkStub = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: [String, Object], default: '' } },
  setup(props, { slots, attrs }) {
    return () => h('a', { ...attrs, href: props.to as string }, slots.default?.());
  },
});

const mountOptions = { global: { stubs: { NuxtLink: NuxtLinkStub } } };

describe('UiLink', () => {
  it('renders an internal href through NuxtLink', () => {
    const wrapper = mount(UiLink, {
      props: { href: '/about' },
      slots: { default: 'About' },
      ...mountOptions,
    });
    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('/about');
    expect(link.text()).toBe('About');
  });

  it('renders a hash href through NuxtLink', () => {
    const wrapper = mount(UiLink, { props: { href: '#details' }, ...mountOptions });
    expect(wrapper.find('a').attributes('href')).toBe('#details');
  });

  it('renders an external href as a plain anchor', () => {
    const wrapper = mount(UiLink, { props: { href: 'https://example.com' }, ...mountOptions });
    const link = wrapper.find('a');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('https://example.com');
  });

  it('forces external rendering with the `external` prop even for an internal-looking href', () => {
    const wrapper = mount(UiLink, {
      props: { href: '/about', external: true },
      ...mountOptions,
    });
    // Both branches render an <a>; the assertion that matters is that it did
    // not go through the (stubbed) NuxtLink component.
    expect(wrapper.findComponent(NuxtLinkStub).exists()).toBe(false);
  });

  it('adds rel="noopener" when target="_blank"', () => {
    const wrapper = mount(UiLink, {
      props: { href: 'https://example.com' },
      attrs: { target: '_blank' },
      ...mountOptions,
    });
    expect(wrapper.find('a').attributes('rel')).toBe('noopener');
  });

  it('preserves an existing rel value alongside noopener', () => {
    const wrapper = mount(UiLink, {
      props: { href: 'https://example.com' },
      attrs: { target: '_blank', rel: 'nofollow' },
      ...mountOptions,
    });
    expect(wrapper.find('a').attributes('rel')).toBe('nofollow noopener');
  });

  it('renders a span for an unsafe href', () => {
    const wrapper = mount(UiLink, {
      props: { href: 'javascript:alert(1)' },
      slots: { default: 'Click' },
      ...mountOptions,
    });
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.find('span').exists()).toBe(true);
    expect(wrapper.text()).toBe('Click');
  });

  it('forwards class and other attrs to the rendered root', () => {
    const wrapper = mount(UiLink, {
      props: { href: '/about' },
      attrs: { class: 'font-bold', 'data-testid': 'nav-link' },
      ...mountOptions,
    });
    const link = wrapper.find('a');
    expect(link.classes()).toContain('font-bold');
    expect(link.attributes('data-testid')).toBe('nav-link');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiLink, {
      props: { href: '/about' },
      slots: { default: 'About' },
      ...mountOptions,
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
