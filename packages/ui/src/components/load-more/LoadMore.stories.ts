import type { Meta, StoryObj } from '@storybook/vue3-vite';
import LoadMore from './LoadMore.vue';

/**
 * One story per state of the design spec's Pagination section, "Load more" rows. The section's
 * own screenshot (`eldra-starter-spec/images/core/pagination.png`) shows this alongside numbered
 * and compact Pagination; `scripts/screenshots.mjs` compares each story here against its own
 * committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Navigation/LoadMore',
  component: LoadMore,
  tags: ['autodocs'],
  args: {
    shown: 24,
    total: 96,
  },
  argTypes: {
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'An alternative to Pagination for collections where browsing matters more than',
          'position: a live status sentence, a decorative progress meter, and a button that hides',
          'once every item is shown.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `status` and',
          '`button`. The meter has no part of its own — it is purely decorative (`aria-hidden`).',
          '',
          '**Accessibility.** The status is a polite live region (`role="status"',
          'aria-live="polite"`), so a screen-reader user hears "Showing 48 of 96 products" after',
          'more load; the button is `aria-describedby` that same status.',
          '',
          '**The button stays reachable and clickable while `pending`** — the same "still',
          'clickable, the action is already under way" rule `Button`\'s own `loading` state',
          'follows — showing a spinner and `aria-busy="true"` rather than disabling itself.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof LoadMore>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A quarter of the way through: the button is live, the meter a quarter full. */
export const Default: Story = {};

/** Mid-load: the button is busy, showing a spinner and `aria-busy`, but stays clickable. */
export const Pending: Story = {
  args: { pending: true },
};

/** Every item shown: the button hides, and only the status and full meter remain. */
export const Complete: Story = {
  args: { shown: 96, total: 96 },
};

/** A 20rem host: the meter's `min(14rem, 100%)` cap shrinks with the container instead of
 *  overflowing it (spec's own 320px/nothing-overflows acceptance criterion). */
export const Narrow: Story = {
  render: (args) => ({
    components: { LoadMore },
    setup: () => ({ args }),
    template: `
      <div class="border-border w-80 border p-4">
        <LoadMore v-bind="args" />
      </div>
    `,
  }),
};

/** Forced colours. Captured with `forcedColors: 'active'`: the button keeps a real border and its
 *  spinner stroke stays visible even though the decorative meter's own fill (a plain background
 *  colour with no border) is not guaranteed to render — the status text carries the same count
 *  either way, which is why the meter is `aria-hidden` rather than the only way to know progress. */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  args: { pending: true },
};
