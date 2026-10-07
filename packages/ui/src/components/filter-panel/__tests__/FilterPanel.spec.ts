import { afterEach, describe, expect, it } from 'vitest';
import { h, nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import FilterPanel from '../FilterPanel.vue';
import type { FilterSelection } from '../types';
import {
  ALL_FACETS,
  AVAILABILITY_FACET,
  CATEGORY_FACET,
  CATEGORY_TREE_FACET,
  COLOUR_FACET,
  MATERIAL_FACET,
  PRICE_FACET,
  SIZE_FACET,
} from '../northwind';

type Wrapper = ReturnType<typeof mountWith<typeof FilterPanel>>;

/**
 * A mount whose parent applies what the panel emits — `v-model`, in other words.
 *
 * A bare `modelValue` prop makes the panel *controlled* by a parent that never writes back, which
 * is correct behaviour (`useControllableModel`) but leaves every second step of a multi-step
 * assertion reading the same starting selection. Anything that ticks twice mounts through here.
 */
function mountModel(props: Record<string, unknown> = {}): Wrapper {
  const holder: { wrapper?: Wrapper } = {};
  holder.wrapper = mountWith(FilterPanel, {
    props: {
      facets: ALL_FACETS,
      currency: 'USD',
      ...props,
      'onUpdate:modelValue': (selection: FilterSelection) => {
        void holder.wrapper?.setProps({ modelValue: selection });
      },
    },
  });
  return holder.wrapper;
}

function group(wrapper: Wrapper, facetId: string) {
  return wrapper.find(`[data-facet="${facetId}"]`);
}

function trigger(wrapper: Wrapper, facetId: string): HTMLButtonElement {
  return group(wrapper, facetId).find('[data-part="trigger"]').element as HTMLButtonElement;
}

/** One value's own control, whatever shape its facet draws (a row, a swatch, a tile). */
function control(wrapper: Wrapper, facetId: string, value: string): HTMLInputElement {
  const scope = group(wrapper, facetId);
  const row = scope.find(`[data-value="${value}"]`);
  const input = row.element.matches('input') ? row.element : row.find('input').element;
  return input as HTMLInputElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('FilterPanel — structure, roles and names', () => {
  it('is a form named "Product filters" that never submits', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: ALL_FACETS, currency: 'USD' } });
    const form = wrapper.find('form');
    expect(form.exists()).toBe(true);
    expect(form.attributes('aria-label')).toBe('Product filters');
    expect(form.attributes('novalidate')).toBeDefined();
    wrapper.unmount();
  });

  it('takes its own accessible name from `label`', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [], label: 'Narrow by' } });
    expect(wrapper.find('form').attributes('aria-label')).toBe('Narrow by');
    wrapper.unmount();
  });

  /** The head's title is the `h2`; every group trigger is an `h3` under it. */
  it('draws the head as an h2 with every group trigger an h3 > button', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: ALL_FACETS, currency: 'USD' } });
    expect(wrapper.find('h2').text()).toBe('Filters');
    const headings = wrapper.findAll('h3');
    expect(headings).toHaveLength(ALL_FACETS.length);
    for (const heading of headings) {
      const button = heading.find('button');
      expect(button.exists()).toBe(true);
      expect(button.attributes('type')).toBe('button');
      expect(button.attributes('aria-expanded')).toBeDefined();
      expect(button.attributes('aria-controls')).toBeDefined();
    }
    wrapper.unmount();
  });

  it('points every trigger at its own body, which is a fieldset with a hidden legend', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: ALL_FACETS, currency: 'USD' } });
    for (const facet of ALL_FACETS) {
      const scope = group(wrapper, facet.id);
      const controls = scope.find('[data-part="trigger"]').attributes('aria-controls');
      const body = scope.find('[data-part="body"]');
      expect(body.element.tagName).toBe('FIELDSET');
      expect(body.attributes('id')).toBe(controls);
      const legend = body.find('legend');
      expect(legend.text()).toBe(facet.label);
      expect(legend.classes()).toContain('sr-only');
    }
    wrapper.unmount();
  });

  /**
   * Two panels on one page (a sidebar and a drawer, which the collection grid really does render
   * at once) must not mint the same ids — so they are mounted inside **one** app here, which is
   * where Vue's own `useId` counter lives.
   */
  it('namespaces its ids, and takes a prefix when one is given', () => {
    const both = mountWith(
      {
        components: { FilterPanel },
        setup: () => ({ facets: [CATEGORY_FACET] }),
        template: `<div><FilterPanel :facets="facets" /><FilterPanel :facets="facets" /></div>`,
      },
      {}
    );
    const ids = both
      .findAll('[data-part="trigger"]')
      .map((button) => button.attributes('id') as string);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    both.unmount();

    const prefixed = mountWith(FilterPanel, {
      props: { facets: [CATEGORY_FACET], idPrefix: 'drawer' },
    });
    expect(trigger(prefixed, 'category').id).toBe('drawer-trigger-category');
    prefixed.unmount();
  });

  /** Spec → Sizes, Group row: a rule above the first group only when something sits above it. */
  it('draws the top rule on the first group only when there is a head above it', () => {
    const withHead = mountWith(FilterPanel, { props: { facets: [CATEGORY_FACET, COLOUR_FACET] } });
    expect(group(withHead, 'category').classes()).toContain('border-t');
    expect(group(withHead, 'colour').classes()).not.toContain('border-t');
    withHead.unmount();

    const headless = mountWith(FilterPanel, {
      props: { facets: [CATEGORY_FACET, COLOUR_FACET], showHead: false },
    });
    expect(group(headless, 'category').classes()).not.toContain('border-t');
    headless.unmount();
  });

  it('renders no groups and no head rule for no facets at all', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [] } });
    expect(wrapper.findAll('[data-part="group"][data-facet]')).toHaveLength(0);
    wrapper.unmount();
  });
});

describe('FilterPanel — the head', () => {
  it('leaves the head out when asked, which is what the drawer does', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: ALL_FACETS, showHead: false } });
    expect(wrapper.find('h2').exists()).toBe(false);
    expect(wrapper.find('[data-part="clear"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('takes a title of its own', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [], title: 'Narrow these down' } });
    expect(wrapper.find('h2').text()).toBe('Narrow these down');
    wrapper.unmount();
  });

  /**
   * Spec → States: **Clear all** is "hidden while nothing is selected and every range is at its
   * limits". A range *at* its limits is no selection at all — see `hasSelection`.
   */
  it('hides Clear all until something is selected', async () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: ALL_FACETS, currency: 'USD' } });
    expect(wrapper.find('[data-part="clear"]').exists()).toBe(false);

    await wrapper.setProps({ modelValue: { price: [40, 240] } });
    expect(wrapper.find('[data-part="clear"]').exists()).toBe(false);

    await wrapper.setProps({ modelValue: { price: [80, 160] } });
    expect(wrapper.find('[data-part="clear"]').exists()).toBe(true);

    await wrapper.setProps({ modelValue: { colour: ['brown'] } });
    expect(wrapper.find('[data-part="clear"]').text()).toBe('Clear all');
    wrapper.unmount();
  });

  /**
   * Spec → Behaviour: Clear all "unchecks every checkbox, switches every switch off, returns every
   * range to its limits, and moves focus to the panel title (focusable programmatically)".
   */
  it('clears every facet and moves focus to the title', async () => {
    const wrapper = mountModel({
      modelValue: { colour: ['brown'], size: ['m'], availability: ['in_stock'], price: [80, 160] },
    });
    await wrapper.find('[data-part="clear"]').trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{}]);
    expect(document.activeElement).toBe(wrapper.find('[data-part="title"]').element);
    wrapper.unmount();
  });
});

describe('FilterPanel — the badge and the collapsed summary', () => {
  /** Spec → Acceptance: the badge "is hidden at 0 ... and is named 'N selected'". */
  it('hides the badge at nothing selected and names it when there is', async () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: ALL_FACETS, currency: 'USD' } });
    expect(group(wrapper, 'colour').find('[data-part="badge"]').exists()).toBe(false);

    await wrapper.setProps({ modelValue: { colour: ['brown', 'natural'] } });
    const badge = group(wrapper, 'colour').find('[data-part="badge"]');
    expect(badge.exists()).toBe(true);
    // The visible digit is decorative; the hidden suffix is the name.
    expect(badge.find('[aria-hidden="true"]').text()).toBe('2');
    expect(badge.text()).toContain('2 selected');
    wrapper.unmount();
  });

  /** Spec → Behaviour: "a moved range does not count". */
  it('never badges a range', async () => {
    const wrapper = mountWith(FilterPanel, {
      props: { facets: ALL_FACETS, currency: 'USD', modelValue: { price: [80, 160] } },
    });
    expect(group(wrapper, 'price').find('[data-part="badge"]').exists()).toBe(false);
    wrapper.unmount();
  });

  /**
   * Spec → States: a collapsed group shows "the selected labels as a `muted` summary", and the
   * summary is "hidden (it keeps its space)" once the group opens — `visibility: hidden`, which
   * also takes it out of the trigger's accessible name.
   */
  it('shows the summary while collapsed and hides it, keeping its space, when open', async () => {
    const wrapper = mountWith(FilterPanel, {
      props: {
        facets: [{ ...COLOUR_FACET, collapsed: true }],
        modelValue: { colour: ['brown', 'natural'] },
      },
    });
    const summary = group(wrapper, 'colour').find('[data-part="summary"]');
    expect(summary.text()).toBe('Brown, Natural');

    // A facet with a selection always starts open, so this one is opened by `collapsed` losing to
    // the selection — collapse it by hand to read the collapsed state, then open it again.
    expect(trigger(wrapper, 'colour').getAttribute('aria-expanded')).toBe('true');
    expect(summary.classes()).toContain('invisible');

    await group(wrapper, 'colour').find('[data-part="trigger"]').trigger('click');
    expect(trigger(wrapper, 'colour').getAttribute('aria-expanded')).toBe('false');
    expect(group(wrapper, 'colour').find('[data-part="summary"]').classes()).not.toContain(
      'invisible'
    );
    wrapper.unmount();
  });

  it('draws no summary with nothing selected', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [COLOUR_FACET] } });
    expect(group(wrapper, 'colour').find('[data-part="summary"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('FilterPanel — which groups start open', () => {
  it('opens a facet that is not marked collapsed, and closes one that is', () => {
    const wrapper = mountWith(FilterPanel, {
      props: { facets: [CATEGORY_FACET, { ...COLOUR_FACET, collapsed: true }] },
    });
    expect(trigger(wrapper, 'category').getAttribute('aria-expanded')).toBe('true');
    expect(trigger(wrapper, 'colour').getAttribute('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  /** Spec → Facet shape: "A group with a selected value always starts open." */
  it('opens a collapsed facet that carries a selection', () => {
    const wrapper = mountWith(FilterPanel, {
      props: { facets: [{ ...COLOUR_FACET, collapsed: true }], modelValue: { colour: ['brown'] } },
    });
    expect(trigger(wrapper, 'colour').getAttribute('aria-expanded')).toBe('true');
    wrapper.unmount();
  });

  /**
   * A closed body is **`v-show`n, not unmounted**: a facet keeps what the shopper typed into its
   * search field and whether they pressed **Show all N** across a collapse.
   */
  it('keeps a collapsed body in the DOM so its own list state survives', async () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [MATERIAL_FACET] } });
    const search = wrapper.find('[data-part="search"] input');
    await search.setValue('silk');
    // A `list` facet's rows are composed `Checkbox`es, so each row is the checkbox's own root.
    expect(wrapper.findAll('[data-part="values"] [data-part="root"]')).toHaveLength(1);

    await wrapper.find('[data-part="trigger"]').trigger('click');
    const body = wrapper.find('[data-part="body"]');
    expect(body.exists()).toBe(true);
    expect((body.element as HTMLElement).style.display).toBe('none');

    await wrapper.find('[data-part="trigger"]').trigger('click');
    expect((wrapper.find('[data-part="search"] input').element as HTMLInputElement).value).toBe(
      'silk'
    );
    wrapper.unmount();
  });
});

describe('FilterPanel — the selection', () => {
  it('reports a checked value through update:modelValue and change', async () => {
    const wrapper = mountModel();
    control(wrapper, 'category', 'sweaters').click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ category: ['sweaters'] }]);
    expect(wrapper.emitted('change')?.at(-1)).toEqual([{ category: ['sweaters'] }]);
    wrapper.unmount();
  });

  it('unchecks a value and drops the facet key with the last one', async () => {
    const wrapper = mountModel({ modelValue: { category: ['sweaters'] } });
    control(wrapper, 'category', 'sweaters').click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{}]);
    wrapper.unmount();
  });

  it('manages its own selection with no v-model bound', async () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [CATEGORY_FACET] } });
    const box = control(wrapper, 'category', 'sweaters');
    box.click();
    await nextTick();
    expect(control(wrapper, 'category', 'sweaters').checked).toBe(true);
    wrapper.unmount();
  });

  /** A controlled parent that refuses a value really refuses it. */
  it('does not apply a write a controlled parent never answers', async () => {
    const wrapper = mountWith(FilterPanel, {
      props: { facets: [CATEGORY_FACET], modelValue: {} },
    });
    control(wrapper, 'category', 'sweaters').click();
    await nextTick();
    expect(control(wrapper, 'category', 'sweaters').checked).toBe(false);
    wrapper.unmount();
  });

  it('keeps every other facet untouched', async () => {
    const wrapper = mountModel({ modelValue: { colour: ['brown'], size: ['m'] } });
    control(wrapper, 'category', 'sweaters').click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { colour: ['brown'], size: ['m'], category: ['sweaters'] },
    ]);
    wrapper.unmount();
  });

  it('switches a toggle facet on and off', async () => {
    const wrapper = mountModel();
    const availability = group(wrapper, 'availability');
    await availability.find('[role="switch"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ availability: ['in_stock'] }]);
    await group(wrapper, 'availability').find('[role="switch"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{}]);
    wrapper.unmount();
  });
});

describe('FilterPanel — the applied chips', () => {
  const selection: FilterSelection = {
    category: ['sweaters'],
    colour: ['brown', 'natural'],
    price: [80, 160],
  };

  it('draws none unless asked', () => {
    const wrapper = mountWith(FilterPanel, {
      props: { facets: ALL_FACETS, currency: 'USD', modelValue: selection },
    });
    expect(wrapper.find('[data-part="applied"]').exists()).toBe(false);
    wrapper.unmount();
  });

  /** Spec → Anatomy item 2: one chip per selected value, in a list labelled "Active filters". */
  it('draws one chip per selected value, facet by facet, and names the list', () => {
    const wrapper = mountWith(FilterPanel, {
      props: { facets: ALL_FACETS, currency: 'USD', showApplied: true, modelValue: selection },
    });
    const list = wrapper.find('[data-part="applied"]');
    expect(list.element.tagName).toBe('UL');
    expect(list.attributes('aria-label')).toBe('Active filters');
    expect(wrapper.findAll('[data-part="chip"]').map((chip) => chip.text())).toEqual([
      'Sweaters',
      'Brown',
      'Natural',
    ]);
    wrapper.unmount();
  });

  /** Spec → Accessibility: 'each remove button is labelled "Remove filter Colour: Brown"'. */
  it('names each remove button with its facet and its value', () => {
    const wrapper = mountWith(FilterPanel, {
      props: {
        facets: [COLOUR_FACET],
        showApplied: true,
        modelValue: { colour: ['brown'] },
      },
    });
    expect(wrapper.find('[data-part="removeButton"]').attributes('aria-label')).toBe(
      'Remove filter Colour: Brown'
    );
    wrapper.unmount();
  });

  it('removes the value and reports which chip it was', async () => {
    const wrapper = mountModel({ showApplied: true, modelValue: { colour: ['brown', 'natural'] } });
    await wrapper.find('[data-part="removeButton"]').trigger('click');
    expect(wrapper.emitted('remove')).toEqual([[{ facetId: 'colour', value: 'brown' }]]);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ colour: ['natural'] }]);
    wrapper.unmount();
  });

  /** `focusChip` is what keeps focus in the row after a consumer removes a chip of its own. */
  it('exposes focusChip and focusTitle', async () => {
    const wrapper = mountWith(FilterPanel, {
      props: {
        facets: [COLOUR_FACET],
        showApplied: true,
        modelValue: { colour: ['brown', 'natural'] },
      },
    });
    (wrapper.vm as unknown as { focusChip: (index: number) => void }).focusChip(1);
    await nextTick();
    expect(document.activeElement).toBe(wrapper.findAll('[data-part="removeButton"]')[1]!.element);

    (wrapper.vm as unknown as { focusTitle: () => void }).focusTitle();
    await nextTick();
    expect(document.activeElement).toBe(wrapper.find('[data-part="title"]').element);
    wrapper.unmount();
  });
});

describe('FilterPanel — drawer mode', () => {
  it('draws the foot with Clear all and a live Show N products', async () => {
    const wrapper = mountWith(FilterPanel, {
      props: {
        facets: ALL_FACETS,
        currency: 'USD',
        mode: 'drawer',
        showHead: false,
        resultCount: 24,
      },
    });
    const foot = wrapper.find('[data-part="foot"]');
    expect(foot.exists()).toBe(true);
    const buttons = foot.findAll('button');
    expect(buttons[0]!.text()).toBe('Clear all');
    expect(buttons[1]!.text()).toBe('Show 24 products');

    await wrapper.setProps({ resultCount: 1 });
    expect(wrapper.find('[data-part="foot"]').findAll('button')[1]!.text()).toBe('Show 1 product');
    wrapper.unmount();
  });

  /** A number nobody can trust is worse than no number: before the count arrives the words stand
   *  alone. */
  it('says "Show products" before a count has arrived', () => {
    const wrapper = mountWith(FilterPanel, {
      props: { facets: [CATEGORY_FACET], mode: 'drawer' },
    });
    expect(wrapper.find('[data-part="foot"]').findAll('button')[1]!.text()).toBe('Show products');
    wrapper.unmount();
  });

  it('draws no foot in sidebar mode', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [CATEGORY_FACET] } });
    expect(wrapper.find('[data-part="foot"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('applies the pending selection on Show N products', async () => {
    const wrapper = mountModel({ mode: 'drawer', resultCount: 12, modelValue: { size: ['m'] } });
    await wrapper.find('[data-part="foot"]').findAll('button')[1]!.trigger('click');
    expect(wrapper.emitted('apply')).toEqual([[{ size: ['m'] }]]);
    wrapper.unmount();
  });

  /** Spec → Behaviour: in the drawer foot, Clear all "resets the pending selection and focus stays
   *  on it". */
  it('clears from the foot without moving focus off the button', async () => {
    const wrapper = mountModel({ mode: 'drawer', modelValue: { size: ['m'] } });
    const clear = wrapper.find('[data-part="foot"]').findAll('button')[0]!;
    (clear.element as HTMLElement).focus();
    await clear.trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{}]);
    expect(document.activeElement).toBe(clear.element);
    wrapper.unmount();
  });

  it('lets a consumer replace the foot, still reaching the panel’s own actions', async () => {
    const wrapper = mountWith(FilterPanel, {
      props: { facets: [SIZE_FACET], mode: 'drawer', resultCount: 7, modelValue: { size: ['m'] } },
      slots: {
        foot: (slot: { resultCount: number | null; clear: () => void; apply: () => void }) => [
          h(
            'button',
            { type: 'button', 'data-test': 'apply', onClick: slot.apply },
            `${slot.resultCount}`
          ),
          h('button', { type: 'button', 'data-test': 'clear', onClick: slot.clear }, 'reset'),
        ],
      },
    });
    expect(wrapper.find('[data-test="apply"]').text()).toBe('7');
    await wrapper.find('[data-test="apply"]').trigger('click');
    expect(wrapper.emitted('apply')).toEqual([[{ size: ['m'] }]]);
    await wrapper.find('[data-test="clear"]').trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('FilterPanel — the facet escape hatch', () => {
  it('lets a consumer draw one facet’s body and still write the selection', async () => {
    const wrapper = mountModel({
      facets: [{ id: 'custom', label: 'Fit', type: 'list', values: [] }],
      slots: undefined,
    });
    wrapper.unmount();

    const holder: { wrapper?: Wrapper } = {};
    holder.wrapper = mountWith(FilterPanel, {
      props: {
        facets: [{ id: 'fit', label: 'Fit', type: 'list', values: [] }],
        'onUpdate:modelValue': (selection: FilterSelection) => {
          void holder.wrapper?.setProps({ modelValue: selection });
        },
      },
      slots: {
        facet: (slot: { toggle: (value: string, checked: boolean) => void }) =>
          h(
            'button',
            { type: 'button', 'data-test': 'own', onClick: () => slot.toggle('relaxed', true) },
            'relaxed'
          ),
      },
    });
    // The disclosure, the badge and the summary are still the panel's.
    expect(holder.wrapper.find('[data-part="trigger"]').exists()).toBe(true);
    await holder.wrapper.find('[data-test="own"]').trigger('click');
    expect(holder.wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ fit: ['relaxed'] }]);
    holder.wrapper.unmount();
  });
});

describe('FilterPanel — classes', () => {
  it('merges a per-part override over the part’s own classes', () => {
    const wrapper = mountWith(FilterPanel, {
      props: {
        facets: [CATEGORY_FACET],
        classes: { root: 'bg-surface', trigger: 'py-6', count: 'text-danger' },
      },
    });
    expect(wrapper.find('[data-part="root"]').classes()).toContain('bg-surface');
    const triggerClasses = wrapper.find('[data-part="trigger"]').classes();
    expect(triggerClasses).toContain('py-6');
    // `tailwind-merge` replaces rather than appends: the part's own `py-3` is gone.
    expect(triggerClasses).not.toContain('py-3');
    expect(wrapper.find('[data-part="count"]').classes()).toContain('text-danger');
    wrapper.unmount();
  });

  it('reaches a facet’s own parts, which the panel hands the whole bag down to', () => {
    const wrapper = mountWith(FilterPanel, {
      props: {
        facets: [COLOUR_FACET, SIZE_FACET],
        classes: { swatch: 'ring-2', tile: 'rounded-none' },
      },
    });
    expect(wrapper.find('[data-part="swatch"]').classes()).toContain('ring-2');
    expect(wrapper.find('[data-part="tile"]').classes()).toContain('rounded-none');
    wrapper.unmount();
  });
});

describe('FilterPanel — messages', () => {
  it('takes a message override for every string it renders itself', () => {
    const wrapper = mountWith(FilterPanel, {
      props: {
        facets: [SIZE_FACET],
        modelValue: { size: ['m'] },
        showApplied: true,
        messages: {
          filterPanelTitle: 'Síur',
          filterPanelClearAll: 'Hreinsa allt',
          filterPanelApplied: 'Valdar síur',
          filterPanelSizeGuide: 'Stærðartafla',
        },
      },
    });
    expect(wrapper.find('h2').text()).toBe('Síur');
    expect(wrapper.find('[data-part="clear"]').text()).toBe('Hreinsa allt');
    expect(wrapper.find('[data-part="applied"]').attributes('aria-label')).toBe('Valdar síur');
    expect(wrapper.find('[data-part="sizeGuide"]').text()).toBe('Stærðartafla');
    wrapper.unmount();
  });
});

describe('FilterPanel — the narrow container', () => {
  /** The spec's content checklist: a 320px column with no horizontal overflow and nothing thrown. */
  it('renders every facet type in a 20rem host', () => {
    const wrapper = mountNarrow(FilterPanel, {
      props: {
        facets: [...ALL_FACETS, MATERIAL_FACET],
        currency: 'USD',
        showApplied: true,
        modelValue: { colour: ['brown'], size: ['m'], price: [80, 160] },
      },
    });
    // `[data-facet]` as well as the part name: `RangeSlider` draws a `data-part="group"` of its
    // own (the `role="group"` that names its two thumbs), which an unscoped selector also matches.
    expect(wrapper.findAll('[data-part="group"][data-facet]')).toHaveLength(6);
    expect(wrapper.find('[data-part="range"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

/**
 * One assertion per row of the spec's own **States** table that a mounted fragment can reach. The
 * rows that are pure CSS (`hover`, `focus-visible`, the pressed thumb) are proven in
 * `filterPanelRing.browser.spec.ts` against the compiled stylesheet instead — a class assertion
 * cannot see a ring, and axe cannot either.
 */
describe('FilterPanel — axe, one state at a time', () => {
  async function clean(props: Record<string, unknown>): Promise<void> {
    const wrapper = mountWith(FilterPanel, {
      props: { currency: 'USD', ...props },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  }

  it('sidebar, every facet type, nothing selected', async () => {
    await clean({ facets: ALL_FACETS });
  });

  it('sidebar, every facet type, a selection in each', async () => {
    await clean({
      facets: ALL_FACETS,
      modelValue: {
        category: ['sweaters'],
        colour: ['brown', 'natural'],
        size: ['m'],
        price: [80, 160],
        availability: ['in_stock'],
      },
    });
  });

  it('collapsed groups with summaries', async () => {
    await clean({
      facets: ALL_FACETS.map((facet) => ({ ...facet, collapsed: true })),
      modelValue: { colour: ['brown', 'natural'] },
    });
  });

  it('a long searchable list', async () => {
    await clean({ facets: [MATERIAL_FACET] });
  });

  it('a long searchable list with no matches', async () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [MATERIAL_FACET] } });
    await wrapper.find('[data-part="search"] input').setValue('zzz');
    expect(wrapper.find('[data-part="noMatches"]').text()).toContain('No matches for');
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('a swatch grid', async () => {
    await clean({
      facets: [{ ...COLOUR_FACET, layout: 'grid' }],
      modelValue: { colour: ['natural'] },
    });
  });

  it('values with no products left', async () => {
    await clean({ facets: [COLOUR_FACET, SIZE_FACET] });
  });

  it('a nested category tree', async () => {
    await clean({ facets: [CATEGORY_TREE_FACET], modelValue: { category: ['tableware'] } });
  });

  it('applied chips', async () => {
    await clean({
      facets: ALL_FACETS,
      showApplied: true,
      modelValue: { category: ['sweaters'], colour: ['brown'], size: ['m'] },
    });
  });

  it('drawer mode with chips and the foot', async () => {
    await clean({
      facets: ALL_FACETS,
      mode: 'drawer',
      showHead: false,
      showApplied: true,
      resultCount: 24,
      modelValue: { colour: ['brown'] },
    });
  });

  it('an is-IS price range', async () => {
    await clean({ facets: [PRICE_FACET], locale: 'is-IS', currency: 'ISK' });
  });

  it('a toggle facet with both switches on', async () => {
    await clean({
      facets: [AVAILABILITY_FACET],
      modelValue: { availability: ['in_stock', 'preorder'] },
    });
  });

  it('a range with no histogram', async () => {
    await clean({ facets: [{ ...PRICE_FACET, histogram: undefined }] });
  });

  it('no facets at all', async () => {
    await clean({ facets: [] });
  });

  it('in a narrow container', async () => {
    const wrapper = mountNarrow(FilterPanel, {
      props: {
        facets: ALL_FACETS,
        currency: 'USD',
        showApplied: true,
        modelValue: { size: ['m'] },
      },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
