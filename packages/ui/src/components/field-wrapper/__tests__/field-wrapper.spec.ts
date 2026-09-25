import { afterEach, describe, expect, it } from 'vitest';
import { computed, defineComponent, h, inject } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { provideEldraUiMessages } from '../../../composables/useMessages';
import { FORM_LAYOUT_KEY } from '../../form-layout/context';
import Input from '../../input/Input.vue';
import Textarea from '../../textarea/Textarea.vue';
import { FIELD_KEY, type FieldContext } from '../context';
import FieldWrapper from '../FieldWrapper.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

/** The control every wrapper-only test puts inside: a native input the wrapper can wire. */
const CONTROL = '<input data-testid="control" />';

/** Reads the context a mounted FieldWrapper provides, so the wiring can be asserted directly. */
const ContextProbe = defineComponent({
  setup() {
    const field = inject(FIELD_KEY, null);
    return () =>
      h('output', {
        'data-testid': 'probe',
        'data-id': field?.value.id,
        'data-described-by': field?.value.describedBy ?? '',
        'data-invalid': String(field?.value.invalid),
        'data-required': String(field?.value.required),
      });
  },
});

function probe(wrapper: { find: (s: string) => { attributes: () => Record<string, string> } }) {
  return wrapper.find('[data-testid="probe"]').attributes();
}

/** A two-column FormLayout, without mounting one: exactly what FormLayout provides. */
function inLayout(layout: 'single' | 'two' | 'inline') {
  return { provide: { [FORM_LAYOUT_KEY as symbol]: computed(() => layout) } };
}

describe('FieldWrapper — parts', () => {
  it('renders a data-part on every part the spec anatomy names', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: {
        label: 'Monogram',
        required: true,
        help: 'Up to 3 letters, stitched on the cuff.',
        error: 'Enter up to three letters.',
        counter: { max: 3, value: 2 },
      },
      slots: { default: CONTROL },
    });
    for (const part of [
      'root',
      'label',
      'requiredMark',
      'help',
      'control',
      'error',
      'errorIcon',
      'foot',
      'counter',
    ]) {
      expect(wrapper.find(`[data-part="${part}"]`).exists(), part).toBe(true);
    }
    wrapper.unmount();
  });

  it('renders only the parts it needs', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Company' },
      slots: { default: CONTROL },
    });
    expect(wrapper.attributes('data-part')).toBe('root');
    for (const part of ['requiredMark', 'optionalText', 'help', 'error', 'errorIcon', 'foot']) {
      expect(wrapper.find(`[data-part="${part}"]`).exists(), part).toBe(false);
    }
    wrapper.unmount();
  });

  it('merges a per-part class override instead of appending it', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Company', classes: { root: 'gap-6' } },
      slots: { default: CONTROL },
    });
    expect(wrapper.classes()).toContain('gap-6');
    expect(wrapper.classes()).not.toContain('gap-1');
    wrapper.unmount();
  });
});

describe('FieldWrapper — label, required and optional', () => {
  it('ties the label to the control it generated an id for', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Email address' },
      slots: { default: ContextProbe },
    });
    const label = wrapper.find('[data-part="label"]');
    expect(label.text()).toContain('Email address');
    expect(label.attributes('for')).toBe(probe(wrapper)['data-id']);
    expect(probe(wrapper)['data-id']).toMatch(/^eldra-field-/);
    wrapper.unmount();
  });

  it('uses the caller id when it is given, so a server-rendered form keeps its own ids', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Email address', id: 'checkout-email' },
      slots: { default: ContextProbe },
    });
    expect(wrapper.find('[data-part="label"]').attributes('for')).toBe('checkout-email');
    expect(probe(wrapper)['data-id']).toBe('checkout-email');
    wrapper.unmount();
  });

  it('shows an aria-hidden asterisk and marks the field required', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Phone', required: true },
      slots: { default: ContextProbe },
    });
    const mark = wrapper.find('[data-part="requiredMark"]');
    expect(mark.text()).toBe('*');
    expect(mark.attributes('aria-hidden')).toBe('true');
    expect(probe(wrapper)['data-required']).toBe('true');
    wrapper.unmount();
  });

  it('shows "(optional)" from the message catalogue, and never both marks', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Company', optional: true },
      slots: { default: CONTROL },
    });
    expect(wrapper.find('[data-part="optionalText"]').text()).toBe('(optional)');
    expect(wrapper.find('[data-part="requiredMark"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('prefers the required mark when a field is somehow both', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Company', optional: true, required: true },
      slots: { default: CONTROL },
    });
    expect(wrapper.find('[data-part="requiredMark"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="optionalText"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the label slot in place of the label text, keeping the marks', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Phone', required: true },
      slots: { default: CONTROL, label: '<span data-testid="custom">Phone number</span>' },
    });
    expect(wrapper.find('[data-testid="custom"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="requiredMark"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('FieldWrapper — help, error and describedBy', () => {
  it('links help by id and puts nothing else in describedBy', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Postcode', help: 'Like BS1 4XE' },
      slots: { default: ContextProbe },
    });
    const helpId = wrapper.find('[data-part="help"]').attributes('id');
    expect(helpId).toBeTruthy();
    expect(probe(wrapper)['data-described-by']).toBe(helpId);
    expect(probe(wrapper)['data-invalid']).toBe('false');
    wrapper.unmount();
  });

  it('puts the error id first, then help, and marks the field invalid', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Phone', help: 'Like 07700 900123', error: 'Enter at least 10 digits.' },
      slots: { default: ContextProbe },
    });
    const errorId = wrapper.find('[data-part="error"]').attributes('id');
    const helpId = wrapper.find('[data-part="help"]').attributes('id');
    expect(probe(wrapper)['data-described-by']).toBe(`${errorId} ${helpId}`);
    expect(probe(wrapper)['data-invalid']).toBe('true');
    wrapper.unmount();
  });

  it('leaves describedBy unset when nothing describes the field', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Company' },
      slots: { default: ContextProbe },
    });
    expect(probe(wrapper)['data-described-by']).toBe('');
    wrapper.unmount();
  });

  it('shows the error as a plain paragraph with an icon, not a live region', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Phone', error: 'Enter a phone number with at least 10 digits.' },
      slots: { default: CONTROL },
    });
    const error = wrapper.find('[data-part="error"]');
    expect(error.element.tagName).toBe('P');
    expect(error.attributes('role')).toBeUndefined();
    expect(error.attributes('aria-live')).toBeUndefined();
    expect(error.text()).toContain('Enter a phone number with at least 10 digits.');
    const icon = wrapper.find('[data-part="errorIcon"]');
    expect(icon.attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('keeps the label out of the danger colour while the field is invalid', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Phone', error: 'Enter at least 10 digits.' },
      slots: { default: CONTROL },
    });
    expect(wrapper.find('[data-part="label"]').classes()).toContain('text-text');
    expect(wrapper.find('[data-part="label"]').classes()).not.toContain('text-danger');
    wrapper.unmount();
  });

  it('treats the error slot as error content, so the field is invalid and linked', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Phone' },
      slots: { default: ContextProbe, error: 'Enter a number we can text.' },
    });
    const errorId = wrapper.find('[data-part="error"]').attributes('id');
    expect(probe(wrapper)['data-invalid']).toBe('true');
    expect(probe(wrapper)['data-described-by']).toBe(errorId);
    wrapper.unmount();
  });

  it('treats the help slot as help content', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Postcode' },
      slots: { default: ContextProbe, help: '<span>Like BS1 4XE</span>' },
    });
    const helpId = wrapper.find('[data-part="help"]').attributes('id');
    expect(probe(wrapper)['data-described-by']).toBe(helpId);
    wrapper.unmount();
  });
});

describe('FieldWrapper — counter', () => {
  it('shows "n / max" in the foot row, muted and weight 400 under the limit', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Monogram', counter: { max: 3, value: 2 } },
      slots: { default: CONTROL },
    });
    const counter = wrapper.find('[data-part="counter"]');
    expect(counter.text()).toBe('2 / 3');
    expect(counter.classes()).toContain('text-muted');
    expect(counter.classes()).toContain('font-normal');
    wrapper.unmount();
  });

  it('counts from zero when no value is given', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Monogram', counter: { max: 3 } },
      slots: { default: CONTROL },
    });
    expect(wrapper.find('[data-part="counter"]').text()).toBe('0 / 3');
    wrapper.unmount();
  });

  it('turns danger weight 600 once the value runs over the limit', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Monogram', counter: { max: 3, value: 4 } },
      slots: { default: CONTROL },
    });
    const counter = wrapper.find('[data-part="counter"]');
    expect(counter.classes()).toContain('text-danger');
    expect(counter.classes()).toContain('font-semibold');
    wrapper.unmount();
  });

  it('keeps the counter out of aria-describedby, which carries the error and help only', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Monogram', help: 'Up to 3 letters.', counter: { max: 3, value: 2 } },
      slots: { default: ContextProbe },
    });
    const helpId = wrapper.find('[data-part="help"]').attributes('id');
    expect(probe(wrapper)['data-described-by']).toBe(helpId);
    wrapper.unmount();
  });

  it('renders the foot row for a counter with no help text', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Monogram', counter: { max: 3, value: 1 } },
      slots: { default: CONTROL },
    });
    expect(wrapper.find('[data-part="foot"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="help"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('FieldWrapper — full width', () => {
  it('spans both columns inside a two-column form', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Address', full: true },
      slots: { default: CONTROL },
      global: inLayout('two'),
    });
    expect(wrapper.classes()).toContain('@two-col:col-span-2');
    wrapper.unmount();
  });

  it('does nothing in a single-column or inline form, or outside a form', () => {
    for (const layout of ['single', 'inline'] as const) {
      const wrapper = mountWith(FieldWrapper, {
        props: { label: 'Address', full: true },
        slots: { default: CONTROL },
        global: inLayout(layout),
      });
      expect(wrapper.classes(), layout).not.toContain('@two-col:col-span-2');
      wrapper.unmount();
    }
    const alone = mountWith(FieldWrapper, {
      props: { label: 'Address', full: true },
      slots: { default: CONTROL },
    });
    expect(alone.classes()).not.toContain('@two-col:col-span-2');
    alone.unmount();
  });

  it('does not span both columns without `full`', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Town or city' },
      slots: { default: CONTROL },
      global: inLayout('two'),
    });
    expect(wrapper.classes()).not.toContain('@two-col:col-span-2');
    wrapper.unmount();
  });
});

describe('FieldWrapper — inside an inline form', () => {
  it('flattens into the row so the label and control travel together', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Email address', help: 'One letter a month.', error: 'Enter an email.' },
      slots: { default: CONTROL },
      global: inLayout('inline'),
    });
    expect(wrapper.classes()).toContain('contents');
    expect(wrapper.classes()).not.toContain('grid');
    const group = wrapper.find('[data-part="label"]').element.parentElement as HTMLElement;
    expect(group.className).toContain('flex-[1_1_14rem]');
    expect(wrapper.find('[data-part="control"]').element.parentElement).toBe(group);
    wrapper.unmount();
  });

  it('puts the error and the foot row on full-width rows after the button', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Email address', help: 'One letter a month.', error: 'Enter an email.' },
      slots: { default: CONTROL },
      global: inLayout('inline'),
    });
    for (const part of ['error', 'foot']) {
      const classes = wrapper.find(`[data-part="${part}"]`).classes();
      expect(classes, part).toContain('basis-full');
      expect(classes, part).toContain('order-1');
    }
    wrapper.unmount();
  });

  it('keeps its own grid in every other layout', () => {
    for (const layout of ['single', 'two'] as const) {
      const wrapper = mountWith(FieldWrapper, {
        props: { label: 'Email address', help: 'One letter a month.' },
        slots: { default: CONTROL },
        global: inLayout(layout),
      });
      expect(wrapper.classes(), layout).toContain('grid');
      expect(wrapper.classes(), layout).not.toContain('contents');
      // The label-and-control group is display: contents, so the spec's rows are the root's own.
      const group = wrapper.find('[data-part="label"]').element.parentElement as HTMLElement;
      expect(group.className, layout).toBe('contents');
      expect(wrapper.find('[data-part="foot"]').classes(), layout).not.toContain('order-1');
      wrapper.unmount();
    }
  });
});

describe('FieldWrapper — with a control inside', () => {
  it('wires an Input: label for, describedBy order, aria-invalid and required', async () => {
    const wrapper = mountWith(FieldWrapper, {
      props: {
        label: 'Phone',
        required: true,
        help: 'The courier texts you on delivery day.',
        error: 'Enter a phone number with at least 10 digits.',
      },
      slots: { default: h(Input, { modelValue: '07700 90' }) },
    });
    const input = wrapper.find('input').element as HTMLInputElement;
    const errorId = wrapper.find('[data-part="error"]').attributes('id');
    const helpId = wrapper.find('[data-part="help"]').attributes('id');

    expect(wrapper.find('[data-part="label"]').attributes('for')).toBe(input.id);
    expect(input.getAttribute('aria-describedby')).toBe(`${errorId} ${helpId}`);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.required).toBe(true);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('wires a Textarea the same way', async () => {
    const wrapper = mountWith(FieldWrapper, {
      props: {
        label: 'Gift message',
        required: true,
        help: 'Printed on a card inside the parcel.',
        error: 'Write a message before adding the card.',
      },
      slots: { default: h(Textarea, { modelValue: '' }) },
    });
    const control = wrapper.find('textarea').element as HTMLTextAreaElement;
    const errorId = wrapper.find('[data-part="error"]').attributes('id');
    const helpId = wrapper.find('[data-part="help"]').attributes('id');

    expect(wrapper.find('[data-part="label"]').attributes('for')).toBe(control.id);
    expect(control.getAttribute('aria-describedby')).toBe(`${errorId} ${helpId}`);
    expect(control.getAttribute('aria-invalid')).toBe('true');
    expect(control.required).toBe(true);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('lets an explicit prop on the control win over the wrapper', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Phone', error: 'Enter at least 10 digits.' },
      slots: { default: h(Input, { invalid: false, id: 'own-id' }) },
    });
    const input = wrapper.find('input').element as HTMLInputElement;
    expect(input.id).toBe('own-id');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    wrapper.unmount();
  });

  it('names a search field clear button per field through the messages provider', () => {
    const Host = defineComponent({
      setup() {
        provideEldraUiMessages({ clear: 'Clear search' });
        return () =>
          h(
            FieldWrapper,
            { label: 'Search' },
            { default: () => h(Input, { type: 'search', modelValue: 'mug' }) }
          );
      },
    });
    const wrapper = mountWith(Host);
    expect(wrapper.find('[data-part="clearButton"]').attributes('aria-label')).toBe('Clear search');
    wrapper.unmount();
  });
});

describe('FieldWrapper — content, accessibility and narrow containers', () => {
  it('has no axe violations in its default, required, optional, help and counter states', async () => {
    const wrapper = mountWith(FieldWrapper, {
      props: {
        label: 'Monogram',
        optional: true,
        help: 'Up to 3 letters, stitched on the cuff.',
        counter: { max: 3, value: 2 },
      },
      slots: { default: h(Input, { modelValue: 'MH' }) },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('renders twice the example length without throwing', () => {
    const long = 'Enter a phone number with at least 10 digits. '.repeat(4);
    const wrapper = mountWith(FieldWrapper, {
      props: { label: `Phone number for delivery updates ${long}`, error: long, help: long },
      slots: { default: CONTROL },
    });
    expect(wrapper.find('[data-part="error"]').text()).toContain('at least 10 digits');
    wrapper.unmount();
  });

  it('renders in a 20rem container with every part present', async () => {
    const wrapper = mountNarrow(FieldWrapper, {
      props: {
        label: 'Monogram',
        required: true,
        help: 'Up to 3 letters, stitched on the cuff.',
        counter: { max: 3, value: 2 },
      },
      slots: { default: h(Input, { modelValue: 'MH' }) },
    });
    expect(wrapper.find('[data-part="foot"]').exists()).toBe(true);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('provides a computed context that tracks a changing error', async () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Phone' },
      slots: { default: ContextProbe },
    });
    expect(probe(wrapper)['data-invalid']).toBe('false');
    await wrapper.setProps({ error: 'Enter at least 10 digits.' });
    expect(probe(wrapper)['data-invalid']).toBe('true');
    expect(probe(wrapper)['data-described-by']).toBe(
      wrapper.find('[data-part="error"]').attributes('id')
    );
    wrapper.unmount();
  });

  it('exposes the same context shape the controls type against', () => {
    const wrapper = mountWith(FieldWrapper, {
      props: { label: 'Phone', required: true },
      slots: { default: ContextProbe },
    });
    const context: FieldContext = {
      id: probe(wrapper)['data-id'] as string,
      invalid: false,
      required: true,
    };
    expect(context.required).toBe(true);
    wrapper.unmount();
  });
});
