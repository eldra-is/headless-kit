import { afterEach, describe, expect, it } from 'vitest';
import { computed, nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { FIELD_KEY, type FieldContext } from '../../field-wrapper/context';
import Checkbox from '../Checkbox.vue';
import CheckboxGroup from '../CheckboxGroup.vue';
import type { CheckboxGroupOption, CheckboxSize } from '../types';

const SIZES: CheckboxSize[] = ['md', 'lg'];

/** The spec's own vertical group ("Material"). */
const MATERIALS: CheckboxGroupOption[] = [
  { value: 'merino', label: 'Merino wool' },
  { value: 'cotton', label: 'Organic cotton' },
  { value: 'linen', label: 'Washed linen', hint: 'Pre-softened, will not shrink further' },
];

/** The spec's own row group ("Size"). */
const SIZE_OPTIONS: CheckboxGroupOption[] = ['XS', 'S', 'M', 'L', 'XL'].map((size) => ({
  value: size.toLowerCase(),
  label: size,
}));

/** Twice the length of the spec's own longest option label. */
const LONG_LABEL =
  'Email me about new arrivals, restocks of the things I have looked at, and the studio journal';

type Finder = { find: (selector: string) => { element: Element } };

function box(wrapper: Finder): HTMLElement {
  return wrapper.find('[data-part="box"]').element as HTMLElement;
}

function input(wrapper: Finder): HTMLInputElement {
  return wrapper.find('input[type="checkbox"]').element as HTMLInputElement;
}

/** A stub FieldWrapper, exactly what `FieldWrapper` provides. */
function fieldProvider(context: Partial<FieldContext> = {}) {
  return {
    provide: {
      [FIELD_KEY as symbol]: computed<FieldContext>(() => ({
        id: 'field-consent',
        describedBy: 'field-consent-error',
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

describe('Checkbox — element and parts', () => {
  it('is a label wrapping a native checkbox, with a data-part on every part', () => {
    const wrapper = mountWith(Checkbox, {
      props: { hint: 'Pre-softened, will not shrink further' },
      slots: { default: 'Washed linen' },
    });
    expect(wrapper.element.tagName).toBe('LABEL');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(input(wrapper).type).toBe('checkbox');
    expect(wrapper.find('[data-part="box"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="check"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="label"]').text()).toContain('Washed linen');
    expect(wrapper.find('[data-part="hint"]').text()).toBe('Pre-softened, will not shrink further');
    wrapper.unmount();
  });

  it('renders no hint row without one', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'Merino wool' } });
    expect(wrapper.find('[data-part="hint"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('takes the hint from a slot as well as from the prop', () => {
    const wrapper = mountWith(Checkbox, {
      slots: { default: 'Gift wrap', hint: '<em>Adds 2 days</em>' },
    });
    expect(wrapper.find('[data-part="hint"]').html()).toContain('<em>Adds 2 days</em>');
    wrapper.unmount();
  });

  it('hides the visually hidden input without taking it out of the tab order', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'Merino wool' } });
    const el = input(wrapper);
    expect(el.className.split(/\s+/)).toContain('sr-only');
    expect(el.getAttribute('tabindex')).toBeNull();
    el.focus();
    expect(document.activeElement).toBe(el);
    wrapper.unmount();
  });

  it('accepts a class override for every part', () => {
    const wrapper = mountWith(Checkbox, {
      props: {
        hint: 'Adds 2 days',
        classes: {
          root: 'ring-1',
          box: 'rounded-full',
          check: 'opacity-50',
          label: 'italic',
          hint: 'uppercase',
        },
      },
      slots: { default: 'Gift wrap' },
    });
    expect(wrapper.classes()).toContain('ring-1');
    expect(box(wrapper).className).toContain('rounded-full');
    expect(wrapper.find('[data-part="check"]').element.className).toContain('opacity-50');
    expect(wrapper.find('[data-part="label"]').element.className).toContain('italic');
    expect(wrapper.find('[data-part="hint"]').element.className).toContain('uppercase');
    wrapper.unmount();
  });
});

describe('Checkbox — value and v-model', () => {
  it('reflects modelValue onto the native checked state', () => {
    const wrapper = mountWith(Checkbox, {
      props: { modelValue: true },
      slots: { default: 'Merino wool' },
    });
    expect(input(wrapper).checked).toBe(true);
    wrapper.unmount();
  });

  it('emits update:modelValue and change when it is toggled', async () => {
    const wrapper = mountWith(Checkbox, {
      props: { modelValue: false },
      slots: { default: 'Merino wool' },
    });
    input(wrapper).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
    expect(wrapper.emitted('change')).toEqual([[true]]);
    wrapper.unmount();
  });

  it('emits false when a checked box is toggled off', async () => {
    const wrapper = mountWith(Checkbox, {
      props: { modelValue: true },
      slots: { default: 'Merino wool' },
    });
    input(wrapper).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(wrapper.emitted('change')).toEqual([[false]]);
    wrapper.unmount();
  });

  it('manages its own state with no v-model bound', async () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'Merino wool' } });
    expect(input(wrapper).checked).toBe(false);
    input(wrapper).click();
    await nextTick();
    expect(input(wrapper).checked).toBe(true);
    wrapper.unmount();
  });

  it('stays where the parent puts it when the parent refuses the change', async () => {
    const wrapper = mountWith(Checkbox, {
      props: { modelValue: false },
      slots: { default: 'Merino wool' },
    });
    input(wrapper).click();
    await nextTick();
    expect(input(wrapper).checked).toBe(false);
    wrapper.unmount();
  });

  it('carries the native name and value for a form post', () => {
    const wrapper = mountWith(Checkbox, {
      props: { name: 'material', value: 'merino' },
      slots: { default: 'Merino wool' },
    });
    expect(input(wrapper).name).toBe('material');
    expect(input(wrapper).value).toBe('merino');
    wrapper.unmount();
  });
});

describe('Checkbox — indeterminate', () => {
  it('sets the property on the element and exposes mixed', async () => {
    const wrapper = mountWith(Checkbox, {
      props: { indeterminate: true },
      slots: { default: 'All updates' },
    });
    await nextTick();
    expect(input(wrapper).indeterminate).toBe(true);
    expect(input(wrapper).getAttribute('aria-checked')).toBe('mixed');
    wrapper.unmount();
  });

  it('is off by default and says nothing about aria-checked', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'All updates' } });
    expect(input(wrapper).indeterminate).toBe(false);
    expect(input(wrapper).getAttribute('aria-checked')).toBeNull();
    wrapper.unmount();
  });

  it('follows the prop back off again', async () => {
    const wrapper = mountWith(Checkbox, {
      props: { indeterminate: true },
      slots: { default: 'All updates' },
    });
    await nextTick();
    await wrapper.setProps({ indeterminate: false });
    await nextTick();
    expect(input(wrapper).indeterminate).toBe(false);
    wrapper.unmount();
  });

  /**
   * Clicking a checkbox clears `indeterminate` in the browser. An indeterminate parent whose own
   * prop has not changed yet (the caller recomputes it from the children after the change) would
   * otherwise come back drawn as an ordinary checked box.
   */
  it('re-applies the property after the element has been toggled', async () => {
    const wrapper = mountWith(Checkbox, {
      props: { indeterminate: true, modelValue: false },
      slots: { default: 'All updates' },
    });
    await nextTick();
    input(wrapper).click();
    await nextTick();
    expect(input(wrapper).indeterminate).toBe(true);
    wrapper.unmount();
  });

  it('draws the dash rather than the tick', async () => {
    const wrapper = mountWith(Checkbox, {
      props: { indeterminate: true },
      slots: { default: 'All updates' },
    });
    await nextTick();
    expect(wrapper.find('[data-part="check"] [data-mark="dash"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="check"] [data-mark="tick"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('draws the tick when it is merely checked', () => {
    const wrapper = mountWith(Checkbox, {
      props: { modelValue: true },
      slots: { default: 'Merino wool' },
    });
    expect(wrapper.find('[data-part="check"] [data-mark="tick"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="check"] [data-mark="dash"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('names the children it controls', () => {
    const wrapper = mountWith(Checkbox, {
      props: { indeterminate: true, controls: 'opt-arrivals opt-journal opt-sales' },
      slots: { default: 'All updates' },
    });
    expect(input(wrapper).getAttribute('aria-controls')).toBe('opt-arrivals opt-journal opt-sales');
    wrapper.unmount();
  });

  it('sets no aria-controls without the prop', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'All updates' } });
    expect(input(wrapper).getAttribute('aria-controls')).toBeNull();
    wrapper.unmount();
  });
});

describe('Checkbox — pointer and keyboard', () => {
  it('toggles when the label text is clicked, because the label is the target', async () => {
    const wrapper = mountWith(Checkbox, {
      props: { modelValue: false },
      slots: { default: 'Merino wool' },
    });
    (wrapper.find('[data-part="label"]').element as HTMLElement).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
    wrapper.unmount();
  });

  it('toggles when the drawn box is clicked', async () => {
    const wrapper = mountWith(Checkbox, {
      props: { modelValue: false },
      slots: { default: 'Merino wool' },
    });
    box(wrapper).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
    wrapper.unmount();
  });

  /**
   * happy-dom does not run a checkbox's default activation behaviour, so "press Space, expect a
   * toggle" cannot fail here and would be a test of nothing. This asserts the *contract* that
   * gives the user that key for free — a real, enabled, focusable `<input type="checkbox">` with
   * nothing cancelling the key — which can fail the moment someone reaches for a key handler.
   */
  it('meets the native activation contract for Space', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'Merino wool' } });
    const el = input(wrapper);
    expect(el.tagName).toBe('INPUT');
    expect(el.type).toBe('checkbox');
    expect(el.disabled).toBe(false);
    expect(el.getAttribute('role')).toBeNull();
    el.focus();
    expect(document.activeElement).toBe(el);
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    el.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it('is its own tab stop', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'Merino wool' } });
    expect(input(wrapper).getAttribute('tabindex')).toBeNull();
    wrapper.unmount();
  });
});

describe('Checkbox — sizes', () => {
  it.each(SIZES)('draws the %s box at the spec size', (size) => {
    const wrapper = mountWith(Checkbox, { props: { size }, slots: { default: 'Merino wool' } });
    const classes = box(wrapper).className.split(/\s+/);
    expect(classes).toContain(size === 'md' ? 'size-4.5' : 'size-6');
    wrapper.unmount();
  });

  it('nudges the md box down onto the first text line and leaves lg top-aligned', () => {
    const md = mountWith(Checkbox, { props: { size: 'md' }, slots: { default: 'Merino wool' } });
    expect(box(md).className.split(/\s+/)).toContain('mt-0.75');
    md.unmount();
    const lg = mountWith(Checkbox, { props: { size: 'lg' }, slots: { default: 'Merino wool' } });
    expect(lg.find('[data-part="box"]').classes()).not.toContain('mt-0.75');
    lg.unmount();
  });

  it('defaults to md', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'Merino wool' } });
    expect(box(wrapper).className.split(/\s+/)).toContain('size-4.5');
    wrapper.unmount();
  });

  it('keeps the row at the minimum target height', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'M' } });
    expect(wrapper.classes()).toContain('target-min');
    wrapper.unmount();
  });
});

describe('Checkbox — states', () => {
  it('draws the unchecked box as a strong boundary on the page ground', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'Merino wool' } });
    const classes = box(wrapper).className.split(/\s+/);
    expect(classes).toContain('bg-background');
    expect(classes).toContain('border-border-strong');
    expect(classes).toContain('eldra-checkbox-border');
    wrapper.unmount();
  });

  it('fills the box with primary once checked', () => {
    const wrapper = mountWith(Checkbox, {
      props: { modelValue: true },
      slots: { default: 'Merino wool' },
    });
    const classes = box(wrapper).className.split(/\s+/);
    expect(classes).toContain('bg-primary');
    expect(classes).toContain('border-primary');
    wrapper.unmount();
  });

  it('fills the box the same way when indeterminate', async () => {
    const wrapper = mountWith(Checkbox, {
      props: { indeterminate: true },
      slots: { default: 'All updates' },
    });
    await nextTick();
    expect(box(wrapper).className.split(/\s+/)).toContain('bg-primary');
    wrapper.unmount();
  });

  it('shows the mark in primary-contrast, scaled in only once there is one', () => {
    const off = mountWith(Checkbox, { slots: { default: 'Merino wool' } });
    const offClasses = (off.find('[data-part="check"]').element as Element).className;
    expect(offClasses).toContain('scale-0');
    off.unmount();
    const on = mountWith(Checkbox, {
      props: { modelValue: true },
      slots: { default: 'Merino wool' },
    });
    const onClasses = (on.find('[data-part="check"]').element as Element).className.split(/\s+/);
    expect(onClasses).toContain('scale-100');
    expect(onClasses).toContain('text-primary-contrast');
    on.unmount();
  });

  it('grows the mark over duration-fast, which reduced motion zeroes', () => {
    const wrapper = mountWith(Checkbox, {
      props: { modelValue: true },
      slots: { default: 'Merino wool' },
    });
    const classes = (wrapper.find('[data-part="check"]').element as Element).className.split(/\s+/);
    expect(classes).toContain('transition-transform');
    expect(classes).toContain('duration-fast');
    wrapper.unmount();
  });

  it('sets aria-invalid and the 2px danger boundary when invalid', () => {
    const wrapper = mountWith(Checkbox, {
      props: { invalid: true },
      slots: { default: 'I agree to the terms of sale' },
    });
    expect(input(wrapper).getAttribute('aria-invalid')).toBe('true');
    const classes = box(wrapper).className.split(/\s+/);
    expect(classes).toContain('border-danger');
    expect(classes).toContain('eldra-checkbox-border-invalid');
    expect(classes).not.toContain('eldra-checkbox-border');
    wrapper.unmount();
  });

  it('sets no aria-invalid when valid', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'Merino wool' } });
    expect(input(wrapper).getAttribute('aria-invalid')).toBeNull();
    expect(box(wrapper).className.split(/\s+/)).not.toContain('border-danger');
    wrapper.unmount();
  });

  it('drops the danger boundary on a disabled box, and keeps aria-invalid', () => {
    const wrapper = mountWith(Checkbox, {
      props: { invalid: true, disabled: true },
      slots: { default: 'I agree to the terms of sale' },
    });
    expect(input(wrapper).getAttribute('aria-invalid')).toBe('true');
    const classes = box(wrapper).className.split(/\s+/);
    expect(classes).not.toContain('border-danger');
    expect(classes).toContain('border-dashed');
    wrapper.unmount();
  });

  it('is disabled natively, with the dashed decorative box and a muted label', () => {
    const wrapper = mountWith(Checkbox, {
      props: { disabled: true },
      slots: { default: 'Collect from the Bristol studio' },
    });
    const el = input(wrapper);
    expect(el.disabled).toBe(true);
    el.focus();
    expect(document.activeElement).not.toBe(el);
    const boxClasses = box(wrapper).className.split(/\s+/);
    expect(boxClasses).toContain('border-dashed');
    expect(boxClasses).toContain('bg-surface-strong');
    expect(wrapper.classes()).toContain('cursor-not-allowed');
    expect(wrapper.find('[data-part="label"]').classes()).toContain('text-muted');
    wrapper.unmount();
  });

  it('shows a disabled checked box as a solid muted fill with its tick', () => {
    const wrapper = mountWith(Checkbox, {
      props: { disabled: true, modelValue: true },
      slots: { default: 'Gift wrap this order' },
    });
    const classes = box(wrapper).className.split(/\s+/);
    expect(classes).toContain('bg-muted');
    expect(classes).toContain('border-muted');
    expect(classes).not.toContain('border-dashed');
    expect(wrapper.find('[data-part="check"] [data-mark="tick"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('sets native required', () => {
    const wrapper = mountWith(Checkbox, {
      props: { required: true },
      slots: { default: 'I agree to the terms of sale' },
    });
    expect(input(wrapper).required).toBe(true);
    wrapper.unmount();
  });
});

describe('Checkbox — the focus ring', () => {
  it('draws the ring on the box, which is what a keyboard user sees', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'Merino wool' } });
    const classes = box(wrapper).className.split(/\s+/);
    // `eldra-focus` carries the ring, its transition and the reduced-motion rule;
    // `eldra-focus-proxy` is what turns it on for the visually hidden input inside.
    expect(classes).toContain('eldra-focus');
    expect(classes).toContain('eldra-focus-proxy');
    wrapper.unmount();
  });

  it('puts no ring on the visually hidden input itself', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'Merino wool' } });
    expect(input(wrapper).className).not.toContain('eldra-focus');
    wrapper.unmount();
  });

  it('adds no transition utility beside the ring', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'Merino wool' } });
    expect(box(wrapper).className).not.toMatch(/(^|\s)(\S+:)*(transition|duration)-/);
    wrapper.unmount();
  });
});

describe('Checkbox — describedBy and the field context', () => {
  it('links an error message given by prop', () => {
    const wrapper = mountWith(Checkbox, {
      props: { describedBy: 'consent-error', invalid: true },
      slots: { default: 'I agree to the terms of sale' },
    });
    expect(input(wrapper).getAttribute('aria-describedby')).toBe('consent-error');
    wrapper.unmount();
  });

  it('takes id, describedBy, invalid and required from the field context', () => {
    const wrapper = mountWith(Checkbox, {
      slots: { default: 'I agree to the terms of sale' },
      global: fieldProvider(),
    });
    const el = input(wrapper);
    expect(el.id).toBe('field-consent');
    expect(el.getAttribute('aria-describedby')).toBe('field-consent-error');
    expect(el.getAttribute('aria-invalid')).toBe('true');
    expect(el.required).toBe(true);
    wrapper.unmount();
  });

  it('lets its own props win over the field context', () => {
    const wrapper = mountWith(Checkbox, {
      props: { id: 'own-id', invalid: false, required: false, describedBy: 'own-help' },
      slots: { default: 'I agree to the terms of sale' },
      global: fieldProvider(),
    });
    const el = input(wrapper);
    expect(el.id).toBe('own-id');
    expect(el.getAttribute('aria-invalid')).toBeNull();
    expect(el.required).toBe(false);
    expect(el.getAttribute('aria-describedby')).toBe('own-help');
    wrapper.unmount();
  });

  it('generates an id when nothing supplies one', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: 'Merino wool' } });
    expect(input(wrapper).id).toMatch(/^eldra-checkbox-/);
    wrapper.unmount();
  });
});

describe('Checkbox — content and layout', () => {
  it('renders a long label without clipping it', () => {
    const wrapper = mountWith(Checkbox, { slots: { default: LONG_LABEL } });
    expect(wrapper.find('[data-part="label"]').text()).toBe(LONG_LABEL);
    expect(box(wrapper).className.split(/\s+/)).toContain('shrink-0');
    wrapper.unmount();
  });

  it('renders in a 20rem container', () => {
    const wrapper = mountNarrow(Checkbox, {
      props: { hint: 'Pre-softened, will not shrink further' },
      slots: { default: LONG_LABEL },
    });
    expect(wrapper.find('[data-part="hint"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('Checkbox — accessibility', () => {
  it.each([
    ['default', {}],
    ['checked', { modelValue: true }],
    ['indeterminate', { indeterminate: true }],
    ['with a hint', { hint: 'Pre-softened, will not shrink further' }],
    ['large', { size: 'lg' as const }],
    ['invalid', { invalid: true, describedBy: 'consent-error' }],
    ['disabled', { disabled: true }],
    ['required', { required: true }],
  ])('has no axe violations: %s', async (_name, props) => {
    const wrapper = mountWith(Checkbox, { props, slots: { default: 'Merino wool' } });
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  /** The spec's "Indeterminate parent" variant, whose `aria-controls` has to resolve to real ids. */
  it('has no axe violations as a parent naming its children', async () => {
    const wrapper = mountWith({
      components: { Checkbox },
      template: `
        <div>
          <Checkbox indeterminate controls="opt-arrivals opt-journal">All updates</Checkbox>
          <Checkbox id="opt-arrivals" :model-value="true">New arrivals</Checkbox>
          <Checkbox id="opt-journal">Studio journal</Checkbox>
        </div>
      `,
    });
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('CheckboxGroup — element and parts', () => {
  it('is a fieldset with a legend, its options and a data-part on every part', () => {
    const wrapper = mountWith(CheckboxGroup, {
      props: { legend: 'Material', options: MATERIALS, error: 'Choose at least one material.' },
    });
    expect(wrapper.element.tagName).toBe('FIELDSET');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.find('legend').attributes('data-part')).toBe('legend');
    expect(wrapper.find('legend').text()).toBe('Material');
    expect(wrapper.find('[data-part="options"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="error"]').text()).toContain('Choose at least one material.');
    wrapper.unmount();
  });

  it('renders one checkbox per option, with its label and hint', () => {
    const wrapper = mountWith(CheckboxGroup, { props: { legend: 'Material', options: MATERIALS } });
    const boxes = wrapper.findAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(3);
    expect(wrapper.findAll('[data-part="hint"]')).toHaveLength(1);
    expect(wrapper.text()).toContain('Washed linen');
    wrapper.unmount();
  });

  it('renders no error row without one', () => {
    const wrapper = mountWith(CheckboxGroup, { props: { legend: 'Material', options: MATERIALS } });
    expect(wrapper.find('[data-part="error"]').exists()).toBe(false);
    expect(wrapper.attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.attributes('aria-describedby')).toBeUndefined();
    wrapper.unmount();
  });

  it('gives every option the group name and its own value', () => {
    const wrapper = mountWith(CheckboxGroup, {
      props: { legend: 'Material', options: MATERIALS, name: 'material' },
    });
    const inputs = wrapper.findAll('input[type="checkbox"]');
    expect(inputs.map((i) => (i.element as HTMLInputElement).name)).toEqual([
      'material',
      'material',
      'material',
    ]);
    expect(inputs.map((i) => (i.element as HTMLInputElement).value)).toEqual([
      'merino',
      'cotton',
      'linen',
    ]);
    wrapper.unmount();
  });

  it('disables only the options that say so', () => {
    const wrapper = mountWith(CheckboxGroup, {
      props: {
        legend: 'Size',
        options: [
          { value: 'xs', label: 'XS' },
          { value: 's', label: 'S', disabled: true },
        ],
      },
    });
    const inputs = wrapper.findAll('input[type="checkbox"]');
    expect((inputs[0].element as HTMLInputElement).disabled).toBe(false);
    expect((inputs[1].element as HTMLInputElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('accepts a class override for every part', () => {
    const wrapper = mountWith(CheckboxGroup, {
      props: {
        legend: 'Material',
        options: MATERIALS,
        error: 'Choose at least one material.',
        classes: { root: 'ring-1', legend: 'italic', options: 'gap-8', error: 'uppercase' },
      },
    });
    expect(wrapper.classes()).toContain('ring-1');
    expect(wrapper.find('legend').classes()).toContain('italic');
    expect(wrapper.find('[data-part="options"]').classes()).toContain('gap-8');
    expect(wrapper.find('[data-part="error"]').classes()).toContain('uppercase');
    wrapper.unmount();
  });
});

describe('CheckboxGroup — value', () => {
  it('checks the options whose value is in the array', () => {
    const wrapper = mountWith(CheckboxGroup, {
      props: { legend: 'Material', options: MATERIALS, modelValue: ['merino', 'linen'] },
    });
    const checked = wrapper
      .findAll('input[type="checkbox"]')
      .map((i) => (i.element as HTMLInputElement).checked);
    expect(checked).toEqual([true, false, true]);
    wrapper.unmount();
  });

  it('adds a value when an option is checked', async () => {
    const wrapper = mountWith(CheckboxGroup, {
      props: { legend: 'Material', options: MATERIALS, modelValue: ['merino'] },
    });
    (wrapper.findAll('input[type="checkbox"]')[1].element as HTMLInputElement).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([[['merino', 'cotton']]]);
    expect(wrapper.emitted('change')).toEqual([[['merino', 'cotton']]]);
    wrapper.unmount();
  });

  it('removes a value when an option is unchecked', async () => {
    const wrapper = mountWith(CheckboxGroup, {
      props: { legend: 'Material', options: MATERIALS, modelValue: ['merino', 'cotton'] },
    });
    (wrapper.findAll('input[type="checkbox"]')[0].element as HTMLInputElement).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([[['cotton']]]);
    wrapper.unmount();
  });

  it('never emits the same array instance it was given', async () => {
    const value = ['merino'];
    const wrapper = mountWith(CheckboxGroup, {
      props: { legend: 'Material', options: MATERIALS, modelValue: value },
    });
    (wrapper.findAll('input[type="checkbox"]')[1].element as HTMLInputElement).click();
    await nextTick();
    expect(value).toEqual(['merino']);
    wrapper.unmount();
  });

  it('manages its own state with no v-model bound', async () => {
    const wrapper = mountWith(CheckboxGroup, { props: { legend: 'Material', options: MATERIALS } });
    const first = wrapper.findAll('input[type="checkbox"]')[0].element as HTMLInputElement;
    first.click();
    await nextTick();
    expect(first.checked).toBe(true);
    wrapper.unmount();
  });
});

describe('CheckboxGroup — layout', () => {
  it('stacks the options with the spec gap by default', () => {
    const wrapper = mountWith(CheckboxGroup, { props: { legend: 'Material', options: MATERIALS } });
    const classes = wrapper.find('[data-part="options"]').classes();
    expect(classes).toContain('flex-col');
    expect(classes).toContain('gap-2');
    wrapper.unmount();
  });

  it('wraps a row group rather than overflowing', () => {
    const wrapper = mountWith(CheckboxGroup, {
      props: { legend: 'Size', options: SIZE_OPTIONS, layout: 'row' },
    });
    const classes = wrapper.find('[data-part="options"]').classes();
    expect(classes).toContain('flex-row');
    expect(classes).toContain('flex-wrap');
    expect(classes).toContain('gap-x-6');
    expect(classes).toContain('gap-y-2');
    expect(classes).not.toContain('flex-col');
    wrapper.unmount();
  });

  it('keeps the fieldset free of its default border, padding and min-width', () => {
    const wrapper = mountWith(CheckboxGroup, { props: { legend: 'Material', options: MATERIALS } });
    const classes = wrapper.classes();
    expect(classes).toContain('border-0');
    expect(classes).toContain('p-0');
    expect(classes).toContain('min-w-0');
    wrapper.unmount();
  });

  it('renders a row group in a 20rem container', () => {
    const wrapper = mountNarrow(CheckboxGroup, {
      props: { legend: 'Size', options: SIZE_OPTIONS, layout: 'row' },
    });
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(5);
    wrapper.unmount();
  });
});

describe('CheckboxGroup — error', () => {
  it('links the error to the fieldset and marks it invalid', () => {
    const wrapper = mountWith(CheckboxGroup, {
      props: { legend: 'Material', options: MATERIALS, error: 'Choose at least one material.' },
    });
    const errorId = wrapper.find('[data-part="error"]').attributes('id');
    expect(errorId).toBeTruthy();
    expect(wrapper.attributes('aria-describedby')).toBe(errorId);
    expect(wrapper.attributes('aria-invalid')).toBe('true');
    wrapper.unmount();
  });

  it('shows the error as an icon and text, not colour alone', () => {
    const wrapper = mountWith(CheckboxGroup, {
      props: { legend: 'Material', options: MATERIALS, error: 'Choose at least one material.' },
    });
    const error = wrapper.find('[data-part="error"]');
    expect(error.find('svg').exists()).toBe(true);
    expect(error.find('svg').attributes('aria-hidden')).toBe('true');
    expect(error.text()).toBe('Choose at least one material.');
    expect(error.classes()).toContain('text-danger');
    wrapper.unmount();
  });

  /**
   * The error belongs to the group, not to each option: repeating "invalid" on every one of five
   * checkboxes is noise, and the `FieldWrapper`'s own `group` variant already reads this way.
   */
  it('leaves the individual options valid', () => {
    const wrapper = mountWith(CheckboxGroup, {
      props: { legend: 'Material', options: MATERIALS, error: 'Choose at least one material.' },
    });
    for (const el of wrapper.findAll('input[type="checkbox"]')) {
      expect(el.attributes('aria-invalid')).toBeUndefined();
    }
    wrapper.unmount();
  });

  it('keeps a field wrapper description alongside its own error', () => {
    const wrapper = mountWith(CheckboxGroup, {
      props: { legend: 'Material', options: MATERIALS, error: 'Choose at least one material.' },
      global: fieldProvider({ describedBy: 'field-consent-help', invalid: false }),
    });
    const errorId = wrapper.find('[data-part="error"]').attributes('id');
    expect(wrapper.attributes('aria-describedby')).toBe(`${errorId} field-consent-help`);
    wrapper.unmount();
  });
});

describe('CheckboxGroup — accessibility', () => {
  it.each([
    ['vertical', { legend: 'Material', options: MATERIALS }],
    ['row', { legend: 'Size', options: SIZE_OPTIONS, layout: 'row' as const }],
    [
      'in error',
      { legend: 'Material', options: MATERIALS, error: 'Choose at least one material.' },
    ],
    [
      'with a disabled option',
      {
        legend: 'Size',
        options: [...SIZE_OPTIONS, { value: 'xxl', label: 'XXL', disabled: true }],
      },
    ],
    ['with a value', { legend: 'Material', options: MATERIALS, modelValue: ['merino'] }],
  ])('has no axe violations: %s', async (_name, props) => {
    const wrapper = mountWith(CheckboxGroup, { props });
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
