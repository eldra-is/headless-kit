// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { ELDRA_KEY, type EldraContext } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';

// `mock.json` is exactly what Studio seeds on insert — no `image` yet (Core's write-side media
// validator rejects a fixture-shaped object there); `preview.json` is the demo-imagery overlay a
// story merges onto it.
const withImage = { ...mock, ...preview };

const ASPECTS = ['auto', '1x1', '4x3', '3x2', '16x9', '3x4'] as const;
const WIDTHS = ['narrow', 'content', 'wide', 'full'] as const;

const trackedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of trackedWrappers.splice(0)) wrapper.unmount();
});

function mountImage(data: Record<string, unknown>, options: { editing?: boolean } = {}) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const opts = {
    ...base,
    global: {
      ...base.global,
    },
  };
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as EldraContext;
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  const wrapper = mount(Block, opts);
  trackedWrappers.push(wrapper);
  return wrapper;
}

describe('image block', () => {
  it('renders nothing (no crash) for the bare mock.json — the freshly-inserted state', async () => {
    const wrapper = mountImage(mock);
    expect(wrapper.find('figure').exists()).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('shows the photo-icon placeholder and a caption hint for the bare mock while editing', async () => {
    const wrapper = mountImage(mock, { editing: true });
    expect(wrapper.find('figure').exists()).toBe(false);
    expect(wrapper.text()).toContain('Choose an image');
    expect(wrapper.text()).toContain('JPG, PNG or WebP');
    expect(wrapper.text()).toContain('Add a caption (optional)');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the merged preview content in a figure/figcaption and passes axe', async () => {
    const wrapper = mountImage(withImage);
    expect(wrapper.find('figure').exists()).toBe(true);
    const figcaption = wrapper.get('figcaption');
    expect(figcaption.text()).toBe(withImage.caption);
    expect(wrapper.get('img').attributes('alt')).toBe(withImage.image.altText);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(ASPECTS)('passes axe at aspect %s', async (aspect) => {
    const wrapper = mountImage({ ...withImage, aspect });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(WIDTHS)('passes axe at width %s', async (width) => {
    const wrapper = mountImage({ ...withImage, width });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('gives a non-decorative image its alt text', () => {
    const wrapper = mountImage(withImage);
    expect(wrapper.get('img').attributes('alt')).toBe(withImage.image.altText);
  });

  it('renders alt="" once decorative is on', () => {
    const wrapper = mountImage({ ...withImage, decorative: true });
    expect(wrapper.get('img').attributes('alt')).toBe('');
  });

  it.each(ASPECTS)('carries the framing marker attributes at aspect %s', (aspect) => {
    const wrapper = mountImage({ ...withImage, aspect });
    const img = wrapper.get('img');
    expect(img.attributes('data-eldra-framing')).toBe('image');
    expect(img.attributes('data-eldra-framing-entry')).toBe('e1');
  });

  it('omits the figcaption when no caption is set', () => {
    const wrapper = mountImage({ image: withImage.image, aspect: '3x2', width: 'content' });
    expect(wrapper.find('figcaption').exists()).toBe(false);
  });

  describe('with a link', () => {
    const linked = {
      ...withImage,
      linkLabel: 'Shop the linen tea towels',
      linkHref: '/collections/tea-towels',
    };

    it('wraps the image alone in one real <a>, its only content the image', () => {
      const wrapper = mountImage(linked);
      const links = wrapper.findAll('a');
      expect(links).toHaveLength(1);
      const link = links[0]!;
      expect(link.find('img').exists()).toBe(true);
      // The link's accessible name comes from the wrapped image's own `alt` — the only content
      // inside the `<a>` — never from `linkLabel` (never rendered as visible/audible text) and
      // never from the caption, which sits outside the link entirely.
      expect(link.text()).toBe('');
      expect(link.get('img').attributes('alt')).toBe(withImage.image.altText);
      expect(wrapper.get('a').attributes('href')).toBe(linked.linkHref);
      expect(wrapper.find('figcaption a').exists()).toBe(false);
    });

    it('names the link with linkLabel when the image is decorative, so the link is never nameless', async () => {
      const wrapper = mountImage({ ...linked, decorative: true });
      const link = wrapper.get('a');
      expect(link.get('img').attributes('alt')).toBe('');
      expect(link.attributes('aria-label')).toBe(linked.linkLabel);
      expect(mountImage(linked).get('a').attributes('aria-label')).toBeUndefined();
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it("is a real <a href>, so Tab and Enter are the platform's own way to reach and activate it", () => {
      const wrapper = mount(Block, { ...mountOptions({ entry: { id: 'e1', data: linked } }) });
      trackedWrappers.push(wrapper);
      // attachTo is required for real focus to land, matching split-content's own keyboard test.
      document.body.append(wrapper.element);
      const link = wrapper.get('a[href]').element as HTMLAnchorElement;
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('tabindex')).toBeNull();
      link.focus();
      expect(document.activeElement).toBe(link);
    });

    it('drops the link entirely for an unsafe href', () => {
      const wrapper = mountImage({ ...linked, linkHref: 'javascript:alert(1)' });
      expect(wrapper.find('a').exists()).toBe(false);
    });

    it('gives the inset ring class at width: full, and the outer ring elsewhere', () => {
      const full = mountImage({ ...linked, width: 'full' });
      expect(full.get('a').classes()).toContain('eldra-focus-inset');
      expect(full.get('a').classes()).not.toContain('eldra-focus');

      const content = mountImage({ ...linked, width: 'content' });
      expect(content.get('a').classes()).not.toContain('eldra-focus-inset');
    });

    it.each(WIDTHS)('passes axe with a link at width %s', async (width) => {
      const wrapper = mountImage({ ...linked, width });
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  describe('width: full', () => {
    it('renders no Container around the image (edge to edge, no radius)', () => {
      const wrapper = mountImage({ ...withImage, width: 'full' });
      expect(wrapper.get('[data-part="frame"]').classes()).not.toContain('rounded-lg');
      expect(wrapper.get('[data-part="frame"]').classes()).not.toContain('rounded-xl');
    });

    it('sits the caption inside a content-width grid, not against the screen edge', () => {
      const wrapper = mountImage({ ...withImage, width: 'full' });
      expect(wrapper.get('figcaption').classes()).toContain('eldra-container-content');
    });
  });

  it('applies the lg radius at every width for narrow', () => {
    const wrapper = mountImage({ ...withImage, width: 'narrow' });
    expect(wrapper.get('[data-part="frame"]').classes()).toContain('rounded-lg');
  });

  it('switches content/wide to the xl radius from 48rem', () => {
    for (const width of ['content', 'wide'] as const) {
      const wrapper = mountImage({ ...withImage, width });
      const frame = wrapper.get('[data-part="frame"]').classes();
      expect(frame).toContain('rounded-lg');
      expect(frame).toContain('@tablet:rounded-xl');
    }
  });

  it('centres the caption text and its box when captionAlign is center', () => {
    const wrapper = mountImage({ ...withImage, captionAlign: 'center' });
    const caption = wrapper.get('figcaption p');
    expect(caption.classes()).toContain('text-center');
    expect(caption.classes()).toContain('mx-auto');
  });

  it('left-aligns the caption by default (captionAlign: start)', () => {
    const wrapper = mountImage(withImage);
    const caption = wrapper.get('figcaption p');
    expect(caption.classes()).not.toContain('text-center');
    expect(caption.classes()).not.toContain('mx-auto');
  });

  it('carries no motion class anywhere', () => {
    const wrapper = mountImage(withImage);
    expect(wrapper.html()).not.toMatch(/transition|animate|duration-/);
  });

  it("passes 'auto' aspect through as no forced aspect-ratio", () => {
    const wrapper = mountImage({ ...withImage, aspect: 'auto' });
    expect(wrapper.get('[data-part="frame"]').attributes('style') ?? '').toContain(
      'aspect-ratio: auto'
    );
  });

  it.each([
    ['1x1', '1 / 1'],
    ['4x3', '4 / 3'],
    ['3x2', '3 / 2'],
    ['16x9', '16 / 9'],
    ['3x4', '3 / 4'],
  ] as const)('applies the %s aspect ratio', (aspect, expected) => {
    const wrapper = mountImage({ ...withImage, aspect });
    expect(wrapper.get('[data-part="frame"]').attributes('style') ?? '').toContain(
      `aspect-ratio: ${expected}`
    );
  });
});
