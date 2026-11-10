import { afterEach, describe, expect, it } from 'vitest';
import type { VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountWith } from '../../../test/mount';
import { panelOf } from '../../../test/popover';
import { enUS } from '../../../messages/en-US';
import MultiSelect from '../MultiSelect.vue';
import Select from '../Select.vue';
import type { SelectOption } from '../types';

/**
 * The opt-in API a wrapping library needs: keyword search, the `optionContent` and `leading`
 * slots, the tag slot's `remove`, `loading`, `creatable` and `renderBatch`. Every case here is off
 * by default, which the existing specs pin by passing unchanged.
 */

const ICONS: SelectOption[] = [
  { value: 'home', label: 'Home', keywords: ['house', 'building'] },
  { value: 'cart', label: 'Cart', keywords: ['basket'] },
  { value: 'user', label: 'User', keywords: ['person'] },
];

const TAGS: SelectOption[] = [
  { value: 'wool', label: 'Wool' },
  { value: 'linen', label: 'Linen' },
  { value: 'cotton', label: 'Cotton', disabled: true },
];

const MANY: SelectOption[] = Array.from({ length: 50 }, (_, index) => ({
  value: `v${index}`,
  label: `Option ${index}`,
}));

const NAME = { 'aria-label': 'Choice' };

type Control = typeof Select | typeof MultiSelect;

const mounted: VueWrapper[] = [];

function mount(
  component: Control,
  props: Record<string, unknown> = {},
  options: Record<string, unknown> = {}
) {
  const wrapper = mountWith(component as typeof Select, {
    props: { options: TAGS, ...props },
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

const triggerOf = (wrapper: Mounted) => wrapper.find('[data-part="trigger"]');
const panel = (wrapper: Mounted) => panelOf(triggerOf(wrapper).element);
const optionEls = (wrapper: Mounted) => panel(wrapper).findAll('[data-part="option"]');
const search = (wrapper: Mounted) =>
  panel(wrapper).find('[data-part="search"]').element as HTMLInputElement;
const createRow = (wrapper: Mounted) => panel(wrapper).find('[data-part="createOption"]');

async function open(wrapper: Mounted): Promise<void> {
  await triggerOf(wrapper).trigger('pointerdown');
  await triggerOf(wrapper).trigger('click');
  await flush();
}

async function type(wrapper: Mounted, text: string): Promise<void> {
  const input = search(wrapper);
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await flush();
}

async function key(element: Element, name: string): Promise<void> {
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
  );
  await flush();
}

const activeId = (wrapper: Mounted): string | null =>
  search(wrapper).getAttribute('aria-activedescendant');

const CONTROLS: [string, Control][] = [
  ['Select', Select],
  ['MultiSelect', MultiSelect],
];

describe.each(CONTROLS)('%s — keywords', (_name, component) => {
  it('finds an option by a keyword and leaves its label unhighlighted', async () => {
    const wrapper = mount(component, { options: ICONS, searchable: true });
    await open(wrapper);
    await type(wrapper, 'basket');
    expect(optionEls(wrapper).map((row) => row.find('[data-part="optionLabel"]').text())).toEqual([
      'Cart',
    ]);
    expect(panel(wrapper).find('.eldra\\:eldra-select-match').exists()).toBe(false);
  });

  it('still highlights a label match', async () => {
    const wrapper = mount(component, { options: ICONS, searchable: true });
    await open(wrapper);
    await type(wrapper, 'hom');
    expect(panel(wrapper).find('.eldra\\:eldra-select-match').text()).toBe('Hom');
  });
});

describe.each(CONTROLS)('%s — the optionContent slot', (_name, component) => {
  it('replaces what a row says and keeps the mark that says it is chosen', async () => {
    const modelValue = component === Select ? 'wool' : ['wool'];
    const wrapper = mount(
      component,
      { modelValue },
      {
        slots: {
          optionContent:
            '<span data-testid="content">{{ params.option.label }}/{{ params.selected }}/{{ params.match === null }}</span>',
        },
      }
    );
    await open(wrapper);
    const first = optionEls(wrapper)[0];
    expect(first?.find('[data-testid="content"]').text()).toBe('Wool/true/true');
    expect(first?.find('[data-part="optionLabel"]').exists()).toBe(false);
    // The checkbox (multi) or the trailing check (single) stays the panel's own.
    expect(first?.find('[data-part="optionCheck"]').exists()).toBe(true);
    expect(first?.attributes('aria-selected')).toBe('true');
  });

  it('hands the slot where the query matched', async () => {
    const wrapper = mount(
      component,
      { searchable: true },
      { slots: { optionContent: '<b data-testid="m">{{ params.match?.match }}</b>' } }
    );
    await open(wrapper);
    await type(wrapper, 'lin');
    expect(panel(wrapper).find('[data-testid="m"]').text()).toBe('Lin');
  });

  it('has no axe violations with custom row content, open', async () => {
    const wrapper = mount(
      component,
      {},
      { slots: { optionContent: '<span>{{ params.option.label }} item</span>' } }
    );
    await open(wrapper);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('the leading slot', () => {
  it('draws a mark from the chosen option in a Select trigger, and knows when it is open', async () => {
    const wrapper = mount(
      Select,
      { modelValue: 'linen' },
      {
        slots: {
          leading:
            '<span data-testid="dot">{{ params.option?.value ?? "none" }}/{{ params.open }}</span>',
        },
      }
    );
    const part = wrapper.find('[data-part="leadingIcon"]');
    expect(part.find('[data-testid="dot"]').text()).toBe('linen/false');
    await open(wrapper);
    expect(wrapper.find('[data-testid="dot"]').text()).toBe('linen/true');
  });

  it('hands a MultiSelect trigger every chosen option', () => {
    const wrapper = mount(
      MultiSelect,
      { modelValue: ['wool', 'linen'] },
      { slots: { leading: '<span data-testid="n">{{ params.options.length }}</span>' } }
    );
    expect(wrapper.find('[data-part="leadingIcon"] [data-testid="n"]').text()).toBe('2');
  });

  it('draws no leadingIcon part when neither the prop nor the slot is given', () => {
    const wrapper = mount(Select, { modelValue: 'linen' });
    expect(wrapper.find('[data-part="leadingIcon"]').exists()).toBe(false);
  });

  it('has no axe violations with a decorative mark', async () => {
    mount(
      Select,
      { modelValue: 'linen' },
      { slots: { leading: '<span aria-hidden="true" class="size-3 rounded-full"></span>' } }
    );
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('MultiSelect — the tag slot', () => {
  it('hands the slot a remove function that deselects that value', async () => {
    const wrapper = mount(
      MultiSelect,
      { modelValue: ['wool', 'linen'] },
      {
        slots: {
          tag: '<button type="button" data-testid="x" @click="params.remove">{{ params.option.label }}</button>',
        },
      }
    );
    await wrapper.find('[data-testid="x"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['linen']]);
  });
});

describe.each(CONTROLS)('%s — loading', (_name, component) => {
  it('shows a polite loading row in place of the list, and marks the list busy', async () => {
    const wrapper = mount(component, { loading: true });
    await open(wrapper);
    const row = panel(wrapper).find('[data-part="loading"]');
    expect(row.attributes('role')).toBe('status');
    expect(row.text()).toBe(enUS.loading);
    expect(optionEls(wrapper)).toHaveLength(0);
    expect(panel(wrapper).find('[data-part="empty"]').exists()).toBe(false);
    expect(panel(wrapper).find('[role="listbox"]').attributes('aria-busy')).toBe('true');
  });

  it('takes its text from messages and from the loading slot', async () => {
    const wrapper = mount(component, { loading: true, messages: { loading: 'Hleður' } });
    await open(wrapper);
    expect(panel(wrapper).find('[data-part="loading"]').text()).toBe('Hleður');
    const slotted = mount(
      component,
      { loading: true },
      { slots: { loading: '<span data-testid="l">Fetching icons</span>' } }
    );
    await open(slotted);
    expect(panel(slotted).find('[data-testid="l"]').text()).toBe('Fetching icons');
  });

  it('keeps every option on the native select while loading', () => {
    const wrapper = mount(component, { loading: true });
    expect(wrapper.findAll('[data-part="native"] option[value="wool"]')).toHaveLength(1);
  });

  it('draws the list once loading ends', async () => {
    const wrapper = mount(component, { loading: true });
    await open(wrapper);
    await wrapper.setProps({ loading: false });
    await flush();
    expect(optionEls(wrapper)).toHaveLength(3);
    expect(panel(wrapper).find('[data-part="loading"]').exists()).toBe(false);
  });

  it('has no axe violations while loading, open', async () => {
    const wrapper = mount(component, { loading: true, searchable: true });
    await open(wrapper);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe.each(CONTROLS)('%s — creatable', (_name, component) => {
  it('turns the search field on, and offers the trimmed query as a last option', async () => {
    const wrapper = mount(component, { creatable: true });
    await open(wrapper);
    expect(panel(wrapper).find('[data-part="search"]').exists()).toBe(true);
    expect(createRow(wrapper).exists()).toBe(false);
    await type(wrapper, '  silk ');
    expect(createRow(wrapper).attributes('role')).toBe('option');
    expect(createRow(wrapper).attributes('aria-selected')).toBe('false');
    expect(createRow(wrapper).text()).toBe(enUS.createOption('silk'));
    // No matches, but the create row is the answer: no empty state beside it.
    expect(panel(wrapper).find('[data-part="empty"]').exists()).toBe(false);
  });

  it('does not offer a query an option label already equals, ignoring case and accents', async () => {
    const wrapper = mount(component, {
      creatable: true,
      options: [...TAGS, { value: 'lopi', label: 'Lópi' }],
    });
    await open(wrapper);
    await type(wrapper, 'WOOL');
    expect(createRow(wrapper).exists()).toBe(false);
    await type(wrapper, 'lopi');
    expect(createRow(wrapper).exists()).toBe(false);
    await type(wrapper, 'woo');
    expect(createRow(wrapper).exists()).toBe(true);
  });

  it('emits create on click and changes no value', async () => {
    const wrapper = mount(component, { creatable: true });
    await open(wrapper);
    await type(wrapper, 'silk');
    await createRow(wrapper).trigger('click');
    await flush();
    expect(wrapper.emitted('create')).toEqual([['silk']]);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('reaches the row with the arrow keys and creates with Enter', async () => {
    const wrapper = mount(component, { creatable: true });
    await open(wrapper);
    await type(wrapper, 'lin');
    expect(activeId(wrapper)).toBe(optionEls(wrapper)[0]?.attributes('id'));
    await key(search(wrapper), 'ArrowDown');
    expect(activeId(wrapper)).toBe(createRow(wrapper).attributes('id'));
    await key(search(wrapper), 'Enter');
    expect(wrapper.emitted('create')).toEqual([['lin']]);
  });

  it('makes the create row active when nothing else matches', async () => {
    const wrapper = mount(component, { creatable: true });
    await open(wrapper);
    await type(wrapper, 'silk');
    expect(activeId(wrapper)).toBe(createRow(wrapper).attributes('id'));
  });

  it('has no axe violations with the create row, open', async () => {
    const wrapper = mount(component, { creatable: true });
    await open(wrapper);
    await type(wrapper, 'li');
    expect(createRow(wrapper).exists()).toBe(true);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('creating: what happens after', () => {
  it('a Select closes and returns focus to the trigger', async () => {
    const wrapper = mount(Select, { creatable: true });
    await open(wrapper);
    await type(wrapper, 'silk');
    await key(search(wrapper), 'Enter');
    expect(panel(wrapper).exists()).toBe(false);
    expect(document.activeElement).toBe(triggerOf(wrapper).element);
  });

  it('a MultiSelect stays open with the query cleared', async () => {
    const wrapper = mount(MultiSelect, { creatable: true });
    await open(wrapper);
    await type(wrapper, 'silk');
    await key(search(wrapper), 'Enter');
    expect(panel(wrapper).exists()).toBe(true);
    expect(search(wrapper).value).toBe('');
    expect(createRow(wrapper).exists()).toBe(false);
  });

  it('an explicit searchable: false wins over creatable, and nothing is offered', async () => {
    const wrapper = mount(Select, { creatable: true, searchable: false });
    await open(wrapper);
    expect(panel(wrapper).find('[data-part="search"]').exists()).toBe(false);
    expect(createRow(wrapper).exists()).toBe(false);
  });
});

describe.each(CONTROLS)('%s — renderBatch', (_name, component) => {
  it('renders the first batch, and the next one as the list nears its end', async () => {
    const wrapper = mount(component, { options: MANY, renderBatch: 10 });
    await open(wrapper);
    expect(optionEls(wrapper)).toHaveLength(10);
    await panel(wrapper).find('[role="listbox"]').trigger('scroll');
    // happy-dom lays nothing out, so every scroll position is "at the end".
    expect(optionEls(wrapper)).toHaveLength(20);
  });

  it('renders up to the row the keyboard moves to', async () => {
    const wrapper = mount(component, { options: MANY, renderBatch: 10 });
    await open(wrapper);
    await key(search(wrapper), 'PageDown');
    await key(search(wrapper), 'PageDown');
    expect(optionEls(wrapper)).toHaveLength(30);
    expect(activeId(wrapper)).toBe(optionEls(wrapper)[20]?.attributes('id'));
    expect(document.getElementById(activeId(wrapper) ?? '')).not.toBeNull();
  });

  it('searches every option, not only the rendered ones', async () => {
    const wrapper = mount(component, { options: MANY, renderBatch: 10 });
    await open(wrapper);
    await type(wrapper, 'Option 4');
    expect(optionEls(wrapper).map((row) => row.text())).toEqual([
      'Option 4',
      ...Array.from({ length: 9 }, (_, index) => `Option ${40 + index}`),
    ]);
  });

  it('starts from the first batch again on the next open', async () => {
    const wrapper = mount(component, { options: MANY, renderBatch: 10 });
    await open(wrapper);
    await panel(wrapper).find('[role="listbox"]').trigger('scroll');
    expect(optionEls(wrapper)).toHaveLength(20);
    await key(search(wrapper), 'Escape');
    expect(panel(wrapper).exists()).toBe(false);
    await open(wrapper);
    expect(optionEls(wrapper)).toHaveLength(10);
  });

  it('has no axe violations with a partial list, open', async () => {
    const wrapper = mount(component, { options: MANY, renderBatch: 10 });
    await open(wrapper);
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
