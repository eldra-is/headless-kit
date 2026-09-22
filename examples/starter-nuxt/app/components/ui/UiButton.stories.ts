import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiButton from './UiButton.vue';

const meta: Meta<typeof UiButton> = {
  title: 'Primitives/UiButton',
  component: UiButton,
  args: { variant: 'primary', size: 'md', loading: false, disabled: false },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'outline', 'ghost', 'link'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    href: { control: 'text' },
  },
  render: (args) => ({
    components: { UiButton },
    setup: () => ({ args }),
    template: '<UiButton v-bind="args">Button</UiButton>',
  }),
};
export default meta;

type Story = StoryObj<typeof UiButton>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Outline: Story = { args: { variant: 'outline' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Link: Story = { args: { variant: 'link' } };
export const Small: Story = { args: { size: 'sm' } };
export const Large: Story = { args: { size: 'lg' } };
export const Loading: Story = { args: { loading: true } };
export const Disabled: Story = { args: { disabled: true } };
export const AsLink: Story = {
  args: { href: '/contact' },
  render: (args) => ({
    components: { UiButton },
    setup: () => ({ args }),
    template: '<UiButton v-bind="args">Contact us</UiButton>',
  }),
};
