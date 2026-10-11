import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import RadioGroup from './RadioGroup.vue';
import type { RadioGroupOption } from './types';

/**
 * One story per state of the design spec's Radio group section, named after the state it shows.
 * `eldra-starter-spec/images/core/radio-group.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Forms/RadioGroup',
  component: RadioGroup,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'Choose exactly one option from a short visible set — plain radios, or **cards** for',
          'options that carry detail (a shipping method and its price). Past about 6 options use',
          '**Select** (searchable past 10).',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root` (the `<fieldset>`),',
          '`legend`, `options` (the list), `option` (one row or card), `radio` (the drawn circle),',
          '`label`, `hint`, `meta` (cards only) and `error`/`errorIcon`. The native',
          '`<input type="radio">` has no `classes` key of its own, exactly like `Checkbox`’s',
          'hidden input: it is invisible but hit-testable, over the drawn circle, which is its',
          'appearance.',
          '',
          '**Native, not hand-rolled.** Every radio shares one `name` (generated when you give',
          'none), so `Tab` moves into the group at the checked radio — or the first one, if none',
          'is checked — and `Tab` again leaves it; the arrow keys move *and select*, wrapping and',
          'skipping disabled options; `Space` selects the focused radio. All of that is the',
          'browser’s own radio-group behaviour: this component adds no key handling at all.',
          '',
          '**The whole row (or card) is the label**, exactly as `Checkbox` wraps its box and text —',
          'so a card’s accessible name includes its title, hint and price. `label`, `hint` and',
          '`meta` are scoped slots (`#label="{ option }"`, and so on) as well as `option` fields,',
          'for richer content than plain text.',
          '',
          '**`size`** (`md`/`lg`) only changes the radio in **plain** layouts (`vertical`/`row`);',
          'a card’s radio is always the `md` circle. **`cards`** draws the whole option as a',
          'bordered card, `meta` pushed to the end with tabular numerals — selection is a filled',
          'radio, a `surface` fill and a 2px `primary` border, never colour alone.',
          '',
          '**Error.** `error` sets `aria-invalid="true"` on **every radio** (unlike',
          '`CheckboxGroup`’s error, which stays on the fieldset alone — the spec asks for it on the',
          'radios here) and links the message to the fieldset by `aria-describedby`; the message',
          'itself is drawn by the same row `FieldWrapper` and `CheckboxGroup` use.',
          '',
          '**Proxy focus**, in every layout, including cards: the ring is drawn on the *radio*, not',
          'the card, because the input is hidden inside it — `eldra-focus` plus',
          '`eldra-focus-proxy`, the same pair `Checkbox` uses.',
          '',
          '**CSS variables**: `--eldra-radio-card-border-width` (default `1px`) and',
          '`--eldra-radio-card-radius` (default `radius-md`) for the card boundary;',
          '`--eldra-checkbox-border-width`/`-invalid` for the radio circle itself, shared with',
          '`Checkbox` because the spec gives it the identical numbers.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The spec's own vertical group. */
const GIFT_WRAP: RadioGroupOption[] = [
  { value: 'none', label: 'No gift wrap' },
  { value: 'kraft', label: 'Recycled kraft paper', hint: 'Free' },
  { value: 'linen', label: 'Linen wrap', hint: 'Reusable as a tea towel', meta: '$6' },
];

/** The spec's own row group. */
const FIT: RadioGroupOption[] = [
  { value: 'slim', label: 'Slim' },
  { value: 'regular', label: 'Regular' },
  { value: 'relaxed', label: 'Relaxed' },
];

/** The spec's own card group. */
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

/** The spec's own "Card finish" group, shown in error with a disabled option. */
const CARD_FINISH: RadioGroupOption[] = [
  { value: 'matte', label: 'Matte' },
  { value: 'gloss', label: 'Gloss' },
  { value: 'gold-foil', label: 'Gold foil', hint: 'Unavailable this season', disabled: true },
];

/** A vertical group with no hints: the plain, default shape. */
export const Vertical: Story = {
  args: { legend: 'Fit', name: 'fit', options: FIT },
  render: (args) => ({
    components: { RadioGroup },
    setup: () => ({ args, value: ref('regular') }),
    template: `
      <div class="max-w-96">
        <RadioGroup v-bind="args" v-model="value" />
      </div>
    `,
  }),
};

/** A row group for 2 to 4 short labels, wrapping rather than overflowing. */
export const Row: Story = {
  args: { legend: 'Fit', name: 'fit', layout: 'row', options: FIT },
  render: (args) => ({
    components: { RadioGroup },
    setup: () => ({ args, value: ref('regular') }),
    template: `
      <div class="max-w-96">
        <RadioGroup v-bind="args" v-model="value" />
      </div>
    `,
  }),
};

/** The whole option is a bordered card, meta pushed to the end. Standard is preselected — the
 * spec's own "do preselect the most common safe option" guidance. */
export const Cards: Story = {
  args: { legend: 'Shipping method', name: 'shipping', layout: 'cards', options: SHIPPING },
  render: (args) => ({
    components: { RadioGroup },
    setup: () => ({ args, value: ref('standard') }),
    template: `
      <div class="max-w-96">
        <RadioGroup v-bind="args" v-model="value" />
      </div>
    `,
  }),
};

/** `lg`: a 1.5rem circle, top-aligned, for a single prominent choice. Plain layouts only. */
export const Large: Story = {
  args: { legend: 'Gift wrap', name: 'gift-wrap', size: 'lg', options: GIFT_WRAP },
  render: (args) => ({
    components: { RadioGroup },
    setup: () => ({ args, value: ref('kraft') }),
    template: `
      <div class="max-w-96">
        <RadioGroup v-bind="args" v-model="value" />
      </div>
    `,
  }),
};

/** A second line under each label, inside it, so it is part of the click target. */
export const WithHints: Story = {
  args: { legend: 'Gift wrap', name: 'gift-wrap', options: GIFT_WRAP },
  render: (args) => ({
    components: { RadioGroup },
    setup: () => ({ args, value: ref('kraft') }),
    template: `
      <div class="max-w-96">
        <RadioGroup v-bind="args" v-model="value" />
      </div>
    `,
  }),
};

/** In error, with a disabled option in the same group — the spec's own "Card finish" example: a
 * 2px `danger` border on every radio, the message linked by id, and the unavailable option dashed
 * with its reason in the hint. */
export const Error: Story = {
  args: {
    legend: 'Card finish',
    name: 'card-finish',
    required: true,
    options: CARD_FINISH,
    error: 'Choose a card finish.',
  },
  render: (args) => ({
    components: { RadioGroup },
    setup: () => ({ args, value: ref('') }),
    template: `
      <div class="max-w-96">
        <RadioGroup v-bind="args" v-model="value" />
      </div>
    `,
  }),
};

/** Disabled options, both ways: unselected (dashed, muted, its reason in the hint) and — the
 * spec's "Disabled selected" row — a disabled option that is also the selected value. */
export const Disabled: Story = {
  args: { legend: 'Card finish', options: CARD_FINISH },
  render: (args) => ({
    components: { RadioGroup },
    setup: () => ({ args, selected: ref('gold-foil') }),
    template: `
      <div class="flex max-w-96 flex-col gap-6">
        <RadioGroup v-bind="args" />
        <RadioGroup v-bind="args" v-model="selected" legend="Card finish (unavailable one chosen)" />
      </div>
    `,
  }),
};

/** Long labels and hints wrap under the text column, and a card's title wraps while its meta stays
 * visible, end-aligned — the acceptance criteria's 320px / 200% zoom note. */
const LONG_ADDRESS: RadioGroupOption[] = [
  {
    value: 'account',
    label: 'Deliver to the address already saved on my account rather than a new one',
    hint: 'You can change this for a single order without updating your saved address',
  },
  { value: 'new', label: 'Use a new address for this order only' },
];
const LONG_SHIPPING: RadioGroupOption[] = [
  {
    value: 'standard',
    label: 'Standard shipping, tracked and insured for the full value of your order',
    hint: 'Delivered by our carbon-neutral courier network within 3 to 5 business days',
    meta: 'Free',
  },
  {
    value: 'express',
    label: 'Express',
    hint: 'Next business day if ordered by 2pm',
    meta: '$12.00',
  },
];

export const LongContent: Story = {
  args: { legend: 'Delivery address', options: LONG_ADDRESS },
  render: (args) => ({
    components: { RadioGroup },
    setup: () => ({
      args,
      value: ref('account'),
      cardOptions: LONG_SHIPPING,
      cardValue: ref('standard'),
    }),
    template: `
      <div class="max-w-96 flex flex-col gap-6">
        <RadioGroup v-bind="args" v-model="value" />
        <RadioGroup
          v-model="cardValue"
          legend="Shipping method"
          layout="cards"
          :options="cardOptions"
        />
      </div>
    `,
  }),
};

/** A 20rem container: the row group wraps, the card keeps its meta visible while the title wraps. */
export const Narrow: Story = {
  args: { legend: 'Fit', layout: 'row', options: FIT },
  render: (args) => ({
    components: { RadioGroup },
    setup: () => ({
      args,
      fitValue: ref('regular'),
      shipping: SHIPPING,
      shippingValue: ref('standard'),
    }),
    template: `
      <div class="border-border flex w-80 flex-col gap-6 border p-4">
        <RadioGroup v-bind="args" v-model="fitValue" />
        <RadioGroup
          v-model="shippingValue"
          legend="Shipping method"
          layout="cards"
          :options="shipping"
        />
      </div>
    `,
  }),
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in `--forced-colors`
 * with Playwright's `forcedColors: 'active'` emulation: every boundary stays a real border, so
 * selected, unselected, error and disabled stay told apart, and the focus ring takes the system
 * Highlight colour.
 */
export const ForcedColors: Story = {
  args: { legend: 'Gift wrap', options: GIFT_WRAP },
  parameters: { eldra: { forcedColors: true } },
  render: (args) => ({
    components: { RadioGroup },
    setup: () => ({
      args,
      giftValue: ref('kraft'),
      shipping: SHIPPING,
      cardFinish: CARD_FINISH,
      shippingValue: ref('standard'),
    }),
    template: `
      <div class="flex max-w-96 flex-col gap-6">
        <RadioGroup v-bind="args" v-model="giftValue" />
        <RadioGroup
          v-model="shippingValue"
          legend="Shipping method"
          layout="cards"
          :options="shipping"
        />
        <RadioGroup legend="Card finish" :options="cardFinish" error="Choose a card finish." />
      </div>
    `,
  }),
};
