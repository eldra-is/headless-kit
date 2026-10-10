import type { Meta, StoryObj } from '@storybook/vue3-vite';
import UiImage from './UiImage.vue';

const meta: Meta<typeof UiImage> = {
  title: 'Primitives/UiImage',
  component: UiImage,
  args: { src: '/demo/hero.svg', alt: 'A bright, tidy living room styled by Northwind Goods' },
  argTypes: {
    src: { control: 'text' },
    alt: { control: 'text' },
    aspect: { control: 'text' },
    sizes: { control: 'text' },
    priority: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<typeof UiImage>;

export const Default: Story = {};

export const WithAspectRatio: Story = { args: { aspect: '16/9' } };

export const Priority: Story = { args: { priority: true } };

export const Framed: Story = {
  args: { framing: { x: 0.3, y: 0.6, zoom: 1.4 }, aspect: '4/3' },
};

export const Decorative: Story = { args: { alt: '' } };
