import { afterEach, describe, expect, it } from 'vitest';
import { IconDiscount, IconMail, IconSearch } from '@tabler/icons-vue';
import { computed, nextTick, ref } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { FIELD_KEY, type FieldContext } from '../../field-wrapper/context';
import Input from '../Input.vue';
import type { InputSize, InputType } from '../types';

const SIZES: InputSize[] = ['sm', 'md', 'lg'];
const TYPES: InputType[] = ['text', 'email', 'tel', 'number', 'search', 'url', 'password'];

/** Every mount needs an accessible name; a FieldWrapper supplies one in real use. */
const NAME = { 'aria-label': 'Email address' };

/** Twice the length of the spec's own example value. */
const LONG_VALUE =
  'maren.holt-jonsdottir+northwind-goods-newsletter@an-unusually-long-domain-name.example.com';

function control(wrapper: { find: (s: string) => { element: Element } }): HTMLInputElement {
  return wrapper.find('[data-part="control"]').element as HTMLInputElement;
}

/** A stub FieldWrapper: exactly what the real FieldWrapper component provides. */
function fieldProvider(context: Partial<FieldContext> = {}) {
  return {
    provide: {
      [FIELD_KEY as symbol]: computed<FieldContext>(() => ({
        id: 'field-email',
        labelId: 'field-email-label',
        describedBy: 'field-email-error field-email-help',
        invalid: true,
        required: true,
        labelsControl: true,
        ...context,
      })),
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Input — element and parts', () => {
  it('renders a native input inside a root wrapper, with a data-part on every part', () => {
    const wrapper = mountWith(Input, {
      props: { modelValue: 'merino scarf', type: 'search', leadingIcon: IconSearch },
      attrs: NAME,
      slots: { suffix: '<span>kg</span>' },
    });
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(control(wrapper).tagName).toBe('INPUT');
    expect(wrapper.find('[data-part="leadingIcon"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="suffix"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders only the parts it needs', () => {
    const wrapper = mountWith(Input, { attrs: NAME });
    expect(wrapper.find('[data-part="leadingIcon"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="suffix"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('puts fall-through attributes on the control, not on the wrapper', () => {
    const wrapper = mountWith(Input, { attrs: { ...NAME, 'data-testid': 'email' } });
    expect(wrapper.attributes('data-testid')).toBeUndefined();
    expect(control(wrapper).getAttribute('data-testid')).toBe('email');
    expect(control(wrapper).getAttribute('aria-label')).toBe('Email address');
    wrapper.unmount();
  });

  it('merges a per-part class override', () => {
    const wrapper = mountWith(Input, {
      props: {
        modelValue: 'x',
        clearable: true,
        classes: { root: 'mt-4', control: 'text-body-lg', clearButton: 'opacity-50' },
      },
      attrs: NAME,
      slots: { suffix: '<span>kg</span>' },
    });
    expect(wrapper.classes()).toContain('mt-4');
    expect(control(wrapper).className).toContain('text-body-lg');
    // The consumer's font size replaces the component's, it does not land beside it.
    expect(control(wrapper).className.split(/\s+/)).not.toContain('text-control');
    expect(wrapper.find('[data-part="clearButton"]').classes()).toContain('opacity-50');
    wrapper.unmount();
  });
});

describe('Input — value and v-model', () => {
  it('shows the model value', () => {
    const wrapper = mountWith(Input, { props: { modelValue: 'Maren Holt' }, attrs: NAME });
    expect(control(wrapper).value).toBe('Maren Holt');
    wrapper.unmount();
  });

  it('emits update:modelValue on every keystroke', async () => {
    const wrapper = mountWith(Input, { props: { modelValue: '' }, attrs: NAME });
    const el = control(wrapper);
    el.value = 'Mare';
    await wrapper.find('[data-part="control"]').trigger('input');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Mare']);
    wrapper.unmount();
  });

  it('round-trips through v-model', async () => {
    const value = ref('');
    const wrapper = mountWith(Input, {
      props: {
        modelValue: value.value,
        'onUpdate:modelValue': (next: string) => {
          value.value = next;
        },
      },
      attrs: NAME,
    });
    const el = control(wrapper);
    el.value = 'Maren';
    await wrapper.find('[data-part="control"]').trigger('input');
    expect(value.value).toBe('Maren');
    await wrapper.setProps({ modelValue: value.value });
    expect(control(wrapper).value).toBe('Maren');
    wrapper.unmount();
  });

  it('works uncontrolled, with no modelValue bound', async () => {
    const wrapper = mountWith(Input, { attrs: NAME });
    const el = control(wrapper);
    el.value = 'Maren';
    await wrapper.find('[data-part="control"]').trigger('input');
    await nextTick();
    expect(control(wrapper).value).toBe('Maren');
    wrapper.unmount();
  });

  it('re-emits focus and blur', async () => {
    const wrapper = mountWith(Input, { attrs: NAME });
    await wrapper.find('[data-part="control"]').trigger('focus');
    await wrapper.find('[data-part="control"]').trigger('blur');
    expect(wrapper.emitted('focus')).toHaveLength(1);
    expect(wrapper.emitted('blur')).toHaveLength(1);
    wrapper.unmount();
  });
});

describe('Input — native attributes', () => {
  it.each(TYPES)('passes type=%s through to the native input', (type) => {
    const wrapper = mountWith(Input, { props: { type }, attrs: NAME });
    expect(control(wrapper).getAttribute('type')).toBe(type);
    wrapper.unmount();
  });

  it('defaults to type="text"', () => {
    const wrapper = mountWith(Input, { attrs: NAME });
    expect(control(wrapper).getAttribute('type')).toBe('text');
    wrapper.unmount();
  });

  it('passes name, placeholder, autocomplete and inputmode through', () => {
    const wrapper = mountWith(Input, {
      props: {
        name: 'email',
        placeholder: 'you@example.com',
        autocomplete: 'email',
        inputmode: 'email',
      },
      attrs: NAME,
    });
    const el = control(wrapper);
    expect(el.getAttribute('name')).toBe('email');
    expect(el.getAttribute('placeholder')).toBe('you@example.com');
    expect(el.getAttribute('autocomplete')).toBe('email');
    expect(el.getAttribute('inputmode')).toBe('email');
    wrapper.unmount();
  });

  it('passes min, max and step through for a number field', () => {
    const wrapper = mountWith(Input, {
      props: { type: 'number', min: 1, max: 99, step: 5 },
      attrs: NAME,
    });
    const el = control(wrapper);
    expect(el.getAttribute('min')).toBe('1');
    expect(el.getAttribute('max')).toBe('99');
    expect(el.getAttribute('step')).toBe('5');
    wrapper.unmount();
  });

  it('gives a number field inputmode="numeric" and tabular numerals', () => {
    const wrapper = mountWith(Input, { props: { type: 'number' }, attrs: NAME });
    expect(control(wrapper).getAttribute('inputmode')).toBe('numeric');
    expect(control(wrapper).className).toContain('tabular-nums');
    wrapper.unmount();
  });

  it('lets an explicit inputmode win over the number default', () => {
    const wrapper = mountWith(Input, {
      props: { type: 'number', inputmode: 'decimal' },
      attrs: NAME,
    });
    expect(control(wrapper).getAttribute('inputmode')).toBe('decimal');
    wrapper.unmount();
  });

  it('sets required on the native input', () => {
    const wrapper = mountWith(Input, { props: { required: true }, attrs: NAME });
    expect(control(wrapper).required).toBe(true);
    wrapper.unmount();
  });

  it('generates a stable id, and uses the caller id when given', () => {
    const generated = mountWith(Input, { attrs: NAME });
    expect(control(generated).id).toMatch(/^eldra-input-/);
    generated.unmount();

    const explicit = mountWith(Input, { props: { id: 'checkout-email' }, attrs: NAME });
    expect(control(explicit).id).toBe('checkout-email');
    explicit.unmount();
  });
});

describe('Input — sizes', () => {
  it.each([
    ['sm', 'control-h-sm', 'text-control-sm'],
    ['md', 'control-h', 'text-control'],
    ['lg', 'control-h-lg', 'text-control-lg'],
  ] as const)('%s uses the spec height and text size', (size, height, text) => {
    const wrapper = mountWith(Input, { props: { size }, attrs: NAME });
    const classes = control(wrapper).className.split(/\s+/);
    expect(classes).toContain(height);
    expect(classes).toContain(text);
    wrapper.unmount();
  });

  it('defaults to md', () => {
    const wrapper = mountWith(Input, { attrs: NAME });
    expect(control(wrapper).className.split(/\s+/)).toContain('control-h');
    wrapper.unmount();
  });

  it('raises md text to 1rem below a 48rem viewport, so iOS never zooms in', () => {
    const wrapper = mountWith(Input, { props: { size: 'md' }, attrs: NAME });
    expect(control(wrapper).className.split(/\s+/)).toContain('max-md:text-control-mobile');
    wrapper.unmount();
  });

  it.each(SIZES)('%s keeps its control height, with no touch-target growth', (size) => {
    const wrapper = mountWith(Input, { props: { size }, attrs: NAME });
    expect(control(wrapper).className).not.toContain('target-touch');
    wrapper.unmount();
  });
});

describe('Input — leading icon and suffix', () => {
  it('renders the leading icon decoratively and out of the pointer path', () => {
    const wrapper = mountWith(Input, { props: { leadingIcon: IconMail }, attrs: NAME });
    const icon = wrapper.find('[data-part="leadingIcon"]');
    expect(icon.classes()).toContain('pointer-events-none');
    expect(icon.find('svg').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('makes room for the leading icon with the spec start padding', () => {
    const wrapper = mountWith(Input, { props: { leadingIcon: IconDiscount }, attrs: NAME });
    expect(control(wrapper).className.split(/\s+/)).toContain('ps-9');
    wrapper.unmount();
  });

  it('leaves the start padding alone with no leading icon', () => {
    const wrapper = mountWith(Input, { attrs: NAME });
    expect(control(wrapper).className).not.toContain('ps-9');
    wrapper.unmount();
  });

  it('renders the leadingIcon slot in place of the prop', () => {
    const wrapper = mountWith(Input, {
      attrs: NAME,
      slots: { leadingIcon: '<span data-testid="custom">$</span>' },
    });
    expect(wrapper.find('[data-part="leadingIcon"] [data-testid="custom"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('makes room for a trailing action with the spec end padding', () => {
    const wrapper = mountWith(Input, {
      attrs: NAME,
      slots: { suffix: '<span>kg</span>' },
    });
    expect(control(wrapper).className.split(/\s+/)).toContain('pe-10');
    wrapper.unmount();
  });

  it('keeps the row gap when the clear button and a populated suffix slot share the row (fix)', () => {
    // `Input`'s own doc comment documents this combination as first-class: "the clear button and
    // the `suffix` slot share it, so a field with both keeps them on one row." UnitInput's
    // two-action pair (clear + drag handle) is the only thing allowed to go flush — Input's row
    // must keep its `gap-1`, unchanged from before UnitInput grew that pair recipe.
    const wrapper = mountWith(Input, {
      props: { type: 'search', modelValue: 'merino scarf' },
      attrs: NAME,
      slots: { suffix: '<span>kg</span>' },
    });
    expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="suffix"]').classes()).toContain('gap-1');
    wrapper.unmount();
  });
});

describe('Input — clear button', () => {
  it('is on by default for a search input and off for everything else', () => {
    const search = mountWith(Input, {
      props: { type: 'search', modelValue: 'scarf' },
      attrs: NAME,
    });
    expect(search.find('[data-part="clearButton"]').exists()).toBe(true);
    search.unmount();

    const text = mountWith(Input, { props: { modelValue: 'scarf' }, attrs: NAME });
    expect(text.find('[data-part="clearButton"]').exists()).toBe(false);
    text.unmount();
  });

  it('can be turned on for any type and off for search', () => {
    const on = mountWith(Input, { props: { clearable: true, modelValue: 'scarf' }, attrs: NAME });
    expect(on.find('[data-part="clearButton"]').exists()).toBe(true);
    on.unmount();

    const off = mountWith(Input, {
      props: { type: 'search', clearable: false, modelValue: 'scarf' },
      attrs: NAME,
    });
    expect(off.find('[data-part="clearButton"]').exists()).toBe(false);
    off.unmount();
  });

  it('shows only while there is a value', async () => {
    const wrapper = mountWith(Input, { props: { type: 'search', modelValue: '' }, attrs: NAME });
    expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(false);
    await wrapper.setProps({ modelValue: 'scarf' });
    expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('is a real button with the clear message as its accessible name', () => {
    const wrapper = mountWith(Input, { props: { type: 'search', modelValue: 'x' }, attrs: NAME });
    const button = wrapper.find('[data-part="clearButton"]');
    expect(button.element.tagName).toBe('BUTTON');
    expect(button.attributes('type')).toBe('button');
    expect(button.attributes('aria-label')).toBe('Clear');
    expect(button.find('svg').attributes('aria-hidden')).toBe('true');
    // Operator report, 2026-09-25: every enabled button shows a pointer cursor.
    expect(button.classes()).toContain('cursor-pointer');
    wrapper.unmount();
  });

  it('empties the field, emits clear and an empty value, and returns focus to the input', async () => {
    const wrapper = mountWith(Input, {
      props: { type: 'search', modelValue: 'scarf' },
      attrs: NAME,
    });
    await wrapper.find('[data-part="clearButton"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['']);
    expect(wrapper.emitted('clear')).toHaveLength(1);
    expect(document.activeElement).toBe(control(wrapper));
    wrapper.unmount();
  });

  it('is never shown on a disabled or read-only field', () => {
    for (const props of [{ disabled: true }, { readonly: true }]) {
      const wrapper = mountWith(Input, {
        props: { type: 'search', modelValue: 'scarf', ...props },
        attrs: NAME,
      });
      expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(false);
      wrapper.unmount();
    }
  });

  it('comes after the input in the tab order', () => {
    const wrapper = mountWith(Input, { props: { type: 'search', modelValue: 'x' }, attrs: NAME });
    const nodes = [...wrapper.element.querySelectorAll('input, button')];
    expect(nodes.map((node) => node.getAttribute('data-part'))).toEqual(['control', 'clearButton']);
    wrapper.unmount();
  });

  it('hides the browser own clear button on a search field', () => {
    const wrapper = mountWith(Input, { props: { type: 'search' }, attrs: NAME });
    expect(control(wrapper).className).toContain('search-cancel-button');
    wrapper.unmount();
  });
});

describe('Input — states', () => {
  it('sets aria-invalid and the 2px danger boundary when invalid', () => {
    const wrapper = mountWith(Input, { props: { invalid: true }, attrs: NAME });
    expect(control(wrapper).getAttribute('aria-invalid')).toBe('true');
    expect(control(wrapper).className).toContain('border-danger');
    expect(wrapper.classes()).toContain('eldra-field-invalid');
    wrapper.unmount();
  });

  it('sets no aria-invalid when valid', () => {
    const wrapper = mountWith(Input, { attrs: NAME });
    expect(control(wrapper).getAttribute('aria-invalid')).toBeNull();
    expect(wrapper.classes()).not.toContain('eldra-field-invalid');
    wrapper.unmount();
  });

  it('is disabled natively, with the dashed decorative border', () => {
    const wrapper = mountWith(Input, { props: { disabled: true }, attrs: NAME });
    const el = control(wrapper);
    expect(el.disabled).toBe(true);
    const classes = el.className.split(/\s+/);
    expect(classes).toContain('border-dashed');
    expect(classes).toContain('bg-surface-strong');
    expect(classes).toContain('cursor-not-allowed');
    wrapper.unmount();
  });

  it('skips a disabled field with Tab', () => {
    const wrapper = mountWith(Input, { props: { disabled: true }, attrs: NAME });
    control(wrapper).focus();
    expect(document.activeElement).not.toBe(control(wrapper));
    wrapper.unmount();
  });

  it('keeps a read-only field focusable and selectable', () => {
    const wrapper = mountWith(Input, {
      props: { readonly: true, modelValue: 'NW-10482' },
      attrs: NAME,
    });
    const el = control(wrapper);
    expect(el.readOnly).toBe(true);
    expect(el.disabled).toBe(false);
    el.focus();
    expect(document.activeElement).toBe(el);
    expect(el.className.split(/\s+/)).toContain('bg-surface');
    wrapper.unmount();
  });

  it('carries the text-field focus ring, which shows on any focus', () => {
    const wrapper = mountWith(Input, { attrs: NAME });
    const classes = control(wrapper).className.split(/\s+/);
    expect(classes).toContain('eldra-focus');
    expect(classes).toContain('eldra-focus-always');
    wrapper.unmount();
  });

  it('puts no transition utility beside the focus ring, which owns them', () => {
    const wrapper = mountWith(Input, { attrs: NAME });
    expect(control(wrapper).className).not.toMatch(/(?:^|\s)(transition|duration)-/);
    wrapper.unmount();
  });

  it('draws the hover and focus boundary in text, per the states table', () => {
    const wrapper = mountWith(Input, { attrs: NAME });
    const classes = control(wrapper).className;
    expect(classes).toContain('border-border-strong');
    expect(classes).toContain('hover:border-text');
    expect(classes).toContain('focus:border-text');
    wrapper.unmount();
  });

  it('draws the placeholder in muted', () => {
    const wrapper = mountWith(Input, { props: { placeholder: 'you@example.com' }, attrs: NAME });
    expect(control(wrapper).className).toContain('placeholder:text-muted');
    wrapper.unmount();
  });
});

describe('Input — describedBy and the field context', () => {
  it('puts describedBy on aria-describedby', () => {
    const wrapper = mountWith(Input, {
      props: { describedBy: 'email-error email-help' },
      attrs: NAME,
    });
    expect(control(wrapper).getAttribute('aria-describedby')).toBe('email-error email-help');
    wrapper.unmount();
  });

  it('takes id, describedBy, invalid and required from a field wrapper', () => {
    const wrapper = mountWith(Input, { attrs: NAME, global: fieldProvider() });
    const el = control(wrapper);
    expect(el.id).toBe('field-email');
    expect(el.getAttribute('aria-describedby')).toBe('field-email-error field-email-help');
    expect(el.getAttribute('aria-invalid')).toBe('true');
    expect(el.required).toBe(true);
    wrapper.unmount();
  });

  it("lets its own id, invalid and required win, and adds describedBy to the wrapper's", () => {
    const wrapper = mountWith(Input, {
      props: {
        id: 'own-id',
        describedBy: 'own-help',
        invalid: false,
        required: false,
      },
      attrs: NAME,
      global: fieldProvider(),
    });
    const el = control(wrapper);
    expect(el.id).toBe('own-id');
    // `id`, `invalid` and `required` are *replaced* by the control's own props; `describedBy`
    // is **composed** — own id first, then the wrapper's — so a field's error and help text keep
    // describing the control. One rule for every control in the package; see `joinIds`.
    expect(el.getAttribute('aria-describedby')).toBe('own-help field-email-error field-email-help');
    expect(el.getAttribute('aria-invalid')).toBeNull();
    expect(el.required).toBe(false);
    wrapper.unmount();
  });

  it('follows the field context as it changes', async () => {
    const invalid = ref(false);
    const wrapper = mountWith(Input, {
      attrs: NAME,
      global: {
        provide: {
          [FIELD_KEY as symbol]: computed<FieldContext>(() => ({
            id: 'field-email',
            labelId: 'field-email-label',
            invalid: invalid.value,
            required: false,
            labelsControl: true,
          })),
        },
      },
    });
    expect(control(wrapper).getAttribute('aria-invalid')).toBeNull();
    invalid.value = true;
    await nextTick();
    expect(control(wrapper).getAttribute('aria-invalid')).toBe('true');
    wrapper.unmount();
  });
});

describe('Input — mask', () => {
  it('displays the masked text while the model stays raw', () => {
    const wrapper = mountWith(Input, {
      props: { type: 'tel', mask: '(###) ###-####', modelValue: '5551234567' },
      attrs: NAME,
    });
    expect(control(wrapper).value).toBe('(555) 123-4567');
    wrapper.unmount();
  });

  it('emits the raw digits as the customer types', async () => {
    const wrapper = mountWith(Input, {
      props: { type: 'tel', mask: '(###) ###-####', modelValue: '' },
      attrs: NAME,
    });
    const el = control(wrapper);
    el.value = '5551234567';
    await wrapper.find('[data-part="control"]').trigger('input');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['5551234567']);
    expect(el.value).toBe('(555) 123-4567');
    wrapper.unmount();
  });

  it('formats partial input and drops characters the format has no slot for', async () => {
    const wrapper = mountWith(Input, {
      props: { type: 'tel', mask: '(###) ###-####', modelValue: '' },
      attrs: NAME,
    });
    const el = control(wrapper);
    el.value = '555abc12';
    await wrapper.find('[data-part="control"]').trigger('input');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['55512']);
    expect(el.value).toBe('(555) 12');
    wrapper.unmount();
  });

  it('leaves the caret at the end after typing at the end', async () => {
    const wrapper = mountWith(Input, {
      props: { mask: 'A#A #A#', modelValue: '' },
      attrs: NAME,
    });
    const el = control(wrapper);
    el.value = 'M1A1';
    el.setSelectionRange(el.value.length, el.value.length);
    await wrapper.find('[data-part="control"]').trigger('input');
    expect(el.value).toBe('M1A 1');
    expect(el.selectionStart).toBe(el.value.length);
    wrapper.unmount();
  });

  it('emits the value unchanged when there is no mask', async () => {
    const wrapper = mountWith(Input, { props: { modelValue: '' }, attrs: NAME });
    const el = control(wrapper);
    el.value = '(555) 123';
    await wrapper.find('[data-part="control"]').trigger('input');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['(555) 123']);
    wrapper.unmount();
  });

  it('clears to an empty raw value', async () => {
    const wrapper = mountWith(Input, {
      props: { mask: '(###) ###-####', modelValue: '5551234567', clearable: true },
      attrs: NAME,
    });
    await wrapper.find('[data-part="clearButton"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['']);
    wrapper.unmount();
  });
});

describe('Input — content and layout', () => {
  it('renders long content without clipping the field', () => {
    const wrapper = mountWith(Input, { props: { modelValue: LONG_VALUE }, attrs: NAME });
    expect(control(wrapper).value).toBe(LONG_VALUE);
    expect(control(wrapper).className).toContain('w-full');
    wrapper.unmount();
  });

  it('renders in a narrow container', () => {
    const wrapper = mountNarrow(Input, {
      props: { type: 'search', modelValue: 'merino scarf', leadingIcon: IconSearch },
      attrs: NAME,
    });
    expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(true);
    expect(wrapper.classes()).toContain('w-full');
    wrapper.unmount();
  });
});

describe('Input — accessibility', () => {
  const cases: Array<[string, Record<string, unknown>, Record<string, string>]> = [
    ['default', {}, {}],
    ['invalid', { invalid: true, describedBy: 'email-error' }, {}],
    ['disabled', { disabled: true, modelValue: 'United Kingdom' }, {}],
    ['read-only', { readonly: true, modelValue: 'NW-10482' }, {}],
    ['with a leading icon', { leadingIcon: IconSearch, type: 'search' }, {}],
    ['clearable with a value', { type: 'search', modelValue: 'merino scarf' }, {}],
  ];

  it.each(cases)('has no axe violations — %s', async (_name, props) => {
    const host = document.createElement('div');
    document.body.append(host);
    const wrapper = mountWith(Input, { props, attrs: NAME });
    // The error text a FieldWrapper renders; `describedBy` must resolve to a real element.
    const help = document.createElement('p');
    help.id = 'email-error';
    help.textContent = 'Enter a full UK postcode, like BS1 4XE.';
    host.append(help);
    expect(await axe(document.body)).toHaveNoViolations();
    wrapper.unmount();
    host.remove();
  });

  it('has no axe violations inside a real label', async () => {
    const wrapper = mountWith(Input, { props: { id: 'email' }, attrs: {} });
    const label = document.createElement('label');
    label.htmlFor = 'email';
    label.textContent = 'Email address';
    wrapper.element.before(label);
    expect(await axe(document.body)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('Input — the invalid boundary against the other states', () => {
  /**
   * The boundary is drawn by `eldra-field-border`, not Tailwind's `border`: the inset line that
   * completes the 2px error state is inset by exactly this width, so both have to read the same
   * `--eldra-field-border-width`. A `border` here would pin the boundary at 1px while the line
   * moved, and the two would come apart the moment a consumer set the variable.
   */
  it('draws its boundary from the field border-width variable', () => {
    const wrapper = mountWith(Input, { attrs: NAME });
    const classes = control(wrapper).className.split(/\s+/);
    expect(classes).toContain('eldra-field-border');
    expect(classes).not.toContain('border');
    wrapper.unmount();
  });

  it('drops every invalid style on a disabled field', () => {
    const wrapper = mountWith(Input, { props: { invalid: true, disabled: true }, attrs: NAME });
    const classes = control(wrapper).className.split(/\s+/);
    expect(classes).not.toContain('border-danger');
    expect(classes).toContain('border-dashed');
    expect(wrapper.classes()).not.toContain('eldra-field-invalid');
    wrapper.unmount();
  });

  it('keeps the invalid boundary on a read-only field', () => {
    const wrapper = mountWith(Input, { props: { invalid: true, readonly: true }, attrs: NAME });
    expect(control(wrapper).className.split(/\s+/)).toContain('border-danger');
    expect(wrapper.classes()).toContain('eldra-field-invalid');
    wrapper.unmount();
  });

  it('still reports aria-invalid on a disabled field', () => {
    const wrapper = mountWith(Input, { props: { invalid: true, disabled: true }, attrs: NAME });
    expect(control(wrapper).getAttribute('aria-invalid')).toBe('true');
    wrapper.unmount();
  });
});

describe('Input — the mask and the caret', () => {
  /**
   * Writing `element.value` puts the caret at the end in every browser, and a masked field
   * rewrites the value on every keystroke — so an edit in the middle of the value loses the caret
   * position. That is the behaviour today; this pins it so that a future caret-preserving change
   * is a deliberate one rather than an accident, and so the comment in `Input.vue` stays honest.
   */
  it('resets the caret to the end after an edit in the middle of the value', async () => {
    const wrapper = mountWith(Input, {
      props: { type: 'tel', mask: '(###) ###-####', modelValue: '5551234567' },
      attrs: NAME,
    });
    const el = control(wrapper);
    expect(el.value).toBe('(555) 123-4567');
    // The customer put the caret after "(555" and typed a 9.
    el.value = '(5559) 123-4567';
    el.setSelectionRange(5, 5);
    await wrapper.find('[data-part="control"]').trigger('input');
    expect(el.value).toBe('(555) 912-3456');
    expect(el.selectionStart).toBe(el.value.length);
    wrapper.unmount();
  });
});

describe('Input — inside a group field wrapper', () => {
  /**
   * A `group` wrapper is a `<fieldset>` and carries the context id on itself, so a control that
   * adopted it would put one id on two elements. `labelsControl` is what says which kind of
   * wrapper is above: with no `<label for>` to point at this control, there is no id to inherit.
   */
  it('generates its own id rather than taking the fieldset own', () => {
    const wrapper = mountWith(Input, {
      attrs: NAME,
      global: fieldProvider({ id: 'field-group', labelsControl: false }),
    });
    const el = control(wrapper);
    expect(el.id).not.toBe('field-group');
    expect(el.id).toMatch(/^eldra-input-/);
    // Everything else still comes from the wrapper.
    expect(el.getAttribute('aria-describedby')).toBe('field-email-error field-email-help');
    expect(el.required).toBe(true);
    wrapper.unmount();
  });
});

/**
 * `Input` is the field box the spec describes, and `SearchBar` and `UnitInput` draw the same box
 * by importing its recipes from `../classes`. `search-bar.spec.ts` and `unit-input.spec.ts` each
 * assert they carry every token of it — but nothing asserted that **`Input` itself** renders what
 * that module says, so a recipe could have been edited to match a copy rather than the other way
 * round and all three would have agreed on the wrong thing.
 */
describe('Input — the shared field recipe is what Input renders', () => {
  it('renders every token of the base recipe on its control', async () => {
    const { FIELD_BASE } = await import('../classes');
    const wrapper = mountWith(Input, { attrs: NAME });
    const classes = wrapper.find('[data-part="control"]').classes();
    const tokens = FIELD_BASE.split(/\s+/).filter(Boolean);
    expect(tokens.length).toBeGreaterThan(5);
    for (const token of tokens) {
      expect(classes, `Input's control is missing its own ${token}`).toContain(token);
    }
    wrapper.unmount();
  });

  it.each(SIZES)('renders the %s size recipe, type style included', async (size) => {
    const { FIELD_SIZE, FIELD_TEXT } = await import('../classes');
    const wrapper = mountWith(Input, { props: { size }, attrs: NAME });
    const classes = wrapper.find('[data-part="control"]').classes();
    for (const token of `${FIELD_SIZE[size]} ${FIELD_TEXT[size]}`.split(/\s+/).filter(Boolean)) {
      expect(classes, `Input's ${size} control is missing ${token}`).toContain(token);
    }
    wrapper.unmount();
  });

  it('renders the state recipes it is in, and only those', async () => {
    const { FIELD_LIVE, FIELD_INVALID, FIELD_DISABLED, FIELD_READONLY } =
      await import('../classes');
    const tokensOf = (recipe: string): string[] => recipe.split(/\s+/).filter(Boolean);
    const control = (props: Record<string, unknown>): string[] => {
      const wrapper = mountWith(Input, { props, attrs: NAME });
      const classes = wrapper.find('[data-part="control"]').classes();
      wrapper.unmount();
      return classes;
    };

    const live = control({});
    for (const token of tokensOf(FIELD_LIVE)) expect(live).toContain(token);

    const invalid = control({ invalid: true });
    for (const token of tokensOf(FIELD_INVALID)) expect(invalid).toContain(token);

    // Disabled and read-only *replace* the live colours rather than layering over them, so a
    // `:hover` rule can never win a live boundary back on a dead field.
    const disabled = control({ disabled: true });
    for (const token of tokensOf(FIELD_DISABLED)) expect(disabled).toContain(token);
    expect(disabled).not.toContain('border-border-strong');

    const readonly = control({ readonly: true });
    for (const token of tokensOf(FIELD_READONLY)) expect(readonly).toContain(token);
    expect(readonly).not.toContain('border-border-strong');
  });

  it('renders the decoration paddings from the recipe, not numbers of its own', async () => {
    const { FIELD_LEADING_PAD, FIELD_TRAILING_PAD, FIELD_CLEAR_SIZE } = await import('../classes');
    const wrapper = mountWith(Input, {
      props: { modelValue: 'x', type: 'search', leadingIcon: IconSearch },
      attrs: NAME,
    });
    const classes = wrapper.find('[data-part="control"]').classes();
    expect(classes).toContain(FIELD_LEADING_PAD);
    expect(classes).toContain(FIELD_TRAILING_PAD.md);
    expect(wrapper.find('[data-part="clearButton"]').classes()).toContain(FIELD_CLEAR_SIZE.md);
    wrapper.unmount();
  });
});
