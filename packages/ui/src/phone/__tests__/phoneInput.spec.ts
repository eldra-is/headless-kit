import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import FieldWrapper from '../../components/field-wrapper/FieldWrapper.vue';
import { provideEldraUiLocale } from '../../composables/useLocale';
import { provideEldraUiMessages } from '../../composables/useMessages';
import isIS from '../../messages/is-IS';
import { axe } from '../../test/axe';
import { mountWith } from '../../test/mount';
import { preloadPhoneFlags } from '../flags';
import PhoneInput from '../PhoneInput.vue';
import type { PhoneInputChange } from '../types';

afterEach(() => {
  document.body.innerHTML = '';
});

type Mounted = VueWrapper<any>;

const mount = (props: Record<string, unknown> = {}, attrs: Record<string, unknown> = {}): Mounted =>
  mountWith(PhoneInput, {
    props: { defaultCountry: 'IS', 'aria-label': 'Phone number', ...props },
    attrs,
  } as never);

const control = (wrapper: Mounted): HTMLInputElement =>
  (wrapper.element as HTMLElement).querySelector<HTMLInputElement>('input[data-part="control"]')!;
const button = (wrapper: Mounted): HTMLButtonElement =>
  (wrapper.element as HTMLElement).querySelector<HTMLButtonElement>('[data-part="countryButton"]')!;
const panel = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-part="panel"]');
const search = (): HTMLInputElement =>
  document.querySelector<HTMLInputElement>('[data-part="search"]')!;
const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
const rowNames = (): string[] =>
  rows().map((row) => row.querySelector('[data-part="optionLabel"]')!.textContent!.trim());

/** A popover opens, focuses and positions over several ticks. */
async function settle(): Promise<void> {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await flushPromises();
}

/** Types `value` the way a browser reports it: the element's text, the caret, then `input`. */
async function type(wrapper: Mounted, value: string, caret = value.length): Promise<void> {
  const element = control(wrapper);
  element.value = value;
  element.setSelectionRange(caret, caret);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  await nextTick();
}

async function open(wrapper: Mounted): Promise<void> {
  button(wrapper).dispatchEvent(new Event('pointerdown', { bubbles: true }));
  button(wrapper).click();
  await settle();
}

async function press(target: Element, key: string): Promise<void> {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await settle();
}

async function query(text: string): Promise<void> {
  search().value = text;
  search().dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

const lastEmit = <T>(wrapper: Mounted, event: string): T | undefined =>
  (wrapper.emitted(event)?.at(-1)?.[0] as T | undefined) ?? undefined;

describe('PhoneInput: the field', () => {
  it('is a country button and a telephone input in one box', () => {
    const wrapper = mount();
    expect(wrapper.element.hasAttribute('data-eldra-ui')).toBe(true);
    const field = wrapper.element.querySelector('[data-part="field"]')!;
    expect([...field.children].map((child) => child.getAttribute('data-part'))).toEqual([
      'countryButton',
      'control',
    ]);
    expect(control(wrapper).type).toBe('tel');
    expect(control(wrapper).getAttribute('inputmode')).toBe('tel');
    expect(control(wrapper).getAttribute('autocomplete')).toBe('tel-national');
    expect(button(wrapper).type).toBe('button');
  });

  it('starts on the default country: its flag box, its dialling code, an example as placeholder', () => {
    const wrapper = mount();
    expect(button(wrapper).querySelector('[data-part="callingCode"]')!.textContent).toBe('+354');
    expect(button(wrapper).querySelector('svg[data-part="flag"]')).not.toBeNull();
    expect(button(wrapper).getAttribute('aria-label')).toBe('Country: Iceland, +354');
    expect(control(wrapper).placeholder).toMatch(/^\d{3} \d{4}$/);
  });

  it('takes a placeholder of its own, or none', () => {
    expect(control(mount({ placeholder: '581 2345' })).placeholder).toBe('581 2345');
    expect(control(mount({ placeholder: false })).hasAttribute('placeholder')).toBe(false);
  });

  it('falls back to the first suggested, then the first offered country, then the United States', () => {
    const code = (props: Record<string, unknown>): string =>
      button(mountWith(PhoneInput, { props } as never))
        .querySelector('[data-part="callingCode"]')!
        .textContent!.trim();
    expect(code({ preferredCountries: ['DK', 'IS'] })).toBe('+45');
    expect(code({ countries: ['SE', 'NO'] })).toBe('+46');
    expect(code({})).toBe('+1');
    expect(code({ defaultCountry: 'ZZ' })).toBe('+1');
  });

  it('draws the flag once the artwork has loaded, in the same element', async () => {
    const wrapper = mount();
    const flag = button(wrapper).querySelector('svg[data-part="flag"]')!;
    await preloadPhoneFlags();
    await nextTick();
    expect(button(wrapper).querySelector('svg[data-part="flag"]')).toBe(flag);
    expect(flag.getAttribute('viewBox')).toBe('0 0 513 342');
    expect(flag.innerHTML).toContain('<path');
    expect(flag.getAttribute('aria-hidden')).toBe('true');
  });

  it('takes a flag of the consumer’s own through the slot', () => {
    const wrapper = mountWith(PhoneInput, {
      props: { defaultCountry: 'IS' },
      slots: { flag: ({ country }: { country: string }) => h('i', { class: 'own' }, country) },
    } as never);
    expect(button(wrapper).querySelector('.own')!.textContent).toBe('IS');
    expect(button(wrapper).querySelector('[data-part="flag"]')).toBeNull();
  });

  it('puts attributes on the number input and `class` on the root', () => {
    const wrapper = mount({}, { class: 'mt-4', 'data-testid': 'phone' });
    expect(wrapper.element.classList).toContain('mt-4');
    expect(control(wrapper).getAttribute('data-testid')).toBe('phone');
    expect(control(wrapper).getAttribute('aria-label')).toBe('Phone number');
  });

  it('appends `classes` to each part', () => {
    const wrapper = mount({
      classes: { field: 'f', countryButton: 'b', flag: 'fl', callingCode: 'cc', control: 'c' },
    });
    expect(wrapper.element.querySelector('[data-part="field"]')!.classList).toContain('f');
    expect(button(wrapper).classList).toContain('b');
    expect(button(wrapper).querySelector('[data-part="flag"]')!.classList).toContain('fl');
    expect(button(wrapper).querySelector('[data-part="callingCode"]')!.classList).toContain('cc');
    expect(control(wrapper).classList).toContain('c');
  });

  it('posts the E.164 value under `name`, and nothing without one', async () => {
    const wrapper = mount({ name: 'phone' });
    const hidden = (): HTMLInputElement | null =>
      (wrapper.element as HTMLElement).querySelector<HTMLInputElement>('input[type="hidden"]');
    expect(hidden()!.name).toBe('phone');
    expect(control(wrapper).hasAttribute('name')).toBe(false);
    await type(wrapper, '5812345');
    expect(hidden()!.value).toBe('+3545812345');
    expect(mount().element.querySelector('input[type="hidden"]')).toBeNull();
  });
});

describe('PhoneInput: typing', () => {
  it('spaces the number as it is typed and emits it in E.164', async () => {
    const wrapper = mount();
    await type(wrapper, '5812345');
    expect(control(wrapper).value).toBe('581 2345');
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('+3545812345');
    expect(lastEmit<PhoneInputChange>(wrapper, 'change')).toEqual({
      e164: '+3545812345',
      country: 'IS',
      callingCode: '354',
      nationalNumber: '5812345',
      valid: true,
    });
  });

  it('emits the code and the digits so far for an incomplete number, and says it is not valid', async () => {
    const wrapper = mount();
    await type(wrapper, '581');
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('+354581');
    expect(lastEmit<PhoneInputChange>(wrapper, 'change')!.valid).toBe(false);
  });

  it('emits an empty value when the last digit goes', async () => {
    const wrapper = mount({ modelValue: '+3545' });
    await type(wrapper, '');
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('');
  });

  it('removes a character that is not part of a number, straight from the element', async () => {
    const wrapper = mount();
    await type(wrapper, '581');
    await type(wrapper, '581x');
    expect(control(wrapper).value).toBe('581');
  });

  it('keeps the caret by what was typed when a digit goes in mid-number', async () => {
    const wrapper = mount({ defaultCountry: 'DK' });
    await type(wrapper, '32123456');
    expect(control(wrapper).value).toBe('32 12 34 56');
    // "32 1|2 34 56": a 9 typed after the third digit.
    await type(wrapper, '32 192 34 56', 5);
    const value = control(wrapper).value;
    const caret = control(wrapper).selectionStart!;
    expect(value.replace(/\D/g, '')).toBe('321923456');
    expect(value.slice(0, caret).replace(/\D/g, '')).toBe('3219');
    expect(value[caret - 1]).toBe('9');
  });

  it('puts the caret past a space the format adds at the end of what was typed', async () => {
    const wrapper = mount();
    await type(wrapper, '5812');
    expect(control(wrapper).value).toBe('581 2');
    expect(control(wrapper).selectionStart).toBe(5);
  });

  it('picks the country from a pasted number that starts with +', async () => {
    const wrapper = mount({ country: 'IS' });
    await type(wrapper, '+45 32 12 34 56');
    expect(control(wrapper).value).toBe('32 12 34 56');
    expect(button(wrapper).querySelector('[data-part="callingCode"]')!.textContent).toBe('+45');
    expect(button(wrapper).getAttribute('aria-label')).toBe('Country: Denmark, +45');
    expect(lastEmit(wrapper, 'update:country')).toBe('DK');
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('+4532123456');
    expect(control(wrapper).selectionStart).toBe('32 12 34 56'.length);
  });

  it('a dialling code pasted in front of the digits leaves the caret in front of them', async () => {
    const wrapper = mount();
    await type(wrapper, '32123456');
    // "+45|32123456": the three pasted characters leave the text, so the caret is at the start.
    await type(wrapper, '+4532123456', 3);
    expect(control(wrapper).value).toBe('32 12 34 56');
    expect(control(wrapper).selectionStart).toBe(0);
  });

  it('picks the country as the dialling code is typed, and the caret stays with the digits', async () => {
    const wrapper = mount();
    await type(wrapper, '+4');
    expect(control(wrapper).value).toBe('+4');
    expect(button(wrapper).textContent).toContain('+354');
    await type(wrapper, '+45');
    expect(control(wrapper).value).toBe('');
    expect(button(wrapper).textContent).toContain('+45');
    await type(wrapper, '3');
    expect(control(wrapper).value).toBe('3');
    expect(control(wrapper).selectionStart).toBe(1);
  });

  it('does not switch to a country outside `countries`', async () => {
    const wrapper = mount({ countries: ['IS', 'DK'] });
    await type(wrapper, '+447400123456');
    expect(button(wrapper).textContent).toContain('+354');
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('+447400123456');
    expect(lastEmit<PhoneInputChange>(wrapper, 'change')!.valid).toBe(false);
  });

  it('does not re-space a composition until it ends', async () => {
    const wrapper = mount();
    const element = control(wrapper);
    element.value = '5812';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    await nextTick();
    expect(element.value).toBe('5812');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('emits focus and blur from the number input', async () => {
    const wrapper = mount();
    control(wrapper).dispatchEvent(new FocusEvent('focus'));
    control(wrapper).dispatchEvent(new FocusEvent('blur'));
    expect(wrapper.emitted('focus')).toHaveLength(1);
    expect(wrapper.emitted('blur')).toHaveLength(1);
  });
});

describe('PhoneInput: a value from outside', () => {
  it('shows a bound number in its own country, whatever the default', () => {
    const wrapper = mount({ modelValue: '+4532123456' });
    expect(control(wrapper).value).toBe('32 12 34 56');
    expect(button(wrapper).textContent).toContain('+45');
  });

  it('tells a bound `country` when the value names another', async () => {
    const wrapper = mount({ modelValue: '+4532123456', country: 'IS' });
    await nextTick();
    expect(lastEmit(wrapper, 'update:country')).toBe('DK');
  });

  it('follows the value when the parent changes it', async () => {
    const wrapper = mount({ modelValue: '+3545812345' });
    await wrapper.setProps({ modelValue: '+4532123456' });
    expect(control(wrapper).value).toBe('32 12 34 56');
    expect(button(wrapper).textContent).toContain('+45');
    await wrapper.setProps({ modelValue: '' });
    expect(control(wrapper).value).toBe('');
    expect(button(wrapper).textContent).toContain('+45');
  });

  it('follows a bound country, keeping the digits and re-spacing them', async () => {
    const wrapper = mount({ country: 'IS' });
    await type(wrapper, '32123456');
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('+35432123456');
    await wrapper.setProps({ country: 'DK' });
    expect(control(wrapper).value).toBe('32 12 34 56');
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('+4532123456');
  });

  it('does not eat a national prefix as it is typed into a bound field', async () => {
    const Host = defineComponent({
      setup() {
        const value = ref('');
        return () =>
          h(PhoneInput, {
            defaultCountry: 'GB',
            modelValue: value.value,
            'onUpdate:modelValue': (next: string) => (value.value = next),
          });
      },
    });
    const wrapper = mountWith(Host) as Mounted;
    await type(wrapper, '0');
    expect(control(wrapper).value).toBe('0');
    await type(wrapper, '07400');
    expect(control(wrapper).value).toBe('07400');
    await type(wrapper, '07400123456');
    expect(control(wrapper).value).toBe('07400 123456');
  });

  it('goes back to what the model says when a parent refuses the value', async () => {
    const wrapper = mount({ modelValue: '+3545812345' });
    await type(wrapper, '58123456');
    await settle();
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('+35458123456');
    expect(control(wrapper).value).toBe('581 2345');
  });
});

describe('PhoneInput: the country list', () => {
  it('opens under the button as a labelled listbox, with focus in its search field', async () => {
    const wrapper = mount({ preferredCountries: ['IS'] });
    expect(button(wrapper).getAttribute('role')).toBe('combobox');
    expect(button(wrapper).getAttribute('aria-haspopup')).toBe('listbox');
    expect(button(wrapper).getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();

    await open(wrapper);
    expect(button(wrapper).getAttribute('aria-expanded')).toBe('true');
    expect(panel()!.hasAttribute('data-eldra-ui')).toBe(true);
    const listbox = document.querySelector('[role="listbox"]')!;
    expect(button(wrapper).getAttribute('aria-controls')).toBe(listbox.id);
    expect(listbox.getAttribute('aria-label')).toBe('Country');
    expect(document.activeElement).toBe(search());
    expect(search().placeholder).toBe('Search country or code');
    expect(search().getAttribute('aria-label')).toBe('Search country or code');
    expect(wrapper.emitted('open')).toHaveLength(1);
  });

  it('lists the suggested countries first, in the order given, then the rest from A to Z, each once', async () => {
    const wrapper = mount({ preferredCountries: ['IS', 'DK'] });
    await open(wrapper);
    expect(
      [...document.querySelectorAll('[data-part="groupLabel"]')].map((label) =>
        label.textContent!.trim()
      )
    ).toEqual(['Suggested', 'All countries']);
    const names = rowNames();
    expect(names.slice(0, 4)).toEqual(['Iceland', 'Denmark', 'Afghanistan', 'Åland Islands']);
    expect(names.filter((name) => name === 'Iceland')).toHaveLength(1);
    expect(names.length).toBeGreaterThan(240);
    const rest = names.slice(2);
    expect(rest).toEqual([...rest].sort(new Intl.Collator('en-US').compare));
  });

  it('draws a flag, the name and the dialling code on each row, and marks the chosen one', async () => {
    const wrapper = mount({ preferredCountries: ['IS'] });
    await open(wrapper);
    const row = rows()[0]!;
    expect(row.querySelector('svg[data-part="flag"]')).not.toBeNull();
    expect(row.querySelector('[data-part="optionLabel"]')!.textContent!.trim()).toBe('Iceland');
    expect(row.querySelector('[data-part="optionMeta"]')!.textContent!.trim()).toBe('+354');
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(row.querySelector('[data-part="optionCheck"]')).not.toBeNull();
    expect(rows()[1]!.getAttribute('aria-selected')).toBe('false');
  });

  it('has no headings when no country is suggested', async () => {
    const wrapper = mount({ countries: ['SE', 'IS', 'DK'] });
    await open(wrapper);
    expect(document.querySelector('[data-part="groupLabel"]')).toBeNull();
    expect(rowNames()).toEqual(['Denmark', 'Iceland', 'Sweden']);
  });

  it('finds a country by name, without minding accents or case', async () => {
    const wrapper = mount();
    await open(wrapper);
    await query('aland');
    expect(rowNames()).toContain('Åland Islands');
    await query('DENM');
    expect(rowNames()).toEqual(['Denmark']);
  });

  it('finds countries by dialling code, with or without the +', async () => {
    const wrapper = mount({ countries: ['IS', 'DK', 'DE', 'NO', 'PL', 'SE', 'FI', 'US'] });
    await open(wrapper);
    await query('+4');
    expect(rowNames()).toEqual(['Denmark', 'Germany', 'Norway', 'Poland', 'Sweden']);
    await query('354');
    expect(rowNames()).toEqual(['Iceland']);
  });

  it('says so in text when nothing matches', async () => {
    const wrapper = mount();
    await open(wrapper);
    await query('Atlantis');
    expect(rows()).toHaveLength(0);
    expect(document.querySelector('[data-part="empty"]')!.textContent!.trim()).toBe(
      'No country matches “Atlantis”.'
    );
  });

  it('choosing a country keeps the digits, re-spaces them and moves focus to the number', async () => {
    const wrapper = mount({ countries: ['IS', 'DK'] });
    await type(wrapper, '32123456');
    await open(wrapper);
    rows()
      .find((row) => row.textContent!.includes('Denmark'))!
      .click();
    await settle();
    expect(panel()).toBeNull();
    expect(control(wrapper).value).toBe('32 12 34 56');
    expect(button(wrapper).getAttribute('aria-label')).toBe('Country: Denmark, +45');
    expect(lastEmit(wrapper, 'update:country')).toBe('DK');
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('+4532123456');
    expect(document.activeElement).toBe(control(wrapper));
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('a country chosen by hand is not pulled back by a number valid next door', async () => {
    const wrapper = mount({ defaultCountry: 'GB' });
    await type(wrapper, '07400123456');
    await open(wrapper);
    await query('Jersey');
    rows()[0]!.click();
    await settle();
    expect(button(wrapper).getAttribute('aria-label')).toContain('Jersey');
  });

  it('names countries in the locale, sorts them in its order, and speaks its messages', async () => {
    const Host = defineComponent({
      setup() {
        provideEldraUiLocale('is-IS');
        provideEldraUiMessages(isIS);
        return () =>
          h(PhoneInput, { defaultCountry: 'IS', countries: ['IS', 'DK', 'AT', 'GB', 'DE'] });
      },
    });
    const wrapper = mountWith(Host) as Mounted;
    expect(button(wrapper).getAttribute('aria-label')).toBe('Land: Ísland, +354');
    await open(wrapper);
    // Icelandic order: Á after A, Þ near the end.
    expect(rowNames()).toEqual(['Austurríki', 'Bretland', 'Danmörk', 'Ísland', 'Þýskaland']);
    expect(search().placeholder).toBe('Leita að landi eða landsnúmeri');
    await query('xyz');
    expect(document.querySelector('[data-part="empty"]')!.textContent!.trim()).toBe(
      'Ekkert land passar við „xyz“.'
    );
  });

  it('the `locale` prop wins over the provided one', () => {
    const wrapper = mount({ locale: 'is-IS', defaultCountry: 'DK' });
    expect(button(wrapper).getAttribute('aria-label')).toBe('Country: Danmörk, +45');
  });
});

describe('PhoneInput: the keyboard', () => {
  it.each(['Enter', ' ', 'ArrowDown'])('%j on the button opens the list', async (key) => {
    const wrapper = mount();
    button(wrapper).focus();
    await press(button(wrapper), key);
    expect(panel()).not.toBeNull();
    expect(document.activeElement).toBe(search());
  });

  it('opens on the chosen country, and the arrows move through the rows', async () => {
    const wrapper = mount({ countries: ['IS', 'DK', 'SE'] });
    await open(wrapper);
    const active = (): string | null => search().getAttribute('aria-activedescendant');
    const name = (id: string | null): string =>
      document.getElementById(id!)!.querySelector('[data-part="optionLabel"]')!.textContent!.trim();
    expect(name(active())).toBe('Iceland');
    await press(search(), 'ArrowDown');
    expect(name(active())).toBe('Sweden');
    await press(search(), 'ArrowUp');
    await press(search(), 'ArrowUp');
    expect(name(active())).toBe('Denmark');
  });

  it('Enter chooses the active country and moves focus to the number', async () => {
    const wrapper = mount({ countries: ['IS', 'DK', 'SE'] });
    await open(wrapper);
    await query('swe');
    await press(search(), 'Enter');
    expect(panel()).toBeNull();
    expect(button(wrapper).getAttribute('aria-label')).toBe('Country: Sweden, +46');
    expect(document.activeElement).toBe(control(wrapper));
  });

  it('Escape clears the search first, then closes and returns focus to the button', async () => {
    const wrapper = mount();
    await open(wrapper);
    await query('den');
    await press(search(), 'Escape');
    expect(panel()).not.toBeNull();
    expect(search().value).toBe('');
    await press(search(), 'Escape');
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button(wrapper));
    expect(button(wrapper).getAttribute('aria-label')).toBe('Country: Iceland, +354');
  });

  it('starts a search from a letter typed on the closed button', async () => {
    const wrapper = mount();
    button(wrapper).focus();
    await press(button(wrapper), 'd');
    expect(panel()).not.toBeNull();
    expect(search().value).toBe('d');
  });

  it('clears the search when the list closes', async () => {
    const wrapper = mount();
    await open(wrapper);
    await query('den');
    await press(search(), 'Escape');
    await press(search(), 'Escape');
    await open(wrapper);
    expect(search().value).toBe('');
    expect(rows().length).toBeGreaterThan(240);
  });
});

describe('PhoneInput: states', () => {
  it('disabled: neither control works, the list does not open, the value is not posted', async () => {
    const wrapper = mount({ disabled: true, name: 'phone', modelValue: '+3545812345' });
    expect(control(wrapper).disabled).toBe(true);
    expect(button(wrapper).disabled).toBe(true);
    expect(
      (wrapper.element as HTMLElement).querySelector<HTMLInputElement>('input[type="hidden"]')!
        .disabled
    ).toBe(true);
    await open(wrapper);
    expect(panel()).toBeNull();
    expect(wrapper.element.querySelector('[data-part="field"]')!.className).toContain(
      'eldra:border-dashed'
    );
  });

  it('read-only: the number cannot be edited, the list does not open, the chevron goes', async () => {
    const wrapper = mount({ readonly: true, modelValue: '+3545812345' });
    expect(control(wrapper).readOnly).toBe(true);
    expect(button(wrapper).getAttribute('aria-readonly')).toBe('true');
    expect(button(wrapper).querySelector('[data-part="chevron"]')).toBeNull();
    await open(wrapper);
    expect(panel()).toBeNull();
    button(wrapper).focus();
    await press(button(wrapper), 'ArrowDown');
    expect(panel()).toBeNull();
  });

  it('invalid: says so on the number, and draws the error boundary on the box', () => {
    const wrapper = mount({ invalid: true });
    const field = wrapper.element.querySelector('[data-part="field"]')!;
    expect(control(wrapper).getAttribute('aria-invalid')).toBe('true');
    expect(field.className).toContain('eldra:border-danger');
    expect(field.className).toContain('eldra:eldra-field-invalid');
    const disabled = mount({ invalid: true, disabled: true });
    expect(disabled.element.querySelector('[data-part="field"]')!.className).not.toContain(
      'eldra:border-danger'
    );
  });

  it('puts the one focus ring on the box, for the number, the button and the open list', () => {
    const field = mount().element.querySelector('[data-part="field"]')!;
    expect(field.className).toContain('eldra:eldra-focus ');
    expect(field.className).toContain('eldra:eldra-focus-proxy');
    expect(field.className).toContain('eldra:eldra-focus-has-open');
  });

  it.each(['sm', 'md', 'lg'] as const)('size %s is the control height of an Input', (size) => {
    const field = mount({ size }).element.querySelector('[data-part="field"]')!;
    const height = { sm: 'eldra:control-h-sm', md: 'eldra:control-h', lg: 'eldra:control-h-lg' };
    expect(field.className.split(' ')).toContain(height[size]);
  });
});

describe('PhoneInput: in a field wrapper', () => {
  const inWrapper = (
    props: Record<string, unknown> = {},
    phone: Record<string, unknown> = {}
  ): Mounted =>
    mountWith(FieldWrapper, {
      props: { label: 'Phone number', help: 'Only used about this order.', ...props },
      slots: {
        default: () =>
          h(PhoneInput, { defaultCountry: 'IS', preferredCountries: ['IS'], ...phone }),
      },
    } as never);

  it('the label names the number, and the help and the error describe it', () => {
    const wrapper = inWrapper({ error: 'Enter a valid phone number for Iceland.', required: true });
    const label = wrapper.element.querySelector('label')!;
    expect(label.getAttribute('for')).toBe(control(wrapper).id);
    const described = control(wrapper).getAttribute('aria-describedby')!.split(' ');
    expect(described.map((id) => document.getElementById(id)!.textContent!.trim())).toEqual([
      'Enter a valid phone number for Iceland.',
      'Only used about this order.',
    ]);
    expect(control(wrapper).getAttribute('aria-invalid')).toBe('true');
    expect(control(wrapper).required).toBe(true);
  });

  it.each([
    ['at rest', {}],
    ['with an error', { error: 'Enter a valid phone number for Iceland.' }],
  ])('has no accessibility violations %s', async (_title, props) => {
    const wrapper = inWrapper(props);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('has no accessibility violations with the list open, searching, and with no match', async () => {
    // A dozen countries: the rows are all alike, and axe over all 245 three times is slow.
    const wrapper = inWrapper(
      {},
      { countries: ['IS', 'DK', 'DE', 'NO', 'PL', 'SE', 'FI', 'US', 'GB', 'FR', 'ES', 'IT'] }
    );
    await open(wrapper);
    expect(await axe(document.body)).toHaveNoViolations();
    await query('+4');
    expect(await axe(document.body)).toHaveNoViolations();
    await query('Atlantis');
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it.each([
    ['disabled', { disabled: true }],
    ['read-only', { readonly: true }],
  ])('has no accessibility violations when %s', async (_title, props) => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Phone number' },
      slots: {
        default: () => h(PhoneInput, { defaultCountry: 'IS', modelValue: '+3545812345', ...props }),
      },
    } as never);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
