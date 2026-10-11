// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import EldraRouterLink from '../../../app/components/EldraRouterLink.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

/** `mock.json` is Studio's insert seed (no media); `preview.json` is the demo-imagery overlay a
 *  story/preview merges on top of it — same shallow-merge shape `testimonials`/`feature-grid` use. */
const withMedia = { ...mock, ...preview };

/** The genuinely minimal fixture: only the fields the block requires. */
const bare = {
  heading: 'As featured in',
  logos: [{ name: 'Fold Journal' }, { name: 'Kiln Weekly' }],
};

const VARIANTS = ['grid', 'row'] as const;

function mountBlock(
  data: Record<string, unknown>,
  options: { editing?: boolean; attachToBody?: boolean } = {}
) {
  const opts = mountOptions({ entry: { id: 'e1', data } });
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  return mount(Block, options.attachToBody ? { ...opts, attachTo: document.body } : opts);
}

describe('logo-cloud block', () => {
  it('renders the full (mock + preview) content with no axe violations', async () => {
    const wrapper = mountBlock(withMedia);
    expect(wrapper.text()).toContain(withMedia.heading);
    // Every logo has an image in `withMedia`, so its name surfaces as the image `alt`, not as
    // visible text (the wordmark fallback only renders when there is no image).
    const alts = wrapper.findAll('img').map((img) => img.attributes('alt'));
    for (const logo of withMedia.logos) expect(alts).toContain(logo.name);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare, required-fields-only content with no axe violations', async () => {
    const wrapper = mountBlock(bare);
    expect(wrapper.text()).toContain(bare.heading);
    for (const logo of bare.logos) expect(wrapper.text()).toContain(logo.name);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(VARIANTS)('renders the %s variant with no axe violations', async (variant) => {
    const wrapper = mountBlock({ ...withMedia, variant });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('the logos sit in a <ul> under the h2 that labels the section', () => {
    const wrapper = mountBlock(mock);
    const section = wrapper.get('section');
    const labelledBy = section.attributes('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const heading = wrapper.get('h2');
    expect(heading.attributes('id')).toBe(labelledBy);
    expect(wrapper.get('ul').exists()).toBe(true);
    for (const li of wrapper.findAll('ul > li')) {
      // Every direct child of the list is a real <li> (LogoItem renders its own).
      expect(li.element.tagName).toBe('LI');
    }
  });

  it('uses each logo\'s name as its image alt text, never "logo"', () => {
    const wrapper = mountBlock(withMedia);
    const images = wrapper.findAll('img');
    expect(images.length).toBe(withMedia.logos.length);
    for (const img of images) {
      const alt = img.attributes('alt')!;
      expect(withMedia.logos.some((logo) => logo.name === alt)).toBe(true);
      expect(alt.toLowerCase()).not.toContain('logo');
    }
  });

  it('a logo with no image renders its name as a wordmark instead', () => {
    const wrapper = mountBlock(mock); // mock.json never carries media
    expect(wrapper.find('img').exists()).toBe(false);
    for (const logo of mock.logos) expect(wrapper.text()).toContain(logo.name);
  });

  it('renders no <a> at all when every logo ships with an empty href — the seeded state', () => {
    // `mock.json`'s `logos[].href` ships empty (no dead demo external host) — every logo renders
    // as a plain, unlinked wordmark/image cell.
    const wrapper = mountBlock(mock);
    expect(wrapper.findAll('a')).toHaveLength(0);
  });

  it('linked logos are real <a> tab stops in visual order and activate with Enter (native anchor behaviour)', () => {
    const logos = mock.logos.map((logo, index) => ({
      ...logo,
      href: `https://stockist-${index + 1}.example`,
    }));
    const wrapper = mountBlock({ ...mock, logos }, { attachToBody: true });
    const links = wrapper.findAll('a');
    expect(links.map((link) => link.attributes('href'))).toEqual(logos.map((logo) => logo.href));
    const first = links[0]!.element as HTMLAnchorElement;
    first.focus();
    expect(document.activeElement).toBe(first);
    wrapper.unmount();
  });

  it("every linked logo meets its variant's minimum target size (class assertion)", () => {
    const logos = mock.logos.map((logo, index) => ({
      ...logo,
      href: `https://stockist-${index + 1}.example`,
    }));
    const grid = mountBlock({ ...mock, logos, variant: 'grid' });
    for (const link of grid.findAll('a')) expect(link.classes()).toContain('h-full');

    const row = mountBlock({ ...mock, logos, variant: 'row' });
    for (const link of row.findAll('a')) expect(link.classes()).toContain('min-h-16');
  });

  it('renders a real <a> for every href — hover is never the only cue that a logo is a link', () => {
    const logos = mock.logos.map((logo, index) => ({
      ...logo,
      href: `https://stockist-${index + 1}.example`,
    }));
    const wrapper = mountBlock({ ...mock, logos });
    for (const logo of logos) {
      const link = wrapper.findAll('a').find((a) => a.attributes('href') === logo.href);
      expect(link, `expected a link to ${logo.href}`).toBeTruthy();
    }
  });

  it('renders 12 logos as 12 list items', () => {
    const logos = Array.from({ length: 12 }, (_, index) => ({
      name: `Stockist ${index + 1}`,
      href: `https://stockist-${index + 1}.example`,
    }));
    const wrapper = mountBlock({ ...mock, logos });
    expect(wrapper.findAll('li')).toHaveLength(12);
    expect(wrapper.findAll('a')).toHaveLength(12);
  });

  it('shows an editor-only hint for an empty logo cell, and renders it live as nothing', async () => {
    const data = { ...mock, logos: [...mock.logos, { name: '' }] };
    const live = mountBlock(data);
    expect(live.findAll('li')).toHaveLength(mock.logos.length);

    const editing = mountBlock(data, { editing: true });
    expect(editing.text()).toContain('Add a logo');
    expect(await axe(editing.element)).toHaveNoViolations();
  });

  it('shows the heading hint only in the editor when heading is empty', async () => {
    const data = { ...mock, heading: '' };
    const live = mountBlock(data);
    expect(live.text()).not.toContain('Add a heading');
    expect(live.find('h2').exists()).toBe(false);

    const editing = mountBlock(data, { editing: true });
    expect(editing.text()).toContain('Add a heading');
    expect(await axe(editing.element)).toHaveNoViolations();
  });

  it('defaults sectionBackground to none and variant to grid', () => {
    const { sectionBackground: _bg, variant: _variant, ...rest } = mock;
    const wrapper = mountBlock(rest);
    expect(wrapper.get('section').attributes('data-section-bg')).toBe('none');
    expect(wrapper.get('ul').classes()).toContain('grid');
  });

  it('routes a same-site logo destination through the router link and leaves external ones as plain anchors', () => {
    const logos = [
      { name: 'Journal', href: '/journal/stockists' },
      { name: 'Hearth & Co.', href: 'https://hearthandco.example' },
    ];
    const wrapper = mountBlock({ ...mock, logos });
    const routed = wrapper.findAllComponents(EldraRouterLink);
    expect(routed).toHaveLength(1);
    expect(routed[0]!.find('a').attributes('href')).toBe('/journal/stockists');
    expect(wrapper.find('a[href="https://hearthandco.example"]').exists()).toBe(true);
  });

  it('renders nothing live without its required heading or without a single named logo, but still renders in the editor', () => {
    expect(
      mountBlock({ ...mock, logos: [] })
        .find('section')
        .exists()
    ).toBe(false);
    expect(
      mountBlock({ ...mock, logos: [{ name: '' }] })
        .find('section')
        .exists()
    ).toBe(false);
    expect(
      mountBlock({ ...mock, heading: '' })
        .find('section')
        .exists()
    ).toBe(false);
    expect(
      mountBlock({ ...mock, logos: [] }, { editing: true })
        .find('section')
        .exists()
    ).toBe(true);
  });
});
