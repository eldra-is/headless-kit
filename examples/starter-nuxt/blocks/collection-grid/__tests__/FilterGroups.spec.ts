// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';
import FilterGroups from '../parts/FilterGroups.vue';
import { sanitizeAmount, type FilterGroup } from '../parts/groups';

/** Fourteen sizes, which is past the "12 or more values" threshold the spec collapses at. */
const MANY_SIZES: FilterGroup = {
  source: 'option:size',
  label: 'Size',
  kind: 'size',
  collapsed: false,
  legend: 'Size',
  values: Array.from({ length: 14 }, (_, index) => ({
    value: `s${index}`,
    label: `S${index}`,
    count: index + 1,
  })),
};

const PRICE: FilterGroup = {
  source: 'price',
  label: 'Price',
  kind: 'price',
  collapsed: false,
  legend: 'Price range in US dollars',
  values: [],
};

const CATEGORY: FilterGroup = {
  source: 'category',
  label: 'Category',
  kind: 'checkbox',
  collapsed: true,
  legend: 'Category',
  values: [
    { value: 'knitwear', label: 'Knitwear', count: 18 },
    { value: 'ceramics', label: 'Ceramics', count: 14 },
  ],
};

function mountGroups(
  groups: FilterGroup[],
  overrides: Partial<{
    selection: Record<string, string[]>;
    min: string;
    max: string;
    dense: boolean;
  }> = {},
  mountExtras: { attachTo?: Element } = {}
) {
  // `mountOptions` carries the locale/messages/storefront provides every block subtree needs; the
  // `entry` prop it builds is for a `Block.vue` and is simply unused by this part.
  const base = mountOptions({ entry: { id: 'e1', data: {} } });
  // Each group trigger's chevron is an `EldraIcon`, which resolves through `useEldraIcon` — outside
  // Nuxt that needs an injected fetcher (the same synchronous, network-free stub every other spec
  // that renders an icon by name uses).
  base.global.provide[ICON_FETCHER_KEY] = stubFetcher;
  return mount(FilterGroups, {
    props: {
      groups,
      selection: overrides.selection ?? {},
      min: overrides.min ?? '',
      max: overrides.max ?? '',
      idPrefix: 'grid-test',
      dense: overrides.dense ?? false,
    },
    global: base.global,
    ...mountExtras,
  });
}

const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

describe('collection-grid filter groups', () => {
  it('is axe-clean with all four kinds of group rendered', async () => {
    const wrapper = mountGroups([
      CATEGORY,
      MANY_SIZES,
      {
        source: 'option:colour',
        label: 'Colour',
        kind: 'colour',
        collapsed: false,
        legend: 'Colour',
        values: [{ value: 'oat', label: 'Oat', count: 9, swatch: '#d8cbb0' }],
      },
      PRICE,
    ]);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  describe('a group with 12 or more values', () => {
    it('shows the first 8 behind a "Show all 14" button, then all 14', async () => {
      const wrapper = mountGroups([MANY_SIZES]);
      expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(8);

      const showAll = wrapper.findAll('button').find((b) => b.text().includes('Show all 14'))!;
      expect(showAll).toBeTruthy();
      await showAll.trigger('click');

      expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(14);
      expect(wrapper.findAll('button').some((b) => b.text().includes('Show all'))).toBe(false);
    });

    it('shows every value outright when there are fewer than 12', () => {
      const wrapper = mountGroups([CATEGORY], { selection: { category: ['knitwear'] } });
      expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2);
      expect(wrapper.findAll('button').some((b) => b.text().includes('Show all'))).toBe(false);
    });
  });

  describe('the price range', () => {
    it('keeps only digits, drops leading zeroes and caps the length', () => {
      expect(sanitizeAmount('180')).toBe('180');
      expect(sanitizeAmount('$1 80')).toBe('180');
      expect(sanitizeAmount('12a3')).toBe('123');
      expect(sanitizeAmount('0180')).toBe('180');
      expect(sanitizeAmount('0')).toBe('0');
      expect(sanitizeAmount('')).toBe('');
      expect(sanitizeAmount('abc')).toBe('');
      expect(sanitizeAmount('1234567890123')).toBe('123456789');
    });

    it('emits the sanitised Min and Max, never the raw keystroke', async () => {
      const wrapper = mountGroups([PRICE]);
      const inputs = wrapper.findAll('input');
      expect(inputs).toHaveLength(2);

      await inputs[0]!.setValue('$0');
      await inputs[1]!.setValue('18o0');

      expect(wrapper.emitted('update:min')).toEqual([['0']]);
      expect(wrapper.emitted('update:max')).toEqual([['180']]);
    });
  });

  describe('the disclosure', () => {
    it('starts closed when the field says so, and open as soon as the group has a value', () => {
      const closed = mountGroups([CATEGORY]);
      expect(closed.get('button[aria-expanded]').attributes('aria-expanded')).toBe('false');

      const open = mountGroups([CATEGORY], { selection: { category: ['knitwear'] } });
      expect(open.get('button[aria-expanded]').attributes('aria-expanded')).toBe('true');
    });

    it('a trigger controls its own fieldset panel, which carries a visually hidden legend', () => {
      const wrapper = mountGroups([CATEGORY, PRICE]);
      const triggers = wrapper.findAll('button[aria-expanded]');
      expect(triggers).toHaveLength(2);
      for (const trigger of triggers) {
        const panelId = trigger.attributes('aria-controls')!;
        const panel = wrapper.get(`#${panelId}`);
        expect(panel.element.tagName).toBe('FIELDSET');
        expect(panel.get('legend').classes()).toContain('sr-only');
      }
      // The trigger is a button inside an h3, so the groups are part of the page outline.
      expect(triggers[0]!.element.parentElement?.tagName).toBe('H3');
    });

    it('Esc inside an open group collapses it and returns focus to its trigger', async () => {
      const wrapper = mountGroups([MANY_SIZES], {}, { attachTo: document.body });
      const trigger = wrapper.get('button[aria-expanded]');
      expect(trigger.attributes('aria-expanded')).toBe('true');

      await wrapper.get('fieldset').trigger('keydown', { key: 'Escape' });

      expect(trigger.attributes('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger.element);
      wrapper.unmount();
    });
  });
});
