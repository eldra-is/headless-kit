import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiRating from './UiRating.vue';

const meta: Meta<typeof UiRating> = {
  title: 'Primitives/UiRating',
  component: UiRating,
  args: { value: 4 },
  argTypes: {
    value: { control: { type: 'range', min: 0, max: 5, step: 0.5 } },
    count: { control: 'number' },
  },
};
export default meta;

type Story = StoryObj<typeof UiRating>;

export const Default: Story = { args: { value: 4 } };
export const WithCount: Story = { args: { value: 4.5, count: 128 } };
export const Empty: Story = { args: { value: 0 } };
export const Full: Story = { args: { value: 5, count: 2041 } };
