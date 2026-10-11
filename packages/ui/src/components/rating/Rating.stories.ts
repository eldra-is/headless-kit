import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Rating from './Rating.vue';

/**
 * One story per state of the design spec's Rating section, named after the state it shows.
 * `eldra-starter-spec/images/core/rating.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Display/Rating',
  component: Rating,
  tags: ['autodocs'],
  args: { value: 4.5, count: 128 },
  argTypes: {
    size: { control: 'inline-radio', options: ['md', 'lg'] },
    value: { control: { type: 'range', min: 0, max: 5, step: 0.1 } },
    count: { control: 'number' },
    showValue: { control: 'boolean' },
    showCount: { control: 'boolean' },
    href: { table: { disable: true } },
    as: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A read-only five-star rating in half steps, with an optional numeric value and review',
          'count, a linked form that jumps to the reviews, and a no-reviews state — never a control',
          'for writing a review (use a `RadioGroup` of five options for that).',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `stars`, `star`,',
          "`value`, `count`, `empty` (the no-reviews text), `link` (the linked variant's `<a>` —",
          'see the component doc comment for why it is a second element rather than `root` itself',
          'changing tag).',
          '',
          '**Slots**: `emptyAction` — an optional link below the no-reviews text, e.g. "Be the',
          'first to review the Merino crew sweater".',
          '',
          '**Rounding.** `value` rounds to the nearest half star for both the stars and the shown',
          '`4.5`; the half star is the filled icon clipped to its left half, stacked over an',
          'outline star underneath. Stars are always `text` colour, never yellow or brand colour —',
          "the rating still works with any store's `primary`.",
          '',
          '**One accessible sentence.** The wrapper carries `role="img"` and',
          '`aria-label="Rated 4.5 out of 5, 128 reviews"` (`messages.rating(value, count)`); the',
          'stars, value and count underneath are all `aria-hidden`, so a screen reader hears the',
          "sentence once and nothing from the parts. The linked variant's `<a>` carries the same",
          'sentence as its own `aria-label`.',
          '',
          '**`count = 0`** renders "No reviews yet" (`messages.noReviews`) instead of a value or',
          'count — never "0.0" — with an optional `emptyAction` link below it.',
          '',
          '**Linked** (`href`, ignored while `count` is `0`): the whole rating becomes one `<a>`',
          '(or `as`, taking the destination as `to`) — a single tab stop, never one star per stop.',
          'The visible count switches from "(128)" to a pluralised "128 reviews"',
          '(`messages.reviewCount`), underlined, thickening on hover. The focus ring is drawn on',
          "`root` via the proxy-focus pattern (`eldra-focus-proxy`, `Checkbox`/`VariantPicker`'s",
          "own technique) so it wraps the *whole* rating rather than just the `<a>`'s own box, and",
          '`root` keeps a 1.5rem minimum height (`target-min`) so it always meets 2.5.8.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Rating>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Stars, value and count — the "on a card" form (spec Anatomy: "4.5 (128)"). */
export const Default: Story = {};

/** Every half step from 0 to 5, the row the spec's own reference image leads with. */
export const HalfStar: Story = {
  render: () => ({
    components: { Rating },
    template: `
      <div class="flex flex-col gap-1.5">
        <Rating v-for="step in [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]" :key="step"
          :value="step" :count="10" :show-value="false" :show-count="false" />
      </div>
    `,
  }),
};

/** Dense lists: no value or count shown, but the full accessible sentence is still there. */
export const StarsOnly: Story = { args: { showValue: false, showCount: false } };

/** The whole rating is one link to the reviews; count reads a pluralised "128 reviews",
 * underlined. Tab to it to see the standard focus ring drawn around the whole rating, not just
 * the count text. */
export const Linked: Story = { args: { href: '#reviews', size: 'lg' } };

/** `count = 0`: five empty stars and "No reviews yet", never "0.0". */
export const NoReviews: Story = { args: { value: 0, count: 0 } };

/** The no-reviews state with the optional `emptyAction` slot. */
export const NoReviewsWithAction: Story = {
  args: { value: 0, count: 0 },
  render: (args) => ({
    components: { Rating },
    setup: () => ({ args }),
    template: `
      <Rating v-bind="args">
        <template #emptyAction>
          <a href="#write-review" class="eldra-focus text-body-sm text-text underline decoration-1 underline-offset-[0.2em]">
            Be the first to review the Merino crew sweater
          </a>
        </template>
      </Rating>
    `,
  }),
};

/** The `lg` size: 1.25rem stars. Value/count text stays 0.875rem at both sizes. */
export const Large: Story = { args: { size: 'lg' } };

/** A 20rem container. The rating and the no-reviews action link wrap instead of overflowing. */
export const Narrow: Story = {
  render: () => ({
    components: { Rating },
    template: `
      <div class="w-80 border border-border p-4 flex flex-col gap-3">
        <Rating :value="4.5" :count="128" href="#reviews" />
        <Rating :value="0" :count="0">
          <template #emptyAction>
            <a href="#write-review" class="eldra-focus text-body-sm text-text underline decoration-1 underline-offset-[0.2em]">
              Be the first to review the Merino crew sweater
            </a>
          </template>
        </Rating>
      </div>
    `,
  }),
};

/**
 * Forced colours. Empty stars are a real `border-strong` outline stroke rather than a fill, so
 * they stay visible once colour is replaced by the system canvas (1.4.11); the linked variant's
 * proxy focus ring still shows via `Highlight`.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Rating },
    template: `
      <div class="flex flex-col gap-3">
        <Rating :value="4.5" :count="128" />
        <Rating :value="4" :count="36" href="#reviews" />
        <Rating :value="0" :count="0" />
      </div>
    `,
  }),
};
