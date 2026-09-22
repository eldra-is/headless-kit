import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import UiTabs from './UiTabs.vue';
import UiTab from './UiTab.vue';
import UiTabPanel from './UiTabPanel.vue';

// Same note as `UiTab.stories.ts`: `UiTabPanel` needs an ancestor `UiTabs`.
const meta: Meta<typeof UiTabPanel> = {
  title: 'Primitives/UiTabPanel',
  component: UiTabPanel,
  args: { id: 'a' },
  argTypes: { id: { control: 'text' } },
  render: (args) => ({
    components: { UiTabs, UiTab, UiTabPanel },
    setup: () => ({ args, selected: ref('a') }),
    template: `
      <UiTabs v-model="selected" label="Example">
        <template #tabs>
          <UiTab id="a">Tab A</UiTab>
        </template>
        <UiTabPanel v-bind="args">Panel content for tab A.</UiTabPanel>
      </UiTabs>
    `,
  }),
};
export default meta;

type Story = StoryObj<typeof UiTabPanel>;

export const Visible: Story = {};
