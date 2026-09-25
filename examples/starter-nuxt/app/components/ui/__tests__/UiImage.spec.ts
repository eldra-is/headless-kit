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

  describe('rounded (task-7-fix-1.md ruling 1)', () => {
    it('applies no radius class by default', () => {
      const wrapper = mount(UiImage, { props: { src: '/demo/hero.svg', alt: 'Hero' } });
      const frame = wrapper.get('[data-part="frame"]');
      expect(frame.classes()).not.toContain('rounded-lg');
      expect(frame.classes()).not.toContain('rounded-xl');
    });

    it.each(['lg', 'xl'] as const)('forwards rounded="%s" to the frame', (rounded) => {
      const wrapper = mount(UiImage, { props: { src: '/demo/hero.svg', alt: 'Hero', rounded } });
      expect(wrapper.get('[data-part="frame"]').classes()).toContain(`rounded-${rounded}`);
    });
  });

  describe('fill (task-7-fix-1.md ruling 2)', () => {
    it('fills the nearest positioned ancestor: absolute inset-0 h-full w-full on root, h-full w-full on frame', () => {
      const wrapper = mount(UiImage, {
        props: { src: '/demo/hero.svg', alt: 'Hero', fill: true },
      });
      const root = wrapper.get('[data-part="root"]');
      expect(root.classes()).toEqual(
        expect.arrayContaining(['absolute', 'inset-0', 'h-full', 'w-full'])
      );
      const frame = wrapper.get('[data-part="frame"]');
      expect(frame.classes()).toEqual(expect.arrayContaining(['h-full', 'w-full']));
      const media = wrapper.get('[data-part="media"]');
      expect(media.classes()).toContain('object-cover');
    });

    it('resolves to ratio="auto" (no forced aspect-ratio) while filling', () => {
      const wrapper = mount(UiImage, {
        props: { src: '/demo/hero.svg', alt: 'Hero', fill: true, aspect: '16/9' },
      });
      // `fill` wins over `aspect` — the frame fills its ancestor, it does not reserve a box.
      expect(wrapper.get('[data-part="frame"]').attributes('style')).toContain(
        'aspect-ratio: auto'
      );
    });

    it('does not apply the inline aspect-ratio fallback style while filling', () => {
      const wrapper = mount(UiImage, {
        props: { src: '/demo/hero.svg', alt: 'Hero', fill: true, aspect: '5/2' },
      });
      expect(wrapper.get('[data-part="root"]').attributes('style')).toBeUndefined();
    });
  });

  describe('fit (task-7-fix-1.md ruling 3)', () => {
    it('defaults to cover', () => {
      const wrapper = mount(UiImage, { props: { src: '/demo/hero.svg', alt: 'Hero' } });
      expect(wrapper.get('[data-part="media"]').classes()).toContain('object-cover');
    });

    it('maps fit="contain" to the media element, replacing cover', () => {
      const wrapper = mount(UiImage, {
        props: { src: '/demo/hero.svg', alt: 'Hero', fit: 'contain' },
      });
      const media = wrapper.get('[data-part="media"]');
      expect(media.classes()).toContain('object-contain');
      expect(media.classes()).not.toContain('object-cover');
    });
  });

  describe('classes pass-through (task-7-fix-1.md ruling 3/4)', () => {
    it('forwards an arbitrary classes.frame to the frame, merged with rounded', () => {
      const wrapper = mount(UiImage, {
        props: {
          src: '/demo/hero.svg',
          alt: 'Hero',
          rounded: 'lg',
          classes: { frame: 'max-h-[85vh]' },
        },
      });
      const frame = wrapper.get('[data-part="frame"]');
      expect(frame.classes()).toContain('max-h-[85vh]');
      expect(frame.classes()).toContain('rounded-lg');
    });

    it("lets the caller's own classes.frame win over fill's forced h-full w-full", () => {
      const wrapper = mount(UiImage, {
        props: {
          src: '/demo/hero.svg',
          alt: 'Hero',
          fill: true,
          classes: { frame: 'h-1/2' },
        },
      });
      // tailwind-merge collapses the "h-*" group, so the caller's own value wins outright.
      expect(wrapper.get('[data-part="frame"]').classes()).toContain('h-1/2');
    });

    it("lets the caller's own classes.media win over fit's forced object-contain", () => {
      const wrapper = mount(UiImage, {
        props: {
          src: '/demo/hero.svg',
          alt: 'Hero',
          fit: 'contain',
          classes: { media: 'object-cover' },
        },
      });
      expect(wrapper.get('[data-part="media"]').classes()).toContain('object-cover');
    });

    it('passes classes.root through untouched when fill is not set', () => {
      const wrapper = mount(UiImage, {
        props: { src: '/demo/hero.svg', alt: 'Hero', classes: { root: 'custom-root' } },
      });
      expect(wrapper.get('[data-part="root"]').classes()).toContain('custom-root');
    });
  });
});
