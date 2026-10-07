import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mountWith } from '../../../test/mount';
import FilterPanel from '../FilterPanel.vue';
import type { FilterFacet, FilterSelection } from '../types';
import {
  AVAILABILITY_FACET,
  CATEGORY_TREE_FACET,
  COLOUR_FACET,
  MATERIAL_FACET,
  NORTHWIND_COLOURS,
  PRICE_FACET,
  SIZE_FACET,
} from '../northwind';

type Wrapper = ReturnType<typeof mountWith<typeof FilterPanel>>;

function mount(facets: FilterFacet[], props: Record<string, unknown> = {}): Wrapper {
  return mountWith(FilterPanel, { props: { facets, currency: 'USD', ...props } });
}

function mountModel(facets: FilterFacet[], props: Record<string, unknown> = {}): Wrapper {
  const holder: { wrapper?: Wrapper } = {};
  holder.wrapper = mountWith(FilterPanel, {
    props: {
      facets,
      currency: 'USD',
      ...props,
      'onUpdate:modelValue': (selection: FilterSelection) => {
        void holder.wrapper?.setProps({ modelValue: selection });
      },
    },
  });
  return holder.wrapper;
}

/** Every row of a `list` facet — composed `Checkbox`es, so each row is the checkbox's own root. */
function listRows(wrapper: Wrapper) {
  return wrapper.findAll('[data-part="values"] [data-part="root"]');
}

/**
 * One value's own control. `data-value` lands on the `<input>` in a `list` facet (`Checkbox`
 * forwards attributes there) and on the `<label>` of a hand-drawn swatch row or size tile, so the
 * helper resolves either shape to the control itself.
 */
function input(wrapper: Wrapper, value: string): HTMLInputElement {
  const found = wrapper.find(`[data-value="${value}"]`);
  const element = found.element.matches('input') ? found.element : found.find('input').element;
  return element as HTMLInputElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ListFacet — counts and names', () => {
  /** Spec → Accessibility: 'The count is read as ", 18 products"'. */
  it('names each row with its label and its count, and shows the count beside it', () => {
    const wrapper = mount([CATEGORY_TREE_FACET]);
    expect(input(wrapper, 'knitwear').getAttribute('aria-label')).toBe('Knitwear, 18 products');
    expect(wrapper.find('[data-part="count"]').text()).toBe('16');
    wrapper.unmount();
  });

  it('writes the singular for a value with one product left', () => {
    const wrapper = mount([
      {
        id: 'f',
        label: 'Fit',
        type: 'list',
        values: [{ value: 'relaxed', label: 'Relaxed', count: 1 }],
      },
    ]);
    expect(input(wrapper, 'relaxed').getAttribute('aria-label')).toBe('Relaxed, 1 product');
    wrapper.unmount();
  });

  /** Spec → Accessibility: 'unavailable sizes ... add ", none available"' — the same for a row. */
  it('says ", none available" on a value nothing is left for, and disables it', () => {
    const wrapper = mount([
      {
        id: 'f',
        label: 'Fit',
        type: 'list',
        values: [{ value: 'boxy', label: 'Boxy', count: 0 }],
      },
    ]);
    const box = input(wrapper, 'boxy');
    expect(box.getAttribute('aria-label')).toBe('Boxy, 0 products, none available');
    expect(box.disabled).toBe(true);
    wrapper.unmount();
  });

  /** Spec → States: "A selected value is never disabled." */
  it('never disables a selected value, whatever its count says', () => {
    const wrapper = mount(
      [
        {
          id: 'f',
          label: 'Fit',
          type: 'list',
          values: [{ value: 'boxy', label: 'Boxy', count: 0 }],
        },
      ],
      { modelValue: { f: ['boxy'] } }
    );
    expect(input(wrapper, 'boxy').disabled).toBe(false);
    wrapper.unmount();
  });
});

describe('ListFacet — the 6 and 12 thresholds', () => {
  it('shows six values and a Show all N that toggles to Show fewer', async () => {
    const wrapper = mount([MATERIAL_FACET]);
    expect(listRows(wrapper)).toHaveLength(6);

    const showAll = wrapper.find('[data-part="showAll"]');
    expect(showAll.text()).toBe('Show all 13');
    expect(showAll.attributes('aria-expanded')).toBe('false');
    expect(showAll.attributes('aria-controls')).toBe(
      wrapper.find('[data-part="values"]').attributes('id')
    );

    await showAll.trigger('click');
    expect(listRows(wrapper)).toHaveLength(13);
    expect(wrapper.find('[data-part="showAll"]').text()).toBe('Show fewer');
    expect(wrapper.find('[data-part="showAll"]').attributes('aria-expanded')).toBe('true');

    await wrapper.find('[data-part="showAll"]').trigger('click');
    expect(listRows(wrapper)).toHaveLength(6);
    wrapper.unmount();
  });

  /** Spec → Behaviour: "focus stays on the button". Nothing moves it, which is the whole point. */
  it('keeps focus on Show all N', async () => {
    const wrapper = mount([MATERIAL_FACET]);
    const showAll = wrapper.find('[data-part="showAll"]');
    (showAll.element as HTMLElement).focus();
    await showAll.trigger('click');
    expect(document.activeElement).toBe(wrapper.find('[data-part="showAll"]').element);
    wrapper.unmount();
  });

  it('offers no Show all N to a facet of six values or fewer', () => {
    const wrapper = mount([{ ...MATERIAL_FACET, values: MATERIAL_FACET.values!.slice(0, 6) }]);
    expect(listRows(wrapper)).toHaveLength(6);
    expect(wrapper.find('[data-part="showAll"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('gives a search field to a facet of more than twelve values and not to one of twelve', () => {
    const thirteen = mount([MATERIAL_FACET]);
    const field = thirteen.find('[data-part="search"] input');
    expect(field.exists()).toBe(true);
    expect(field.attributes('type')).toBe('search');
    expect(field.attributes('aria-label')).toBe('Search Material values');
    expect(field.attributes('placeholder')).toBe('Search Material');
    expect(field.attributes('aria-controls')).toBe(
      thirteen.find('[data-part="values"]').attributes('id')
    );
    thirteen.unmount();

    const twelve = mount([{ ...MATERIAL_FACET, values: MATERIAL_FACET.values!.slice(0, 12) }]);
    expect(twelve.find('[data-part="search"]').exists()).toBe(false);
    twelve.unmount();
  });
});

describe('ListFacet — searching', () => {
  it('filters as the shopper types, ignoring case and accents', async () => {
    const wrapper = mount([MATERIAL_FACET]);
    const field = wrapper.find('[data-part="search"] input');

    await field.setValue('CREME');
    expect(listRows(wrapper).map((row) => row.text())).toEqual(['Crème bouclé2']);

    await field.setValue('wool');
    expect(listRows(wrapper).map((row) => row.text())).toEqual(['Lambswool11']);
    wrapper.unmount();
  });

  /**
   * Spec → States: "the list shows all its values (not just 6) while a query is active". A
   * truncated search result is a search that lies — proven by a query that matches ten values,
   * four of them past the sixth row.
   */
  it('searches the whole list rather than the first six', async () => {
    const wrapper = mount([MATERIAL_FACET]);
    await wrapper.find('[data-part="search"] input').setValue('o');
    const found = listRows(wrapper).map((row) => row.text());
    expect(found.length).toBeGreaterThan(6);
    expect(found).toContain('Porcelain1');
    wrapper.unmount();
  });

  it('hides Show all N while a query is filtering, and brings it back when it is cleared', async () => {
    const wrapper = mount([MATERIAL_FACET]);
    const field = wrapper.find('[data-part="search"] input');
    await field.setValue('silk');
    expect(wrapper.find('[data-part="showAll"]').exists()).toBe(false);
    await field.setValue('');
    expect(wrapper.find('[data-part="showAll"]').text()).toBe('Show all 13');
    wrapper.unmount();
  });

  /** Spec → Accessibility: 'The "No matches" line is `role="status"`.' */
  it('says "No matches for “x”" in a status region, which is always present', async () => {
    const wrapper = mount([MATERIAL_FACET]);
    const status = wrapper.find('[data-part="noMatches"]');
    // Present and empty before anything is typed — a live region inserted with its own text is one
    // assistive technology was never watching.
    expect(status.exists()).toBe(true);
    expect(status.attributes('role')).toBe('status');
    expect(status.text()).toBe('');

    await wrapper.find('[data-part="search"] input').setValue('zirconium');
    expect(wrapper.find('[data-part="noMatches"]').text()).toBe('No matches for “zirconium”');
    expect(listRows(wrapper)).toHaveLength(0);
    wrapper.unmount();
  });

  it('says nothing about matches for an empty facet, which is not a facet with no matches', () => {
    const wrapper = mount([{ id: 'f', label: 'Fit', type: 'list', values: [] }]);
    expect(wrapper.find('[data-part="noMatches"]').text()).toBe('');
    wrapper.unmount();
  });
});

describe('ListFacet — a facet the store answers as a tree', () => {
  it('nests the children in a named group and adds no tab stop of its own', () => {
    const wrapper = mount([CATEGORY_TREE_FACET]);
    const nested = wrapper.find('[role="group"]');
    expect(nested.attributes('aria-label')).toBe('Under Tableware');
    expect(nested.findAll('input')).toHaveLength(2);
    // Every row is still an ordinary checkbox in source order: no `tabindex`, no tree roles.
    expect(wrapper.findAll('[role="treeitem"]')).toHaveLength(0);
    for (const box of wrapper.findAll('input[type="checkbox"]')) {
      expect(box.attributes('tabindex')).toBeUndefined();
    }
    wrapper.unmount();
  });

  it('says out loud that a child is ticked because its parent is', () => {
    const wrapper = mount([
      {
        ...CATEGORY_TREE_FACET,
        values: [
          { value: 'tableware', label: 'Tableware', count: 16 },
          { value: 'cup', label: 'Cup', count: 6, parent: 'tableware', implied: true },
        ],
      },
    ]);
    const child = input(wrapper, 'cup');
    expect(child.checked).toBe(true);
    expect(child.getAttribute('aria-label')).toBe('Cup, 6 products, included in Tableware');
    wrapper.unmount();
  });
});

describe('ColourFacet — swatches', () => {
  /** The whole row is the target and carries the ring; the swatch itself is hidden. */
  it('stretches a real checkbox over the whole row and hides the swatch', () => {
    const wrapper = mount([COLOUR_FACET]);
    const row = wrapper.find('[data-part="row"][data-value="brown"]');
    expect(row.element.tagName).toBe('LABEL');
    expect(row.classes()).toContain('eldra-focus');
    expect(row.classes()).toContain('eldra-focus-proxy');
    const swatch = row.find('[data-part="swatch"]');
    expect(swatch.attributes('aria-hidden')).toBe('true');
    expect(swatch.attributes('style')).toContain(NORTHWIND_COLOURS.brown);
    wrapper.unmount();
  });

  it('names the row with the colour and its count, the name always visible beside it', () => {
    const wrapper = mount([COLOUR_FACET]);
    expect(input(wrapper, 'brown').getAttribute('aria-label')).toBe('Brown, 9 products');
    expect(wrapper.find('[data-value="brown"]').find('[data-part="rowLabel"]').text()).toBe(
      'Brown'
    );
    wrapper.unmount();
  });

  /**
   * Spec → Variants: the check mark "picks its ink automatically ... above 0.35 the check is
   * `text`, otherwise `focus-inner`". Natural is the pale one; Brown and the Multi gradient are not.
   */
  it('picks the check mark’s ink from the swatch’s own luminance', () => {
    const wrapper = mount([COLOUR_FACET], {
      modelValue: { colour: ['natural', 'brown', 'multi'] },
    });
    const ink = (value: string): string[] =>
      wrapper.find(`[data-value="${value}"]`).find('[data-part="swatchMark"]').classes();
    expect(ink('natural')).toContain('text-text');
    expect(ink('brown')).toContain('text-focus-inner');
    // A gradient counts as dark, however pale the colours inside it are.
    expect(ink('multi')).toContain('text-focus-inner');
    wrapper.unmount();
  });

  /** Spec → States, "Swatch, checked": three cues, never colour alone. */
  it('shows a ring, a check mark and a bold name when checked, and none of them when not', () => {
    const wrapper = mount([COLOUR_FACET], { modelValue: { colour: ['brown'] } });
    const checked = wrapper.find('[data-value="brown"]');
    expect(checked.find('[data-part="swatchMark"]').exists()).toBe(true);
    expect(checked.find('[data-part="rowLabel"]').classes()).toContain('font-semibold');
    expect(checked.find('.eldra-filter-swatch-ring').classes()).toContain('border-text');

    const unchecked = wrapper.find('[data-value="black"]');
    expect(unchecked.find('[data-part="swatchMark"]').exists()).toBe(false);
    expect(unchecked.find('[data-part="rowLabel"]').classes()).not.toContain('font-semibold');
    expect(unchecked.find('.eldra-filter-swatch-ring').classes()).toContain('border-transparent');
    wrapper.unmount();
  });

  /** Spec → States: 'swatch at 45% opacity with a 1.5px `text` diagonal strike at 45°'. */
  it('strikes a swatch nothing is left for, and keeps it in place', () => {
    const wrapper = mount([COLOUR_FACET]);
    const rows = wrapper.findAll('[data-part="row"]');
    // Still the seventh row, not hidden: the list must not jump while filtering.
    expect(rows).toHaveLength(7);
    const navy = wrapper.find('[data-value="navy"]');
    expect(navy.find('[data-part="swatchStrike"]').exists()).toBe(true);
    expect(navy.find('[data-part="swatch"]').classes()).toContain('opacity-45');
    expect(input(wrapper, 'navy').disabled).toBe(true);
    expect(wrapper.find('[data-value="brown"]').find('[data-part="swatchStrike"]').exists()).toBe(
      false
    );
    wrapper.unmount();
  });

  /**
   * Spec → Sizes, Panel row: "colour rows switch to 2 columns once the panel is 26rem or wider."
   * A container query, so the class is what can be asserted here and the query itself is proven
   * against the compiled stylesheet in the browser spec.
   */
  it('keeps one column until the panel itself is 26rem wide', () => {
    const wrapper = mount([COLOUR_FACET]);
    const values = wrapper.find('[data-part="values"]').classes();
    expect(values).toContain('grid-cols-1');
    expect(values).toContain('@min-[26rem]:grid-cols-2');
    wrapper.unmount();
  });

  /** Spec → Variants, `grid` layout: "Swatch tiles: swatch above, name and count centred below." */
  it('draws tiles when the layout is grid, with the name and count still visible', () => {
    const wrapper = mount([{ ...COLOUR_FACET, layout: 'grid' }]);
    expect(wrapper.findAll('[data-part="row"]')).toHaveLength(0);
    const tile = wrapper.find('[data-part="tile"][data-value="brown"]');
    expect(tile.exists()).toBe(true);
    expect(tile.find('[data-part="tileLabel"]').text()).toBe('Brown');
    expect(tile.find('[data-part="count"]').text()).toBe('9');
    wrapper.unmount();
  });

  it('writes the value when a swatch row is clicked', async () => {
    const wrapper = mountModel([COLOUR_FACET]);
    input(wrapper, 'brown').click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ colour: ['brown'] }]);
    wrapper.unmount();
  });
});

describe('SizeFacet — tiles and systems', () => {
  /** Spec → Do / Don't: "Do group sizes by system; don't mix 'M' and '42' in one grid." */
  it('draws one sub-heading and one grid per size system', () => {
    const wrapper = mount([SIZE_FACET]);
    expect(wrapper.findAll('[data-part="subheading"]').map((heading) => heading.text())).toEqual([
      'Knitwear',
      'Socks (EU)',
    ]);
    const grids = wrapper.findAll('[data-part="values"]');
    expect(grids).toHaveLength(2);
    expect(grids[0]!.findAll('[data-part="tile"]')).toHaveLength(6);
    expect(grids[1]!.findAll('[data-part="tile"]')).toHaveLength(2);
    wrapper.unmount();
  });

  it('draws no sub-heading at all for a facet whose values carry no system', () => {
    const wrapper = mount([
      {
        id: 'size',
        label: 'Size',
        type: 'size',
        values: [
          { value: 's', label: 'S', count: 3 },
          { value: 'm', label: 'M', count: 4 },
        ],
      },
    ]);
    expect(wrapper.findAll('[data-part="subheading"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-part="values"]')).toHaveLength(1);
    wrapper.unmount();
  });

  /** Spec → Accessibility: '`aria-label` naming the size system and count ("Knitwear M, 14
   *  products")'; the visible tile text is `aria-hidden`. */
  it('names a tile with its system, and hides the visible size from the name', () => {
    const wrapper = mount([SIZE_FACET]);
    expect(input(wrapper, 'm').getAttribute('aria-label')).toBe('Knitwear M, 14 products');
    expect(
      wrapper.find('[data-value="m"]').find('[data-part="tileLabel"]').attributes('aria-hidden')
    ).toBe('true');
    wrapper.unmount();
  });

  it('names an unavailable tile ", none available" and disables it', () => {
    const wrapper = mount([SIZE_FACET]);
    expect(input(wrapper, '42-44').getAttribute('aria-label')).toBe(
      'Socks (EU) 42–44, 0 products, none available'
    );
    expect(input(wrapper, '42-44').disabled).toBe(true);
    wrapper.unmount();
  });

  /** Spec → States: a checked tile is a `primary` fill plus weight 600 — fill and weight, not
   *  colour alone; an unavailable one is dashed and struck through. */
  it('fills and bolds a checked tile, and dashes and strikes an unavailable one', () => {
    const wrapper = mount([SIZE_FACET], { modelValue: { size: ['m'] } });
    const checked = wrapper.find('[data-value="m"]').classes();
    expect(checked).toContain('bg-primary');
    expect(checked).toContain('font-semibold');
    expect(checked).toContain('text-primary-contrast');

    const unavailable = wrapper.find('[data-value="xxl"]').classes();
    expect(unavailable).toContain('border-dashed');
    expect(unavailable).toContain('line-through');
    expect(unavailable).toContain('text-muted');
    wrapper.unmount();
  });

  it('links to the size guide only when the facet names one', () => {
    const withGuide = mount([SIZE_FACET]);
    const link = withGuide.find('[data-part="sizeGuide"]');
    expect(link.text()).toBe('Size guide');
    expect(link.attributes('href')).toBe('/pages/size-guide');
    withGuide.unmount();

    const without = mount([{ ...SIZE_FACET, sizeGuideHref: undefined }]);
    expect(without.find('[data-part="sizeGuide"]').exists()).toBe(false);
    without.unmount();
  });
});

describe('ToggleFacet — switches', () => {
  /** Spec → Do / Don't: "Don't use checkbox pairs for yes/no facets; use one switch." */
  it('draws one switch per value and no checkbox at all', () => {
    const wrapper = mount([
      {
        id: 'availability',
        label: 'Availability',
        type: 'toggle',
        values: [
          { value: 'in_stock', label: 'In stock only', count: 41 },
          { value: 'preorder', label: 'Include pre-orders', count: 5 },
        ],
      },
    ]);
    const switches = wrapper.findAll('[role="switch"]');
    expect(switches).toHaveLength(2);
    expect(wrapper.findAll('input[type="checkbox"]:not([hidden])')).toHaveLength(0);
    expect(switches[0]!.attributes('aria-checked')).toBe('false');
    expect(switches[0]!.text()).toContain('In stock only');
    wrapper.unmount();
  });

  /** Spec → Accessibility: "The count is plain text beside it" — outside the switch's own name. */
  it('keeps the count outside the switch, so it is not read as the state', () => {
    const wrapper = mount([
      {
        id: 'availability',
        label: 'Availability',
        type: 'toggle',
        values: [{ value: 'in_stock', label: 'In stock only', count: 41 }],
      },
    ]);
    const row = wrapper.find('[data-part="switchRow"]');
    expect(row.find('[data-part="count"]').text()).toBe('41');
    expect(row.find('[role="switch"]').text()).not.toContain('41');
    wrapper.unmount();
  });

  it('reflects aria-checked when the switch is on', () => {
    const wrapper = mount(
      [
        {
          id: 'availability',
          label: 'Availability',
          type: 'toggle',
          values: [{ value: 'in_stock', label: 'In stock only', count: 41 }],
        },
      ],
      { modelValue: { availability: ['in_stock'] } }
    );
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true');
    wrapper.unmount();
  });
});

describe('RangeFacet — the range, its fields and its histogram', () => {
  /** Spec → Accessibility: two sliders named "Minimum price" and "Maximum price". */
  it('names the two thumbs after the facet', () => {
    const wrapper = mount([PRICE_FACET]);
    const thumbs = wrapper.findAll('[role="slider"]');
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0]!.attributes('aria-label')).toBe('Minimum Price');
    expect(thumbs[1]!.attributes('aria-label')).toBe('Maximum Price');
    wrapper.unmount();
  });

  /** Spec → Acceptance: 'Each thumb's `aria-valuetext` is the formatted price ("$40", "$240 or
   *  more")'. */
  it('announces each thumb as a price, and "or more" on the maximum at its limit', () => {
    const wrapper = mount([PRICE_FACET]);
    const thumbs = wrapper.findAll('[role="slider"]');
    expect(thumbs[0]!.attributes('aria-valuetext')).toBe('$40');
    expect(thumbs[1]!.attributes('aria-valuetext')).toBe('$240 or more');
    wrapper.unmount();
  });

  it('drops "or more" as soon as the maximum comes off its limit', () => {
    const wrapper = mount([PRICE_FACET], { modelValue: { price: [40, 160] } });
    expect(wrapper.findAll('[role="slider"]')[1]!.attributes('aria-valuetext')).toBe('$160');
    wrapper.unmount();
  });

  /** Spec → Acceptance: 'with locale is-IS and currency ISK, prices read "3.500 kr."'. */
  it('formats an is-IS price range in krónur', () => {
    const wrapper = mountWith(FilterPanel, {
      props: {
        facets: [{ ...PRICE_FACET, min: 3500, max: 14_000, step: 100 }],
        locale: 'is-IS',
        currency: 'ISK',
      },
    });
    const text = wrapper.findAll('[role="slider"]')[0]!.attributes('aria-valuetext') ?? '';
    expect(text).toContain('3.500');
    expect(text).toContain('kr');
    wrapper.unmount();
  });

  /** Spec → Anatomy item 12: two fields with visible "Min" and "Max" labels. */
  it('draws the Min and Max fields with their own visible labels', () => {
    const wrapper = mount([PRICE_FACET], { modelValue: { price: [80, 160] } });
    const fields = wrapper.find('[data-part="fields"]');
    expect(fields.findAll('label').map((label) => label.text())).toEqual(['Min', 'Max']);
    expect((fields.find('[data-input="min"]').element as HTMLInputElement).value).toBe('$80');
    expect((fields.find('[data-input="max"]').element as HTMLInputElement).value).toBe('$160');
    // The en dash between them is punctuation, so it is hidden.
    expect(fields.find('[data-part="separator"]').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  /**
   * A range the facet does not call money is a plain number field, not a `CurrencyInput` guessing
   * a sign — a width or a capacity is not a price.
   */
  it('draws the spec’s own number fields for a range that is not money', () => {
    const wrapper = mount([{ ...PRICE_FACET, id: 'width', label: 'Width', currency: undefined }]);
    const field = wrapper.find('[data-input="min"]');
    expect((field.element as HTMLInputElement).value).toBe('40');
    expect(field.attributes('type')).toBe('number');
    expect(field.attributes('inputmode')).toBe('numeric');
    // The visible label still belongs to the field, through a `FieldWrapper`'s own `<label for>`.
    const labelFor = wrapper.find('[data-part="fields"] label').attributes('for');
    expect(labelFor).toBe(field.attributes('id'));
    wrapper.unmount();
  });

  /** A store with no published currency gets plain numbers rather than a dollar sign. */
  it('falls back to plain numbers when the store has no currency', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [PRICE_FACET], currency: '' } });
    expect((wrapper.find('[data-input="min"]').element as HTMLInputElement).value).toBe('40');
    wrapper.unmount();
  });

  /** Spec → Anatomy item 10: 24 decorative bars, in range when their bucket centre is. */
  it('draws the histogram the facet supplied, hidden from assistive technology', () => {
    const wrapper = mount([PRICE_FACET], { modelValue: { price: [40, 140] } });
    const histogram = wrapper.find('[data-part="histogram"]');
    expect(histogram.attributes('aria-hidden')).toBe('true');
    const bars = histogram.findAll('[data-part="histogramBar"]');
    expect(bars).toHaveLength(24);
    expect(bars.filter((bar) => bar.attributes('data-inside') === 'true')).toHaveLength(12);
    wrapper.unmount();
  });

  /** "Leave it out to hide the histogram" — the panel never invents a distribution it cannot see. */
  it('draws no histogram when the facet supplies none', () => {
    const wrapper = mount([{ ...PRICE_FACET, histogram: undefined }]);
    expect(wrapper.find('[data-part="histogram"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('draws no histogram for an empty distribution either', () => {
    const wrapper = mount([{ ...PRICE_FACET, histogram: [] }]);
    expect(wrapper.find('[data-part="histogram"]').exists()).toBe(false);
    wrapper.unmount();
  });

  /**
   * A moved span becomes a selection; a span back at its limits is no selection at all, so the
   * facet's key goes with it — see `setRange`.
   */
  it('writes a narrowed span and drops the key again at the limits', async () => {
    const wrapper = mountModel([PRICE_FACET]);
    const min = () => wrapper.findAll('[role="slider"]')[0]!;
    await min().trigger('keydown', { key: 'ArrowRight' });
    // `change` is the end of the move, which for a key is its release.
    await min().trigger('keyup', { key: 'ArrowRight' });
    expect(wrapper.emitted('change')?.at(-1)).toEqual([{ price: [50, 240] }]);

    await min().trigger('keydown', { key: 'Home' });
    await min().trigger('keyup', { key: 'Home' });
    expect(wrapper.emitted('change')?.at(-1)).toEqual([{}]);
    wrapper.unmount();
  });

  /** One `change` per gesture, not one per step: a filter that re-queried per pixel is unusable. */
  it('reports one change per finished move, not one per step', async () => {
    const wrapper = mountModel([PRICE_FACET]);
    const min = () => wrapper.findAll('[role="slider"]')[0]!;
    await min().trigger('keydown', { key: 'ArrowRight' });
    await min().trigger('keydown', { key: 'ArrowRight' });
    await min().trigger('keydown', { key: 'ArrowRight' });
    // Three steps, then one key release.
    await min().trigger('keyup', { key: 'ArrowRight' });
    expect(wrapper.emitted('change')).toHaveLength(1);
    expect(wrapper.emitted('change')?.at(-1)).toEqual([{ price: [70, 240] }]);
    wrapper.unmount();
  });
});

describe('RangeFacet — a range with nothing to narrow', () => {
  const COLLAPSED: FilterFacet = {
    id: 'price',
    label: 'Price',
    type: 'range',
    min: 3500,
    max: 3500,
    currency: true,
  };

  /**
   * No group at all — not a disabled one, and certainly not a single thumb that cannot move beside
   * two fields reading "3,500" to "3,500". A control that answers every gesture with nothing is
   * worse than no control: it says there is something to narrow when there is not.
   */
  it('draws no group, no slider and no fields', () => {
    const wrapper = mount([CATEGORY_TREE_FACET, COLLAPSED]);
    expect(
      wrapper.findAll('[data-part="group"][data-facet]').map((g) => g.attributes('data-facet'))
    ).toEqual(['category']);
    expect(wrapper.find('[data-facet="price"]').exists()).toBe(false);
    expect(wrapper.findAll('[role="slider"]')).toHaveLength(0);
    expect(wrapper.find('[data-part="fields"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('draws the group again as soon as there is a span to narrow', async () => {
    const wrapper = mount([COLLAPSED]);
    expect(wrapper.find('[data-facet="price"]').exists()).toBe(false);
    await wrapper.setProps({ facets: [{ ...COLLAPSED, max: 14_000 }] });
    expect(wrapper.find('[data-facet="price"]').exists()).toBe(true);
    expect(wrapper.findAll('[role="slider"]')).toHaveLength(2);
    wrapper.unmount();
  });

  /** An inverted span collapses to one value, which is the same nothing. */
  it('draws nothing for an inverted span either', () => {
    const wrapper = mount([{ ...COLLAPSED, min: 240, max: 40 }]);
    expect(wrapper.find('[data-facet="price"]').exists()).toBe(false);
    wrapper.unmount();
  });

  /**
   * A span inherited from a URL would otherwise keep narrowing the results with no control on
   * screen that could widen them again — so it goes on the next change. Not on mount: a panel that
   * emitted a change nobody asked for would surprise a store that handed it a collapsed range and
   * never touched the panel.
   */
  it('clears its leftover selection on the next change, and not before', async () => {
    const wrapper = mountModel([CATEGORY_TREE_FACET, COLLAPSED], {
      modelValue: { price: [3500, 3500], category: ['knitwear'] },
    });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('change')).toBeUndefined();

    input(wrapper, 'tableware').click();
    await nextTick();
    expect(wrapper.emitted('change')?.at(-1)).toEqual([{ category: ['knitwear', 'tableware'] }]);
    wrapper.unmount();
  });

  /** And it never counts towards **Clear all**, which would otherwise have nothing to clear. */
  it('does not keep Clear all on screen on its own', () => {
    const wrapper = mount([COLLAPSED], { modelValue: { price: [3500, 3500] } });
    expect(wrapper.find('[data-part="clear"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

/**
 * The spec's own pictures, asserted as a contract rather than left to the screenshot baselines:
 * each of these is a default somebody could reasonably "simplify" into the other branch, and a
 * changed baseline says only that a picture moved, not which rule broke.
 */
describe('the shapes the spec draws by default', () => {
  it('draws a colour facet as rows unless it asks for a grid', () => {
    const rows = mount([COLOUR_FACET]);
    expect(rows.findAll('[data-part="row"]').length).toBeGreaterThan(0);
    expect(rows.findAll('[data-part="tile"]')).toHaveLength(0);
    rows.unmount();

    const explicitList = mount([{ ...COLOUR_FACET, layout: 'list' }]);
    expect(explicitList.findAll('[data-part="row"]').length).toBeGreaterThan(0);
    explicitList.unmount();

    const grid = mount([{ ...COLOUR_FACET, layout: 'grid' }]);
    expect(grid.findAll('[data-part="row"]')).toHaveLength(0);
    expect(grid.findAll('[data-part="tile"]').length).toBeGreaterThan(0);
    grid.unmount();
  });

  /** Spec → Sizes: "Count ... pushed to the end", on every shape that has one. */
  it('pushes every count to the end of its row', () => {
    const wrapper = mount([CATEGORY_TREE_FACET, COLOUR_FACET, AVAILABILITY_FACET]);
    const counts = wrapper.findAll('[data-part="count"]');
    expect(counts.length).toBeGreaterThan(5);
    for (const count of counts) {
      expect(count.classes()).toContain('ms-auto');
      expect(count.classes()).toContain('tabular-nums');
    }
    wrapper.unmount();
  });

  /**
   * Spec → Sizes, Min / Max fields: "The unit sits 0.625rem inside the input ... as a prefix ("$")
   * or a suffix ("kr."), whichever the currency format uses." The field is the store's own money
   * field, so the locale decides which side — asserted on both, because a hard-coded prefix is the
   * easy way to get this wrong and it is only wrong outside en-US.
   */
  it('puts the currency unit inside the field, on the side the locale puts it', () => {
    const dollars = mount([PRICE_FACET], { modelValue: { price: [80, 160] } });
    expect((dollars.find('[data-input="min"]').element as HTMLInputElement).value).toMatch(/^\$/);
    dollars.unmount();

    const kronur = mountWith(FilterPanel, {
      props: {
        facets: [{ ...PRICE_FACET, min: 3500, max: 14_000, step: 100 }],
        locale: 'is-IS',
        currency: 'ISK',
        modelValue: { price: [5000, 11_000] },
      },
    });
    const value = (kronur.find('[data-input="min"]').element as HTMLInputElement).value;
    expect(value).toMatch(/kr/);
    expect(value.trimEnd().endsWith('.') || /kr\.?$/.test(value.trim())).toBe(true);
    kronur.unmount();
  });

  /**
   * The Min/Max row sits inside `RangeSlider`'s own three-column `inputs` grid and has to span it:
   * without that it is one child of that grid, a third of the width, with both figures clipped.
   */
  it('spans the slider’s own inputs grid rather than sitting in its first column', () => {
    const wrapper = mount([PRICE_FACET]);
    expect(wrapper.find('[data-part="fields"]').classes()).toContain('col-span-full');
    wrapper.unmount();
  });

  /** Spec → Anatomy item 10: the histogram sits above the range, not below or beside it. */
  it('draws the histogram above the track', () => {
    const wrapper = mount([PRICE_FACET]);
    const histogram = wrapper.find('[data-part="histogram"]').element;
    const rail = wrapper.find('[data-part="rail"]').element;
    expect(histogram.compareDocumentPosition(rail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    wrapper.unmount();
  });
});
