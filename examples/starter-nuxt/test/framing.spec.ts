// @vitest-environment jsdom
//
// `blocks/hero/Block.vue` and `blocks/image/Block.vue` import
// `imageFramingAttrs` from `@eldrajs/theme-vue`, whose single index entry also
// re-exports `EldraBlockZone`, which pulls in a `virtual:eldra/blocks`
// module supplied only by the Nuxt build's vite plugin (see
// test/slugPage.test.ts for the same underlying issue). Mounting a block
// directly outside that build needs the package mocked; re-export the real
// helper from `@eldrajs/theme-core` (which has no virtual import) so the
// assertions below still exercise the genuine framing math.
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@eldrajs/theme-vue', async () => {
  const core = await import('@eldrajs/theme-core');
  return { imageFramingAttrs: core.imageFramingAttrs };
});

const { default: Hero } = await import('../blocks/hero/Block.vue');
const { default: Image } = await import('../blocks/image/Block.vue');

const framed = {
  url: 'https://cdn.example/hero.jpg',
  alt: 'Ridge',
  framing: { x: 0.2, y: 0.6, zoom: 2 },
};

describe('image framing opt-in', () => {
  it('renders the hero background with the framing style and marking attributes', () => {
    const wrapper = mount(Hero, {
      props: { entry: { id: 'hero-1', data: { heading: 'Hi', image: framed } } },
    });
    const img = wrapper.get('img.hero-media');
    expect(img.attributes('data-eldra-framing')).toBe('image');
    expect(img.attributes('data-eldra-framing-entry')).toBe('hero-1');
    expect(img.attributes('data-eldra-framing-value')).toBe('0.2,0.6,2');
    expect(img.attributes('style')).toContain('object-position: 20% 60%');
    expect(img.attributes('style')).toContain('transform: scale(2)');
    expect(img.attributes('style')).toContain('transform-origin: 25% 60%');
  });

  it('renders an unframed hero with the default cover position and no transform', () => {
    const wrapper = mount(Hero, {
      props: {
        entry: {
          id: 'hero-2',
          data: { heading: 'Hi', image: { url: 'https://cdn.example/a.jpg' } },
        },
      },
    });
    const style = wrapper.get('img.hero-media').attributes('style') ?? '';
    expect(style).toContain('object-position: 50% 50%');
    expect(style).not.toContain('transform');
    expect(wrapper.get('img.hero-media').attributes('data-eldra-framing-value')).toBe('0.5,0.5,1');
  });

  it('frames the image block at 16/9 with the same helper', () => {
    const wrapper = mount(Image, {
      props: { entry: { id: 'img-1', data: { image: framed, caption: 'Cap' } } },
    });
    const img = wrapper.get('img');
    expect(img.attributes('data-eldra-framing')).toBe('image');
    expect(img.attributes('data-eldra-framing-entry')).toBe('img-1');
    expect(img.attributes('style')).toContain('transform: scale(2)');
  });
});
