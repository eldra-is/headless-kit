import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Link from '../Link.vue';
import type { LinkTone, LinkVariant } from '../types';

/** Twice the length of the spec's own example. */
const LONG_LABEL =
  'Every piece is thrown on the wheel in our Porto studio and finished entirely by hand';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Link — element and semantics', () => {
  it('renders a native anchor when href is set', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/care/stoneware' },
      slots: { default: 'care for stoneware' },
    });
    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('href')).toBe('/care/stoneware');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.text()).toBe('care for stoneware');
    wrapper.unmount();
  });

  it('renders plain text with no link semantics when href is absent', () => {
    const wrapper = mountWith(Link, { slots: { default: 'care for stoneware' } });
    expect(wrapper.element.tagName).toBe('SPAN');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.attributes('href')).toBeUndefined();
    expect(wrapper.attributes('target')).toBeUndefined();
    expect(wrapper.attributes('rel')).toBeUndefined();
    expect(wrapper.text()).toBe('care for stoneware');
    wrapper.unmount();
  });

  it('names the label part inside both an anchor and a span', () => {
    const link = mountWith(Link, {
      props: { href: '/x' },
      slots: { default: 'Read the care guide' },
    });
    expect(link.find('[data-part="label"]').exists()).toBe(true);
    link.unmount();

    const span = mountWith(Link, { slots: { default: 'Read the care guide' } });
    expect(span.find('[data-part="label"]').exists()).toBe(true);
    span.unmount();
  });

  it('does not carry the focus ring or link styling on the plain-text span', () => {
    const wrapper = mountWith(Link, { slots: { default: 'Read the care guide' } });
    expect(wrapper.classes()).not.toContain('eldra-focus');
    expect(wrapper.classes()).not.toContain('underline');
    wrapper.unmount();
  });

  it('is reachable by Tab as an anchor and not focusable as a span', () => {
    const anchor = mountWith(Link, {
      props: { href: '/x' },
      slots: { default: 'Read the care guide' },
    });
    (anchor.element as HTMLAnchorElement).focus();
    expect(document.activeElement).toBe(anchor.element);
    anchor.unmount();

    const span = mountWith(Link, { slots: { default: 'Read the care guide' } });
    expect(span.attributes('tabindex')).toBeUndefined();
    span.unmount();
  });
});

describe('Link — as prop', () => {
  it('uses a string as the tag and still passes href as href', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x', as: 'a' },
      slots: { default: 'Shop knitwear' },
    });
    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.attributes('href')).toBe('/x');
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
    const wrapper = mountWith(Link, {
      props: { href: '/collections/knitwear', as: FakeNuxtLink },
      slots: { default: 'Shop all knitwear' },
    });
    expect(wrapper.attributes('data-fake-nuxt-link')).toBe('/collections/knitwear');
    expect(wrapper.attributes('href')).toBeUndefined();
    wrapper.unmount();
  });

  it('ignores as and renders a plain span when there is no href', () => {
    const FakeNuxtLink = defineComponent({
      props: { to: { type: String, required: true } },
      setup:
        (props, { slots }) =>
        () =>
          h('a', { to: props.to }, slots.default?.()),
    });
    const wrapper = mountWith(Link, {
      props: { as: FakeNuxtLink },
      slots: { default: 'Read the care guide' },
    });
    expect(wrapper.element.tagName).toBe('SPAN');
    wrapper.unmount();
  });
});

describe('Link — variants', () => {
  it('underlines an inline link at rest', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x' },
      slots: { default: 'care for stoneware' },
    });
    expect(wrapper.classes()).toContain('underline');
    expect(wrapper.classes()).toContain('underline-offset-[0.2em]');
    wrapper.unmount();
  });

  it('defaults to the inline variant', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x' },
      slots: { default: 'care for stoneware' },
    });
    expect(wrapper.classes()).toContain('underline');
    expect(wrapper.classes()).not.toContain('font-semibold');
    wrapper.unmount();
  });

  it('gives the standalone variant weight 600, underlined at rest, and the target-min box', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x', variant: 'standalone' },
      slots: { default: 'Shop all knitwear' },
    });
    expect(wrapper.classes()).toContain('font-semibold');
    expect(wrapper.classes()).toContain('underline');
    expect(wrapper.classes()).not.toContain('no-underline');
    expect(wrapper.classes()).toContain('target-min');
    expect(wrapper.classes()).toContain('inline-flex');
    wrapper.unmount();
  });

  it.each<LinkVariant>(['inline', 'standalone'])(
    'never sets whitespace-nowrap on the %s variant, so links wrap naturally',
    (variant) => {
      const wrapper = mountWith(Link, {
        props: { href: '/x', variant },
        slots: { default: LONG_LABEL },
      });
      expect(wrapper.classes()).not.toContain('whitespace-nowrap');
      wrapper.unmount();
    }
  );
});

describe('Link — underline', () => {
  it.each<LinkVariant>(['inline', 'standalone'])(
    'underlines the %s variant at rest by default',
    (variant) => {
      const wrapper = mountWith(Link, {
        props: { href: '/x', variant },
        slots: { default: 'care for stoneware' },
      });
      expect(wrapper.classes()).toContain('underline');
      expect(wrapper.classes()).not.toContain('no-underline');
      wrapper.unmount();
    }
  );

  it.each<LinkVariant>(['inline', 'standalone'])(
    'removes the rest-state underline on the %s variant when underline is false, keeping it on hover',
    (variant) => {
      const wrapper = mountWith(Link, {
        props: { href: '/x', variant, underline: false },
        slots: { default: 'care for stoneware' },
      });
      expect(wrapper.classes()).toContain('no-underline');
      expect(wrapper.classes()).not.toContain('underline');
      expect(wrapper.classes()).toContain('hover:underline');
      expect(wrapper.classes()).toContain('active:underline');
      wrapper.unmount();
    }
  );
});

describe('Link — arrow', () => {
  it('shows the arrow only on a standalone link with arrow set', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x', variant: 'standalone', arrow: true },
      slots: { default: 'Shop all knitwear' },
    });
    const arrow = wrapper.get('[data-part="arrow"]');
    expect(arrow.attributes('aria-hidden')).toBe('true');
    expect(arrow.classes()).toContain('size-4.5');
    wrapper.unmount();
  });

  it('never shows the arrow on an inline link, even with arrow set', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x', variant: 'inline', arrow: true },
      slots: { default: 'care for stoneware' },
    });
    expect(wrapper.find('[data-part="arrow"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not show the arrow on a standalone link when arrow is not set', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x', variant: 'standalone' },
      slots: { default: 'Size guide' },
    });
    expect(wrapper.find('[data-part="arrow"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Link — external', () => {
  it('adds target, rel, the external icon and the visually hidden text', () => {
    const wrapper = mountWith(Link, {
      props: { href: 'https://wool.example', external: true },
      slots: { default: 'certified Responsible Wool farms' },
    });
    expect(wrapper.attributes('target')).toBe('_blank');
    expect(wrapper.attributes('rel')).toBe('noopener noreferrer');
    const icon = wrapper.get('[data-part="externalIcon"]');
    expect(icon.attributes('aria-hidden')).toBe('true');
    expect(icon.classes()).toContain('size-3.5');
    expect(wrapper.text()).toContain('(opens in a new tab)');
    wrapper.unmount();
  });

  it('does not add external attributes or icon when external is not set', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x' },
      slots: { default: 'care for stoneware' },
    });
    expect(wrapper.attributes('target')).toBeUndefined();
    expect(wrapper.attributes('rel')).toBeUndefined();
    expect(wrapper.find('[data-part="externalIcon"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('ignores external when there is no href', () => {
    const wrapper = mountWith(Link, {
      props: { external: true },
      slots: { default: 'care for stoneware' },
    });
    expect(wrapper.element.tagName).toBe('SPAN');
    expect(wrapper.attributes('target')).toBeUndefined();
    expect(wrapper.find('[data-part="externalIcon"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Link — tone', () => {
  it('uses the default text role by default', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x' },
      slots: { default: 'care for stoneware' },
    });
    expect(wrapper.classes()).toContain('text-text');
    wrapper.unmount();
  });

  it('uses muted at rest, turning text on hover', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x', tone: 'muted' },
      slots: { default: 'Size guide' },
    });
    expect(wrapper.classes()).toContain('text-muted');
    expect(wrapper.classes()).toContain('hover:text-text');
    wrapper.unmount();
  });

  it('inherits the section contrast colour on primary and accent sections', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x' },
      slots: { default: 'Learn more' },
    });
    expect(wrapper.classes()).toContain(
      'group-data-[section=primary]/section:text-primary-contrast'
    );
    expect(wrapper.classes()).toContain('group-data-[section=accent]/section:text-accent-contrast');
    wrapper.unmount();
  });
});

describe('Link — focus and motion', () => {
  it('wears the one focus ring when it is a real link', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x' },
      slots: { default: 'care for stoneware' },
    });
    expect(wrapper.classes()).toContain('eldra-focus');
    wrapper.unmount();
  });

  it('leaves the transition list to the focus ring utility', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x' },
      slots: { default: 'care for stoneware' },
    });
    // `eldra-focus` declares one `transition` shorthand: the colour and underline changes at
    // `duration-fast`, the ring at `duration-base`, nothing under reduced motion. A second
    // shorthand from a `transition-*`/`duration-*` utility on this element would replace all of
    // it and the ring would snap in instead of growing — see
    // `src/__tests__/focus-transition.spec.ts`, which enforces this across every component.
    expect(wrapper.classes()).toContain('eldra-focus');
    // `[^\s:]+` (not `\S+`) keeps the colon out of the repeated group: since a
    // variant token never contains one itself, this matches exactly the same
    // class strings, but without the ambiguous ways to split a long run of
    // `!:` that make `(\S+:)*` backtrack exponentially (CodeQL).
    expect(wrapper.classes().join(' ')).not.toMatch(/(^|\s)([^\s:]+:)*(transition|duration)-/);
    wrapper.unmount();
  });

  it('still animates the standalone arrow, which is a different element', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x', variant: 'standalone', arrow: true },
      slots: { default: 'Shop all knitwear' },
    });
    // The rule is per element, not per component: the arrow carries no focus ring, so its own
    // `transition-[translate] duration-fast` is exactly right and must survive.
    expect(wrapper.get('[data-part="arrow"]').classes()).toContain('duration-fast');
    wrapper.unmount();
  });
});

describe('Link — customisation', () => {
  it('lets classes.root replace a colour utility instead of landing beside it', () => {
    const wrapper = mountWith(Link, {
      props: { href: '/x', classes: { root: 'text-accent' } },
      slots: { default: 'care for stoneware' },
    });
    expect(wrapper.classes()).toContain('text-accent');
    expect(wrapper.classes()).not.toContain('text-text');
    wrapper.unmount();
  });

  it('merges an override onto the arrow and external icon parts', () => {
    const wrapper = mountWith(Link, {
      props: {
        href: '/x',
        variant: 'standalone',
        arrow: true,
        external: true,
        classes: { arrow: 'text-accent', externalIcon: 'text-accent', label: 'italic' },
      },
      slots: { default: 'Shop all knitwear' },
    });
    expect(wrapper.get('[data-part="arrow"]').classes()).toContain('text-accent');
    expect(wrapper.get('[data-part="externalIcon"]').classes()).toContain('text-accent');
    expect(wrapper.get('[data-part="label"]').classes()).toContain('italic');
    wrapper.unmount();
  });
});

describe('Link — content', () => {
  it('renders inside a narrow container without clipping', () => {
    const wrapper = mountNarrow(Link, {
      props: { href: '/x' },
      slots: { default: LONG_LABEL },
    });
    expect(wrapper.element.tagName).toBe('A');
    expect(wrapper.text()).toBe(LONG_LABEL);
    wrapper.unmount();
  });

  it('renders a standalone link with arrow inside a narrow container', () => {
    const wrapper = mountNarrow(Link, {
      props: { href: '/x', variant: 'standalone', arrow: true },
      slots: { default: LONG_LABEL },
    });
    expect(wrapper.find('[data-part="arrow"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('Link — accessibility', () => {
  it.each<[string, Record<string, unknown>]>([
    ['inline', { href: '/x' }],
    ['standalone with arrow', { href: '/x', variant: 'standalone', arrow: true }],
    ['external', { href: 'https://wool.example', external: true }],
    ['muted', { href: '/x', tone: 'muted' }],
    ['plain text (no href)', {}],
  ])('has no axe violations: %s', async (_name, props) => {
    const wrapper = mountWith(Link, { props, slots: { default: 'care for stoneware' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it.each<LinkTone>(['default', 'muted'])('has no axe violations for the %s tone', async (tone) => {
    const wrapper = mountWith(Link, {
      props: { href: '/x', tone },
      slots: { default: 'Size guide' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
