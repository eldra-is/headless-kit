import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import VariantPicker from '../VariantPicker.vue';
import type { VariantPickerOption } from '../types';

/** The spec's own size row ("Size: M selected, L sold out and dashed"). */
const SIZES: VariantPickerOption[] = [
  { value: 'xs', label: 'XS', available: true },
  { value: 's', label: 'S', available: true },
  { value: 'm', label: 'M', available: true },
  { value: 'l', label: 'L', available: false },
  { value: 'xl', label: 'XL', available: true },
];

/** The spec's own colour row ("Colour: Oatmeal swatches with Clay crossed out"). */
const COLOURS: VariantPickerOption[] = [
  { value: 'oatmeal', label: 'Oatmeal', swatch: '#e7ded1', available: true },
  { value: 'charcoal', label: 'Charcoal', swatch: '#2f2f2f', available: true },
  { value: 'moss', label: 'Moss', swatch: '#4d5a45', available: true },
  { value: 'clay', label: 'Clay', swatch: '#8c3b2a', available: false },
  { value: 'ecru', label: 'Ecru', swatch: '#f2ede3', available: true },
];

/** Twice the length of the spec's own longest option label. */
const LONG_LABEL = 'Deliver to the address already saved on my account rather than a new one';

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

afterEach(() => {
  document.body.innerHTML = '';
});

describe('VariantPicker — element and parts', () => {
  it('is a fieldset with a legend, its options and a data-part on every part', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Size', options: SIZES, modelValue: 'm' },
    });
    expect(wrapper.element.tagName).toBe('FIELDSET');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.find('legend').attributes('data-part')).toBe('legend');
    expect(wrapper.find('[data-part="legendValue"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="options"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-part="option"]')).toHaveLength(5);
    expect(wrapper.findAll('[data-part="radio"]')).toHaveLength(5);
    expect(wrapper.findAll('[data-part="label"]')).toHaveLength(5);
    wrapper.unmount();
  });

  it('renders one radio per option, each a real native radio', () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    const inputs = radios(wrapper);
    expect(inputs).toHaveLength(5);
    for (const input of inputs) expect(input.type).toBe('radio');
    wrapper.unmount();
  });

  it('renders a swatch part only in swatches mode', () => {
    const pills = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    expect(pills.find('[data-part="swatch"]').exists()).toBe(false);
    pills.unmount();

    const swatches = mountWith(VariantPicker, {
      props: { name: 'Colour', type: 'swatches', options: COLOURS },
    });
    expect(swatches.findAll('[data-part="swatch"]')).toHaveLength(5);
    swatches.unmount();
  });

  it('accepts a class override for every part', () => {
    const wrapper = mountWith(VariantPicker, {
      props: {
        name: 'Colour',
        type: 'swatches',
        options: COLOURS,
        classes: {
          root: 'ring-1',
          legend: 'italic',
          legendValue: 'lowercase',
          options: 'gap-8',
          option: 'shadow-md',
          radio: 'opacity-90',
          label: 'tracking-wide',
          swatch: 'grayscale',
          soldOutLine: 'opacity-50',
        },
      },
    });
    expect(wrapper.classes()).toContain('ring-1');
    expect(wrapper.find('legend').classes()).toContain('italic');
    expect(wrapper.find('[data-part="legendValue"]').classes()).toContain('lowercase');
    expect(wrapper.find('[data-part="options"]').classes()).toContain('gap-8');
    expect(option(wrapper).className).toContain('shadow-md');
    expect(wrapper.find('[data-part="radio"]').classes()).toContain('opacity-90');
    expect(wrapper.find('[data-part="label"]').classes()).toContain('tracking-wide');
    expect(wrapper.find('[data-part="swatch"]').classes()).toContain('grayscale');
    expect(wrapper.find('[data-part="soldOutLine"]').classes()).toContain('opacity-50');
    wrapper.unmount();
  });
});

describe('VariantPicker — value and v-model', () => {
  it('checks the option whose value matches modelValue', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Size', options: SIZES, modelValue: 's' },
    });
    expect(radios(wrapper).map((el) => el.checked)).toEqual([false, true, false, false, false]);
    wrapper.unmount();
  });

  /** Spec "Variant picker" → Properties, `value` row: "the first available option" is the
   * default. */
  it('defaults to the first available option with no modelValue', () => {
    const wrapper = mountWith(VariantPicker, {
      props: {
        name: 'Size',
        options: [
          { value: 'xs', label: 'XS', available: false },
          { value: 's', label: 'S', available: true },
          { value: 'm', label: 'M', available: true },
        ],
      },
    });
    expect(radios(wrapper).map((el) => el.checked)).toEqual([false, true, false]);
    expect(wrapper.find('[data-part="legendValue"]').text()).toBe('S');
    wrapper.unmount();
  });

  it('falls back to the first option when none is available', () => {
    const wrapper = mountWith(VariantPicker, {
      props: {
        name: 'Size',
        options: [
          { value: 'xs', label: 'XS', available: false },
          { value: 's', label: 'S', available: false },
        ],
      },
    });
    expect(radios(wrapper).map((el) => el.checked)).toEqual([true, false]);
    wrapper.unmount();
  });

  it('emits update:modelValue and change with the newly selected value', async () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Size', options: SIZES, modelValue: 'xs' },
    });
    radio(wrapper, 2).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([['m']]);
    expect(wrapper.emitted('change')).toEqual([['m']]);
    wrapper.unmount();
  });

  it('manages its own state with no v-model bound', async () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    radio(wrapper, 4).click();
    await nextTick();
    expect(radios(wrapper).map((el) => el.checked)).toEqual([false, false, false, false, true]);
    wrapper.unmount();
  });

  it('stays on the parent-held value when the parent refuses the change', async () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Size', options: SIZES, modelValue: 'xs' },
    });
    radio(wrapper, 2).click();
    await nextTick();
    expect(radios(wrapper).map((el) => el.checked)).toEqual([true, false, false, false, false]);
    wrapper.unmount();
  });

  it('gives every radio the shared name and its own value', () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'size', options: SIZES } });
    const inputs = radios(wrapper);
    expect(inputs.every((el) => el.name === 'size')).toBe(true);
    expect(inputs.map((el) => el.value)).toEqual(['xs', 's', 'm', 'l', 'xl']);
    wrapper.unmount();
  });

  /** Spec "Variant picker" → Do/Don't: "Don't disable or hide sold-out options." */
  it('selects a sold-out option by clicking it, exactly like any other', async () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    radio(wrapper, 3).click();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toEqual([['l']]);
    expect(radios(wrapper)[3].checked).toBe(true);
    wrapper.unmount();
  });

  it('sets no disabled attribute on any radio, sold out included', () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    for (const el of radios(wrapper)) expect(el.disabled).toBe(false);
    wrapper.unmount();
  });
});

describe('VariantPicker — legend', () => {
  it('shows the option name and the selected value', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Size', options: SIZES, modelValue: 'm' },
    });
    expect(wrapper.find('legend').text()).toBe('Size: M');
    wrapper.unmount();
  });

  /** Acceptance criteria: "The legend always shows 'Name: Value' and adds ', sold out' when the
   * selected value is sold out." */
  it('adds ", sold out" to the legend when the selected value is sold out', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Size', options: SIZES, modelValue: 'l' },
    });
    expect(wrapper.find('legend').text()).toBe('Size: L, sold out');
    wrapper.unmount();
  });

  it('updates the legend value when the selection changes', async () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Colour', type: 'swatches', options: COLOURS },
    });
    expect(wrapper.find('[data-part="legendValue"]').text()).toBe('Oatmeal');
    radio(wrapper, 3).click();
    await nextTick();
    expect(wrapper.find('[data-part="legendValue"]').text()).toBe('Clay, sold out');
    wrapper.unmount();
  });
});

describe('VariantPicker — sold out', () => {
  it('exposes "sold out" in a sold-out option’s accessible name, visually hidden', () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    const soldOutLabel = wrapper.findAll('[data-part="label"]')[3];
    expect(soldOutLabel.text()).toBe('L, sold out');
    const hidden = soldOutLabel.find('.sr-only');
    expect(hidden.exists()).toBe(true);
    expect(hidden.text()).toBe(', sold out');
    wrapper.unmount();
  });

  it('renders no sold-out suffix for an available option', () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    const label = wrapper.findAll('[data-part="label"]')[0];
    expect(label.text()).toBe('XS');
    expect(label.find('.sr-only').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders a soldOutLine only for sold-out options', () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    expect(wrapper.findAll('[data-part="soldOutLine"]')).toHaveLength(1);
    const radios_ = wrapper.findAll('[data-part="radio"]');
    expect(radios_[3].find('[data-part="soldOutLine"]').exists()).toBe(true);
    expect(radios_[0].find('[data-part="soldOutLine"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('marks the soldOutLine decorative', () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    expect(wrapper.find('[data-part="soldOutLine"]').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('draws the pill sold-out line with a dashed border and a constant-width SVG stroke', () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    const soldOutRadio = wrapper.findAll('[data-part="radio"]')[3];
    expect(soldOutRadio.classes()).toContain('border-dashed');
    const line = soldOutRadio.find('[data-part="soldOutLine"]');
    expect(line.element.tagName.toLowerCase()).toBe('svg');
    const svgLine = line.find('line');
    expect(svgLine.attributes('vector-effect')).toBe('non-scaling-stroke');
    expect(svgLine.attributes('stroke-width')).toBe('1');
    wrapper.unmount();
  });

  it('shows the sold-out-and-selected pill with the doubled boundary and its own text colour', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Size', options: SIZES, modelValue: 'l' },
    });
    const radioEl = wrapper.findAll('[data-part="radio"]')[3];
    expect(radioEl.classes()).toContain('bg-surface-strong');
    expect(radioEl.classes()).toContain('eldra-variant-pill-selected-line');
    expect(radioEl.classes()).not.toContain('border-dashed');
    wrapper.unmount();
  });
});

describe('VariantPicker — swatches', () => {
  it('sets the swatch colour as an inline style, never a class', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Colour', type: 'swatches', options: COLOURS },
    });
    const swatch = wrapper.findAll('[data-part="swatch"]')[0];
    expect((swatch.element as HTMLElement).style.backgroundColor).toBeTruthy();
    expect((swatch.element as HTMLElement).getAttribute('style')).toContain('e7ded1');
    expect(swatch.classes().join(' ')).not.toContain('#e7ded1');
    wrapper.unmount();
  });

  it('hides the swatch disc and the sold-out line from assistive tech', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Colour', type: 'swatches', options: COLOURS },
    });
    expect(wrapper.find('[data-part="swatch"]').attributes('aria-hidden')).toBe('true');
    wrapper.unmount();
  });

  it('keeps the swatch disc edge visible with a real border, not a shadow', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Colour', type: 'swatches', options: COLOURS },
    });
    const swatch = wrapper.find('[data-part="swatch"]');
    expect(swatch.classes()).toContain('border-border-strong');
    expect(swatch.classes()).toContain('eldra-variant-swatch-edge');
    wrapper.unmount();
  });

  it('rings the selected swatch in text colour and leaves the rest transparent', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Colour', type: 'swatches', options: COLOURS, modelValue: 'moss' },
    });
    const radios_ = wrapper.findAll('[data-part="radio"]');
    expect(radios_[2].classes()).toContain('border-text');
    expect(radios_[0].classes()).toContain('border-transparent');
    wrapper.unmount();
  });

  it('visually hides the colour name but keeps it in the label text', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Colour', type: 'swatches', options: COLOURS },
    });
    const label = wrapper.find('[data-part="label"]');
    expect(label.classes()).toContain('sr-only');
    expect(label.text()).toBe('Oatmeal');
    wrapper.unmount();
  });

  it('draws the swatch sold-out line as an SVG with a halo stroke under the main one', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Colour', type: 'swatches', options: COLOURS },
    });
    const line = wrapper.find('[data-part="soldOutLine"]');
    expect(line.element.tagName.toLowerCase()).toBe('svg');
    const strokes = line.findAll('line');
    expect(strokes).toHaveLength(2);
    expect(strokes[0].attributes('stroke')).toBe('var(--eldra-color-background)');
    expect(strokes[1].attributes('stroke')).toBe('currentColor');
    for (const stroke of strokes) {
      expect(stroke.attributes('vector-effect')).toBe('non-scaling-stroke');
    }
    wrapper.unmount();
  });
});

describe('VariantPicker — sizes and targets', () => {
  it('keeps a pill at the minimum control height and width', () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    const radioEl = wrapper.find('[data-part="radio"]');
    expect(radioEl.classes()).toContain('control-h');
    expect(radioEl.classes()).toContain('min-w-12');
    wrapper.unmount();
  });

  it('keeps a swatch at its 2.75rem target size', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Colour', type: 'swatches', options: COLOURS },
    });
    expect(wrapper.find('[data-part="radio"]').classes()).toContain('size-11');
    wrapper.unmount();
  });
});

describe('VariantPicker — the focus ring', () => {
  it('draws the ring on the pill, in every type', () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    const classes = wrapper.find('[data-part="radio"]').classes();
    expect(classes).toContain('eldra-focus');
    expect(classes).toContain('eldra-focus-proxy');
    wrapper.unmount();
  });

  it('draws the ring on the swatch frame', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Colour', type: 'swatches', options: COLOURS },
    });
    const classes = wrapper.find('[data-part="radio"]').classes();
    expect(classes).toContain('eldra-focus');
    expect(classes).toContain('eldra-focus-proxy');
    wrapper.unmount();
  });

  it('puts no ring on the visually hidden input itself', () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    expect(radio(wrapper).className).not.toContain('eldra-focus');
    wrapper.unmount();
  });
});

describe('VariantPicker — keyboard', () => {
  /**
   * happy-dom implements neither a native radio group's roving tabindex nor its arrow-key
   * activation, so — exactly as `RadioGroup`'s own spec documents — this asserts the contract
   * that earns the group its native behaviour for free: one shared `name`, no `tabindex`
   * override, nothing cancelling the key, and no `disabled` on any option (sold out included).
   */
  it('meets the native single-tab-stop contract: no explicit tabindex on any radio', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Size', options: SIZES, modelValue: 'm' },
    });
    for (const el of radios(wrapper)) expect(el.getAttribute('tabindex')).toBeNull();
    wrapper.unmount();
  });

  it('meets the native arrow-key activation contract: nothing cancels the key', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Size', options: SIZES, modelValue: 'xs' },
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

  it('never cancels the key on a sold-out option either, since it is never disabled', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Size', options: SIZES, modelValue: 'xs' },
    });
    const soldOut = radio(wrapper, 3);
    soldOut.focus();
    expect(document.activeElement).toBe(soldOut);
    wrapper.unmount();
  });
});

describe('VariantPicker — content and layout', () => {
  it('wraps the options row rather than overflowing', () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    const classes = wrapper.find('[data-part="options"]').classes();
    expect(classes).toContain('flex-wrap');
    expect(classes).toContain('gap-2');
    wrapper.unmount();
  });

  it('renders a long label without clipping it', () => {
    const wrapper = mountWith(VariantPicker, {
      props: { name: 'Delivery', options: [{ value: 'a', label: LONG_LABEL, available: true }] },
    });
    expect(wrapper.find('[data-part="label"]').text()).toBe(LONG_LABEL);
    wrapper.unmount();
  });

  it('renders and wraps in a 20rem container', () => {
    const wrapper = mountNarrow(VariantPicker, {
      props: { name: 'Size', options: SIZES, modelValue: 'm' },
    });
    expect(radios(wrapper)).toHaveLength(5);
    const classes = wrapper.find('[data-part="options"]').classes();
    expect(classes).toContain('flex-wrap');
    wrapper.unmount();
  });

  it('keeps the fieldset free of its default border and padding', () => {
    const wrapper = mountWith(VariantPicker, { props: { name: 'Size', options: SIZES } });
    const classes = wrapper.classes();
    expect(classes).toContain('border-0');
    expect(classes).toContain('p-0');
    wrapper.unmount();
  });
});

describe('VariantPicker — accessibility', () => {
  it.each([
    ['pills', { name: 'Size', options: SIZES, modelValue: 'm' }],
    ['pills with a sold-out selection', { name: 'Size', options: SIZES, modelValue: 'l' }],
    [
      'swatches',
      { name: 'Colour', type: 'swatches' as const, options: COLOURS, modelValue: 'oatmeal' },
    ],
    [
      'swatches with a sold-out selection',
      { name: 'Colour', type: 'swatches' as const, options: COLOURS, modelValue: 'clay' },
    ],
    ['no modelValue', { name: 'Size', options: SIZES }],
  ])('has no axe violations: %s', async (_name, props) => {
    const wrapper = mountWith(VariantPicker, { props });
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
