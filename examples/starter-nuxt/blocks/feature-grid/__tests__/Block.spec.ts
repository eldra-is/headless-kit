// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { FeatureCard } from '@eldrajs/ui';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

/**
 * `mock.json` is the seed Studio writes on insert — its items carry no `image` (Core's write-side
 * media validator rejects a fixture-shaped object there); `preview.json` is the demo-imagery
 * overlay `scripts/generate-stories.mjs`'s `Default` story merges onto it.
 *
 * The merge is shallow — a list present in both files is *replaced*, not merged — so an overlay
 * that supplies image-only items has to override every top-level field those items depend on too.
 * It did not: `mediaType` stayed `mock.json`'s `"icon"` over three items with no `icon` key, so
 * `Block.vue`'s `EMPTY_ICON` fallback won and the shipped `preview.png` (Studio's insert thumbnail)
 * showed three *text-only* cards in a four-column grid — neither the mock's icons nor the overlay's
 * images. `preview.json` now carries `mediaType: "image"` and `columns: "3"` for its three items,
 * and the assertions below hold the overlay to actually rendering its images.
 */
const withImages = { ...mock, ...preview };

function mountBlock(data: Record<string, unknown>, options: { editing?: boolean } = {}) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const opts = {
    ...base,
  };
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  return mount(Block, opts);
}

/** A minimal item, extended per test — every test that only cares about link/image behaviour
 * builds on this rather than repeating the full mock shape. */
function item(overrides: Record<string, unknown> = {}) {
  return { icon: 'bolt', title: 'Fast checkout', text: 'Pay in one click.', ...overrides };
}

describe('feature-grid block', () => {
  it('renders the merged (mock + preview) content with no axe violations', async () => {
    const wrapper = mountBlock(withImages);
    expect(wrapper.text()).toContain(withImages.heading);
    for (const featureItem of withImages.items) expect(wrapper.text()).toContain(featureItem.title);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it("the preview overlay renders its own images — the shipped preview.png's content", () => {
    // The overlay's three image items, actually shown as images (not the icon fallback) and in a
    // three-column grid. This is exactly what `blocks/feature-grid/preview.png` captures, so a
    // future overlay edit that forgets `mediaType`/`columns` fails here rather than only showing up
    // as a wrong insert thumbnail in Studio.
    expect(preview.mediaType).toBe('image');
    expect(preview.columns).toBe(String(preview.items.length));

    const wrapper = mountBlock(withImages);
    const images = wrapper.findAll('img');
    expect(images).toHaveLength(preview.items.length);
    expect(images.map((img) => img.attributes('src'))).toEqual(
      preview.items.map((previewItem) => previewItem.image.url)
    );
    // And no icon tile is *shown*: with `mediaType: "image"` every card hides it
    // (`classes.iconTile: 'hidden'`), which is what proves the shipped preview is the overlay's
    // images rather than `EMPTY_ICON`'s blank square — the state it used to capture.
    expect(wrapper.findAllComponents(FeatureCard)).toHaveLength(preview.items.length);
    for (const card of wrapper.findAllComponents(FeatureCard)) {
      expect(card.props('classes')).toMatchObject({ iconTile: 'hidden' });
    }
  });

  it('renders the bare mock.json content (freshly-inserted regression net) with no axe violations', async () => {
    const wrapper = mountBlock(mock);
    expect(wrapper.text()).toContain(mock.heading);
    for (const featureItem of mock.items) expect(wrapper.text()).toContain(featureItem.title);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['cards', 'plain'] as const)(
    'renders the %s variant with no axe violations',
    async (variant) => {
      const wrapper = mountBlock({ ...mock, variant });
      expect(wrapper.findAll('h3')).toHaveLength(mock.items.length);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('renders the image media type with no axe violations', async () => {
    const wrapper = mountBlock({ ...withImages, mediaType: 'image' });
    expect(wrapper.findAll('img')).toHaveLength(withImages.items.length);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the block root as a labelled <section> that measures its own width (@container)', () => {
    const wrapper = mountBlock(mock);
    const section = wrapper.get('section');
    expect(section.classes()).toContain('@container');
    expect(section.attributes('aria-labelledby')).toBeTruthy();
  });

  it('falls back to an aria-label naming the block when there is no heading', () => {
    const wrapper = mountBlock({ ...mock, heading: '' });
    const section = wrapper.get('section');
    expect(section.attributes('aria-labelledby')).toBeUndefined();
    expect(section.attributes('aria-label')).toBe('Feature grid');
    expect(wrapper.find('h2').exists()).toBe(false);
  });

  it('items are a <ul> of <li> with h3 titles under the block’s own h2', () => {
    const wrapper = mountBlock(mock);
    const heading = wrapper.get('h2');
    const list = wrapper.get('ul');
    // The list must come after the heading in the rendered DOM (h3 titles "under" the h2).
    expect(
      heading.element.compareDocumentPosition(list.element) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const items = list.findAll('li');
    expect(items).toHaveLength(mock.items.length);
    const titles = wrapper.findAll('h3').map((h) => h.text());
    expect(titles).toEqual(mock.items.map((i) => i.title));
  });

  it('renders 12 items as 12 list items', () => {
    const items = Array.from({ length: 12 }, (_, index) => item({ title: `Feature ${index + 1}` }));
    const wrapper = mountBlock({ ...mock, items });
    expect(wrapper.findAll('li')).toHaveLength(12);
    expect(wrapper.findAll('h3')).toHaveLength(12);
  });

  it('hides the icon tile — and its icon is aria-hidden when shown', async () => {
    const wrapper = mountBlock({ ...mock, items: [item({ icon: 'bolt' })] });
    await new Promise((resolve) => setTimeout(resolve));
    const iconTile = wrapper.get('[data-part="iconTile"]');
    expect(iconTile.attributes('aria-hidden')).toBe('true');
    const svg = iconTile.find('svg');
    expect(svg.exists()).toBe(true);
    expect(svg.attributes('aria-hidden')).toBe('true');
  });

  it('suppresses the icon tile entirely when mediaType is image', () => {
    const wrapper = mountBlock({ ...mock, mediaType: 'image', items: [item()] });
    const iconTile = wrapper.get('[data-part="iconTile"]');
    expect(iconTile.classes()).toContain('hidden');
  });

  it('a mediaType: image item with no image renders no <img> live', () => {
    const wrapper = mountBlock({ ...mock, mediaType: 'image', items: [item({ icon: undefined })] });
    expect(wrapper.find('img').exists()).toBe(false);
    // Mutation check (manual): dropping the `v-else-if="isImageMedia && !item.hasImage && isEditing"`
    // guard's `isEditing` condition — always showing the hint — would still pass a bare "no img"
    // assertion, so the editing-mode test below is what actually guards the live/editor split.
  });

  it('shows the image placeholder hint only in the editor, never live, for a missing image', async () => {
    const data = { ...mock, mediaType: 'image', items: [item({ icon: undefined })] };
    const live = mountBlock(data);
    expect(live.text()).not.toContain('Choose an image');

    const editing = mountBlock(data, { editing: true });
    expect(editing.text()).toContain('Choose an image');
    expect(editing.find('img').exists()).toBe(false);
    expect(await axe(editing.element)).toHaveNoViolations();
  });

  it('renders an image once the item has one, in a 3:2 rounded frame', () => {
    const data = {
      ...mock,
      mediaType: 'image',
      items: [
        item({
          icon: undefined,
          image: { assetId: 'a1', url: '/demo/feature-1.svg', altText: 'A demo image' },
        }),
      ],
    };
    const wrapper = mountBlock(data);
    const img = wrapper.get('img');
    expect(img.attributes('src')).toBe('/demo/feature-1.svg');
    expect(img.attributes('alt')).toBe('A demo image');
  });

  it('renders no nested links: at most one <a> per item, the item’s own title link', () => {
    const items = [
      item({ title: 'Linked one', linkLabel: 'About one', href: '/one' }),
      item({ title: 'Linked two', linkLabel: 'About two', href: '/two' }),
      item({ title: 'Unlinked' }),
    ];
    const wrapper = mountBlock({ ...mock, items });
    const listItems = wrapper.findAll('li');
    expect(listItems).toHaveLength(3);
    for (const listItem of listItems) {
      expect(listItem.findAll('a').length).toBeLessThanOrEqual(1);
    }
    expect(wrapper.findAll('a')).toHaveLength(2);
    expect(wrapper.get('a[href="/one"]').text()).toContain('Linked one');
    expect(wrapper.get('a[href="/two"]').text()).toContain('Linked two');
  });

  it('reaches the head link, then every item link, in DOM order', () => {
    const items = [
      item({ title: 'First', href: '/first' }),
      item({ title: 'Second', href: '/second' }),
    ];
    const wrapper = mountBlock({
      ...mock,
      headLinkLabel: 'See everything',
      headLinkHref: '/everything',
      items,
    });
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'));
    expect(hrefs).toEqual(['/everything', '/first', '/second']);
  });

  it('drops an item link with an unsafe href instead of rendering a broken link', () => {
    const wrapper = mountBlock({
      ...mock,
      items: [item({ href: 'javascript:alert(1)', linkLabel: 'Bad' })],
    });
    expect(wrapper.find('a').exists()).toBe(false);
  });

  it('routes a same-site item href and the head link through the router', () => {
    const wrapper = mountBlock({
      ...mock,
      headLinkLabel: 'See everything',
      headLinkHref: '/everything',
      items: [item({ href: '/shop' })],
    });
    const destinations = wrapper
      .findAllComponents({ name: 'NuxtLink' })
      .map((link) => link.props('to'));
    expect(destinations).toEqual(['/everything', '/shop']);
  });

  it('leaves an off-site item href as a plain document navigation', () => {
    const wrapper = mountBlock({
      ...mock,
      items: [item({ href: 'https://example.com/wool' })],
    });
    expect(wrapper.findAllComponents({ name: 'NuxtLink' })).toHaveLength(0);
    expect(wrapper.get('a[href="https://example.com/wool"]').exists()).toBe(true);
  });

  it.each(['2', '3', '4'] as const)(
    'sets the %s-column class from 64rem of block width',
    (columns) => {
      const wrapper = mountBlock({ ...mock, columns });
      expect(wrapper.get('ul').classes()).toContain(`@content:grid-cols-${columns}`);
    }
  );

  it('shows the heading hint only in the editor when heading is empty, with no axe violations', async () => {
    const data = { ...mock, heading: '' };
    const live = mountBlock(data);
    expect(live.text()).not.toContain('Add a heading');

    const editing = mountBlock(data, { editing: true });
    expect(editing.text()).toContain('Add a heading (optional)');
    expect(await axe(editing.element)).toHaveNoViolations();
  });

  describe('empty item hint (spec: "two \'Add a feature\' items" on a freshly inserted block)', () => {
    it('synthesizes two blank items with the "Add a feature" hint when items is empty, only while editing', async () => {
      const data = { ...mock, items: [] };

      const live = mountBlock(data);
      expect(live.text()).not.toContain('Add a feature');
      expect(live.find('section').exists()).toBe(false);

      const editing = mountBlock(data, { editing: true });
      expect(editing.findAll('li')).toHaveLength(2);
      const hints = editing.findAll('li').map((li) => li.text());
      expect(hints).toEqual([
        'Add a featurePick an icon or image, then a title and a sentence.',
        'Add a featurePick an icon or image, then a title and a sentence.',
      ]);
      expect(await axe(editing.element)).toHaveNoViolations();
    });

    it('shows the hint on one still-empty item while leaving real items alone, and drops it live', async () => {
      const items = [item({ title: 'Fast checkout' }), {}];
      const data = { ...mock, items };

      const live = mountBlock(data);
      expect(live.text()).not.toContain('Add a feature');
      expect(live.findAll('li')).toHaveLength(1);
      expect(live.findAll('h3').map((h) => h.text())).toEqual(['Fast checkout']);

      const editing = mountBlock(data, { editing: true });
      expect(editing.findAll('li')).toHaveLength(2);
      expect(editing.findAll('h3').map((h) => h.text())).toEqual(['Fast checkout']);
      expect(editing.text()).toContain('Add a feature');
      expect(await axe(editing.element)).toHaveNoViolations();
    });

    it('an item with only an icon (no title yet) is not treated as empty', () => {
      // `isItemEmpty` requires neither icon, image nor title — an icon alone (chosen first, before
      // the title) already counts as "started", so it renders as a normal (title-less) card rather
      // than being swallowed by the item hint.
      const wrapper = mountBlock({ ...mock, items: [{ icon: 'bolt' }] }, { editing: true });
      expect(wrapper.text()).not.toContain('Add a feature');
    });
  });
});
