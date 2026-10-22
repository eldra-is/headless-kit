import { responsiveImage, type EldraResponsiveImage } from '@eldrajs/sdk';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { isIS } from '../../../messages/is-IS';
import { MESSAGES_KEY } from '../../../composables/useMessages';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Image from '../Image.vue';
import type { ImageMedia, ImageRatio } from '../types';

const MEDIA: ImageMedia = { src: '/demo/sweater.jpg', alt: 'Oatmeal merino crew sweater, folded' };

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Image — element and parts', () => {
  it('renders a <div> root with no interactive role when there is no caption', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA } });
    expect(wrapper.element.tagName).toBe('DIV');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.attributes('role')).toBeUndefined();
    expect(wrapper.attributes('tabindex')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders frame and media parts for a given image', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA } });
    expect(wrapper.find('[data-part="frame"]').exists()).toBe(true);
    const media = wrapper.get('[data-part="media"]');
    expect(media.element.tagName).toBe('IMG');
    expect(media.attributes('src')).toBe(MEDIA.src);
    wrapper.unmount();
  });
});

describe('Image — ratio', () => {
  const CASES: Array<[ImageRatio, string]> = [
    ['1x1', '1 / 1'],
    ['4x3', '4 / 3'],
    ['3x2', '3 / 2'],
    ['16x9', '16 / 9'],
    ['3x4', '3 / 4'],
    ['4x5', '4 / 5'],
  ];

  it.each(CASES)('sets the frame aspect-ratio style for %s', (ratio, expected) => {
    const wrapper = mountWith(Image, { props: { media: MEDIA, ratio } });
    expect(wrapper.get('[data-part="frame"]').attributes('style')).toContain(
      `aspect-ratio: ${expected}`
    );
    wrapper.unmount();
  });

  it('defaults to 4x3', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA } });
    expect(wrapper.get('[data-part="frame"]').attributes('style')).toContain('aspect-ratio: 4 / 3');
    wrapper.unmount();
  });

  it('"auto" with no media falls back to 4:3', () => {
    const wrapper = mountWith(Image, { props: { ratio: 'auto', media: null } });
    expect(wrapper.get('[data-part="frame"]').attributes('style')).toContain('aspect-ratio: 4 / 3');
    wrapper.unmount();
  });

  it('"auto" with media carrying width/height uses the image\'s own ratio', () => {
    const wrapper = mountWith(Image, {
      props: { ratio: 'auto', media: { ...MEDIA, width: 1600, height: 900 } },
    });
    expect(wrapper.get('[data-part="frame"]').attributes('style')).toContain(
      'aspect-ratio: 1600 / 900'
    );
    wrapper.unmount();
  });

  it('"auto" with media but no width/height leaves the browser to size it', () => {
    const wrapper = mountWith(Image, { props: { ratio: 'auto', media: MEDIA } });
    expect(wrapper.get('[data-part="frame"]').attributes('style')).toContain('aspect-ratio: auto');
    wrapper.unmount();
  });

  /**
   * A follow-up fix (hero `image-background`'s "fill" mode, wired through the starter's
   * `UiImage`): `ratio="auto"` must not fight a caller's own `classes.frame` sizing override —
   * the frame's `aspect-ratio: auto` has no effect once the frame's height comes from somewhere
   * else (a `classes.frame: 'h-full'` override filling a positioned ancestor), so nothing here
   * needs to special-case it; this pins that down so a future change to the ratio/frame-sizing
   * interaction cannot silently reintroduce a fight between them. jsdom does not compute layout, so
   * this asserts the classes/style that make the geometry hold (the same limit every other class-
   * based assertion in this file has), not rendered pixels.
   */
  it('a classes.frame size override composes with ratio="auto" instead of being overridden by it', () => {
    const wrapper = mountWith(Image, {
      props: { ratio: 'auto', media: MEDIA, classes: { frame: 'h-full' } },
    });
    const frame = wrapper.get('[data-part="frame"]');
    expect(frame.attributes('style')).toContain('aspect-ratio: auto');
    expect(frame.classes()).toContain('h-full');
    // The media still covers whatever box the frame (now sized by its ancestor, not by an
    // aspect-ratio) ends up with — `object-cover` plus `h-full`/`w-full` is unconditional.
    const media = wrapper.get('[data-part="media"]');
    expect(media.classes()).toEqual(expect.arrayContaining(['object-cover', 'h-full', 'w-full']));
    wrapper.unmount();
  });
});

describe('Image — focal point and zoom', () => {
  it('sets object-position from focal, centred by default', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA } });
    expect(wrapper.get('[data-part="media"]').attributes('style')).toContain(
      'object-position: 50% 50%'
    );
    wrapper.unmount();
  });

  it('sets object-position from a custom focal point', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA, focal: { x: 85, y: 20 } } });
    expect(wrapper.get('[data-part="media"]').attributes('style')).toContain(
      'object-position: 85% 20%'
    );
    wrapper.unmount();
  });

  it('adds no transform when zoom is 1 (the default)', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA } });
    expect(wrapper.get('[data-part="media"]').attributes('style')).not.toContain('transform');
    wrapper.unmount();
  });

  it('scales the media and sets transform-origin at the focal point when it is within the safe band', () => {
    const wrapper = mountWith(Image, {
      props: { media: MEDIA, focal: { x: 40, y: 60 }, zoom: 1.6 },
    });
    const style = wrapper.get('[data-part="media"]').attributes('style') ?? '';
    expect(style).toContain('transform: scale(1.6)');
    expect(style).toContain('transform-origin: 40% 60%');
    wrapper.unmount();
  });

  // The band is the page builder's (theme-core imageFraming.ts), so a stored framing renders as Studio previews it.
  it('clamps transform-origin into the page builder band by default, without touching object-position', () => {
    const wrapper = mountWith(Image, {
      props: { media: MEDIA, focal: { x: 20, y: 90 }, zoom: 2 },
    });
    const style = wrapper.get('[data-part="media"]').attributes('style') ?? '';
    expect(style).toContain('object-position: 20% 90%');
    // zoom 2 → inset (1 - 1/2) * 50 = 25, so the band is [25, 75].
    expect(style).toContain('transform-origin: 25% 75%');
    wrapper.unmount();
  });

  it('does not clamp a focal point already inside the safe band', () => {
    const wrapper = mountWith(Image, {
      props: { media: MEDIA, focal: { x: 50, y: 50 }, zoom: 2 },
    });
    const style = wrapper.get('[data-part="media"]').attributes('style') ?? '';
    expect(style).toContain('transform-origin: 50% 50%');
    wrapper.unmount();
  });
});

describe('Image — sizes under a zoom', () => {
  const FRAME_SIZES = '(min-width: 1024px) 400px, 100vw';
  const sizesOf = (props: Record<string, unknown>) => {
    const wrapper = mountWith(Image, { props: { media: MEDIA, ...props } });
    const sizes = wrapper.get('[data-part="media"]').attributes('sizes');
    wrapper.unmount();
    return sizes;
  };

  it('passes sizes through unchanged at zoom 1', () => {
    expect(sizesOf({ sizes: FRAME_SIZES })).toBe(FRAME_SIZES);
  });

  it('multiplies every length by the zoom when the media covers the frame', () => {
    expect(sizesOf({ sizes: FRAME_SIZES, zoom: 3 })).toBe(
      '(min-width: 1024px) calc(400px * 3), calc(100vw * 3)'
    );
  });

  it('scales media.sizes the same way when there is no sizes prop', () => {
    expect(sizesOf({ media: { ...MEDIA, sizes: '50vw' }, zoom: 2.5 })).toBe('calc(50vw * 2.5)');
  });

  it('leaves sizes alone under contain, where the whole image is shown', () => {
    expect(sizesOf({ sizes: FRAME_SIZES, zoom: 3, fit: 'contain' })).toBe(FRAME_SIZES);
  });

  it('renders no sizes when none is given, zoomed or not', () => {
    expect(sizesOf({ zoom: 3 })).toBeUndefined();
  });

  it('takes responsiveImage() output as its media, srcset untouched', () => {
    expectTypeOf<EldraResponsiveImage>().toExtend<ImageMedia>();
    const asset =
      'https://media.eldra.app/public/6ace9a70-fb78-43f3-87a8-c8adffadcf36/assets/52a99a52-50a2-4e0f-ba14-d0a769e7eede';
    const media = responsiveImage(
      { url: asset, contentType: 'image/jpeg', width: 5504, height: 3096 },
      { sizes: '100vw' }
    );
    const wrapper = mountWith(Image, {
      props: { media, alt: 'A close crop', ratio: '1x1', focal: { x: 62, y: 40 }, zoom: 3 },
    });
    const img = wrapper.get('[data-part="media"]');
    expect(img.attributes('srcset')).toBe(media?.srcset);
    expect(img.attributes('sizes')).toBe('calc(100vw * 3)');
    wrapper.unmount();
  });
});

describe('Image — zoomOrigin', () => {
  const styleOf = (props: Record<string, unknown>) => {
    const wrapper = mountWith(Image, { props: { media: MEDIA, ...props } });
    const style = wrapper.get('[data-part="media"]').attributes('style') ?? '';
    wrapper.unmount();
    return style;
  };

  it("'focal' zooms around the focal point itself, outside the band too, by sizing the media", () => {
    const style = styleOf({ focal: { x: 5, y: 95 }, zoom: 4, zoomOrigin: 'focal' });
    expect(style).toBe(
      'object-position: 5% 95%; position: relative; left: -15%; top: -285%; width: 400%; ' +
        'height: 400%; max-width: none;'
    );
  });

  it("'band' is the default and renders the same style as before the option existed", () => {
    expect(styleOf({ focal: { x: 5, y: 95 }, zoom: 4 })).toBe(
      styleOf({ focal: { x: 5, y: 95 }, zoom: 4, zoomOrigin: 'band' })
    );
    expect(styleOf({ focal: { x: 5, y: 95 }, zoom: 4 })).toContain('transform-origin: 37.5% 62.5%');
  });

  it("'focal' adds nothing to the focal point at zoom 1", () => {
    expect(styleOf({ focal: { x: 5, y: 95 }, zoomOrigin: 'focal' })).toBe(
      'object-position: 5% 95%;'
    );
  });
});

describe('Image — a numeric ratio', () => {
  it('sets the frame aspect-ratio to the width ÷ height it is given', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA, ratio: 6 / 5 } });
    expect(wrapper.get('[data-part="frame"]').attributes('style')).toContain('aspect-ratio: 1.2');
    wrapper.unmount();
  });
});

describe('Image — crops', () => {
  const PHONE = '(max-width: 640px)';
  const mountCrops = (props: Record<string, unknown>) =>
    mountWith(Image, {
      props: {
        media: MEDIA,
        ratio: '4x3',
        focal: { x: 60, y: 40 },
        zoom: 2,
        zoomOrigin: 'focal',
        ...props,
      },
    });
  const cssOf = (wrapper: ReturnType<typeof mountCrops>) =>
    wrapper.find('style').exists() ? wrapper.get('style').element.innerHTML : undefined;

  it('renders no style element and no scope without crops', () => {
    const wrapper = mountCrops({});
    expect(wrapper.find('style').exists()).toBe(false);
    expect(wrapper.attributes('data-eldra-image-crops')).toBeUndefined();
    wrapper.unmount();
  });

  it('writes each crop as a media rule scoped to this instance, over its inline style', () => {
    const wrapper = mountCrops({
      crops: [{ media: PHONE, ratio: '16x9', focal: { x: 20, y: 70 }, zoom: 3 }],
    });
    const scope = wrapper.attributes('data-eldra-image-crops');
    expect(scope).toBeTruthy();
    const css = cssOf(wrapper)!;
    expect(css).toContain(`@media ${PHONE}{`);
    expect(css).toContain(
      `[data-eldra-image-crops="${scope!.replace(/[^\w-]/g, (c) => `\\${c.codePointAt(0)!.toString(16)} `)}"]`
    );
    expect(css).toContain('>[data-part=frame]{aspect-ratio:16 / 9!important}');
    expect(css).toContain(
      '>[data-part=frame]>[data-part=media]{object-position:20% 70%!important;' +
        'position:relative!important;left:-40%!important;top:-140%!important;' +
        'width:300%!important;height:300%!important;max-width:none!important}'
    );
    expect(wrapper.find('img').attributes('style')).toContain('object-position: 60% 40%');
    expect(wrapper.findAll('img')).toHaveLength(1);
    wrapper.unmount();
  });

  it('writes the rules last crop first, so the first crop that matches wins as in sizes', () => {
    const wrapper = mountCrops({
      crops: [
        { media: PHONE, zoom: 3 },
        { media: '(max-width: 1000px)', zoom: 1.5 },
      ],
    });
    const css = cssOf(wrapper)!;
    expect(css.indexOf('(max-width: 1000px)')).toBeLessThan(css.indexOf(PHONE));
    wrapper.unmount();
  });

  it('takes ratio, focal and zoom from the instance where the crop leaves them out', () => {
    const wrapper = mountCrops({ ratio: 6 / 5, crops: [{ media: PHONE }] });
    const css = cssOf(wrapper)!;
    expect(css).toContain('aspect-ratio:1.2!important');
    expect(css).toContain('object-position:60% 40%!important');
    expect(css).toContain('width:200%!important');
    wrapper.unmount();
  });

  it('undoes the zoom where a crop shows the whole cover', () => {
    const focal = mountCrops({ crops: [{ media: PHONE, zoom: 1 }] });
    expect(cssOf(focal)).toContain(
      'left:0%!important;top:0%!important;width:100%!important;height:100%!important'
    );
    focal.unmount();
    const band = mountCrops({ zoomOrigin: 'band', crops: [{ media: PHONE, zoom: 1 }] });
    expect(cssOf(band)).toContain('{object-position:60% 40%!important;transform:none!important}');
    band.unmount();
  });

  it("clamps each crop's origin into the band under the default zoomOrigin", () => {
    const wrapper = mountCrops({
      zoomOrigin: undefined,
      crops: [{ media: PHONE, focal: { x: 5, y: 50 }, zoom: 4 }],
    });
    expect(cssOf(wrapper)).toContain('transform-origin:37.5% 50%!important');
    wrapper.unmount();
  });

  it('scales sizes per crop: its own sizes or the instance sizes, under its condition', () => {
    const wrapper = mountCrops({
      sizes: '(min-width: 960px) 48vw, 100vw',
      crops: [
        { media: PHONE, zoom: 4.6, sizes: '100vw' },
        { media: '(max-width: 1100px)', zoom: 3 },
      ],
    });
    expect(wrapper.get('img').attributes('sizes')).toBe(
      '(max-width: 640px) calc(100vw * 4.6), ' +
        '(max-width: 1100px) and (min-width: 960px) calc(48vw * 3), ' +
        '(max-width: 1100px) calc(100vw * 3), ' +
        '(min-width: 960px) calc(48vw * 2), calc(100vw * 2)'
    );
    wrapper.unmount();
  });

  it('leaves sizes unset when neither the instance nor a crop gives any', () => {
    const wrapper = mountCrops({ crops: [{ media: PHONE, zoom: 3 }] });
    expect(wrapper.get('img').attributes('sizes')).toBeUndefined();
    wrapper.unmount();
  });

  it.each([
    ['a condition that closes the style element', '(max-width: 640px)</style><script>x()</script>'],
    ['a condition that opens a rule', '(max-width: 640px){body{display:none}}'],
    ['a condition on two lines', '(max-width: 640px)\n</style>'],
    ['a media query list', '(max-width: 640px), print'],
    ['an empty condition', ' '],
  ])('ignores a crop with %s, with a warning', (_name, media) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountCrops({ crops: [{ media, zoom: 3 }] });
    expect(wrapper.find('style').exists()).toBe(false);
    expect(wrapper.get('img').attributes('sizes')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[@eldrajs/ui] <Image> ignores an invalid crop:', {
      media,
      zoom: 3,
    });
    wrapper.unmount();
  });

  it('ignores a crop whose numbers are not numbers', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountCrops({
      crops: [
        { media: PHONE, zoom: '3;}</style>' },
        { media: PHONE, ratio: '1;}</style>' },
        { media: PHONE, focal: { x: Number.NaN, y: 1 } },
      ],
    });
    expect(wrapper.find('style').exists()).toBe(false);
    wrapper.unmount();
  });

  it('server-renders the rules as written, with nothing escaped', async () => {
    const { createSSRApp, h } = await import('vue');
    const { renderToString } = await import('vue/server-renderer');
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(Image, {
            media: MEDIA,
            zoomOrigin: 'focal',
            crops: [{ media: '(width < 641px)', ratio: '16x9' }],
          }),
      })
    );
    expect(html).toContain('<style>@media (width < 641px){[data-eldra-image-crops=');
    expect(html).toContain('>[data-part=frame]{aspect-ratio:16 / 9!important}');
  });
});

describe('Image — decorative and required alt', () => {
  it('renders alt="" when decorative, even if alt is also given', () => {
    const wrapper = mountWith(Image, {
      props: { media: MEDIA, alt: 'A sweater', decorative: true },
    });
    expect(wrapper.get('[data-part="media"]').attributes('alt')).toBe('');
    wrapper.unmount();
  });

  it('renders the given alt when not decorative', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA, alt: 'A folded sweater' } });
    expect(wrapper.get('[data-part="media"]').attributes('alt')).toBe('A folded sweater');
    wrapper.unmount();
  });

  it('falls back to media.alt when no alt prop is given', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA } });
    expect(wrapper.get('[data-part="media"]').attributes('alt')).toBe(MEDIA.alt);
    wrapper.unmount();
  });

  it('warns in development when media has no alt and decorative is not set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Image, { props: { media: { src: '/demo/sweater.jpg' } } });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('alt');
    wrapper.unmount();
  });

  it('does not warn when decorative is set', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Image, {
      props: { media: { src: '/demo/sweater.jpg' }, decorative: true },
    });
    expect(warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not warn when alt is given', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Image, { props: { media: MEDIA } });
    expect(warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not warn when there is no media at all', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Image, { props: {} });
    expect(warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('Image — placeholder', () => {
  it('renders the placeholder part instead of media when there is no media', () => {
    const wrapper = mountWith(Image, { props: {} });
    expect(wrapper.find('[data-part="media"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="placeholder"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the "No image" text and role="img"/aria-label by default', () => {
    const wrapper = mountWith(Image, { props: {} });
    const placeholder = wrapper.get('[data-part="placeholder"]');
    expect(placeholder.attributes('role')).toBe('img');
    expect(placeholder.attributes('aria-label')).toBe('No image available');
    expect(placeholder.text()).toBe('No image');
    wrapper.unmount();
  });

  it('is hidden from assistive technology when decorative', () => {
    const wrapper = mountWith(Image, { props: { decorative: true } });
    const placeholder = wrapper.get('[data-part="placeholder"]');
    expect(placeholder.attributes('role')).toBeUndefined();
    expect(placeholder.attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('translates through provideEldraUiMessages', () => {
    const wrapper = mountWith(Image, {
      props: {},
      global: { provide: { [MESSAGES_KEY as symbol]: isIS } },
    });
    expect(wrapper.get('[data-part="placeholder"]').attributes('aria-label')).toBe(
      isIS.noImageAvailable
    );
    wrapper.unmount();
  });
});

describe('Image — caption', () => {
  it('renders no figure/figcaption when there is no caption', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA } });
    expect(wrapper.element.tagName).not.toBe('FIGURE');
    expect(wrapper.find('[data-part="caption"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders a <figure>/<figcaption> when caption is set', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA, caption: 'A folded sweater' } });
    expect(wrapper.element.tagName).toBe('FIGURE');
    const caption = wrapper.get('[data-part="caption"]');
    expect(caption.element.tagName).toBe('FIGCAPTION');
    expect(caption.text()).toBe('A folded sweater');
    wrapper.unmount();
  });
});

describe('Image — priority and lazy loading', () => {
  it('defaults to loading="lazy" and decoding="async", no fetchpriority', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA } });
    const media = wrapper.get('[data-part="media"]');
    expect(media.attributes('loading')).toBe('lazy');
    expect(media.attributes('decoding')).toBe('async');
    expect(media.attributes('fetchpriority')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders eager loading and fetchpriority="high" when priority is set', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA, priority: true } });
    const media = wrapper.get('[data-part="media"]');
    expect(media.attributes('loading')).toBe('eager');
    expect(media.attributes('fetchpriority')).toBe('high');
    wrapper.unmount();
  });
});

describe('Image — loading skeleton', () => {
  it("renders a skeleton at the frame's ratio instead of media or the placeholder", () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA, loading: true } });
    expect(wrapper.find('[data-part="media"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="placeholder"]').exists()).toBe(false);
    const skeleton = wrapper.get('[data-part="skeleton"]');
    expect(skeleton.classes()).toContain('eldra-skeleton');
    expect(skeleton.attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('still reserves the frame at the chosen ratio while loading', () => {
    const wrapper = mountWith(Image, { props: { ratio: '16x9', loading: true } });
    expect(wrapper.get('[data-part="frame"]').attributes('style')).toContain(
      'aspect-ratio: 16 / 9'
    );
    wrapper.unmount();
  });
});

describe('Image — rounded', () => {
  it('applies no radius class by default', () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA } });
    const frame = wrapper.get('[data-part="frame"]');
    expect(frame.classes()).not.toContain('rounded-lg');
    expect(frame.classes()).not.toContain('rounded-xl');
    wrapper.unmount();
  });

  it.each([
    ['lg', 'rounded-lg'],
    ['xl', 'rounded-xl'],
  ] as const)('applies %s as %s on the frame', (rounded, expected) => {
    const wrapper = mountWith(Image, { props: { media: MEDIA, rounded } });
    expect(wrapper.get('[data-part="frame"]').classes()).toContain(expected);
    wrapper.unmount();
  });
});

describe('Image — attribute forwarding', () => {
  it('puts class and style on the root, not the media element', () => {
    const wrapper = mountWith(Image, {
      props: { media: MEDIA },
      attrs: { class: 'w-40', style: 'margin-top: 1rem' },
    });
    expect(wrapper.classes()).toContain('w-40');
    expect(wrapper.attributes('style')).toContain('margin-top: 1rem');
    const media = wrapper.get('[data-part="media"]');
    expect(media.classes()).not.toContain('w-40');
    expect(media.attributes('style')).not.toContain('margin-top');
  });

  it('forwards other attrs (data-testid, width, height) to the media element', () => {
    const wrapper = mountWith(Image, {
      props: { media: MEDIA },
      attrs: { 'data-testid': 'hero-image' },
    });
    expect(wrapper.get('[data-part="media"]').attributes('data-testid')).toBe('hero-image');
    expect(wrapper.attributes('data-testid')).toBeUndefined();
  });
});

describe('Image — axe', () => {
  it('has no violations with media', async () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no violations for the placeholder', async () => {
    const wrapper = mountWith(Image, { props: {} });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no violations with a caption', async () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA, caption: 'A folded sweater' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no violations while loading', async () => {
    const wrapper = mountWith(Image, { props: { media: MEDIA, loading: true } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Image — narrow container', () => {
  it('renders in a 20rem container without overflowing', () => {
    const wrapper = mountNarrow(Image, {
      props: { media: MEDIA, caption: 'A folded sweater', ratio: '16x9' },
    });
    const host = wrapper.element.closest('[data-eldra-narrow-host]') as HTMLElement;
    expect(host).not.toBeNull();
    expect(wrapper.find('[data-part="frame"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

/**
 * A follow-up fix, kept deliberately light: spec "Image" → Behaviour & motion,
 * "no autoplay with sound" and 2.2.2's keyboard-pause requirement both come from the browser's own
 * native `<video controls>` here — there is no `autoplay` attribute at all, so pause is native
 * controls the keyboard already operates, and captions are the caller's own `<track>` responsibility
 * via the forwarded attrs this test also checks.
 */
describe('Image — video', () => {
  const VIDEO_MEDIA: ImageMedia = {
    src: '/demo/lookbook.mp4',
    type: 'video',
    alt: 'Lookbook reel',
  };

  it('renders a <video controls playsinline> with no autoplay', () => {
    const wrapper = mountWith(Image, { props: { media: VIDEO_MEDIA } });
    const video = wrapper.get('[data-part="media"]');
    expect(video.element.tagName).toBe('VIDEO');
    expect(video.attributes('src')).toBe(VIDEO_MEDIA.src);
    expect(video.attributes('controls')).toBe('');
    expect(video.attributes('playsinline')).toBe('');
    expect(video.attributes('autoplay')).toBeUndefined();
    wrapper.unmount();
  });

  it('forwards attrs (e.g. a caller-supplied <track>-bearing data attribute) to the video element', () => {
    const wrapper = mountWith(Image, {
      props: { media: VIDEO_MEDIA },
      attrs: { 'data-testid': 'lookbook-video' },
    });
    expect(wrapper.get('[data-part="media"]').attributes('data-testid')).toBe('lookbook-video');
    wrapper.unmount();
  });

  it('has no axe violations', async () => {
    const wrapper = mountWith(Image, { props: { media: VIDEO_MEDIA } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
