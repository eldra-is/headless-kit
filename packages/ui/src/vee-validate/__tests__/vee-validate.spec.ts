import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, type VNode } from 'vue';
import Button from '../../components/button/Button.vue';
import FieldWrapper from '../../components/field-wrapper/FieldWrapper.vue';
import { MESSAGES_KEY } from '../../composables/useMessages';
import { isIS } from '../../messages/is-IS';
import { axe } from '../../test/axe';
import { mountWith } from '../../test/mount';
import FieldCheckbox from '../FieldCheckbox.vue';
import FieldCheckboxGroup from '../FieldCheckboxGroup.vue';
import FieldInput from '../FieldInput.vue';
import FieldMultiSelect from '../FieldMultiSelect.vue';
import FieldNumberInput from '../FieldNumberInput.vue';
import FieldQuantityStepper from '../FieldQuantityStepper.vue';
import FieldRadioGroup from '../FieldRadioGroup.vue';
import FieldSearchBar from '../FieldSearchBar.vue';
import FieldSelect from '../FieldSelect.vue';
import FieldSwitch from '../FieldSwitch.vue';
import FieldTextarea from '../FieldTextarea.vue';
import FieldVariantPicker from '../FieldVariantPicker.vue';
import Form from '../Form.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * vee-validate debounces **schema**-level validation by 5ms (`debounceAsync` in its own source), so
 * a `flushPromises()` alone can read the state from before it ran. Anything driving a form-level
 * `validationSchema` — or a `Select` panel, whose opening sequence is its own chain of ticks —
 * waits on real time rather than on microtasks.
 */
async function settle(): Promise<void> {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await flushPromises();
}

/** A rule function, which is all `rules` needs — no `defineRule` set-up and no rule-string parser. */
function filled(message: string) {
  return (value: unknown) =>
    (typeof value === 'string' ? value.trim() !== '' : Boolean(value)) || message;
}

function looksLikeEmail(message: string) {
  return (value: unknown) => (typeof value === 'string' && value.includes('@')) || message;
}

const COUNTRIES = [
  { value: 'is', label: 'Iceland' },
  { value: 'gb', label: 'United Kingdom' },
];

/** Mounts a `Form` around whatever the caller renders, with a submit button in the actions row. */
function mountForm(
  fields: () => VNode | VNode[],
  props: Record<string, unknown> = {},
  options: Record<string, unknown> = {}
) {
  return mountWith(Form, {
    props: { ariaLabel: 'Test form', ...props },
    slots: {
      default: fields,
      actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Send'),
    },
    ...options,
  });
}

describe('FieldInput inside a Form', () => {
  it('shows the rule error only once the field has been left, and clears it on a valid value', async () => {
    const wrapper = mountForm(() =>
      h(FieldInput, {
        name: 'email',
        rules: looksLikeEmail('Enter an email like name@example.com.'),
      })
    );
    const input = wrapper.find('input');

    // The field already knows it is invalid — vee-validate revalidates on every keystroke — but
    // nothing says so on screen while the customer is still typing.
    await input.setValue('maren');
    await flushPromises();
    expect(input.attributes('aria-invalid')).toBeUndefined();

    await input.trigger('blur');
    await flushPromises();
    expect(input.attributes('aria-invalid')).toBe('true');

    await input.setValue('maren@example.com');
    await flushPromises();
    expect(input.attributes('aria-invalid')).toBeUndefined();

    wrapper.unmount();
  });

  it('forwards every other prop and attribute to the Input it wraps', () => {
    const wrapper = mountForm(() =>
      h(FieldInput, {
        name: 'email',
        type: 'email',
        size: 'lg',
        autocomplete: 'email',
        placeholder: 'you@example.com',
        'data-testid': 'email',
      })
    );
    const input = wrapper.find('input');
    expect(input.attributes('type')).toBe('email');
    expect(input.attributes('name')).toBe('email');
    expect(input.attributes('autocomplete')).toBe('email');
    expect(input.attributes('placeholder')).toBe('you@example.com');
    expect(input.attributes('data-testid')).toBe('email');
    expect(wrapper.find('[data-part="leadingIcon"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the field-only props off the control', () => {
    const wrapper = mountForm(() =>
      h(FieldInput, { name: 'email', label: 'Email address', rules: filled('Required') })
    );
    const input = wrapper.find('input');
    expect(input.attributes('label')).toBeUndefined();
    expect(input.attributes('rules')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('the ./vee-validate entry surface', () => {
  it('re-exports FIELD_ONLY beside useFieldControl', async () => {
    const entry = await import('../index');
    const { FIELD_ONLY } = await import('../useFieldControl');
    // A consumer wrapping their own control needs both halves: the composable, and the list of
    // props their wrapper must keep rather than forward. Without it they rediscover it by reading
    // this package's source.
    expect(entry.FIELD_ONLY).toBe(FIELD_ONLY);
    expect([...entry.FIELD_ONLY]).toEqual(['path', 'rules', 'label', 'id']);
    expect(typeof entry.useFieldControl).toBe('function');
  });
});

describe('what a Field forwards', () => {
  it('reaches the inner component with a classes override and a slot', () => {
    const wrapper = mountForm(() =>
      h(
        FieldInput,
        { name: 'email', classes: { control: 'bg-surface', root: 'w-64' } },
        { suffix: () => h('span', { 'data-testid': 'suffix' }, '.is') }
      )
    );
    // `classes` is merged by the component itself, per part — not appended to the wrapper.
    expect(wrapper.find('[data-part="control"]').classes()).toContain('bg-surface');
    // Scoped: the form itself is also a `data-part="root"`, and it is the outer one.
    expect(wrapper.find('[data-part="fields"] [data-part="root"]').classes()).toContain('w-64');
    expect(wrapper.find('[data-testid="suffix"]').text()).toBe('.is');
    wrapper.unmount();
  });

  it('reaches a second wrapper the same way, scoped slot props included', async () => {
    const wrapper = mountForm(() =>
      h(
        FieldSelect,
        { name: 'country', options: COUNTRIES, classes: { trigger: 'rounded-none' } },
        {
          option: ({ option, selected }: { option: { label: string }; selected: boolean }) =>
            h('span', { 'data-testid': 'own-option' }, `${option.label}:${String(selected)}`),
        }
      )
    );
    expect(wrapper.find('[data-part="trigger"]').classes()).toContain('rounded-none');

    const trigger = wrapper.find('[data-part="trigger"]');
    await trigger.trigger('pointerdown');
    await trigger.trigger('click');
    await settle();

    const own = wrapper.findAll('[data-testid="own-option"]');
    expect(own).toHaveLength(2);
    expect(own[0]?.text()).toBe('Iceland:false');
    wrapper.unmount();
  });

  it('keeps `path` off the control and validates under it instead of `name`', async () => {
    const wrapper = mountForm(
      () =>
        h(FieldVariantPicker, {
          name: 'Size',
          path: 'size',
          options: [
            { value: 'small', label: 'Small', available: true },
            { value: 'large', label: 'Large', available: true },
          ],
        }),
      { validationSchema: { size: filled('Choose a size.') } }
    );
    await settle();

    // `name` is the *visible* legend and the radios' shared native name…
    expect(wrapper.find('legend').text()).toContain('Size');
    expect(wrapper.find('input[type="radio"]').attributes('name')).toBe('Size');
    expect(wrapper.find('fieldset').attributes('path')).toBeUndefined();

    // …and `path` is where the value lives, which is what the schema and `values` are keyed by.
    await wrapper.find('form').trigger('submit');
    await settle();
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({ size: 'small' });
    wrapper.unmount();
  });

  it('attaches a server error to a field by its path, not its name', async () => {
    // A `VariantPicker` has neither an `invalid` nor an `error` prop, so the wrapper is the only
    // place its message can appear — which is also the pattern being asserted.
    const wrapper = mountWith(Form, {
      props: { ariaLabel: 'Test form', apiErrors: { size: 'That size is out of stock.' } },
      slots: {
        default: (slotProps: { errors: Record<string, string> }) =>
          h(
            FieldWrapper,
            { group: true, label: 'Size', error: slotProps.errors.size },
            {
              default: () =>
                h(FieldVariantPicker, {
                  name: 'Size',
                  path: 'size',
                  options: [{ value: 'small', label: 'Small', available: true }],
                }),
            }
          ),
        actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Send'),
      },
    });
    await settle();
    expect(wrapper.find('[data-part="error"]').text()).toContain('That size is out of stock.');
    wrapper.unmount();
  });
});

describe('Form submit', () => {
  it('emits submit with the values only when every field is valid', async () => {
    const wrapper = mountForm(() => [
      h(FieldInput, { name: 'name', rules: filled('Enter your name.') }),
      h(FieldInput, { name: 'email', rules: looksLikeEmail('Enter an email.') }),
    ]);

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.emitted('invalid')).toHaveLength(1);

    const inputs = wrapper.findAll('input');
    await inputs[0]?.setValue('Maren');
    await inputs[1]?.setValue('maren@example.com');
    await flushPromises();

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    const submitted = wrapper.emitted('submit');
    expect(submitted).toHaveLength(1);
    expect(submitted?.[0]?.[0]).toEqual({ name: 'Maren', email: 'maren@example.com' });

    wrapper.unmount();
  });

  it('never posts the form: the submit event is prevented even when the values are valid', async () => {
    const wrapper = mountForm(() => h(FieldInput, { name: 'name' }), { action: '/subscribe' });
    const event = new Event('submit', { bubbles: true, cancelable: true });
    wrapper.find('form').element.dispatchEvent(event);
    await flushPromises();
    expect(event.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it('starts from initialValues', async () => {
    const wrapper = mountForm(() => h(FieldInput, { name: 'name' }), {
      initialValues: { name: 'Maren' },
    });
    expect(wrapper.find('input').element.value).toBe('Maren');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({ name: 'Maren' });
    wrapper.unmount();
  });

  it('validates through a form-level validationSchema, with no per-field rules', async () => {
    const wrapper = mountForm(() => h(FieldInput, { name: 'name' }), {
      validationSchema: { name: filled('Enter your name.') },
    });
    await wrapper.find('form').trigger('submit');
    await settle();
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true');
    wrapper.unmount();
  });

  it('passes submitting down, so the primary button goes busy', async () => {
    const wrapper = mountForm(() => h(FieldInput, { name: 'name' }), { submitting: true });
    expect(wrapper.find('button[type="submit"]').attributes('aria-busy')).toBe('true');
    wrapper.unmount();
  });

  it('runs validation even when the layout refuses the submit because a field is already invalid', async () => {
    const wrapper = mountForm(() => [
      h(FieldInput, { name: 'name', rules: filled('Enter your name.') }),
      h(FieldInput, { name: 'email', rules: looksLikeEmail('Enter an email.') }),
    ]);
    const inputs = wrapper.findAll('input');

    // The first field is invalid *and* touched, so `FormLayout` stops the native submit itself and
    // emits `invalid` instead of `submit`. The form must still validate the untouched second field.
    await inputs[0]?.setValue(' ');
    await inputs[0]?.trigger('blur');
    await flushPromises();
    expect(inputs[0]?.attributes('aria-invalid')).toBe('true');

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(inputs[1]?.attributes('aria-invalid')).toBe('true');
    expect(wrapper.find('[data-part="errorSummary"]').exists()).toBe(true);

    wrapper.unmount();
  });
});

describe('Form error summary', () => {
  it('draws the summary only after a submit, listing a link to each failed field', async () => {
    const wrapper = mountForm(() => [
      h(
        FieldWrapper,
        { label: 'Name' },
        { default: () => h(FieldInput, { name: 'name', rules: filled('Enter your name.') }) }
      ),
      h(
        FieldWrapper,
        { label: 'Email address' },
        {
          default: () => h(FieldInput, { name: 'email', rules: looksLikeEmail('Enter an email.') }),
        }
      ),
    ]);

    expect(wrapper.find('[data-part="errorSummary"]').exists()).toBe(false);

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const summary = wrapper.find('[data-part="errorSummary"]');
    expect(summary.exists()).toBe(true);
    expect(summary.attributes('role')).toBe('alert');
    expect(summary.text()).toContain('There are 2 problems with this form');

    const links = summary.findAll('a');
    expect(links).toHaveLength(2);
    expect(links[0]?.text()).toBe('Enter your name.');

    // Every link points at a control that is really in the document — the id the FieldWrapper
    // generated and tied its own `<label for>` to.
    for (const link of links) {
      const id = link.attributes('href')?.slice(1);
      expect(id).toBeDefined();
      expect(document.getElementById(id ?? '')).not.toBeNull();
    }

    wrapper.unmount();
  });

  it('moves focus to the first invalid field on a failed submit', async () => {
    const wrapper = mountForm(() => [
      h(FieldInput, { name: 'name', rules: filled('Enter your name.') }),
      h(FieldInput, { name: 'email', rules: looksLikeEmail('Enter an email.') }),
    ]);

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.findAll('input')[0]?.element);

    wrapper.unmount();
  });

  it('moves focus once, not twice, on a submit the layout refuses', async () => {
    const wrapper = mountForm(() => [
      h(FieldInput, { name: 'name', rules: filled('Enter your name.') }),
      h(FieldInput, { name: 'email', rules: looksLikeEmail('Enter an email.') }),
    ]);
    const inputs = wrapper.findAll('input');

    // Make the first field invalid *and* touched, so `FormLayout` refuses the submit itself —
    // the one path where both it and the `Form` would otherwise reach for focus.
    await inputs[0]?.setValue(' ');
    await inputs[0]?.trigger('blur');
    await flushPromises();

    const first = inputs[0]?.element as HTMLInputElement;
    const focus = vi.spyOn(first, 'focus');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(focus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(first);
    focus.mockRestore();
    wrapper.unmount();
  });

  it('lets the errorSummary slot replace the list while the form still draws the alert', async () => {
    const wrapper = mountWith(Form, {
      props: { ariaLabel: 'Test form' },
      slots: {
        default: () => h(FieldInput, { name: 'name', rules: filled('Enter your name.') }),
        errorSummary: (slotProps: { errors: Record<string, string> }) =>
          h('p', { 'data-testid': 'own-summary' }, Object.keys(slotProps.errors).join(',')),
      },
    });

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[data-testid="own-summary"]').text()).toBe('name');
    expect(wrapper.find('[data-part="errorSummary"]').exists()).toBe(true);

    wrapper.unmount();
  });
});

describe('FieldWrapper integration', () => {
  it("lets the wrapper show the message, from the form's errors slot prop", async () => {
    const wrapper = mountWith(Form, {
      props: { ariaLabel: 'Test form' },
      slots: {
        default: (slotProps: { errors: Record<string, string> }) =>
          h(
            FieldWrapper,
            { label: 'Name', required: true, error: slotProps.errors.name },
            { default: () => h(FieldInput, { name: 'name', rules: filled('Enter your name.') }) }
          ),
        actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Send'),
      },
    });

    const input = wrapper.find('input');
    expect(wrapper.find('[data-part="error"]').exists()).toBe(false);

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const error = wrapper.find('[data-part="error"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toContain('Enter your name.');
    // The wrapper's own wiring still holds: the control is described by the error it just grew.
    expect(input.attributes('aria-describedby')).toBe(error.attributes('id'));
    expect(input.attributes('aria-invalid')).toBe('true');
    // The wrapper's `<label for>` still names the control, which is what the summary links to.
    expect(wrapper.find('label').attributes('for')).toBe(input.attributes('id'));

    await input.setValue('Maren');
    await flushPromises();
    expect(wrapper.find('[data-part="error"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('leaves a group control to the wrapper rather than drawing the message twice', async () => {
    const wrapper = mountWith(Form, {
      props: { ariaLabel: 'Test form' },
      slots: {
        default: (slotProps: { errors: Record<string, string> }) =>
          h(
            FieldWrapper,
            { label: 'Delivery', group: true, error: slotProps.errors.delivery },
            {
              default: () =>
                h(FieldRadioGroup, {
                  name: 'delivery',
                  legend: 'Delivery',
                  rules: filled('Choose a delivery option.'),
                  options: [
                    { value: 'standard', label: 'Standard' },
                    { value: 'express', label: 'Express' },
                  ],
                }),
            }
          ),
        actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Send'),
      },
    });

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.findAll('[data-part="error"]')).toHaveLength(1);
    wrapper.unmount();
  });

  it("points the summary at the group's fieldset, which can take focus for it", async () => {
    const wrapper = mountWith(Form, {
      props: { ariaLabel: 'Test form' },
      slots: {
        default: (slotProps: { errors: Record<string, string> }) =>
          h(
            FieldWrapper,
            { label: 'Delivery', group: true, error: slotProps.errors.delivery },
            {
              default: () =>
                h(FieldRadioGroup, {
                  name: 'delivery',
                  legend: 'Delivery',
                  rules: filled('Choose a delivery option.'),
                  options: [{ value: 'standard', label: 'Standard' }],
                }),
            }
          ),
        actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Send'),
      },
    });

    await wrapper.find('form').trigger('submit');
    await settle();

    const link = wrapper.find('[data-part="errorSummary"] a');
    const target = document.getElementById(link.attributes('href')?.slice(1) ?? '');
    expect(target?.tagName).toBe('FIELDSET');
    // A browser moves focus to a fragment's target only when that target can take focus, so the
    // link would otherwise scroll and leave focus behind.
    expect(target?.getAttribute('tabindex')).toBe('-1');
    wrapper.unmount();
  });

  it('draws its own error row when the same group stands outside a wrapper', async () => {
    const wrapper = mountForm(() =>
      h(FieldRadioGroup, {
        name: 'delivery',
        legend: 'Delivery',
        rules: filled('Choose a delivery option.'),
        options: [{ value: 'standard', label: 'Standard' }],
      })
    );
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[data-part="error"]').text()).toContain('Choose a delivery option.');
    wrapper.unmount();
  });
});

describe('every Field binds its control', () => {
  it('FieldSelect binds modelValue and posts through the hidden native select', async () => {
    const wrapper = mountForm(() =>
      h(FieldSelect, { name: 'country', options: COUNTRIES, placeholder: 'Select' })
    );

    const native = wrapper.find('select');
    expect(native.attributes('name')).toBe('country');
    expect(native.element.value).toBe('');

    const trigger = wrapper.find('[data-part="trigger"]');
    await trigger.trigger('pointerdown');
    await trigger.trigger('click');
    await settle();
    await wrapper.findAll('[data-part="option"]')[0]?.trigger('click');
    await settle();

    expect(wrapper.find('[data-part="value"]').text()).toBe('Iceland');
    expect(native.element.value).toBe('is');

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({ country: 'is' });

    wrapper.unmount();
  });

  it('FieldCheckbox binds a boolean', async () => {
    const wrapper = mountForm(() =>
      h(FieldCheckbox, { name: 'terms', rules: filled('Accept the terms.') }, () => 'I agree')
    );
    const box = wrapper.find('input[type="checkbox"]');
    expect(box.attributes('name')).toBe('terms');

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.emitted('submit')).toBeUndefined();

    await box.setValue(true);
    await flushPromises();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({ terms: true });

    wrapper.unmount();
  });

  it('FieldCheckboxGroup binds an array', async () => {
    const wrapper = mountForm(() =>
      h(FieldCheckboxGroup, {
        name: 'materials',
        legend: 'Material',
        options: [
          { value: 'stoneware', label: 'Stoneware' },
          { value: 'porcelain', label: 'Porcelain' },
        ],
      })
    );
    const boxes = wrapper.findAll('input[type="checkbox"]');
    await boxes[1]?.setValue(true);
    await flushPromises();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({ materials: ['porcelain'] });
    wrapper.unmount();
  });
});

describe('every Field is bound, and the eleven agree', () => {
  /**
   * One submit per component, asserting the value the form ends up holding. A `Field*` that failed
   * to bind its control — a missed `v-model`, a `modelValue` left in the forwarded props — submits
   * `undefined` here rather than the value on screen.
   */
  it('submits what each control is showing', async () => {
    const wrapper = mountForm(() => [
      h(FieldInput, { name: 'input' }),
      h(FieldTextarea, { name: 'textarea' }),
      h(FieldCheckbox, { name: 'checkbox' }, () => 'Yes'),
      h(FieldCheckboxGroup, {
        name: 'checkboxGroup',
        legend: 'Material',
        options: [{ value: 'stoneware', label: 'Stoneware' }],
      }),
      h(FieldRadioGroup, {
        name: 'radioGroup',
        legend: 'Delivery',
        options: [{ value: 'standard', label: 'Standard' }],
      }),
      h(FieldSwitch, { name: 'switch' }, () => 'Gift wrap'),
      h(FieldSelect, { name: 'select', options: COUNTRIES }),
      h(FieldMultiSelect, { name: 'multiSelect', options: COUNTRIES }),
      h(FieldQuantityStepper, { name: 'quantity', min: 2 }),
      // `name` is the visible option name; `path` is the key in `values` (see `FieldBinding`).
      h(FieldVariantPicker, {
        name: 'Size',
        path: 'variant',
        options: [
          { value: 'small', label: 'Small', available: false },
          { value: 'large', label: 'Large', available: true },
        ],
      }),
      h(FieldSearchBar, { name: 'query', label: 'Search the shop' }),
    ]);
    await settle();

    await wrapper.find('textarea').setValue('Hello');
    await wrapper.find('input[type="checkbox"][name="checkbox"]').setValue(true);
    await wrapper.find('[data-part="track"]').trigger('click');
    await wrapper.find('[data-part="increase"]').trigger('click');
    await settle();

    await wrapper.find('form').trigger('submit');
    await settle();

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      textarea: 'Hello',
      checkbox: true,
      switch: true,
      quantity: 3,
      // The picker's own default is the first *available* option, and the field starts there too.
      variant: 'large',
    });

    wrapper.unmount();
  });

  it('starts a QuantityStepper at the quantity it is showing, not at undefined', async () => {
    const wrapper = mountForm(() => h(FieldQuantityStepper, { name: 'quantity', min: 2 }));
    await settle();
    expect(wrapper.find('input').element.value).toBe('2');
    await wrapper.find('form').trigger('submit');
    await settle();
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({ quantity: 2 });
    wrapper.unmount();
  });
});

describe('apiErrors', () => {
  it('attaches a server error to the named field and drops it when that field changes', async () => {
    const wrapper = mountWith(Form, {
      props: { ariaLabel: 'Test form' },
      slots: {
        default: (slotProps: { errors: Record<string, string> }) =>
          h(
            FieldWrapper,
            { label: 'Email address', error: slotProps.errors.email },
            { default: () => h(FieldInput, { name: 'email' }) }
          ),
        actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Send'),
      },
    });

    // The prop is what the server's response feeds.
    await wrapper.setProps({ apiErrors: { email: 'That address is already subscribed.' } });
    await flushPromises();

    const input = wrapper.find('input');
    expect(input.attributes('aria-invalid')).toBe('true');
    expect(wrapper.find('[data-part="error"]').text()).toContain(
      'That address is already subscribed.'
    );

    // Editing the value makes the server's statement about it stale, so it goes.
    await input.setValue('someone@example.com');
    await flushPromises();
    expect(wrapper.find('[data-part="error"]').exists()).toBe(false);
    expect(input.attributes('aria-invalid')).toBeUndefined();

    wrapper.unmount();
  });

  it('does not block a resubmit once the server error is gone', async () => {
    const wrapper = mountForm(() => h(FieldInput, { name: 'email' }), {
      apiErrors: { email: 'Already subscribed.' },
    });
    await flushPromises();
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true');

    await wrapper.find('input').setValue('other@example.com');
    await flushPromises();
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({ email: 'other@example.com' });
    wrapper.unmount();
  });
});

describe('how long a server error survives a change elsewhere', () => {
  /** Two fields, each with a server error; the second one's fate after the first is edited. */
  function mountTwo(props: Record<string, unknown>) {
    return mountWith(Form, {
      props: { ariaLabel: 'Test form', ...props },
      slots: {
        default: (slotProps: { errors: Record<string, string> }) => [
          h(
            FieldWrapper,
            { label: 'First name', error: slotProps.errors.first },
            { default: () => h(FieldInput, { name: 'first' }) }
          ),
          h(
            FieldWrapper,
            { label: 'Postcode', error: slotProps.errors.postcode },
            { default: () => h(FieldInput, { name: 'postcode' }) }
          ),
        ],
        actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Send'),
      },
    });
  }

  const SERVER_ERRORS = { first: 'Unknown name.', postcode: 'We do not deliver there yet.' };

  it('survives a change to another field when the rules are per-field (or absent)', async () => {
    const wrapper = mountTwo({ apiErrors: SERVER_ERRORS });
    await settle();
    expect(wrapper.findAll('[data-part="error"]')).toHaveLength(2);

    await wrapper.findAll('input')[0]?.setValue('Maren');
    await settle();

    // The edited field's message is gone, because the value it described has changed. The other
    // one has not been revalidated, so the server still has the last word on it.
    const errors = wrapper.findAll('[data-part="error"]');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.text()).toContain('We do not deliver there yet.');
    wrapper.unmount();
  });

  it("is cleared by vee-validate's post-submit revalidation when the Form carries a schema", async () => {
    const wrapper = mountTwo({ validationSchema: { first: () => true, postcode: () => true } });

    await wrapper.find('form').trigger('submit');
    await settle();
    expect(wrapper.emitted('submit')).toHaveLength(1);

    await wrapper.setProps({ apiErrors: SERVER_ERRORS });
    await settle();
    expect(wrapper.findAll('[data-part="error"]')).toHaveLength(2);

    await wrapper.findAll('input')[0]?.setValue('Maren');
    await settle();

    // Deliberate, and vee-validate's own behaviour rather than a choice made here: after a submit
    // every already-validated field is revalidated on each change (`validated-only`), and a field
    // that now passes has its manually set error replaced by that pass. So re-send `apiErrors`
    // with each response rather than treating one as sticky.
    expect(wrapper.findAll('[data-part="error"]')).toHaveLength(0);
    wrapper.unmount();
  });
});

describe('Form success announcement', () => {
  it('announces successMessage in the polite status region after a valid submit', async () => {
    const wrapper = mountForm(() => h(FieldInput, { name: 'email' }), {
      successMessage: "Thanks, you're subscribed.",
    });
    const status = wrapper.find('[data-part="status"]');
    expect(status.attributes('aria-live')).toBe('polite');
    expect(status.text()).toBe('');

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(status.text()).toBe("Thanks, you're subscribed.");

    wrapper.unmount();
  });

  it('lets an explicit statusMessage win over it', async () => {
    const wrapper = mountForm(() => h(FieldInput, { name: 'email' }), {
      successMessage: "Thanks, you're subscribed.",
      statusMessage: 'Sending…',
    });
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[data-part="status"]').text()).toBe('Sending…');
    wrapper.unmount();
  });
});

describe('messages', () => {
  it('reads the summary line from the provided catalogue (is-IS)', async () => {
    const wrapper = mountForm(
      () => h(FieldInput, { name: 'name', rules: filled('Sláðu inn nafnið þitt.') }),
      {},
      { global: { provide: { [MESSAGES_KEY as symbol]: isIS } } }
    );
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[data-part="errorSummary"]').text()).toContain(
      'Það er 1 villa í þessu eyðublaði'
    );
    wrapper.unmount();
  });

  it('counts in both locales the way each language does', () => {
    expect(isIS.formErrors(1)).toBe('Það er 1 villa í þessu eyðublaði');
    expect(isIS.formErrors(11)).toBe('Það eru 11 villur í þessu eyðublaði');
    expect(isIS.formErrors(21)).toBe('Það er 21 villa í þessu eyðublaði');
  });
});

describe('accessibility', () => {
  it('has no axe violations before or after a failed submit', async () => {
    const wrapper = mountWith(Form, {
      props: { heading: 'Ask the studio' },
      slots: {
        default: (slotProps: { errors: Record<string, string> }) => [
          h(
            FieldWrapper,
            { label: 'Name', required: true, error: slotProps.errors.name },
            { default: () => h(FieldInput, { name: 'name', rules: filled('Enter your name.') }) }
          ),
          h(
            FieldWrapper,
            { label: 'Email address', required: true, error: slotProps.errors.email },
            {
              default: () =>
                h(FieldInput, { name: 'email', rules: looksLikeEmail('Enter an email.') }),
            }
          ),
        ],
        actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Send message'),
      },
    });

    expect(await axe(wrapper.element)).toHaveNoViolations();

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(await axe(wrapper.element)).toHaveNoViolations();

    wrapper.unmount();
  });
});

describe('a Field on its own', () => {
  it('works with no Form above it: no injection, no warning, still validated', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const wrapper = mountWith(FieldInput, {
      props: { name: 'query', rules: filled('Type something.') },
    });
    const input = wrapper.find('input');
    await input.setValue(' ');
    await input.trigger('blur');
    await flushPromises();
    expect(input.attributes('aria-invalid')).toBe('true');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    wrapper.unmount();
  });
});

describe('FieldNumberInput inside a Form', () => {
  it('binds a number, not the locale string the customer read', async () => {
    // The whole reason the control exists: a field showing "1.234,56" under `is-IS` has to put
    // `1234.56` in the form's values, or every rule and every server after it reads 1.234.
    const tooCheap = (value: unknown) =>
      (typeof value === 'number' && value >= 10) || 'Enter at least 10.';

    const wrapper = mountForm(() =>
      h(FieldNumberInput, {
        name: 'price',
        rules: tooCheap,
        locale: 'is-IS',
        format: 'currency',
        currency: 'ISK',
        label: 'Price',
      })
    );
    const control = wrapper.find('[data-part="control"]');

    await control.trigger('focus');
    (control.element as HTMLInputElement).value = '1234,56';
    await control.trigger('input');
    await control.trigger('blur');
    await settle();

    // ISK has no minor unit, so the commit rounds to a whole króna — and the hidden input that a
    // scripting-free post would carry holds that same raw number.
    expect(control.attributes('aria-invalid')).toBeUndefined();
    expect((wrapper.find('input[type="hidden"]').element as HTMLInputElement).value).toBe('1235');

    await wrapper.find('form').trigger('submit');
    await settle();
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ price: 1235 });
    wrapper.unmount();
  });

  it('shows a rule message once the field has been left', async () => {
    const wrapper = mountForm(() =>
      h(FieldNumberInput, {
        name: 'price',
        rules: (value: unknown) =>
          (typeof value === 'number' && value >= 10) || 'Enter at least 10.',
      })
    );
    const control = wrapper.find('[data-part="control"]');

    await control.trigger('focus');
    (control.element as HTMLInputElement).value = '2';
    await control.trigger('input');
    await settle();
    // Still typing: the field knows it is invalid and says nothing yet.
    expect(control.attributes('aria-invalid')).toBeUndefined();

    await control.trigger('blur');
    await settle();
    expect(control.attributes('aria-invalid')).toBe('true');
    // The *message* is not this control's to draw — like `Input`, it has no error row of its own;
    // a `FieldWrapper` bound to the `Form`'s `errors` slot shows it. What is asserted here is the
    // gate: nothing is announced until the customer has left the field.
    wrapper.unmount();
  });
});
