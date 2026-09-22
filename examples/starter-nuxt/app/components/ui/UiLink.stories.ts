import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiLink from './UiLink.vue';

const meta: Meta<typeof UiLink> = {
  title: 'Primitives/UiLink',
  component: UiLink,
  args: { href: '/about' },
  argTypes: {
    href: { control: 'text' },
    external: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof UiLink>;

export const Internal: Story = {
  args: { href: '/about' },
  render: (args) => ({
    components: { UiLink },
    setup: () => ({ args }),
    template: '<UiLink v-bind="args">Internal link</UiLink>',
  }),
};

export const External: Story = {
  args: { href: 'https://example.com' },
  render: (args) => ({
    components: { UiLink },
    setup: () => ({ args }),
    template: '<UiLink v-bind="args" target="_blank">External link</UiLink>',
  }),
};

export const Unsafe: Story = {
  args: { href: 'javascript:alert(1)' },
  render: (args) => ({
    components: { UiLink },
    setup: () => ({ args }),
    template: '<UiLink v-bind="args">Renders as a span</UiLink>',
  }),
};
