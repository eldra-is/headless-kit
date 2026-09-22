import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiAccordionItem from './UiAccordionItem.vue';

const meta: Meta<typeof UiAccordionItem> = {
  title: 'Primitives/UiAccordionItem',
  component: UiAccordionItem,
  args: { title: 'What is your return policy?' },
  argTypes: {
    title: { control: 'text' },
    defaultOpen: { control: 'boolean' },
  },
  render: (args) => ({
    components: { UiAccordionItem },
    setup: () => ({ args }),
    template:
      '<UiAccordionItem v-bind="args" class="border-border max-w-md rounded-theme-md border">Returns are accepted within 30 days of delivery, in original condition.</UiAccordionItem>',
  }),
};
export default meta;

type Story = StoryObj<typeof UiAccordionItem>;

export const Closed: Story = {};
export const Open: Story = { args: { defaultOpen: true } };
