import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import UiDialog from './UiDialog.vue';
import UiButton from './UiButton.vue';

const meta: Meta<typeof UiDialog> = {
  title: 'Primitives/UiDialog',
  component: UiDialog,
  args: { title: 'Delete product', persistent: false },
  argTypes: {
    title: { control: 'text' },
    persistent: { control: 'boolean' },
  },
  render: (args) => ({
    components: { UiDialog, UiButton },
    setup: () => ({ args, open: ref(false) }),
    template: `
      <div>
        <UiButton @click="open = true">Open dialog</UiButton>
        <UiDialog v-bind="args" v-model:open="open">
          <p>Deleting "Woven Storage Basket" cannot be undone.</p>
        </UiDialog>
      </div>
    `,
  }),
};
export default meta;

type Story = StoryObj<typeof UiDialog>;

export const Default: Story = {};

export const Persistent: Story = {
  args: { persistent: true },
};

export const OpenByDefault: Story = {
  render: (args) => ({
    components: { UiDialog },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <UiDialog v-bind="args" v-model:open="open">
        <p>Deleting "Woven Storage Basket" cannot be undone.</p>
      </UiDialog>
    `,
  }),
};
