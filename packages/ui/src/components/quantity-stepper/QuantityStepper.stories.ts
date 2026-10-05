import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import QuantityStepper from './QuantityStepper.vue';

/**
 * One story per state of the design spec's "Quantity stepper" section, named after the state it
 * shows. `eldra-starter-spec/images/core/quantity-stepper.png` is the review target for all of
 * them; `scripts/screenshots.mjs` compares each against the committed baseline in
 * `__screenshots__/`.
 */
const meta = {
  title: 'Forms/QuantityStepper',
  component: QuantityStepper,
  tags: ['autodocs'],
  args: { size: 'md' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A number field between a decrease and an increase button, for choosing how many of an',
          'item to add to the basket or keep in a cart line. It never goes to 0 — removing an item',
          'is a separate "Remove" `Button` (`variant="link"`), outside this control.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root` (the one bordered',
          'group), `decrease`, `input`, `increase`, `error`.',
          '',
          '**Field**: `type="text"` with `inputmode="numeric"` and `role="spinbutton"`, not the',
          'design spec\'s literal `<input type="number">` — see the component\'s own top-of-file',
          'doc comment for why (a native number input cannot hold a locale-grouped value like',
          '`is-IS`\'s "1.234", which this control must parse with `parseLocaleNumber`).',
          '`aria-valuenow`/`-valuemin`/`-valuemax` carry the value natively to assistive tech.',
          '',
          '**Stepping**: pressing a button, or `ArrowUp`/`ArrowDown` in the field, adds or',
          'subtracts 1, clamps to `[min, max]`, and fires `change` — never per keystroke while',
          'typing. A typed value is rounded to a whole number and clamped on blur or `Enter`; a',
          'non-number becomes `min`. "0" and values past `max` are silently corrected, never shown',
          'as an error.',
          '',
          '**At a limit**: the relevant button gets `aria-disabled="true"` rather than `disabled`,',
          'so it stays focusable and dimmed rather than dropping out of the tab order.',
          '',
          '**Names**: buttons are named `"Decrease"`/`"Increase"`, plus `", <itemName>"` in a list',
          'of several (a cart drawer). The field is named `"Quantity"` unless a `FieldWrapper`\'s',
          '`<label for>` already names it.',
          '',
          '**Live region**: a visually-hidden `role="status"` region announces the settled quantity',
          'once per commit — never per keystroke.',
          '',
          '**Error**: a server rejection (e.g. "Only 3 left") renders the same error row a',
          '`FieldWrapper` draws, linked to the field by `aria-describedby`. It never changes the',
          "group's own appearance — no red boundary — only the message below it.",
          '',
          '**Locale**: `locale` (default `"en-US"`) formats the displayed value and drives',
          "`parseLocaleNumber` for a typed value — not part of the design spec's own Properties",
          'table, added per the API contract.',
          '',
          '**CSS variables**: `--eldra-stepper-radius` (default `var(--eldra-radius-md)`).',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof QuantityStepper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** md, mid-range, with a per-order limit — the product-page variant. */
export const Default: Story = {
  render: () => ({
    components: { QuantityStepper },
    setup: () => ({ value: ref(4) }),
    template: `
      <div class="flex items-center gap-3">
        <QuantityStepper v-model="value" :max="10" />
        <span class="text-caption text-muted">Limit 10 per order</span>
      </div>
    `,
  }),
};

/** `sm`: the cart-line/filter-bar size, 2 × 2rem buttons, 2.25rem field. */
export const Small: Story = {
  render: () => ({
    components: { QuantityStepper },
    setup: () => ({ a: ref(1), b: ref(3) }),
    template: `
      <div class="flex flex-wrap items-center gap-6">
        <QuantityStepper v-model="a" size="sm" />
        <QuantityStepper v-model="b" size="sm" :max="9" />
      </div>
    `,
  }),
};

/** At `min`: decrease is dimmed and `aria-disabled`, but stays focusable. */
export const AtMin: Story = {
  render: () => ({
    components: { QuantityStepper },
    setup: () => ({ value: ref(1) }),
    template: `<QuantityStepper v-model="value" :min="1" :max="10" />`,
  }),
};

/** At `max`: increase is dimmed and `aria-disabled`, but stays focusable. */
export const AtMax: Story = {
  render: () => ({
    components: { QuantityStepper },
    setup: () => ({ value: ref(10) }),
    template: `<QuantityStepper v-model="value" :max="10" />`,
  }),
};

/** A cart line: `itemName` is appended to both button names ("Increase, Stoneware mug"). */
export const WithItemName: Story = {
  render: () => ({
    components: { QuantityStepper },
    setup: () => ({ value: ref(2) }),
    template: `
      <div class="flex items-center gap-3">
        <div class="bg-surface-strong size-12 shrink-0 rounded-md"></div>
        <div class="flex flex-1 flex-col gap-1">
          <p class="text-body font-medium">Stoneware mug · Clay</p>
          <QuantityStepper v-model="value" size="sm" item-name="Stoneware mug" :max="8" />
        </div>
        <span class="text-body font-medium">$56.00</span>
      </div>
    `,
  }),
};

/** Sold out: the whole stepper is disabled — dashed `surface-strong` boundary, `muted` icons and
 * value. */
export const Disabled: Story = {
  render: () => ({
    components: { QuantityStepper },
    template: `
      <div class="flex items-center gap-3">
        <QuantityStepper disabled />
        <span class="text-caption text-muted">Sold out</span>
      </div>
    `,
  }),
};

/** A server rejection: the group's own appearance never changes, only the message below it. */
export const Error: Story = {
  render: () => ({
    components: { QuantityStepper },
    setup: () => ({ value: ref(5) }),
    template: `<QuantityStepper v-model="value" :max="3" error="Only 3 left" />`,
  }),
};

/** A 20rem container: a long item name never breaks the stepper onto more than one line. */
export const Narrow: Story = {
  render: () => ({
    components: { QuantityStepper },
    setup: () => ({ value: ref(2) }),
    template: `
      <div class="border-border flex w-80 flex-col gap-4 border p-4">
        <QuantityStepper v-model="value" item-name="Merino crew-neck sweater in Charcoal" />
        <QuantityStepper v-model="value" size="sm" :max="8" />
      </div>
    `,
  }),
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in `--forced-colors`
 * with Playwright's `forcedColors: 'active'` emulation: the group boundary stays a real border in
 * every state — solid, dashed for disabled — so default, at-limit and disabled stay told apart,
 * and the focus ring takes the system Highlight colour.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { QuantityStepper },
    setup: () => ({ mid: ref(4), min: ref(1), max: ref(10) }),
    template: `
      <div class="flex flex-col gap-3">
        <QuantityStepper v-model="mid" :max="10" />
        <QuantityStepper v-model="min" :min="1" :max="10" />
        <QuantityStepper v-model="max" :max="10" />
        <QuantityStepper disabled />
      </div>
    `,
  }),
};
