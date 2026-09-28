import { defineComponent, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CURRENCY_KEY, LOCALE_KEY } from '../../../composables/useLocale';
import { provideEldraUiMessages } from '../../../composables/useMessages';
import { isIS } from '../../../messages/is-IS';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Price from '../Price.vue';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/**
 * Everything the component renders for a sighted reader: the whole root minus the visually hidden
 * live region, which is the one thing the revalidating state adds to the text tree.
 */
function visibleText(wrapper: { element: Element }): string {
  const clone = wrapper.element.cloneNode(true) as HTMLElement;
  clone.querySelector('[data-part="srStatus"]')?.remove();
  return clone.textContent ?? '';
}

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
    expect(wrapper.find('[data-part="srText"]').exists()).toBe(false);
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

  it('renders three decimals for a 3-fraction-digit currency (BHD)', () => {
    // BHD has 3 minor-unit digits, so 1_234_567 minor units is 1234.567 major units — asserted
    // against Intl's own output, not a hard-coded string, so ICU data differences across
    // platforms cannot break this test.
    const expected = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'BHD' }).format(
      1234.567
    );
    const wrapper = mountWith(Price, {
      props: { amount: 1_234_567, currency: 'BHD', locale: 'en-US' },
    });
    expect(wrapper.get('[data-part="current"]').text()).toBe(expected);
    wrapper.unmount();
  });
});

describe('Price — invalid currency', () => {
  it('renders without throwing for an unrecognised ISO 4217 code', () => {
    expect(() =>
      mountWith(Price, { props: { amount: 123456, currency: 'XYZ1', locale: 'en-US' } })
    ).not.toThrow();
  });

  it('falls back to a plain decimal number with the raw code appended', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 123456, currency: 'XYZ1', locale: 'en-US' },
    });
    const expectedNumber = new Intl.NumberFormat('en-US').format(1234.56);
    expect(wrapper.get('[data-part="current"]').text()).toBe(`${expectedNumber} XYZ1`);
    wrapper.unmount();
  });

  it('falls back the same way for an empty currency string', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, currency: '', locale: 'en-US' } });
    const expectedNumber = new Intl.NumberFormat('en-US').format(48);
    // `.text()` trims trailing whitespace, so an empty code's trailing separator space is not
    // visible here; the raw text content still carries it (the fallback shape is unconditional).
    expect(wrapper.get('[data-part="current"]').text()).toBe(expectedNumber);
    expect(wrapper.get('[data-part="current"]').element.textContent).toBe(`${expectedNumber} `);
    wrapper.unmount();
  });

  it('warns in dev, naming the bad code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Price, {
      props: { amount: 100, currency: 'XYZ1', locale: 'en-US' },
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('XYZ1');
    wrapper.unmount();
  });

  it('does not repeat the warning while the same instance keeps the same bad code', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Price, {
      props: { amount: 100, currency: 'XYZ1', locale: 'en-US' },
    });
    expect(warn).toHaveBeenCalledTimes(1);
    // A prop change that leaves `currency` untouched must not re-run the currency formatter, so
    // it cannot re-warn either — proving the guard is not merely "always warn once ever".
    await wrapper.setProps({ amount: 999 });
    expect(warn).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('warns again for a different bad code on the same instance', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Price, {
      props: { amount: 100, currency: 'XYZ1', locale: 'en-US' },
    });
    expect(warn).toHaveBeenCalledTimes(1);
    await wrapper.setProps({ currency: 'ABC2' });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[1]?.[0])).toContain('ABC2');
    wrapper.unmount();
  });

  it('does not warn for a valid currency code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(Price, {
      props: { amount: 4800, currency: 'USD', locale: 'en-US' },
    });
    expect(warn).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('leaves a valid currency formatted normally, with no code appended', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 4800, currency: 'USD', locale: 'en-US' },
    });
    expect(wrapper.get('[data-part="current"]').text()).toBe('$48.00');
    wrapper.unmount();
  });

  it('applies the same fallback to compareAt and the unit-price line', () => {
    const wrapper = mountWith(Price, {
      props: {
        amount: 123456,
        compareAt: 150000,
        currency: 'XYZ1',
        locale: 'en-US',
        unitPrice: { amount: 5000, per: '100 g' },
      },
    });
    expect(wrapper.get('[data-part="compareAt"]').text()).toContain('XYZ1');
    expect(wrapper.get('[data-part="unit"]').text()).toContain('XYZ1');
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

  it('renders exactly two visually hidden srText spans, in Sale-then-Regular order', () => {
    const wrapper = mountWith(Price, { props: { amount: 3840, compareAt: 4800 } });
    const labels = wrapper.findAll('[data-part="srText"]');
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
    const labels = wrapper.findAll('[data-part="srText"]');
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

  it("is 35% wide, per the spec's Loading row, not a fixed width", () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, loading: true } });
    const classes = wrapper.get('[data-part="skeleton"]').classes();
    expect(classes).toContain('w-[35%]');
    expect(classes).not.toContain('w-14');
    wrapper.unmount();
  });

  it('gives the root a definite width while loading, so the 35% skeleton has something to resolve against', () => {
    const loading = mountWith(Price, { props: { amount: 4800, loading: true } });
    expect(loading.classes()).toContain('w-full');
    loading.unmount();

    const regular = mountWith(Price, { props: { amount: 4800 } });
    expect(regular.classes()).not.toContain('w-full');
    regular.unmount();
  });

  it("keeps the skeleton's height tied to the current type size", () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, loading: true } });
    expect(wrapper.get('[data-part="skeleton"]').classes()).toContain('h-[0.85em]');
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
    expect(wrapper.find('[data-part="srText"]').exists()).toBe(false);
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
        classes: { root: 'gap-x-4', current: 'uppercase', compareAt: 'italic', srText: 'italic' },
      },
    });
    expect(wrapper.classes()).toContain('gap-x-4');
    expect(wrapper.get('[data-part="current"]').classes()).toContain('uppercase');
    expect(wrapper.get('[data-part="compareAt"]').classes()).toContain('italic');
    expect(wrapper.get('[data-part="srText"]').classes()).toContain('italic');
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

/**
 * The refresh state a prerendered storefront needs: the built-in value stays on screen while a
 * live one is fetched, dimmed, with a small spinner beside it — never a skeleton, never a value
 * that moves. `loading` (the skeleton) still wins when both are set.
 */
describe('Price — revalidating', () => {
  it('keeps the value, marks the root busy and draws a spinner', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 4800, currency: 'USD', locale: 'en-US', revalidating: true },
    });
    expect(wrapper.get('[data-part="current"]').text()).toBe('$48.00');
    expect(wrapper.find('[data-part="spinner"]').exists()).toBe(true);
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.find('[data-part="skeleton"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders exactly the visible text a plain price renders, so nothing reflows', () => {
    const props = { amount: 3840, compareAt: 4800, currency: 'USD', locale: 'en-US' } as const;
    const plain = mountWith(Price, { props });
    const busy = mountWith(Price, { props: { ...props, revalidating: true } });
    expect(visibleText(busy)).toBe(visibleText(plain));
    // The spinner is the only element revalidating adds to the visible row, and it contributes no
    // text of its own and no width: it is absolutely positioned outside the root's own box.
    const spinner = busy.get('[data-part="spinner"]');
    expect(spinner.text()).toBe('');
    expect(spinner.attributes('aria-hidden')).toBe('true');
    // Zero width, with the negative inline-start margin that cancels the root's own gap: the
    // spinner is drawn in the space after the value without reserving any of it.
    expect(spinner.classes()).toContain('w-0');
    expect(spinner.get('svg').classes()).toContain('absolute');
    plain.unmount();
    busy.unmount();
  });

  it('dims every value part through the revalidating opacity token', () => {
    const wrapper = mountWith(Price, {
      props: {
        amount: 1530,
        compareAt: 1800,
        from: true,
        unitPrice: { amount: 510, per: '100 g' },
        revalidating: true,
      },
    });
    for (const part of ['current', 'compareAt', 'from', 'unit']) {
      expect(wrapper.get(`[data-part="${part}"]`).classes(), part).toContain('eldra-revalidating');
    }
    // The spinner is the state's own signal and stays at full strength.
    expect(wrapper.get('[data-part="spinner"]').classes()).not.toContain('eldra-revalidating');
    wrapper.unmount();
  });

  it('draws no spinner, no busy flag and no dimming when it is not revalidating', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, compareAt: 6000 } });
    expect(wrapper.find('[data-part="spinner"]').exists()).toBe(false);
    expect(wrapper.attributes('aria-busy')).toBeUndefined();
    expect(wrapper.get('[data-part="current"]').classes()).not.toContain('eldra-revalidating');
    wrapper.unmount();
  });

  it('lets loading win when both are set', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 4800, loading: true, revalidating: true },
    });
    expect(wrapper.find('[data-part="skeleton"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="spinner"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="current"]').exists()).toBe(false);
    expect(wrapper.attributes('aria-busy')).toBeUndefined();
    wrapper.unmount();
  });

  it('announces the refresh in a visually hidden polite live region', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, revalidating: true } });
    const status = wrapper.get('[data-part="srStatus"]');
    expect(status.text()).toBe('Updating price');
    expect(status.attributes('aria-live')).toBe('polite');
    expect(status.classes()).toContain('sr-only');
    wrapper.unmount();
  });

  /**
   * The live region is in the DOM before it has anything to say, and empties again afterwards:
   * a region inserted together with its text is announced unreliably, because a screen reader
   * registers the region and its content in the same pass.
   */
  it('keeps the live region mounted and empty while it is not revalidating', async () => {
    const wrapper = mountWith(Price, { props: { amount: 4800 } });
    expect(wrapper.get('[data-part="srStatus"]').text()).toBe('');
    await wrapper.setProps({ revalidating: true });
    expect(wrapper.get('[data-part="srStatus"]').text()).toBe('Updating price');
    await wrapper.setProps({ revalidating: false });
    expect(wrapper.get('[data-part="srStatus"]').text()).toBe('');
    wrapper.unmount();
  });

  it('reads the refresh message from the catalogue', () => {
    const Wrapped = defineComponent({
      setup() {
        provideEldraUiMessages(isIS);
        return () =>
          h(Price, { amount: 6990, currency: 'ISK', locale: 'is-IS', revalidating: true });
      },
    });
    const wrapper = mountWith(Wrapped);
    expect(wrapper.get('[data-part="srStatus"]').text()).toBe(isIS.updatingPrice);
    wrapper.unmount();
  });

  /** Reduced motion: the spinner pulses instead of turning, the same pair `Button` uses. */
  it('turns the spinner, and pulses it under reduced motion', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, revalidating: true } });
    const svg = wrapper.get('[data-part="spinner"] svg');
    expect(svg.classes()).toContain('animate-eldra-spin');
    expect(svg.classes()).toContain('motion-reduce:animate-eldra-pulse');
    wrapper.unmount();
  });

  /**
   * `announce: false` is for a page that says it once itself — a refreshing grid of 24 cards would
   * otherwise hold 48 polite regions, each announcing separately. The visual state and `aria-busy`
   * are unchanged; only the sentence goes.
   */
  it('renders no live region at all when announce is off, and stays busy', () => {
    const wrapper = mountWith(Price, {
      props: { amount: 4800, revalidating: true, announce: false },
    });
    expect(wrapper.find('[data-part="srStatus"]').exists()).toBe(false);
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.find('[data-part="spinner"]').exists()).toBe(true);
    expect(wrapper.get('[data-part="current"]').classes()).toContain('eldra-revalidating');
    wrapper.unmount();
  });

  it('announces by default, with no announce prop given', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, revalidating: true } });
    expect(wrapper.get('[data-part="srStatus"]').text()).toBe('Updating price');
    wrapper.unmount();
  });

  it('drops the live region when announce is off even before there is anything to say', () => {
    const wrapper = mountWith(Price, { props: { amount: 4800, announce: false } });
    expect(wrapper.find('[data-part="srStatus"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('has no axe violations while revalidating', async () => {
    const wrapper = mountWith(Price, {
      props: { amount: 3840, compareAt: 4800, revalidating: true },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('renders inside a narrow container while revalidating', () => {
    const wrapper = mountNarrow(Price, {
      props: { amount: 1530, compareAt: 1800, from: true, revalidating: true },
    });
    expect(wrapper.get('[data-part="current"]').text()).toBe('$15.30');
    wrapper.unmount();
  });
});
