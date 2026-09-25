import { afterEach, describe, expect, it } from 'vitest';
import { IconWorld } from '@tabler/icons-vue';
import type { VueWrapper } from '@vue/test-utils';
import { computed, nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { enUS } from '../../../messages/en-US';
import { FIELD_KEY, type FieldContext } from '../../field-wrapper/context';
import FieldWrapper from '../../field-wrapper/FieldWrapper.vue';
import MultiSelect from '../MultiSelect.vue';
import Select from '../Select.vue';
import type { SelectOption } from '../types';

/** The spec's own category list: two groups, facet counts in `meta`. */
const CATEGORIES: SelectOption[] = [
  { value: 'sweaters', label: 'Sweaters', group: 'Knitwear', meta: '18' },
  { value: 'cardigans', label: 'Cardigans', group: 'Knitwear', meta: '12' },
  { value: 'scarves', label: 'Scarves & wraps', group: 'Knitwear', meta: '9' },
  { value: 'mugs', label: 'Mugs & cups', group: 'Tableware', meta: '24' },
  { value: 'bowls', label: 'Bowls', group: 'Tableware', meta: '7', disabled: true },
];

/** Colour filters: swatches, and a diacritic to match against. */
const COLOURS: SelectOption[] = [
  { value: 'oat', label: 'Oat', swatch: '#e7ded1' },
  { value: 'moss', label: 'Móss', swatch: '#2f5d4f' },
  { value: 'clay', label: 'Clay', swatch: '#8c3b2a' },
];

/** Twelve options, which is past the spec's "more than 10" threshold. */
const MANY: SelectOption[] = Array.from({ length: 12 }, (_, index) => ({
  value: `v${index}`,
  label: `Option ${index}`,
}));

const NAME = { 'aria-label': 'Categories' };

const mounted: VueWrapper[] = [];

function mount(props: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
  const wrapper = mountWith(MultiSelect, {
    props: { options: CATEGORIES, ...props },
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

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

type Mounted = ReturnType<typeof mount>;

const triggerOf = (wrapper: VueWrapper | Mounted) => wrapper.find('[data-part="trigger"]');
const trigger = (wrapper: Mounted) => triggerOf(wrapper).element as HTMLButtonElement;
const panel = (wrapper: Mounted) => wrapper.find('[data-part="panel"]');
const optionEls = (wrapper: Mounted) => wrapper.findAll('[data-part="option"]');
const search = (wrapper: Mounted) =>
  wrapper.find('[data-part="search"]').element as HTMLInputElement;
const native = (wrapper: Mounted) =>
  wrapper.find('[data-part="native"]').element as HTMLSelectElement;
const footerClear = (wrapper: Mounted) =>
  wrapper.find('[data-part="footerClear"]').element as HTMLButtonElement;
const footerDone = (wrapper: Mounted) =>
  wrapper.find('[data-part="footerDone"]').element as HTMLButtonElement;
const tags = (wrapper: Mounted) => wrapper.findAll('[data-part="tag"]');

const activeLabel = (wrapper: Mounted): string | undefined => {
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

/** Focus moving from one element to another, the way a browser reports it. */
function focusOut(from: Element, to: Element | null): void {
  from.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: to }));
}

// -------------------------------------------------------------------------------------------

describe('MultiSelect — anatomy and parts', () => {
  it('renders a combobox trigger over a hidden native multiple select', () => {
    const wrapper = mount({ name: 'categories' });
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(trigger(wrapper).getAttribute('role')).toBe('combobox');
    expect(trigger(wrapper).getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger(wrapper).getAttribute('aria-expanded')).toBe('false');
    expect(trigger(wrapper).getAttribute('aria-controls')).toBe(`${trigger(wrapper).id}-listbox`);
    expect(panel(wrapper).exists()).toBe(false);

    const select = native(wrapper);
    expect(select.multiple).toBe(true);
    expect(select.hasAttribute('hidden')).toBe(true);
    expect(select.getAttribute('aria-hidden')).toBe('true');
    expect(select.getAttribute('tabindex')).toBe('-1');
    // No placeholder `<option>`: a multiple select has no empty row to fall back to, and one
    // would be selectable.
    expect(select.querySelectorAll('option')).toHaveLength(CATEGORIES.length);
  });

  it('shows the placeholder with nothing selected, and the summary once there is something', async () => {
    const wrapper = mount();
    expect(wrapper.find('[data-part="placeholder"]').text()).toBe(enUS.multiSelectPlaceholder);
    expect(wrapper.find('[data-part="summary"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="tags"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(false);

    await wrapper.setProps({ modelValue: ['sweaters'] });
    expect(wrapper.find('[data-part="placeholder"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="summary"]').text()).toBe('Sweaters');
    expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(true);
  });

  it('lists maxSummary labels and puts the rest in a +N pill', async () => {
    const wrapper = mount({ modelValue: ['sweaters', 'cardigans', 'mugs', 'scarves'] });
    // The first child of the summary is the label run; the pill is its sibling.
    const labels = () => wrapper.find('[data-part="summary"] span').text();
    expect(labels()).toBe('Sweaters, Cardigans');
    expect(wrapper.find('[data-part="summaryMore"]').text()).toBe(enUS.moreSelected(2));

    await wrapper.setProps({ maxSummary: 3 });
    expect(labels()).toBe('Sweaters, Cardigans, Mugs & cups');
    expect(wrapper.find('[data-part="summaryMore"]').text()).toBe(enUS.moreSelected(1));

    // Nothing left over: no pill at all.
    await wrapper.setProps({ modelValue: ['sweaters'] });
    expect(wrapper.find('[data-part="summaryMore"]').exists()).toBe(false);
  });

  it('merges a per-part class override on a part of its own', async () => {
    const wrapper = mount({
      modelValue: ['sweaters'],
      classes: { tag: 'px-6', summaryMore: 'bg-primary', footer: 'p-4', option: 'px-6' },
    });
    expect(tags(wrapper)[0]?.classes()).toContain('px-6');

    await press(triggerOf(wrapper));
    expect(wrapper.find('[data-part="footer"]').classes()).toContain('p-4');
    expect(optionEls(wrapper)[0]?.classes()).toContain('px-6');
  });
});

describe('MultiSelect — the listbox and its checkboxes', () => {
  it('marks the listbox multiselectable and every row with aria-selected and a box', async () => {
    const wrapper = mount({ modelValue: ['cardigans'], searchable: false });
    await press(triggerOf(wrapper));

    expect(wrapper.find('[data-part="listbox"]').attributes('aria-multiselectable')).toBe('true');
    expect(optionEls(wrapper).map((option) => option.attributes('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
    ]);

    // Every row draws a box; only the selected one is filled, and it holds the tick.
    const boxes = wrapper.findAll('[data-part="optionCheck"]');
    expect(boxes).toHaveLength(CATEGORIES.length);
    expect(boxes[1]?.classes()).toContain('bg-primary');
    // The tick is always drawn and scaled, so it can grow in over `duration-fast`.
    expect(boxes[1]?.find('svg').classes()).toContain('scale-100');
    expect(boxes[0]?.classes()).not.toContain('bg-primary');
    expect(boxes[0]?.find('svg').classes()).toContain('scale-0');
    // Selection is the box, not the check mark a single select ends its row with.
    expect(boxes[1]?.attributes('aria-hidden')).toBe('true');
    expect(optionEls(wrapper)[1]?.classes()).toContain('font-medium');
    expect(optionEls(wrapper)[1]?.classes()).not.toContain('font-semibold');
  });

  it('keeps the forced-colours boundaries the shared panel draws', async () => {
    const wrapper = mount({ modelValue: ['cardigans'], searchable: false });
    await press(triggerOf(wrapper));
    expect(optionEls(wrapper)[1]?.classes()).toContain('eldra-select-option-selected');
    await optionEls(wrapper)[0]?.trigger('mouseenter');
    expect(optionEls(wrapper)[0]?.classes()).toContain('eldra-select-option-active');
  });
});

describe('MultiSelect — toggling', () => {
  it('toggles on click and keeps the popover open', async () => {
    const wrapper = mount({ searchable: false });
    await press(triggerOf(wrapper));
    await optionEls(wrapper)[0]?.trigger('click');
    await flush();

    expect(wrapper.emitted('update:modelValue')).toEqual([[['sweaters']]]);
    expect(wrapper.emitted('change')).toEqual([[['sweaters']]]);
    expect(panel(wrapper).exists()).toBe(true);

    await wrapper.setProps({ modelValue: ['sweaters'] });
    await optionEls(wrapper)[1]?.trigger('click');
    await flush();
    expect(wrapper.emitted('change')?.at(-1)).toEqual([['sweaters', 'cardigans']]);
    expect(panel(wrapper).exists()).toBe(true);
  });

  it('toggles with Enter and with Space, without closing, and unselects on a second press', async () => {
    const wrapper = mount({ searchable: false, modelValue: [] });
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowDown' });
    const enter = await key(trigger(wrapper), { key: 'Enter' });
    expect(enter.defaultPrevented).toBe(true);
    expect(wrapper.emitted('change')?.at(-1)).toEqual([['sweaters']]);
    expect(panel(wrapper).exists()).toBe(true);

    await wrapper.setProps({ modelValue: ['sweaters'] });
    await key(trigger(wrapper), { key: ' ' });
    expect(wrapper.emitted('change')?.at(-1)).toEqual([[]]);
    expect(panel(wrapper).exists()).toBe(true);
  });

  it('keeps the toggled row active', async () => {
    const wrapper = mount({ searchable: false });
    await press(triggerOf(wrapper));
    // Opening makes the first row active; a row toggled by pointer becomes the active one, so the
    // arrows carry on from where the pointer left off rather than from the top of the list.
    expect(activeLabel(wrapper)).toContain('Sweaters');
    await optionEls(wrapper)[2]?.trigger('click');
    await flush();
    expect(activeLabel(wrapper)).toContain('Scarves & wraps');
  });

  it('toggles and closes on Alt+ArrowUp', async () => {
    const wrapper = mount({ searchable: false });
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowDown' });
    await key(trigger(wrapper), { key: 'ArrowUp', altKey: true });
    expect(wrapper.emitted('change')).toEqual([[['sweaters']]]);
    expect(panel(wrapper).exists()).toBe(false);
    expect(document.activeElement).toBe(trigger(wrapper));
  });

  it('refuses a disabled option and skips it with the arrows', async () => {
    const wrapper = mount({ searchable: false });
    trigger(wrapper).focus();
    await key(trigger(wrapper), { key: 'ArrowDown' });
    await key(trigger(wrapper), { key: 'End' });
    // "Bowls" is disabled, so `End` lands on the last enabled row instead.
    expect(activeLabel(wrapper)).toContain('Mugs & cups');

    await optionEls(wrapper).at(-1)?.trigger('click');
    await flush();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});

describe('MultiSelect — the footer', () => {
  it('counts the selection in a polite live region', async () => {
    const wrapper = mount({ modelValue: [], searchable: false });
    await press(triggerOf(wrapper));
    const count = wrapper.find('[data-part="footerCount"]');
    expect(count.attributes('aria-live')).toBe('polite');
    expect(count.text()).toBe(enUS.noneSelected);

    await wrapper.setProps({ modelValue: ['sweaters', 'mugs'] });
    expect(wrapper.find('[data-part="footerCount"]').text()).toBe(enUS.selectedCount(2));
  });

  it('empties the selection with Clear and keeps the popover open', async () => {
    const wrapper = mount({ modelValue: ['sweaters', 'mugs'], options: MANY.concat(CATEGORIES) });
    await press(triggerOf(wrapper));
    footerClear(wrapper).click();
    await flush();

    expect(wrapper.emitted('change')).toEqual([[[]]]);
    expect(wrapper.emitted('clear')).toHaveLength(1);
    expect(panel(wrapper).exists()).toBe(true);
    // Searchable, so focus goes back into the search field rather than out of the panel.
    expect(document.activeElement).toBe(search(wrapper));
  });

  it('closes on Done without changing the value', async () => {
    const wrapper = mount({ modelValue: ['sweaters'], searchable: false });
    await press(triggerOf(wrapper));
    footerDone(wrapper).click();
    await flush();

    expect(panel(wrapper).exists()).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(document.activeElement).toBe(trigger(wrapper));
  });

  it('lets Tab reach the footer buttons without closing, and closes when focus leaves', async () => {
    const wrapper = mount({ options: MANY, modelValue: ['v0'] });
    await press(triggerOf(wrapper));
    expect(document.activeElement).toBe(search(wrapper));

    // `Tab` is not consumed — focus has to keep moving — and it does not close the popover.
    const event = await key(search(wrapper), { key: 'Tab' });
    expect(event.defaultPrevented).toBe(false);
    expect(panel(wrapper).exists()).toBe(true);

    // The footer's two buttons are the next focusables inside the panel, in that order.
    const focusables = [...panel(wrapper).element.querySelectorAll<HTMLElement>('input, button')];
    expect(focusables).toEqual([search(wrapper), footerClear(wrapper), footerDone(wrapper)]);

    focusOut(search(wrapper), footerClear(wrapper));
    await flush();
    expect(panel(wrapper).exists()).toBe(true);

    focusOut(footerDone(wrapper), document.body);
    await flush();
    expect(panel(wrapper).exists()).toBe(false);
  });

  it('lets a press on a footer button through, and guards every other press in the panel', async () => {
    const wrapper = mount({ options: MANY, modelValue: ['v0'] });
    await press(triggerOf(wrapper));

    // The footer's buttons are real controls and need the default action to take focus.
    for (const control of [footerClear(wrapper), footerDone(wrapper), search(wrapper)]) {
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      control.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }

    // Everything else must not blur the search field, or `useOverlay` reads it as focus leaving.
    for (const target of [
      wrapper.find('[data-part="footer"]').element,
      wrapper.find('[data-part="footerCount"]').element,
      optionEls(wrapper)[1]?.element,
      panel(wrapper).element,
    ]) {
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      target?.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('counts the trigger clear button as part of the overlay while it is open', async () => {
    const wrapper = mount({ modelValue: ['sweaters'], searchable: false });
    await press(triggerOf(wrapper));
    const clear = wrapper.find('[data-part="clearButton"]').element;
    expect(clear.getAttribute('data-eldra-overlay-owner')).toBe(panel(wrapper).attributes('id'));

    // It sits between the trigger and the panel in the tab order, so tabbing through it must not
    // close the popover on the way to the footer.
    focusOut(trigger(wrapper), clear);
    await flush();
    expect(panel(wrapper).exists()).toBe(true);
  });
});

describe('MultiSelect — clearing and tags', () => {
  it('lists every value as a removable tag under the control', async () => {
    const wrapper = mount({ modelValue: ['sweaters', 'mugs'] });
    const list = wrapper.find('[data-part="tags"]');
    expect(list.element.tagName).toBe('UL');
    expect(list.attributes('aria-label')).toBe(enUS.selected);
    expect(list.attributes('aria-labelledby')).toBeUndefined();
    expect(tags(wrapper).map((tag) => tag.text())).toEqual(['Sweaters', 'Mugs & cups']);

    const remove = wrapper.findAll('[data-part="tagRemove"]');
    expect(remove[0]?.attributes('aria-label')).toBe(enUS.removeTag('Sweaters'));
    expect(remove[0]?.attributes('type')).toBe('button');

    await remove[0]?.trigger('click');
    await flush();
    expect(wrapper.emitted('update:modelValue')).toEqual([[['mugs']]]);
    expect(wrapper.emitted('change')).toEqual([[['mugs']]]);
    expect(document.activeElement).toBe(trigger(wrapper));
  });

  it('emits clear when a tag removal empties the selection', async () => {
    const wrapper = mount({ modelValue: ['sweaters'] });
    await wrapper.find('[data-part="tagRemove"]').trigger('click');
    await flush();
    expect(wrapper.emitted('clear')).toHaveLength(1);
  });

  it('hides the tag list with showTags: false', () => {
    const wrapper = mount({ modelValue: ['sweaters'], showTags: false });
    expect(wrapper.find('[data-part="tags"]').exists()).toBe(false);
    // The summary still says what is chosen.
    expect(wrapper.find('[data-part="summary"]').text()).toBe('Sweaters');
  });

  it('clears everything from the trigger button and from Backspace on the closed trigger', async () => {
    const wrapper = mount({ modelValue: ['sweaters', 'mugs'] });
    await wrapper.find('[data-part="clearButton"]').trigger('click');
    await flush();
    expect(wrapper.emitted('change')).toEqual([[[]]]);
    expect(wrapper.emitted('clear')).toHaveLength(1);
    expect(document.activeElement).toBe(trigger(wrapper));

    const keyed = mount({ modelValue: ['sweaters'] });
    trigger(keyed).focus();
    const event = await key(trigger(keyed), { key: 'Backspace' });
    expect(event.defaultPrevented).toBe(true);
    expect(keyed.emitted('change')).toEqual([[[]]]);

    const empty = mount({ modelValue: [] });
    const ignored = await key(trigger(empty), { key: 'Delete' });
    expect(ignored.defaultPrevented).toBe(false);
    expect(empty.emitted('clear')).toBeUndefined();
  });

  it('removes the last tag with Backspace in an empty search field', async () => {
    const wrapper = mount({ options: MANY, modelValue: ['v0', 'v1'] });
    await press(triggerOf(wrapper));
    expect(document.activeElement).toBe(search(wrapper));

    const event = await key(search(wrapper), { key: 'Backspace' });
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted('update:modelValue')).toEqual([[['v0']]]);
    expect(panel(wrapper).exists()).toBe(true);
  });

  it('leaves Backspace to the caret while there is a query', async () => {
    const wrapper = mount({ options: MANY, modelValue: ['v0'] });
    await press(triggerOf(wrapper));
    search(wrapper).value = 'Option';
    await wrapper.find('[data-part="search"]').trigger('input');
    await flush();

    const event = await key(search(wrapper), { key: 'Backspace' });
    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('hides the clear button when the field cannot be edited', () => {
    const disabled = mount({ modelValue: ['sweaters'], disabled: true });
    expect(disabled.find('[data-part="clearButton"]').exists()).toBe(false);
    const readonly = mount({ modelValue: ['sweaters'], readonly: true });
    expect(readonly.find('[data-part="clearButton"]').exists()).toBe(false);
  });

  it.each(['disabled', 'readonly'])(
    'keeps the tags readable but takes their remove buttons away when %s',
    async (state) => {
      const wrapper = mount({ modelValue: ['sweaters', 'mugs'], [state]: true });
      // The tag list is the value made readable, so it stays...
      expect(tags(wrapper).map((tag) => tag.text())).toEqual(['Sweaters', 'Mugs & cups']);
      // ...and nothing on it offers an action that cannot happen — not even a disabled button,
      // which would still be announced.
      expect(wrapper.findAll('[data-part="tagRemove"]')).toHaveLength(0);
      // The chip pads evenly instead of ending short where the button used to be.
      expect(tags(wrapper)[0]?.classes()).toContain('px-2.5');

      await wrapper.setProps({ [state]: false });
      expect(wrapper.findAll('[data-part="tagRemove"]')).toHaveLength(2);
      expect(tags(wrapper)[0]?.classes()).toContain('pe-0.5');
    }
  );

  it('keeps focus where aria-activedescendant is when the clear button is used while open', async () => {
    const wrapper = mount({ options: MANY, modelValue: ['v0', 'v1'] });
    await press(triggerOf(wrapper));
    expect(document.activeElement).toBe(search(wrapper));

    await wrapper.find('[data-part="clearButton"]').trigger('click');
    await flush();
    expect(wrapper.emitted('clear')).toHaveLength(1);
    // The panel is still open, and the search field is the element carrying the active row.
    expect(panel(wrapper).exists()).toBe(true);
    expect(document.activeElement).toBe(search(wrapper));
    expect(search(wrapper).getAttribute('aria-activedescendant')).not.toBeNull();

    // Closed, or open without a search field, it is the trigger's.
    const plain = mount({ modelValue: ['sweaters'], searchable: false });
    await press(triggerOf(plain));
    await plain.find('[data-part="clearButton"]').trigger('click');
    await flush();
    expect(document.activeElement).toBe(trigger(plain));
  });
});

describe('MultiSelect — searching and the shared panel', () => {
  it('turns the search field on past ten options and filters, ignoring case and diacritics', async () => {
    const wrapper = mount({ options: COLOURS, searchable: true });
    await press(triggerOf(wrapper));
    expect(document.activeElement).toBe(search(wrapper));

    search(wrapper).value = 'mos';
    await wrapper.find('[data-part="search"]').trigger('input');
    await flush();
    expect(optionEls(wrapper).map((option) => option.text())).toEqual(['Móss']);
    expect(wrapper.findAll('.eldra-select-match').map((mark) => mark.text())).toEqual(['Mós']);
    expect(wrapper.emitted('search')).toEqual([['mos']]);
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

  it('shows the spec empty state with the query in it', async () => {
    const wrapper = mount({ options: COLOURS, searchable: true });
    await press(triggerOf(wrapper));
    search(wrapper).value = 'teal';
    await wrapper.find('[data-part="search"]').trigger('input');
    await flush();
    expect(wrapper.find('[data-part="empty"]').text()).toBe(enUS.noMatchesFor('teal'));
  });

  it('draws its groups and hides the ones a query empties', async () => {
    const wrapper = mount({ searchable: true });
    await press(triggerOf(wrapper));
    expect(wrapper.findAll('[data-part="groupLabel"]').map((label) => label.text())).toEqual([
      'Knitwear',
      'Tableware',
    ]);

    search(wrapper).value = 'mug';
    await wrapper.find('[data-part="search"]').trigger('input');
    await flush();
    expect(wrapper.findAll('[data-part="groupLabel"]').map((label) => label.text())).toEqual([
      'Tableware',
    ]);
  });

  it('closes any open Select when it opens, and the other way round', async () => {
    const single = mountWith(Select, { props: { options: CATEGORIES }, attrs: NAME });
    mounted.push(single as unknown as VueWrapper);
    const multi = mount({ searchable: false });

    await press(single.find('[data-part="trigger"]'));
    expect(single.find('[data-part="panel"]').exists()).toBe(true);

    await press(triggerOf(multi));
    expect(panel(multi).exists()).toBe(true);
    expect(single.find('[data-part="panel"]').exists()).toBe(false);

    await press(single.find('[data-part="trigger"]'));
    expect(panel(multi).exists()).toBe(false);
  });

  it('does not open when disabled or read-only', async () => {
    const disabled = mount({ disabled: true });
    await press(triggerOf(disabled));
    expect(panel(disabled).exists()).toBe(false);

    const readonly = mount({ readonly: true, modelValue: ['sweaters'] });
    expect(readonly.find('[data-part="chevron"]').exists()).toBe(false);
    await press(triggerOf(readonly));
    expect(panel(readonly).exists()).toBe(false);
    const event = await key(trigger(readonly), { key: 'ArrowDown' });
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('MultiSelect — the native select underneath', () => {
  it('mirrors the options, their groups and every selected value', async () => {
    const wrapper = mount({ name: 'categories', modelValue: ['sweaters', 'mugs'] });
    const select = native(wrapper);
    expect([...select.querySelectorAll('optgroup')].map((group) => group.label)).toEqual([
      'Knitwear',
      'Tableware',
    ]);
    expect([...select.selectedOptions].map((option) => option.value)).toEqual(['sweaters', 'mugs']);

    await wrapper.setProps({ modelValue: ['cardigans'] });
    await flush();
    expect([...select.selectedOptions].map((option) => option.value)).toEqual(['cardigans']);
  });

  it('keeps the selection when the options arrive after mount', async () => {
    const wrapper = mount({ options: [], modelValue: ['sweaters'], name: 'categories' });
    expect([...native(wrapper).selectedOptions]).toHaveLength(0);

    await wrapper.setProps({ options: CATEGORIES });
    await flush();
    expect([...native(wrapper).selectedOptions].map((option) => option.value)).toEqual([
      'sweaters',
    ]);
  });

  it('fires a bubbling change carrying the new selection on every toggle', async () => {
    // Controlled, so the model does not update until the parent accepts — which is exactly when a
    // sync that read the model instead of the chosen values would fire a stale `change`.
    const wrapper = mount({ name: 'categories', searchable: false, modelValue: [] });
    const heard: string[][] = [];
    document.body.addEventListener('change', (event) =>
      heard.push([...(event.target as HTMLSelectElement).selectedOptions].map((o) => o.value))
    );

    await press(triggerOf(wrapper));
    await optionEls(wrapper)[0]?.trigger('click');
    await wrapper.setProps({ modelValue: ['sweaters'] });
    await flush();
    expect(heard).toEqual([['sweaters']]);
  });

  it('is a named control in the form, with every selected value on it', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const wrapper = mountWith(MultiSelect, {
      props: { options: CATEGORIES, name: 'categories', modelValue: ['sweaters', 'mugs'] },
      attrs: NAME,
      attachTo: form,
    });
    mounted.push(wrapper as unknown as VueWrapper);

    // What a submission posts is `name` + every *selected* option, which is asserted through the
    // element rather than through `new FormData(form)`: happy-dom's FormData takes only the first
    // selected option of a `<select multiple>` (proven against a hand-written form, no component
    // involved), so the assertion would test the environment's bug rather than this component.
    const select = form.elements.namedItem('categories') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.multiple).toBe(true);
    expect([...select.selectedOptions].map((option) => option.value)).toEqual(['sweaters', 'mugs']);
  });

  it('adopts a change made on the native select itself', async () => {
    const wrapper = mount({ name: 'categories' });
    const select = native(wrapper);
    select.options[0]!.selected = true;
    select.options[3]!.selected = true;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(wrapper.emitted('update:modelValue')).toEqual([[['sweaters', 'mugs']]]);
  });

  it('never runs ahead of a controlled parent that refuses the value', async () => {
    const wrapper = mount({ modelValue: ['sweaters'], name: 'categories', searchable: false });
    await press(triggerOf(wrapper));
    await optionEls(wrapper)[1]?.trigger('click');
    await flush();

    expect(wrapper.emitted('update:modelValue')).toEqual([[['sweaters', 'cardigans']]]);
    expect([...native(wrapper).selectedOptions].map((option) => option.value)).toEqual([
      'sweaters',
    ]);
    expect(wrapper.find('[data-part="summary"]').text()).toBe('Sweaters');
  });

  it('carries required and disabled', () => {
    const wrapper = mount({ required: true, disabled: true, name: 'categories' });
    expect(native(wrapper).required).toBe(true);
    expect(native(wrapper).disabled).toBe(true);
    expect(trigger(wrapper).getAttribute('aria-required')).toBe('true');
  });
});

describe('MultiSelect — slots, messages and the field wrapper', () => {
  it('replaces a tag, an option row and the summary', async () => {
    const wrapper = mount(
      { modelValue: ['sweaters'], searchable: false },
      {
        slots: {
          tag: '<span data-testid="chip">{{ params.option.label }}!</span>',
          value: '<span data-testid="summary">{{ params.options.length }} chosen</span>',
          option: '<span data-testid="row">{{ params.option.label }}/{{ params.selected }}</span>',
        },
      }
    );
    expect(wrapper.find('[data-testid="chip"]').text()).toBe('Sweaters!');
    // The remove button stays: the slot replaces the chip's label, not the control.
    expect(wrapper.find('[data-part="tagRemove"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="summary"]').text()).toBe('1 chosen');

    await press(triggerOf(wrapper));
    expect(wrapper.findAll('[data-testid="row"]')[0]?.text()).toBe('Sweaters/true');
  });

  it('takes its own message overrides', async () => {
    const wrapper = mount({
      modelValue: ['sweaters', 'cardigans', 'mugs'],
      searchable: false,
      messages: {
        multiSelectPlaceholder: 'Allt',
        moreSelected: (n: number) => `og ${n} til`,
        selectedCount: (n: number) => `${n} valin`,
        done: 'Lokið',
      },
    });
    expect(wrapper.find('[data-part="summaryMore"]').text()).toBe('og 1 til');
    await press(triggerOf(wrapper));
    expect(wrapper.find('[data-part="footerCount"]').text()).toBe('3 valin');
    expect(footerDone(wrapper).textContent?.trim()).toBe('Lokið');
  });

  it('takes its id, description, invalid and required state from the wrapper', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Categories', error: 'Choose at least one channel', required: true },
      slots: { default: '<MultiSelect :options="[]" :model-value="[]" />' },
      global: { components: { MultiSelect } },
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

  it('names the clear button and the tag list after the field', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Categories' },
      slots: {
        default:
          "<MultiSelect :options=\"[{ value: 'a', label: 'Sweaters' }]\" :model-value=\"['a']\" />",
      },
      global: { components: { MultiSelect } },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    const labelId = wrapper.find('label').attributes('id');
    const clear = wrapper.find('[data-part="clearButton"]').element;
    expect(clear.getAttribute('aria-labelledby')).toBe(`${clear.getAttribute('id')} ${labelId}`);
    const list = wrapper.find('[data-part="tags"]').element;
    expect(list.getAttribute('aria-labelledby')).toBe(`${list.getAttribute('id')} ${labelId}`);
  });

  it('lets an explicit prop win over the wrapper', () => {
    const wrapper = mountWith(MultiSelect, {
      props: { options: CATEGORIES, invalid: false },
      attrs: NAME,
      global: {
        provide: {
          [FIELD_KEY as symbol]: computed<FieldContext>(() => ({
            id: 'field-categories',
            labelId: 'field-categories-label',
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

describe('MultiSelect — accessibility', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['closed, empty', {}],
    ['with tags', { modelValue: ['sweaters', 'mugs'] }],
    ['without tags', { modelValue: ['sweaters'], showTags: false }],
    ['invalid and required', { invalid: true, required: true }],
    ['disabled', { disabled: true, modelValue: ['sweaters'] }],
    ['read-only', { readonly: true, modelValue: ['sweaters'] }],
    ['with a leading icon', { leadingIcon: IconWorld, modelValue: ['sweaters'] }],
  ];

  it.each(cases)('has no axe violations — %s', async (_name, props) => {
    mount(props);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it.each([
    ['grouped, with a disabled option', { options: CATEGORIES, searchable: false }],
    ['searchable, with swatches', { options: COLOURS, searchable: true, modelValue: ['oat'] }],
    ['empty', { options: [], searchable: true }],
  ])('has no axe violations while open — %s', async (_name, props) => {
    const wrapper = mount(props);
    await press(triggerOf(wrapper));
    expect(panel(wrapper).exists()).toBe(true);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('has no axe violations inside a real field wrapper, open', async () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Categories', error: 'Choose at least one channel' },
      slots: {
        default:
          "<MultiSelect :options=\"[{ value: 'a', label: 'Sweaters', group: 'Knitwear' }]\" :model-value=\"['a']\" />",
      },
      global: { components: { MultiSelect } },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    await press(wrapper.find('[data-part="trigger"]'));
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('MultiSelect — the checkbox geometry', () => {
  /**
   * Spec "Multi-select" → Sizes, "Checkbox in option": "1rem square … Checked: `primary` fill and
   * border with a `primary-contrast` tick (0.25 × 0.5rem, 2px stroke)." The svg is drawn at the
   * tick's own size over an 8 × 4 viewBox, so one unit is one pixel of the drawn mark: the ink —
   * the centreline plus a 1-unit round cap at each end — has to measure 8 × 4. Asserted as numbers
   * rather than as a path string, so the shape can be redrawn and the measurements still hold.
   *
   * (The same shape at a 10-unit viewBox squeezed into 0.5rem would render `stroke-width="2"` as
   * 1.6px, which is what this guards.)
   */
  const CAP = 1;

  function points(d: string): Array<[number, number]> {
    const numbers = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
    const result: Array<[number, number]> = [[numbers[0] as number, numbers[1] as number]];
    let [x, y] = result[0] as [number, number];
    for (const index of [2, 4]) {
      x += numbers[index] as number;
      y += numbers[index + 1] as number;
      result.push([x, y]);
    }
    return result;
  }

  async function tick() {
    const wrapper = mount({ modelValue: ['sweaters'], searchable: false });
    await press(triggerOf(wrapper));
    const svg = wrapper.find('[data-part="optionCheck"] svg');
    return {
      classes: svg.classes(),
      viewBox: svg.attributes('viewBox') ?? '',
      strokeWidth: svg.attributes('stroke-width') ?? '',
      d: (svg.find('path').element as SVGPathElement).getAttribute('d') ?? '',
    };
  }

  it('draws the svg at the mark size, so a viewBox unit is a drawn pixel', async () => {
    const { classes, viewBox } = await tick();
    // 0.5rem × 0.25rem on the 0.25rem spacing step.
    expect(classes).toContain('w-2');
    expect(classes).toContain('h-1');
    expect(viewBox).toBe('0 0 8 4');
  });

  it('draws the tick 0.5rem wide and 0.25rem tall, 2px thick', async () => {
    const { d, strokeWidth } = await tick();
    expect(strokeWidth).toBe('2');
    const p = points(d);
    const xs = p.map(([x]) => x);
    const ys = p.map(([, y]) => y);
    expect(Math.max(...xs) - Math.min(...xs) + 2 * CAP).toBeCloseTo(8, 5);
    expect(Math.max(...ys) - Math.min(...ys) + 2 * CAP).toBeCloseTo(4, 5);
  });

  it('keeps the whole mark inside its viewBox, so no cap is clipped', async () => {
    for (const [x, y] of points((await tick()).d)) {
      expect(x - CAP).toBeGreaterThanOrEqual(0);
      expect(x + CAP).toBeLessThanOrEqual(8);
      expect(y - CAP).toBeGreaterThanOrEqual(0);
      expect(y + CAP).toBeLessThanOrEqual(4);
    }
  });
});

describe('MultiSelect — long content and narrow containers', () => {
  const LONG: SelectOption[] = [
    {
      value: 'long',
      label:
        'Hand-knitted merino crew sweaters, cardigans and every other piece of knitwear we make',
      hint: 'Includes the winter collection and everything carried over from last season',
      meta: '128',
    },
    { value: 'short', label: 'Mugs' },
  ];

  it('truncates the summary, wraps the tags and matches the trigger width', async () => {
    const wrapper = mountNarrow(MultiSelect, {
      props: { options: LONG, modelValue: ['long', 'short'], searchable: false },
      attrs: NAME,
    });
    mounted.push(wrapper as unknown as VueWrapper);
    expect(wrapper.find('[data-part="summary"] span').classes()).toContain('truncate');
    expect(wrapper.find('[data-part="tags"]').classes()).toContain('flex-wrap');

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
    expect(wrapper.find('[data-part="panel"]').attributes('style')).toContain('min-width: 320px');
    expect(wrapper.find('[data-part="optionHint"]').exists()).toBe(true);
  });
});

/**
 * One entrance for all three popovers in this package (operator request, 2026-09-25): a fade and a
 * uniform scale from 98%, growing from the corner the panel is anchored by. `Select`'s own case is
 * in `select.spec.ts`, the `SearchBar`'s in `search-bar.spec.ts`; this is the third, so a panel
 * that stopped carrying the utility or the origin is caught wherever it happens.
 */
describe('MultiSelect — the panel entrance', () => {
  it('carries the entrance utility and the origin the keyframes read', async () => {
    const wrapper = mount();
    await press(triggerOf(wrapper));
    expect(panel(wrapper).classes()).toContain('animate-eldra-popover-in');
    expect(panel(wrapper).attributes('style')).toContain('--eldra-popover-origin: top left');
    expect(panel(wrapper).attributes('style')).not.toContain('--eldra-popover-slide');
  });
});
