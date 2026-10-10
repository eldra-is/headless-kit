// @vitest-environment jsdom
//
// `blocks/hero/Block.vue` and `blocks/image/Block.vue` render their image
// through `UiImage` (app/components/ui/UiImage.vue), which imports
// `imageFramingAttrs`/`imageFramingStyle` from `@eldrajs/theme-vue`; its
// single index entry also re-exports `EldraBlockZone`/`EldraLayout`, which
// import `virtual:eldra/blocks`/`virtual:eldra/manifest`/
// `virtual:eldra/breakpoints` at the top level, normally supplied only by
// the Nuxt build's vite plugin. `vitest.config.ts` aliases all three to
// mocks under `test/mocks/`, so the package — and therefore these blocks —
// resolve for real here.
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Hero from '../blocks/hero/Block.vue';
import Image from '../blocks/image/Block.vue';
import { mountOptions } from './support/mountBlock';

const framed = {
  assetId: 'a1',
  url: 'https://cdn.example/hero.jpg',
  altText: 'Ridge',
  framing: { x: 0.2, y: 0.6, zoom: 2 },
};

describe('image framing opt-in', () => {
  it('renders the hero image with the framing style and marking attributes', () => {
    const wrapper = mount(
      Hero,
      mountOptions({
        entry: { id: 'hero-1', data: { heading: 'Hi', image: framed, variant: 'image-right' } },
      })
    );
    const img = wrapper.get('img');
    expect(img.attributes('data-eldra-framing')).toBe('image');
    expect(img.attributes('data-eldra-framing-entry')).toBe('hero-1');
    expect(img.attributes('data-eldra-framing-value')).toBe('0.2,0.6,2');
    expect(img.attributes('style')).toContain('object-position: 20% 60%');
    expect(img.attributes('style')).toContain('transform: scale(2)');
    expect(img.attributes('style')).toContain('transform-origin: 25% 60%');
  });

  it('renders an unframed hero with the default cover position and no transform', () => {
    const wrapper = mount(
      Hero,
      mountOptions({
        entry: {
          id: 'hero-2',
          data: {
            heading: 'Hi',
            image: { assetId: 'a2', url: 'https://cdn.example/a.jpg' },
            variant: 'image-right',
          },
        },
      })
    );
    const img = wrapper.get('img');
    const style = img.attributes('style') ?? '';
    expect(style).toContain('object-position: 50% 50%');
    expect(style).not.toContain('transform');
    // Marker attributes stay present (a default, centred framing value) even
    // before an editor has framed anything — see blocks/hero/Block.vue's
    // module doc comment.
    expect(img.attributes('data-eldra-framing-value')).toBe('0.5,0.5,1');
  });

  it('frames the image block at its declared aspect ratio with the same helper', () => {
    const wrapper = mount(
      Image,
      mountOptions({ entry: { id: 'img-1', data: { image: framed, caption: 'Cap' } } })
    );
    const img = wrapper.get('img');
    expect(img.attributes('data-eldra-framing')).toBe('image');
    expect(img.attributes('data-eldra-framing-entry')).toBe('img-1');
    expect(img.attributes('style')).toContain('transform: scale(2)');
  });
});
