import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { useForm } from 'vee-validate';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, type Component, type VNode } from 'vue';
import Button from '../../components/button/Button.vue';
import { mountWith } from '../../test/mount';
import * as entry from '../index';
import FieldCheckbox from '../FieldCheckbox.vue';
import FieldInput from '../FieldInput.vue';
import FieldSelect from '../FieldSelect.vue';
import Form from '../Form.vue';
import {
  FIELD_CHOICE_VALIDATION_DEFAULTS,
  FIELD_VALIDATION_DEFAULTS,
  FIELD_VALIDATION_PROPS,
} from '../useFieldControl';

/**
 * When a `Field*` validates and when its message changes: the three props (`validateOnMount`,
 * `validateOnBlur`, `validateOnValueUpdate`), their defaults per control, and the rule the typed
 * default exists for — typing never changes what the customer sees. Every case runs for three controls and in both
 * setups the entry supports: rules on the field, and a `validationSchema` on the `Form`.
 */

afterEach(() => {
  document.body.innerHTML = '';
});

/** Schema validation is debounced by vee-validate and a `Select` panel opens over several ticks. */
async function settle(): Promise<void> {
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await flushPromises();
}

type Mounted = VueWrapper<any>;

interface Kind {
  title: string;
  /** The field under test, called `subject`, with whatever extra props the case passes. */
  field: (props: Record<string, unknown>) => VNode;
  /** `true`, or the message. */
  rule: (value: unknown) => true | string;
  /** Change the value to one the rule refuses, the way a customer would. */
  makeInvalid: (wrapper: Mounted) => Promise<void>;
  /** Change the value to one the rule accepts. */
  makeValid: (wrapper: Mounted) => Promise<void>;
  /** The element that takes focus, and so the one that is left. */
  control: (wrapper: Mounted) => ReturnType<Mounted['find']>;
  /** Whether this control validates on each change by default (a choice, not a typed value). */
  live: boolean;
}

const MESSAGE = 'That is not right.';

const COUNTRIES = [
  { value: 'is', label: 'Iceland' },
  { value: 'gb', label: 'United Kingdom' },
];

async function choose(wrapper: Mounted, index: number): Promise<void> {
  const trigger = wrapper.find('[data-part="trigger"]');
  await trigger.trigger('pointerdown');
  await trigger.trigger('click');
  await settle();
  await wrapper.findAll('[data-part="option"]')[index]?.trigger('click');
  await settle();
}

const KINDS: Kind[] = [
  {
    title: 'FieldInput',
    field: (props) => h(FieldInput, { name: 'subject', ...props }),
    rule: (value) => (typeof value === 'string' && value.includes('@')) || MESSAGE,
    makeInvalid: async (wrapper) => {
      await wrapper.find('input[name="subject"]').setValue('maren');
      await settle();
    },
    makeValid: async (wrapper) => {
      await wrapper.find('input[name="subject"]').setValue('maren@example.com');
      await settle();
    },
    control: (wrapper) => wrapper.find('input[name="subject"]'),
    live: false,
  },
  {
    title: 'FieldCheckbox',
    // Starts ticked, so there is a valid value to move away from.
    field: (props) => h(FieldCheckbox, { name: 'subject', ...props }, () => 'I agree'),
    rule: (value) => value === true || MESSAGE,
    makeInvalid: async (wrapper) => {
      const box = wrapper.find('input[type="checkbox"]');
      await box.setValue(true);
      await box.setValue(false);
      await settle();
    },
    makeValid: async (wrapper) => {
      await wrapper.find('input[type="checkbox"]').setValue(true);
      await settle();
    },
    control: (wrapper) => wrapper.find('input[type="checkbox"]'),
    live: true,
  },
  {
    title: 'FieldSelect',
    field: (props) => h(FieldSelect, { name: 'subject', options: COUNTRIES, ...props }),
    rule: (value) => value === 'is' || MESSAGE,
    makeInvalid: (wrapper) => choose(wrapper, 1),
    makeValid: (wrapper) => choose(wrapper, 0),
    control: (wrapper) => wrapper.find('[data-part="trigger"]'),
    live: true,
  },
];

type Setup = 'rules on the field' | 'a schema on the Form';
const SETUPS: Setup[] = ['rules on the field', 'a schema on the Form'];

function mountKind(kind: Kind, setup: Setup, fieldProps: Record<string, unknown> = {}): Mounted {
  const onField = setup === 'rules on the field';
  return mountWith(Form, {
    props: {
      ariaLabel: 'Test form',
      ...(onField ? {} : { validationSchema: { subject: kind.rule } }),
    },
    slots: {
      default: () => kind.field({ ...fieldProps, ...(onField ? { rules: kind.rule } : {}) }),
      actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Send'),
    },
  });
}

/** Whether the field is showing its message: the control says so with `aria-invalid`. */
function shown(wrapper: Mounted): boolean {
  return wrapper.find('[data-part="fields"] [aria-invalid="true"]').exists();
}

async function blur(kind: Kind, wrapper: Mounted): Promise<void> {
  await kind.control(wrapper).trigger('blur');
  await settle();
}

async function submit(wrapper: Mounted): Promise<void> {
  await wrapper.find('form').trigger('submit');
  await settle();
}

describe.each(KINDS)('$title', (kind) => {
  describe.each(SETUPS)('with %s', (setup) => {
    it('validateOnValueUpdate: false — changing the value never changes what is shown; blur and submit do', async () => {
      const wrapper = mountKind(kind, setup, { validateOnValueUpdate: false });
      await settle();
      expect(shown(wrapper)).toBe(false);

      // No message appears while the value is being changed.
      await kind.makeInvalid(wrapper);
      expect(shown(wrapper)).toBe(false);

      await blur(kind, wrapper);
      expect(shown(wrapper)).toBe(true);

      // A message already showing stays while the value is being fixed…
      await kind.makeValid(wrapper);
      expect(shown(wrapper)).toBe(true);

      // …and goes at the next blur.
      await blur(kind, wrapper);
      expect(shown(wrapper)).toBe(false);

      // Breaking it again shows nothing until a submit (or a blur).
      await kind.makeInvalid(wrapper);
      expect(shown(wrapper)).toBe(false);

      await submit(wrapper);
      expect(shown(wrapper)).toBe(true);
      expect(wrapper.emitted('submit')).toBeUndefined();
      wrapper.unmount();
    });

    it('the default for this control', async () => {
      const wrapper = mountKind(kind, setup);
      await settle();

      await submit(wrapper);
      expect(shown(wrapper)).toBe(true);

      // A typed control holds its message while the fix is typed; a choice answers the click.
      await kind.makeValid(wrapper);
      expect(shown(wrapper)).toBe(!kind.live);

      await blur(kind, wrapper);
      expect(shown(wrapper)).toBe(false);

      // Breaking it again: a choice says so at once (it has been submitted), a typed one waits.
      await kind.makeInvalid(wrapper);
      expect(shown(wrapper)).toBe(kind.live);
      wrapper.unmount();
    });

    it('validateOnBlur: false, validateOnValueUpdate: false — only a submit validates', async () => {
      const wrapper = mountKind(kind, setup, {
        validateOnBlur: false,
        validateOnValueUpdate: false,
      });
      await settle();

      await kind.makeInvalid(wrapper);
      await blur(kind, wrapper);
      expect(shown(wrapper)).toBe(false);

      await submit(wrapper);
      expect(shown(wrapper)).toBe(true);

      // Fixed and left: still showing, because nothing has validated since the submit.
      await kind.makeValid(wrapper);
      await blur(kind, wrapper);
      expect(shown(wrapper)).toBe(true);

      await submit(wrapper);
      expect(shown(wrapper)).toBe(false);
      expect(wrapper.emitted('submit')).toHaveLength(1);
      wrapper.unmount();
    });

    it('validateOnValueUpdate: true — the message follows every change once the field is touched', async () => {
      const wrapper = mountKind(kind, setup, { validateOnValueUpdate: true });
      await settle();

      // Not before the field has been touched.
      await kind.makeInvalid(wrapper);
      expect(shown(wrapper)).toBe(false);

      await blur(kind, wrapper);
      expect(shown(wrapper)).toBe(true);

      await kind.makeValid(wrapper);
      expect(shown(wrapper)).toBe(false);

      await kind.makeInvalid(wrapper);
      expect(shown(wrapper)).toBe(true);
      wrapper.unmount();
    });

    it('validateOnValueUpdate: true — also follows every change after a submit, untouched', async () => {
      const wrapper = mountKind(kind, setup, {
        validateOnValueUpdate: true,
        validateOnBlur: false,
      });
      await settle();

      await submit(wrapper);
      expect(shown(wrapper)).toBe(true);

      await kind.makeValid(wrapper);
      expect(shown(wrapper)).toBe(false);
      wrapper.unmount();
    });

    it('validateOnMount: true — validated and shown at once, then on blur as usual', async () => {
      const wrapper = mountKind(kind, setup, {
        validateOnMount: true,
        validateOnValueUpdate: false,
      });
      await settle();
      expect(shown(wrapper)).toBe(true);

      await kind.makeValid(wrapper);
      expect(shown(wrapper)).toBe(true);

      await blur(kind, wrapper);
      expect(shown(wrapper)).toBe(false);
      wrapper.unmount();
    });

    it('validateOnMount: false (default) — nothing is shown on mount', async () => {
      const wrapper = mountKind(kind, setup);
      await settle();
      expect(shown(wrapper)).toBe(false);
      wrapper.unmount();
    });
  });
});

/** Two text fields, `first` and `second`, each refusing an empty value. */
function mountPair(setup: Setup, formProps: Record<string, unknown> = {}): Mounted {
  const required = (label: string) => (value: unknown) =>
    (typeof value === 'string' && value.trim() !== '') || `${label} is required.`;
  const onField = setup === 'rules on the field';
  return mountWith(Form, {
    props: {
      ariaLabel: 'Test form',
      ...(onField
        ? {}
        : { validationSchema: { first: required('First'), second: required('Second') } }),
      ...formProps,
    },
    slots: {
      default: () => [
        h(FieldInput, { name: 'first', ...(onField ? { rules: required('First') } : {}) }),
        h(FieldInput, { name: 'second', ...(onField ? { rules: required('Second') } : {}) }),
      ],
      actions: () => h(Button, { variant: 'primary', type: 'submit' }, () => 'Send'),
    },
  });
}

function marked(wrapper: Mounted, name: string): boolean {
  return wrapper.find(`input[name="${name}"]`).attributes('aria-invalid') === 'true';
}

function summaryMessages(wrapper: Mounted): string[] {
  return wrapper.findAll('[data-part="errorSummary"] li').map((item) => item.text());
}

describe.each(SETUPS)('two fields, with %s', (setup) => {
  it("another field's blur does not move this field's message", async () => {
    const wrapper = mountPair(setup);
    await submit(wrapper);
    expect(marked(wrapper, 'first')).toBe(true);
    expect(marked(wrapper, 'second')).toBe(true);

    // `first` is fixed but not left; then `second` is left. With a schema vee-validate
    // revalidates `first` underneath at that moment — its message must not move.
    await wrapper.find('input[name="first"]').setValue('Maren');
    await settle();
    await wrapper.find('input[name="second"]').trigger('blur');
    await settle();
    expect(marked(wrapper, 'first')).toBe(true);
    expect(marked(wrapper, 'second')).toBe(true);
    // And the summary still lists it: it never drops an entry the field is still showing.
    expect(summaryMessages(wrapper)).toEqual(['First is required.', 'Second is required.']);

    await wrapper.find('input[name="first"]').trigger('blur');
    await settle();
    expect(marked(wrapper, 'first')).toBe(false);
    expect(summaryMessages(wrapper)).toEqual(['Second is required.']);
    wrapper.unmount();
  });

  it('the summary lists exactly what the fields show, and changes when they change', async () => {
    const wrapper = mountPair(setup);
    await submit(wrapper);
    expect(summaryMessages(wrapper)).toEqual(['First is required.', 'Second is required.']);

    // Typing a fix: the field keeps its message, so the summary keeps its entry.
    await wrapper.find('input[name="first"]').setValue('Maren');
    await settle();
    expect(marked(wrapper, 'first')).toBe(true);
    expect(summaryMessages(wrapper)).toEqual(['First is required.', 'Second is required.']);

    // Leaving the field: both drop it together.
    await wrapper.find('input[name="first"]').trigger('blur');
    await settle();
    expect(marked(wrapper, 'first')).toBe(false);
    expect(summaryMessages(wrapper)).toEqual(['Second is required.']);

    // Emptying it again: neither shows it until the field is left.
    await wrapper.find('input[name="first"]').setValue('');
    await settle();
    expect(marked(wrapper, 'first')).toBe(false);
    expect(summaryMessages(wrapper)).toEqual(['Second is required.']);

    await wrapper.find('input[name="first"]').trigger('blur');
    await settle();
    expect(marked(wrapper, 'first')).toBe(true);
    expect(summaryMessages(wrapper).sort()).toEqual(['First is required.', 'Second is required.']);
    wrapper.unmount();
  });

  it('the errors slot prop says the same as the fields', async () => {
    let seen: Record<string, string> = {};
    const required = (value: unknown) =>
      (typeof value === 'string' && value.trim() !== '') || 'Required.';
    const onField = setup === 'rules on the field';
    const wrapper = mountWith(Form, {
      props: {
        ariaLabel: 'Test form',
        ...(onField ? {} : { validationSchema: { first: required } }),
      },
      slots: {
        default: (slotProps: { errors: Record<string, string> }) => {
          seen = slotProps.errors;
          return h(FieldInput, { name: 'first', ...(onField ? { rules: required } : {}) });
        },
      },
    });
    const input = wrapper.find('input');
    await input.trigger('blur');
    await settle();
    expect(seen).toEqual({ first: 'Required.' });

    await input.setValue('Maren');
    await settle();
    expect(seen).toEqual({ first: 'Required.' });

    await input.trigger('blur');
    await settle();
    expect(seen).toEqual({});
    wrapper.unmount();
  });

  it('a failed submit still moves focus to the first invalid field', async () => {
    const wrapper = mountPair(setup);
    await wrapper.find('input[name="first"]').setValue('Maren');
    await submit(wrapper);
    expect(document.activeElement).toBe(wrapper.find('input[name="second"]').element);
    wrapper.unmount();
  });

  it('a server error shows at once, and goes when its own field is edited', async () => {
    const wrapper = mountPair(setup, { apiErrors: { first: 'Unknown name.' } });
    await settle();
    expect(marked(wrapper, 'first')).toBe(true);
    expect(marked(wrapper, 'second')).toBe(false);

    await wrapper.find('input[name="first"]').setValue('Maren');
    await settle();
    expect(marked(wrapper, 'first')).toBe(false);
    wrapper.unmount();
  });

  it('a reset form shows nothing', async () => {
    const wrapper = mountPair(setup);
    await submit(wrapper);
    expect(marked(wrapper, 'first')).toBe(true);

    (wrapper.vm as unknown as { form: { resetForm: () => void } }).form.resetForm();
    await settle();
    expect(marked(wrapper, 'first')).toBe(false);
    expect(marked(wrapper, 'second')).toBe(false);
    wrapper.unmount();
  });
});

describe('a Field with no Form', () => {
  const rule = (value: unknown) => (typeof value === 'string' && value.includes('@')) || MESSAGE;

  it('validates on blur and not while typing, on its own', async () => {
    const wrapper = mountWith(FieldInput, { props: { name: 'email', rules: rule } });
    const input = wrapper.find('input');

    await input.setValue('maren');
    await settle();
    expect(input.attributes('aria-invalid')).toBeUndefined();

    await input.trigger('blur');
    await settle();
    expect(input.attributes('aria-invalid')).toBe('true');

    await input.setValue('maren@example.com');
    await settle();
    expect(input.attributes('aria-invalid')).toBe('true');

    await input.trigger('blur');
    await settle();
    expect(input.attributes('aria-invalid')).toBeUndefined();
    wrapper.unmount();
  });

  it('validateOnMount shows the message with no form above', async () => {
    const wrapper = mountWith(FieldInput, {
      props: { name: 'email', rules: rule, validateOnMount: true },
    });
    await settle();
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true');
    wrapper.unmount();
  });
});

describe("a Field inside a vee-validate form that is not this package's Form", () => {
  it('shows its message when that form is submitted, and holds it while typing', async () => {
    const rule = (value: unknown) => (typeof value === 'string' && value !== '') || MESSAGE;
    const Host = defineComponent({
      setup() {
        const { handleSubmit } = useForm();
        const onSubmit = handleSubmit(() => {});
        return () =>
          h('form', { onSubmit }, [
            h(FieldInput, { name: 'name', rules: rule }),
            h('button', { type: 'submit' }, 'Send'),
          ]);
      },
    });
    const wrapper = mountWith(Host);
    const input = wrapper.find('input');
    expect(input.attributes('aria-invalid')).toBeUndefined();

    await wrapper.find('form').trigger('submit');
    await settle();
    expect(input.attributes('aria-invalid')).toBe('true');

    await input.setValue('Maren');
    await settle();
    expect(input.attributes('aria-invalid')).toBe('true');

    await input.trigger('blur');
    await settle();
    expect(input.attributes('aria-invalid')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('the three defaults of every Field*', () => {
  const fields = Object.fromEntries(
    Object.entries(entry).filter(([name]) => name.startsWith('Field') && name !== 'FieldWrapper')
  ) as Record<string, Component & { props?: Record<string, { default?: unknown }> }>;

  /**
   * Every `Field*` by name, with the one default that differs between them. A new component has to
   * be added here deliberately: is one click the whole value (`true`), or is the value typed
   * (`false`)? `validateOnMount` is `false` and `validateOnBlur` is `true` for all of them.
   */
  const VALIDATE_ON_VALUE_UPDATE: Record<string, boolean> = {
    // Typed: the value is built up one keystroke at a time.
    FieldAutocomplete: false,
    FieldCurrencyInput: false,
    FieldInput: false,
    FieldSearchBar: false,
    FieldTextarea: false,
    FieldUnitInput: false,
    // Choice: one click or selection is the whole value.
    FieldCheckbox: true,
    FieldCheckboxGroup: true,
    FieldMultiSelect: true,
    // Writes its value only on a committed number or a button press, never per keystroke.
    FieldQuantityStepper: true,
    FieldRadioGroup: true,
    FieldSelect: true,
    FieldSwitch: true,
    FieldVariantPicker: true,
  };

  it('the table names every Field* the entry exports, and nothing else', () => {
    expect(Object.keys(VALIDATE_ON_VALUE_UPDATE).sort()).toEqual(Object.keys(fields).sort());
  });

  it('the two shared defaults objects differ only in validateOnValueUpdate', () => {
    expect(FIELD_VALIDATION_DEFAULTS).toEqual({
      validateOnMount: false,
      validateOnBlur: true,
      validateOnValueUpdate: false,
    });
    expect(FIELD_CHOICE_VALIDATION_DEFAULTS).toEqual({
      validateOnMount: false,
      validateOnBlur: true,
      validateOnValueUpdate: true,
    });
  });

  it.each(Object.entries(VALIDATE_ON_VALUE_UPDATE))(
    '%s: validateOnMount false, validateOnBlur true, validateOnValueUpdate %s',
    (name, validateOnValueUpdate) => {
      const declared = fields[name]?.props ?? {};
      expect(declared.validateOnMount?.default).toBe(false);
      expect(declared.validateOnBlur?.default).toBe(true);
      expect(declared.validateOnValueUpdate?.default).toBe(validateOnValueUpdate);
    }
  );

  it.each(KINDS)(
    '$title keeps them for itself: none reaches the control as an attribute',
    (kind) => {
      const wrapper = mountKind(kind, 'rules on the field', {
        validateOnMount: false,
        validateOnBlur: false,
        validateOnValueUpdate: true,
      });
      const html = wrapper.html().toLowerCase();
      for (const prop of FIELD_VALIDATION_PROPS) {
        expect(html).not.toContain(prop.toLowerCase());
        expect(html).not.toContain(prop.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));
      }
      wrapper.unmount();
    }
  );
});
