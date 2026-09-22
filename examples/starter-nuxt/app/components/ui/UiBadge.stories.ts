import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiBadge from './UiBadge.vue';

const meta: Meta<typeof UiBadge> = {
  title: 'Primitives/UiBadge',
  component: UiBadge,
  args: { tone: 'neutral' },
  argTypes: {
    tone: {
      control: 'select',
      options: ['neutral', 'primary', 'accent', 'success', 'warning', 'danger'],
    },
  },
  render: (args) => ({
    components: { UiBadge },
    setup: () => ({ args }),
    template: '<UiBadge v-bind="args">Badge</UiBadge>',
  }),
};
export default meta;

type Story = StoryObj<typeof UiBadge>;

export const Neutral: Story = { args: { tone: 'neutral' } };
export const Primary: Story = { args: { tone: 'primary' } };
export const Accent: Story = { args: { tone: 'accent' } };
export const Success: Story = { args: { tone: 'success' } };
export const Warning: Story = { args: { tone: 'warning' } };
export const Danger: Story = { args: { tone: 'danger' } };
