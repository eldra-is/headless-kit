import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref, watch } from 'vue';
import CurrencyInput from '../currency-input/CurrencyInput.vue';
import RangeSlider from './RangeSlider.vue';

/**
 * One story per state of the design spec's Range slider section, named after the state it shows.
 * There is no reference image for this component (the spec section says so outright), so these
 * stories and the section's own tables are the review target.
 */
const meta = {
  title: 'Forms/RangeSlider',
  component: RangeSlider,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
    messages: { table: { disable: true } },
    formatValue: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'Two thumbs on one track for choosing a span of numbers — the price filter on a',
          'collection grid is the one every store has. For a single number use a',
          '**QuantityStepper** (a count) or an **Input** (a measurement).',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `label`, `group`',
          '(the `role="group"` that names the pair), `rail` (the band a press lands in), `track`,',
          '`range` (the filled part between the thumbs), `thumb` (both, each with a',
          '`data-thumb="min|max"`), and — with `inputs` — `inputs`, `input` (both, each with a',
          '`data-input="min|max"`) and `separator` (the word "to").',
          '',
          '**Two tab stops, not one.** Both ends of the range have to be reachable, so this is not',
          'a roving-tabindex composite: each thumb is its own stop, carrying `role="slider"`,',
          '`aria-valuenow` and — the part worth knowing — `aria-valuemin`/`-valuemax` of its',
          "**own** limits, so the minimum thumb's maximum is the maximum thumb's current value.",
          'The limit a screen reader announces is the limit the thumb really has.',
          '',
          '**A press anywhere on the rail** moves the nearer thumb to that value and keeps',
          'dragging it, so a press is a drag of no distance. The dragged thumb parks against its',
          'neighbour rather than swapping with it.',
          '',
          '**Keyboard**: `←`/`↓` and `→`/`↑` by `step`; `Shift` with any of them, and',
          '`PageUp`/`PageDown`, by `largeStep` (ten steps unless set); `Home`/`End` to that',
          "thumb's own limits.",
          '',
          '**`formatValue`** formats every number the control speaks or prints — both',
          "`aria-valuetext`s and both fields' resting text — so a store passes the same currency",
          'formatter its prices use and a thumb announces "$1,200" rather than "1200".',
          '',
          '**`inputs`** adds the typed min / "to" / max row. A typed value commits on **blur or',
          '`Enter` only**, never on a keystroke, and is then snapped, clamped to `[min, max]` and',
          'clamped against the other thumb; an emptied field falls back to that end of the range.',
          '',
          '**Events**: `update:modelValue` on every move (each key, each step of a drag, each',
          'committed field) and `change` once the move is over (pointer release, key release,',
          'field commit). Anything that costs a request listens to `change`.',
          '',
          '**Targets**: the rail is `target-touch` (2.75rem) tall below the tablet width of its own',
          "container and `target-min` (1.5rem) from it, and each thumb's own hit area follows the",
          'same two values.',
          '',
          '**Motion**: none on a thumb or the filled range — the value is the thing, and the focus',
          "ring owns the thumb's transitions. The one motion is the thumb's hover and dragging",
          'halo, which fades over `duration-fast` and appears instantly with reduced motion.',
          '',
          '**CSS variables**: `--eldra-range-thumb-size` (default `1.25rem`),',
          '`--eldra-range-thumb-border-width` (default `1.5px`), `--eldra-range-thumb-halo`',
          '(default `0.25rem`) and `--eldra-range-track-height` (default `0.375rem`).',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof RangeSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The store's own currency formatter, which is what `formatValue` exists for. */
const price = (amount: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

/** Default: a labelled span over the whole range, dragged or arrowed. */
export const Default: Story = {
  render: () => ({
    components: { RangeSlider },
    setup: () => ({ value: ref<[number, number]>([20, 70]) }),
    template: `<RangeSlider v-model="value" label="Rating" :min="0" :max="100" />`,
  }),
};

/** With the typed row: the same value, two ways to set it. Typed values commit on blur or Enter. */
export const WithInputs: Story = {
  render: () => ({
    components: { RangeSlider },
    setup: () => ({ value: ref<[number, number]>([30, 80]) }),
    template: `
      <div class="flex flex-col gap-4">
        <RangeSlider v-model="value" label="Weight in grams" :min="0" :max="200" :step="5" inputs />
        <p class="text-body-sm text-muted">Selected: {{ value[0] }} to {{ value[1] }} g</p>
      </div>
    `,
  }),
};

/**
 * A price filter, which is what the Collection grid block builds: the collection's own bounds, a
 * step of one unit of the currency, and `formatValue` so both thumbs announce a price.
 */
export const CurrencyFormatting: Story = {
  render: () => ({
    components: { RangeSlider },
    setup: () => ({ value: ref<[number, number]>([2400, 14_800]), price }),
    template: `
      <RangeSlider
        v-model="value"
        label="Price"
        min-label="Minimum price"
        max-label="Maximum price"
        :min="2400"
        :max="18000"
        :step="100"
        :large-step="1000"
        :format-value="price"
        inputs
      />
    `,
  }),
};

/** Disabled: the rail, both thumbs and both fields. The thumbs stay focusable and read-only. */
export const Disabled: Story = {
  render: () => ({
    components: { RangeSlider },
    setup: () => ({ value: ref<[number, number]>([1200, 4800]), price }),
    template: `
      <RangeSlider
        :model-value="value"
        label="Price"
        :min="0"
        :max="10000"
        :step="100"
        :format-value="price"
        inputs
        disabled
      />
    `,
  }),
};

/**
 * Narrow container: the desktop filter sidebar's own 15rem, below the tablet width, so the rail and
 * both thumb targets take their `target-touch` size and the fields stack as tightly as they get.
 */
export const Narrow: Story = {
  render: () => ({
    components: { RangeSlider },
    setup: () => ({ value: ref<[number, number]>([0, 180]), price }),
    template: `
      <div class="w-60 border-border rounded-lg border p-4">
        <RangeSlider
          v-model="value"
          label="Price"
          :min="0"
          :max="180"
          :step="5"
          :format-value="price"
          inputs
        />
      </div>
    `,
  }),
};

/** A collapsed span: both thumbs on one value is a real answer ("exactly $40"), and either side of
 *  the press reopens it. */
export const Collapsed: Story = {
  render: () => ({
    components: { RangeSlider },
    setup: () => ({ value: ref<[number, number]>([40, 40]), price }),
    template: `
      <RangeSlider
        v-model="value"
        label="Price"
        :min="0"
        :max="100"
        :format-value="price"
        inputs
      />
    `,
  }),
};

/** A fractional step: every move lands on a tenth, and twenty presses still read 2, not
 *  1.9999999999999998. */
export const FractionalStep: Story = {
  render: () => ({
    components: { RangeSlider },
    setup: () => ({ value: ref<[number, number]>([1.5, 8.2]) }),
    template: `
      <div class="flex flex-col gap-4">
        <RangeSlider v-model="value" label="Metres" :min="0" :max="10" :step="0.1" inputs />
        <p class="text-body-sm text-muted">Selected: {{ value[0] }} to {{ value[1] }} m</p>
      </div>
    `,
  }),
};

/**
 * **A store's own currency fields, through the `inputs` slot.**
 *
 * The built-in fields are generic number fields, and money is not a generic number: a price filter
 * wants the symbol, the store's grouping and the caret behaviour a money field has. So the row is
 * replaceable and the *value* is not — `commit(end, next)` applies the same snap, the same clamp
 * against the bounds and against the other thumb, and emits the same `change` a built-in field's
 * blur does, so these fields and the thumbs cannot disagree about the range.
 *
 * Note what the fields are bound to: a **local** number per field, written on every keystroke, and
 * `commit` called only on blur or `Enter` (spec → Behaviour & motion). Committing per keystroke
 * would snap and clamp a half-typed number under the customer's caret.
 */
export const CurrencyFields: Story = {
  render: () => ({
    components: { RangeSlider, CurrencyInput },
    setup() {
      const value = ref<[number, number]>([1200, 4800]);
      const typed = ref<[number | null, number | null]>([1200, 4800]);
      watch(value, (next) => {
        typed.value = [next[0], next[1]];
      });
      return { value, typed };
    },
    template: `
      <div class="flex flex-col gap-4">
        <RangeSlider
          v-model="value"
          label="Price"
          :min="0"
          :max="6000"
          :step="100"
          inputs
        >
          <template #inputs="{ labels, min, max, step, disabled, commit }">
            <CurrencyInput
              v-model="typed[0]"
              currency="USD"
              :max-fraction="0"
              :min="min"
              :max="max"
              :step="step"
              :disabled="disabled"
              :label="labels.min"
              @blur="commit(0, typed[0])"
              @keydown.enter.prevent="commit(0, typed[0])"
            />
            <span class="self-center text-center text-body-sm text-muted" aria-hidden="true">
              {{ labels.separator }}
            </span>
            <CurrencyInput
              v-model="typed[1]"
              currency="USD"
              :max-fraction="0"
              :min="min"
              :max="max"
              :step="step"
              :disabled="disabled"
              :label="labels.max"
              @blur="commit(1, typed[1])"
              @keydown.enter.prevent="commit(1, typed[1])"
            />
          </template>
        </RangeSlider>
        <p class="text-body-sm text-muted">Selected: {{ value[0] }} to {{ value[1] }}</p>
      </div>
    `,
  }),
};

/**
 * Reduced motion. `scripts/screenshots.mjs` captures any story whose id ends in
 * `--reduced-motion` with Playwright's `reducedMotion: 'reduce'` emulation. Nothing about a
 * thumb's or the range's position was ever animated, so this renders identically to `Default`
 * under that emulation — which is the point; what the emulation does change is the hover and
 * dragging halo, which appears at full strength at once instead of fading in.
 */
export const ReducedMotion: Story = {
  render: () => ({
    components: { RangeSlider },
    setup: () => ({ value: ref<[number, number]>([20, 70]) }),
    template: `<RangeSlider v-model="value" label="Rating" :min="0" :max="100" />`,
  }),
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in `--forced-colors`
 * with Playwright's `forcedColors: 'active'` emulation: each thumb's 1.5px edge is a real border
 * so it survives, the fields keep their own, and the focus ring takes the system Highlight colour.
 * The track and the filled range are backgrounds, which the platform repaints — the thumbs are
 * what still say where the span starts and ends.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { RangeSlider },
    setup: () => ({ value: ref<[number, number]>([20, 70]) }),
    template: `<RangeSlider v-model="value" label="Rating" :min="0" :max="100" inputs />`,
  }),
};
