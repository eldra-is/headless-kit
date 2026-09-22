import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiTextarea from './UiTextarea.vue';

const meta: Meta<typeof UiTextarea> = {
  title: 'Primitives/UiTextarea',
  component: UiTextarea,
  args: { label: 'Message', placeholder: 'How can we help?' },
  argTypes: {
    label: { control: 'text' },
    hideLabel: { control: 'boolean' },
    description: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    rows: { control: 'number' },
  },
  render: (args) => ({
    components: { UiTextarea },
    setup: () => ({ args }),
    template: '<UiTextarea v-bind="args" class="max-w-sm" />',
  }),
};
export default meta;

type Story = StoryObj<typeof UiTextarea>;

export const Default: Story = {};
export const WithDescription: Story = { args: { description: 'Maximum 500 characters.' } };
export const WithError: Story = { args: { error: 'Message is required.' } };
export const Tall: Story = { args: { rows: 8 } };
