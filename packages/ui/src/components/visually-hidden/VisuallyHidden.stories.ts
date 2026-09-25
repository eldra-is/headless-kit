import type { Meta, StoryObj } from '@storybook/vue3-vite';
import VisuallyHidden from './VisuallyHidden.vue';

const meta = {
  title: 'Foundations/VisuallyHidden',
  component: VisuallyHidden,
  args: { as: 'span', focusable: false },
  parameters: {
    docs: {
      description: {
        component:
          'Content that screen readers read but nobody sees — the accessible name of an ' +
          'icon-only control, a live region, a form legend. `focusable` reveals it while it ' +
          'has focus, which is how a skip link works.',
      },
    },
  },
} satisfies Meta<typeof VisuallyHidden>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Hidden: the story renders the sentence around it, not the hidden text. */
export const Default: Story = {
  render: (args) => ({
    components: { VisuallyHidden },
    setup: () => ({ args }),
    template: `
      <p class="text-body">
        Added to cart<VisuallyHidden v-bind="args">, 2 items</VisuallyHidden>.
      </p>
    `,
  }),
};

/**
 * A skip link: invisible until it takes focus, then a normal, visible control.
 * Tab into the preview to see it.
 */
export const Focusable: Story = {
  args: { as: 'a', focusable: true },
  render: (args) => ({
    components: { VisuallyHidden },
    setup: () => ({ args }),
    template: `
      <div class="text-body">
        <VisuallyHidden
          v-bind="args"
          href="#content"
          :classes="{ root: 'focus:eldra-focus focus:bg-surface focus:px-4 focus:py-2' }"
        >
          Skip to content
        </VisuallyHidden>
        <p id="content">Page content starts here.</p>
      </div>
    `,
  }),
};
