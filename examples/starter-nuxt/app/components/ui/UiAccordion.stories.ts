import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiAccordion from './UiAccordion.vue';
import UiAccordionItem from './UiAccordionItem.vue';

const FAQ = [
  {
    title: 'What is your return policy?',
    body: 'Returns are accepted within 30 days of delivery, in original condition.',
  },
  {
    title: 'How long does shipping take?',
    body: 'Orders ship within 2 business days and arrive in 3-5 days domestically.',
  },
  {
    title: 'Do you ship internationally?',
    body: 'Yes — Northwind Goods ships to most countries at checkout-calculated rates.',
  },
];

const meta: Meta<typeof UiAccordion> = {
  title: 'Primitives/UiAccordion',
  component: UiAccordion,
  args: { single: false },
  argTypes: { single: { control: 'boolean' } },
  render: (args) => ({
    components: { UiAccordion, UiAccordionItem },
    setup: () => ({ args, faq: FAQ }),
    template: `
      <UiAccordion v-bind="args" class="max-w-md">
        <UiAccordionItem v-for="item in faq" :key="item.title" :title="item.title">
          {{ item.body }}
        </UiAccordionItem>
      </UiAccordion>
    `,
  }),
};
export default meta;

type Story = StoryObj<typeof UiAccordion>;

export const Multiple: Story = {};
export const Single: Story = { args: { single: true } };
