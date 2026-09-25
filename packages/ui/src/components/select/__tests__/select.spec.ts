import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconGift, IconWorld } from '@tabler/icons-vue';
import type { VueWrapper } from '@vue/test-utils';
import { computed, nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { enUS } from '../../../messages/en-US';
import { FIELD_KEY, type FieldContext } from '../../field-wrapper/context';
import FieldWrapper from '../../field-wrapper/FieldWrapper.vue';
import Select from '../Select.vue';
import type { SelectOption } from '../types';

/** The spec's own "Topic" list: six plain options, so `searchable` stays off by default. */
const TOPIC: SelectOption[] = [
  { value: 'order', label: "An order I've placed" },
  { value: 'returns', label: 'Returns and exchanges' },
  { value: 'care', label: 'Product care' },
  { value: 'wholesale', label: 'Wholesale and stockists' },
  { value: 'other', label: 'Something else' },
];

/** The spec's own grouped, diacritic-carrying country list. */
const COUNTRIES: SelectOption[] = [
  { value: 'is-most', label: 'Ísland', group: 'Most used' },
  { value: 'us-most', label: 'United States', group: 'Most used' },
  { value: 'is', label: 'Ísland', group: 'All countries' },
  { value: 'mx', label: 'Mexico', group: 'All countries' },
  { value: 'se', label: 'Sweden', group: 'All countries' },
];

/** The spec's own glaze colours, with a sold-out option. */
const COLOURS: SelectOption[] = [
  { value: 'oat', label: 'Oat', swatch: '#e7ded1', meta: 'In stock' },
  {
    value: 'charcoal',
    label: 'Charcoal',
    swatch: '#2f2f2f',
    meta: 'Only 2 left',
    metaTone: 'warning',
  },
  { value: 'clay', label: 'Clay', swatch: '#8c3b2a', meta: 'In stock' },
  {
    value: 'moss',
    label: 'Moss',
    swatch: '#2f5d4f',
    meta: 'Sold out',
    metaTone: 'danger',
    disabled: true,
  },
];

/** Twelve options, which is past the spec's "more than 10" threshold. */
const MANY: SelectOption[] = Array.from({ length: 12 }, (_, index) => ({
  value: `v${index}`,
  label: `Option ${index}`,
}));

/** Every mount needs an accessible name; a `FieldWrapper` supplies one in real use. */
const NAME = { 'aria-label': 'Topic' };

const mounted: VueWrapper[] = [];

function mount(props: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
  const wrapper = mountWith(Select, {
    props: { options: TOPIC, ...props },
    attrs: NAME,
    ...options,
  });
  mounted.push(wrapper as unknown as VueWrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
});

/** `afterOpen` waits a tick before it moves focus; floating-ui settles on a promise of its own. */
async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const triggerOf = (wrapper: VueWrapper | ReturnType<typeof mount>) =>
  wrapper.find('[data-part="trigger"]');
const trigger = (wrapper: ReturnType<typeof mount>) =>
  triggerOf(wrapper).element as HTMLButtonElement;
const panel = (wrapper: ReturnType<typeof mount>) => wrapper.find('[data-part="panel"]');
const optionEls = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('[data-part="option"]');
const search = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('[data-part="search"]').element as HTMLInputElement;
const native = (wrapper: ReturnType<typeof mount>) =>
  wrapper.find('[data-part="native"]').element as HTMLSelectElement;
/**
 * The label of whatever `aria-activedescendant` points at. Read off the element that carries the
 * attribute rather than `document.activeElement`: `@vue/test-utils`' `trigger('click')` does not
 * move focus the way a real pointer press does, and *which* element owns the attribute is asserted
 * on its own in the searchable specs.
 */
const activeLabel = (wrapper: ReturnType<typeof mount>): string | undefined => {
  const owner = wrapper.element.querySelector('[aria-activedescendant]');
  const id = owner?.getAttribute('aria-activedescendant') ?? undefined;
  return id === undefined ? undefined : (document.getElementById(id)?.textContent?.trim() ?? '');
};

/** A pointer press followed by its click — what a real mouse does, and what the trigger reads. */
async function press(target: ReturnType<typeof triggerOf>): Promise<void> {
  await target.trigger('pointerdown');
  await target.trigger('click');
  await flush();
}

async function key(
  element: Element,
  init: KeyboardEventInit & { key: string }
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  await flush();
  return event;
}

// -------------------------------------------------------------------------------------------

describe('Select — anatomy and parts', () => {
  it('renders a combobox trigger, a hidden native select, and no panel until it opens', () => {
    const wrapper = mount({ name: 'topic' });
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(trigger(wrapper).tagName).toBe('BUTTON');
    expect(trigger(wrapper).getAttribute('type')).toBe('button');
    expect(trigger(wrapper).getAttribute('role')).toBe('combobox');
    expect(trigger(wrapper).getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger(wrapper).getAttribute('aria-expanded')).toBe('false');
    // `aria-controls` is a *required* property of `role="combobox"` (ARIA 1.2), so it is on the
    // trigger closed as well as open, and never changes.
    expect(trigger(wrapper).getAttribute('aria-controls')).toBe(`${trigger(wrapper).id}-listbox`);
    expect(panel(wrapper).exists()).toBe(false);

    const select = native(wrapper);
    expect(select.tagName).toBe('SELECT');
    expect(select.hasAttribute('hidden')).toBe(true);
    expect(select.getAttribute('aria-hidden')).toBe('true');
    expect(select.getAttribute('tabindex')).toBe('-1');
    expect(select.getAttribute('name')).toBe('topic');
  });

  it('shows the placeholder in place of a value, and the value once there is one', async () => {
    const wrapper = mount();
    expect(wrapper.find('[data-part="placeholder"]').text()).toBe(enUS.selectPlaceholder);
    expect(wrapper.find('[data-part="value"]').exists()).toBe(false);

    await wrapper.setProps({ modelValue: 'care' });
    expect(wrapper.find('[data-part="placeholder"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="value"]').text()).toBe('Product care');
  });

  it('renders every part of an open, searchable, grouped, rich list', async () => {
    const wrapper = mount({ options: COLOURS, searchable: true, modelValue: 'oat' });
    await press(triggerOf(wrapper));

    expect(panel(wrapper).exists()).toBe(true);
    expect(wrapper.find('[data-part="search"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="listbox"]').attributes('role')).toBe('listbox');
    expect(wrapper.find('[data-part="optionSwatch"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="optionMeta"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="optionCheck"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="optionLabel"]').exists()).toBe(true);
  });

  it('renders a leading icon in the trigger and an option icon in a row and the value', async () => {
    const wrapper = mount({
      leadingIcon: IconWorld,
      options: [{ value: 'kraft', label: 'Recycled kraft paper', icon: IconGift }],
      modelValue: 'kraft',
    });
    expect(wrapper.find('[data-part="leadingIcon"]').exists()).toBe(true);
    // The chosen option's mark shows in the trigger as well as in its row.
    expect(wrapper.find('[data-part="value"] [data-part="optionIcon"]').exists()).toBe(true);
    await press(triggerOf(wrapper));
    expect(wrapper.find('[data-part="option"] [data-part="optionIcon"]').exists()).toBe(true);
    // Decorative: the row's own text is what names it.
    expect(wrapper.find('[data-part="optionIcon"]').attributes('aria-hidden')).toBe('true');
  });

  it('merges a per-part class override', async () => {
    const wrapper = mount({
      classes: { root: 'mt-4', trigger: 'text-body-lg', option: 'px-6', panel: 'max-h-64' },
    });
    expect(wrapper.classes()).toContain('mt-4');
    expect(trigger(wrapper).className).toContain('text-body-lg');
    // `text-control` and the override are one merge group, so only the override survives.
    expect(trigger(wrapper).className).not.toContain('text-control ');

    await press(triggerOf(wrapper));
    const option = optionEls(wrapper)[0]?.element as HTMLElement;
    expect(option.className).toContain('px-6');
    expect(option.className).not.toContain('px-2 ');
    // `eldra-select-panel-height` is in Tailwind's own `max-h` group, so `max-h-64` replaces it
    // and leaves the width clamp alone.
    const panelClass = panel(wrapper).element.className;
    expect(panelClass).toContain('max-h-64');
    expect(panelClass).not.toContain('eldra-select-panel-height');
    expect(panelClass).toContain('eldra-select-panel-width');
  });

  it('puts fall-through attributes on the trigger, not on the root', () => {
    const wrapper = mount({}, { attrs: { ...NAME, 'data-testid': 'topic' } });
    expect(wrapper.attributes('data-testid')).toBeUndefined();
    expect(trigger(wrapper).getAttribute('data-testid')).toBe('topic');
    expect(trigger(wrapper).getAttribute('aria-label')).toBe('Topic');
  });
});

describe('Select — opening', () => {
  it('opens on a pointer click and closes on the next one', async () => {
    const wrapper = mount();
    await press(triggerOf(wrapper));
    expect(panel(wrapper).exists()).toBe(true);
    expect(trigger(wrapper).getAttribute('aria-expanded')).toBe('true');
    const controls = trigger(wrapper).getAttribute('aria-controls');
    expect(controls).toBe(wrapper.find('[data-part="listbox"]').attributes('id'));
    expect(wrapper.emitted('open')).toHaveLength(1);

    await press(triggerOf(wrapper));
    expect(panel(wrapper).exists()).toBe(false);
    expect(trigger(wrapper).getAttribute('aria-controls')).toBe(controls);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it.each(['ArrowDown', 'Enter', ' '])(
    'opens on %s with the selected option active',
    async (pressed) => {
      const wrapper = mount({ modelValue: 'care' });
      trigger(wrapper).focus();
      const event = await key(trigger(wrapper), { key: pressed });
      expect(event.defaultPrevented).toBe(true);
      expect(panel(wrapper).exists()).toBe(true);
      expect(activeLabel(wrapper)).toBe('Product care');
    }
  );

  it('opens on ArrowUp with the LAST option active when there is no search field', async () => {
    const wrapper = mount();
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowUp' });
    expect(activeLabel(wrapper)).toBe('Something else');
  });

  it('opens on ArrowUp with the selected option active when there IS a search field', async () => {
    const wrapper = mount({ options: MANY, modelValue: 'v3' });
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(search(wrapper));
    expect(activeLabel(wrapper)).toBe('Option 3');
  });

  it('falls back to the first enabled option when nothing is selected', async () => {
    const wrapper = mount({ options: [{ value: 'x', label: 'X', disabled: true }, ...TOPIC] });
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowDown' });
    expect(activeLabel(wrapper)).toBe("An order I've placed");
  });

  it('does not open, and stays out of the tab order, when disabled', async () => {
    const wrapper = mount({ disabled: true });
    expect(trigger(wrapper).disabled).toBe(true);
    expect(trigger(wrapper).getAttribute('aria-disabled')).toBe('true');
    await press(triggerOf(wrapper));
    const event = await key(trigger(wrapper), { key: 'ArrowDown' });
    expect(panel(wrapper).exists()).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.emitted('open')).toBeUndefined();
  });

  it('never opens and shows no chevron when read-only', async () => {
    const wrapper = mount({ readonly: true, modelValue: 'care' });
    expect(trigger(wrapper).getAttribute('aria-readonly')).toBe('true');
    expect(trigger(wrapper).disabled).toBe(false);
    expect(wrapper.find('[data-part="chevron"]').exists()).toBe(false);
    await press(triggerOf(wrapper));
    expect(panel(wrapper).exists()).toBe(false);
  });

  it('leaves every key alone on a read-only trigger rather than swallowing it', async () => {
    const wrapper = mount({ readonly: true, modelValue: 'care', clearable: true });
    trigger(wrapper).focus();
    for (const pressed of ['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'a', 'Backspace']) {
      const event = await key(trigger(wrapper), { key: pressed });
      expect(event.defaultPrevented, pressed).toBe(false);
    }
    expect(panel(wrapper).exists()).toBe(false);
    expect(wrapper.emitted('clear')).toBeUndefined();
  });

  it('focuses the trigger without opening when a label forwards its click', async () => {
    const wrapper = mount();
    // A `<label for>` click reaches the button as a click with no pointer press behind it.
    trigger(wrapper).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    await flush();
    expect(panel(wrapper).exists()).toBe(false);
    expect(document.activeElement).toBe(trigger(wrapper));
  });

  it('does not arm the next click with a press that was dragged off the trigger', async () => {
    const wrapper = mount();
    await triggerOf(wrapper).trigger('pointerdown');
    // The pointer left the trigger and came up on the page, so no click ever arrives.
    document.body.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await flush();
    expect(panel(wrapper).exists()).toBe(false);

    // The next click is a label's, and must still only focus.
    trigger(wrapper).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    await flush();
    expect(panel(wrapper).exists()).toBe(false);
  });

  it('still opens when the press ends on the trigger', async () => {
    const wrapper = mount();
    await triggerOf(wrapper).trigger('pointerdown');
    trigger(wrapper).dispatchEvent(new Event('pointerup', { bubbles: true }));
    trigger(wrapper).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    await flush();
    expect(panel(wrapper).exists()).toBe(true);
  });

  it('closes any other open select when it opens', async () => {
    const first = mount();
    const second = mount({ options: COLOURS });
    await press(triggerOf(first));
    expect(panel(first).exists()).toBe(true);

    await press(triggerOf(second));
    expect(panel(second).exists()).toBe(true);
    expect(panel(first).exists()).toBe(false);
    expect(first.emitted('close')).toHaveLength(1);
  });
});

describe('Select — moving and choosing', () => {
  it('moves the active option with the arrows and stops at the ends', async () => {
    const wrapper = mount();
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowDown' });
    expect(activeLabel(wrapper)).toBe("An order I've placed");

    await key(trigger(wrapper), { key: 'ArrowDown' });
    expect(activeLabel(wrapper)).toBe('Returns and exchanges');
    await key(trigger(wrapper), { key: 'ArrowUp' });
    expect(activeLabel(wrapper)).toBe("An order I've placed");
    // ...and it does not wrap.
    await key(trigger(wrapper), { key: 'ArrowUp' });
    expect(activeLabel(wrapper)).toBe("An order I've placed");
  });

  it('skips disabled options with the arrows and refuses to choose one', async () => {
    const wrapper = mount({ options: COLOURS, searchable: false });
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowDown' });
    await key(trigger(wrapper), { key: 'End' });
    // "Moss" is sold out, so `End` lands on the last *enabled* option instead.
    expect(activeLabel(wrapper)).toContain('Clay');

    await optionEls(wrapper).at(-1)?.trigger('click');
    await flush();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(panel(wrapper).exists()).toBe(true);
  });

  it('moves by ten with PageDown and PageUp, and to the ends with Home and End', async () => {
    const wrapper = mount({ options: MANY, searchable: false });
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowDown' });
    await key(trigger(wrapper), { key: 'PageDown' });
    expect(activeLabel(wrapper)).toBe('Option 10');
    await key(trigger(wrapper), { key: 'PageUp' });
    expect(activeLabel(wrapper)).toBe('Option 0');
    await key(trigger(wrapper), { key: 'End' });
    expect(activeLabel(wrapper)).toBe('Option 11');
    await key(trigger(wrapper), { key: 'Home' });
    expect(activeLabel(wrapper)).toBe('Option 0');
  });

  it('selects the active option with Enter, closes, and returns focus to the trigger', async () => {
    const wrapper = mount();
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowDown' });
    await key(trigger(wrapper), { key: 'ArrowDown' });
    await key(trigger(wrapper), { key: 'Enter' });

    expect(wrapper.emitted('update:modelValue')).toEqual([['returns']]);
    expect(wrapper.emitted('change')).toEqual([['returns']]);
    expect(panel(wrapper).exists()).toBe(false);
    expect(document.activeElement).toBe(trigger(wrapper));
  });

  it('selects with Space when there is no search field, and with Alt+ArrowUp always', async () => {
    const wrapper = mount();
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowDown' });
    await key(trigger(wrapper), { key: ' ' });
    expect(wrapper.emitted('change')).toEqual([['order']]);

    await key(trigger(wrapper), { key: 'ArrowDown' });
    await key(trigger(wrapper), { key: 'ArrowDown' });
    await key(trigger(wrapper), { key: 'ArrowUp', altKey: true });
    expect(wrapper.emitted('change')).toEqual([['order'], ['returns']]);
    expect(panel(wrapper).exists()).toBe(false);
  });

  it('selects on click and makes the hovered option active', async () => {
    const wrapper = mount();
    await press(triggerOf(wrapper));
    await optionEls(wrapper)[2]?.trigger('mouseenter');
    expect(activeLabel(wrapper)).toBe('Product care');

    await optionEls(wrapper)[2]?.trigger('click');
    await flush();
    expect(wrapper.emitted('change')).toEqual([['care']]);
    expect(panel(wrapper).exists()).toBe(false);
  });

  it('gives the active and selected rows a forced-colours boundary of their own', async () => {
    const wrapper = mount({ modelValue: 'care' });
    await press(triggerOf(wrapper));
    const rows = optionEls(wrapper);
    // The selected row is the active one on open, so it carries both.
    expect(rows[2]?.classes()).toContain('eldra-select-option-active');
    expect(rows[2]?.classes()).toContain('eldra-select-option-selected');
    expect(rows[0]?.classes()).not.toContain('eldra-select-option-active');
    expect(rows[0]?.classes()).not.toContain('eldra-select-option-selected');

    await rows[0]?.trigger('mouseenter');
    expect(optionEls(wrapper)[0]?.classes()).toContain('eldra-select-option-active');
    expect(optionEls(wrapper)[2]?.classes()).not.toContain('eldra-select-option-active');
    expect(optionEls(wrapper)[2]?.classes()).toContain('eldra-select-option-selected');
  });

  it('marks the selected option with aria-selected and a check', async () => {
    const wrapper = mount({ modelValue: 'care' });
    await press(triggerOf(wrapper));
    const selected = optionEls(wrapper).map((option) => option.attributes('aria-selected'));
    expect(selected).toEqual(['false', 'false', 'true', 'false', 'false']);
    expect(wrapper.findAll('[data-part="optionCheck"]')).toHaveLength(1);
  });

  it('does not blur the focused element when a pointer presses anywhere in the panel', async () => {
    const wrapper = mount({ options: MANY });
    await press(triggerOf(wrapper));
    expect(document.activeElement).toBe(search(wrapper));

    for (const target of [
      optionEls(wrapper)[1]?.element,
      wrapper.find('[data-part="listbox"]').element,
      panel(wrapper).element,
    ]) {
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      target?.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }

    // ...including the empty state, which is a sibling of the listbox rather than inside it.
    search(wrapper).value = 'zzz';
    await wrapper.find('[data-part="search"]').trigger('input');
    await flush();
    const onEmpty = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    wrapper.find('[data-part="empty"]').element.dispatchEvent(onEmpty);
    expect(onEmpty.defaultPrevented).toBe(true);
  });

  it('lets a press on the search field itself place the caret', async () => {
    const wrapper = mount({ options: MANY });
    await press(triggerOf(wrapper));
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    search(wrapper).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('Select — closing', () => {
  it('closes on Escape and returns focus to the trigger without changing the value', async () => {
    const wrapper = mount({ modelValue: 'care' });
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowDown' });
    await key(trigger(wrapper), { key: 'ArrowDown' });
    await key(trigger(wrapper), { key: 'Escape' });

    expect(panel(wrapper).exists()).toBe(false);
    expect(document.activeElement).toBe(trigger(wrapper));
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('closes on an outside pointer press', async () => {
    const wrapper = mount();
    await press(triggerOf(wrapper));
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flush();
    expect(panel(wrapper).exists()).toBe(false);
  });

  it('closes on Tab without preventing focus from moving on', async () => {
    const wrapper = mount();
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowDown' });
    const event = await key(trigger(wrapper), { key: 'Tab' });
    expect(event.defaultPrevented).toBe(false);
    expect(panel(wrapper).exists()).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});

describe('Select — type-ahead', () => {
  it('jumps to the option whose label starts with the typed letters', async () => {
    const wrapper = mount();
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'w' });
    expect(panel(wrapper).exists()).toBe(true);
    expect(activeLabel(wrapper)).toBe('Wholesale and stockists');
  });

  it('accumulates a buffer and drops it after 0.6s', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mount({ options: MANY, searchable: false });
      trigger(wrapper).focus();
      trigger(wrapper).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true })
      );
      await nextTick();
      trigger(wrapper).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'p', bubbles: true, cancelable: true })
      );
      await nextTick();
      // "op" still matches every "Option n", so the active row stays on the first.
      expect(activeLabel(wrapper)).toBe('Option 0');

      vi.advanceTimersByTime(700);
      trigger(wrapper).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true })
      );
      await nextTick();
      // A fresh single character walks to the *next* match rather than re-matching the buffer.
      expect(activeLabel(wrapper)).toBe('Option 1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores case and diacritics', async () => {
    const wrapper = mount({ options: COUNTRIES, searchable: false });
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'I' });
    expect(activeLabel(wrapper)).toBe('Ísland');
  });
});

describe('Select — searching', () => {
  it('turns the search field on past ten options and moves focus into it', async () => {
    const wrapper = mount({ options: MANY });
    await press(triggerOf(wrapper));
    const field = search(wrapper);
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute('role')).toBe('combobox');
    expect(field.getAttribute('aria-autocomplete')).toBe('list');
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect(field.getAttribute('autocomplete')).toBe('off');
    expect(field.getAttribute('spellcheck')).toBe('false');
    expect(field.getAttribute('aria-label')).toBe(enUS.search);
    // The trigger hands `aria-activedescendant` over to the field it handed focus to.
    expect(trigger(wrapper).getAttribute('aria-activedescendant')).toBeNull();
    expect(field.getAttribute('aria-activedescendant')).not.toBeNull();
  });

  it('stays off at ten options or fewer unless asked for', async () => {
    const wrapper = mount();
    await press(triggerOf(wrapper));
    expect(wrapper.find('[data-part="search"]').exists()).toBe(false);
    expect(trigger(wrapper).getAttribute('aria-activedescendant')).not.toBeNull();
  });

  it('filters as you type, ignoring case and diacritics, and hides empty groups', async () => {
    const wrapper = mount({ options: COUNTRIES, searchable: true });
    await press(triggerOf(wrapper));
    expect(wrapper.findAll('[data-part="group"]')).toHaveLength(2);

    search(wrapper).value = 'isl';
    await wrapper.find('[data-part="search"]').trigger('input');
    await flush();

    expect(optionEls(wrapper).map((option) => option.text())).toEqual(['Ísland', 'Ísland']);
    expect(wrapper.emitted('search')).toEqual([['isl']]);
    // Both groups still have a match, so both headings stay.
    expect(wrapper.findAll('[data-part="groupLabel"]').map((label) => label.text())).toEqual([
      'Most used',
      'All countries',
    ]);

    search(wrapper).value = 'mex';
    await wrapper.find('[data-part="search"]').trigger('input');
    await flush();
    expect(wrapper.findAll('[data-part="groupLabel"]').map((label) => label.text())).toEqual([
      'All countries',
    ]);
  });

  it('bolds and underlines the matched run, wherever it falls in the label', async () => {
    const wrapper = mount({ options: COUNTRIES, searchable: true });
    await press(triggerOf(wrapper));
    search(wrapper).value = 'ic';
    await wrapper.find('[data-part="search"]').trigger('input');
    await flush();

    const marks = wrapper.findAll('.eldra-select-match');
    expect(marks.map((mark) => mark.text())).toEqual(['ic']);
    expect(wrapper.find('[data-part="optionLabel"]').text()).toBe('Mexico');
  });

  it('shows the spec empty state with the query in it, and the `empty` slot can replace it', async () => {
    const wrapper = mount({ options: COUNTRIES, searchable: true });
    await press(triggerOf(wrapper));
    search(wrapper).value = 'teal';
    await wrapper.find('[data-part="search"]').trigger('input');
    await flush();

    expect(optionEls(wrapper)).toHaveLength(0);
    expect(wrapper.find('[data-part="empty"]').text()).toBe(enUS.noMatchesFor('teal'));

    const slotted = mount(
      { options: COUNTRIES, searchable: true },
      { slots: { empty: '<span data-testid="none">Nothing here</span>' } }
    );
    await press(triggerOf(slotted));
    search(slotted).value = 'teal';
    await slotted.find('[data-part="search"]').trigger('input');
    await flush();
    expect(slotted.find('[data-testid="none"]').exists()).toBe(true);
  });

  it('makes the first visible enabled option active after every change', async () => {
    const wrapper = mount({ options: COUNTRIES, searchable: true, modelValue: 'se' });
    await press(triggerOf(wrapper));
    expect(activeLabel(wrapper)).toBe('Sweden');

    search(wrapper).value = 'is';
    await wrapper.find('[data-part="search"]').trigger('input');
    await flush();
    expect(activeLabel(wrapper)).toBe('Ísland');
  });

  it('clears the query on the first Escape and closes on the second', async () => {
    const wrapper = mount({ options: MANY });
    await press(triggerOf(wrapper));
    search(wrapper).value = 'Option 1';
    await wrapper.find('[data-part="search"]').trigger('input');
    await flush();

    const first = await key(search(wrapper), { key: 'Escape' });
    expect(first.defaultPrevented).toBe(true);
    expect(panel(wrapper).exists()).toBe(true);
    expect(search(wrapper).value).toBe('');

    await key(search(wrapper), { key: 'Escape' });
    expect(panel(wrapper).exists()).toBe(false);
    expect(document.activeElement).toBe(trigger(wrapper));
  });

  it('leaves Home, End and Space to the caret while the search field has focus', async () => {
    const wrapper = mount({ options: MANY });
    await press(triggerOf(wrapper));
    for (const pressed of ['Home', 'End', ' ']) {
      const event = await key(search(wrapper), { key: pressed });
      expect(event.defaultPrevented, pressed).toBe(false);
    }
  });

  it('opens with a printable key and starts the query with it', async () => {
    const wrapper = mount({ options: MANY });
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'O' });
    expect(panel(wrapper).exists()).toBe(true);
    expect(search(wrapper).value).toBe('O');
    expect(wrapper.emitted('search')).toEqual([['O']]);
  });

  it('forgets the query between opens', async () => {
    const wrapper = mount({ options: MANY });
    await press(triggerOf(wrapper));
    search(wrapper).value = 'Option 1';
    await wrapper.find('[data-part="search"]').trigger('input');
    await flush();
    await key(search(wrapper), { key: 'Tab' });
    await press(triggerOf(wrapper));
    expect(search(wrapper).value).toBe('');
  });
});

describe('Select — clearing', () => {
  it('shows the clear button only while there is a value, after the trigger in the tab order', async () => {
    const wrapper = mount({ clearable: true });
    expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(false);

    await wrapper.setProps({ modelValue: 'care' });
    const clear = wrapper.find('[data-part="clearButton"]');
    expect(clear.exists()).toBe(true);
    // Not inside the trigger (a `<button>` may not hold a `<button>`), and after it in the DOM.
    expect(trigger(wrapper).contains(clear.element)).toBe(false);
    expect(
      trigger(wrapper).compareDocumentPosition(clear.element) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('clears on click, emits clear and change, and returns focus to the trigger', async () => {
    const wrapper = mount({ clearable: true, modelValue: 'care' });
    await wrapper.find('[data-part="clearButton"]').trigger('click');
    await flush();
    expect(wrapper.emitted('update:modelValue')).toEqual([['']]);
    expect(wrapper.emitted('change')).toEqual([['']]);
    expect(wrapper.emitted('clear')).toHaveLength(1);
    expect(document.activeElement).toBe(trigger(wrapper));
  });

  it.each(['Backspace', 'Delete'])('clears on %s from the closed trigger', async (pressed) => {
    const wrapper = mount({ clearable: true, modelValue: 'care' });
    trigger(wrapper).focus();
    const event = await key(trigger(wrapper), { key: pressed });
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted('clear')).toHaveLength(1);
  });

  it('does not clear when there is nothing to clear, or when it is not clearable', async () => {
    const empty = mount({ clearable: true });
    empty.element.querySelector('button')?.focus();
    const first = await key(trigger(empty), { key: 'Backspace' });
    expect(first.defaultPrevented).toBe(false);

    const fixed = mount({ modelValue: 'care' });
    const second = await key(trigger(fixed), { key: 'Delete' });
    expect(second.defaultPrevented).toBe(false);
    expect(fixed.emitted('clear')).toBeUndefined();
  });

  it('hides the clear button when the field cannot be edited', async () => {
    const disabled = mount({ clearable: true, modelValue: 'care', disabled: true });
    expect(disabled.find('[data-part="clearButton"]').exists()).toBe(false);
    const readonly = mount({ clearable: true, modelValue: 'care', readonly: true });
    expect(readonly.find('[data-part="clearButton"]').exists()).toBe(false);
  });
});

describe('Select — the native select underneath', () => {
  it('mirrors the options, their groups and the value, and fires a bubbling change', async () => {
    const wrapper = mount({ options: COUNTRIES, name: 'country', modelValue: 'mx' });
    const select = native(wrapper);
    expect(select.value).toBe('mx');
    expect([...select.querySelectorAll('optgroup')].map((group) => group.label)).toEqual([
      'Most used',
      'All countries',
    ]);
    // Every option, plus the empty one that carries the placeholder.
    expect(select.querySelectorAll('option')).toHaveLength(COUNTRIES.length + 1);

    const heard: string[] = [];
    document.body.addEventListener('change', (event) =>
      heard.push((event.target as HTMLSelectElement).value)
    );

    await press(triggerOf(wrapper));
    await optionEls(wrapper)[4]?.trigger('click');
    // The mount binds `modelValue`, so the parent is in charge; this is it accepting the change.
    await wrapper.setProps({ modelValue: 'se' });
    await flush();
    expect(heard).toEqual(['se']);
    expect(select.value).toBe('se');
  });

  it('follows a value the parent sets', async () => {
    const wrapper = mount({ modelValue: 'care' });
    expect(native(wrapper).value).toBe('care');
    await wrapper.setProps({ modelValue: 'other' });
    await flush();
    expect(native(wrapper).value).toBe('other');
  });

  it('keeps the value when the options arrive after mount', async () => {
    const wrapper = mount({ options: [], modelValue: 'care', name: 'topic' });
    // Nothing to select yet, so the native select sits on the placeholder option.
    expect(native(wrapper).value).toBe('');

    await wrapper.setProps({ options: TOPIC });
    await flush();
    expect(native(wrapper).value).toBe('care');
  });

  it('keeps the value when the options are replaced', async () => {
    const wrapper = mount({ options: TOPIC, modelValue: 'care', name: 'topic' });
    expect(native(wrapper).value).toBe('care');

    await wrapper.setProps({
      options: [{ value: 'care', label: 'Product care (renamed)' }, ...COUNTRIES],
    });
    await flush();
    expect(native(wrapper).value).toBe('care');
  });

  it('never runs ahead of a controlled parent that refuses the value', async () => {
    // `modelValue` is bound and never updated, which is a parent refusing every change.
    const wrapper = mount({ modelValue: 'care', name: 'topic' });
    await press(triggerOf(wrapper));
    await optionEls(wrapper)[0]?.trigger('click');
    await flush();

    expect(wrapper.emitted('update:modelValue')).toEqual([['order']]);
    expect(native(wrapper).value).toBe('care');
    expect(wrapper.find('[data-part="value"]').text()).toBe('Product care');
  });

  it('adopts a change made on the native select itself', async () => {
    const wrapper = mount({ name: 'topic' });
    const select = native(wrapper);
    select.value = 'wholesale';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(wrapper.emitted('update:modelValue')).toEqual([['wholesale']]);
  });

  it('carries required and disabled', () => {
    const wrapper = mount({ required: true, disabled: true, name: 'topic' });
    expect(native(wrapper).required).toBe(true);
    expect(native(wrapper).disabled).toBe(true);
    expect(trigger(wrapper).getAttribute('aria-required')).toBe('true');
  });
});

describe('Select — groups', () => {
  it('draws each group as a role=group labelled by its heading', async () => {
    const wrapper = mount({ options: COUNTRIES, searchable: false });
    await press(triggerOf(wrapper));
    const groups = wrapper.findAll('[data-part="group"]');
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.attributes('role')).toBe('group');
      const labelId = group.attributes('aria-labelledby');
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId as string)?.getAttribute('role')).toBe('presentation');
    }
  });

  it('walks across group boundaries in DOM order', async () => {
    const wrapper = mount({ options: COUNTRIES, searchable: false });
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowDown' });
    await key(trigger(wrapper), { key: 'ArrowDown' });
    await key(trigger(wrapper), { key: 'ArrowDown' });
    expect(activeLabel(wrapper)).toBe('Ísland');
    await key(trigger(wrapper), { key: 'Enter' });
    expect(wrapper.emitted('change')).toEqual([['is']]);
  });
});

describe('Select — placement and width', () => {
  it('opens below by default and above when asked', async () => {
    const below = mount();
    await press(triggerOf(below));
    expect(panel(below).attributes('data-placement')).toBe('bottom-start');

    const above = mount({ placement: 'above' });
    await press(triggerOf(above));
    expect(panel(above).attributes('data-placement')).toBe('top-start');
  });

  it('plays one entrance animation, growing from the corner it is anchored by', async () => {
    const below = mount();
    await press(triggerOf(below));
    expect(panel(below).classes()).toContain('animate-eldra-popover-in');
    expect(panel(below).attributes('style')).toContain('--eldra-popover-origin: top left');
    // The slide the entrance used to carry is gone (operator ruling: fade and scale only), so the
    // variable that drove it must not be written either — a panel still setting it would claim the
    // package animates something it no longer animates.
    expect(panel(below).attributes('style')).not.toContain('--eldra-popover-slide');

    // Opening the second one closes the first: the two share the "only one open at a time"
    // registry, so `below`'s panel is gone from the DOM by the assertions past this line.
    const above = mount({ placement: 'above' });
    await press(triggerOf(above));
    // The same class — a second `animation-name` would restart the animation when `auto` flips.
    expect(panel(above).classes()).toContain('animate-eldra-popover-in');
    expect(panel(above).classes()).not.toContain('animate-eldra-popover-in-above');
    expect(panel(above).attributes('style')).toContain('--eldra-popover-origin: bottom left');
    expect(panel(above).attributes('style')).not.toContain('--eldra-popover-slide');
  });

  it('is never narrower than its trigger in a narrow container', async () => {
    const wrapper = mountNarrow(Select, { props: { options: TOPIC }, attrs: NAME });
    mounted.push(wrapper as unknown as VueWrapper);
    const button = wrapper.find('[data-part="trigger"]').element as HTMLElement;
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 320,
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'clientHeight', {
      value: 640,
      configurable: true,
    });
    button.getBoundingClientRect = () =>
      ({ x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 40, width: 320, height: 40 }) as DOMRect;

    await press(wrapper.find('[data-part="trigger"]'));
    // Spec "Select" → Sizes, Popover: "Min width = trigger, grows to fit its content up to
    // min(22rem, 90vw)" — the floor is inline, the clamp is `eldra-select-panel-width`.
    expect(wrapper.find('[data-part="panel"]').attributes('style')).toContain('min-width: 320px');
  });
});

describe('Select — slots', () => {
  it('replaces an option row and the trigger value', async () => {
    const wrapper = mount(
      { options: COLOURS, modelValue: 'oat', searchable: false },
      {
        slots: {
          value: '<span data-testid="chosen">{{ params.option.label }}</span>',
          option:
            '<span data-testid="row">{{ params.option.label }}/{{ params.selected }}/{{ params.active }}</span>',
        },
      }
    );
    expect(wrapper.find('[data-testid="chosen"]').text()).toBe('Oat');
    await press(triggerOf(wrapper));
    expect(wrapper.findAll('[data-testid="row"]')[0]?.text()).toBe('Oat/true/true');
  });
});

describe('Select — the field wrapper', () => {
  it('takes its id, description, invalid and required state from the wrapper', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: {
        label: 'Country',
        help: 'Where we ship to',
        error: 'Choose a country',
        required: true,
      },
      slots: { default: '<Select :options="[]" />' },
      global: { components: { Select } },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    const button = wrapper.find('[data-part="trigger"]').element;
    const id = button.getAttribute('id') as string;
    expect(wrapper.find('label').attributes('for')).toBe(id);
    // Read the label element's real `id`, never the `${id}-label` convention: comparing the
    // reconstruction against itself would stay green while the trigger pointed at nothing.
    const labelId = wrapper.find('label').attributes('id');
    expect(labelId).toBeTruthy();
    expect(button.getAttribute('aria-labelledby')).toBe(labelId);
    expect(button.getAttribute('aria-invalid')).toBe('true');
    expect(button.getAttribute('aria-required')).toBe('true');
    expect(button.getAttribute('aria-describedby')).toContain(`${id}-error`);
  });

  it('names the clear button after the field', async () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Country' },
      slots: {
        default:
          '<Select :options="[{ value: \'is\', label: \'Iceland\' }]" model-value="is" clearable />',
      },
      global: { components: { Select } },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    const clear = wrapper.find('[data-part="clearButton"]').element;
    const id = clear.getAttribute('id') as string;
    expect(clear.getAttribute('aria-label')).toBe(enUS.clear);
    expect(clear.getAttribute('aria-labelledby')).toBe(
      `${id} ${wrapper.find('label').attributes('id')}`
    );
  });

  it('lets an explicit prop win over the wrapper', () => {
    const wrapper = mountWith(Select, {
      props: { options: TOPIC, invalid: false },
      attrs: NAME,
      global: {
        provide: {
          [FIELD_KEY as symbol]: computed<FieldContext>(() => ({
            id: 'field-topic',
            labelId: 'field-topic-label',
            invalid: true,
            required: false,
            labelsControl: true,
          })),
        },
      },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    expect(wrapper.find('[data-part="trigger"]').attributes('aria-invalid')).toBeUndefined();
  });
});

describe('Select — messages', () => {
  it('takes its own message overrides', async () => {
    const wrapper = mount({
      options: MANY,
      messages: {
        selectPlaceholder: 'Velja',
        search: 'Leita',
        noMatchesFor: (q: string) => `Ekkert: ${q}`,
      },
    });
    expect(wrapper.find('[data-part="placeholder"]').text()).toBe('Velja');
    await press(triggerOf(wrapper));
    expect(search(wrapper).getAttribute('placeholder')).toBe('Leita');
    search(wrapper).value = 'zzz';
    await wrapper.find('[data-part="search"]').trigger('input');
    await flush();
    expect(wrapper.find('[data-part="empty"]').text()).toBe('Ekkert: zzz');
  });
});

describe('Select — accessibility', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['closed', {}],
    ['with a value', { modelValue: 'care' }],
    ['clearable', { modelValue: 'care', clearable: true }],
    ['invalid and required', { invalid: true, required: true }],
    ['disabled', { disabled: true }],
    ['read-only', { readonly: true, modelValue: 'care' }],
    ['rich options', { options: COLOURS }],
  ];

  it.each(cases)('has no axe violations — %s', async (_name, props) => {
    mount(props);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it.each([
    ['plain', { options: TOPIC, modelValue: 'care' }],
    ['searchable and grouped', { options: COUNTRIES, searchable: true }],
    ['rich, with a disabled option', { options: COLOURS, searchable: false }],
    ['empty', { options: [], searchable: true }],
  ])('has no axe violations while open — %s', async (_name, props) => {
    const wrapper = mount(props);
    await press(triggerOf(wrapper));
    expect(panel(wrapper).exists()).toBe(true);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('has no axe violations inside a real field wrapper, open', async () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Country', error: 'Choose a country' },
      slots: {
        default:
          "<Select :options=\"[{ value: 'is', label: 'Iceland', group: 'Most used' }]\" clearable model-value=\"is\" />",
      },
      global: { components: { Select } },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    await press(wrapper.find('[data-part="trigger"]'));
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('Select — long content and narrow containers', () => {
  const LONG: SelectOption[] = [
    {
      value: 'long',
      label:
        'Standard shipping, tracked and insured for the full value of your order, delivered by our carbon-neutral courier network',
      hint: 'Delivered within 3 to 5 business days, with a signature required on arrival',
      meta: 'Free',
    },
    { value: 'short', label: 'Express' },
  ];

  it('truncates the trigger value and still renders the whole option row', async () => {
    const wrapper = mountNarrow(Select, {
      props: { options: LONG, modelValue: 'long', searchable: false },
      attrs: NAME,
    });
    mounted.push(wrapper as unknown as VueWrapper);
    expect(wrapper.find('[data-part="value"] span').classes()).toContain('truncate');
    await press(wrapper.find('[data-part="trigger"]'));
    expect(wrapper.find('[data-part="optionHint"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="optionMeta"]').exists()).toBe(true);
  });
});
