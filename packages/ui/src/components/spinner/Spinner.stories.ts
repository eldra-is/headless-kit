import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Spinner from './Spinner.vue';

/**
 * One story per state. The spinner has no spec section of its own: its shape and timing come from
 * the design spec's Button section ("Behaviour & motion"), where it was first drawn.
 */
const meta = {
  title: 'Feedback/Spinner',
  component: Spinner,
  tags: ['autodocs'],
  argTypes: { label: { control: 'text' } },
  parameters: {
    docs: {
      description: {
        component: [
          'The one spinner shape in this package — the circle `Button`, `LoadMore`, `Price` and',
          '`StockBadge` draw while they wait — for a wait that is not inside one of them. A',
          'quarter-turn arc in the current text colour, turning once every 700ms; with reduced',
          'motion it pulses instead of turning.',
          '',
          '**Size and colour** come from the surrounding text: 1.125rem by default, any other size',
          'through a class on the component (`class="size-8"`), the colour through `currentColor`.',
          '',
          '**Decorative by default** (`aria-hidden`), like `Icon`. Pass `label` to name it',
          '(`role="img"`) when nothing around it says what is happening. It is never a live region:',
          'put it inside the element that announces the wait (`role="status"`, or one that is',
          '`aria-busy`), and leave it unnamed there.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Decorative: no name, hidden from assistive technology. */
export const Default: Story = {};

/** Named: `role="img"` with the label as its accessible name. */
export const Labelled: Story = { args: { label: 'Loading' } };

/** Sized by a class on the component, coloured by the text colour around it. */
export const Sizes: Story = {
  render: () => ({
    components: { Spinner },
    template: `
      <div class="flex items-center gap-6 text-primary">
        <Spinner class="size-4" />
        <Spinner />
        <Spinner class="size-8" />
        <Spinner class="size-14" />
      </div>
    `,
  }),
};

/** Inside a polite status region that says what is happening: the spinner itself stays unnamed. */
export const InStatusRegion: Story = {
  name: 'In a status region',
  render: () => ({
    components: { Spinner },
    template: `
      <p role="status" class="flex items-center gap-2 text-body-sm">
        <Spinner />
        Saving your changes
      </p>
    `,
  }),
};

/** Under `prefers-reduced-motion: reduce` the arc pulses in place instead of turning. */
export const ReducedMotion: Story = {
  parameters: { eldra: { reducedMotion: true } },
  args: { label: 'Loading' },
  render: (args) => ({
    components: { Spinner },
    setup: () => ({ args }),
    template: `<Spinner v-bind="args" class="size-8" />`,
  }),
};
