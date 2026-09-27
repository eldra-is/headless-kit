// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

/** `mock.json` is Studio's insert seed (no media); `preview.json` is the demo-imagery overlay a
 *  story/preview merges on top of it — same shallow-merge shape `hero`'s own test uses. */
const withMedia = { ...mock, ...preview };

/** The genuinely minimal fixture: only the fields the block requires. */
const bare = {
  heading: 'What customers say',
  items: [{ quote: 'Reliable, well made, arrived on time.', name: 'A. Customer' }],
};

const VARIANTS = ['grid', 'carousel', 'single-large'] as const;

function mountBlock(data: Record<string, unknown>, options: { editing?: boolean } = {}) {
  const opts = mountOptions({ entry: { id: 'e1', data } });
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  return mount(Block, opts);
}

describe('testimonials block', () => {
  it('renders the full (mock + preview) content with no axe violations', async () => {
    const wrapper = mountBlock(withMedia);
    expect(wrapper.text()).toContain(withMedia.heading);
    expect(wrapper.text()).toContain(withMedia.summary);
    for (const item of withMedia.items) expect(wrapper.text()).toContain(item.name);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare, required-fields-only content with no axe violations', async () => {
    const wrapper = mountBlock(bare);
    expect(wrapper.text()).toContain(bare.heading);
    expect(wrapper.text()).toContain(bare.items[0]!.name);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(VARIANTS)('renders the %s variant with no axe violations', async (variant) => {
    const wrapper = mountBlock({ ...withMedia, variant });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders a primary section background with no axe violations', async () => {
    const wrapper = mountBlock({ ...withMedia, sectionBackground: 'primary' });
    const section = wrapper.get('section');
    expect(section.attributes('data-section')).toBe('primary');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('the block root is a labelled <section> that measures its own width (@container)', () => {
    const wrapper = mountBlock(mock);
    const section = wrapper.get('section');
    expect(section.classes()).toContain('@container');
    expect(section.attributes('aria-labelledby')).toBeTruthy();
  });

  it("the heading carries no fixed text colour class, so it inherits the section's own (inverted on primary)", () => {
    const wrapper = mountBlock({ ...mock, sectionBackground: 'primary' });
    expect(wrapper.get('h2').classes()).not.toContain('text-text');
  });

  it('does not label the outer section in the carousel variant (Carousel already names its own region)', () => {
    const wrapper = mountBlock({ ...mock, variant: 'carousel' });
    const section = wrapper.get('section');
    expect(section.attributes('aria-labelledby')).toBeUndefined();
    const region = wrapper.get('section[aria-roledescription="carousel"]');
    expect(region.attributes('aria-label')).toBe(mock.heading);
  });

  it('each review is a figure containing a blockquote and a figcaption with a cite', () => {
    const wrapper = mountBlock(mock);
    const figures = wrapper.findAll('figure');
    expect(figures.length).toBeGreaterThan(0);
    for (const figure of figures) {
      expect(figure.find('blockquote').exists()).toBe(true);
      const figcaption = figure.get('figcaption');
      expect(figcaption.find('cite').exists()).toBe(true);
    }
  });

  it('announces the rating as a sentence, with the stars aria-hidden', () => {
    const wrapper = mountBlock(mock);
    const rating = wrapper.get('[role="img"]');
    expect(rating.attributes('aria-label')).toMatch(/^Rated 5\.0 out of 5/);
    expect(rating.get('[data-part="stars"]').attributes('aria-hidden')).toBe('true');
  });

  it('renders a rating row only for reviews that declare one (rating: "none" omits it)', () => {
    const wrapper = mountBlock(mock);
    const withRating = mock.items.filter((item) => item.rating !== 'none');
    expect(wrapper.findAll('[role="img"]')).toHaveLength(withRating.length);
  });

  it('renders no <img> and falls back to initials when a review has no avatar', () => {
    const wrapper = mountBlock(mock);
    expect(wrapper.find('img').exists()).toBe(false);
    // "Sofia Lind" -> "SL"
    expect(wrapper.text()).toContain('SL');
  });

  it('prefers the avatar image over initials when avatar media is set', () => {
    const wrapper = mountBlock(withMedia);
    expect(wrapper.findAll('img').length).toBeGreaterThan(0);
  });

  it('the meta line is a link only when productHref is set', () => {
    const wrapper = mountBlock(mock);
    const withProduct = mock.items.filter((item) => 'productHref' in item);
    const withoutProduct = mock.items.filter((item) => !('productHref' in item));
    expect(withProduct.length).toBeGreaterThan(0);
    expect(withoutProduct.length).toBeGreaterThan(0);
    for (const item of withProduct) {
      const link = wrapper.findAll('a').find((a) => a.attributes('href') === item.productHref);
      expect(link, `expected a link to ${item.productHref}`).toBeTruthy();
      expect(link!.text()).toBe(item.meta);
    }
    for (const item of withoutProduct) {
      expect(wrapper.findAll('a').some((a) => a.text() === item.meta)).toBe(false);
      expect(wrapper.text()).toContain(item.meta);
    }
  });

  it('a single review is centred and capped at 36rem in the grid variant', () => {
    const wrapper = mountBlock({ ...mock, items: [mock.items[0]] });
    const figure = wrapper.get('figure');
    expect(figure.classes()).toEqual(expect.arrayContaining(['mx-auto', 'max-w-[36rem]']));
  });

  it('does not centre a review when there is more than one', () => {
    const wrapper = mountBlock(mock);
    for (const figure of wrapper.findAll('figure')) {
      expect(figure.classes()).not.toContain('max-w-[36rem]');
    }
  });

  it('single-large renders exactly one figure, using the first review only', () => {
    const wrapper = mountBlock({ ...withMedia, variant: 'single-large' });
    const figures = wrapper.findAll('figure');
    expect(figures).toHaveLength(1);
    expect(figures[0]!.text()).toContain(withMedia.items[0]!.name);
    expect(wrapper.text()).not.toContain(withMedia.items[1]!.name);
  });

  it('single-large shows the small "Customer review" label as the (still h2) heading', () => {
    const wrapper = mountBlock(mock);
    const dataVariant = mountBlock({ ...mock, variant: 'single-large' });
    const heading = dataVariant.get('h2');
    expect(heading.text()).toBe(mock.heading);
    // sanity: the default (grid) variant renders the same tag with different styling
    expect(wrapper.get('h2').text()).toBe(mock.heading);
  });

  it('defaults sectionBackground to none for grid/carousel and to surface for single-large', () => {
    const { sectionBackground: _omit, ...withoutBackground } = mock;
    const grid = mountBlock(withoutBackground);
    expect(grid.get('section').attributes('data-section-bg')).toBe('none');
    const singleLarge = mountBlock({ ...withoutBackground, variant: 'single-large' });
    expect(singleLarge.get('section').attributes('data-section-bg')).toBe('surface');
  });

  it('does not show the summary or head link in single-large', () => {
    const wrapper = mountBlock({ ...mock, variant: 'single-large' });
    expect(wrapper.text()).not.toContain(mock.summary);
    expect(wrapper.text()).not.toContain(mock.linkLabel);
  });

  it('renders without a name or quote instead of crashing (a freshly-placed block seeds a blank item)', async () => {
    const data = { ...mock, items: [{ quote: undefined, name: undefined, meta: undefined }] };
    const wrapper = mountBlock(data);
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.findAll('figure')).toHaveLength(0);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('shows an editor-only hint for an empty review, and renders it live as nothing', async () => {
    const data = { ...mock, items: [{ quote: '', name: '' }] };
    const live = mountBlock(data);
    expect(live.findAll('figure')).toHaveLength(0);

    const editing = mountBlock(data, { editing: true });
    expect(editing.text()).toContain('Add a testimonial');
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

  describe('carousel', () => {
    it('labels the carousel region with the heading and shows the initial slide counter', async () => {
      const wrapper = mountBlock({ ...mock, variant: 'carousel' });
      const region = wrapper.get('section[aria-roledescription="carousel"]');
      expect(region.attributes('aria-label')).toBe(mock.heading);
      await nextTick();
      expect(wrapper.text()).toContain(`1 / ${mock.items.length}`);
    });

    it('renders 12 items as 12 slides', async () => {
      const items = Array.from({ length: 12 }, (_, index) => ({
        quote: `Quote number ${index + 1}, long enough to read naturally on a card.`,
        name: `Customer ${index + 1}`,
      }));
      const wrapper = mountBlock({ ...mock, variant: 'carousel', items });
      await nextTick();
      expect(wrapper.findAll('[data-part="slide"]')).toHaveLength(12);
      expect(wrapper.findAll('figure')).toHaveLength(12);
    });

    it('the track is focusable; ArrowLeft/ArrowRight move one slide and disable the arrows at the ends', async () => {
      const wrapper = mountBlock({ ...mock, variant: 'carousel' });
      await nextTick();
      const track = wrapper.get('[data-part="track"]');
      expect(track.attributes('tabindex')).toBe('0');
      const prevButton = () => wrapper.get('[data-part="prev"]');
      const nextButton = () => wrapper.get('[data-part="next"]');

      expect(prevButton().attributes('disabled')).toBeDefined();
      expect(nextButton().attributes('disabled')).toBeUndefined();

      for (let step = 0; step < mock.items.length - 1; step += 1) {
        await track.trigger('keydown', { key: 'ArrowRight' });
      }
      expect(prevButton().attributes('disabled')).toBeUndefined();
      expect(nextButton().attributes('disabled')).toBeDefined();

      await track.trigger('keydown', { key: 'ArrowLeft' });
      expect(nextButton().attributes('disabled')).toBeUndefined();
    });

    it('never leaves focus on a disabled arrow', async () => {
      const wrapper = mount(Block, {
        ...mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'carousel' } } }),
        attachTo: document.body,
      });
      await nextTick();
      const nextButton = wrapper.get('[data-part="next"]');
      (nextButton.element as HTMLButtonElement).focus();
      expect(document.activeElement).toBe(nextButton.element);
      for (let step = 0; step < mock.items.length - 1; step += 1) {
        await nextButton.trigger('click');
      }
      expect(document.activeElement).toBe(wrapper.get('[data-part="prev"]').element);
      wrapper.unmount();
    });

    it('never autoplays', () => {
      const wrapper = mountBlock({ ...mock, variant: 'carousel' });
      expect(wrapper.find('[data-part="pause"]').exists()).toBe(false);
    });
  });
});
