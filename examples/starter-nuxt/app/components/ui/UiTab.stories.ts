import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import UiTabs from './UiTabs.vue';
import UiTab from './UiTab.vue';

// `UiTab` requires an ancestor `UiTabs` for its injected context (see
// `UiTab.vue`), so its story renders through a minimal `UiTabs` the same
// way a real page would, rather than in isolation.
const meta: Meta<typeof UiTab> = {
  title: 'Primitives/UiTab',
  component: UiTab,
  args: { id: 'a', disabled: false },
  argTypes: { id: { control: 'text' }, disabled: { control: 'boolean' } },
  render: (args) => ({
    components: { UiTabs, UiTab },
    setup: () => ({ args, selected: ref('a') }),
    template: `
      <UiTabs v-model="selected" label="Example">
        <template #tabs>
          <UiTab v-bind="args">Tab label</UiTab>
          <UiTab id="b">Another tab</UiTab>
        </template>
      </UiTabs>
    `,
  }),
};
export default meta;

type Story = StoryObj<typeof UiTab>;

export const Selected: Story = {};
export const Disabled: Story = { args: { disabled: true } };
