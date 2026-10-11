import { describe, expect, it } from 'vitest';
import type { Component } from 'vue';
import { mountWith } from '../test/mount';
import CurrencyInput from '../components/currency-input/CurrencyInput.vue';
import {
  FIELD_DISABLED,
  FIELD_INVALID,
  FIELD_LIVE,
  FIELD_READONLY,
} from '../components/input/classes';
import Input from '../components/input/Input.vue';
import QuantityStepper from '../components/quantity-stepper/QuantityStepper.vue';
import RangeSlider from '../components/range-slider/RangeSlider.vue';
import SearchBar from '../components/search-bar/SearchBar.vue';
import MultiSelect from '../components/select/MultiSelect.vue';
import Select from '../components/select/Select.vue';
import type { SelectOption } from '../components/select/types';
import Textarea from '../components/textarea/Textarea.vue';
import UnitInput from '../components/unit-input/UnitInput.vue';

/**
 * **A field box always carries a border colour, and a `FIELD_BASE` consumer always carries a whole
 * state recipe.**
 *
 * `eldra-field-border` (`src/styles/tailwind.css`) sets the field boundary's *width* and nothing
 * else: the colour comes from `FIELD_LIVE` / `FIELD_INVALID` / `FIELD_DISABLED` / `FIELD_READONLY`
 * (`src/components/input/classes.ts`), which every component drawing that box has to compose. Draw
 * the base without one of them and the border colour falls through to Tailwind's preflight
 * `border: 0 solid` — `currentcolor`, which is whatever `color` happens to be. `RangeSlider`'s two
 * typed fields shipped exactly that way: a near-black `text` boundary at rest, visibly heavier than
 * every other field beside them in a filter panel, no hover/focus `border-text` change (the border
 * was already at `text`), and a solid `muted` disabled state instead of the kit's dashed
 * `border-border` one.
 *
 * Nothing tied the two halves together before this spec — `input.spec.ts` and `search-bar.spec.ts`
 * each assert their own component's border and no more, which is why the omission in a fifth
 * component went unseen. So this walks **every** component in the package that draws the field box
 * and makes the next partial copy impossible:
 *
 * - every element carrying `eldra-field-border`, in each state the component supports, carries one
 *   of the recipes' own border colours (the colours are read out of the recipes, not re-typed);
 * - and every component that composes the shared `FIELD_BASE` renders one of those recipes **in
 *   full**, so a consumer's field is the same box in the same state wherever it appears.
 *
 * The second rule is deliberately narrower than the first. `Textarea`, `Select` and `MultiSelect`
 * draw the same box from their own local state constants (`Select`'s trigger adds a cursor and a
 * fill, and has no `focus:` colour because its ring is driven by `aria-expanded`), so they answer
 * the border-colour rule, not the whole-recipe one.
 */

/** The border-colour utilities the four recipes use, read out of the recipes themselves. */
const RECIPE_BORDER_COLOURS = [
  ...new Set(
    [FIELD_LIVE, FIELD_INVALID, FIELD_DISABLED, FIELD_READONLY]
      .flatMap((recipe) => recipe.split(/\s+/))
      // Unprefixed `border-<colour>` only: `hover:border-text` is a state *change*, never the rest
      // colour, and `border-dashed` is a style, not a colour.
      .filter((name) => /^border-/.test(name) && name !== 'border-dashed')
  ),
];

const OPTIONS: SelectOption[] = [
  { value: 'oat', label: 'Oat' },
  { value: 'clay', label: 'Clay' },
];

interface FieldCase {
  name: string;
  component: Component;
  props?: Record<string, unknown>;
  attrs?: Record<string, unknown>;
  /** Omitted for a component with no disabled state of its own (`SearchBar`). */
  disabled?: boolean;
  /** True for the components that compose the shared `FIELD_BASE` rather than a local copy. */
  sharedBase: boolean;
}

const CASES: FieldCase[] = [
  {
    name: 'Input',
    component: Input,
    attrs: { 'aria-label': 'Email' },
    disabled: true,
    sharedBase: true,
  },
  {
    name: 'UnitInput',
    component: UnitInput,
    props: { unit: 'kilometer' },
    attrs: { 'aria-label': 'Distance' },
    disabled: true,
    sharedBase: true,
  },
  {
    name: 'CurrencyInput',
    component: CurrencyInput,
    attrs: { 'aria-label': 'Price' },
    disabled: true,
    sharedBase: true,
  },
  { name: 'SearchBar', component: SearchBar, sharedBase: true },
  {
    name: 'RangeSlider',
    component: RangeSlider,
    props: { label: 'Price', inputs: true },
    disabled: true,
    sharedBase: true,
  },
  {
    name: 'Textarea',
    component: Textarea,
    attrs: { 'aria-label': 'Notes' },
    disabled: true,
    sharedBase: false,
  },
  {
    name: 'Select',
    component: Select,
    props: { options: OPTIONS },
    attrs: { 'aria-label': 'Colour' },
    disabled: true,
    sharedBase: false,
  },
  {
    name: 'MultiSelect',
    component: MultiSelect,
    props: { options: OPTIONS },
    attrs: { 'aria-label': 'Colours' },
    disabled: true,
    sharedBase: false,
  },
  { name: 'QuantityStepper', component: QuantityStepper, disabled: true, sharedBase: false },
];

/** Every element in a mounted tree that draws the field box, the root included. */
function fieldBoxes(root: Element): Element[] {
  return [root, ...root.querySelectorAll('*')].filter((element) =>
    element.classList.contains('eldra-field-border')
  );
}

function mountCase(field: FieldCase, disabled: boolean) {
  return mountWith(field.component, {
    props: { ...field.props, ...(disabled ? { disabled: true } : {}) },
    attrs: field.attrs,
  });
}

describe('every field box carries a border colour', () => {
  it.each(CASES.map((field) => [field.name, field] as const))(
    '%s draws at least one field box',
    (_name, field) => {
      const wrapper = mountCase(field, false);
      expect(fieldBoxes(wrapper.element).length).toBeGreaterThan(0);
      wrapper.unmount();
    }
  );

  it.each(CASES.map((field) => [field.name, field] as const))(
    '%s — every field box has a recipe border colour at rest',
    (name, field) => {
      const wrapper = mountCase(field, false);
      for (const box of fieldBoxes(wrapper.element)) {
        const colours = [...box.classList].filter((cls) => RECIPE_BORDER_COLOURS.includes(cls));
        expect(
          `${name}: ${colours.length > 0 ? 'coloured' : `no border colour in "${box.className}"`}`
        ).toBe(`${name}: coloured`);
      }
      wrapper.unmount();
    }
  );

  it.each(CASES.filter((field) => field.disabled).map((field) => [field.name, field] as const))(
    '%s — every field box has a recipe border colour while disabled',
    (name, field) => {
      const wrapper = mountCase(field, true);
      for (const box of fieldBoxes(wrapper.element)) {
        const colours = [...box.classList].filter((cls) => RECIPE_BORDER_COLOURS.includes(cls));
        expect(
          `${name}: ${colours.length > 0 ? 'coloured' : `no border colour in "${box.className}"`}`
        ).toBe(`${name}: coloured`);
      }
      wrapper.unmount();
    }
  );
});

describe('every FIELD_BASE consumer renders a whole state recipe', () => {
  const shared = CASES.filter((field) => field.sharedBase);

  it.each(shared.map((field) => [field.name, field] as const))(
    '%s renders all of FIELD_LIVE at rest',
    (name, field) => {
      const wrapper = mountCase(field, false);
      for (const box of fieldBoxes(wrapper.element)) {
        for (const cls of FIELD_LIVE.split(/\s+/)) {
          expect(
            `${name} rest: ${cls} ${box.classList.contains(cls) ? 'present' : 'MISSING'}`
          ).toBe(`${name} rest: ${cls} present`);
        }
      }
      wrapper.unmount();
    }
  );

  it.each(shared.filter((field) => field.disabled).map((field) => [field.name, field] as const))(
    '%s renders all of FIELD_DISABLED while disabled',
    (name, field) => {
      const wrapper = mountCase(field, true);
      for (const box of fieldBoxes(wrapper.element)) {
        for (const cls of FIELD_DISABLED.split(/\s+/)) {
          expect(
            `${name} disabled: ${cls} ${box.classList.contains(cls) ? 'present' : 'MISSING'}`
          ).toBe(`${name} disabled: ${cls} present`);
        }
      }
      wrapper.unmount();
    }
  );
});
