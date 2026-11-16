import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import Button from '../../components/button/Button.vue';
import FieldWrapper from '../../components/field-wrapper/FieldWrapper.vue';
import { provideEldraUiLocale } from '../../composables/useLocale';
import { provideEldraUiMessages } from '../../composables/useMessages';
import isIS from '../../messages/is-IS';
import { axe } from '../../test/axe';
import { mountWith } from '../../test/mount';
import Form from '../../vee-validate/Form.vue';
import * as entry from '../vee-validate/index';
import FieldPhoneInput from '../vee-validate/FieldPhoneInput.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

type Mounted = VueWrapper<any>;

async function settle(): Promise<void> {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await flushPromises();
}

function mountForm(
  fieldProps: Record<string, unknown> = {},
  formProps: Record<string, unknown> = {}
): Mounted {
  return mountWith(Form, {
    props: { ariaLabel: 'Contact details', ...formProps },
    slots: {
      default: ({ errors }: { errors: Record<string, string | undefined> }) =>
        h(FieldWrapper, { label: 'Phone number', error: errors.phone }, () =>
          h(FieldPhoneInput, { name: 'phone', defaultCountry: 'IS', ...fieldProps })
        ),
      actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Save'),
    },
  } as never);
}

const control = (wrapper: Mounted): HTMLInputElement =>
  (wrapper.element as HTMLElement).querySelector<HTMLInputElement>('input[data-part="control"]')!;
const message = (wrapper: Mounted): string | undefined =>
  wrapper.element.querySelector('[data-part="error"]')?.textContent?.trim();

async function type(wrapper: Mounted, value: string): Promise<void> {
  const element = control(wrapper);
  element.value = value;
  element.setSelectionRange(value.length, value.length);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}
async function blur(wrapper: Mounted): Promise<void> {
  control(wrapper).dispatchEvent(new FocusEvent('blur'));
  await settle();
}
async function submit(wrapper: Mounted): Promise<void> {
  await wrapper.find('form').trigger('submit');
  await settle();
}

describe('@eldrajs/ui/phone/vee-validate', () => {
  it('exports the field and the rule', () => {
    expect(Object.keys(entry).sort()).toEqual(['FieldPhoneInput', 'phoneRule']);
  });
});

describe('FieldPhoneInput', () => {
  it('validates when the field is left, not while the number is typed, and names the country', async () => {
    const wrapper = mountForm();
    await type(wrapper, '58123');
    expect(message(wrapper)).toBeUndefined();
    expect(control(wrapper).hasAttribute('aria-invalid')).toBe(false);

    await blur(wrapper);
    expect(message(wrapper)).toBe('Enter a valid phone number for Iceland.');
    expect(control(wrapper).getAttribute('aria-invalid')).toBe('true');
    expect(await axe(wrapper.element)).toHaveNoViolations();

    // Fixing it does not clear the message until the field is left again.
    await type(wrapper, '5812345');
    expect(message(wrapper)).toBe('Enter a valid phone number for Iceland.');
    await blur(wrapper);
    expect(message(wrapper)).toBeUndefined();
  });

  it('validates on submit, and submits the E.164 value', async () => {
    const wrapper = mountForm();
    await type(wrapper, '58123');
    await submit(wrapper);
    expect(message(wrapper)).toBe('Enter a valid phone number for Iceland.');
    expect(wrapper.emitted('submit')).toBeUndefined();

    await type(wrapper, '5812345');
    await submit(wrapper);
    expect(wrapper.emitted('submit')![0]![0]).toEqual({ phone: '+3545812345' });
  });

  it('passes an empty field: required is another rule', async () => {
    const wrapper = mountForm();
    await blur(wrapper);
    expect(message(wrapper)).toBeUndefined();
    await submit(wrapper);
    expect(wrapper.emitted('submit')).toHaveLength(1);
  });

  it('checks against the country the field is on after a + picked another', async () => {
    const wrapper = mountForm();
    await type(wrapper, '+45 32 12 34 56');
    await blur(wrapper);
    expect(message(wrapper)).toBeUndefined();
    await type(wrapper, '321');
    await blur(wrapper);
    expect(message(wrapper)).toBe('Enter a valid phone number for Denmark.');
  });

  it('refuses a number of a country the field is not allowed to switch to', async () => {
    const wrapper = mountForm({ countries: ['IS', 'DK'] });
    await type(wrapper, '+447400123456');
    await blur(wrapper);
    expect(message(wrapper)).toBe('Enter a valid phone number for Iceland.');
  });

  it('names the country in the provided locale, with the provided messages', async () => {
    const Host = defineComponent({
      setup() {
        provideEldraUiLocale('is-IS');
        provideEldraUiMessages(isIS);
        return () =>
          h(
            Form,
            { ariaLabel: 'Tengiliður' },
            {
              default: ({ errors }: { errors: Record<string, string | undefined> }) =>
                h(FieldWrapper, { label: 'Símanúmer', error: errors.phone }, () =>
                  h(FieldPhoneInput, { name: 'phone', defaultCountry: 'DK' })
                ),
            }
          );
      },
    });
    const wrapper = mountWith(Host) as Mounted;
    await type(wrapper, '321');
    await blur(wrapper);
    expect(message(wrapper)).toBe('Símanúmerið er ekki gilt í landinu sem er valið: Danmörk.');
  });

  it('`rules` replaces the built-in check', async () => {
    const wrapper = mountForm({
      // Stricter than the built-in check would be in one way, looser in another.
      rules: (value: unknown) => (value ? true : 'Enter your phone number.'),
    });
    await blur(wrapper);
    expect(message(wrapper)).toBe('Enter your phone number.');
    await type(wrapper, '58');
    await blur(wrapper);
    expect(message(wrapper)).toBeUndefined();
  });

  it('`validateOnValueUpdate` follows every change once the field has been left', async () => {
    const wrapper = mountForm({ validateOnValueUpdate: true });
    await type(wrapper, '58123');
    await blur(wrapper);
    expect(message(wrapper)).toBe('Enter a valid phone number for Iceland.');
    await type(wrapper, '5812345');
    expect(message(wrapper)).toBeUndefined();
  });

  it('starts on the form’s initial value', async () => {
    const wrapper = mountForm({}, { initialValues: { phone: '+4532123456' } });
    await nextTick();
    expect(control(wrapper).value).toBe('32 12 34 56');
  });

  it('passes the control’s own props and listeners through', async () => {
    const countries: string[] = [];
    const wrapper = mountForm({
      size: 'lg',
      placeholder: 'Your number',
      'onUpdate:country': (country: string) => countries.push(country),
    });
    expect(control(wrapper).placeholder).toBe('Your number');
    expect(wrapper.element.querySelector('[data-part="field"]')!.className).toContain(
      'eldra:control-h-lg'
    );
    await type(wrapper, '+45');
    expect(countries).toEqual(['DK']);
  });
});
