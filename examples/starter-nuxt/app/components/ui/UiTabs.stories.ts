import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import UiTabs from './UiTabs.vue';
import UiTab from './UiTab.vue';
import UiTabPanel from './UiTabPanel.vue';

const meta: Meta<typeof UiTabs> = {
  title: 'Primitives/UiTabs',
  component: UiTabs,
  args: { label: 'Product information' },
  argTypes: { label: { control: 'text' } },
  render: (args) => ({
    components: { UiTabs, UiTab, UiTabPanel },
    setup: () => ({ args, selected: ref('details') }),
    template: `
      <UiTabs v-bind="args" v-model="selected" class="max-w-md">
        <template #tabs>
          <UiTab id="details">Details</UiTab>
          <UiTab id="shipping">Shipping</UiTab>
          <UiTab id="reviews" disabled>Reviews</UiTab>
        </template>
        <UiTabPanel id="details">Solid oak frame, hand-finished, seats up to six.</UiTabPanel>
        <UiTabPanel id="shipping">Ships within 2 business days, free over $75.</UiTabPanel>
        <UiTabPanel id="reviews">Reviews are temporarily unavailable.</UiTabPanel>
      </UiTabs>
    `,
  }),
};
export default meta;

type Story = StoryObj<typeof UiTabs>;

export const Default: Story = {};
