import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiSection from './UiSection.vue';

const meta: Meta<typeof UiSection> = {
  title: 'Primitives/UiSection',
  component: UiSection,
  args: { spacing: 'md', background: 'none', containerSize: 'content' },
  argTypes: {
    spacing: { control: 'select', options: ['none', 'sm', 'md', 'lg'] },
    background: {
      control: 'select',
      options: ['none', 'surface', 'surface-strong', 'primary', 'accent'],
    },
    containerSize: { control: 'select', options: ['narrow', 'content', 'wide', 'full'] },
  },
  render: (args) => ({
    components: { UiSection },
    setup: () => ({ args }),
    template:
      '<UiSection v-bind="args"><h2>Section heading</h2><p>Section body copy.</p></UiSection>',
  }),
};
export default meta;

type Story = StoryObj<typeof UiSection>;

export const Default: Story = {};
export const Surface: Story = { args: { background: 'surface' } };
export const SurfaceStrong: Story = { args: { background: 'surface-strong' } };
export const Primary: Story = { args: { background: 'primary' } };
export const Accent: Story = { args: { background: 'accent' } };
export const SpacingLarge: Story = { args: { spacing: 'lg' } };
