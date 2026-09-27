// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { formatDate } from '@eldrajs/ui';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

/** `mock.json` is Studio's insert seed (no media); `preview.json` is the demo-imagery overlay a
 *  story/preview merges on top of it — same shallow-merge shape `hero`'s/`testimonials`' own
 *  tests use. */
const withMedia = { ...mock, ...preview };

/** The genuinely minimal fixture: only the fields the block requires (spec → States, "Minimal
 *  content": title, date and body only — no byline, cover or author card). */
const minimal = {
  title: mock.title,
  publishedAt: mock.publishedAt,
  body: mock.body,
};

function mountBlock(
  data: Record<string, unknown>,
  options: { editing?: boolean; locale?: string } = {}
) {
  const opts = mountOptions({ entry: { id: 'e1', data } }, { locale: options.locale });
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  return mount(Block, opts);
}

describe('article block', () => {
  it('renders the full (mock + preview) content with no axe violations', async () => {
    const wrapper = mountBlock(withMedia);
    expect(wrapper.text()).toContain(withMedia.title);
    expect(wrapper.text()).toContain(withMedia.dek);
    expect(wrapper.text()).toContain(withMedia.categoryLabel);
    expect(wrapper.text()).toContain(withMedia.readingTime);
    expect(wrapper.text()).toContain(withMedia.authorName);
    expect(wrapper.text()).toContain(withMedia.authorBio);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare mock.json (no preview overlay) with no cover or author avatar, body intact, no axe violations', async () => {
    const wrapper = mountBlock(mock);
    // The only <img> left with no media fields set is the rich-text body's own inline figure —
    // the cover figure does not render at all (no coverImage), and both avatars fall back to
    // initials (Avatar's own image -> initials -> icon order, no <img>).
    expect(wrapper.findAll('img')).toHaveLength(1);
    expect(wrapper.get('img').attributes('alt')).toBe(
      'Three glazed mugs in blue-grey, oat and slate on a linen cloth'
    );
    expect(wrapper.text()).toContain(mock.title);
    expect(wrapper.text()).toContain('Two firings, not one');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders exactly one h1, the title', () => {
    const wrapper = mountBlock(mock);
    const h1s = wrapper.findAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.text()).toBe(mock.title);
  });

  it('runs the body headings h2-h4 in the order the doc declares, with no h1/h5/h6 inside it', () => {
    const wrapper = mountBlock(mock);
    const richText = wrapper.get('[data-eldra-rich-text]');
    const tags = richText.findAll('h2, h3, h4, h5, h6').map((node) => node.element.tagName);
    expect(tags).toEqual(['H2', 'H2', 'H2', 'H3']);
    expect(richText.findAll('h1')).toHaveLength(0);
  });

  it('renders two real, never-hand-formatted <time> spans — a short month below @tablet, a long one from it', () => {
    const wrapper = mountBlock(mock);
    const time = wrapper.get('time');
    expect(time.attributes('datetime')).toBe(mock.publishedAt);
    const spans = time.findAll('span');
    expect(spans).toHaveLength(2);
    expect(spans[0]!.classes()).toContain('@tablet:hidden');
    expect(spans[0]!.text()).toBe(formatDate(mock.publishedAt, 'en-US'));
    expect(spans[1]!.classes()).toEqual(expect.arrayContaining(['hidden', '@tablet:inline']));
    expect(spans[1]!.text()).toBe(formatDate(mock.publishedAt, 'en-US', { month: 'long' }));
  });

  it('formats both spans in the active content locale', () => {
    const wrapper = mountBlock(mock, { locale: 'is-IS' });
    const spans = wrapper.get('time').findAll('span');
    expect(spans[0]!.text()).toBe(formatDate(mock.publishedAt, 'is-IS'));
    expect(spans[1]!.text()).toBe(formatDate(mock.publishedAt, 'is-IS', { month: 'long' }));
  });

  it('wraps the body table in a named, focusable region and marks the code block focusable', () => {
    const wrapper = mountBlock(mock);
    const region = wrapper.get('[role="region"]');
    expect(region.attributes('aria-label')).toBe('Table');
    expect(region.attributes('tabindex')).toBe('0');
    expect(region.find('table').exists()).toBe(true);
    expect(wrapper.get('pre').attributes('tabindex')).toBe('0');
  });

  it('renders the inline body image with its alt text and caption (as the title attribute the renderer carries)', () => {
    const wrapper = mountBlock(mock);
    const img = wrapper.get('img');
    expect(img.attributes('title')).toBe(
      'Left to right: Fjord, Oat and Slate, all from kiln batch FJ-26-09.'
    );
  });

  it('renders the embed with a title and no autoplay parameter, never as a live iframe', () => {
    const wrapper = mountBlock(mock);
    const embed = wrapper.get('.eldra-embed');
    expect(embed.attributes('title')).toBe('Watch: dipping a Fjord bowl, start to finish (2:14).');
    expect(embed.attributes('data-src')).not.toContain('autoplay');
    expect(embed.find('iframe').exists()).toBe(false);
  });

  it('routes the category and author links internally through the router', () => {
    const wrapper = mountBlock(withMedia);
    const internalTargets = wrapper
      .findAllComponents({ name: 'NuxtLink' })
      .map((link) => link.props('to'));
    expect(internalTargets).toContain(withMedia.categoryHref);
    expect(internalTargets).toContain(withMedia.authorLinkHref);
  });

  it('the category link is natively focusable (no tabindex override)', () => {
    const wrapper = mountBlock(mock);
    const categoryLink = wrapper.get(`a[href="${mock.categoryHref}"]`);
    expect(categoryLink.attributes('tabindex')).toBeUndefined();
  });

  it('the author card is absent when every author field is empty', () => {
    const wrapper = mountBlock({
      ...mock,
      authorName: '',
      authorRole: '',
      authorBio: '',
      authorLinkLabel: '',
      authorLinkHref: '',
      showByline: false,
    });
    expect(wrapper.find('footer').exists()).toBe(false);
  });

  it('renders the minimal-content state (title, date, body only) with no byline, cover or author card', async () => {
    const wrapper = mountBlock(minimal);
    expect(wrapper.find('figure').exists()).toBe(false);
    expect(wrapper.find('footer').exists()).toBe(false);
    // Only the meta line's date and the body remain.
    expect(wrapper.text()).toContain(minimal.title);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('h1 uses the spec’s 1.1 line height', () => {
    const wrapper = mountBlock(mock);
    expect(wrapper.get('h1').classes()).toContain('leading-[1.1]');
  });

  it('showByline: false hides the byline even though every author field is present (author card still renders)', () => {
    const wrapper = mountBlock({ ...mock, showByline: false });
    // No byline avatar/"By {name}" line above the body…
    expect(wrapper.text()).not.toContain(`By ${mock.authorName}`);
    // …but the author card at the end of the body is unaffected — it has its own gate
    // (`hasAuthorCard`), not `showByline`.
    expect(wrapper.find('footer').exists()).toBe(true);
    expect(wrapper.get('footer').text()).toContain(mock.authorName);
  });

  it('author-card spacing comes from nested flex `gap`, not a margin stacked on top of one', () => {
    // Spec → Layout, "Author card": every pair 0.25rem apart except bio, "0.5rem above". A single
    // `gap-1` container plus `mt-2` on bio / `mt-1` on the link (the previous shape) sums margin
    // and gap, overshooting both to 0.75rem and 0.5rem respectively — this asserts neither the
    // bio paragraph nor the link carries its own top margin any more.
    const wrapper = mountBlock(mock);
    const footer = wrapper.get('footer');
    const bio = footer.findAll('p').find((p) => p.text() === mock.authorBio)!;
    expect(bio.classes().some((c) => /^mt-/.test(c))).toBe(false);
    const link = footer.get('a');
    expect(link.classes().some((c) => /^mt-/.test(c))).toBe(false);
  });

  it('an invalid publishedAt renders no <time> element and does not crash', async () => {
    const wrapper = mountBlock({ ...mock, publishedAt: 'not-a-date' });
    expect(wrapper.find('time').exists()).toBe(false);
    // The rest of the meta line (category, reading time) still renders — only the date drops.
    expect(wrapper.text()).toContain(mock.categoryLabel);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('shows editor-only hints for empty required parts, never on the live site', () => {
    const empty = { title: '', publishedAt: '', body: { type: 'doc', content: [] } };
    const live = mountBlock(empty);
    expect(live.text()).not.toContain('Add a title');
    expect(live.text()).not.toContain('Start writing');

    const editing = mountBlock(empty, { editing: true });
    expect(editing.text()).toContain('Add a title');
    expect(editing.text()).toContain('Start writing');
  });
});
