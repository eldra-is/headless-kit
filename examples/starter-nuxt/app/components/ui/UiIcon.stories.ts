import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiIcon from './UiIcon.vue';

const meta: Meta<typeof UiIcon> = {
  title: 'Primitives/UiIcon',
  component: UiIcon,
  args: { name: 'bolt' },
  argTypes: { name: { control: 'text' } },
};
export default meta;

type Story = StoryObj<typeof UiIcon>;

export const Bolt: Story = { args: { name: 'bolt' } };
export const Lock: Story = { args: { name: 'lock' } };
export const Unknown: Story = { args: { name: 'does-not-exist-xyz' } };
