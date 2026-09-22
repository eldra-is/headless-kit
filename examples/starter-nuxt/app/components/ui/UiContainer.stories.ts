import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiContainer from './UiContainer.vue';

const meta: Meta<typeof UiContainer> = {
  title: 'Primitives/UiContainer',
  component: UiContainer,
  args: { size: 'content' },
  argTypes: {
    size: { control: 'select', options: ['narrow', 'content', 'wide', 'full'] },
  },
  render: (args) => ({
    components: { UiContainer },
    setup: () => ({ args }),
    template:
      '<UiContainer v-bind="args" class="bg-surface"><p class="py-8">Container content</p></UiContainer>',
  }),
};
export default meta;

type Story = StoryObj<typeof UiContainer>;

export const Narrow: Story = { args: { size: 'narrow' } };
export const Content: Story = { args: { size: 'content' } };
export const Wide: Story = { args: { size: 'wide' } };
export const Full: Story = { args: { size: 'full' } };
