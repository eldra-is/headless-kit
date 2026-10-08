import { imageSrcset } from '@eldrajs/sdk';
import { safeImageSrc } from '@eldrajs/rich-text';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { defineComponent, h, markRaw } from 'vue';
import RichText from '../../rich-text/RichText.vue';
import type { NodeComponentProps } from '../../rich-text/types';
import EldraImage from '../EldraImage.vue';

const ASSET =
  'https://media.eldra.app/public/6ace9a70-fb78-43f3-87a8-c8adffadcf36/assets/52a99a52-50a2-4e0f-ba14-d0a769e7eede';

describe('EldraImage', () => {
  it('renders a responsive img for an Eldra asset', () => {
    const wrapper = mount(EldraImage, {
      props: {
        src: { url: ASSET, contentType: 'image/jpeg' },
        alt: 'Mat sling on an oak floor',
        sizes: '(min-width: 1024px) 25vw, 50vw',
        aspectRatio: 4 / 5,
      },
    });
    const img = wrapper.find('img');
    expect(img.attributes()).toMatchObject({
      src: `${ASSET}/md`,
      srcset: imageSrcset(ASSET),
      sizes: '(min-width: 1024px) 25vw, 50vw',
      width: '800',
      height: '1000',
      alt: 'Mat sling on an oak floor',
      loading: 'lazy',
      decoding: 'async',
    });
  });

  it('lets a hero load eagerly at a larger fallback and passes other attributes through', () => {
    const wrapper = mount(EldraImage, {
      props: { src: ASSET, alt: '', sizes: '100vw', variant: 'xl', loading: 'eager' },
      attrs: { class: 'hero', fetchpriority: 'high' },
    });
    const img = wrapper.find('img');
    expect(img.attributes('src')).toBe(`${ASSET}/xl`);
    expect(img.attributes('loading')).toBe('eager');
    expect(img.attributes('fetchpriority')).toBe('high');
    expect(img.classes()).toContain('hero');
  });

  it('renders an external image as given, without srcset or sizes', () => {
    const img = mount(EldraImage, {
      props: { src: 'https://cdn.example.com/hero.jpg', alt: 'Hero', sizes: '100vw' },
    }).find('img');
    expect(img.attributes('src')).toBe('https://cdn.example.com/hero.jpg');
    expect(img.attributes('srcset')).toBeUndefined();
    expect(img.attributes('sizes')).toBeUndefined();
  });

  it('renders nothing for a source outside the rich-text image rule', () => {
    for (const src of [
      'javascript:alert(1)',
      { url: ' JavaScript:alert(1)' },
      'data:text/html,x',
    ]) {
      const wrapper = mount(EldraImage, { props: { src, alt: '', sizes: '100vw' } });
      expect(wrapper.find('img').exists()).toBe(false);
    }
  });

  it('renders nothing without a url', () => {
    const wrapper = mount(EldraImage, { props: { src: null, alt: 'Missing', sizes: '100vw' } });
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('has no axe violations', async () => {
    const wrapper = mount(EldraImage, {
      props: { src: ASSET, alt: 'Mat sling on an oak floor', sizes: '100vw' },
      attachTo: document.body,
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('replaces the rich-text image node with a narrower sizes, as docs/images.md shows', () => {
    const ArticleImage = markRaw(
      defineComponent<NodeComponentProps>({
        props: ['node', 'attrs'],
        setup: (props) => () =>
          h(EldraImage, {
            src: safeImageSrc(props.attrs.src),
            alt: props.attrs.alt ?? '',
            sizes: '(min-width: 768px) 720px, 100vw',
          }),
      })
    );
    const img = mount(RichText, {
      props: {
        content: { type: 'doc', content: [{ type: 'image', attrs: { src: ASSET, alt: 'Mat' } }] },
        nodes: { image: ArticleImage },
      },
    }).find('img');
    expect(img.attributes('sizes')).toBe('(min-width: 768px) 720px, 100vw');
    expect(img.attributes('srcset')).toBe(imageSrcset(ASSET));
    expect(img.attributes('alt')).toBe('Mat');
  });
});
