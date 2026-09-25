import { afterEach, describe, expect, it } from 'vitest';
import { CURRENCY_KEY, LOCALE_KEY } from '../../../composables/useLocale';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Price from '../Price.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Price — element and parts', () => {
  it('renders a <p> with no interactive role', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800 } });
    expect(wrapper.element.tagName).toBe('P');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.attributes('role')).toBeUndefined();
    expect(wrapper.attributes('tabindex')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders only the parts a regular price needs', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800 } });
    expect(wrapper.find('[data-part="current"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="compareAt"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="from"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="unit"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="srLabel"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="skeleton"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Price — formatting', () => {
  it('formats a USD amount from minor units', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 4800, currency: 'USD', locale: 'en-US' },
    });
    expect(wrapper.get('[data-part="current"]').text()).toBe('$48.00');
    wrapper.unmount();
  });

  it('groups thousands for a larger USD amount', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 124000, currency: 'USD', locale: 'en-US' },
    });
    expect(wrapper.get('[data-part="current"]').text()).toBe('$1,240.00');
    wrapper.unmount();
  });

  it('formats ISK with no minor units and "." thousands grouping', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 6990, currency: 'ISK', locale: 'is-IS' },
    });
    expect(wrapper.get('[data-part="current"]').text()).toBe('6.990\u00a0kr.');
    wrapper.unmount();
  });

  it('formats a larger ISK amount', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 172900, currency: 'ISK', locale: 'is-IS' },
    });
    expect(wrapper.get('[data-part="current"]').text()).toBe('172.900\u00a0kr.');
    wrapper.unmount();
  });

  it('never adds a trailing ".00" to ISK', () => {
    const wrapper = mountWith(Price, { props: { amount: 100, currency: 'ISK', locale: 'is-IS' } });
    expect(wrapper.get('[data-part="current"]').text()).not.toMatch(/\.\d/);
    wrapper.unmount();
  });

  it('reads the amount as minor units, not major', () => {
    // 4800 minor units of USD is $48.00, not $4,800.00.
    const wrapper = mountWith(Price, { props: { amount: 4800, currency: 'USD', locale: 'en-US' } });
    expect(wrapper.get('[data-part="current"]').text()).not.toBe('$4,800.00');
    wrapper.unmount();
  });
});

describe('Price — ambient locale and currency', () => {
  it('defaults to USD / en-US with nothing provided', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800 } });
    expect(wrapper.get('[data-part="current"]').text()).toBe('$48.00');
    wrapper.unmount();
  });

  it('uses the ambient locale and currency when neither prop is given', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 6990 },
      global: { provide: { [LOCALE_KEY as symbol]: 'is-IS', [CURRENCY_KEY as symbol]: 'ISK' } },
    });
    expect(wrapper.get('[data-part="current"]').text()).toBe('6.990\u00a0kr.');
    wrapper.unmount();
  });

  it('lets the locale/currency props win over the ambient value', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 4800, locale: 'en-US', currency: 'USD' },
      global: { provide: { [LOCALE_KEY as symbol]: 'is-IS', [CURRENCY_KEY as symbol]: 'ISK' } },
    });
    expect(wrapper.get('[data-part="current"]').text()).toBe('$48.00');
    wrapper.unmount();
  });
});

describe('Price — sale', () => {
  it('turns on sale when compareAt is greater than amount', () => {
    const wrapper = mountWith(Price, { props: { amount: 3840, compareAt: 4800 } });
    expect(wrapper.find('[data-part="compareAt"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('ignores a compareAt equal to amount', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, compareAt: 4800 } });
    expect(wrapper.find('[data-part="compareAt"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('ignores a compareAt below amount', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, compareAt: 3000 } });
    expect(wrapper.find('[data-part="compareAt"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('treats a null compareAt as no sale', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, compareAt: null } });
    expect(wrapper.find('[data-part="compareAt"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the compare-at as a real <s> element', () => {
    const wrapper = mountWith(Price, { props: { amount: 3840, compareAt: 4800 } });
    expect(wrapper.get('[data-part="compareAt"]').element.tagName).toBe('S');
    expect(wrapper.get('[data-part="compareAt"]').text()).toBe('$48.00');
    wrapper.unmount();
  });

  it('strikes through and mutes the compare-at', () => {
    const wrapper = mountWith(Price, { props: { amount: 3840, compareAt: 4800 } });
    const compareAt = wrapper.get('[data-part="compareAt"]');
    expect(compareAt.classes()).toContain('line-through');
    expect(compareAt.classes()).toContain('text-muted');
    wrapper.unmount();
  });

  it('colours the current price accent on sale', () => {
    const wrapper = mountWith(Price, { props: { amount: 3840, compareAt: 4800 } });
    expect(wrapper.get('[data-part="current"]').classes()).toContain('text-accent');
    wrapper.unmount();
  });

  it('colours the current price with the ordinary text role when not on sale', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800 } });
    const current = wrapper.get('[data-part="current"]');
    expect(current.classes()).toContain('text-text');
    expect(current.classes()).not.toContain('text-accent');
    wrapper.unmount();
  });

  it('reads "Sale price $38.40 Regular price $48.00" in that order', () => {
    const wrapper = mountWith(Price, { props: { amount: 3840, compareAt: 4800 } });
    expect(wrapper.text().replace(/\s+/g, ' ')).toBe('Sale price $38.40 Regular price $48.00');
    wrapper.unmount();
  });

  it('renders exactly two visually hidden srLabel spans, in Sale-then-Regular order', () => {
    const wrapper = mountWith(Price, { props: { amount: 3840, compareAt: 4800 } });
    const labels = wrapper.findAll('[data-part="srLabel"]');
    expect(labels).toHaveLength(2);
    expect(labels[0]?.text()).toBe('Sale price');
    expect(labels[0]?.classes()).toContain('sr-only');
    expect(labels[1]?.text()).toBe('Regular price');
    expect(labels[1]?.classes()).toContain('sr-only');
    wrapper.unmount();
  });

  it('overrides the hidden labels per instance via labels.sale / labels.regular', () => {
    const wrapper = mountWith(Price, {
      props: {
        amount: 3840,
        compareAt: 4800,
        labels: { sale: 'Tilboðsverð', regular: 'Fullt verð' },
      },
    });
    const labels = wrapper.findAll('[data-part="srLabel"]');
    expect(labels[0]?.text()).toBe('Tilboðsverð');
    expect(labels[1]?.text()).toBe('Fullt verð');
    wrapper.unmount();
  });
});

describe('Price — from', () => {
  it('renders no from label by default', () => {
    const wrapper = mountWith(Price, { props: { amount: 1530 } });
    expect(wrapper.find('[data-part="from"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the From label before the price', () => {
    const wrapper = mountWith(Price, { props: { amount: 1530, from: true } });
    expect(wrapper.get('[data-part="from"]').text()).toBe('From');
    wrapper.unmount();
  });

  it('overrides the from label via labels.from', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 1530, from: true, labels: { from: 'Frá' } },
    });
    expect(wrapper.get('[data-part="from"]').text()).toBe('Frá');
    wrapper.unmount();
  });
});

describe('Price — unit price', () => {
  it('renders no unit part when unitPrice is not given', () => {
    const wrapper = mountWith(Price, { props: { amount: 1530 } });
    expect(wrapper.find('[data-part="unit"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the formatted per-unit amount and per text on one line', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 1530, unitPrice: { amount: 510, per: '100 g' } },
    });
    expect(wrapper.get('[data-part="unit"]').text()).toBe('$5.10 / 100 g');
    wrapper.unmount();
  });

  it('forces the unit line onto its own full-width row', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 1530, unitPrice: { amount: 510, per: '100 g' } },
    });
    expect(wrapper.get('[data-part="unit"]').classes()).toContain('basis-full');
    wrapper.unmount();
  });

  it('combines with from and sale ("From $15.30 $18.00 / $5.10 / 100 g")', () => {
    const wrapper = mountWith(Price, {
      props: {
        amount: 1530,
        compareAt: 1800,
        from: true,
        unitPrice: { amount: 510, per: '100 g' },
      },
    });
    expect(wrapper.get('[data-part="from"]').text()).toBe('From');
    expect(wrapper.get('[data-part="current"]').text()).toBe('$15.30');
    expect(wrapper.get('[data-part="compareAt"]').text()).toBe('$18.00');
    expect(wrapper.get('[data-part="unit"]').text()).toBe('$5.10 / 100 g');
    wrapper.unmount();
  });
});

describe('Price — lang', () => {
  it('renders no lang attribute by default', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800 } });
    expect(wrapper.attributes('lang')).toBeUndefined();
    wrapper.unmount();
  });

  it('sets lang on the root when the price language differs from the page', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 6990, currency: 'ISK', locale: 'is-IS', lang: 'is' },
    });
    expect(wrapper.attributes('lang')).toBe('is');
    wrapper.unmount();
  });
});

describe('Price — loading', () => {
  it('renders a skeleton instead of the price', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, loading: true } });
    expect(wrapper.find('[data-part="skeleton"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="current"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides the skeleton from assistive technology', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, loading: true } });
    expect(wrapper.get('[data-part="skeleton"]').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('shimmers with the shared eldra-skeleton utility on a surface-strong shape', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, loading: true } });
    expect(wrapper.get('[data-part="skeleton"]').classes()).toContain('eldra-skeleton');
    wrapper.unmount();
  });

  it('renders no from, compareAt or unit parts while loading', () => {
    const wrapper = mountWith(Price, {
      props: {
        amount: 3840,
        compareAt: 4800,
        from: true,
        unitPrice: { amount: 510, per: '100 g' },
        loading: true,
      },
    });
    expect(wrapper.find('[data-part="from"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="compareAt"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="unit"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="srLabel"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('Price — tabular numerals', () => {
  it('applies the tabular-numeral utility to current, compareAt and unit', () => {
    const wrapper = mountWith(Price, {
      props: {
        amount: 3840,
        compareAt: 4800,
        unitPrice: { amount: 510, per: '100 g' },
      },
    });
    expect(wrapper.get('[data-part="current"]').classes()).toContain('text-price-current');
    expect(wrapper.get('[data-part="compareAt"]').classes()).toContain('text-price-secondary');
    expect(wrapper.get('[data-part="unit"]').classes()).toContain('text-price-unit');
    wrapper.unmount();
  });
});

describe('Price — sizes', () => {
  it('sets an explicit size class for sm', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, size: 'sm' } });
    expect(wrapper.classes()).toContain('text-price-sm');
    wrapper.unmount();
  });

  it('sets an explicit size class for lg', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, size: 'lg' } });
    expect(wrapper.classes()).toContain('text-price-lg');
    wrapper.unmount();
  });

  it('sets no size class for md, inheriting the surrounding text size', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, size: 'md' } });
    expect(wrapper.classes()).not.toContain('text-price-sm');
    expect(wrapper.classes()).not.toContain('text-price-lg');
    wrapper.unmount();
  });

  it('defaults to md', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800 } });
    expect(wrapper.classes()).not.toContain('text-price-sm');
    expect(wrapper.classes()).not.toContain('text-price-lg');
    wrapper.unmount();
  });
});

describe('Price — customisation', () => {
  it('merges an override onto every part', () => {
    const wrapper = mountWith(Price, {
      props: {
        amount: 3840,
        compareAt: 4800,
        classes: { root: 'gap-x-4', current: 'uppercase', compareAt: 'italic', srLabel: 'italic' },
      },
    });
    expect(wrapper.classes()).toContain('gap-x-4');
    expect(wrapper.get('[data-part="current"]').classes()).toContain('uppercase');
    expect(wrapper.get('[data-part="compareAt"]').classes()).toContain('italic');
    expect(wrapper.get('[data-part="srLabel"]').classes()).toContain('italic');
    wrapper.unmount();
  });
});

describe('Price — narrow container', () => {
  it('wraps every part instead of overflowing in a 20rem container', () => {
    const wrapper = mountNarrow(Price, {
      props: {
        amount: 1530,
        compareAt: 1800,
        from: true,
        unitPrice: { amount: 510, per: '100 g' },
      },
    });
    expect(wrapper.element.tagName).toBe('P');
    expect(wrapper.classes()).toContain('flex-wrap');
    expect(wrapper.get('[data-part="unit"]').text()).toBe('$5.10 / 100 g');
    wrapper.unmount();
  });
});

describe('Price — accessibility', () => {
  it('has no axe violations for a regular price', async () => {
    const wrapper = mountWith(Price, { props: { amount: 4800 } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations on sale', async () => {
    const wrapper = mountWith(Price, { props: { amount: 3840, compareAt: 4800 } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations with from and a unit price', async () => {
    const wrapper = mountWith(Price, {
      props: { amount: 1530, from: true, unitPrice: { amount: 510, per: '100 g' } },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations while loading', async () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, loading: true } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
