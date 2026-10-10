import { defineComponent, h } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { provideEldraUiMessages } from '../../../composables/useMessages';
import { isIS } from '../../../messages/is-IS';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Rating from '../Rating.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Rating — element and parts', () => {
  it('renders a wrapper with the root part and no interactive role by default', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128 } });
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.attributes('tabindex')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders five star parts', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128 } });
    expect(wrapper.findAll('[data-part="star"]')).toHaveLength(5);
    wrapper.unmount();
  });

  it('hides the star row from assistive technology', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128 } });
    expect(wrapper.get('[data-part="stars"]').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });
});

describe('Rating — rounding (star fill)', () => {
  it('rounds 4.24 down to four full stars and one empty star (no half)', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.24, count: 10 } });
    const stars = wrapper.findAll('[data-part="star"]');
    for (const star of stars.slice(0, 4)) {
      expect(star.findAll('svg')).toHaveLength(1);
      expect(star.get('svg').classes()).toContain('text-text');
    }
    expect(stars[4]?.findAll('svg')).toHaveLength(1);
    expect(stars[4]?.get('svg').classes()).toContain('text-border-strong');
    expect(wrapper.get('[data-part="value"]').text()).toBe('4.0');
    wrapper.unmount();
  });

  it('rounds 4.25 up to four full stars and one half star', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.25, count: 10 } });
    const stars = wrapper.findAll('[data-part="star"]');
    for (const star of stars.slice(0, 4)) {
      expect(star.findAll('svg')).toHaveLength(1);
    }
    const half = stars[4];
    expect(half?.findAll('svg')).toHaveLength(2);
    const filledOverlay = half?.findAll('svg')[1];
    expect(filledOverlay?.classes()).toContain('eldra-rating-half');
    expect(wrapper.get('[data-part="value"]').text()).toBe('4.5');
    wrapper.unmount();
  });

  it('renders every star empty for a value of 0', () => {
    const wrapper = mountWith(Rating, { props: { value: 0, count: 10 } });
    for (const star of wrapper.findAll('[data-part="star"]')) {
      expect(star.get('svg').classes()).toContain('text-border-strong');
    }
    wrapper.unmount();
  });

  it('renders every star full for a value of 5', () => {
    const wrapper = mountWith(Rating, { props: { value: 5, count: 10 } });
    for (const star of wrapper.findAll('[data-part="star"]')) {
      expect(star.get('svg').classes()).toContain('text-text');
    }
    wrapper.unmount();
  });

  it('clamps an out-of-range value instead of rendering a sixth star', () => {
    const wrapper = mountWith(Rating, { props: { value: 7, count: 10 } });
    expect(wrapper.get('[data-part="value"]').text()).toBe('5.0');
    wrapper.unmount();
  });
});

describe('Rating — value and count visibility', () => {
  it('shows the value and count by default', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128 } });
    expect(wrapper.get('[data-part="value"]').text()).toBe('4.5');
    expect(wrapper.get('[data-part="count"]').text()).toBe('(128)');
    wrapper.unmount();
  });

  it('hides the value when showValue is false', () => {
    const wrapper = mountWith(Rating, {
      props: { value: 4.5, count: 128, showValue: false },
    });
    expect(wrapper.find('[data-part="value"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="count"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hides the count when showCount is false', () => {
    const wrapper = mountWith(Rating, {
      props: { value: 4.5, count: 128, showCount: false },
    });
    expect(wrapper.find('[data-part="count"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="value"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders stars only, still with the full accessible name, when both are false', () => {
    const wrapper = mountWith(Rating, {
      props: { value: 4.5, count: 128, showValue: false, showCount: false },
    });
    expect(wrapper.find('[data-part="value"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="count"]').exists()).toBe(false);
    expect(wrapper.attributes('aria-label')).toBe('Rated 4.5 out of 5, 128 reviews');
    wrapper.unmount();
  });

  it('hides the value and count text from assistive technology (the sentence carries it)', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128 } });
    expect(wrapper.get('[data-part="value"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('[data-part="count"]').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });
});

describe('Rating — no-reviews state', () => {
  it('renders "No reviews yet" instead of a value or count when count is 0', () => {
    const wrapper = mountWith(Rating, { props: { value: 0, count: 0 } });
    expect(wrapper.get('[data-part="empty"]').text()).toBe('No reviews yet');
    expect(wrapper.find('[data-part="value"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="count"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('never renders "0.0" when count is 0, even with a truthy value prop', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 0 } });
    expect(wrapper.text()).not.toContain('0.0');
    expect(wrapper.get('[data-part="empty"]').text()).toBe('No reviews yet');
    wrapper.unmount();
  });

  it('renders no role="img"/aria-label in the no-reviews state (read as normal text)', () => {
    const wrapper = mountWith(Rating, { props: { value: 0, count: 0 } });
    expect(wrapper.attributes('role')).toBeUndefined();
    expect(wrapper.attributes('aria-label')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders the emptyAction slot below the no-reviews text', () => {
    const wrapper = mountWith(Rating, {
      props: { value: 0, count: 0 },
      slots: { emptyAction: '<a href="#write-review">Be the first to review</a>' },
    });
    const link = wrapper.get('a');
    expect(link.text()).toBe('Be the first to review');
    wrapper.unmount();
  });

  it('renders no emptyAction content when the slot is not used', () => {
    const wrapper = mountWith(Rating, { props: { value: 0, count: 0 } });
    expect(wrapper.find('a').exists()).toBe(false);
    wrapper.unmount();
  });

  it('still renders the five stars in the no-reviews state', () => {
    const wrapper = mountWith(Rating, { props: { value: 0, count: 0 } });
    expect(wrapper.findAll('[data-part="star"]')).toHaveLength(5);
    wrapper.unmount();
  });
});

describe('Rating — linked variant', () => {
  it('renders an <a> with the href when href is set and there are reviews', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128, href: '#reviews' } });
    const link = wrapper.get('[data-part="link"]');
    expect(link.element.tagName).toBe('A');
    expect(link.attributes('href')).toBe('#reviews');
    wrapper.unmount();
  });

  it('is a single tab stop: the stars are never separate tab stops', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128, href: '#reviews' } });
    expect(wrapper.findAll('a, button, [tabindex]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('renders the linked count text as a pluralised sentence, not "(128)"', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128, href: '#reviews' } });
    expect(wrapper.get('[data-part="count"]').text()).toBe('128 reviews');
    wrapper.unmount();
  });

  it('uses the singular for exactly one review when linked', () => {
    const wrapper = mountWith(Rating, { props: { value: 5, count: 1, href: '#reviews' } });
    expect(wrapper.get('[data-part="count"]').text()).toBe('1 review');
    wrapper.unmount();
  });

  it('underlines the linked count', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128, href: '#reviews' } });
    expect(wrapper.get('[data-part="count"]').classes()).toContain('underline');
    wrapper.unmount();
  });

  it('does not underline the count when not linked', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128 } });
    expect(wrapper.get('[data-part="count"]').classes()).not.toContain('underline');
    wrapper.unmount();
  });

  it('draws the proxy focus ring on the root, not on the link itself', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128, href: '#reviews' } });
    expect(wrapper.classes()).toContain('eldra-focus-proxy');
    expect(wrapper.get('[data-part="link"]').classes()).not.toContain('eldra-focus-proxy');
    wrapper.unmount();
  });

  it('is at least 1.5rem tall (target-min) once linked', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128, href: '#reviews' } });
    expect(wrapper.classes()).toContain('target-min');
    wrapper.unmount();
  });

  it('renders as a plain span, not a link, while count is 0 even with href set', () => {
    const wrapper = mountWith(Rating, { props: { value: 0, count: 0, href: '#reviews' } });
    expect(wrapper.find('[data-part="link"]').exists()).toBe(false);
    expect(wrapper.find('a').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the as component and forwards href as `to`', () => {
    const FakeRouterLink = defineComponent({
      props: { to: { type: String, required: true } },
      setup:
        (props, { slots }) =>
        () =>
          h('a', { 'data-fake-router-link': props.to }, slots.default?.()),
    });
    const wrapper = mountWith(Rating, {
      props: { value: 4.5, count: 128, href: '/product#reviews', as: FakeRouterLink },
    });
    expect(wrapper.get('[data-part="link"]').attributes('data-fake-router-link')).toBe(
      '/product#reviews'
    );
    expect(wrapper.get('[data-part="link"]').attributes('href')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('Rating — accessible text', () => {
  it('sets role="img" and the exact accessible sentence on the static rating', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128 } });
    expect(wrapper.attributes('role')).toBe('img');
    expect(wrapper.attributes('aria-label')).toBe('Rated 4.5 out of 5, 128 reviews');
    wrapper.unmount();
  });

  it('reads nothing from the individual stars, value or count', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128 } });
    expect(wrapper.get('[data-part="stars"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('[data-part="value"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.get('[data-part="count"]').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('uses the singular "review" for exactly one review', () => {
    const wrapper = mountWith(Rating, { props: { value: 5, count: 1 } });
    expect(wrapper.attributes('aria-label')).toBe('Rated 5.0 out of 5, 1 review');
    wrapper.unmount();
  });

  it('sets the same sentence as aria-label on the link in the linked variant', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128, href: '#reviews' } });
    expect(wrapper.get('[data-part="link"]').attributes('aria-label')).toBe(
      'Rated 4.5 out of 5, 128 reviews'
    );
    wrapper.unmount();
  });

  it('reads the Icelandic catalogue when provided, comma decimal included', () => {
    const Wrapped = defineComponent({
      setup() {
        provideEldraUiMessages(isIS);
        return () => h(Rating, { value: 4.5, count: 128 });
      },
    });
    const wrapper = mountWith(Wrapped);
    expect(wrapper.attributes('aria-label')).toBe('Einkunn 4,5 af 5, 128 umsagnir');
    wrapper.unmount();
  });

  it('reads the Icelandic no-reviews text when provided', () => {
    const Wrapped = defineComponent({
      setup() {
        provideEldraUiMessages(isIS);
        return () => h(Rating, { value: 0, count: 0 });
      },
    });
    const wrapper = mountWith(Wrapped);
    expect(wrapper.get('[data-part="empty"]').text()).toBe('Engar umsagnir enn');
    wrapper.unmount();
  });
});

describe('Rating — customisation', () => {
  it('merges an override onto every part', () => {
    const wrapper = mountWith(Rating, {
      props: {
        value: 4.5,
        count: 128,
        classes: {
          root: 'gap-x-4',
          stars: 'gap-x-1',
          value: 'uppercase',
          count: 'italic',
        },
      },
    });
    expect(wrapper.classes()).toContain('gap-x-4');
    expect(wrapper.get('[data-part="stars"]').classes()).toContain('gap-x-1');
    expect(wrapper.get('[data-part="value"]').classes()).toContain('uppercase');
    expect(wrapper.get('[data-part="count"]').classes()).toContain('italic');
    wrapper.unmount();
  });
});

describe('Rating — narrow container', () => {
  it('renders without overflowing in a 20rem container', () => {
    const wrapper = mountNarrow(Rating, { props: { value: 4.5, count: 128 } });
    expect(wrapper.findAll('[data-part="star"]')).toHaveLength(5);
    expect(wrapper.classes()).toContain('inline-flex');
    wrapper.unmount();
  });

  it('wraps instead of overflowing, defensively, for an extreme review count', () => {
    const wrapper = mountNarrow(Rating, { props: { value: 4.5, count: 999_999_999 } });
    expect(wrapper.classes()).toContain('flex-wrap');
    wrapper.unmount();
  });

  it('wraps the linked form too', () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128, href: '#reviews' } });
    expect(wrapper.get('[data-part="link"]').classes()).toContain('flex-wrap');
    wrapper.unmount();
  });

  it('renders the no-reviews state with an action link without overflowing', () => {
    const wrapper = mountNarrow(Rating, {
      props: { value: 0, count: 0 },
      slots: {
        emptyAction: '<a href="#write-review">Be the first to review the Merino crew sweater</a>',
      },
    });
    expect(wrapper.get('[data-part="empty"]').text()).toBe('No reviews yet');
    expect(wrapper.get('a').text()).toBe('Be the first to review the Merino crew sweater');
    wrapper.unmount();
  });
});

describe('Rating — accessibility', () => {
  it('has no axe violations for the static rating', async () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128 } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations for the linked rating', async () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128, href: '#reviews' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations for the no-reviews state', async () => {
    const wrapper = mountWith(Rating, { props: { value: 0, count: 0 } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations for the no-reviews state with an action link', async () => {
    const wrapper = mountWith(Rating, {
      props: { value: 0, count: 0 },
      slots: { emptyAction: '<a href="#write-review">Be the first to review</a>' },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations at the large size', async () => {
    const wrapper = mountWith(Rating, { props: { value: 4.5, count: 128, size: 'lg' } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
