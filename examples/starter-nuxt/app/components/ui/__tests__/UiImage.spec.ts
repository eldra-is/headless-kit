// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiImage from '../UiImage.vue';

describe('UiImage', () => {
  it('renders the src, alt, and default sizes/loading', () => {
    const wrapper = mount(UiImage, { props: { src: '/demo/hero.svg', alt: 'A cozy living room' } });
    const img = wrapper.find('img');
    expect(img.attributes('src')).toBe('/demo/hero.svg');
    expect(img.attributes('alt')).toBe('A cozy living room');
    expect(img.attributes('sizes')).toBe('100vw');
    expect(img.attributes('loading')).toBe('lazy');
    expect(img.attributes('fetchpriority')).toBeUndefined();
  });

  it('marks an empty alt as decorative with role="presentation"', () => {
    const wrapper = mount(UiImage, { props: { src: '/demo/hero.svg', alt: '' } });
    expect(wrapper.find('img').attributes('role')).toBe('presentation');
  });

  it('does not set role for a non-empty alt', () => {
    const wrapper = mount(UiImage, { props: { src: '/demo/hero.svg', alt: 'Alt text' } });
    expect(wrapper.find('img').attributes('role')).toBeUndefined();
  });

  it('renders eager loading and fetchpriority="high" when priority is set', () => {
    const wrapper = mount(UiImage, {
      props: { src: '/demo/hero.svg', alt: 'Hero', priority: true },
    });
    const img = wrapper.find('img');
    expect(img.attributes('loading')).toBe('eager');
    expect(img.attributes('fetchpriority')).toBe('high');
  });

  it('applies aspect-ratio via inline style from the aspect prop', () => {
    const wrapper = mount(UiImage, {
      props: { src: '/demo/hero.svg', alt: 'Hero', aspect: '16/9' },
    });
    expect(wrapper.find('img').attributes('style')).toContain('aspect-ratio: 16/9');
  });

  it('applies imageFramingStyle when framing is given without entry context', () => {
    const wrapper = mount(UiImage, {
      props: {
        src: '/demo/hero.svg',
        alt: 'Hero',
        framing: { x: 0.25, y: 0.75, zoom: 1 },
      },
    });
    const style = wrapper.find('img').attributes('style') ?? '';
    expect(style).toContain('object-fit: cover');
    expect(style).toContain('object-position: 25% 75%');
    expect(wrapper.find('img').attributes('data-eldra-framing')).toBeUndefined();
  });

  it('applies the Studio overlay data attrs when entryId and fieldPath are given', () => {
    const wrapper = mount(UiImage, {
      props: {
        src: '/demo/hero.svg',
        alt: 'Hero',
        framing: { x: 0.5, y: 0.5, zoom: 1 },
        entryId: 'entry-1',
        fieldPath: 'image',
      },
    });
    const img = wrapper.find('img');
    expect(img.attributes('data-eldra-framing')).toBe('image');
    expect(img.attributes('data-eldra-framing-entry')).toBe('entry-1');
  });

  it('forwards class and other attrs to the img element', () => {
    const wrapper = mount(UiImage, {
      props: { src: '/demo/hero.svg', alt: 'Hero' },
      attrs: { class: 'rounded-lg', 'data-testid': 'hero-image' },
    });
    const img = wrapper.find('img');
    expect(img.classes()).toContain('rounded-lg');
    expect(img.attributes('data-testid')).toBe('hero-image');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiImage, { props: { src: '/demo/hero.svg', alt: 'A cozy living room' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
