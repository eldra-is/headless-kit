import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import CurrencyPicker from './CurrencyPicker.vue';

const meta = {
  title: 'Commerce/CurrencyPicker',
  component: CurrencyPicker,
  tags: ['autodocs'],
  args: { currencies: ['ISK', 'EUR', 'USD'], modelValue: 'EUR' },
  parameters: {
    docs: {
      description: {
        component:
          'The currency a visitor shops in: a `Select` of full names with the code ("Euro (EUR)"), the code alone when closed. Renders nothing with fewer than two currencies. **Parts**: `root` plus every `Select` part.',
      },
    },
  },
  render: (args) => ({
    components: { CurrencyPicker },
    setup: () => ({ args, value: ref(args.modelValue) }),
    template: '<CurrencyPicker v-bind="args" v-model="value" />',
  }),
} satisfies Meta<typeof CurrencyPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const LabelShown: Story = { args: { showLabel: true, size: 'md' } };
export const Icelandic: Story = { args: { locale: 'is-IS', modelValue: 'ISK' } };
