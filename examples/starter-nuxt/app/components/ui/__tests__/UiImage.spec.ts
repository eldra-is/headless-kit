// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiImage from '../UiImage.vue';

describe('UiImage', () => {
  it('renders the src, alt, and default sizes/loading on the media element', () => {
    const wrapper = mount(UiImage, { props: { src: '/demo/hero.svg', alt: 'A cozy living room' } });
    const img = wrapper.find('[data-part="media"]');
    expect(img.attributes('src')).toBe('/demo/hero.svg');
    expect(img.attributes('alt')).toBe('A cozy living room');
    expect(img.attributes('sizes')).toBe('100vw');
    expect(img.attributes('loading')).toBe('lazy');
    expect(img.attributes('fetchpriority')).toBeUndefined();
  });

  it('renders alt="" for an explicitly empty alt (the decorative case)', () => {
    const wrapper = mount(UiImage, { props: { src: '/demo/hero.svg', alt: '' } });
    expect(wrapper.get('[data-part="media"]').attributes('alt')).toBe('');
  });

  it('does not mark a non-empty alt as decorative', () => {
    const wrapper = mount(UiImage, { props: { src: '/demo/hero.svg', alt: 'Alt text' } });
    expect(wrapper.find('[data-part="placeholder"]').exists()).toBe(false);
    expect(wrapper.get('[data-part="media"]').attributes('alt')).toBe('Alt text');
  });

  it('renders eager loading and fetchpriority="high" when priority is set', () => {
    const wrapper = mount(UiImage, {
      props: { src: '/demo/hero.svg', alt: 'Hero', priority: true },
    });
    const img = wrapper.get('[data-part="media"]');
    expect(img.attributes('loading')).toBe('eager');
    expect(img.attributes('fetchpriority')).toBe('high');
  });

  it('maps a known aspect string to a fixed ratio preset on the frame', () => {
    const wrapper = mount(UiImage, {
      props: { src: '/demo/hero.svg', alt: 'Hero', aspect: '16/9' },
    });
    expect(wrapper.get('[data-part="frame"]').attributes('style')).toContain(
      'aspect-ratio: 16 / 9'
    );
  });

  it('falls back to an inline aspect-ratio style on the root for an unknown aspect string', () => {
    const wrapper = mount(UiImage, {
      props: { src: '/demo/hero.svg', alt: 'Hero', aspect: '5/2' },
    });
    expect(wrapper.get('[data-part="root"]').attributes('style')).toContain('aspect-ratio: 5/2');
  });

  it('applies object-position from framing when given without entry context', () => {
    const wrapper = mount(UiImage, {
      props: {
        src: '/demo/hero.svg',
        alt: 'Hero',
        framing: { x: 0.25, y: 0.75, zoom: 1 },
      },
    });
    const img = wrapper.get('[data-part="media"]');
    expect(img.classes()).toContain('object-cover');
    expect(img.attributes('style')).toContain('object-position: 25% 75%');
    expect(img.attributes('data-eldra-framing')).toBeUndefined();
  });

  it('scales and sets a clamped transform-origin when zoom is above 1', () => {
    const wrapper = mount(UiImage, {
      props: {
        src: '/demo/hero.svg',
        alt: 'Hero',
        framing: { x: 0.2, y: 0.6, zoom: 2 },
      },
    });
    const style = wrapper.get('[data-part="media"]').attributes('style') ?? '';
    expect(style).toContain('object-position: 20% 60%');
    expect(style).toContain('transform: scale(2)');
    // zoom 2's safe band is [25, 75]; x = 20 clamps to 25, y = 60 stays.
    expect(style).toContain('transform-origin: 25% 60%');
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
    const img = wrapper.get('[data-part="media"]');
    expect(img.attributes('data-eldra-framing')).toBe('image');
    expect(img.attributes('data-eldra-framing-entry')).toBe('entry-1');
  });

  it('forwards class and style to the root, and other attrs to the media element', () => {
    const wrapper = mount(UiImage, {
      props: { src: '/demo/hero.svg', alt: 'Hero' },
      attrs: { class: 'rounded-lg', 'data-testid': 'hero-image' },
    });
    expect(wrapper.classes()).toContain('rounded-lg');
    const img = wrapper.get('[data-part="media"]');
    expect(img.classes()).not.toContain('rounded-lg');
    expect(img.attributes('data-testid')).toBe('hero-image');
  });

  it('has no axe violations', async () => {
    const wrapper = mount(UiImage, { props: { src: '/demo/hero.svg', alt: 'A cozy living room' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
