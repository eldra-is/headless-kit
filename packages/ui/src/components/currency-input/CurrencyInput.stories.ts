import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import CurrencyInput from './CurrencyInput.vue';

/**
 * `CurrencyInput` is `UnitInput` with `isCurrency` always on — see that component's docs page for
 * the formatting, the caret and the keyboard, all of which are its.
 */
const meta = {
  title: 'Forms/CurrencyInput',
  component: CurrencyInput,
  tags: ['autodocs'],
  args: { size: 'md', currency: 'USD', locale: 'en-US' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    leadingIcon: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A money field — `UnitInput` with `isCurrency` always on, and the same twenty-line',
          'wrapper Eldra’s private component library ships. Everything else is `UnitInput`’s: the',
          'live formatting, the caret mapping, the drag handle, the clear button, the parts and',
          'the field context. See its docs page.',
          '',
          '`currency` defaults to `USD` and `narrowSymbol` to `true`, so `$` is shown rather than',
          '`US$` where a locale distinguishes the two. The symbol’s **side** is the locale’s:',
          '`$1,234.5` under `en-US`, `1.234,5 kr.` under `is-IS`.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof CurrencyInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const LABEL_CLASS = 'text-label text-text mb-1 block';
const NOTE_CLASS = 'text-body-sm text-muted mt-1';

/** The default: US dollars, symbol first. */
export const Default: Story = {
  render: () => ({
    components: { CurrencyInput },
    setup: () => ({ value: ref(1234.5) }),
    template: `
      <div class="max-w-80">
        <label for="story-currency-default" class="${LABEL_CLASS}">Gift card amount</label>
        <CurrencyInput id="story-currency-default" v-model="value" currency="USD" name="amount"
          clearable />
        <p class="${NOTE_CLASS}">Posted as {{ value }} — never the formatted string.</p>
      </div>
    `,
  }),
};

/** Icelandic krónur: grouped with “.”, decimal “,” and the symbol last. */
export const Isk: Story = {
  render: () => ({
    components: { CurrencyInput },
    setup: () => ({ value: ref(12990) }),
    template: `
      <div class="max-w-80">
        <label for="story-currency-isk" class="${LABEL_CLASS}">Verð</label>
        <CurrencyInput id="story-currency-isk" v-model="value" currency="ISK" locale="is-IS" />
      </div>
    `,
  }),
};

/** A 20rem container: the field fills its column, with no horizontal scroll. */
export const Narrow: Story = {
  render: () => ({
    components: { CurrencyInput },
    setup: () => ({ value: ref(1234567.89) }),
    template: `
      <div class="border-border w-80 border p-4">
        <label for="story-currency-narrow" class="${LABEL_CLASS}">Inventory value</label>
        <CurrencyInput id="story-currency-narrow" v-model="value" currency="USD" clearable />
      </div>
    `,
  }),
};
