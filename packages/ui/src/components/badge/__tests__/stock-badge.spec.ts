import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { provideEldraUiMessages } from '../../../composables/useMessages';
import { isIS } from '../../../messages/is-IS';
import StockBadge from '../StockBadge.vue';
import type { StockLevel } from '../types';
import { defineComponent, h } from 'vue';

const LEVELS: StockLevel[] = ['in', 'low', 'out', 'preorder'];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('StockBadge — element and parts', () => {
  it('names every part in the spec anatomy', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'in' } });
    for (const part of ['root', 'icon', 'label']) {
      expect(wrapper.find(`[data-part="${part}"]`).exists()).toBe(true);
    }
    wrapper.unmount();
  });

  it('draws no container fill, only text and an icon', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'in' } });
    const classes = wrapper.classes().join(' ');
    expect(classes).not.toMatch(/\bbg-/);
    wrapper.unmount();
  });

  it('hides the icon from assistive technology', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'out' } });
    expect(wrapper.get('[data-part="icon"]').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });
});

describe('StockBadge — default copy per level', () => {
  it('reads the in-stock default', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'in' } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('In stock, ships in 1–2 days');
    wrapper.unmount();
  });

  it('reads the low-stock default with the quantity', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'low', quantity: 3 } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Low stock: only 3 left');
    wrapper.unmount();
  });

  it('drops the count when quantity is not given', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'low' } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Low stock');
    wrapper.unmount();
  });

  it('reads the sold-out default', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'out' } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Sold out');
    wrapper.unmount();
  });

  it('reads the pre-order default with no date', () => {
    const wrapper = mountWith(StockBadge, { props: { level: 'preorder' } });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Pre-order');
    wrapper.unmount();
  });

  it('overrides the default copy entirely with `message`', () => {
    const wrapper = mountWith(StockBadge, {
      props: { level: 'preorder', message: 'Pre-order, ships 14 Nov' },
    });
    expect(wrapper.get('[data-part="label"]').text()).toBe('Pre-order, ships 14 Nov');
    wrapper.unmount();
  });

  it('reads the Icelandic catalogue when provided', () => {
    const Wrapped = defineComponent({
      setup() {
        provideEldraUiMessages(isIS);
        return () => h(StockBadge, { level: 'low', quantity: 1 });
      },
    });
    const wrapper = mountWith(Wrapped);
    expect(wrapper.get('[data-part="label"]').text()).toBe('Lítið til: aðeins 1 eintak eftir');
    wrapper.unmount();
  });
});

describe('StockBadge — colour and icon per level', () => {
  it.each([
    ['in', 'text-success'],
    ['low', 'text-warning'],
    ['out', 'text-danger'],
    ['preorder', 'text-muted'],
  ] as Array<[StockLevel, string]>)('colours %s with %s', (level, expected) => {
    const wrapper = mountWith(StockBadge, { props: { level } });
    expect(wrapper.classes()).toContain(expected);
    wrapper.unmount();
  });

  it('renders a different icon path per level', () => {
    const paths = LEVELS.map((level) => {
      const wrapper = mountWith(StockBadge, { props: { level } });
      const d = wrapper
        .findAll('[data-part="icon"] path')
        .map((p) => p.attributes('d'))
        .join('|');
      wrapper.unmount();
      return d;
    });
    expect(new Set(paths).size).toBe(LEVELS.length);
  });
});

describe('StockBadge — content', () => {
  it('renders inside a narrow container', () => {
    const wrapper = mountNarrow(StockBadge, { props: { level: 'low', quantity: 3 } });
    expect(wrapper.text()).toContain('Low stock');
    wrapper.unmount();
  });
});

describe('StockBadge — accessibility', () => {
  it.each(LEVELS)('has no axe violations for level %s', async (level) => {
    const wrapper = mountWith(StockBadge, { props: { level, quantity: 3 } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
