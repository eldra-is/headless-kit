import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiCheckbox from './UiCheckbox.vue';

const meta: Meta<typeof UiCheckbox> = {
  title: 'Primitives/UiCheckbox',
  component: UiCheckbox,
  args: { label: 'Subscribe to our newsletter' },
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    modelValue: { control: 'boolean' },
  },
  render: (args) => ({
    components: { UiCheckbox },
    setup: () => ({ args }),
    template: '<UiCheckbox v-bind="args" />',
  }),
};
export default meta;

type Story = StoryObj<typeof UiCheckbox>;

export const Default: Story = {};
export const Checked: Story = { args: { modelValue: true } };
export const WithDescription: Story = {
  args: { description: 'Occasional product news, no spam.' },
};
export const WithError: Story = { args: { error: 'You must accept to continue.' } };
export const Disabled: Story = { args: { disabled: true } };
