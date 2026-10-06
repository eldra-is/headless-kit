// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
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
  legend: 'Price range in USD',
  values: [],
  slider: true,
};

/** The same group with the block's `priceSlider` off: the two typed fields alone. */
const PRICE_FIELDS: FilterGroup = { ...PRICE, slider: false };

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

/** The `collection` source, which reads the facets' `collections` terms. */
const COLLECTION: FilterGroup = {
  source: 'collection',
  label: 'Collection',
  kind: 'checkbox',
  collapsed: false,
  legend: 'Collection',
  values: [
    { value: 'the-winter-edit', label: 'The winter edit', count: 48 },
    { value: 'best-sellers', label: 'Best sellers', count: 24 },
    // Nothing left under the other filters: offered, disabled, never hidden.
    { value: 'archive', label: 'Archive', count: 0, disabled: true },
  ],
};

/**
 * A `category` group the store answers as a **tree**: `Tableware` over `Cup` and `Bowl` (one of them
 * with nothing left under the other filters), beside `Blankets` — a root with no children at all.
 * `Tableware`'s count is the roll-up `nestCategoryTerms` computed; the parent is assigned nothing
 * directly.
 */
const NESTED_CATEGORY: FilterGroup = {
  source: 'category',
  label: 'Category',
  kind: 'checkbox',
  collapsed: false,
  legend: 'Category',
  values: [
    { value: 'blankets', label: 'Blankets', count: 3 },
    { value: 'tableware', label: 'Tableware', count: 10 },
    { value: 'cup', label: 'Cup', count: 6, parent: 'tableware' },
    { value: 'bowl', label: 'Bowl', count: 0, parent: 'tableware', disabled: true },
  ],
};

/** The same tree with `Tableware` ticked: the request carries the parent and the platform expands it,
 *  so both children are implied rather than filters of their own (`groupValuesFor`). */
const NESTED_CATEGORY_PARENT_TICKED: FilterGroup = {
  ...NESTED_CATEGORY,
  values: [
    { value: 'blankets', label: 'Blankets', count: 3 },
    { value: 'tableware', label: 'Tableware', count: 10 },
    { value: 'cup', label: 'Cup', count: 6, parent: 'tableware', implied: true, disabled: true },
    { value: 'bowl', label: 'Bowl', count: 0, parent: 'tableware', implied: true, disabled: true },
  ],
};

/** The collection's own bounds, which is what the slider spans (spec: "not 0 and a round
 *  number"). */
const SPAN = { min: 24, max: 180 };

function mountGroups(
  groups: FilterGroup[],
  overrides: Partial<{
    selection: Record<string, string[]>;
    min: string;
    max: string;
    dense: boolean;
    priceStep: number;
    currency: string;
  }> = {},
  mountExtras: { attachTo?: Element; locale?: string } = {}
) {
  // `mountOptions` carries the locale/messages/storefront provides every block subtree needs; the
  // `entry` prop it builds is for a `Block.vue` and is simply unused by this part. The `locale` is
  // the one the money fields parse and format against — `CurrencyInput` reads it off the ambient
  // provide, so a spec about a zero-decimal currency sets it here rather than on the control.
  const base = mountOptions({ entry: { id: 'e1', data: {} } }, { locale: mountExtras.locale });
  // What the store sells in, for the two `CurrencyInput`s the price group's fields are. `in`
  // rather than `??`, so a spec can force `currency: undefined` — a store with no published
  // currency — rather than always falling back to the default.
  const currency = 'currency' in overrides ? overrides.currency : 'USD';
  // Each group trigger's chevron is an `EldraIcon`, which resolves through `useEldraIcon` — outside
  // Nuxt that needs an injected fetcher (the same synchronous, network-free stub every other spec
  // that renders an icon by name uses).
  return mount(FilterGroups, {
    props: {
      groups,
      selection: overrides.selection ?? {},
      min: overrides.min ?? '',
      max: overrides.max ?? '',
      priceSpan: SPAN,
      priceStep: overrides.priceStep ?? 1,
      // The real `money.format` this stands in for prints a plain decimal with no sign at all
      // once a store has no currency (`app/storefront/money.ts`'s "never guessed" rule) — never a
      // hard-coded symbol regardless of currency, which is what made a thumb announce "$1,200" on
      // a store that sells in nothing yet.
      formatPrice: (amount: number) => (currency === undefined ? `${amount}` : `$${amount}`),
      currency,
      idPrefix: 'grid-test',
      dense: overrides.dense ?? false,
    },
    global: base.global,
    ...(mountExtras.attachTo === undefined ? {} : { attachTo: mountExtras.attachTo }),
  });
}

const thumbs = (wrapper: ReturnType<typeof mountGroups>) => wrapper.findAll('[role="slider"]');

describe('collection-grid filter groups', () => {
  it('is axe-clean with every kind of group rendered', async () => {
    const wrapper = mountGroups([
      CATEGORY,
      COLLECTION,
      MANY_SIZES,
      {
        source: 'option:colour',
        label: 'Colour',
        kind: 'colour',
        collapsed: false,
        legend: 'Colour',
        values: [
          { value: 'oat', label: 'Oat', count: 9, swatch: '#d8cbb0' },
          { value: 'clay', label: 'Clay', count: 0, swatch: '#b5651d', disabled: true },
        ],
      },
      PRICE,
    ]);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('is axe-clean with the price group’s two-field fallback instead of the slider', async () => {
    const wrapper = mountGroups([PRICE_FIELDS]);
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

  /**
   * The `collection` source (contract §4): the same checkbox group `category` is, fed by the
   * facets' own `collections` terms — and the place the "count 0 is disabled, not hidden" rule is
   * easiest to see, since a narrowing filter is exactly what zeroes a collection.
   */
  describe('the collection group', () => {
    it('renders one checkbox per collection term with its count', () => {
      const wrapper = mountGroups([COLLECTION]);
      const panel = wrapper.get('fieldset');
      expect(panel.text()).toContain('The winter edit (48)');
      expect(panel.text()).toContain('Best sellers (24)');
      expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(3);
    });

    it('toggles the source and the value the block filters by', async () => {
      const wrapper = mountGroups([COLLECTION]);
      await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true);
      expect(wrapper.emitted('toggle')).toEqual([['collection', 'best-sellers', true]]);
    });
  });

  describe('a value nothing is left for', () => {
    it('offers it disabled rather than hiding it', () => {
      const wrapper = mountGroups([COLLECTION]);
      const boxes = wrapper.findAll('input[type="checkbox"]');
      expect(boxes[2]!.attributes('disabled')).toBeDefined();
      expect(boxes[0]!.attributes('disabled')).toBeUndefined();
      // Still readable, still counted: the shopper can see why it is unavailable.
      expect(wrapper.get('fieldset').text()).toContain('Archive (0)');
    });

    it('disables a colour dot’s own checkbox and dims its row', () => {
      const wrapper = mountGroups([
        {
          source: 'option:colour',
          label: 'Colour',
          kind: 'colour',
          collapsed: false,
          legend: 'Colour',
          values: [
            { value: 'oat', label: 'Oat', count: 9, swatch: '#d8cbb0' },
            { value: 'clay', label: 'Clay', count: 0, swatch: '#b5651d', disabled: true },
          ],
        },
      ]);
      const rows = wrapper.findAll('label');
      expect(rows[1]!.classes()).toContain('cursor-not-allowed');
      expect(rows[1]!.get('input').attributes('disabled')).toBeDefined();
      expect(rows[0]!.classes()).toContain('cursor-pointer');
      expect(rows[0]!.get('input').attributes('disabled')).toBeUndefined();
    });
  });

  /**
   * The price group, with the slider on (the default) and off. What matters either way is that the
   * control writes **one** committed range — the block turns that into one request and one URL
   * write — and that a figure can always be typed exactly (spec Accessibility: "Dragging a thumb
   * is never the only way to set a price").
   */
  describe('the price range slider', () => {
    it('spans the collection’s own bounds, with both thumbs at an end when nothing is filtered', () => {
      const wrapper = mountGroups([PRICE]);
      const [min, max] = thumbs(wrapper);
      expect(min!.attributes('aria-valuenow')).toBe('24');
      expect(max!.attributes('aria-valuenow')).toBe('180');
      // The thumbs' own limits are the span and each other, and the spoken value is money.
      expect(min!.attributes('aria-valuemin')).toBe('24');
      expect(min!.attributes('aria-valuemax')).toBe('180');
      expect(min!.attributes('aria-valuetext')).toBe('$24');
      expect(min!.attributes('aria-label')).toBe('Minimum price');
      expect(max!.attributes('aria-label')).toBe('Maximum price');
    });

    it('starts from the shopper’s own bounds when the URL carried some', () => {
      const wrapper = mountGroups([PRICE], { min: '50', max: '150' });
      const [min, max] = thumbs(wrapper);
      expect(min!.attributes('aria-valuenow')).toBe('50');
      expect(max!.attributes('aria-valuenow')).toBe('150');
    });

    it('commits a typed figure on Enter, as one range, and never on a keystroke', async () => {
      const wrapper = mountGroups([PRICE]);
      const field = wrapper.get('input[data-input="min"]');

      await field.setValue('96');
      expect(wrapper.emitted('update:range')).toBeUndefined();

      await field.trigger('keydown', { key: 'Enter' });
      expect(wrapper.emitted('update:range')).toEqual([[{ min: '96', max: '' }]]);
    });

    it('commits a typed figure on blur too', async () => {
      const wrapper = mountGroups([PRICE]);
      const field = wrapper.get('input[data-input="max"]');
      await field.trigger('focus');
      await field.setValue('150');
      await field.trigger('blur');
      expect(wrapper.emitted('update:range')).toEqual([[{ min: '', max: '150' }]]);
    });

    it('clamps a typed figure to the collection’s bounds and to the other thumb', async () => {
      const wrapper = mountGroups([PRICE]);
      const field = wrapper.get('input[data-input="max"]');
      await field.trigger('focus');
      // Below the cheapest product, and below the minimum thumb: the maximum parks on it.
      await field.setValue('9');
      await field.trigger('keydown', { key: 'Enter' });
      expect(wrapper.emitted('update:range')).toEqual([[{ min: '', max: '24' }]]);
      expect(thumbs(wrapper)[1]!.attributes('aria-valuenow')).toBe('24');
    });

    /**
     * **A typed figure that snaps onto the thumb it started from.** `commit` returns the number it
     * actually applied — snapped to the step grid, clamped to the span — and that return is what a
     * controlled field must show, because `setThumb` writes nothing (and `change` never fires) when
     * the clamped result equals the thumb's current value. With a step the typed figure does not
     * land on, discarding that return left the field showing the untouched keystroke forever, with
     * no `update:range` to show for it.
     */
    it('shows the commit’s own clamped figure, not the typed one, when it snaps onto the unchanged thumb', async () => {
      const wrapper = mountGroups([PRICE], { priceStep: 10 });
      const field = wrapper.get('input[data-input="min"]');
      expect((field.element as HTMLInputElement).value).toBe('$24');

      await field.setValue('26');
      await field.trigger('keydown', { key: 'Enter' });

      // 26 snaps onto the grid's nearest stop, 24 — the thumb's own value already — so nothing
      // moved and nothing was written.
      expect(wrapper.emitted('update:range')).toBeUndefined();
      expect(thumbs(wrapper)[0]!.attributes('aria-valuenow')).toBe('24');
      expect((field.element as HTMLInputElement).value).toBe('$24');
    });

    it('moves a thumb by the step from the keyboard, and reports it once the run ends', async () => {
      const wrapper = mountGroups([PRICE], { priceStep: 10 });
      const min = thumbs(wrapper)[0]!;
      await min.trigger('keydown', { key: 'ArrowRight' });
      await min.trigger('keydown', { key: 'ArrowRight' });
      // Mid-run the value moves but nothing is applied: one URL write per gesture.
      expect(min.attributes('aria-valuenow')).toBe('44');
      expect(wrapper.emitted('update:range')).toBeUndefined();

      await min.trigger('keyup', { key: 'ArrowRight' });
      expect(wrapper.emitted('update:range')).toEqual([[{ min: '44', max: '' }]]);
    });

    it('reads a thumb back to "no bound" when it is dragged out to the end', async () => {
      const wrapper = mountGroups([PRICE], { min: '50', priceStep: 10 });
      const min = thumbs(wrapper)[0]!;
      await min.trigger('keydown', { key: 'Home' });
      await min.trigger('keyup', { key: 'Home' });
      expect(wrapper.emitted('update:range')).toEqual([[{ min: '', max: '' }]]);
    });

    it('is reachable by keyboard: both thumbs are tab stops, and both fields are named', () => {
      const wrapper = mountGroups([PRICE]);
      const pair = thumbs(wrapper);
      expect(pair).toHaveLength(2);
      for (const thumb of pair) expect(thumb.attributes('tabindex')).toBe('0');
      expect(wrapper.get('input[data-input="min"]').attributes('aria-label')).toBe('Minimum price');
      expect(wrapper.get('input[data-input="max"]').attributes('aria-label')).toBe('Maximum price');
    });
  });

  describe('the price range’s two-field fallback', () => {
    it('renders the two fields and no slider at all when `slider` is off', () => {
      const wrapper = mountGroups([PRICE_FIELDS]);
      expect(thumbs(wrapper)).toHaveLength(0);
      expect(wrapper.findAll('input')).toHaveLength(2);
    });

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

    /**
     * The fields are the store's own money fields, so what reaches the range is the **number
     * `CurrencyInput` parsed**, not the characters that were typed: a sign, a grouping mark or a
     * stray letter never leave the control, and the theme's whole-unit grammar is what comes out.
     *
     * It commits on blur or `Enter` like the slider's own fields, not per keystroke — a money field
     * reformats as it is typed, and a request per character is a request per character.
     */
    it('commits the parsed figure on blur, never on a keystroke', async () => {
      const wrapper = mountGroups([PRICE_FIELDS]);
      const inputs = wrapper.findAll('input[data-input]');
      expect(inputs).toHaveLength(2);

      await inputs[0]!.setValue('$50');
      await inputs[1]!.setValue('1,250');
      expect(wrapper.emitted('update:range')).toBeUndefined();

      await inputs[1]!.trigger('blur');
      expect(wrapper.emitted('update:range')).toEqual([[{ min: '50', max: '1250' }]]);
    });

    it('commits on Enter too', async () => {
      const wrapper = mountGroups([PRICE_FIELDS]);
      const min = wrapper.get('input[data-input="min"]');
      await min.setValue('96');
      await min.trigger('keydown', { key: 'Enter' });
      expect(wrapper.emitted('update:range')).toEqual([[{ min: '96', max: '' }]]);
    });

    /**
     * **A zero-decimal currency.** ISK has no minor unit, so a typed `2.800` is two thousand eight
     * hundred krónur — the dot is that locale's *grouping* mark, not a decimal point. A generic
     * numeric field read it as 2.8 and sent `price=3`; the money field parses it against the store's
     * own locale and currency, which is the whole reason these are `CurrencyInput`s.
     */
    it('parses a zero-decimal currency in its own locale', async () => {
      const wrapper = mountGroups([PRICE_FIELDS], { currency: 'ISK' }, { locale: 'is-IS' });
      const min = wrapper.get('input[data-input="min"]');
      await min.setValue('2.800');
      await min.trigger('blur');
      expect(wrapper.emitted('update:range')).toEqual([[{ min: '2800', max: '' }]]);
    });

    /** And the theme's grammar is whole units either way: a dollar store's cents are not carried by
     *  the URL, so a typed `49.99` commits as 50 rather than offering a precision nothing keeps. */
    it('rounds a dollar amount to the whole units the URL carries', async () => {
      const wrapper = mountGroups([PRICE_FIELDS]);
      const min = wrapper.get('input[data-input="min"]');
      await min.setValue('49.99');
      await min.trigger('blur');
      expect(wrapper.emitted('update:range')).toEqual([[{ min: '50', max: '' }]]);
    });

    it('is axe-clean with the two money fields', async () => {
      expect(await axe(mountGroups([PRICE_FIELDS]).element)).toHaveNoViolations();
    });
  });

  /**
   * A store that has published no currency at all (`currency: undefined`, the same `undefined`
   * every bare `<Price>` on the page gets). `CurrencyInput`'s own `currency` prop defaults to
   * `'USD'`, so handing it `undefined` would print a dollar sign nobody chose — this group must
   * never do that, in either shape of the price group.
   */
  describe('a store with no published currency', () => {
    it('falls back to the slider’s own generic fields rather than a CurrencyInput guessing $', () => {
      const wrapper = mountGroups([PRICE], { currency: undefined });
      const fields = wrapper.findAll('input[data-input]');
      expect(fields).toHaveLength(2);
      for (const field of fields) {
        expect((field.element as HTMLInputElement).value).not.toContain('$');
      }
      // The built-in field, not a replacement: plain digits, the collection's own bound.
      expect((fields[0]!.element as HTMLInputElement).value).toBe('24');
    });

    it('falls back to a plain Input rather than a CurrencyInput guessing $', () => {
      const wrapper = mountGroups([PRICE_FIELDS], { currency: undefined, min: '50', max: '150' });
      const fields = wrapper.findAll('input[data-input]');
      expect(fields).toHaveLength(2);
      expect((fields[0]!.element as HTMLInputElement).value).toBe('50');
      expect((fields[1]!.element as HTMLInputElement).value).toBe('150');
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
  /**
   * A `category` family the store answers as a tree. The nesting is a `role="group"` named after the
   * parent around the children's own checkboxes — **not** a tree widget: every row stays an ordinary
   * checkbox in source order, so there is no new tab stop and nothing about `Tab`, `Esc` or "Show
   * all 14" changes.
   */
  describe('a nested category group', () => {
    it('is axe-clean, nested group and implied children alike', async () => {
      expect(await axe(mountGroups([NESTED_CATEGORY]).element)).toHaveNoViolations();
      expect(await axe(mountGroups([NESTED_CATEGORY_PARENT_TICKED]).element)).toHaveNoViolations();
    });

    it('wraps a parent’s children in a group named after the parent', () => {
      const wrapper = mountGroups([NESTED_CATEGORY]);
      const groups = wrapper.findAll('[role="group"]');
      expect(groups).toHaveLength(1);
      expect(groups[0]!.attributes('aria-label')).toBe('Under Tableware');
      expect(groups[0]!.findAll('label').map((label) => label.text().replace(/\s+/g, ' '))).toEqual(
        ['Cup (6)', 'Bowl (0)']
      );
    });

    /** A root with no children draws no group at all — a flat family is one with nothing nested. */
    it('draws no group for a row with no children', () => {
      const wrapper = mountGroups([CATEGORY]);
      expect(wrapper.findAll('[role="group"]')).toHaveLength(0);
    });

    /** Every row is still one checkbox, in the order it was handed over: a parent, then its children,
     *  then the next row. Nothing is added to the tab order by the nesting. */
    it('keeps every row an ordinary checkbox in source order', () => {
      const wrapper = mountGroups([NESTED_CATEGORY]);
      const boxes = wrapper.findAll('input[type="checkbox"]');
      expect(boxes).toHaveLength(4);
      expect(boxes.every((box) => box.attributes('tabindex') === undefined)).toBe(true);
      expect(wrapper.findAll('label').map((label) => label.text().replace(/\s+/g, ' '))).toEqual([
        'Blankets (3)',
        'Tableware (10)',
        'Cup (6)',
        'Bowl (0)',
      ]);
    });

    it('ticks a parent’s own value, not its children’s', async () => {
      const wrapper = mountGroups([NESTED_CATEGORY]);
      const boxes = wrapper.findAll('input[type="checkbox"]');
      await boxes[1]!.setValue(true);
      expect(wrapper.emitted('toggle')).toEqual([['category', 'tableware', true]]);
    });

    it('leaves a child tickable on its own while the parent is not ticked', async () => {
      const wrapper = mountGroups([NESTED_CATEGORY]);
      const boxes = wrapper.findAll('input[type="checkbox"]');
      expect(boxes[2]!.attributes('disabled')).toBeUndefined();
      await boxes[2]!.setValue(true);
      expect(wrapper.emitted('toggle')).toEqual([['category', 'cup', true]]);
    });

    /**
     * A ticked parent draws its children ticked and inoperable: the request carries the parent's id
     * and the platform expands it, so the child is not a filter the shopper can remove from there —
     * the way out is the parent, which is the one control that can still change. Said out loud, so a
     * ticked-and-disabled box is not a dead end with no explanation.
     */
    it('draws a ticked parent’s children ticked, inoperable and explained', () => {
      const wrapper = mountGroups([NESTED_CATEGORY_PARENT_TICKED], {
        selection: { category: ['tableware'] },
      });
      const boxes = wrapper.findAll('input[type="checkbox"]');
      expect((boxes[1]!.element as HTMLInputElement).checked).toBe(true);
      for (const index of [2, 3]) {
        expect((boxes[index]!.element as HTMLInputElement).checked).toBe(true);
        expect(boxes[index]!.attributes('disabled')).toBeDefined();
      }
      const labels = wrapper.findAll('label').map((label) => label.text().replace(/\s+/g, ' '));
      expect(labels[2]).toBe('Cup (6) included in Tableware');
      expect(labels[3]).toBe('Bowl (0) included in Tableware');
    });

    /** The count badge counts the shopper's own filters: an implied child is the parent's filter. */
    it('counts one selected filter for a ticked parent, not three', () => {
      const wrapper = mountGroups([NESTED_CATEGORY_PARENT_TICKED], {
        selection: { category: ['tableware'] },
      });
      expect(wrapper.get('h3 button').text()).toContain('1');
    });
  });
});
