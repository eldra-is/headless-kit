import { IconRuler2 } from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import UnitInput from './UnitInput.vue';

/**
 * One story per state. `UnitInput` is an **addition beyond design spec 1** (which has no editable
 * numeric field at all) and a one-to-one port of Eldra's private component library, so there is no
 * reference image for it — the review target is `eldra-starter-spec/images/core/input.png`, because
 * the box, the sizes and every state are `Input`'s, imported rather than copied.
 */
const meta = {
  title: 'Forms/UnitInput',
  component: UnitInput,
  tags: ['autodocs'],
  args: { size: 'md', unit: 'kilometer', locale: 'en-US' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    leadingIcon: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A unit field: a number on one side, and an `Intl`-formatted string in the field at all',
          'times. **An addition beyond the design spec**, which has no editable numeric field, and',
          'a one-to-one port of the field Eldra’s private component library ships — so a store',
          'that knows that field knows this one.',
          '',
          '**The field is always formatted.** There is no editing mode and no focus-dependent',
          'text: focused or not, the field shows `1,234 km`, `$1,234.5` or `1.234 kr.`. Every',
          'keystroke reformats it, and the caret is mapped through the new text by *numeric',
          'content* — count the digits before the caret, then walk the reformatted string until as',
          'many have gone by — so a group separator can appear to the left of the caret without',
          'the caret moving.',
          '',
          '**Parts** (`data-part`, and the keys of `classes`): `root`, `label`, `field`,',
          '`leadingIcon`, `control`, `suffix`, `dragHandle`, `clearButton`. **Slots**:',
          '`leadingIcon`, `suffix`.',
          '',
          '**Keyboard.** `ArrowUp`/`ArrowDown` step by `step`, clamped to `min`/`max`;',
          '`ArrowLeft`/`ArrowRight` skip the characters that are not digits; `Backspace` and',
          '`Delete` step over separators and never eat the symbol; `,` and `.` both insert the',
          'locale’s own decimal separator, and a second one is refused; Ctrl/Cmd+A selects the',
          'digits only, as a double-click does; Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo and redo.',
          '',
          '**Emptying the field keeps it empty** while you are still in it, so an amount can be',
          'retyped from scratch; leaving it falls back to the formatted `min`.',
          '',
          '**`type="text"`, not `type="number"`** — the same reason `QuantityStepper` is: a native',
          'number input’s DOM value can only ever be the ungrouped US grammar, so it cannot hold',
          '`is-IS`’s `1.234` at all. `inputmode="decimal"` gives a phone the right keypad.',
          'Typing is **not** filtered the way `QuantityStepper`’s is: a letter lands and the',
          'reformat removes it, because this field’s own text is full of characters that are not',
          'digits.',
          '',
          '**The form value is the raw number.** `name` renders a hidden `<input>` carrying',
          '`1234.5`; the visible control has no `name` of its own.',
          '',
          '**Locale.** The `locale` prop wins; with none, the field formats in whatever',
          '`provideEldraUiLocale()` set for the app, and in `en-US` with nothing provided.',
          '',
          '**Field wrapper**: inside one it takes its `id`, invalid and required state, and',
          '*composes* `aria-describedby` — own ids first, then the wrapper’s. The `label` prop is',
          'drawn only when nothing above the field names it.',
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
} satisfies Meta<typeof UnitInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const LABEL_CLASS = 'text-label text-text mb-1 block';
const NOTE_CLASS = 'text-body-sm text-muted mt-1';

/** The default: a distance in kilometres, formatted in the field as it is typed. */
export const Default: Story = {
  render: () => ({
    components: { UnitInput },
    setup: () => ({ value: ref(1234.5), formatted: ref('') }),
    template: `
      <div class="max-w-80">
        <label for="story-unit-default" class="${LABEL_CLASS}">Trip distance</label>
        <UnitInput id="story-unit-default" v-model="value" unit="kilometer" :max="100000"
          @update:formatted-value="formatted = $event" />
        <p class="${NOTE_CLASS}">Model value: {{ value }} — formatted: {{ formatted }}</p>
      </div>
    `,
  }),
};

/** A currency: the symbol, its side and the grouping are all the locale's, through `Intl`. */
export const Currency: Story = {
  render: () => ({
    components: { UnitInput },
    setup: () => ({ value: ref(1234.5) }),
    template: `
      <div class="max-w-80">
        <label for="story-unit-currency" class="${LABEL_CLASS}">Gift card amount</label>
        <UnitInput id="story-unit-currency" v-model="value" is-currency currency="USD"
          name="amount" :max="500" />
        <p class="${NOTE_CLASS}">Posted as {{ value }} — never the formatted string.</p>
      </div>
    `,
  }),
};

/** `is-IS` groups with “.”, takes “,” as its decimal point, and puts the symbol last. */
export const CurrencyIsk: Story = {
  render: () => ({
    components: { UnitInput },
    setup: () => ({ value: ref(12990) }),
    template: `
      <div class="max-w-80">
        <label for="story-unit-isk" class="${LABEL_CLASS}">Verð</label>
        <UnitInput id="story-unit-isk" v-model="value" is-currency currency="ISK" locale="is-IS" />
      </div>
    `,
  }),
};

/** Any `Intl` unit identifier, with a leading icon on the second field. */
export const Unit: Story = {
  render: () => ({
    components: { UnitInput },
    setup: () => ({ IconRuler2, weight: ref(2.5), length: ref(120) }),
    template: `
      <div class="flex max-w-80 flex-col gap-4">
        <div>
          <label for="story-unit-kg" class="${LABEL_CLASS}">Parcel weight</label>
          <UnitInput id="story-unit-kg" v-model="weight" unit="kilogram" :step="0.5" />
        </div>
        <div>
          <label for="story-unit-cm" class="${LABEL_CLASS}">Shelf length</label>
          <UnitInput id="story-unit-cm" v-model="length" unit="centimeter" :max-fraction="0"
            :leading-icon="IconRuler2" />
        </div>
      </div>
    `,
  }),
};

/** The three compact-control heights: 2rem, 2.5rem and 3rem — `Input`'s exactly. */
export const Sizes: Story = {
  render: () => ({
    components: { UnitInput },
    template: `
      <div class="flex max-w-80 flex-col gap-4">
        <div>
          <label for="story-unit-sm" class="${LABEL_CLASS}">sm — dense filter bars</label>
          <UnitInput id="story-unit-sm" size="sm" :model-value="25" is-currency currency="USD" />
        </div>
        <div>
          <label for="story-unit-md" class="${LABEL_CLASS}">md — every form</label>
          <UnitInput id="story-unit-md" size="md" :model-value="250" is-currency currency="USD" />
        </div>
        <div>
          <label for="story-unit-lg" class="${LABEL_CLASS}">lg — a single prominent field</label>
          <UnitInput id="story-unit-lg" size="lg" :model-value="2500" is-currency currency="USD" />
        </div>
      </div>
    `,
  }),
};

/** The clear button empties the field to `null` and returns focus to it. */
export const Clearable: Story = {
  render: () => ({
    components: { UnitInput },
    setup: () => ({ value: ref(1234.5) }),
    template: `
      <div class="max-w-80">
        <label for="story-unit-clearable" class="${LABEL_CLASS}">Maximum weight</label>
        <UnitInput id="story-unit-clearable" v-model="value" unit="kilogram" clearable />
        <p class="${NOTE_CLASS}">Model value: {{ value === null ? 'null' : value }}</p>
      </div>
    `,
  }),
};

/** A pointer-only handle: drag it up or down to move the value by `step` every few pixels. */
export const DragAdjust: Story = {
  render: () => ({
    components: { UnitInput },
    setup: () => ({ value: ref(120) }),
    template: `
      <div class="max-w-80">
        <label for="story-unit-drag" class="${LABEL_CLASS}">Shelf length</label>
        <UnitInput id="story-unit-drag" v-model="value" unit="centimeter" :step="5"
          enable-drag-adjust />
        <p class="${NOTE_CLASS}">
          Drag the handle vertically. Every value it reaches is also reachable with the arrow keys,
          which is why the handle itself is out of the tab order.
        </p>
      </div>
    `,
  }),
};

/** The error state: a 2px `danger` boundary, `aria-invalid`, and a message that says what to do. */
export const Invalid: Story = {
  render: () => ({
    components: { UnitInput },
    setup: () => ({ value: ref(5) }),
    template: `
      <div class="max-w-80">
        <label for="story-unit-invalid" class="${LABEL_CLASS}">Gift card amount</label>
        <UnitInput id="story-unit-invalid" v-model="value" is-currency currency="USD" invalid
          described-by="story-unit-invalid-error" />
        <p id="story-unit-invalid-error" class="text-body-sm text-danger mt-1 flex items-center gap-1">
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
    components: { UnitInput },
    template: `
      <div class="max-w-80">
        <label for="story-unit-disabled" class="${LABEL_CLASS}">Wholesale price</label>
        <UnitInput id="story-unit-disabled" :model-value="18.4" is-currency currency="USD"
          disabled />
      </div>
    `,
  }),
};

/** Read-only: still focusable and selectable, and nothing in it can be edited or dragged. */
export const ReadOnly: Story = {
  render: () => ({
    components: { UnitInput },
    template: `
      <div class="max-w-80">
        <label for="story-unit-readonly" class="${LABEL_CLASS}">Amount paid</label>
        <UnitInput id="story-unit-readonly" :model-value="96" is-currency currency="USD" readonly
          clearable enable-drag-adjust />
        <p class="${NOTE_CLASS}">Read-only: copied from your confirmation email.</p>
      </div>
    `,
  }),
};

/** A 20rem container: the field fills its column, with no horizontal scroll. */
export const Narrow: Story = {
  render: () => ({
    components: { UnitInput },
    setup: () => ({ value: ref(1234567.89) }),
    template: `
      <div class="border-border w-80 border p-4">
        <label for="story-unit-narrow" class="${LABEL_CLASS}">Inventory value</label>
        <UnitInput id="story-unit-narrow" v-model="value" is-currency currency="USD" clearable
          enable-drag-adjust />
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
    components: { UnitInput },
    setup: () => ({ price: ref(96), low: ref(5) }),
    template: `
      <div class="flex max-w-80 flex-col gap-4">
        <div>
          <label for="story-unit-fc" class="${LABEL_CLASS}">Amount</label>
          <UnitInput id="story-unit-fc" v-model="price" is-currency currency="USD" clearable
            enable-drag-adjust />
        </div>
        <div>
          <label for="story-unit-fc-invalid" class="${LABEL_CLASS}">Gift card amount</label>
          <UnitInput id="story-unit-fc-invalid" v-model="low" is-currency currency="USD" invalid />
        </div>
        <div>
          <label for="story-unit-fc-disabled" class="${LABEL_CLASS}">Wholesale price</label>
          <UnitInput id="story-unit-fc-disabled" :model-value="18.4" is-currency currency="USD"
            disabled />
        </div>
      </div>
    `,
  }),
};
