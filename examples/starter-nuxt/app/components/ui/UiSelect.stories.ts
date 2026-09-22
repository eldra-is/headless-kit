import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiSelect from './UiSelect.vue';

const meta: Meta<typeof UiSelect> = {
  title: 'Primitives/UiSelect',
  component: UiSelect,
  args: { label: 'Country', placeholder: 'Choose a country' },
  argTypes: {
    label: { control: 'text' },
    hideLabel: { control: 'boolean' },
    description: { control: 'text' },
    error: { control: 'text' },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  render: (args) => ({
    components: { UiSelect },
    setup: () => ({ args }),
    template: `
      <UiSelect v-bind="args" class="max-w-sm">
        <option value="is">Iceland</option>
        <option value="no">Norway</option>
        <option value="dk">Denmark</option>
      </UiSelect>
    `,
  }),
};
export default meta;

type Story = StoryObj<typeof UiSelect>;

export const Default: Story = {};
export const WithError: Story = { args: { error: 'Select a country.' } };
export const Disabled: Story = { args: { disabled: true } };
