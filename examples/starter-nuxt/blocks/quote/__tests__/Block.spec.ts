// @vitest-environment jsdom
//
// `EldraIcon` (the quote mark) resolves a Tabler icon by name through `useEldraIcon`, which reads
// its fetcher from `inject(ICON_FETCHER_KEY, ...)` rather than calling Nuxt's `useFetch` directly —
// so a plain `mount()` needs the same synchronous, network-free stub `feature-grid`'s and
// `pricing-table`'s own specs use, or the block throws outside a Nuxt runtime.
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';

/** `mock.json` is Studio's insert seed (no media); `preview.json` is the demo-imagery overlay a
 *  story/preview merges on top of it — same shallow-merge shape `testimonials`'s own test uses. */
const withMedia = { ...mock, ...preview };

/** The genuinely minimal fixture: only the fields the block requires. */
const bare = { quote: 'Reliable, well made, arrived on time.', name: 'A. Customer' };

const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

function mountBlock(data: Record<string, unknown>, options: { editing?: boolean } = {}) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const opts = {
    ...base,
    global: {
      ...base.global,
      provide: { ...base.global.provide, [ICON_FETCHER_KEY]: stubFetcher },
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

describe('quote block', () => {
  it('renders the full (mock + preview) content with no axe violations', async () => {
    const wrapper = mountBlock(withMedia);
    expect(wrapper.text()).toContain(withMedia.quote);
    expect(wrapper.text()).toContain(withMedia.name);
    expect(wrapper.text()).toContain(withMedia.role);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare, required-fields-only content with no axe violations', async () => {
    const wrapper = mountBlock(bare);
    expect(wrapper.text()).toContain(bare.quote);
    expect(wrapper.text()).toContain(bare.name);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['centered', 'with-image'] as const)(
    'renders the %s variant with no axe violations',
    async (variant) => {
      const wrapper = mountBlock({ ...withMedia, variant });
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it.each(['primary', 'accent'] as const)(
    'renders the %s section background with no axe violations',
    async (sectionBackground) => {
      const wrapper = mountBlock({ ...withMedia, sectionBackground });
      const section = wrapper.get('section');
      expect(section.attributes('data-section')).toBe(sectionBackground);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('the block root is a labelled <section> that measures its own width (@container)', () => {
    const wrapper = mountBlock(mock);
    const section = wrapper.get('section');
    expect(section.classes()).toContain('@container');
    expect(section.attributes('aria-labelledby')).toBeTruthy();
  });

  it('is structured as figure > blockquote + figcaption with a cite, labelled by a hidden heading', () => {
    const wrapper = mountBlock(mock);
    const heading = wrapper.get(`#${wrapper.get('section').attributes('aria-labelledby')}`);
    expect(heading.element.tagName).toBe('H2');
    expect(heading.text()).toBe(`Quote from ${mock.name}`);
    expect(heading.classes()).toContain('sr-only');

    const figure = wrapper.get('figure');
    const blockquote = figure.get('blockquote');
    const figcaption = figure.get('figcaption');
    expect(blockquote.text()).toBe(mock.quote);
    const cite = figcaption.get('cite');
    expect(cite.text()).toBe(mock.name);

    // The full accessible text (heading, then quote, then attribution) starts with the hidden
    // heading (spec Keyboard & accessibility: "Assistive technology hears a 'Quote from {name}'
    // heading, then the blockquote, then the attribution").
    expect(wrapper.text().startsWith(heading.text())).toBe(true);
  });

  it('the quote mark is aria-hidden', async () => {
    const wrapper = mountBlock(mock);
    await flushPromises();
    const mark = wrapper.get('figure svg');
    expect(mark.attributes('aria-hidden')).toBe('true');
  });

  it('with-image and an image renders a portrait and no single-column fallback', () => {
    const wrapper = mountBlock({ ...withMedia, variant: 'with-image' });
    const image = wrapper.get('img');
    expect(image.attributes('alt')).toBe(preview.image.altText);
  });

  it('with-image and no image falls back to the single left-aligned column, with no <img>', () => {
    const wrapper = mountBlock({ ...mock, variant: 'with-image' });
    expect(wrapper.find('img').exists()).toBe(false);
    const figure = wrapper.get('figure');
    expect(figure.classes()).toContain('items-start');
  });

  it('centered aligns the figure centrally', () => {
    const wrapper = mountBlock({ ...mock, variant: 'centered' });
    const figure = wrapper.get('figure');
    expect(figure.classes()).toContain('items-center');
    expect(figure.classes()).toContain('text-center');
  });

  it('with an avatar field but no photo, the Avatar renders initials', () => {
    const wrapper = mountBlock(mock);
    expect(wrapper.find('img').exists()).toBe(false);
    const initials = wrapper.get('[data-part="initials"]');
    expect(initials.text().length).toBeGreaterThan(0);
  });

  it('with an avatar photo, the Avatar renders it', () => {
    const wrapper = mountBlock(withMedia);
    const avatarImage = wrapper
      .findAll('img')
      .find((img) => img.attributes('src') === preview.avatar.url);
    expect(avatarImage).toBeTruthy();
  });

  it('the role line is plain text with no sourceLinkHref', () => {
    const { sourceLinkHref: _omit, ...withoutLink } = mock;
    const wrapper = mountBlock(withoutLink);
    expect(wrapper.text()).toContain(mock.role);
    expect(wrapper.findAll('a')).toHaveLength(0);
  });

  it('the role line is a link, and a tab stop with the package focus ring, only with sourceLinkHref', () => {
    const wrapper = mountBlock(mock);
    const link = wrapper.get('a');
    expect(link.text()).toBe(mock.role);
    expect(link.attributes('href')).toBe(mock.sourceLinkHref);
    expect(link.attributes('aria-label')).toBe(mock.sourceLinkLabel);
    expect(link.classes()).toContain('eldra-focus');
    const focusable = Array.from(wrapper.element.querySelectorAll('a, button, input, [tabindex]'));
    expect(focusable).toContain(link.element);
  });

  it('renders an external source link as a plain <a>, not the internal router link', () => {
    const wrapper = mountBlock(mock);
    const link = wrapper.get('a');
    expect(link.element.tagName).toBe('A');
  });

  it('has no italic class anywhere in the block', () => {
    const wrapper = mountBlock(withMedia);
    for (const element of wrapper.element.querySelectorAll('*')) {
      expect(Array.from(element.classList)).not.toContain('italic');
    }
  });

  it('the quote mark is text-accent at rest', async () => {
    const wrapper = mountBlock(mock);
    await flushPromises();
    const mark = wrapper.get('figure svg');
    expect(mark.classes()).toContain('text-accent');
  });

  it('on primary, the mark carries the primary-contrast class', async () => {
    const wrapper = mountBlock({ ...mock, sectionBackground: 'primary' });
    await flushPromises();
    const mark = wrapper.get('figure svg');
    expect(mark.classes()).toContain('text-primary-contrast');
    expect(mark.classes()).not.toContain('text-accent');
  });

  it('on accent, the mark carries the accent-contrast class, not text-accent', async () => {
    const wrapper = mountBlock({ ...mock, sectionBackground: 'accent' });
    await flushPromises();
    const mark = wrapper.get('figure svg');
    expect(mark.classes()).toContain('text-accent-contrast');
    expect(mark.classes()).not.toContain('text-accent');
  });

  it("the quote and the name carry no fixed text colour class, so they inherit the section's own", () => {
    const wrapper = mountBlock({ ...mock, sectionBackground: 'primary' });
    expect(wrapper.get('blockquote').classes()).not.toContain('text-text');
    expect(wrapper.get('cite').classes()).not.toContain('text-text');
  });

  it('renders nothing live without a quote — not even the section root', () => {
    const wrapper = mountBlock({ ...mock, quote: '' });
    expect(wrapper.find('section').exists()).toBe(false);
    expect(wrapper.find('figure').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Add a quote');
  });

  it('shows the empty-quote hint only in the editor, with no axe violations', async () => {
    const data = { ...mock, quote: '' };
    const live = mountBlock(data);
    expect(live.find('section').exists()).toBe(false);
    expect(live.find('figure').exists()).toBe(false);

    const editing = mountBlock(data, { editing: true });
    expect(editing.find('figure').exists()).toBe(true);
    expect(editing.text()).toContain('Add a quote');
    expect(editing.text()).toContain('Then the name and role or source.');
    expect(editing.find('blockquote').exists()).toBe(false);
    expect(await axe(editing.element)).toHaveNoViolations();
  });

  it('shows the empty-name hint only in the editor once the quote is filled in', async () => {
    const data = { ...mock, name: '' };
    const live = mountBlock(data);
    expect(live.find('cite').exists()).toBe(false);
    expect(live.text()).not.toContain('Add a name');

    const editing = mountBlock(data, { editing: true });
    expect(editing.text()).toContain('Add a name');
    expect(await axe(editing.element)).toHaveNoViolations();
  });

  it('defaults variant to centered and sectionBackground to none when unset', () => {
    const { variant: _v, sectionBackground: _s, ...rest } = mock;
    const wrapper = mountBlock(rest);
    const figure = wrapper.get('figure');
    expect(figure.classes()).toContain('items-center');
    expect(wrapper.get('section').attributes('data-section-bg')).toBe('none');
  });

  it('an optional role with no sourceLinkHref renders as plain muted text', () => {
    const { sourceLinkHref: _omit, sourceLinkLabel: _omit2, ...rest } = mock;
    const wrapper = mountBlock(rest);
    expect(wrapper.findAll('a')).toHaveLength(0);
    expect(wrapper.text()).toContain(mock.role);
  });

  it('omits the role line entirely when role is empty', () => {
    const wrapper = mountBlock({ ...bare });
    expect(wrapper.text()).not.toContain(mock.role);
  });

  it('the role-line link is inline inside its own line box, never a shrunken block target', () => {
    const wrapper = mountBlock(mock);
    const link = wrapper.get('figcaption a');
    expect(link.classes()).not.toContain('block');
    expect(link.element.parentElement?.tagName).toBe('P');
    expect(link.text()).toBe(mock.role);
  });
});
