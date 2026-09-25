import { afterEach, describe, expect, it } from 'vitest';
import { computed, nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import { FIELD_KEY, type FieldContext } from '../../field-wrapper/context';
import RadioGroup from '../RadioGroup.vue';
import type { RadioGroupOption } from '../types';

/** The spec's own vertical group ("Gift wrap"). */
const GIFT_WRAP: RadioGroupOption[] = [
  { value: 'none', label: 'No gift wrap' },
  { value: 'kraft', label: 'Recycled kraft paper', hint: 'Free' },
  { value: 'linen', label: 'Linen wrap', hint: 'Reusable as a tea towel', meta: '$6' },
];

/** The spec's own row group ("Fit"). */
const FIT: RadioGroupOption[] = [
  { value: 'slim', label: 'Slim' },
  { value: 'regular', label: 'Regular' },
  { value: 'relaxed', label: 'Relaxed' },
];

/** The spec's own card group ("Shipping method"). */
const SHIPPING: RadioGroupOption[] = [
  {
    value: 'standard',
    label: 'Standard',
    hint: '3 to 5 business days · carbon-neutral',
    meta: 'Free',
  },
  {
    value: 'express',
    label: 'Express',
    hint: 'Next business day if ordered by 2pm',
    meta: '$12.00',
  },
  {
    value: 'collect',
    label: 'Collect from the Bristol studio',
    hint: 'Unavailable: your basket includes a made-to-order item',
    meta: 'Free',
    disabled: true,
  },
];

/** Twice the length of the spec's own longest option label. */
const LONG_LABEL =
  'Deliver to the address already on my account rather than to a new one I type here';

type Finder = { find: (selector: string) => { element: Element } };

function radios(wrapper: {
  findAll: (s: string) => Array<{ element: Element }>;
}): HTMLInputElement[] {
  return wrapper.findAll('input[type="radio"]').map((w) => w.element as HTMLInputElement);
}

function radio(wrapper: Finder, index = 0): HTMLInputElement {
  return radios(wrapper as never)[index];
}

function option(wrapper: Finder, index = 0): HTMLElement {
  return (wrapper as unknown as { findAll: (s: string) => Array<{ element: Element }> }).findAll(
    '[data-part="option"]'
  )[index].element as HTMLElement;
}

/** A stub FieldWrapper, exactly what `FieldWrapper` provides. */
function fieldProvider(context: Partial<FieldContext> = {}) {
  return {
    provide: {
      [FIELD_KEY as symbol]: computed<FieldContext>(() => ({
        id: 'field-shipping',
        describedBy: 'field-shipping-help',
        invalid: false,
        required: false,
        labelsControl: false,
        ...context,
      })),
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('RadioGroup — element and parts', () => {
  it('is a fieldset with a legend, its options and a data-part on every part', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Gift wrap', options: GIFT_WRAP, error: 'Choose a gift wrap option.' },
    });
    expect(wrapper.element.tagName).toBe('FIELDSET');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.find('legend').attributes('data-part')).toBe('legend');
    expect(wrapper.find('legend').text()).toBe('Gift wrap');
    expect(wrapper.find('[data-part="options"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-part="option"]')).toHaveLength(3);
    expect(wrapper.findAll('[data-part="radio"]')).toHaveLength(3);
    expect(wrapper.findAll('[data-part="label"]')).toHaveLength(3);
    expect(wrapper.find('[data-part="error"]').text()).toContain('Choose a gift wrap option.');
    wrapper.unmount();
  });

  it('renders one radio per option, each a real native radio', () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Gift wrap', options: GIFT_WRAP } });
    const inputs = radios(wrapper);
    expect(inputs).toHaveLength(3);
    for (const input of inputs) expect(input.type).toBe('radio');
    wrapper.unmount();
  });

  it('renders hints only for options that have one', () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Gift wrap', options: GIFT_WRAP } });
    expect(wrapper.findAll('[data-part="hint"]')).toHaveLength(2);
    wrapper.unmount();
  });

  it('renders no meta in plain layouts, even when an option has one', () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Gift wrap', options: GIFT_WRAP } });
    expect(wrapper.find('[data-part="meta"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders no error row without one', () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Gift wrap', options: GIFT_WRAP } });
    expect(wrapper.find('[data-part="error"]').exists()).toBe(false);
    expect(wrapper.attributes('aria-invalid')).toBeUndefined();
    expect(wrapper.attributes('aria-describedby')).toBeUndefined();
    wrapper.unmount();
  });

  it('accepts a class override for every part', () => {
    const wrapper = mountWith(RadioGroup, {
      props: {
        legend: 'Shipping method',
        options: SHIPPING,
        layout: 'cards',
        error: 'Choose a shipping method.',
        classes: {
          root: 'ring-1',
          legend: 'italic',
          options: 'gap-8',
          option: 'shadow-md',
          radio: 'opacity-90',
          label: 'underline',
          hint: 'uppercase',
          meta: 'lowercase',
          error: 'font-bold',
          errorIcon: 'size-6',
        },
      },
    });
    expect(wrapper.classes()).toContain('ring-1');
    expect(wrapper.find('legend').classes()).toContain('italic');
    expect(wrapper.find('[data-part="options"]').classes()).toContain('gap-8');
    expect(option(wrapper).className).toContain('shadow-md');
    expect(wrapper.find('[data-part="radio"]').classes()).toContain('opacity-90');
    expect(wrapper.find('[data-part="label"]').classes()).toContain('underline');
    expect(wrapper.find('[data-part="hint"]').classes()).toContain('uppercase');
    expect(wrapper.find('[data-part="meta"]').classes()).toContain('lowercase');
    expect(wrapper.find('[data-part="error"]').classes()).toContain('font-bold');
    expect(wrapper.find('[data-part="errorIcon"]').classes()).toContain('size-6');
    wrapper.unmount();
  });
});

describe('RadioGroup — value and v-model', () => {
  it('checks the option whose value matches modelValue', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Gift wrap', options: GIFT_WRAP, modelValue: 'kraft' },
    });
    expect(radios(wrapper).map((el) => el.checked)).toEqual([false, true, false]);
    wrapper.unmount();
  });

  it('checks nothing without a modelValue', () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Gift wrap', options: GIFT_WRAP } });
    expect(radios(wrapper).some((el) => el.checked)).toBe(false);
    wrapper.unmount();
  });

  it('emits update:modelValue and change with the newly selected value', async () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Gift wrap', options: GIFT_WRAP, modelValue: 'none' },
    });
    radio(wrapper, 1).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([['kraft']]);
    expect(wrapper.emitted('change')).toEqual([['kraft']]);
    wrapper.unmount();
  });

  it('manages its own state with no v-model bound', async () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Gift wrap', options: GIFT_WRAP } });
    radio(wrapper, 2).click();
    await nextTick();
    expect(radios(wrapper).map((el) => el.checked)).toEqual([false, false, true]);
    wrapper.unmount();
  });

  it('stays on the parent-held value when the parent refuses the change', async () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Gift wrap', options: GIFT_WRAP, modelValue: 'none' },
    });
    radio(wrapper, 1).click();
    await nextTick();
    // The browser has already flipped the DOM's own `checked` properties on click; the group
    // re-asserts them from the (unchanged) controlled value straight after.
    expect(radios(wrapper).map((el) => el.checked)).toEqual([true, false, false]);
    wrapper.unmount();
  });

  it('gives every radio the shared name and its own value', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Gift wrap', options: GIFT_WRAP, name: 'gift-wrap' },
    });
    const inputs = radios(wrapper);
    expect(inputs.map((el) => el.name)).toEqual(['gift-wrap', 'gift-wrap', 'gift-wrap']);
    expect(inputs.map((el) => el.value)).toEqual(['none', 'kraft', 'linen']);
    wrapper.unmount();
  });

  it('generates a shared name when none is given', () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Gift wrap', options: GIFT_WRAP } });
    const names = radios(wrapper).map((el) => el.name);
    expect(names[0]).toMatch(/^eldra-radio-/);
    expect(new Set(names).size).toBe(1);
    wrapper.unmount();
  });

  it('sets native required on every radio', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Gift wrap', options: GIFT_WRAP, required: true },
    });
    expect(radios(wrapper).every((el) => el.required)).toBe(true);
    wrapper.unmount();
  });
});

describe('RadioGroup — disabled options', () => {
  it('disables only the options that say so', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING },
    });
    const inputs = radios(wrapper);
    expect(inputs.map((el) => el.disabled)).toEqual([false, false, true]);
    wrapper.unmount();
  });

  it('cannot select a disabled option by clicking it', async () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING, modelValue: 'standard' },
    });
    radio(wrapper, 2).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(radios(wrapper)[2].checked).toBe(false);
    wrapper.unmount();
  });
});

describe('RadioGroup — layout', () => {
  it('stacks vertically with the spec gap by default', () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Gift wrap', options: GIFT_WRAP } });
    const classes = wrapper.find('[data-part="options"]').classes();
    expect(classes).toContain('flex-col');
    expect(classes).toContain('gap-2');
    wrapper.unmount();
  });

  it('wraps a row group rather than overflowing', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Fit', options: FIT, layout: 'row' },
    });
    const classes = wrapper.find('[data-part="options"]').classes();
    expect(classes).toContain('flex-row');
    expect(classes).toContain('flex-wrap');
    expect(classes).toContain('gap-x-6');
    expect(classes).toContain('gap-y-2');
    wrapper.unmount();
  });

  it('stacks cards with the same 0.5rem gap as a vertical group', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING, layout: 'cards' },
    });
    const classes = wrapper.find('[data-part="options"]').classes();
    expect(classes).toContain('flex-col');
    expect(classes).toContain('gap-2');
    wrapper.unmount();
  });

  it('keeps the fieldset free of its default border, padding and min-width', () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Gift wrap', options: GIFT_WRAP } });
    const classes = wrapper.classes();
    expect(classes).toContain('border-0');
    expect(classes).toContain('p-0');
    expect(classes).toContain('min-w-0');
    wrapper.unmount();
  });

  it('renders a row group in a 20rem container', () => {
    const wrapper = mountNarrow(RadioGroup, {
      props: { legend: 'Fit', options: FIT, layout: 'row' },
    });
    expect(radios(wrapper)).toHaveLength(3);
    wrapper.unmount();
  });
});

describe('RadioGroup — cards', () => {
  it('renders the card as the whole option, meta included, pushed to the end', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING, layout: 'cards' },
    });
    const metas = wrapper.findAll('[data-part="meta"]').map((w) => w.text());
    expect(metas).toEqual(['Free', '$12.00', 'Free']);
    const meta = wrapper.find('[data-part="meta"]');
    expect(meta.classes()).toContain('justify-self-end');
    expect(meta.classes()).toContain('tabular-nums');
    expect(meta.classes()).toContain('whitespace-nowrap');
    wrapper.unmount();
  });

  it('draws each option as a bordered card', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING, layout: 'cards' },
    });
    const classes = option(wrapper).className.split(/\s+/);
    expect(classes).toContain('eldra-radio-card-border');
    expect(classes).toContain('rounded-md');
    expect(classes).toContain('min-h-14');
    wrapper.unmount();
  });

  it('marks the selected card by fill, border and dot — not colour alone', () => {
    const wrapper = mountWith(RadioGroup, {
      props: {
        legend: 'Shipping method',
        options: SHIPPING,
        modelValue: 'standard',
        layout: 'cards',
      },
    });
    const selectedCard = option(wrapper, 0).className.split(/\s+/);
    expect(selectedCard).toContain('bg-surface');
    expect(selectedCard).toContain('border-primary');
    expect(selectedCard).toContain('eldra-radio-card-selected');
    const otherCard = option(wrapper, 1).className.split(/\s+/);
    expect(otherCard).toContain('bg-background');
    expect(otherCard).not.toContain('eldra-radio-card-selected');
    wrapper.unmount();
  });

  it('keeps the surface fill on a selected card that is also in error, swapping only the line colour', () => {
    const wrapper = mountWith(RadioGroup, {
      props: {
        legend: 'Shipping method',
        options: SHIPPING,
        modelValue: 'standard',
        layout: 'cards',
        error: 'This shipping method is no longer available.',
      },
    });
    const selectedCard = option(wrapper, 0).className.split(/\s+/);
    expect(selectedCard).toContain('bg-surface');
    expect(selectedCard).not.toContain('bg-background');
    expect(selectedCard).toContain('border-danger');
    expect(selectedCard).toContain('eldra-radio-card-selected');
    expect(option(wrapper, 0).className).toContain(
      '[--eldra-radio-card-selected-color:var(--eldra-color-danger)]'
    );
    wrapper.unmount();
  });

  it('selects the option when the meta or hint text is clicked, because the card is the label', async () => {
    const wrapper = mountWith(RadioGroup, {
      props: {
        legend: 'Shipping method',
        options: SHIPPING,
        modelValue: 'standard',
        layout: 'cards',
      },
    });
    (wrapper.find('[data-part="meta"]').element as HTMLElement).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    (wrapper.findAll('[data-part="hint"]')[1].element as HTMLElement).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([['express']]);
    wrapper.unmount();
  });

  /** Spec acceptance criteria: "The whole card is clickable, and its accessible name includes
   * title, hint and price (4.1.2)." A native `<label>` wrapping the radio and all of its text is
   * what gives it that name; asserted here as the label's own text content, in anatomy order. */
  it('gives each card an accessible name built from its title, hint and price', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING, layout: 'cards' },
    });
    const text = option(wrapper, 0).textContent ?? '';
    const [titleIndex, hintIndex, metaIndex] = [
      text.indexOf('Standard'),
      text.indexOf('3 to 5 business days'),
      text.indexOf('Free'),
    ];
    expect(titleIndex).toBeGreaterThanOrEqual(0);
    expect(hintIndex).toBeGreaterThan(titleIndex);
    expect(metaIndex).toBeGreaterThan(hintIndex);
    wrapper.unmount();
  });

  it('uses the card title type for the title and the same run for meta', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING, layout: 'cards' },
    });
    expect(wrapper.find('[data-part="label"]').classes()).toContain('text-card-title');
    expect(wrapper.find('[data-part="meta"]').classes()).toContain('text-card-title');
    wrapper.unmount();
  });

  it('draws the radio at the md size inside a card regardless of the size prop', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING, layout: 'cards', size: 'lg' },
    });
    expect(wrapper.find('[data-part="radio"]').classes()).toContain('size-4.5');
    wrapper.unmount();
  });

  it('dashes the disabled card and mutes its text', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING, layout: 'cards' },
    });
    const disabledCard = option(wrapper, 2).className.split(/\s+/);
    expect(disabledCard).toContain('border-dashed');
    expect(disabledCard).toContain('cursor-not-allowed');
    expect(wrapper.findAll('[data-part="label"]')[2].classes()).toContain('text-muted');
    wrapper.unmount();
  });
});

describe('RadioGroup — sizes', () => {
  it('draws the md radio at the spec size by default', () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Gift wrap', options: GIFT_WRAP } });
    const classes = wrapper.find('[data-part="radio"]').classes();
    expect(classes).toContain('size-4.5');
    expect(classes).toContain('mt-0.75');
    wrapper.unmount();
  });

  it('draws the lg radio top-aligned in a plain layout', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Gift wrap', options: GIFT_WRAP, size: 'lg' },
    });
    const classes = wrapper.find('[data-part="radio"]').classes();
    expect(classes).toContain('size-6');
    expect(classes).not.toContain('mt-0.75');
    wrapper.unmount();
  });

  it('keeps the row at the minimum target height', () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Fit', options: FIT } });
    expect(option(wrapper).className.split(/\s+/)).toContain('target-min');
    wrapper.unmount();
  });
});

describe('RadioGroup — states', () => {
  it('draws the unselected radio as a strong boundary on the page ground', () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Gift wrap', options: GIFT_WRAP } });
    const classes = wrapper.find('[data-part="radio"]').element.className.split(/\s+/);
    expect(classes).toContain('bg-background');
    expect(classes).toContain('border-border-strong');
    expect(classes).toContain('eldra-checkbox-border');
    wrapper.unmount();
  });

  it('fills the selected radio with primary and scales its dot in', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Gift wrap', options: GIFT_WRAP, modelValue: 'kraft' },
    });
    const radios_ = wrapper.findAll('[data-part="radio"]');
    const selectedClasses = radios_[1].element.className.split(/\s+/);
    expect(selectedClasses).toContain('bg-primary');
    expect(selectedClasses).toContain('border-primary');
    const dot = radios_[1].element.querySelector('[aria-hidden="true"]');
    expect(dot?.className).toContain('scale-100');
    const otherDot = radios_[0].element.querySelector('[aria-hidden="true"]');
    expect(otherDot?.className).toContain('scale-0');
    wrapper.unmount();
  });

  it('sets aria-invalid and a 2px danger boundary on every radio when the group is in error', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Gift wrap', options: GIFT_WRAP, error: 'Choose a gift wrap option.' },
    });
    for (const el of radios(wrapper)) expect(el.getAttribute('aria-invalid')).toBe('true');
    const classes = wrapper.find('[data-part="radio"]').element.className.split(/\s+/);
    expect(classes).toContain('border-danger');
    expect(classes).toContain('eldra-checkbox-border-invalid');
    expect(classes).not.toContain('eldra-checkbox-border');
    wrapper.unmount();
  });

  it('sets no aria-invalid without an error', () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Gift wrap', options: GIFT_WRAP } });
    for (const el of radios(wrapper)) expect(el.getAttribute('aria-invalid')).toBeNull();
    wrapper.unmount();
  });

  it('keeps the primary fill on a selected radio that is also in error', () => {
    const wrapper = mountWith(RadioGroup, {
      props: {
        legend: 'Gift wrap',
        options: GIFT_WRAP,
        modelValue: 'kraft',
        error: 'This option is no longer available.',
      },
    });
    const classes = wrapper.findAll('[data-part="radio"]')[1].element.className.split(/\s+/);
    expect(classes).toContain('bg-primary');
    expect(classes).not.toContain('bg-background');
    expect(classes).toContain('border-danger');
    wrapper.unmount();
  });

  it('is disabled natively, with the dashed decorative circle and a muted label', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING },
    });
    const el = radios(wrapper)[2];
    expect(el.disabled).toBe(true);
    el.focus();
    expect(document.activeElement).not.toBe(el);
    const classes = wrapper.findAll('[data-part="radio"]')[2].element.className.split(/\s+/);
    expect(classes).toContain('border-dashed');
    expect(classes).toContain('bg-surface-strong');
    wrapper.unmount();
  });

  it('shows a disabled selected radio as a solid muted fill with its dot', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING, modelValue: 'collect' },
    });
    const classes = wrapper.findAll('[data-part="radio"]')[2].element.className.split(/\s+/);
    expect(classes).toContain('bg-muted');
    expect(classes).toContain('border-muted');
    expect(classes).not.toContain('border-dashed');
    const dot = wrapper
      .findAll('[data-part="radio"]')[2]
      .element.querySelector('[aria-hidden="true"]');
    expect(dot?.className).toContain('scale-100');
    wrapper.unmount();
  });
});

describe('RadioGroup — the focus ring', () => {
  it('draws the ring on the radio, in every layout', () => {
    for (const layout of ['vertical', 'row', 'cards'] as const) {
      const wrapper = mountWith(RadioGroup, {
        props: { legend: 'Shipping method', options: SHIPPING, layout },
      });
      const classes = wrapper.find('[data-part="radio"]').classes();
      expect(classes).toContain('eldra-focus');
      expect(classes).toContain('eldra-focus-proxy');
      wrapper.unmount();
    }
  });

  it('puts no ring on the visually hidden input itself', () => {
    const wrapper = mountWith(RadioGroup, { props: { legend: 'Gift wrap', options: GIFT_WRAP } });
    expect(radio(wrapper).className).not.toContain('eldra-focus');
    wrapper.unmount();
  });

  it('draws no focus ring around the card itself', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING, layout: 'cards' },
    });
    expect(option(wrapper).className).not.toContain('eldra-focus');
    wrapper.unmount();
  });
});

describe('RadioGroup — keyboard', () => {
  /**
   * happy-dom implements neither a native radio group's roving tabindex nor its arrow-key
   * activation (`radios(...).map((el) => el.tabIndex)` reports `0` for every radio here,
   * regardless of which is checked, which a real browser's internal focus-navigation algorithm
   * never reflects through the `tabIndex` IDL property either — it is not something any DOM
   * property exposes). So, exactly as `Checkbox`'s own Space-key spec does, this asserts the
   * *contract* that earns the group its native behaviour for free — one shared `name`, no
   * `tabindex` override, nothing cancelling the key — rather than a browser feature this
   * environment cannot run.
   */
  it('meets the native single-tab-stop contract: no explicit tabindex on any radio', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING, modelValue: 'standard' },
    });
    for (const el of radios(wrapper)) expect(el.getAttribute('tabindex')).toBeNull();
    wrapper.unmount();
  });

  it('meets the native arrow-key activation contract: nothing cancels the key', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Gift wrap', options: GIFT_WRAP, modelValue: 'none' },
    });
    const el = radio(wrapper, 0);
    el.focus();
    expect(document.activeElement).toBe(el);
    for (const key of ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      el.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    wrapper.unmount();
  });

  it('skips a disabled option so it can never receive focus', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING },
    });
    const disabled = radios(wrapper)[2];
    disabled.focus();
    expect(document.activeElement).not.toBe(disabled);
    wrapper.unmount();
  });
});

describe('RadioGroup — content and layout', () => {
  it('renders a long label without clipping it', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Delivery address', options: [{ value: 'account', label: LONG_LABEL }] },
    });
    expect(wrapper.find('[data-part="label"]').text()).toBe(LONG_LABEL);
    wrapper.unmount();
  });

  it('renders a card group in a 20rem container', () => {
    const wrapper = mountNarrow(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING, layout: 'cards' },
    });
    expect(wrapper.findAll('[data-part="meta"]')).toHaveLength(3);
    wrapper.unmount();
  });
});

describe('RadioGroup — slots', () => {
  it('lets label, hint and meta be overridden per option', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Shipping method', options: SHIPPING.slice(0, 2), layout: 'cards' },
      slots: {
        label: '<template #label="{ option }"><b>{{ option.label.toUpperCase() }}</b></template>',
        meta: '<template #meta="{ option }"><em>{{ option.meta }}</em></template>',
      },
    });
    expect(wrapper.find('[data-part="label"] b').text()).toBe('STANDARD');
    expect(wrapper.find('[data-part="meta"] em').text()).toBe('Free');
    wrapper.unmount();
  });
});

describe('RadioGroup — accessibility', () => {
  it.each([
    ['vertical', { legend: 'Gift wrap', options: GIFT_WRAP }],
    ['row', { legend: 'Fit', options: FIT, layout: 'row' as const }],
    ['cards', { legend: 'Shipping method', options: SHIPPING, layout: 'cards' as const }],
    ['with a value', { legend: 'Gift wrap', options: GIFT_WRAP, modelValue: 'kraft' }],
    ['in error', { legend: 'Gift wrap', options: GIFT_WRAP, error: 'Choose a gift wrap option.' }],
    ['required', { legend: 'Gift wrap', options: GIFT_WRAP, required: true }],
    [
      'with a disabled option',
      { legend: 'Shipping method', options: SHIPPING, layout: 'cards' as const },
    ],
  ])('has no axe violations: %s', async (_name, props) => {
    const wrapper = mountWith(RadioGroup, { props });
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('keeps a field wrapper description alongside its own error', () => {
    const wrapper = mountWith(RadioGroup, {
      props: { legend: 'Gift wrap', options: GIFT_WRAP, error: 'Choose a gift wrap option.' },
      global: fieldProvider({ describedBy: 'field-shipping-help' }),
    });
    const errorId = wrapper.find('[data-part="error"]').attributes('id');
    expect(wrapper.attributes('aria-describedby')).toBe(`${errorId} field-shipping-help`);
    wrapper.unmount();
  });
});
