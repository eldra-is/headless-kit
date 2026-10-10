import { describe, expect, it } from 'vitest';
import { mountWith } from '../test/mount';
import Button from '../components/button/Button.vue';
import CurrencyInput from '../components/currency-input/CurrencyInput.vue';
import Input from '../components/input/Input.vue';
import QuantityStepper from '../components/quantity-stepper/QuantityStepper.vue';
import SearchBar from '../components/search-bar/SearchBar.vue';
import MultiSelect from '../components/select/MultiSelect.vue';
import Select from '../components/select/Select.vue';
import type { SelectOption } from '../components/select/types';
import UnitInput from '../components/unit-input/UnitInput.vue';

/**
 * Operator addition, 2026-09-25: "the height of the button is a bit taller than of the inputs...
 * make all scales match so sm button = sm input, base button = base input, large input = large
 * button". Every sized control shares `control-h-sm`/`control-h`/`control-h-lg`
 * (`src/styles/tailwind.css`) — `Button`'s `md` `primary` variant was the one outlier, growing to
 * `target-touch` (2.75rem) below a 48rem container (spec "Actions and forms" → Compact controls).
 * That growth is removed (see `Button.vue`, and the README's Deviations), so this guards the rule
 * across every sized component at once: the part that carries a control's height renders exactly
 * the shared utility for its size, and `target-touch` never appears anywhere in the tree.
 */

const HEIGHT_UTILITY = { sm: 'control-h-sm', md: 'control-h', lg: 'control-h-lg' } as const;

const OPTIONS: SelectOption[] = [
  { value: 'order', label: "An order I've placed" },
  { value: 'returns', label: 'Returns and exchanges' },
];

/** Every element in the tree, including the root — `querySelectorAll('*')` alone skips it. */
function allElements(root: Element): Element[] {
  return [root, ...root.querySelectorAll('*')];
}

/**
 * `classList.contains('target-touch')` alone would miss the defect this guards: the utility is
 * applied under a container-query variant, `@max-tablet:target-touch`, which is one class token
 * with the variant baked into its name, not two. So every class on every element is checked
 * against the bare name or a `<variant>:target-touch` suffix, the same shape `cx()`'s own class
 * groups (`src/utils/cx.ts`) recognise.
 */
function expectNoTargetTouch(root: Element): void {
  for (const element of allElements(root)) {
    for (const className of element.classList) {
      expect(className === 'target-touch' || className.endsWith(':target-touch')).toBe(false);
    }
  }
}

describe('control heights match across every sized component', () => {
  it.each(['sm', 'md', 'lg'] as const)('Button %s', (size) => {
    const wrapper = mountWith(Button, {
      props: { variant: 'primary', size },
      slots: { default: 'Add to cart' },
    });
    expect(wrapper.classes()).toContain(HEIGHT_UTILITY[size]);
    expectNoTargetTouch(wrapper.element);
    wrapper.unmount();
  });

  it.each(['sm', 'md', 'lg'] as const)('Input %s', (size) => {
    const wrapper = mountWith(Input, {
      props: { size },
      attrs: { 'aria-label': 'Quantity' },
    });
    const control = wrapper.get('[data-part="control"]');
    expect(control.classes()).toContain(HEIGHT_UTILITY[size]);
    expectNoTargetTouch(wrapper.element);
    wrapper.unmount();
  });

  it.each(['sm', 'md', 'lg'] as const)('UnitInput %s', (size) => {
    const wrapper = mountWith(UnitInput, {
      props: { size, unit: 'kilometer' },
      attrs: { 'aria-label': 'Distance' },
    });
    const control = wrapper.get('[data-part="control"]');
    expect(control.classes()).toContain(HEIGHT_UTILITY[size]);
    expectNoTargetTouch(wrapper.element);
    wrapper.unmount();
  });

  it.each(['sm', 'md', 'lg'] as const)('CurrencyInput %s', (size) => {
    const wrapper = mountWith(CurrencyInput, {
      props: { size },
      attrs: { 'aria-label': 'Price' },
    });
    const control = wrapper.get('[data-part="control"]');
    expect(control.classes()).toContain(HEIGHT_UTILITY[size]);
    expectNoTargetTouch(wrapper.element);
    wrapper.unmount();
  });

  // No sm: the spec's Search bar has only the header (md) and Search-page (lg) sizes.
  it.each(['md', 'lg'] as const)('SearchBar %s', (size) => {
    const wrapper = mountWith(SearchBar, { props: { size } });
    const field = wrapper.get('[data-part="field"]');
    expect(field.classes()).toContain(HEIGHT_UTILITY[size]);
    expectNoTargetTouch(wrapper.element);
    wrapper.unmount();
  });

  it.each(['sm', 'md', 'lg'] as const)('Select %s', (size) => {
    const wrapper = mountWith(Select, {
      props: { options: OPTIONS, size },
      attrs: { 'aria-label': 'Topic' },
    });
    const trigger = wrapper.get('[data-part="trigger"]');
    expect(trigger.classes()).toContain(HEIGHT_UTILITY[size]);
    expectNoTargetTouch(wrapper.element);
    wrapper.unmount();
  });

  it.each(['sm', 'md', 'lg'] as const)('MultiSelect %s', (size) => {
    const wrapper = mountWith(MultiSelect, {
      props: { options: OPTIONS, size },
      attrs: { 'aria-label': 'Categories' },
    });
    const trigger = wrapper.get('[data-part="trigger"]');
    expect(trigger.classes()).toContain(HEIGHT_UTILITY[size]);
    expectNoTargetTouch(wrapper.element);
    wrapper.unmount();
  });

  // No lg: the spec's Quantity stepper has only `md` (the default) and the compact `sm`.
  it.each(['sm', 'md'] as const)('QuantityStepper %s', (size) => {
    const wrapper = mountWith(QuantityStepper, { props: { size } });
    const decrease = wrapper.get('[data-part="decrease"]');
    expect(decrease.classes()).toContain(HEIGHT_UTILITY[size]);
    expectNoTargetTouch(wrapper.element);
    wrapper.unmount();
  });
});
