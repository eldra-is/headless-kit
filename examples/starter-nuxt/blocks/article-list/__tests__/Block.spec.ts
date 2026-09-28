// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { createDemoStorefront } from '../../../app/storefront/demo';
import { STOREFRONT_KEY } from '../../../app/storefront/types';

/** `mock.json`'s items carry no `image` (Core's write-side media validator rejects a
 *  fixture-shaped object there); `preview.json` is the demo-imagery overlay, a full `items`
 *  replacement over `mock.json` (same shallow-merge contract every other rebuilt block's own
 *  `preview.json` uses). */
const withImages = { ...mock, ...preview };

/** Only the fields the block actually requires (`variant`, `source`) plus one story — the
 *  "genuinely minimal" fixture every rebuilt block spec covers alongside the full `mock.json`. */
const bare = {
  variant: 'grid',
  source: 'manual',
  items: [{ title: 'Bare story', href: '/journal/bare-story' }],
};

function mountBlock(
  data: Record<string, unknown>,
  options: { editing?: boolean; page?: number } = {}
) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const storefront = createDemoStorefront();
  if (options.page !== undefined) storefront.route.page = options.page;
  const opts = {
    ...base,
    global: {
      ...base.global,
      provide: {
        ...base.global.provide,
        [STOREFRONT_KEY]: storefront,
      },
    },
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

describe('article-list block', () => {
  it('renders the merged (mock + preview) content with no axe violations', async () => {
    const wrapper = mountBlock(withImages);
    await flushPromises();
    expect(wrapper.text()).toContain(withImages.heading);
    for (const item of withImages.items) expect(wrapper.text()).toContain(item.title);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare minimal fixture with no axe violations', async () => {
    const wrapper = mountBlock(bare);
    await flushPromises();
    expect(wrapper.text()).toContain('Bare story');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('passes axe for every declared variant', async () => {
    for (const variant of ['grid', 'featured-first', 'list']) {
      const wrapper = mountBlock({ ...withImages, variant });
      await flushPromises();
      expect(await axe(wrapper.element)).toHaveNoViolations();
      wrapper.unmount();
    }
  });

  it('passes axe with zero items', async () => {
    const wrapper = mountBlock({ ...mock, items: [] });
    await flushPromises();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders each card as one tab stop whose accessible name is its title', async () => {
    const wrapper = mountBlock(withImages);
    await flushPromises();
    const articles = wrapper.findAll('article');
    expect(articles).toHaveLength(withImages.items.length);
    articles.forEach((article, index) => {
      const links = article.findAll('a');
      expect(links).toHaveLength(1);
      expect(links[0]!.text()).toBe(withImages.items[index]!.title);
    });
  });

  it('renders card images as decorative (alt="")', async () => {
    const wrapper = mountBlock(withImages);
    await flushPromises();
    const images = wrapper.findAll('article img');
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(image.attributes('alt')).toBe('');
  });

  it('renders an item with no image without an <img>, title still readable', async () => {
    // `mock.json` itself carries no `image` on any item (media fields are absent from the insert
    // seed) — `ContentCard`'s own contract renders no media slot at all in that case (its
    // acceptance criteria: "a plain card with no image renders as the surface variant"), so this
    // also proves the package-constrained fallback documented in `Block.vue`'s own comment.
    const wrapper = mountBlock(mock);
    await flushPromises();
    const articles = wrapper.findAll('article');
    expect(articles.length).toBeGreaterThan(0);
    for (const article of articles) {
      expect(article.find('img').exists()).toBe(false);
    }
    expect(wrapper.text()).toContain(mock.items[0]!.title);
  });

  it('marks the active chip with aria-current, a check icon and a weight class — every chip a link', async () => {
    const wrapper = mountBlock({ ...withImages, categoryHref: '/journal/ceramics' });
    await flushPromises();
    const nav = wrapper.get('nav[aria-label="Filter stories by category"]');
    const chipLinks = nav.findAll('a');
    expect(chipLinks).toHaveLength(mock.filters.length);
    for (const link of chipLinks) expect(link.element.tagName).toBe('A');

    const active = chipLinks.find((link) => link.text().includes('Ceramics'))!;
    expect(active.attributes('aria-current')).toBe('true');
    expect(active.find('svg').exists()).toBe(true);
    expect(active.classes().join(' ')).toContain('font-semibold');

    const inactive = chipLinks.find((link) => link.text().includes('Care'))!;
    expect(inactive.attributes('aria-current')).toBeUndefined();
    expect(inactive.find('svg').exists()).toBe(false);
  });

  it('marks "All" active by default (no category context set)', async () => {
    const wrapper = mountBlock(withImages);
    await flushPromises();
    const nav = wrapper.get('nav[aria-label="Filter stories by category"]');
    const all = nav.findAll('a').find((link) => link.text().includes('All'))!;
    expect(all.attributes('aria-current')).toBe('true');
  });

  it('paginates: page links, current page, and disabled ends carry the right ARIA', async () => {
    const wrapper = mountBlock({ ...withImages, perPage: '3' });
    await flushPromises();
    const nav = wrapper.get('nav[aria-label="Journal pages"]');
    const current = nav.get('[aria-current="page"]');
    expect(current.text()).toBe('1');
    expect(nav.text()).toContain('Previous');
    expect(nav.text()).toContain('Next');

    const pageTwo = nav.findAll('a').find((link) => link.attributes('aria-label') === 'Page 2')!;
    expect(pageTwo.attributes('href')).toBe(`${mock.viewAllHref}?page=2`);

    const prevControls = nav.findAll('[aria-disabled="true"]');
    expect(prevControls.length).toBeGreaterThan(0);
  });

  it('shows the last page as disabled at the end and hides pagination for one page', async () => {
    const wrapper = mountBlock({ ...withImages, perPage: '3' }, { page: 2 });
    await flushPromises();
    const nav = wrapper.get('nav[aria-label="Journal pages"]');
    const current = nav.get('[aria-current="page"]');
    expect(current.text()).toBe('2');
    const disabled = nav.findAll('[aria-disabled="true"]');
    expect(disabled.length).toBeGreaterThan(0);

    const onePage = mountBlock({ ...withImages, perPage: '12' });
    await flushPromises();
    expect(onePage.find('nav[aria-label="Journal pages"]').exists()).toBe(false);
  });

  it('perPage larger than the list renders every item on the one page, with no padding or duplication', async () => {
    const wrapper = mountBlock({ ...withImages, perPage: '12' }); // withImages has 5 items
    await flushPromises();
    const titles = wrapper.findAll('h3').map((h) => h.text());
    expect(titles).toEqual(withImages.items.map((item) => item.title));
    expect(wrapper.findAll('li[class]').length).toBeGreaterThanOrEqual(titles.length);
  });

  it('a page number beyond totalPages clamps to the last real page instead of rendering blank', async () => {
    const wrapper = mountBlock({ ...withImages, perPage: '3' }, { page: 99 });
    await flushPromises();
    // withImages has 5 items at perPage 3, so totalPages is 2 — page 99 clamps to it.
    const nav = wrapper.get('nav[aria-label="Journal pages"]');
    expect(nav.get('[aria-current="page"]').text()).toBe('2');
    const titles = wrapper.findAll('h3').map((h) => h.text());
    expect(titles).toEqual(withImages.items.slice(3, 5).map((item) => item.title));
  });

  it('drops a card with an unsafe href instead of rendering a broken link', async () => {
    const wrapper = mountBlock({
      ...mock,
      items: [
        { title: 'Bad story', href: 'javascript:alert(1)' },
        { title: 'Good story', href: '/journal/good-story' },
      ],
    });
    await flushPromises();
    expect(wrapper.text()).not.toContain('Bad story');
    expect(wrapper.text()).toContain('Good story');
    expect(
      wrapper.findAll('a').some((a) => (a.attributes('href') ?? '').startsWith('javascript'))
    ).toBe(false);
  });

  it('list variant hides the excerpt below 48rem of block width', async () => {
    const wrapper = mountBlock({ ...withImages, variant: 'list' });
    await flushPromises();
    const excerpt = wrapper.find('[data-part="excerpt"]');
    expect(excerpt.exists()).toBe(true);
    expect(excerpt.classes()).toContain('@max-tablet:hidden');
  });

  it('renders the empty state with a working "View all stories" link and no pagination', async () => {
    const wrapper = mountBlock({ ...mock, items: [] });
    await flushPromises();
    expect(wrapper.text()).toContain(mock.emptyTitle);
    expect(wrapper.text()).toContain(mock.emptyText);
    const link = wrapper.get('a');
    expect(link.text()).toContain(mock.viewAllLabel);
    expect(link.attributes('href')).toBe(mock.viewAllHref);
    expect(wrapper.find('nav[aria-label="Journal pages"]').exists()).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('shows the freshly inserted items hint while editing instead of the empty state', async () => {
    const wrapper = mountBlock({ ...mock, items: [] }, { editing: true });
    await flushPromises();
    expect(wrapper.text()).toContain('Showing your latest stories');
    expect(wrapper.text()).not.toContain(mock.emptyTitle);
  });

  it('shows the heading editor hint only while editing, and renders no heading live', async () => {
    const editingWrapper = mountBlock({ ...mock, heading: '' }, { editing: true });
    await flushPromises();
    expect(editingWrapper.text()).toContain('Add a heading');

    const liveWrapper = mountBlock({ ...mock, heading: '' });
    await flushPromises();
    expect(liveWrapper.find('h2').exists()).toBe(false);
    expect(liveWrapper.text()).not.toContain('Add a heading');
  });
});
