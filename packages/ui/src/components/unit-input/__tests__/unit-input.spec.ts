import { IconRuler2 } from '@tabler/icons-vue';
import { afterEach, describe, expect, it } from 'vitest';
import { computed, defineComponent, nextTick, ref, type Ref } from 'vue';
import { LOCALE_KEY } from '../../../composables/useLocale';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { FIELD_KEY, type FieldContext } from '../../field-wrapper/context';
import UnitInput from '../UnitInput.vue';
import type { UnitInputProps } from '../types';

/**
 * `UnitInput` is a one-to-one port of the private library's own component, so this file is the
 * private spec's cases first — same names, same assertions, translated to this package's
 * conventions (`data-part`, the English `Clear` label, `mountWith`) — followed by the package
 * conventions the private component has no equivalent of: the field context, the shared field
 * recipe, `is-IS`, axe per state and the form value.
 */

/** Every mount needs an accessible name; a `FieldWrapper` or the `label` prop supplies one really. */
const NAME = { 'aria-label': 'Distance' };

/** The non-breaking space ICU puts between an Icelandic amount and its currency. */
const NBSP = ' ';

function mount(props: Partial<UnitInputProps> = {}) {
  return mountWith(UnitInput, { props: { unit: 'kilometer', ...props }, attrs: NAME });
}

function control(wrapper: { find: (s: string) => { element: Element } }): HTMLInputElement {
  return wrapper.find('[data-part="control"]').element as HTMLInputElement;
}

/**
 * The control inside a parent that actually holds the value. A plain `modelValue` prop is never
 * written back, so the control stays pinned at what it was given — right for testing what it
 * renders, useless for testing what it does after an edit. These get the real round trip.
 */
function mountModel(props: Partial<UnitInputProps> = {}, initial: number | null = null) {
  const value: Ref<number | null> = ref(initial);
  const host = mountWith(
    defineComponent({
      components: { UnitInput },
      setup: () => ({ value, bound: props }),
      template: `<UnitInput v-bind="bound" v-model="value" aria-label="Distance" />`,
    })
  );
  return { host, value, field: () => host.find('[data-part="control"]') };
}

/** A parent that clamps what the control writes — the controlled case the reconciliation is for. */
function mountClamping(props: Partial<UnitInputProps>, initial: number, max: number) {
  const raw = ref(initial);
  const host = mountWith(
    defineComponent({
      components: { UnitInput },
      setup() {
        const value = computed({
          get: () => raw.value,
          set: (next: number | null) => {
            raw.value = Math.min(next ?? 0, max);
          },
        });
        return { value, bound: props };
      },
      template: `<UnitInput v-bind="bound" v-model="value" aria-label="Distance" />`,
    })
  );
  return { host, raw, field: () => host.find('[data-part="control"]') };
}

/** Type into the field the way a browser does: set the value, put the caret, fire `input`. */
async function type(
  field: { element: Element; trigger: (event: string) => Promise<unknown> },
  text: string,
  caret = text.length
): Promise<void> {
  const element = field.element as HTMLInputElement;
  element.focus();
  element.value = text;
  element.setSelectionRange(caret, caret);
  await field.trigger('input');
  await nextTick();
  await nextTick();
}

/** The `setTimeout(0)` a focus, a click or an arrow key schedules to run after the browser's caret. */
function afterCaretTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

/** A stub `FieldWrapper` context, the same fixture `input.spec.ts` uses. */
function fieldProvider(context: Partial<FieldContext> = {}) {
  return {
    provide: {
      [FIELD_KEY as symbol]: computed<FieldContext>(() => ({
        id: 'field-distance',
        labelId: 'field-distance-label',
        describedBy: 'field-distance-error field-distance-help',
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

// ─── The private spec, case for case ──────────────────────────────────────────────────────────

describe('UnitInput — rendering (ported)', () => {
  it('renders an input element', () => {
    const wrapper = mount();
    expect(wrapper.find('input').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders label when provided', () => {
    const wrapper = mount({ label: 'Distance' });
    expect(wrapper.find('label').text()).toContain('Distance');
    expect(wrapper.find('label').attributes('for')).toBe(control(wrapper).id);
    wrapper.unmount();
  });

  it('renders formatted placeholder when no value set', () => {
    const wrapper = mount({ unit: 'kilometer' });
    // The same format at zero, with both fraction digits spelled out.
    expect(control(wrapper).getAttribute('placeholder')).toBe('0.00 km');
    wrapper.unmount();
  });

  it('does not render a drag handle by default', () => {
    const wrapper = mount();
    expect(wrapper.find('[data-part="dragHandle"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders a drag handle when enableDragAdjust is true', () => {
    const wrapper = mount({ enableDragAdjust: true });
    const handle = wrapper.find('[data-part="dragHandle"]');
    expect(handle.exists()).toBe(true);
    // Pointer only: out of the accessible tree and out of the tab order.
    expect(handle.attributes('aria-hidden')).toBe('true');
    expect(handle.attributes('tabindex')).toBe('-1');
    wrapper.unmount();
  });

  it('renders a clear button when clearable and populated', async () => {
    const wrapper = mount({ modelValue: 5, clearable: true });
    await nextTick();
    expect(wrapper.find('button[aria-label="Clear"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('UnitInput — props (ported)', () => {
  it('formats initial modelValue as unit string', async () => {
    const wrapper = mount({ modelValue: 5, unit: 'kilometer' });
    await nextTick();
    expect(control(wrapper).value).toBe('5 km');
    wrapper.unmount();
  });

  it('renders explicit modelValue of 0 instead of treating it as empty', async () => {
    const wrapper = mount({ modelValue: 0, unit: 'percent' });
    await nextTick();
    expect(control(wrapper).value).toContain('0');
    wrapper.unmount();
  });

  it('formats numeric-string modelValue as a unit string', async () => {
    const wrapper = mount({ modelValue: '12.5', unit: 'kilometer' });
    await nextTick();
    expect(control(wrapper).value).toBe('12.5 km');
    wrapper.unmount();
  });

  it('disabled prop disables the input', () => {
    const wrapper = mount({ disabled: true });
    expect(control(wrapper).hasAttribute('disabled')).toBe(true);
    wrapper.unmount();
  });

  it('inputMode is decimal for numeric input', () => {
    const wrapper = mount();
    expect(control(wrapper).getAttribute('inputmode')).toBe('decimal');
    wrapper.unmount();
  });
});

describe('UnitInput — emits (ported)', () => {
  it('clears the numeric model to null and emits clear', async () => {
    const wrapper = mount({ modelValue: 5, clearable: true });
    await nextTick();

    await wrapper.find('button[aria-label="Clear"]').trigger('click');
    await nextTick();

    expect(wrapper.emitted('update:modelValue')).toContainEqual([null]);
    expect(wrapper.emitted('update:formattedValue')).toContainEqual(['']);
    expect(wrapper.emitted('clear')).toEqual([[]]);
    expect(control(wrapper).value).toBe('');
    wrapper.unmount();
  });

  it('emits update:formattedValue when initial modelValue is set', async () => {
    const wrapper = mount({ modelValue: 10, unit: 'kilometer' });
    await nextTick();
    expect(wrapper.emitted('update:formattedValue')).toContainEqual(['10 km']);
    wrapper.unmount();
  });

  it('reconciles the visible value when a controlled parent clamps to the previous value', async () => {
    const { host, raw, field } = mountClamping({ unit: 'percent' }, 100, 100);

    await type(field(), '150');

    expect((field().element as HTMLInputElement).value).toContain('100');
    expect(raw.value).toBe(100);
    host.unmount();
  });

  it('keeps the field empty while editing and falls back to 0 on blur', async () => {
    const { host, value, field } = mountModel({ unit: 'percent' }, 100);

    await type(field(), '');

    expect((field().element as HTMLInputElement).value).toBe('');
    expect(value.value).toBe(100);

    await field().trigger('blur');
    await nextTick();

    expect((field().element as HTMLInputElement).value).toContain('0');
    expect(value.value).toBe(0);
    host.unmount();
  });

  it('increments and decrements the numeric model with arrow keys', async () => {
    const { host, value, field } = mountModel({ unit: 'percent' }, 10);

    await field().trigger('keydown', { key: 'ArrowUp' });
    await nextTick();
    expect((field().element as HTMLInputElement).value).toContain('11');
    expect(value.value).toBe(11);

    await field().trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    expect((field().element as HTMLInputElement).value).toContain('10');
    expect(value.value).toBe(10);
    host.unmount();
  });

  it('uses the configured step for arrow-key stepping', async () => {
    const { host, value, field } = mountModel({ unit: 'percent', step: 5 }, 10);

    await field().trigger('keydown', { key: 'ArrowUp' });
    await nextTick();

    expect((field().element as HTMLInputElement).value).toContain('15');
    expect(value.value).toBe(15);
    host.unmount();
  });

  it('clamps arrow-key stepping to min and max', async () => {
    const { host, value, field } = mountModel({ unit: 'percent', min: 0, max: 2 }, 1);

    await field().trigger('keydown', { key: 'ArrowUp' });
    await field().trigger('keydown', { key: 'ArrowUp' });
    await nextTick();
    expect((field().element as HTMLInputElement).value).toContain('2');
    expect(value.value).toBe(2);

    await field().trigger('keydown', { key: 'ArrowDown' });
    await field().trigger('keydown', { key: 'ArrowDown' });
    await field().trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    expect((field().element as HTMLInputElement).value).toContain('0');
    expect(value.value).toBe(0);
    host.unmount();
  });

  it('steps from the empty fallback value while the field is visually cleared', async () => {
    const { host, value, field } = mountModel({ unit: 'percent' }, 100);

    await type(field(), '');
    await field().trigger('keydown', { key: 'ArrowUp' });
    await nextTick();

    expect((field().element as HTMLInputElement).value).toContain('1');
    expect(value.value).toBe(1);
    host.unmount();
  });

  it('updates the numeric value when dragging the suffix handle vertically', async () => {
    const { host, value, field } = mountModel(
      { unit: 'percent', step: 5, enableDragAdjust: true },
      10
    );
    const handle = host.find('[data-part="dragHandle"]');

    await handle.trigger('pointerdown', { clientY: 100, pointerId: 1 });
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 84, pointerId: 1 }));
    await nextTick();
    await nextTick();

    expect((field().element as HTMLInputElement).value).toContain('20');
    expect(value.value).toBe(20);

    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 116, pointerId: 1 }));
    await nextTick();
    await nextTick();

    expect((field().element as HTMLInputElement).value).toContain('0');
    expect(value.value).toBe(0);

    window.dispatchEvent(new PointerEvent('pointerup', { clientY: 116, pointerId: 1 }));
    host.unmount();
  });

  it('keeps the caret aligned when currency formatting inserts a group separator before it', async () => {
    const wrapper = mount({ isCurrency: true, currency: 'USD' });
    const element = control(wrapper);

    await type(wrapper.find('[data-part="control"]'), '1234', 3);

    expect(element.value).toBe('$1,234');
    expect(element.selectionStart).toBe(5);
    expect(element.selectionEnd).toBe(5);
    wrapper.unmount();
  });

  it('keeps the caret before the unit suffix after inserted group separators', async () => {
    const wrapper = mount({ unit: 'kilometer' });
    const element = control(wrapper);

    await type(wrapper.find('[data-part="control"]'), '1234', 3);

    expect(element.value).toBe('1,234 km');
    expect(element.selectionStart).toBe(4);
    expect(element.selectionEnd).toBe(4);
    wrapper.unmount();
  });
});

describe('UnitInput — accessibility (ported)', () => {
  it('has no axe violations (WCAG 2.2 AA)', async () => {
    const wrapper = mountWith(UnitInput, {
      props: { label: 'Distance', name: 'distance', unit: 'kilometer', enableDragAdjust: true },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('carries the focus ring on the field for keyboard users (2.4.13)', () => {
    const wrapper = mount();
    const classes = wrapper.find('[data-part="control"]').classes();
    expect(classes).toContain('eldra-focus');
    expect(classes).toContain('eldra-focus-always');
    wrapper.unmount();
  });
});

// ─── The package's own conventions ────────────────────────────────────────────────────────────

describe('UnitInput — live formatting', () => {
  it('formats while typing, never on blur, in both directions of symbol', async () => {
    const wrapper = mount({ isCurrency: true, currency: 'USD' });
    const field = wrapper.find('[data-part="control"]');

    await type(field, '9');
    expect(control(wrapper).value).toBe('$9');
    await type(field, '$98');
    expect(control(wrapper).value).toBe('$98');
    await type(field, '$9876');
    expect(control(wrapper).value).toBe('$9,876');
    // Still formatted with the field focused — there is no editing text.
    expect(document.activeElement).toBe(control(wrapper));
    wrapper.unmount();
  });

  it('formats an Icelandic amount with the locale’s own separators and symbol', async () => {
    const wrapper = mount({ isCurrency: true, currency: 'ISK', locale: 'is-IS' });

    await type(wrapper.find('[data-part="control"]'), '1234');

    expect(control(wrapper).value).toBe(`1.234${NBSP}kr.`);
    wrapper.unmount();
  });

  it('takes the locale from provideEldraUiLocale when the prop says nothing', async () => {
    const wrapper = mountWith(UnitInput, {
      props: { isCurrency: true, currency: 'ISK' },
      attrs: NAME,
      global: { provide: { [LOCALE_KEY as symbol]: 'is-IS' } },
    });

    await type(wrapper.find('[data-part="control"]'), '1234');

    expect(control(wrapper).value).toBe(`1.234${NBSP}kr.`);
    wrapper.unmount();
  });

  it('keeps a typed decimal separator visible inside the number, before any suffix', async () => {
    const wrapper = mount({ unit: 'kilometer' });

    await type(wrapper.find('[data-part="control"]'), '12.');

    // `Intl` drops a fraction that has not been typed yet; it is put back where it was typed.
    expect(control(wrapper).value).toBe('12. km');
    wrapper.unmount();
  });

  it('refuses a value above max, keeping the text the field had', async () => {
    const wrapper = mount({ unit: 'percent', max: 100 });
    const field = wrapper.find('[data-part="control"]');

    await type(field, '99');
    expect(control(wrapper).value).toBe('99%');

    await type(field, '999');
    expect(control(wrapper).value).toBe('99%');
    wrapper.unmount();
  });

  it('strips a non-numeric keystroke on the reformat rather than blocking it', async () => {
    // The opposite of `QuantityStepper`, which refuses the keystroke at `beforeinput`: this field's
    // own text is full of non-numeric characters, so the reformat is what decides.
    const wrapper = mount({ unit: 'kilometer' });

    await type(wrapper.find('[data-part="control"]'), '12a3');

    expect(control(wrapper).value).toBe('123 km');
    wrapper.unmount();
  });

  it('empties the field for text with no digits at all, without touching the model', async () => {
    const { host, value, field } = mountModel({ unit: 'kilometer' }, 12);

    await type(field(), 'abc');

    expect((field().element as HTMLInputElement).value).toBe('');
    expect(value.value).toBe(12);
    host.unmount();
  });

  it('reformats what is in the field when the locale changes', async () => {
    const wrapper = mount({ isCurrency: true, currency: 'USD', modelValue: 1234.5 });
    await nextTick();
    expect(control(wrapper).value).toBe('$1,234.5');

    await wrapper.setProps({ locale: 'is-IS', currency: 'ISK' });
    await nextTick();

    expect(control(wrapper).value).toBe(`1.234,5${NBSP}kr.`);
    wrapper.unmount();
  });
});

describe('UnitInput — the caret', () => {
  it('moves the caret out of a leading symbol on click', async () => {
    const wrapper = mount({ isCurrency: true, currency: 'USD', modelValue: 1234 });
    await nextTick();
    const element = control(wrapper);
    element.focus();
    element.setSelectionRange(0, 0);

    await wrapper.find('[data-part="control"]').trigger('click');

    expect(element.selectionStart).toBe(1);
    wrapper.unmount();
  });

  it('moves the caret out of a trailing symbol on focus', async () => {
    const wrapper = mount({ unit: 'kilometer', modelValue: 1234 });
    await nextTick();
    const element = control(wrapper);
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);

    await wrapper.find('[data-part="control"]').trigger('focus');
    await afterCaretTick();

    // "1,234 km" — after the last digit, before the space.
    expect(element.selectionStart).toBe(5);
    wrapper.unmount();
  });

  it('selects only the digits on double click and on Ctrl+A', async () => {
    const wrapper = mount({ isCurrency: true, currency: 'USD', modelValue: 1234 });
    await nextTick();
    const element = control(wrapper);
    element.focus();

    await wrapper.find('[data-part="control"]').trigger('dblclick');
    expect([element.selectionStart, element.selectionEnd]).toEqual([1, 6]);

    element.setSelectionRange(0, 0);
    await wrapper.find('[data-part="control"]').trigger('keydown', { key: 'a', ctrlKey: true });
    expect([element.selectionStart, element.selectionEnd]).toEqual([1, 6]);
    wrapper.unmount();
  });

  it('skips the group separator with ArrowLeft', async () => {
    const wrapper = mount({ unit: 'kilometer', modelValue: 1234 });
    await nextTick();
    const element = control(wrapper);
    element.focus();
    // "1,234 km", caret between the 2 and the 3. `keydown` fires before the browser moves it, so
    // the handler reads 3 and puts the caret two back — past the separator the browser would have
    // stopped on, which is the whole point.
    element.setSelectionRange(3, 3);

    await wrapper.find('[data-part="control"]').trigger('keydown', { key: 'ArrowLeft' });
    await afterCaretTick();

    expect(element.selectionStart).toBe(1);
    wrapper.unmount();
  });

  it('never lets Backspace delete a leading symbol', async () => {
    const wrapper = mount({ isCurrency: true, currency: 'USD', modelValue: 1234 });
    await nextTick();
    const element = control(wrapper);
    element.focus();
    element.setSelectionRange(1, 1);

    const event = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });
    element.dispatchEvent(event);
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(element.selectionStart).toBe(1);
    wrapper.unmount();
  });

  it('never lets Delete eat a trailing symbol', async () => {
    const wrapper = mount({ unit: 'kilometer', modelValue: 1234 });
    await nextTick();
    const element = control(wrapper);
    element.focus();
    // "1,234 km" — the caret sits after the last digit, with only " km" to its right.
    element.setSelectionRange(5, 5);

    const event = new KeyboardEvent('keydown', { key: 'Delete', cancelable: true });
    element.dispatchEvent(event);
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    wrapper.unmount();
  });
});

describe('UnitInput — the decimal separator', () => {
  it('inserts the locale’s decimal separator whichever of , and . was pressed', async () => {
    const wrapper = mount({ unit: 'kilometer', modelValue: 12 });
    await nextTick();
    const element = control(wrapper);
    element.focus();
    element.setSelectionRange(2, 2);

    const event = new KeyboardEvent('keydown', { key: ',', cancelable: true });
    element.dispatchEvent(event);
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted('update:formattedValue')?.at(-1)).toEqual(['12. km']);
    wrapper.unmount();
  });

  it('refuses a second decimal separator', async () => {
    const wrapper = mount({ unit: 'kilometer', modelValue: 12.5 });
    await nextTick();
    const element = control(wrapper);
    element.focus();
    element.setSelectionRange(4, 4);

    const event = new KeyboardEvent('keydown', { key: '.', cancelable: true });
    element.dispatchEvent(event);
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it('takes , as the decimal separator under is-IS', async () => {
    const wrapper = mount({ unit: 'kilometer', locale: 'is-IS' });

    await type(wrapper.find('[data-part="control"]'), '12,5');

    expect(control(wrapper).value).toBe('12,5 km');
    wrapper.unmount();
  });
});

describe('UnitInput — undo and redo', () => {
  it('puts back the previous text on Ctrl+Z and takes it away again on Ctrl+Shift+Z', async () => {
    const wrapper = mount({ unit: 'kilometer' });
    const field = wrapper.find('[data-part="control"]');
    const element = control(wrapper);

    await field.trigger('keydown', { key: '1' });
    await type(field, '1');
    // The undo entry is recorded 2 ms after the keystroke, once the reformat has happened.
    await new Promise((resolve) => setTimeout(resolve, 5));

    await field.trigger('keydown', { key: '2' });
    await type(field, '1 km2');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(element.value).toBe('12 km');

    await field.trigger('keydown', { key: 'z', ctrlKey: true });
    await nextTick();
    expect(element.value).toBe('1 km');

    await field.trigger('keydown', { key: 'Z', ctrlKey: true, shiftKey: true });
    await nextTick();
    expect(element.value).toBe('12 km');
    wrapper.unmount();
  });
});

describe('UnitInput — read-only and disabled', () => {
  it('edits nothing and shows no clear button or drag handle when read-only', async () => {
    const wrapper = mount({
      unit: 'kilometer',
      modelValue: 12,
      readonly: true,
      clearable: true,
      enableDragAdjust: true,
    });
    await nextTick();
    const field = wrapper.find('[data-part="control"]');

    expect(control(wrapper).hasAttribute('readonly')).toBe(true);
    expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="dragHandle"]').exists()).toBe(false);

    // A browser lets neither of these reach a read-only field; dispatched directly, both are
    // refused here as well, and the value the control was given is still the one it holds.
    await type(field, '999');
    await field.trigger('keydown', { key: 'ArrowUp' });
    await nextTick();

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('update:formattedValue')).toEqual([['12 km']]);
    wrapper.unmount();
  });

  it('edits nothing when disabled', async () => {
    const wrapper = mount({ unit: 'kilometer', modelValue: 12, disabled: true, clearable: true });
    await nextTick();

    await wrapper.find('[data-part="control"]').trigger('keydown', { key: 'ArrowUp' });
    await nextTick();

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.find('[data-part="clearButton"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not drag-adjust a disabled field', async () => {
    const wrapper = mount({ unit: 'kilometer', modelValue: 12, enableDragAdjust: true });
    await nextTick();
    await wrapper.setProps({ disabled: true });
    await nextTick();
    expect(wrapper.find('[data-part="dragHandle"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('UnitInput — the field wrapper', () => {
  it('takes its id, describedBy, invalid and required from the context', () => {
    const wrapper = mountWith(UnitInput, {
      props: { unit: 'kilometer' },
      attrs: NAME,
      global: fieldProvider(),
    });
    const element = control(wrapper);

    expect(element.id).toBe('field-distance');
    expect(element.getAttribute('aria-describedby')).toBe(
      'field-distance-error field-distance-help'
    );
    expect(element.getAttribute('aria-invalid')).toBe('true');
    expect(element.hasAttribute('required')).toBe(true);
    wrapper.unmount();
  });

  it('composes describedBy, own ids first', () => {
    const wrapper = mountWith(UnitInput, {
      props: { unit: 'kilometer', describedBy: 'own-hint' },
      attrs: NAME,
      global: fieldProvider(),
    });
    expect(control(wrapper).getAttribute('aria-describedby')).toBe(
      'own-hint field-distance-error field-distance-help'
    );
    wrapper.unmount();
  });

  it('does not draw its own label when the wrapper labels the control', () => {
    const wrapper = mountWith(UnitInput, {
      props: { unit: 'kilometer', label: 'Distance' },
      attrs: NAME,
      global: fieldProvider(),
    });
    expect(wrapper.find('label').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not take the id of a group wrapper, which puts it on its own fieldset', () => {
    const wrapper = mountWith(UnitInput, {
      props: { unit: 'kilometer' },
      attrs: NAME,
      global: fieldProvider({ labelsControl: false }),
    });
    expect(control(wrapper).id).not.toBe('field-distance');
    wrapper.unmount();
  });

  it('draws the error boundary on the field, and drops it when disabled', async () => {
    const wrapper = mount({ unit: 'kilometer', invalid: true });
    expect(wrapper.find('[data-part="field"]').classes()).toContain('eldra-field-invalid');

    await wrapper.setProps({ disabled: true });
    expect(wrapper.find('[data-part="field"]').classes()).not.toContain('eldra-field-invalid');
    // `aria-invalid` stays: the field is still invalid, it just cannot be fixed here.
    expect(control(wrapper).getAttribute('aria-invalid')).toBe('true');
    wrapper.unmount();
  });
});

describe('UnitInput — the box is Input’s', () => {
  it('draws the same box as Input, rather than a copy of it', async () => {
    const { FIELD_BASE } = await import('../../input/classes');
    const wrapper = mount({ modelValue: 1 });
    const classes = wrapper.find('[data-part="control"]').classes();
    for (const token of FIELD_BASE.split(' ').filter(Boolean)) {
      expect(classes).toContain(token);
    }
    wrapper.unmount();
  });

  it('renders every part, and accepts a class override on each', () => {
    const wrapper = mountWith(UnitInput, {
      props: {
        unit: 'kilometer',
        modelValue: 12,
        label: 'Distance',
        clearable: true,
        enableDragAdjust: true,
        leadingIcon: IconRuler2,
        classes: {
          root: 'ring-1',
          label: 'uppercase',
          field: 'opacity-90',
          leadingIcon: 'text-danger',
          control: 'font-mono',
          suffix: 'gap-2',
          dragHandle: 'text-danger',
          clearButton: 'rounded-none',
        },
      },
    });

    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.classes()).toContain('ring-1');
    expect(wrapper.find('[data-part="label"]').classes()).toContain('uppercase');
    expect(wrapper.find('[data-part="field"]').classes()).toContain('opacity-90');
    expect(wrapper.find('[data-part="leadingIcon"]').classes()).toContain('text-danger');
    expect(wrapper.find('[data-part="control"]').classes()).toContain('font-mono');
    expect(wrapper.find('[data-part="suffix"]').classes()).toContain('gap-2');
    expect(wrapper.find('[data-part="dragHandle"]').classes()).toContain('text-danger');
    expect(wrapper.find('[data-part="clearButton"]').classes()).toContain('rounded-none');
    wrapper.unmount();
  });
});

describe('UnitInput — the form value', () => {
  it('posts the raw number through a hidden input, never the locale string', async () => {
    const wrapper = mount({
      unit: 'kilometer',
      locale: 'is-IS',
      name: 'distance',
      modelValue: 1234.5,
    });
    await nextTick();

    const hidden = wrapper.find('input[type="hidden"]').element as HTMLInputElement;
    expect(hidden.name).toBe('distance');
    expect(hidden.value).toBe('1234.5');
    expect(control(wrapper).value).toBe('1.234,5 km');
    expect(control(wrapper).hasAttribute('name')).toBe(false);
    wrapper.unmount();
  });

  it('posts nothing without a name', () => {
    const wrapper = mount({ unit: 'kilometer', modelValue: 12 });
    expect(wrapper.find('input[type="hidden"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('UnitInput — formatValue', () => {
  it('exposes the field’s own formatter', async () => {
    const wrapper = mount({ isCurrency: true, currency: 'USD' });
    const exposed = wrapper.vm as unknown as { formatValue: (value: number) => string };
    expect(exposed.formatValue(1234.5)).toBe('$1,234.5');
    wrapper.unmount();
  });
});

describe('UnitInput — accessibility', () => {
  const STATES: Array<[string, Partial<UnitInputProps>]> = [
    ['default', {}],
    ['invalid', { invalid: true }],
    ['disabled', { disabled: true }],
    ['read-only', { readonly: true, modelValue: 12 }],
    ['currency', { isCurrency: true, currency: 'USD', modelValue: 1234.5 }],
    ['currency in is-IS', { isCurrency: true, currency: 'ISK', locale: 'is-IS', modelValue: 1234 }],
    ['clearable', { clearable: true, modelValue: 12 }],
    ['with a drag handle', { enableDragAdjust: true, modelValue: 12 }],
  ];

  it.each(STATES)('has no axe violations: %s', async (_name, props) => {
    const wrapper = mount(props);
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations in a narrow container', async () => {
    const wrapper = mountNarrow(UnitInput, {
      props: { unit: 'kilometer', modelValue: 1234567.89, clearable: true },
      attrs: NAME,
    });
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
