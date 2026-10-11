import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import VariantPicker from './VariantPicker.vue';
import type { VariantPickerOption } from './types';

/**
 * One story per state of the design spec's Variant picker section, named after the state it
 * shows. `eldra-starter-spec/images/core/variant-picker.png` is the review target for all of
 * them; `scripts/screenshots.mjs` compares each against the committed baseline in
 * `__screenshots__/`.
 */
const meta = {
  title: 'Forms/VariantPicker',
  component: VariantPicker,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'Choose a product option (size, colour) from visible pills or swatches. The legend',
          'spells out the current choice, and sold-out options stay selectable so a back-in-stock',
          'notice can be offered. For more than about 12 options, or long names, use **Select**',
          'with rich options instead.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root` (the',
          '`<fieldset>`), `legend`, `legendValue` (the value run inside it), `options` (the',
          'wrapping row), `option` (the `<label>` — the whole click target), `radio` (the drawn',
          'pill, or the swatch’s outer ring), `label` (the option text — visible for pills,',
          '`sr-only` for swatches), `swatch` (the colour disc, swatches only) and `soldOutLine`',
          '(the diagonal strike, sold-out options only).',
          '',
          '**Native, not hand-rolled.** Every radio shares the `name` prop as-is, exactly as the',
          'spec’s Properties table asks (`name` also drives the legend). `Tab` moves into the',
          'group at the checked radio and out again; the arrow keys move *and select*, wrapping;',
          '`Space` selects the focused radio. Sold-out options are never `disabled` (spec',
          '“Don’t disable or hide sold-out options”), so all of that stays native — no key',
          'handling of any kind lives in this component.',
          '',
          '**The legend always reads "Name: Value"**, and adds ", sold out" the moment a sold-out',
          'option is selected. Every sold-out option, selected or not, also carries ", sold out" in',
          'its own accessible name (`messages.soldOut`, lower-cased to continue the sentence) —',
          'visually hidden text, never colour alone (1.4.1).',
          '',
          '**`value` defaults to the first available option** when `modelValue` is `undefined`',
          '(spec Properties table) via `useControllableModel`’s uncontrolled fallback, falling',
          'back to the very first option when nothing is available.',
          '',
          '**Swatches** carry the one per-item colour the spec allows (`option.swatch`) as an',
          'inline style, never a class. The disc keeps a real `border-strong` edge (not a shadow)',
          'so pale colours (Ecru, Chalk) stay visible at a 3:1 boundary in forced-colours mode',
          'too (1.4.11); the colour name lives in `sr-only` text inside the label, never by colour',
          'alone.',
          '',
          '**Proxy focus**, in both types: the ring is drawn on the `radio` part — the pill, or',
          'the swatch’s outer ring frame — because the input is hidden inside it, exactly the',
          'pair `Checkbox` and `RadioGroup` use (`eldra-focus` plus `eldra-focus-proxy`).',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof VariantPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The spec's own size row. */
const SIZES: VariantPickerOption[] = [
  { value: 'xs', label: 'XS', available: true },
  { value: 's', label: 'S', available: true },
  { value: 'm', label: 'M', available: true },
  { value: 'l', label: 'L', available: false },
  { value: 'xl', label: 'XL', available: true },
];

/** The spec's own colour row (Merino crew sweater: Oatmeal selected, Clay sold out). */
const COLOURS: VariantPickerOption[] = [
  { value: 'oatmeal', label: 'Oatmeal', swatch: '#e7ded1', available: true },
  { value: 'charcoal', label: 'Charcoal', swatch: '#2f2f2f', available: true },
  { value: 'moss', label: 'Moss', swatch: '#4d5a45', available: true },
  { value: 'clay', label: 'Clay', swatch: '#8c3b2a', available: false },
  { value: 'ecru', label: 'Ecru', swatch: '#f2ede3', available: true },
];

/** Pills, the default type: sizes, capacities, pack counts — anything text. */
export const Pills: Story = {
  args: { name: 'Size', options: SIZES },
  render: (args) => ({
    components: { VariantPicker },
    setup: () => ({ args, value: ref('m') }),
    template: `
      <div class="max-w-96">
        <VariantPicker v-bind="args" v-model="value" />
      </div>
    `,
  }),
};

/** Colours and glazes: a colour disc with a real edge, never colour alone — the name is
 * `sr-only` inside the label and spelled out in the legend. */
export const Swatches: Story = {
  args: { name: 'Colour', type: 'swatches', options: COLOURS },
  render: (args) => ({
    components: { VariantPicker },
    setup: () => ({ args, value: ref('oatmeal') }),
    template: `
      <div class="max-w-96">
        <VariantPicker v-bind="args" v-model="value" />
      </div>
    `,
  }),
};

/** The spec's own "a sold-out option selected" state, both types at once: a struck-through pill
 * and swatch, each selected, so the legend reads "…, sold out" for both. */
export const WithSoldOut: Story = {
  args: { name: 'Size', options: SIZES },
  render: (args) => ({
    components: { VariantPicker },
    setup: () => ({
      args,
      sizeValue: ref('l'),
      colours: COLOURS,
      colourValue: ref('clay'),
    }),
    template: `
      <div class="flex max-w-96 flex-col gap-6">
        <VariantPicker name="Colour" type="swatches" :options="colours" v-model="colourValue" />
        <VariantPicker v-bind="args" v-model="sizeValue" />
      </div>
    `,
  }),
};

/** Long option labels wrap onto more than one row rather than overflowing or clipping — the
 * acceptance criteria's 320px / 200% zoom note, shown here at ordinary width. */
const LONG_SIZES: VariantPickerOption[] = [
  { value: 'account', label: 'Deliver to my saved address', available: true },
  { value: 'gift', label: 'Gift-wrapped, no price on the slip', available: true },
  { value: 'collect', label: 'Collect from the Bristol studio', available: false },
  { value: 'express', label: 'Next business day if ordered by 2pm', available: true },
];

export const LongLabels: Story = {
  args: { name: 'Delivery', options: LONG_SIZES },
  render: (args) => ({
    components: { VariantPicker },
    setup: () => ({ args, value: ref('account') }),
    template: `
      <div class="max-w-96">
        <VariantPicker v-bind="args" v-model="value" />
      </div>
    `,
  }),
};

/** A 20rem container: both types wrap onto more rows rather than scrolling horizontally. */
export const Narrow: Story = {
  args: { name: 'Size', options: SIZES },
  render: (args) => ({
    components: { VariantPicker },
    setup: () => ({
      args,
      sizeValue: ref('m'),
      colours: COLOURS,
      colourValue: ref('oatmeal'),
    }),
    template: `
      <div class="border-border flex w-80 flex-col gap-6 border p-4">
        <VariantPicker name="Colour" type="swatches" :options="colours" v-model="colourValue" />
        <VariantPicker v-bind="args" v-model="sizeValue" />
      </div>
    `,
  }),
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in
 * `--forced-colors` with Playwright's `forcedColors: 'active'` emulation: every boundary — the
 * pill's dashed line, the swatch's real edge and ring — stays a real border, so default, selected
 * and sold out stay told apart, and the focus ring takes the system Highlight colour.
 */
export const ForcedColors: Story = {
  args: { name: 'Size', options: SIZES },
  parameters: { eldra: { forcedColors: true } },
  render: (args) => ({
    components: { VariantPicker },
    setup: () => ({
      args,
      sizeValue: ref('l'),
      colours: COLOURS,
      colourValue: ref('clay'),
    }),
    template: `
      <div class="flex max-w-96 flex-col gap-6">
        <VariantPicker name="Colour" type="swatches" :options="colours" v-model="colourValue" />
        <VariantPicker v-bind="args" v-model="sizeValue" />
      </div>
    `,
  }),
};
