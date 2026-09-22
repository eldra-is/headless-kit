import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiInput from './UiInput.vue';

const meta: Meta<typeof UiInput> = {
  title: 'Primitives/UiInput',
  component: UiInput,
  args: { label: 'Email address', type: 'email', placeholder: 'you@example.com' },
  argTypes: {
    label: { control: 'text' },
    hideLabel: { control: 'boolean' },
    description: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'search', 'tel', 'url'],
    },
  },
  render: (args) => ({
    components: { UiInput },
    setup: () => ({ args }),
    template: '<UiInput v-bind="args" class="max-w-sm" />',
  }),
};
export default meta;

type Story = StoryObj<typeof UiInput>;

export const Default: Story = {};
export const WithDescription: Story = { args: { description: 'We never share your email.' } };
export const WithError: Story = { args: { error: 'Enter a valid email address.' } };
export const Required: Story = { args: { required: true } };
export const Disabled: Story = { args: { disabled: true } };
export const HiddenLabel: Story = {
  args: { label: 'Search', hideLabel: true, type: 'search', placeholder: 'Search products…' },
};
