import { IconTruck } from '@tabler/icons-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { axe } from '../../../test/axe';
import { enUS } from '../../../messages/en-US';
import { mountNarrow, mountWith } from '../../../test/mount';
import FeatureCard from '../FeatureCard.vue';
import type { FeatureCardProps } from '../types';

const LONG_TITLE =
  'Free worldwide shipping on every order over eighty dollars, no minimum weight or size limit';

function mountCard(props: FeatureCardProps) {
  return mountWith(FeatureCard, { props });
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('FeatureCard — unlinked (static)', () => {
  it('renders the icon, title and body with no link and no tab stop', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
    });
    expect(wrapper.find('a').exists()).toBe(false);
    const title = wrapper.get('[data-part="title"]');
    expect(title.text()).toBe('Free shipping over $80');
    expect(wrapper.get('[data-part="body"]').text()).toBe('Delivered in 2-4 business days.');
    wrapper.unmount();
  });

  it('has no tab stop at all', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
    });
    expect(wrapper.get('[data-part="root"]').attributes('tabindex')).toBeUndefined();
    expect(wrapper.findAll('[tabindex]').length).toBe(0);
    wrapper.unmount();
  });

  it('renders no cue when unlinked', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
    });
    expect(wrapper.find('[data-part="cue"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides the icon from assistive technology', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
    });
    expect(wrapper.get('[data-part="iconTile"]').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });
});

describe('FeatureCard — linked', () => {
  it('renders the title as a stretched link and is reachable by Tab', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      href: '/shipping',
    });
    const link = wrapper.get('[data-part="titleLink"]');
    expect(link.element.tagName).toBe('A');
    expect(link.attributes('href')).toBe('/shipping');
    const anchor = wrapper.get('a').element as HTMLAnchorElement;
    anchor.focus();
    expect(document.activeElement).toBe(anchor);
    wrapper.unmount();
  });

  it('is exactly one tab stop', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      href: '/shipping',
    });
    expect(wrapper.findAll('a').length).toBe(1);
    wrapper.unmount();
  });

  it('shows the default "Learn more" cue, aria-hidden, with an arrow', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      href: '/shipping',
    });
    const cue = wrapper.get('[data-part="cue"]');
    expect(cue.attributes('aria-hidden')).toBe('true');
    expect(cue.text()).toContain(enUS.learnMore);
    expect(cue.find('svg').exists()).toBe(true);
    wrapper.unmount();
  });

  it('lets cue override the default text', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      href: '/shipping',
      cue: 'See details',
    });
    expect(wrapper.get('[data-part="cue"]').text()).toContain('See details');
    wrapper.unmount();
  });

  it('names the link with the title alone, not the cue', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      href: '/shipping',
    });
    expect(wrapper.get('a').text()).toBe('Free shipping over $80');
    wrapper.unmount();
  });

  it('carries the focus proxy and rounded-lg corners on the root, an inset pseudo on the link', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      href: '/shipping',
    });
    const root = wrapper.get('[data-part="root"]');
    expect(root.classes()).toContain('eldra-focus');
    expect(root.classes()).toContain('eldra-focus-proxy');
    expect(root.classes()).toContain('rounded-lg');
    const link = wrapper.get('[data-part="titleLink"]');
    expect(link.classes()).toContain('after:absolute');
    expect(link.classes()).toContain('after:inset-0');
    expect(link.classes()).toContain('outline-none');
    wrapper.unmount();
  });

  it('carries no transition utility beside eldra-focus on the root', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      href: '/shipping',
    });
    const classes = wrapper.get('[data-part="root"]').classes();
    expect(classes.some((c) => c.startsWith('transition') || c.startsWith('duration'))).toBe(false);
    wrapper.unmount();
  });

  it('treats an empty-string href as unlinked', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      href: '',
    });
    expect(wrapper.find('a').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('FeatureCard — as', () => {
  it('uses a string as the tag and still passes href as href', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      href: '/shipping',
      as: 'a',
    });
    expect(wrapper.get('[data-part="titleLink"]').attributes('href')).toBe('/shipping');
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
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      href: '/shipping',
      as: FakeNuxtLink,
    });
    const link = wrapper.get('[data-part="titleLink"]');
    expect(link.attributes('data-fake-nuxt-link')).toBe('/shipping');
    expect(link.attributes('href')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('FeatureCard — variants', () => {
  it('plain: no background, border or padding', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      variant: 'plain',
    });
    const root = wrapper.get('[data-part="root"]');
    expect(root.classes()).not.toContain('bg-surface');
    expect(root.classes()).not.toContain('border');
    expect(root.classes().some((c) => c.startsWith('p-'))).toBe(false);
    expect(wrapper.get('[data-part="iconTile"]').classes()).toContain('bg-surface-strong');
    wrapper.unmount();
  });

  it('surface: surface fill, padding, and a background icon tile', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      variant: 'surface',
    });
    const root = wrapper.get('[data-part="root"]');
    expect(root.classes()).toContain('bg-surface');
    expect(root.classes()).toContain('p-6');
    expect(wrapper.get('[data-part="iconTile"]').classes()).toContain('bg-background');
    wrapper.unmount();
  });

  it('outlined: 1px border and padding, surface-strong icon tile', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      variant: 'outlined',
    });
    const root = wrapper.get('[data-part="root"]');
    expect(root.classes()).toContain('border');
    expect(root.classes()).toContain('border-border');
    expect(wrapper.get('[data-part="iconTile"]').classes()).toContain('bg-surface-strong');
    wrapper.unmount();
  });

  it('the icon tile stays 2.75rem square and never shrinks', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: LONG_TITLE,
      body: 'Delivered in 2-4 business days.',
    });
    const tile = wrapper.get('[data-part="iconTile"]');
    expect(tile.classes()).toContain('size-11');
    expect(tile.classes()).toContain('shrink-0');
    wrapper.unmount();
  });
});

describe('FeatureCard — headingLevel', () => {
  it.each([2, 3, 4, 5, 6] as const)('renders the title as h%s via headingLevel', (level) => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      headingLevel: level,
    });
    expect(wrapper.get('[data-part="title"]').element.tagName).toBe(`H${level}`);
    wrapper.unmount();
  });
});

describe('FeatureCard — customisation', () => {
  it('lets classes.root replace a layout utility instead of landing beside it', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
      classes: { root: 'gap-6' },
    });
    const root = wrapper.get('[data-part="root"]');
    expect(root.classes()).toContain('gap-6');
    expect(root.classes()).not.toContain('gap-3');
    wrapper.unmount();
  });
});

describe('FeatureCard — accessibility, long content and narrow', () => {
  it('has no axe violations unlinked', async () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: 'Free shipping over $80',
      body: 'Delivered in 2-4 business days.',
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations linked, every variant', async () => {
    for (const variant of ['plain', 'surface', 'outlined'] as const) {
      const wrapper = mountCard({
        icon: IconTruck,
        title: 'Free shipping over $80',
        body: 'Delivered in 2-4 business days.',
        href: '/shipping',
        variant,
      });
      expect(await axe(wrapper.element)).toHaveNoViolations();
      wrapper.unmount();
    }
  });

  it('wraps a long title fully across four lines instead of clamping it', () => {
    const wrapper = mountCard({
      icon: IconTruck,
      title: LONG_TITLE,
      body: 'Delivered in 2-4 business days.',
    });
    expect(wrapper.get('[data-part="title"]').text()).toBe(LONG_TITLE);
    const titleClasses = wrapper.get('[data-part="title"]').classes();
    expect(titleClasses.some((c) => c.startsWith('line-clamp'))).toBe(false);
    wrapper.unmount();
  });

  it('renders inside a narrow container without overflowing', () => {
    const wrapper = mountNarrow(FeatureCard, {
      props: {
        icon: IconTruck,
        title: LONG_TITLE,
        body: 'Delivered in 2-4 business days, worldwide, no minimum order value required.',
        href: '/shipping',
      },
    });
    expect(wrapper.get('a').text()).toBe(LONG_TITLE);
    wrapper.unmount();
  });
});
