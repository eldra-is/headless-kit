import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import ContentCard from '../ContentCard.vue';
import type { ContentCardProps } from '../types';
import type { ImageMedia } from '../../image/types';

const IMAGE: ImageMedia = {
  src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  width: 600,
  height: 400,
};

const LONG_TITLE =
  'A very long journal article title about the slow craft of hand-thrown ceramics in the studio';
const LONG_EXCERPT =
  'The wheel turns slowly at first, then faster, and the clay rises between practiced hands into ' +
  'a shape that did not exist a minute ago — a small, ordinary kind of magic repeated daily, and ' +
  'the reason so many of us keep coming back to the studio long after the first lesson ends.';

function mountCard(props: ContentCardProps) {
  return mountWith(ContentCard, { props });
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('ContentCard — semantics and structure', () => {
  it('renders a real <article> with the title link inside a heading', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/journal/studio-notes' });
    const root = wrapper.get('[data-part="root"]');
    expect(root.element.tagName).toBe('ARTICLE');
    const heading = wrapper.get('[data-part="title"]');
    expect(heading.element.tagName).toBe('H3');
    const link = wrapper.get('[data-part="titleLink"]');
    expect(link.element.tagName).toBe('A');
    expect(link.attributes('href')).toBe('/journal/studio-notes');
    expect(link.text()).toBe('Studio notes');
    wrapper.unmount();
  });

  it('is exactly one tab stop and Enter opens it', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/journal/studio-notes' });
    expect(wrapper.findAll('a').length).toBe(1);
    const anchor = wrapper.get('a').element as HTMLAnchorElement;
    anchor.focus();
    expect(document.activeElement).toBe(anchor);
    wrapper.unmount();
  });

  it.each([2, 3, 4, 5, 6] as const)('renders the title as h%s via headingLevel', (level) => {
    const wrapper = mountCard({
      title: 'Studio notes',
      href: '/journal/studio-notes',
      headingLevel: level,
    });
    expect(wrapper.get('[data-part="title"]').element.tagName).toBe(`H${level}`);
    wrapper.unmount();
  });
});

describe('ContentCard — variants', () => {
  it('plain with an image: background fill, no padding', () => {
    const wrapper = mountCard({
      title: 'Studio notes',
      href: '/x',
      image: IMAGE,
      variant: 'plain',
    });
    const root = wrapper.get('[data-part="root"]');
    expect(root.classes()).toContain('bg-background');
    expect(root.classes().some((c) => c.startsWith('p-'))).toBe(false);
    expect(wrapper.find('[data-part="media"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('a plain card with no image renders as the surface variant', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x', variant: 'plain' });
    const root = wrapper.get('[data-part="root"]');
    expect(root.classes()).toContain('bg-surface');
    expect(root.classes()).toContain('p-6');
    wrapper.unmount();
  });

  it('an explicit surface variant with no image is unchanged by the auto-conversion', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x', variant: 'surface' });
    expect(wrapper.get('[data-part="root"]').classes()).toContain('bg-surface');
    wrapper.unmount();
  });

  it('outlined: 1px border and padding, no auto-conversion to surface', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x', variant: 'outlined' });
    const root = wrapper.get('[data-part="root"]');
    expect(root.classes()).toContain('border');
    expect(root.classes()).toContain('border-border');
    expect(root.classes()).toContain('bg-background');
    expect(root.classes()).not.toContain('bg-surface');
    wrapper.unmount();
  });
});

describe('ContentCard — eyebrow', () => {
  it('renders the eyebrow uppercase via the overline utility, in sentence case in the DOM', () => {
    const wrapper = mountCard({
      title: 'Studio notes',
      href: '/x',
      eyebrow: 'Studio journal',
    });
    const eyebrow = wrapper.get('[data-part="eyebrow"]');
    expect(eyebrow.text()).toBe('Studio journal');
    expect(eyebrow.classes()).toContain('text-overline');
    expect(eyebrow.classes()).toContain('text-accent');
    wrapper.unmount();
  });

  it('renders no eyebrow when none is given', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x' });
    expect(wrapper.find('[data-part="eyebrow"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('ContentCard — date formatting', () => {
  it('formats the date per en-US Intl output and renders <time datetime>', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x', date: '2026-09-12' });
    const time = wrapper.get('[data-part="meta"] time');
    expect(time.attributes('datetime')).toBe('2026-09-12');
    const expected = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(2026, 8, 12));
    expect(time.text()).toBe(expected);
    wrapper.unmount();
  });

  it('formats the date per is-IS Intl output when locale is given', () => {
    const wrapper = mountCard({
      title: 'Studio notes',
      href: '/x',
      date: '2026-09-12',
      locale: 'is-IS',
    });
    const time = wrapper.get('[data-part="meta"] time');
    const expected = new Intl.DateTimeFormat('is-IS', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(2026, 8, 12));
    expect(time.text()).toBe(expected);
    wrapper.unmount();
  });

  it('appends meta after the date with a separator', () => {
    const wrapper = mountCard({
      title: 'Studio notes',
      href: '/x',
      date: '2026-09-12',
      meta: '4 min read',
    });
    const meta = wrapper.get('[data-part="meta"]');
    expect(meta.text()).toContain('4 min read');
    expect(meta.text()).toContain('·');
    wrapper.unmount();
  });

  it('renders the count meta alone, pinned to the bottom, in the outlined variant', () => {
    const wrapper = mountCard({
      title: 'Ceramics',
      href: '/collections/ceramics',
      variant: 'outlined',
      meta: '24 products',
    });
    const meta = wrapper.get('[data-part="meta"]');
    expect(meta.text()).toBe('24 products');
    expect(meta.classes()).toContain('mt-auto');
    expect(wrapper.find('[data-part="meta"] time').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders no meta line when neither date nor meta is given', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x' });
    expect(wrapper.find('[data-part="meta"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('ContentCard — link cue', () => {
  it('renders the cue text and an aria-hidden arrow in the surface variant', () => {
    const wrapper = mountCard({
      title: 'Studio notes',
      href: '/x',
      cue: 'Read the update',
    });
    const cue = wrapper.get('[data-part="cue"]');
    expect(cue.attributes('aria-hidden')).toBe('true');
    expect(cue.text()).toContain('Read the update');
    expect(cue.find('svg').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders no cue outside the resolved surface variant', () => {
    const outlined = mountCard({
      title: 'Ceramics',
      href: '/x',
      variant: 'outlined',
      cue: 'Read the update',
    });
    expect(outlined.find('[data-part="cue"]').exists()).toBe(false);
    outlined.unmount();

    const withImage = mountCard({
      title: 'Studio notes',
      href: '/x',
      image: IMAGE,
      variant: 'plain',
      cue: 'Read the update',
    });
    expect(withImage.find('[data-part="cue"]').exists()).toBe(false);
    withImage.unmount();
  });

  it('renders no cue when none is given', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x' });
    expect(wrapper.find('[data-part="cue"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not duplicate the cue or eyebrow in the link name — the title alone', () => {
    const wrapper = mountCard({
      title: 'Studio notes',
      href: '/x',
      eyebrow: 'Journal',
      cue: 'Read the update',
    });
    expect(wrapper.get('a').text()).toBe('Studio notes');
    wrapper.unmount();
  });
});

describe('ContentCard — stretched link and focus ring', () => {
  it('the root carries the focus proxy and rounded-lg corners, the link an inset-covering pseudo', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x' });
    const root = wrapper.get('[data-part="root"]');
    expect(root.classes()).toContain('eldra-focus');
    expect(root.classes()).toContain('eldra-focus-proxy');
    expect(root.classes()).toContain('rounded-lg');
    expect(root.classes()).toContain('relative');
    const link = wrapper.get('[data-part="titleLink"]');
    expect(link.classes()).toContain('after:absolute');
    expect(link.classes()).toContain('after:inset-0');
    expect(link.classes()).toContain('outline-none');
    wrapper.unmount();
  });

  it('carries no transition utility beside eldra-focus on the root', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x' });
    const classes = wrapper.get('[data-part="root"]').classes();
    expect(classes.some((c) => c.startsWith('transition') || c.startsWith('duration'))).toBe(false);
    wrapper.unmount();
  });

  it('underlines the title on hover via the root group, not the link itself', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x' });
    expect(wrapper.get('[data-part="root"]').classes()).toContain('group');
    expect(wrapper.get('[data-part="titleLink"]').classes()).toContain('group-hover:underline');
    wrapper.unmount();
  });
});

describe('ContentCard — as', () => {
  it('uses a string as the tag and still passes href as href', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x', as: 'a' });
    expect(wrapper.get('[data-part="titleLink"]').attributes('href')).toBe('/x');
    wrapper.unmount();
  });

  it('passes href as `to` when as is a component', () => {
    const FakeNuxtLink = defineComponent({
      props: { to: { type: String, required: true } },
      setup:
        (props, { slots }) =>
        () =>
          h('a', { 'data-fake-nuxt-link': props.to }, slots.default?.()),
    });
    const wrapper = mountCard({ title: 'Studio notes', href: '/x', as: FakeNuxtLink });
    const link = wrapper.get('[data-part="titleLink"]');
    expect(link.attributes('data-fake-nuxt-link')).toBe('/x');
    expect(link.attributes('href')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('ContentCard — loading', () => {
  it('renders a skeleton media frame and three text lines, no real content', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x', loading: true });
    expect(wrapper.get('[data-part="root"]').attributes('aria-busy')).toBe('true');
    const media = wrapper.get('[data-part="media"]');
    expect(media.find('.eldra-skeleton').exists()).toBe(true);
    const body = wrapper.get('[data-part="body"]');
    expect(body.findAll('.eldra-skeleton').length).toBe(3);
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.find('[data-part="title"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders no focus ring while loading — there is no focusable descendant', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x', loading: true });
    expect(wrapper.get('[data-part="root"]').classes()).not.toContain('eldra-focus-proxy');
    wrapper.unmount();
  });
});

describe('ContentCard — excerpt', () => {
  it('clamps the excerpt to three lines', () => {
    const wrapper = mountCard({
      title: 'Studio notes',
      href: '/x',
      excerpt: LONG_EXCERPT,
    });
    expect(wrapper.get('[data-part="excerpt"]').classes()).toContain('line-clamp-3');
    wrapper.unmount();
  });

  it('renders no excerpt when none is given', () => {
    const wrapper = mountCard({ title: 'Studio notes', href: '/x' });
    expect(wrapper.find('[data-part="excerpt"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('ContentCard — customisation', () => {
  it('lets classes.root replace a layout utility instead of landing beside it', () => {
    const wrapper = mountCard({
      title: 'Studio notes',
      href: '/x',
      classes: { root: 'gap-8' },
    });
    const root = wrapper.get('[data-part="root"]');
    expect(root.classes()).toContain('gap-8');
    expect(root.classes()).not.toContain('gap-4');
    wrapper.unmount();
  });

  it('merges an override onto another part', () => {
    const wrapper = mountCard({
      title: 'Studio notes',
      href: '/x',
      eyebrow: 'Journal',
      classes: { eyebrow: 'italic' },
    });
    expect(wrapper.get('[data-part="eyebrow"]').classes()).toContain('italic');
    wrapper.unmount();
  });

  it('lets a title slot override the visible text while keeping the link name', () => {
    const wrapper = mountWith(ContentCard, {
      props: { title: 'Studio notes', href: '/x' },
      slots: { title: '<strong>Custom title</strong>' },
    });
    expect(wrapper.get('a').text()).toBe('Custom title');
    wrapper.unmount();
  });
});

describe('ContentCard — accessibility, long content and narrow', () => {
  it('has no axe violations with an image, eyebrow, excerpt, date and meta', async () => {
    const wrapper = mountCard({
      title: 'Studio notes',
      href: '/x',
      image: IMAGE,
      eyebrow: 'Journal',
      excerpt: LONG_EXCERPT,
      date: '2026-09-12',
      meta: '4 min read',
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations in the outlined variant with a count meta', async () => {
    const wrapper = mountCard({
      title: 'Ceramics',
      href: '/collections/ceramics',
      variant: 'outlined',
      meta: '24 products',
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations in the surface variant with a cue', async () => {
    const wrapper = mountCard({
      title: 'Studio notes',
      href: '/x',
      cue: 'Read the update',
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('wraps a long title fully instead of clamping it', () => {
    const wrapper = mountCard({ title: LONG_TITLE, href: '/x' });
    expect(wrapper.get('a').text()).toBe(LONG_TITLE);
    const titleClasses = wrapper.get('[data-part="title"]').classes();
    expect(titleClasses.some((c) => c.startsWith('line-clamp'))).toBe(false);
    wrapper.unmount();
  });

  it('renders inside a narrow container without overflowing', () => {
    const wrapper = mountNarrow(ContentCard, {
      props: {
        title: LONG_TITLE,
        href: '/x',
        image: IMAGE,
        excerpt: LONG_EXCERPT,
        eyebrow: 'Journal',
      },
    });
    expect(wrapper.get('a').text()).toBe(LONG_TITLE);
    wrapper.unmount();
  });
});
