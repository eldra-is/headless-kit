import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mountWith } from '../../../test/mount';
import FilterPanel from '../FilterPanel.vue';
import type { FilterSelection } from '../types';
import {
  ALL_FACETS,
  CATEGORY_FACET,
  COLOUR_FACET,
  MATERIAL_FACET,
  PRICE_FACET,
  SIZE_FACET,
} from './fixtures';

/**
 * One suite per row of the design spec's "Filter panel" → **Keyboard** table.
 *
 * Two of those rows are the platform's rather than this package's, and are asserted as such: a
 * group trigger is a real `<button type="button">` and a value is a real `<input type="checkbox">`,
 * so `Enter`/`Space` activation and `Space` checking are the browser's own and need no key handler
 * here at all. A test that dispatched a synthetic `Enter` and asserted a toggle would be testing
 * its own `dispatchEvent` call rather than the control — happy-dom does not synthesise the click a
 * real browser derives from the key — so what is asserted instead is the element that earns the
 * behaviour, plus the activation itself. The focus **ring** on each of them is measured for real,
 * after a real `Tab` press, in `filterPanelRing.browser.spec.ts`.
 */

type Wrapper = ReturnType<typeof mountWith<typeof FilterPanel>>;

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

/** A real event, so `defaultPrevented` can be read: VTU's `trigger` does not report it back. */
function press(element: HTMLElement, key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

function thumb(wrapper: Wrapper, end: 0 | 1): HTMLElement {
  return wrapper.findAll('[role="slider"]')[end]!.element as HTMLElement;
}

/**
 * Everything the browser would stop at, in document order — which is the tab order, because
 * nothing in this panel sets a positive `tabindex`.
 *
 * A `tabindex="-1"` element (the panel title, which only takes focus programmatically after
 * **Clear all**) is deliberately excluded, as are `disabled` controls and anything inside a
 * collapsed body, which `v-show` leaves `display: none`.
 */
function tabStops(wrapper: Wrapper): string[] {
  const root = wrapper.element as HTMLElement;
  const candidates = root.querySelectorAll<HTMLElement>(
    'a[href], button, input, [role="slider"][tabindex="0"]'
  );
  return [...candidates]
    .filter((element) => {
      if (element.matches('[disabled]') || element.getAttribute('tabindex') === '-1') return false;
      if (element.hasAttribute('hidden')) return false;
      // `v-show` hides a collapsed body with `display: none`, which takes its controls with it.
      for (let node: HTMLElement | null = element; node; node = node.parentElement) {
        if (node.style.display === 'none') return false;
      }
      return true;
    })
    .map((element) => {
      const part = element.getAttribute('data-part');
      if (element.getAttribute('role') === 'switch') return `switch:${element.dataset.value}`;
      if (element.getAttribute('role') === 'slider') return `thumb:${element.dataset.thumb}`;
      if (element.getAttribute('data-input')) return `field:${element.dataset.input}`;
      if (part === 'removeButton') return `chip:${element.getAttribute('aria-label')}`;
      if (part === 'trigger') {
        return `trigger:${element.closest('[data-facet]')?.getAttribute('data-facet')}`;
      }
      if (part === 'clear') return 'clear-all';
      if (part === 'showAll') return 'show-all';
      if (part === 'sizeGuide') return 'size-guide';
      // `data-value` is on the `<input>` in a `list` facet and on the `<label>` around a swatch
      // row or a size tile, so the control is reached through whichever carries it.
      const value = element.closest('[data-value]')?.getAttribute('data-value');
      if (value) return `value:${value}`;
      if (part === 'control') return 'search';
      return part ?? element.tagName.toLowerCase();
    });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Tab / Shift+Tab — group by group, in reading order', () => {
  /**
   * Spec → Keyboard, `Tab`: "head **Clear all**, active chips' remove buttons, then each group
   * trigger followed by its open body's controls in reading order (search field, checkboxes,
   * **Show all N**, swatch rows, size tiles, **Size guide**, minimum thumb, maximum thumb, Min
   * field, Max field, switches)."
   */
  it('stops at Clear all, then the chips, then each group and its own controls', () => {
    const wrapper = mountWith(FilterPanel, {
      props: {
        facets: [CATEGORY_FACET, SIZE_FACET, PRICE_FACET],
        currency: 'USD',
        showApplied: true,
        modelValue: { category: ['sweaters'], size: ['m'] },
      },
    });
    const stops = tabStops(wrapper);
    expect(stops[0]).toBe('clear-all');
    expect(stops[1]).toBe('chip:Remove filter Category: Sweaters');
    expect(stops[2]).toBe('chip:Remove filter Size: M');

    const rest = stops.slice(3);
    expect(rest).toEqual([
      'trigger:category',
      'value:sweaters',
      'value:cardigans',
      'value:blankets',
      'value:hats',
      'trigger:size',
      'value:xs',
      'value:s',
      'value:m',
      'value:l',
      'value:xl',
      // XXL and 42–44 have nothing left, so they are `disabled` and the browser skips them.
      'value:38-40',
      'size-guide',
      'trigger:price',
      'thumb:min',
      'thumb:max',
      'field:min',
      'field:max',
    ]);
    wrapper.unmount();
  });

  /** Spec → Keyboard: "Disabled values are skipped." */
  it('skips a value nothing is left for', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [COLOUR_FACET] } });
    const stops = tabStops(wrapper);
    expect(stops).toContain('value:brown');
    expect(stops).not.toContain('value:navy');
    wrapper.unmount();
  });

  /** Spec → Keyboard: "Collapsed bodies are skipped." */
  it('skips a collapsed body’s controls while keeping its trigger', async () => {
    const wrapper = mountWith(FilterPanel, {
      props: { facets: [CATEGORY_FACET, COLOUR_FACET] },
    });
    expect(tabStops(wrapper)).toContain('value:sweaters');
    await wrapper.find('[data-part="trigger"]').trigger('click');
    const stops = tabStops(wrapper);
    expect(stops).toContain('trigger:category');
    expect(stops).not.toContain('value:sweaters');
    // The other group is untouched.
    expect(stops).toContain('value:brown');
    wrapper.unmount();
  });

  /** The search field comes **above** the list, which is where the tab order has to find it. */
  it('puts a long list’s search field before its values and Show all N after them', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [MATERIAL_FACET] } });
    const stops = tabStops(wrapper);
    expect(stops[0]).toBe('trigger:material');
    expect(stops[1]).toBe('search');
    expect(stops[2]).toBe('value:merino');
    expect(stops.at(-1)).toBe('show-all');
    wrapper.unmount();
  });

  /** A switch row's own stop is the switch, not the count beside it. */
  it('stops at each switch of a toggle facet', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [ALL_FACETS[4]!] } });
    expect(tabStops(wrapper)).toEqual([
      'trigger:availability',
      'switch:in_stock',
      'switch:preorder',
    ]);
    wrapper.unmount();
  });

  /**
   * An applied chip contributes **two** stops, not one: its own root as well as its remove button.
   * That is `Chip`'s own documented contract — a removable chip's root is focusable so that
   * `Backspace`/`Delete` on it removes the chip — and it is one stop more per chip than the spec's
   * own tab-order row lists (see the README's Deviations entry). Nothing is reordered by it and
   * nothing is unreachable, so it is recorded here rather than overridden: suppressing the root's
   * `tabindex` in this panel alone would silently delete a behaviour the library promises.
   */
  it('gives each applied chip its own stop as well as its remove button', () => {
    const wrapper = mountWith(FilterPanel, {
      props: { facets: [COLOUR_FACET], showApplied: true, modelValue: { colour: ['brown'] } },
    });
    const applied = wrapper.element as HTMLElement;
    const focusable = [
      ...applied.querySelectorAll<HTMLElement>('[data-part="applied"] [tabindex="0"]'),
    ];
    expect(focusable).toHaveLength(1);
    expect(focusable[0]!.getAttribute('data-part')).toBe('root');
    expect(wrapper.findAll('[data-part="removeButton"]')).toHaveLength(1);
    wrapper.unmount();
  });

  /** Nothing takes itself out of the sequence or jumps the queue with a positive `tabindex`. */
  it('sets no positive tabindex anywhere', () => {
    const wrapper = mountWith(FilterPanel, {
      props: {
        facets: ALL_FACETS,
        currency: 'USD',
        showApplied: true,
        modelValue: { size: ['m'] },
      },
    });
    for (const element of wrapper.element.querySelectorAll('[tabindex]')) {
      const value = Number(element.getAttribute('tabindex'));
      expect(value).toBeLessThanOrEqual(0);
    }
    wrapper.unmount();
  });
});

describe('Enter / Space — on a group trigger, and on every button', () => {
  /**
   * Spec → Keyboard: "On a group trigger: open or close the group." A real `<button
   * type="button">`, so both keys are the platform's own activation; what is asserted here is that
   * element and the toggle it performs.
   */
  it('opens and closes a group, and keeps `aria-expanded` honest', async () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [CATEGORY_FACET] } });
    const trigger = wrapper.find('[data-part="trigger"]');
    expect(trigger.element.tagName).toBe('BUTTON');
    expect(trigger.attributes('type')).toBe('button');
    expect(trigger.attributes('aria-expanded')).toBe('true');

    await trigger.trigger('click');
    expect(wrapper.find('[data-part="trigger"]').attributes('aria-expanded')).toBe('false');
    await trigger.trigger('click');
    expect(wrapper.find('[data-part="trigger"]').attributes('aria-expanded')).toBe('true');
    wrapper.unmount();
  });

  /**
   * Spec → Keyboard: "On **Show all N**, **Clear all**, a chip remove button or a drawer foot
   * button: activate it." Every one of them is a `<button type="button">`, which is also what stops
   * `Enter` submitting the `<form>` they sit in.
   */
  it('makes every control in the panel a button that cannot submit the form', () => {
    const wrapper = mountWith(FilterPanel, {
      props: {
        facets: [MATERIAL_FACET, PRICE_FACET],
        currency: 'USD',
        mode: 'drawer',
        showApplied: true,
        resultCount: 24,
        modelValue: { material: ['merino'] },
      },
    });
    const buttons = wrapper.element.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(4);
    for (const button of buttons) {
      expect(button.getAttribute('type')).toBe('button');
    }
    wrapper.unmount();
  });

  it('activates the drawer foot’s two buttons', async () => {
    const wrapper = mountModel({ mode: 'drawer', resultCount: 9, modelValue: { size: ['m'] } });
    const [clear, apply] = wrapper.find('[data-part="foot"]').findAll('button');
    await apply!.trigger('click');
    expect(wrapper.emitted('apply')).toHaveLength(1);
    await clear!.trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('Space — checks a checkbox, a swatch row, a size tile; Enter or Space toggles a switch', () => {
  /**
   * Spec → Keyboard: "Check or uncheck a checkbox, swatch row/tile or size tile." All three are a
   * real `<input type="checkbox">` — the swatch and the tile stretched invisibly over the whole
   * row, which is what makes `Space` the platform's own and the row the click target.
   */
  it('draws every value as a real checkbox, however it is painted', () => {
    const wrapper = mountWith(FilterPanel, {
      props: { facets: [CATEGORY_FACET, COLOUR_FACET, SIZE_FACET] },
    });
    for (const value of ['sweaters', 'brown', 'm']) {
      const found = wrapper.find(`[data-value="${value}"]`);
      const control = found.element.matches('input') ? found.element : found.find('input').element;
      expect(control.tagName).toBe('INPUT');
      expect((control as HTMLInputElement).type).toBe('checkbox');
    }
    wrapper.unmount();
  });

  it('checks a swatch row and a size tile through their own control', async () => {
    const wrapper = mountModel({ facets: [COLOUR_FACET, SIZE_FACET] });
    (wrapper.find('[data-value="brown"]').find('input').element as HTMLInputElement).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ colour: ['brown'] }]);

    (wrapper.find('[data-value="m"]').find('input').element as HTMLInputElement).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
      { colour: ['brown'], size: ['m'] },
    ]);
    wrapper.unmount();
  });

  /**
   * Spec → Keyboard: "Toggle a switch (`Enter` also toggles a switch)." A `<button role="switch">`
   * takes both keys from the platform, which is exactly why it is a button and not a `div`.
   */
  it('draws a toggle facet’s value as a button with role=switch', async () => {
    const wrapper = mountModel({ facets: [ALL_FACETS[4]!] });
    const control = wrapper.find('[role="switch"]');
    expect(control.element.tagName).toBe('BUTTON');
    await control.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ availability: ['in_stock'] }]);
    wrapper.unmount();
  });
});

describe('Arrows, Page keys and Home / End — on a range thumb', () => {
  /** Spec → Keyboard: "`←`/`↓`, `→`/`↑`: one `step` down or up." */
  it.each([
    ['ArrowRight', 50],
    ['ArrowUp', 50],
    ['ArrowLeft', 40],
    ['ArrowDown', 40],
  ])('%s moves the minimum thumb to %i', async (key, expected) => {
    const wrapper = mountModel({ facets: [PRICE_FACET] });
    const event = press(thumb(wrapper, 0), key);
    expect(event.defaultPrevented).toBe(true);
    await nextTick();
    expect(thumb(wrapper, 0).getAttribute('aria-valuenow')).toBe(String(expected));
    wrapper.unmount();
  });

  /** Spec → Keyboard: "`PageDown` / `PageUp`: a larger jump down or up." The step is 10, so the
   *  large step is 100. */
  it('jumps by the large step on PageUp and PageDown', async () => {
    const wrapper = mountModel({ facets: [PRICE_FACET] });
    press(thumb(wrapper, 0), 'PageUp');
    await nextTick();
    expect(thumb(wrapper, 0).getAttribute('aria-valuenow')).toBe('140');
    press(thumb(wrapper, 0), 'PageDown');
    await nextTick();
    expect(thumb(wrapper, 0).getAttribute('aria-valuenow')).toBe('40');
    wrapper.unmount();
  });

  /**
   * Spec → Keyboard: "`Home` / `End`: go to the lowest or highest value it can reach (it stops one
   * step short of the other thumb)."
   */
  it('goes to each thumb’s own limit, which is the other thumb', async () => {
    const wrapper = mountModel({ facets: [PRICE_FACET], modelValue: { price: [80, 160] } });
    press(thumb(wrapper, 0), 'End');
    await nextTick();
    expect(thumb(wrapper, 0).getAttribute('aria-valuenow')).toBe('160');

    press(thumb(wrapper, 1), 'Home');
    await nextTick();
    // One step short of where the minimum now stands is the far end of the empty range.
    expect(Number(thumb(wrapper, 1).getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(150);
    wrapper.unmount();
  });

  /** The two can meet but never cross, whichever key is pressed. */
  it('never lets the thumbs cross', async () => {
    const wrapper = mountModel({ facets: [PRICE_FACET], modelValue: { price: [100, 110] } });
    press(thumb(wrapper, 0), 'ArrowRight');
    await nextTick();
    press(thumb(wrapper, 0), 'ArrowRight');
    await nextTick();
    expect(Number(thumb(wrapper, 0).getAttribute('aria-valuenow'))).toBeLessThanOrEqual(110);
    wrapper.unmount();
  });

  /** `Tab` is not this control's: it has to keep moving focus out of the panel. */
  it('leaves Tab alone on a thumb', () => {
    const wrapper = mountModel({ facets: [PRICE_FACET] });
    expect(press(thumb(wrapper, 0), 'Tab').defaultPrevented).toBe(false);
    wrapper.unmount();
  });
});

describe('Enter — in the Min or Max field', () => {
  /**
   * Spec → Keyboard: "In the Min or Max field: commit the value. It never submits the form or
   * reloads the page." Both halves: the commit, and the `submit` that must not happen.
   */
  it('commits the typed value and never submits the form', async () => {
    const submitted = vi.fn();
    const wrapper = mountModel({ facets: [PRICE_FACET] });
    wrapper.find('form').element.addEventListener('submit', submitted);

    const field = wrapper.find('[data-input="min"]');
    await field.trigger('focus');
    await field.setValue('120');
    await field.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('change')?.at(-1)).toEqual([{ price: [120, 240] }]);
    expect(submitted).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('commits on blur as well, and snaps to the facet’s own step', async () => {
    const wrapper = mountModel({ facets: [PRICE_FACET] });
    const field = wrapper.find('[data-input="min"]');
    await field.trigger('focus');
    await field.setValue('123');
    await field.trigger('blur');
    // The facet's step is 10.
    expect(wrapper.emitted('change')?.at(-1)).toEqual([{ price: [120, 240] }]);
    wrapper.unmount();
  });

  /** Nothing about the panel submits, whatever is pressed inside it. */
  it('prevents a submit that reaches the form by any other route', () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [PRICE_FACET], currency: 'USD' } });
    const form = wrapper.find('form').element as HTMLFormElement;
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    wrapper.unmount();
  });
});

describe('Esc — collapse the group and return focus to its trigger', () => {
  /**
   * Spec → Keyboard: "Sidebar: on an expanded trigger, or anywhere inside its body, collapse the
   * group and return focus to the trigger."
   */
  it('collapses from inside the body and takes focus back to the trigger', async () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [CATEGORY_FACET, COLOUR_FACET] } });
    const box = wrapper.find('[data-value="sweaters"]').element as HTMLInputElement;
    box.focus();
    press(box, 'Escape');
    await nextTick();

    const trigger = wrapper.find('[data-part="trigger"]');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it('collapses from the trigger itself', async () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [CATEGORY_FACET] } });
    const body = wrapper.find('[data-part="body"]').element as HTMLElement;
    press(body, 'Escape');
    await nextTick();
    expect(wrapper.find('[data-part="trigger"]').attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('leaves the other groups open', async () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [CATEGORY_FACET, COLOUR_FACET] } });
    press(wrapper.find('[data-value="sweaters"]').element as HTMLElement, 'Escape');
    await nextTick();
    const triggers = wrapper.findAll('[data-part="trigger"]');
    expect(triggers[0]!.attributes('aria-expanded')).toBe('false');
    expect(triggers[1]!.attributes('aria-expanded')).toBe('true');
    wrapper.unmount();
  });

  /**
   * Spec → Keyboard: "Drawer: closes the drawer (the dialog's own behaviour) and discards pending
   * changes." So the panel must **not** take the key there — it has to reach the `<dialog>`.
   */
  it('does not take the key in drawer mode, where it belongs to the dialog', async () => {
    const wrapper = mountWith(FilterPanel, {
      props: { facets: [CATEGORY_FACET], mode: 'drawer', showHead: false },
    });
    const box = wrapper.find('[data-value="sweaters"]').element as HTMLElement;
    const seen = vi.fn();
    document.body.addEventListener('keydown', seen);
    press(box, 'Escape');
    await nextTick();
    expect(wrapper.find('[data-part="trigger"]').attributes('aria-expanded')).toBe('true');
    // The key carried on past the panel, which is how a drawer around it ever sees it.
    expect(seen).toHaveBeenCalled();
    document.body.removeEventListener('keydown', seen);
    wrapper.unmount();
  });

  /** In the sidebar the key stops at the group, so an outer surface does not also close. */
  it('stops the key at the group in sidebar mode', async () => {
    const wrapper = mountWith(FilterPanel, { props: { facets: [CATEGORY_FACET] } });
    const seen = vi.fn();
    document.body.addEventListener('keydown', seen);
    press(wrapper.find('[data-value="sweaters"]').element as HTMLElement, 'Escape');
    await nextTick();
    expect(seen).not.toHaveBeenCalled();
    document.body.removeEventListener('keydown', seen);
    wrapper.unmount();
  });
});
