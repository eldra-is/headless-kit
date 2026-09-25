import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { FIELD_KEY, type FieldContext } from '../../field-wrapper/context';
import * as supportsFieldSizingModule from '../supportsFieldSizing';
import Textarea from '../Textarea.vue';

/** Every mount needs an accessible name; a FieldWrapper supplies one in real use. */
const NAME = { 'aria-label': 'Gift message' };

/** Twice the length of a plausible example answer. */
const LONG_VALUE =
  'Happy birthday, Anna! Something warm for the long winter — wrap up, stay cosy, and know we are '.repeat(
    3
  );

function control(wrapper: { find: (s: string) => { element: Element } }): HTMLTextAreaElement {
  return wrapper.find('[data-part="control"]').element as HTMLTextAreaElement;
}

/** A stub FieldWrapper: exactly what Task 7 will provide. */
function fieldProvider(context: Partial<FieldContext> = {}) {
  return {
    provide: {
      [FIELD_KEY as symbol]: computed<FieldContext>(() => ({
        id: 'field-message',
        describedBy: 'field-message-error field-message-help',
        invalid: true,
        required: true,
        ...context,
      })),
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Textarea — element and parts', () => {
  it('renders a native textarea inside a root wrapper', () => {
    const wrapper = mountWith(Textarea, { props: { modelValue: 'Happy birthday' }, attrs: NAME });
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(control(wrapper).tagName).toBe('TEXTAREA');
    wrapper.unmount();
  });

  it('renders no foot row with no counter', () => {
    const wrapper = mountWith(Textarea, { attrs: NAME });
    expect(wrapper.find('[data-part="foot"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="counter"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('puts fall-through attributes on the control, not on the wrapper', () => {
    const wrapper = mountWith(Textarea, { attrs: { ...NAME, 'data-testid': 'message' } });
    expect(wrapper.attributes('data-testid')).toBeUndefined();
    expect(control(wrapper).getAttribute('data-testid')).toBe('message');
    wrapper.unmount();
  });

  it('merges a per-part class override', () => {
    const wrapper = mountWith(Textarea, {
      props: { counter: true, maxLength: 10, modelValue: 'hi', classes: { root: 'mt-4' } },
      attrs: NAME,
    });
    expect(wrapper.classes()).toContain('mt-4');
    wrapper.unmount();
  });
});

describe('Textarea — value and v-model', () => {
  it('shows the model value', () => {
    const wrapper = mountWith(Textarea, { props: { modelValue: 'Happy birthday' }, attrs: NAME });
    expect(control(wrapper).value).toBe('Happy birthday');
    wrapper.unmount();
  });

  it('emits update:modelValue on every keystroke', async () => {
    const wrapper = mountWith(Textarea, { props: { modelValue: '' }, attrs: NAME });
    const el = control(wrapper);
    el.value = 'Happy';
    await wrapper.find('[data-part="control"]').trigger('input');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Happy']);
    wrapper.unmount();
  });

  it('round-trips through v-model', async () => {
    const wrapper = mountWith(Textarea, {
      props: {
        modelValue: '',
        'onUpdate:modelValue': (next: string) => wrapper.setProps({ modelValue: next }),
      },
      attrs: NAME,
    });
    const el = control(wrapper);
    el.value = 'Happy birthday';
    await wrapper.find('[data-part="control"]').trigger('input');
    expect(control(wrapper).value).toBe('Happy birthday');
    wrapper.unmount();
  });

  it('works uncontrolled, with no modelValue bound', async () => {
    const wrapper = mountWith(Textarea, { attrs: NAME });
    const el = control(wrapper);
    el.value = 'Happy birthday';
    await wrapper.find('[data-part="control"]').trigger('input');
    await nextTick();
    expect(control(wrapper).value).toBe('Happy birthday');
    wrapper.unmount();
  });

  it('emits change with the committed value', async () => {
    const wrapper = mountWith(Textarea, { props: { modelValue: '' }, attrs: NAME });
    const el = control(wrapper);
    el.value = 'Happy birthday';
    await wrapper.find('[data-part="control"]').trigger('change');
    expect(wrapper.emitted('change')?.at(-1)).toEqual(['Happy birthday']);
    wrapper.unmount();
  });
});

describe('Textarea — native attributes', () => {
  it('passes name and placeholder through', () => {
    const wrapper = mountWith(Textarea, {
      props: { name: 'message', placeholder: 'A short note for the card' },
      attrs: NAME,
    });
    const el = control(wrapper);
    expect(el.getAttribute('name')).toBe('message');
    expect(el.getAttribute('placeholder')).toBe('A short note for the card');
    wrapper.unmount();
  });

  it('sets required on the native control', () => {
    const wrapper = mountWith(Textarea, { props: { required: true }, attrs: NAME });
    expect(control(wrapper).required).toBe(true);
    wrapper.unmount();
  });

  it('generates a stable id, and uses the caller id when given', () => {
    const generated = mountWith(Textarea, { attrs: NAME });
    expect(control(generated).id).toMatch(/^eldra-textarea-/);
    generated.unmount();

    const explicit = mountWith(Textarea, { props: { id: 'gift-message' }, attrs: NAME });
    expect(control(explicit).id).toBe('gift-message');
    explicit.unmount();
  });

  it('never sets maxlength with counter alone', () => {
    const wrapper = mountWith(Textarea, {
      props: { counter: true, maxLength: 200, modelValue: 'hi' },
      attrs: NAME,
    });
    expect(control(wrapper).getAttribute('maxlength')).toBeNull();
    wrapper.unmount();
  });

  it('sets native maxlength only with hardLimit', () => {
    const wrapper = mountWith(Textarea, {
      props: { hardLimit: true, maxLength: 60 },
      attrs: NAME,
    });
    expect(control(wrapper).getAttribute('maxlength')).toBe('60');
    wrapper.unmount();
  });

  it('sets no maxlength with hardLimit but no maxLength', () => {
    const wrapper = mountWith(Textarea, { props: { hardLimit: true }, attrs: NAME });
    expect(control(wrapper).getAttribute('maxlength')).toBeNull();
    wrapper.unmount();
  });
});

describe('Textarea — sizing', () => {
  it('grows with field-sizing: content, and a resize handle stays vertical only', () => {
    const wrapper = mountWith(Textarea, { attrs: NAME });
    const classes = control(wrapper).className.split(/\s+/);
    expect(classes).toContain('field-sizing-content');
    expect(classes).toContain('resize-y');
    expect(classes).toContain('max-h-64');
    wrapper.unmount();
  });

  it('reads minHeight from a CSS variable, not a literal utility', () => {
    const wrapper = mountWith(Textarea, { props: { minHeight: '8rem' }, attrs: NAME });
    const el = control(wrapper);
    expect(el.className).toContain('min-h-[var(--eldra-textarea-min-height)]');
    expect(el.style.getPropertyValue('--eldra-textarea-min-height')).toBe('8rem');
    wrapper.unmount();
  });

  it('defaults minHeight to 5rem', () => {
    const wrapper = mountWith(Textarea, { attrs: NAME });
    expect(control(wrapper).style.getPropertyValue('--eldra-textarea-min-height')).toBe('5rem');
    wrapper.unmount();
  });

  it('grows the rows fallback with content when field-sizing is unsupported', async () => {
    vi.spyOn(supportsFieldSizingModule, 'supportsFieldSizing').mockReturnValue(false);

    const wrapper = mountWith(Textarea, { props: { modelValue: '' }, attrs: NAME });
    const el = control(wrapper);
    expect(el.getAttribute('rows')).toBe('3');

    Object.defineProperty(el, 'scrollHeight', { value: 200, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 60, configurable: true });
    el.value = 'a lot of text';
    await wrapper.find('[data-part="control"]').trigger('input');
    expect(el.getAttribute('rows')).toBe('10');

    wrapper.unmount();
    vi.restoreAllMocks();
  });

  it('leaves rows untouched when field-sizing is supported', () => {
    vi.spyOn(supportsFieldSizingModule, 'supportsFieldSizing').mockReturnValue(true);
    const wrapper = mountWith(Textarea, { attrs: NAME });
    expect(control(wrapper).getAttribute('rows')).toBeNull();
    wrapper.unmount();
    vi.restoreAllMocks();
  });
});

describe('Textarea — counter', () => {
  it('shows "n / max" with counter and maxLength both set', () => {
    const wrapper = mountWith(Textarea, {
      props: { counter: true, maxLength: 200, modelValue: 'Happy birthday, Anna!' },
      attrs: NAME,
    });
    expect(wrapper.find('[data-part="counter"]').text()).toBe('21 / 200');
    wrapper.unmount();
  });

  it('never renders a counter with maxLength but no counter prop', () => {
    const wrapper = mountWith(Textarea, { props: { maxLength: 200 }, attrs: NAME });
    expect(wrapper.find('[data-part="counter"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('never renders a counter with counter but no maxLength', () => {
    const wrapper = mountWith(Textarea, { props: { counter: true }, attrs: NAME });
    expect(wrapper.find('[data-part="counter"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('updates on every keystroke', async () => {
    const wrapper = mountWith(Textarea, {
      props: { counter: true, maxLength: 10 },
      attrs: NAME,
    });
    const el = control(wrapper);
    el.value = 'hello';
    await wrapper.find('[data-part="control"]').trigger('input');
    expect(wrapper.find('[data-part="counter"]').text()).toBe('5 / 10');
    wrapper.unmount();
  });

  it('is muted under the limit and danger weight 600 over it', () => {
    const under = mountWith(Textarea, {
      props: { counter: true, maxLength: 10, modelValue: 'short' },
      attrs: NAME,
    });
    const underClasses = under.find('[data-part="counter"]').classes();
    expect(underClasses).toContain('text-muted');
    expect(underClasses).not.toContain('text-danger');
    under.unmount();

    const over = mountWith(Textarea, {
      props: { counter: true, maxLength: 10, modelValue: 'this value is far over the limit' },
      attrs: NAME,
    });
    const overClasses = over.find('[data-part="counter"]').classes();
    expect(overClasses).toContain('text-danger');
    expect(overClasses).toContain('font-semibold');
    over.unmount();
  });

  it('allows typing past a soft limit', async () => {
    const wrapper = mountWith(Textarea, {
      props: { counter: true, maxLength: 5, modelValue: '' },
      attrs: NAME,
    });
    const el = control(wrapper);
    el.value = 'this is way past five characters';
    await wrapper.find('[data-part="control"]').trigger('input');
    expect(control(wrapper).value).toBe('this is way past five characters');
    wrapper.unmount();
  });

  it('wires the counter into aria-describedby', () => {
    const wrapper = mountWith(Textarea, {
      props: { counter: true, maxLength: 10, modelValue: 'hi', describedBy: 'field-help' },
      attrs: NAME,
    });
    const counterId = wrapper.find('[data-part="counter"]').attributes('id');
    expect(counterId).toBeTruthy();
    expect(control(wrapper).getAttribute('aria-describedby')).toBe(`field-help ${counterId}`);
    wrapper.unmount();
  });

  it('leaves aria-describedby untouched with no counter', () => {
    const wrapper = mountWith(Textarea, {
      props: { describedBy: 'field-help' },
      attrs: NAME,
    });
    expect(control(wrapper).getAttribute('aria-describedby')).toBe('field-help');
    wrapper.unmount();
  });

  it('has tabular numerals and never wraps', () => {
    const wrapper = mountWith(Textarea, {
      props: { counter: true, maxLength: 10, modelValue: 'hi' },
      attrs: NAME,
    });
    const classes = wrapper.find('[data-part="counter"]').classes();
    expect(classes).toContain('tabular-nums');
    expect(classes).toContain('whitespace-nowrap');
    wrapper.unmount();
  });
});

describe('Textarea — live region thresholds', () => {
  it('is aria-live off well under 90% of the limit', () => {
    const wrapper = mountWith(Textarea, {
      props: { counter: true, maxLength: 100, modelValue: 'x'.repeat(50) },
      attrs: NAME,
    });
    expect(wrapper.find('[data-part="counter"]').attributes('aria-live')).toBe('off');
    wrapper.unmount();
  });

  it('turns aria-live polite once the count reaches 90%', async () => {
    const wrapper = mountWith(Textarea, {
      props: { counter: true, maxLength: 100, modelValue: 'x'.repeat(89) },
      attrs: NAME,
    });
    expect(wrapper.find('[data-part="counter"]').attributes('aria-live')).toBe('off');

    await wrapper.setProps({ modelValue: 'x'.repeat(90) });
    expect(wrapper.find('[data-part="counter"]').attributes('aria-live')).toBe('polite');
    wrapper.unmount();
  });

  it('stays aria-live polite once the limit is passed', () => {
    const wrapper = mountWith(Textarea, {
      props: { counter: true, maxLength: 100, modelValue: 'x'.repeat(120) },
      attrs: NAME,
    });
    expect(wrapper.find('[data-part="counter"]').attributes('aria-live')).toBe('polite');
    wrapper.unmount();
  });

  it('carries a role of status, never announcing every keystroke below 90%', async () => {
    const wrapper = mountWith(Textarea, {
      props: { counter: true, maxLength: 100, modelValue: '' },
      attrs: NAME,
    });
    const counter = wrapper.find('[data-part="counter"]');
    expect(counter.attributes('role')).toBe('status');
    for (const value of ['a', 'ab', 'abc']) {
      await wrapper.setProps({ modelValue: value });
      expect(wrapper.find('[data-part="counter"]').attributes('aria-live')).toBe('off');
    }
    wrapper.unmount();
  });
});

describe('Textarea — states', () => {
  it('sets aria-invalid and the danger boundary when invalid', () => {
    const wrapper = mountWith(Textarea, { props: { invalid: true }, attrs: NAME });
    expect(control(wrapper).getAttribute('aria-invalid')).toBe('true');
    expect(control(wrapper).className).toContain('border-danger');
    expect(wrapper.classes()).toContain('eldra-field-invalid');
    wrapper.unmount();
  });

  it('sets no aria-invalid when valid', () => {
    const wrapper = mountWith(Textarea, { attrs: NAME });
    expect(control(wrapper).getAttribute('aria-invalid')).toBeNull();
    expect(wrapper.classes()).not.toContain('eldra-field-invalid');
    wrapper.unmount();
  });

  it('is disabled natively, with the dashed decorative border', () => {
    const wrapper = mountWith(Textarea, { props: { disabled: true }, attrs: NAME });
    const el = control(wrapper);
    expect(el.disabled).toBe(true);
    const classes = el.className.split(/\s+/);
    expect(classes).toContain('border-dashed');
    expect(classes).toContain('bg-surface-strong');
    expect(classes).toContain('cursor-not-allowed');
    wrapper.unmount();
  });

  it('skips a disabled field with Tab', () => {
    const wrapper = mountWith(Textarea, { props: { disabled: true }, attrs: NAME });
    control(wrapper).focus();
    expect(document.activeElement).not.toBe(control(wrapper));
    wrapper.unmount();
  });

  it('keeps a read-only field focusable and selectable', () => {
    const wrapper = mountWith(Textarea, {
      props: { readonly: true, modelValue: 'Happy birthday' },
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
    const wrapper = mountWith(Textarea, { attrs: NAME });
    const classes = control(wrapper).className.split(/\s+/);
    expect(classes).toContain('eldra-focus');
    expect(classes).toContain('eldra-focus-always');
    wrapper.unmount();
  });

  it('puts no transition utility beside the focus ring, which owns them', () => {
    const wrapper = mountWith(Textarea, { attrs: NAME });
    expect(control(wrapper).className).not.toMatch(/(?:^|\s)(transition|duration)-/);
    wrapper.unmount();
  });

  it('draws the hover and focus boundary in text, per the states table', () => {
    const wrapper = mountWith(Textarea, { attrs: NAME });
    const classes = control(wrapper).className;
    expect(classes).toContain('border-border-strong');
    expect(classes).toContain('hover:border-text');
    expect(classes).toContain('focus:border-text');
    wrapper.unmount();
  });

  it('draws the placeholder in muted', () => {
    const wrapper = mountWith(Textarea, {
      props: { placeholder: 'A short note for the card' },
      attrs: NAME,
    });
    expect(control(wrapper).className).toContain('placeholder:text-muted');
    wrapper.unmount();
  });
});

describe('Textarea — describedBy and the field context', () => {
  it('puts describedBy on aria-describedby', () => {
    const wrapper = mountWith(Textarea, {
      props: { describedBy: 'message-error message-help' },
      attrs: NAME,
    });
    expect(control(wrapper).getAttribute('aria-describedby')).toBe('message-error message-help');
    wrapper.unmount();
  });

  it('takes id, describedBy, invalid and required from a field wrapper', () => {
    const wrapper = mountWith(Textarea, { attrs: NAME, global: fieldProvider() });
    const el = control(wrapper);
    expect(el.id).toBe('field-message');
    expect(el.getAttribute('aria-describedby')).toBe('field-message-error field-message-help');
    expect(el.getAttribute('aria-invalid')).toBe('true');
    expect(el.required).toBe(true);
    wrapper.unmount();
  });

  it('lets an explicit prop win over the field wrapper', () => {
    const wrapper = mountWith(Textarea, {
      props: { id: 'own-id', describedBy: 'own-help', invalid: false, required: false },
      attrs: NAME,
      global: fieldProvider(),
    });
    const el = control(wrapper);
    expect(el.id).toBe('own-id');
    expect(el.getAttribute('aria-describedby')).toBe('own-help');
    expect(el.getAttribute('aria-invalid')).toBeNull();
    expect(el.required).toBe(false);
    wrapper.unmount();
  });

  it('follows the field context as it changes', async () => {
    const wrapper = mountWith(Textarea, {
      attrs: NAME,
      global: fieldProvider({ invalid: false }),
    });
    expect(control(wrapper).getAttribute('aria-invalid')).toBeNull();
    wrapper.unmount();
  });
});

describe('Textarea — content and layout', () => {
  it('renders long content without clipping the field', () => {
    const wrapper = mountWith(Textarea, { props: { modelValue: LONG_VALUE }, attrs: NAME });
    expect(control(wrapper).value).toBe(LONG_VALUE);
    expect(control(wrapper).className).toContain('w-full');
    wrapper.unmount();
  });

  it('renders in a narrow container, wrapping the foot row without breaking the counter', () => {
    const wrapper = mountNarrow(Textarea, {
      props: { counter: true, maxLength: 200, modelValue: 'Happy birthday, Anna!' },
      attrs: NAME,
    });
    const foot = wrapper.find('[data-part="foot"]');
    expect(foot.classes()).toContain('flex-wrap');
    expect(wrapper.find('[data-part="counter"]').classes()).toContain('whitespace-nowrap');
    expect(wrapper.classes()).toContain('w-full');
    wrapper.unmount();
  });
});

describe('Textarea — accessibility', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['default', {}],
    ['invalid', { invalid: true, describedBy: 'message-error' }],
    ['disabled', { disabled: true, modelValue: 'Happy birthday' }],
    ['read-only', { readonly: true, modelValue: 'Happy birthday' }],
    ['with a counter', { counter: true, maxLength: 200, modelValue: 'Happy birthday, Anna!' }],
    ['over the limit', { counter: true, maxLength: 5, modelValue: 'Happy birthday, Anna!' }],
  ];

  it.each(cases)('has no axe violations — %s', async (_name, props) => {
    const host = document.createElement('div');
    document.body.append(host);
    const wrapper = mountWith(Textarea, { props, attrs: NAME });
    const help = document.createElement('p');
    help.id = 'message-error';
    help.textContent = 'Keep the headline to 60 characters.';
    host.append(help);
    expect(await axe(document.body)).toHaveNoViolations();
    wrapper.unmount();
    host.remove();
  });

  it('has no axe violations inside a real label', async () => {
    const wrapper = mountWith(Textarea, { props: { id: 'message' }, attrs: {} });
    const label = document.createElement('label');
    label.htmlFor = 'message';
    label.textContent = 'Gift message';
    wrapper.element.before(label);
    expect(await axe(document.body)).toHaveNoViolations();
    wrapper.unmount();
  });
});
