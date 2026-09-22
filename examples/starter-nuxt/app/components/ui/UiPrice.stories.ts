import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiPrice from './UiPrice.vue';

const meta: Meta<typeof UiPrice> = {
  title: 'Primitives/UiPrice',
  component: UiPrice,
  args: { amount: 48, currency: 'USD', locale: 'en-US' },
  argTypes: {
    amount: { control: 'number' },
    compareAt: { control: 'number' },
    currency: { control: 'text' },
    locale: { control: 'text' },
  },
};
export default meta;

type Story = StoryObj<typeof UiPrice>;

export const Regular: Story = {};
export const OnSale: Story = { args: { amount: 36, compareAt: 48 } };
export const Icelandic: Story = { args: { amount: 6990, currency: 'ISK', locale: 'is-IS' } };
