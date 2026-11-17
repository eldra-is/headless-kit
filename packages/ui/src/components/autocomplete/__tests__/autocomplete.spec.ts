import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, defineComponent, h, nextTick, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { isIS } from '../../../messages/is-IS';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { panelOf } from '../../../test/popover';
import FieldWrapper from '../../field-wrapper/FieldWrapper.vue';
import Autocomplete from '../Autocomplete.vue';
import type { AutocompleteSuggestion } from '../types';

const STREETS: AutocompleteSuggestion[] = [
  { value: 'a', label: 'Laugavegur 1', description: '101 Reykjavík' },
  { value: 'b', label: 'Laugavegur 10', description: '101 Reykjavík' },
  { value: 'c', label: 'Laugarnesvegur 3', description: '105 Reykjavík' },
];

const mounted: VueWrapper[] = [];

function mount(props: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
  const wrapper = mountWith(Autocomplete, {
    props: { 'aria-label': 'Address', ...props },
    ...options,
  });
  mounted.push(wrapper as unknown as VueWrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

type Mounted = ReturnType<typeof mount>;

const control = (wrapper: Mounted) =>
  wrapper.find('[data-part="control"]').element as HTMLInputElement;
/** The panel is teleported to `body`, so it is found by the field's id (`src/test/popover.ts`). */
const panel = (wrapper: Mounted) => panelOf(control(wrapper));
const rows = (wrapper: Mounted) =>
  panel(wrapper).exists() ? panel(wrapper).findAll('[role="option"]') : [];
const isOpen = (wrapper: Mounted) => panel(wrapper).exists();

/** What a person does: focus the field, then type into it. */
async function type(wrapper: Mounted, text: string): Promise<void> {
  control(wrapper).focus();
  await wrapper.find('[data-part="control"]').setValue(text);
  await nextTick();
}

/** Dispatches a real, cancelable `keydown` on the field and hands the event back. */
async function press(wrapper: Mounted, key: string): Promise<KeyboardEvent> {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  control(wrapper).dispatchEvent(event);
  await nextTick();
  await nextTick();
  return event;
}

describe('Autocomplete: when the panel shows', () => {
  it('is closed until text is typed, then opens with the suggestions', async () => {
    const wrapper = mount({ suggestions: STREETS });
    expect(isOpen(wrapper)).toBe(false);

    await type(wrapper, 'Lau');

    expect(isOpen(wrapper)).toBe(true);
    expect(rows(wrapper).map((row) => row.find('[data-part="optionLabel"]').text())).toEqual([
      'Laugavegur 1',
      'Laugavegur 10',
      'Laugarnesvegur 3',
    ]);
    expect(rows(wrapper)[0]?.find('[data-part="optionDescription"]').text()).toBe('101 Reykjavík');
    expect(wrapper.emitted('update:modelValue')).toEqual([['Lau']]);
  });

  it('does not open while the text is shorter than minLength', async () => {
    const wrapper = mount({ suggestions: STREETS, minLength: 3 });

    await type(wrapper, 'La');
    expect(isOpen(wrapper)).toBe(false);

    await type(wrapper, 'Lau');
    expect(isOpen(wrapper)).toBe(true);

    await type(wrapper, 'La');
    expect(isOpen(wrapper)).toBe(false);
  });

  it('stays closed with no suggestions, and follows them as they change', async () => {
    const wrapper = mount({ suggestions: [] });
    await type(wrapper, 'Lau');
    expect(isOpen(wrapper)).toBe(false);

    await wrapper.setProps({ suggestions: STREETS });
    await nextTick();
    expect(rows(wrapper)).toHaveLength(3);

    await wrapper.setProps({ suggestions: STREETS.slice(0, 1) });
    await nextTick();
    expect(rows(wrapper)).toHaveLength(1);

    await wrapper.setProps({ suggestions: [] });
    await nextTick();
    expect(isOpen(wrapper)).toBe(false);
  });

  it('does not open for a single suggestion that equals the text', async () => {
    const wrapper = mount({ suggestions: [STREETS[0]] });

    await type(wrapper, 'Laugavegur 1');
    expect(isOpen(wrapper)).toBe(false);

    await type(wrapper, 'Laugavegur');
    expect(isOpen(wrapper)).toBe(true);
  });

  it('opens on focus when the field already holds text, and closes on blur', async () => {
    const wrapper = mount({ suggestions: STREETS, modelValue: 'Lau' });
    expect(isOpen(wrapper)).toBe(false);

    control(wrapper).focus();
    await nextTick();
    expect(isOpen(wrapper)).toBe(true);

    control(wrapper).blur();
    await nextTick();
    expect(isOpen(wrapper)).toBe(false);
    expect(wrapper.emitted('focus')).toHaveLength(1);
    expect(wrapper.emitted('blur')).toHaveLength(1);
  });

  it.each([{ disabled: true }, { readonly: true }])('never opens when %o', async (state) => {
    const wrapper = mount({ suggestions: STREETS, modelValue: 'Lau', ...state });

    control(wrapper).focus();
    await nextTick();
    const event = await press(wrapper, 'ArrowDown');

    expect(isOpen(wrapper)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(control(wrapper).getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps an open panel and its rows while a wait empties the suggestions', async () => {
    const wrapper = mount({ suggestions: STREETS });
    await type(wrapper, 'Lau');

    await wrapper.setProps({ suggestions: [], loading: true });
    await nextTick();
    expect(rows(wrapper)).toHaveLength(3);
    expect(panel(wrapper).find('[role="listbox"]').attributes('aria-busy')).toBe('true');

    await wrapper.setProps({ suggestions: [], loading: false });
    await nextTick();
    expect(isOpen(wrapper)).toBe(false);
  });

  it('does not open a closed panel on a wait', async () => {
    const wrapper = mount({ suggestions: [] });
    await type(wrapper, 'Lau');

    await wrapper.setProps({ loading: true });
    await nextTick();

    expect(isOpen(wrapper)).toBe(false);
  });

  it('shows the spinner only once the wait has lasted 300ms', async () => {
    vi.useFakeTimers();
    const wrapper = mount({ suggestions: [], loading: true });
    expect(wrapper.find('[data-part="busy"]').exists()).toBe(false);

    vi.advanceTimersByTime(300);
    await nextTick();
    expect(wrapper.find('[data-part="busy"]').exists()).toBe(true);

    await wrapper.setProps({ loading: false });
    expect(wrapper.find('[data-part="busy"]').exists()).toBe(false);
  });
});

describe('Autocomplete: keyboard', () => {
  it('has no active row on open, and Enter is then left to the form', async () => {
    const wrapper = mount({ suggestions: STREETS });
    await type(wrapper, 'Lau');

    expect(control(wrapper).hasAttribute('aria-activedescendant')).toBe(false);
    const event = await press(wrapper, 'Enter');

    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('moves with the arrows and selects the active row with Enter', async () => {
    const wrapper = mount({ suggestions: STREETS });
    await type(wrapper, 'Lau');

    expect((await press(wrapper, 'ArrowDown')).defaultPrevented).toBe(true);
    expect(control(wrapper).getAttribute('aria-activedescendant')).toBe(
      rows(wrapper)[0]?.element.id
    );
    await press(wrapper, 'ArrowDown');
    await press(wrapper, 'ArrowDown');
    await press(wrapper, 'ArrowUp');
    expect(control(wrapper).getAttribute('aria-activedescendant')).toBe(
      rows(wrapper)[1]?.element.id
    );

    const enter = await press(wrapper, 'Enter');

    expect(enter.defaultPrevented).toBe(true);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Laugavegur 10']);
    expect(wrapper.emitted('select')).toEqual([[STREETS[1]]]);
    expect(control(wrapper).value).toBe('Laugavegur 10');
    expect(isOpen(wrapper)).toBe(false);
  });

  it('emits update:modelValue before select', async () => {
    const order: string[] = [];
    const wrapper = mount({
      suggestions: STREETS,
      'onUpdate:modelValue': (value: string) => order.push(`update:${value}`),
      onSelect: (suggestion: AutocompleteSuggestion) => order.push(`select:${suggestion.value}`),
    });
    await type(wrapper, 'Lau');
    await press(wrapper, 'ArrowDown');
    await press(wrapper, 'Enter');

    expect(order).toEqual(['update:Lau', 'update:Laugavegur 1', 'select:a']);
  });

  it('ArrowUp from no active row lands on the last, and the ends do not wrap', async () => {
    const wrapper = mount({ suggestions: STREETS });
    await type(wrapper, 'Lau');

    await press(wrapper, 'ArrowUp');
    expect(control(wrapper).getAttribute('aria-activedescendant')).toBe(
      rows(wrapper)[2]?.element.id
    );
    await press(wrapper, 'ArrowDown');
    expect(control(wrapper).getAttribute('aria-activedescendant')).toBe(
      rows(wrapper)[2]?.element.id
    );
  });

  it('skips a disabled row', async () => {
    const wrapper = mount({
      suggestions: [STREETS[0], { ...STREETS[1], disabled: true }, STREETS[2]],
    });
    await type(wrapper, 'Lau');

    await press(wrapper, 'ArrowDown');
    await press(wrapper, 'ArrowDown');

    expect(control(wrapper).getAttribute('aria-activedescendant')).toBe(
      rows(wrapper)[2]?.element.id
    );
    expect(rows(wrapper)[1]?.attributes('aria-disabled')).toBe('true');
  });

  it.each(['Home', 'End', ' ', 'a'])('leaves %j to the text field', async (key) => {
    const wrapper = mount({ suggestions: STREETS });
    await type(wrapper, 'Lau');
    await press(wrapper, 'ArrowDown');

    const event = await press(wrapper, key);

    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(isOpen(wrapper)).toBe(true);
  });

  it('Escape closes and keeps the text', async () => {
    const wrapper = mount({ suggestions: STREETS });
    await type(wrapper, 'Lau');

    await press(wrapper, 'Escape');

    expect(isOpen(wrapper)).toBe(false);
    expect(control(wrapper).value).toBe('Lau');
    expect(document.activeElement).toBe(control(wrapper));
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('Tab closes without a selection and is not prevented', async () => {
    const wrapper = mount({ suggestions: STREETS });
    await type(wrapper, 'Lau');
    await press(wrapper, 'ArrowDown');

    const event = await press(wrapper, 'Tab');

    expect(event.defaultPrevented).toBe(false);
    expect(isOpen(wrapper)).toBe(false);
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(control(wrapper).value).toBe('Lau');
  });

  it('ArrowDown brings a dismissed panel back, on the first row', async () => {
    const wrapper = mount({ suggestions: STREETS });
    await type(wrapper, 'Lau');
    await press(wrapper, 'Escape');

    const event = await press(wrapper, 'ArrowDown');

    expect(event.defaultPrevented).toBe(true);
    expect(isOpen(wrapper)).toBe(true);
    expect(control(wrapper).getAttribute('aria-activedescendant')).toBe(
      rows(wrapper)[0]?.element.id
    );
  });

  it('leaves the arrows alone on a closed field with nothing to show', async () => {
    const wrapper = mount({ suggestions: [] });
    await type(wrapper, 'Lau');

    expect((await press(wrapper, 'ArrowDown')).defaultPrevented).toBe(false);
  });

  it('drops an active row the new suggestions no longer hold, so Enter submits again', async () => {
    const wrapper = mount({ suggestions: STREETS });
    await type(wrapper, 'Lau');
    await press(wrapper, 'ArrowDown');

    await wrapper.setProps({ suggestions: STREETS.slice(1) });
    await nextTick();

    expect(control(wrapper).hasAttribute('aria-activedescendant')).toBe(false);
    expect((await press(wrapper, 'Enter')).defaultPrevented).toBe(false);

    // The row coming back in a later answer is not active again.
    await wrapper.setProps({ suggestions: STREETS });
    await nextTick();
    expect(control(wrapper).hasAttribute('aria-activedescendant')).toBe(false);
  });
});

describe('Autocomplete: pointer', () => {
  it('makes a row active on hover and selects it on a press, without blurring the field', async () => {
    const wrapper = mount({ suggestions: STREETS });
    await type(wrapper, 'Lau');
    const row = rows(wrapper)[2]!;

    await row.trigger('mouseenter');
    expect(row.attributes('aria-selected')).toBe('true');
    expect(control(wrapper).getAttribute('aria-activedescendant')).toBe(row.element.id);

    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    row.element.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);

    await row.trigger('click');
    await nextTick();

    expect(wrapper.emitted('select')).toEqual([[STREETS[2]]]);
    expect(control(wrapper).value).toBe('Laugarnesvegur 3');
    expect(document.activeElement).toBe(control(wrapper));
    expect(isOpen(wrapper)).toBe(false);
  });

  it('does not select a disabled row', async () => {
    const wrapper = mount({ suggestions: [{ ...STREETS[0], disabled: true }, STREETS[1]] });
    await type(wrapper, 'Lau');

    await rows(wrapper)[0]!.trigger('mouseenter');
    await rows(wrapper)[0]!.trigger('click');
    await nextTick();

    expect(rows(wrapper)[0]?.attributes('aria-selected')).toBe('false');
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(isOpen(wrapper)).toBe(true);
  });
});

describe('Autocomplete: after a selection', () => {
  it('stays closed while the suggestions change, until the text changes', async () => {
    const wrapper = mount({ suggestions: STREETS });
    await type(wrapper, 'Lau');
    await press(wrapper, 'ArrowDown');
    await press(wrapper, 'Enter');
    expect(isOpen(wrapper)).toBe(false);

    // The consumer's answer for the text the selection wrote.
    await wrapper.setProps({ suggestions: [...STREETS] });
    await nextTick();
    expect(isOpen(wrapper)).toBe(false);

    await type(wrapper, 'Laugavegur 1 ');
    expect(isOpen(wrapper)).toBe(true);
  });

  it('opens again when the field is focused again', async () => {
    const wrapper = mount({ suggestions: STREETS });
    await type(wrapper, 'Lau');
    await rows(wrapper)[1]!.trigger('click');
    await nextTick();
    expect(isOpen(wrapper)).toBe(false);

    control(wrapper).blur();
    await nextTick();
    control(wrapper).focus();
    await nextTick();

    expect(isOpen(wrapper)).toBe(true);
  });

  it('keeps whatever is typed: nothing has to be chosen', async () => {
    const wrapper = mount({ suggestions: STREETS });
    await type(wrapper, 'Somewhere else 5');
    control(wrapper).blur();
    await nextTick();

    expect(control(wrapper).value).toBe('Somewhere else 5');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Somewhere else 5']);
    expect(wrapper.emitted('select')).toBeUndefined();
  });
});

describe('Autocomplete: ARIA', () => {
  it('is a combobox with list autocomplete, closed', () => {
    const wrapper = mount({ suggestions: STREETS, autocomplete: 'address-line1' });
    const input = control(wrapper);

    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-controls')).toBe(false);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    // The consumer's own token is kept: it is never forced to `off`.
    expect(input.getAttribute('autocomplete')).toBe('address-line1');
    expect(input.getAttribute('type')).toBe('text');
  });

  it('points at a named listbox while open, and at the active row while there is one', async () => {
    const wrapper = mount({ suggestions: STREETS, id: 'street' });
    await type(wrapper, 'Lau');
    const input = control(wrapper);
    const listbox = panel(wrapper).find('[role="listbox"]');

    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(listbox.element.id);
    expect(listbox.attributes('aria-label')).toBe('Suggestions');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    expect(rows(wrapper).map((row) => row.element.id)).toEqual([
      'street-option-0',
      'street-option-1',
      'street-option-2',
    ]);
    expect(rows(wrapper).map((row) => row.attributes('aria-selected'))).toEqual([
      'false',
      'false',
      'false',
    ]);

    await press(wrapper, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe('street-option-0');
    expect(rows(wrapper).map((row) => row.attributes('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);

    await press(wrapper, 'Escape');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-controls')).toBe(false);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('names the list from messages, per instance and in Icelandic', async () => {
    const wrapper = mount({ suggestions: STREETS, messages: { suggestions: isIS.suggestions } });
    await type(wrapper, 'Lau');

    expect(isIS.suggestions).toBe('Tillögur');
    expect(panel(wrapper).find('[role="listbox"]').attributes('aria-label')).toBe('Tillögur');
  });

  it('has no axe violations, closed and open with an active row', async () => {
    const wrapper = mount({ suggestions: STREETS });
    expect(await axe(document.body)).toHaveNoViolations();

    await type(wrapper, 'Lau');
    await press(wrapper, 'ArrowDown');
    expect(await axe(document.body)).toHaveNoViolations();
  });
});

describe('Autocomplete: the field, the panel and the slots', () => {
  it('is an Input: its parts, its size, its clear button and its events', async () => {
    const wrapper = mount({ suggestions: STREETS, clearable: true, size: 'lg', name: 'street' });
    await type(wrapper, 'Lau');

    expect(wrapper.find('[data-part="root"]').attributes()).toHaveProperty('data-eldra-ui');
    expect(control(wrapper).getAttribute('name')).toBe('street');
    expect(control(wrapper).className).toContain('eldra:control-h-lg');

    await wrapper.find('[data-part="clearButton"]').trigger('click');
    await nextTick();

    expect(wrapper.emitted('clear')).toHaveLength(1);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['']);
    expect(isOpen(wrapper)).toBe(false);
  });

  it('takes its id, invalid state and description from a FieldWrapper', async () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Street address', error: 'Enter a street address.' },
      slots: { default: () => h(Autocomplete, { suggestions: STREETS }) },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    const input = wrapper.find('input').element;

    expect(wrapper.find('label').attributes('for')).toBe(input.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();

    input.focus();
    await wrapper.find('input').setValue('Lau');
    await nextTick();
    expect(panelOf(input).exists()).toBe(true);
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('teleports the panel to body, marked as the kit and owned by the field', async () => {
    const wrapper = mount({
      suggestions: STREETS,
      classes: { panel: 'my-panel', option: 'my-row' },
    });
    await type(wrapper, 'Lau');
    const element = panel(wrapper).element;

    expect(element.parentElement).toBe(document.body);
    expect(element.hasAttribute('data-eldra-ui')).toBe(true);
    expect(element.getAttribute('data-part')).toBe('panel');
    expect(element.classList.contains('my-panel')).toBe(true);
    expect(rows(wrapper)[0]?.classes()).toContain('my-row');
  });

  it('draws a row through the option slot, with the suggestion and whether it is active', async () => {
    const wrapper = mount(
      { suggestions: STREETS },
      {
        slots: {
          option: ({
            suggestion,
            active,
          }: {
            suggestion: AutocompleteSuggestion;
            active: boolean;
          }) => h('span', { class: 'custom' }, `${suggestion.label}|${active ? 'on' : 'off'}`),
        },
      }
    );
    await type(wrapper, 'Lau');
    await press(wrapper, 'ArrowDown');

    expect(rows(wrapper).map((row) => row.find('.custom').text())).toEqual([
      'Laugavegur 1|on',
      'Laugavegur 10|off',
      'Laugarnesvegur 3|off',
    ]);
  });

  it('draws the footer slot under the list, outside the listbox', async () => {
    const wrapper = mount(
      { suggestions: STREETS },
      { slots: { footer: () => 'Addresses from the national register' } }
    );
    await type(wrapper, 'Lau');
    const footer = panel(wrapper).find('[data-part="footer"]');

    expect(footer.text()).toBe('Addresses from the national register');
    expect(footer.element.closest('[role="listbox"]')).toBeNull();
  });

  it('renders no footer element without the slot, and no panel for a footer alone', async () => {
    const plain = mount({ suggestions: STREETS });
    await type(plain, 'Lau');
    expect(panel(plain).find('[data-part="footer"]').exists()).toBe(false);

    const empty = mount({ suggestions: [] }, { slots: { footer: () => 'Credit' } });
    await type(empty, 'Lau');
    expect(isOpen(empty)).toBe(false);
  });

  it('works uncontrolled and controlled', async () => {
    const Controlled = defineComponent({
      setup() {
        const value = ref('');
        return () =>
          h(Autocomplete, {
            'aria-label': 'Address',
            suggestions: STREETS,
            modelValue: value.value,
            'onUpdate:modelValue': (next: string) => (value.value = next.toUpperCase()),
          });
      },
    });
    const wrapper = mountWith(Controlled);
    mounted.push(wrapper as unknown as VueWrapper);
    const input = wrapper.find('[data-part="control"]');

    (input.element as HTMLInputElement).focus();
    await input.setValue('lau');
    await nextTick();

    expect((input.element as HTMLInputElement).value).toBe('LAU');
  });

  it('fits a narrow container', async () => {
    const wrapper = mountNarrow(Autocomplete, {
      props: { 'aria-label': 'Address', suggestions: STREETS },
    });
    mounted.push(wrapper as unknown as VueWrapper);

    expect(wrapper.find('[data-part="control"]').classes()).toContain('eldra:w-full');
  });

  it('renders on the server as a closed combobox, with no panel', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(Autocomplete, { 'aria-label': 'Address', modelValue: 'Lau', suggestions: STREETS }),
      })
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="listbox"');
  });
});
