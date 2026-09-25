import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import UiDrawer from './UiDrawer.vue';
import { Button } from '@eldrajs/ui';

const meta: Meta<typeof UiDrawer> = {
  title: 'Primitives/UiDrawer',
  component: UiDrawer,
  args: { title: 'Menu', side: 'right' },
  argTypes: {
    title: { control: 'text' },
    side: { control: 'select', options: ['left', 'right'] },
    persistent: { control: 'boolean' },
  },
  render: (args) => ({
    components: { UiDrawer, Button },
    setup: () => ({ args, open: ref(false) }),
    template: `
      <div>
        <Button variant="primary" @click="open = true">Open drawer</Button>
        <UiDrawer v-bind="args" v-model:open="open">
          <nav class="flex flex-col gap-3">
            <a href="#" class="text-text">Home</a>
            <a href="#" class="text-text">Shop</a>
            <a href="#" class="text-text">About</a>
          </nav>
        </UiDrawer>
      </div>
    `,
  }),
};
export default meta;

type Story = StoryObj<typeof UiDrawer>;

export const Right: Story = {};
export const Left: Story = { args: { side: 'left' } };
