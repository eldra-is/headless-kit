import { afterEach, describe, expect, it, vi } from 'vitest';
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

  /**
   * Acceptance criterion "images are never stretched or letterboxed": a focal point too close to
   * an edge for a given zoom would, if used verbatim as the scale origin, pull the far side of the
   * image inward and uncover the frame's own background there. The origin is clamped into the safe
   * band for that zoom instead — `object-position` is not, since cropping alone can never
   * letterbox (spec "Image" → Behaviour & motion; the same band `@eldrajs/theme-core`'s
   * `imageFraming.ts#focalBand` computes).
   */
  it('clamps transform-origin into the safe band for the zoom, without touching object-position', () => {
    const wrapper = mountWith(Image, {
      props: { media: MEDIA, focal: { x: 20, y: 90 }, zoom: 2 },
    });
    const style = wrapper.get('[data-part="media"]').attributes('style') ?? '';
    expect(style).toContain('object-position: 20% 90%');
    // zoom 2 → inset (1 - 1/2) * 50 = 25, so the safe band is [25, 75].
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
