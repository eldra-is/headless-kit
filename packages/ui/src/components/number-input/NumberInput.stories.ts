import { IconCurrencyDollar, IconRuler2 } from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import NumberInput from './NumberInput.vue';

/**
 * One story per state. `NumberInput` is an **addition beyond design spec 1** (which has no
 * editable numeric field at all), so there is no reference image for it — the review target is
 * `eldra-starter-spec/images/core/input.png`, because the box, the sizes and every state are
 * `Input`'s, imported rather than copied.
 */
const meta = {
  title: 'Forms/NumberInput',
  component: NumberInput,
  tags: ['autodocs'],
  args: { size: 'md', format: 'decimal', locale: 'en-US' },
  argTypes: {
    format: { control: 'inline-radio', options: ['decimal', 'currency', 'unit'] },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    currencyDisplay: {
      control: 'inline-radio',
      options: ['symbol', 'narrowSymbol', 'code', 'name'],
    },
    unitDisplay: { control: 'inline-radio', options: ['short', 'narrow', 'long'] },
    leadingIcon: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A number, money or unit field. **An addition beyond the design spec**, which has no',
          'editable numeric field (its `Price` is a display component). It is an `Input` in every',
          'respect a customer can see — the same box, sizes, paddings, focus ring and error',
          'boundary, imported from `src/components/input/classes.ts` rather than copied — plus the',
          'one thing a text field cannot do: hold a `number` on one side and a locale-formatted',
          'string on the other.',
          '',
          '**Two texts, one value.** Out of focus the field shows the formatted value',
          '(`$1,234.50`, `1.235 kr.`, `2.5 kg`). On focus it switches to a plain editable string —',
          'the same digits without group separators, with the locale’s decimal separator kept, so',
          '`1234,5` under `is-IS`. On blur, or on `Enter`, the text is parsed with',
          '`parseLocaleNumber`, clamped to `min`/`max`, rounded to `precision` and written back.',
          '`update:modelValue` and `change` fire only when the number actually moved.',
          '',
          '**Parts** (`data-part`, and the keys of `classes`): `root`, `leadingIcon`, `control`,',
          '`prefix`, `suffix`, `clearButton`. **Slots**: `leadingIcon`, `prefix`, `suffix`.',
          '',
          '**`type="text"`, not `type="number"`** — the same reason `QuantityStepper` is: a native',
          'number input’s DOM value can only ever be the ungrouped US grammar, so it cannot hold',
          '`is-IS`’s `1.234` at all. `inputmode="decimal"` gives a phone the right keypad,',
          '`dir="ltr"` keeps the number left-to-right inside an RTL page, and typing is filtered by',
          '`filterNumericBeforeInput` — letters never land, and a paste is sanitised to its digits',
          'rather than refused (`12ab3` inserts `123`).',
          '',
          '**The form value is the raw number.** `name` renders a hidden `<input>` carrying',
          '`1234.5`; the visible control has no `name` of its own, so exactly one value is posted',
          'and it is never the locale string.',
          '',
          '**`precision` and `step` follow the currency.** `precision` defaults to the currency’s',
          'own fraction digits — `0` for ISK, `2` for USD, `3` for KWD, read from ICU — and to `2`',
          'otherwise; `step` (what `ArrowUp`/`ArrowDown` move by, ten times that with `Shift`)',
          'defaults to one minor unit of the currency, else `1`.',
          '',
          '**`Enter` commits and does not submit.** The implicit form submission is prevented, the',
          'value is parsed, clamped and reformatted under the caret, and focus stays where it is —',
          'a keystroke that both corrected the value and sent the form would give nobody a chance',
          'to see the correction. A second `Enter` submits as usual.',
          '',
          '**Read-only never enters edit mode and never commits.** A read-only field keeps its',
          'formatted text on focus and writes nothing on blur, which matters most for a value',
          'outside `min`/`max`: committing would silently clamp a number the control promised not',
          'to change.',
          '',
          '**An unparseable entry commits `null`,** the same thing an empty field means — not the',
          'previous value, which would be the control lying about what it holds. Whether that is an',
          '*error* is the caller’s to say, through `invalid` and a `FieldWrapper`’s message.',
          '',
          '**Field wrapper**: inside one it takes its `id`, invalid and required state, and',
          '*composes* `aria-describedby` — own ids first, then the wrapper’s.',
          '',
          '**CSS variables**: `Input`’s, because it is `Input`’s box —',
          '`--eldra-input-radius`, `--eldra-control-font-size`,',
          '`--eldra-control-font-size-mobile`, `--eldra-control-line-height` and',
          '`--eldra-field-border-width`.',
          '',
          "**Messages**: `clear` — the clear button's accessible name.",
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof NumberInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A label, because a numeric field never appears without one. */
const LABEL_CLASS = 'text-label text-text mb-1 block';
const NOTE_CLASS = 'text-body-sm text-muted mt-1';

/** A plain decimal: grouped for reading, two fraction digits, `tabular-nums`. */
export const Decimal: Story = {
  render: () => ({
    components: { NumberInput },
    setup: () => ({ value: ref(1234.5) }),
    template: `
      <div class="max-w-80">
        <label for="story-decimal" class="${LABEL_CLASS}">Weight allowance</label>
        <NumberInput id="story-decimal" v-model="value" :min="0" :max="10000" />
        <p class="${NOTE_CLASS}">Model value: {{ value }}</p>
      </div>
    `,
  }),
};

/** A currency: the symbol comes from `Intl`, not from a prefix this component draws. */
export const Currency: Story = {
  render: () => ({
    components: { NumberInput },
    setup: () => ({ value: ref(1234.5) }),
    template: `
      <div class="max-w-80">
        <label for="story-currency" class="${LABEL_CLASS}">Gift card amount</label>
        <NumberInput
          id="story-currency"
          v-model="value"
          format="currency"
          currency="USD"
          :min="25"
          :max="500"
          name="amount"
        />
        <p class="${NOTE_CLASS}">Posted as {{ value }} — never the formatted string.</p>
      </div>
    `,
  }),
};

/** ISK has no minor unit, so `precision` defaults to 0 and the arrows step a whole króna. */
export const CurrencyIsk: Story = {
  render: () => ({
    components: { NumberInput },
    setup: () => ({ value: ref(12990) }),
    template: `
      <div class="max-w-80">
        <label for="story-isk" class="${LABEL_CLASS}">Verð</label>
        <NumberInput
          id="story-isk"
          v-model="value"
          format="currency"
          currency="ISK"
          locale="is-IS"
          :min="0"
        />
        <p class="${NOTE_CLASS}">is-IS groups with “.” and takes “,” as its decimal point.</p>
      </div>
    `,
  }),
};

/** A unit, through `Intl`'s own `style: 'unit'` — short, narrow or long. */
export const Unit: Story = {
  render: () => ({
    components: { NumberInput },
    setup: () => ({ IconRuler2, weight: ref(2.5), length: ref(120) }),
    template: `
      <div class="flex max-w-80 flex-col gap-4">
        <div>
          <label for="story-unit-kg" class="${LABEL_CLASS}">Parcel weight</label>
          <NumberInput id="story-unit-kg" v-model="weight" format="unit" unit="kilogram"
            :min="0" :step="0.5" />
        </div>
        <div>
          <label for="story-unit-cm" class="${LABEL_CLASS}">Shelf length</label>
          <NumberInput id="story-unit-cm" v-model="length" format="unit" unit="centimeter"
            unit-display="long" :precision="0" :leading-icon="IconRuler2" />
        </div>
      </div>
    `,
  }),
};

/** The three compact-control heights: 2rem, 2.5rem and 3rem — `Input`'s exactly. */
export const Sizes: Story = {
  render: () => ({
    components: { NumberInput },
    template: `
      <div class="flex max-w-80 flex-col gap-4">
        <div>
          <label for="story-n-sm" class="${LABEL_CLASS}">sm — dense filter bars</label>
          <NumberInput id="story-n-sm" size="sm" :model-value="25" format="currency"
            currency="USD" />
        </div>
        <div>
          <label for="story-n-md" class="${LABEL_CLASS}">md — every form</label>
          <NumberInput id="story-n-md" size="md" :model-value="250" format="currency"
            currency="USD" />
        </div>
        <div>
          <label for="story-n-lg" class="${LABEL_CLASS}">lg — a single prominent field</label>
          <NumberInput id="story-n-lg" size="lg" :model-value="2500" format="currency"
            currency="USD" />
        </div>
      </div>
    `,
  }),
};

/** A decorative icon before the value, and a `prefix`/`suffix` slot beside it. */
export const WithLeadingIcon: Story = {
  render: () => ({
    components: { NumberInput },
    setup: () => ({ IconCurrencyDollar, budget: ref(120), rate: ref(7.5) }),
    template: `
      <div class="flex max-w-80 flex-col gap-4">
        <div>
          <label for="story-n-icon" class="${LABEL_CLASS}">Budget</label>
          <NumberInput id="story-n-icon" v-model="budget" :leading-icon="IconCurrencyDollar"
            :min="0" />
        </div>
        <div>
          <label for="story-n-suffix" class="${LABEL_CLASS}">Handling fee</label>
          <NumberInput id="story-n-suffix" v-model="rate" :min="0" :max="100">
            <template #suffix><span class="text-muted text-control-sm pe-1">%</span></template>
          </NumberInput>
        </div>
      </div>
    `,
  }),
};

/** The error state: a 2px `danger` boundary, `aria-invalid`, and a message that says what to do. */
export const Invalid: Story = {
  render: () => ({
    components: { NumberInput },
    setup: () => ({ value: ref(5) }),
    template: `
      <div class="max-w-80">
        <label for="story-n-invalid" class="${LABEL_CLASS}">Gift card amount</label>
        <NumberInput
          id="story-n-invalid"
          v-model="value"
          format="currency"
          currency="USD"
          invalid
          described-by="story-n-invalid-error"
        />
        <p id="story-n-invalid-error" class="text-body-sm text-danger mt-1 flex items-center gap-1">
          <svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          Gift cards start at $25.
        </p>
      </div>
    `,
  }),
};

/** Disabled: `surface-strong`, a dashed decorative border, and skipped by `Tab`. */
export const Disabled: Story = {
  render: () => ({
    components: { NumberInput },
    template: `
      <div class="max-w-80">
        <label for="story-n-disabled" class="${LABEL_CLASS}">Wholesale price</label>
        <NumberInput id="story-n-disabled" :model-value="18.4" format="currency" currency="USD"
          disabled />
      </div>
    `,
  }),
};

/** Read-only: still focusable and selectable, which is why it is never a disabled field. */
export const ReadOnly: Story = {
  render: () => ({
    components: { NumberInput },
    template: `
      <div class="max-w-80">
        <label for="story-n-readonly" class="${LABEL_CLASS}">Amount paid</label>
        <NumberInput id="story-n-readonly" :model-value="96" format="currency" currency="USD"
          readonly />
        <p class="${NOTE_CLASS}">Read-only: copied from your confirmation email.</p>
      </div>
    `,
  }),
};

/** A 20rem container: the field fills its column, with no horizontal scroll. */
export const Narrow: Story = {
  render: () => ({
    components: { NumberInput },
    setup: () => ({ value: ref(1234567.89) }),
    template: `
      <div class="border-border w-80 border p-4">
        <label for="story-n-narrow" class="${LABEL_CLASS}">Inventory value</label>
        <NumberInput id="story-n-narrow" v-model="value" format="currency" currency="USD"
          clearable />
      </div>
    `,
  }),
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in `--forced-colors`
 * with Playwright's `forcedColors: 'active'` emulation: the borders stay real borders, and the
 * error boundary falls back to `CanvasText` because `danger` is not rendered.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { NumberInput },
    setup: () => ({ price: ref(96), low: ref(5) }),
    template: `
      <div class="flex max-w-80 flex-col gap-4">
        <div>
          <label for="story-n-fc" class="${LABEL_CLASS}">Amount</label>
          <NumberInput id="story-n-fc" v-model="price" format="currency" currency="USD"
            clearable />
        </div>
        <div>
          <label for="story-n-fc-invalid" class="${LABEL_CLASS}">Gift card amount</label>
          <NumberInput id="story-n-fc-invalid" v-model="low" format="currency" currency="USD"
            invalid />
        </div>
        <div>
          <label for="story-n-fc-disabled" class="${LABEL_CLASS}">Wholesale price</label>
          <NumberInput id="story-n-fc-disabled" :model-value="18.4" format="currency"
            currency="USD" disabled />
        </div>
      </div>
    `,
  }),
};
