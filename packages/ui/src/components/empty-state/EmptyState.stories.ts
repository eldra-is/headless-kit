import { IconHeart } from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Button from '../button/Button.vue';
import EmptyState from './EmptyState.vue';

/**
 * One story per state of the design spec's "Empty and error states" section, named after the
 * state it shows. `eldra-starter-spec/images/core/empty-state.png` is the review target for all
 * of them; `scripts/screenshots.mjs` compares each against the committed baseline in
 * `__screenshots__/`. `EditorPlaceholder.stories.ts`, on this page's sibling "Editor" title,
 * covers the spec's fourth anatomy — the Studio page-builder's own field hint.
 */
const meta = {
  title: 'Display/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  args: { title: 'Your cart is empty' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['empty', 'noResults', 'error'] },
    icon: { table: { disable: true } },
    plain: { control: 'boolean' },
    headingLevel: { control: 'number' },
    retrying: { control: 'boolean' },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'The panel shown inside a block when there is nothing to show (empty cart, no saved',
          'items), when search or filters return nothing, or when content failed to load. Never',
          'shown while data is still loading — use `Skeleton` for that.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `icon` (the',
          'decorative circle), `title`, `text`, `actions`.',
          '',
          '**Slots**: `actions`, scoped with `{ retrying }` so a caller-supplied "Try again"',
          '`Button` can bind `:loading="retrying"` itself. With no `actions` slot and',
          '`variant="error"`, the component renders its own "Try again" `Button` and emits',
          '`retry` when it is pressed, with `loading` already bound to the `retrying` prop.',
          "`empty`/`noResults` have no generic action of their own — the spec's own examples",
          '("Shop bestsellers", "Clear filters") are all store-specific — so those variants show',
          'nothing here until a caller supplies the slot.',
          '',
          '**Roles.** `empty` and `noResults` are `role="status"` (announced politely, once, after',
          'filtering); `error` is `role="alert"` (announced assertially). `error` also colours the',
          'icon `danger` — default or caller-supplied — so the failure is never colour alone',
          '(1.4.1).',
          '',
          '**Default icon.** With no `icon` prop, a built-in Tabler-geometry icon is drawn per',
          '`variant` (an inbox for `empty`, a magnifying glass for `noResults`, a warning triangle',
          "for `error`) at the spec's 1.75rem / 1.5 stroke, inside the 3.5rem `surface-strong`",
          'circle.',
          '',
          '**`plain`** drops the boundary and background entirely — for a state already inside a',
          'drawer, list or card that draws its own. **`headingLevel`** (default `3`) picks the',
          "title's heading element without changing its type style: `2` for a page-level state.",
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty cart — the spec's own "Northwind Goods" copy, with a caller-supplied primary action. */
export const Empty: Story = {
  args: {
    variant: 'empty',
    title: 'Your cart is empty',
    text: 'Free shipping on orders over $80. Start with our bestselling merino crew.',
  },
  render: (args) => ({
    components: { EmptyState, Button },
    setup: () => ({ args }),
    template: `
      <EmptyState v-bind="args">
        <template #actions>
          <Button variant="primary" href="/collections/bestsellers">Shop bestsellers</Button>
        </template>
      </EmptyState>
    `,
  }),
};

/** Search or filters returned nothing — the title echoes the query, two actions in the slot. */
export const NoResults: Story = {
  args: {
    variant: 'noResults',
    title: 'No results for "alpaca mittens"',
    text: 'Check the spelling or try a broader word like "mittens" or "alpaca".',
  },
  render: (args) => ({
    components: { EmptyState, Button },
    setup: () => ({ args }),
    template: `
      <EmptyState v-bind="args">
        <template #actions>
          <Button variant="outline">Clear filters</Button>
          <Button variant="primary" href="/collections/knitwear">Browse all knitwear</Button>
        </template>
      </EmptyState>
    `,
  }),
};

/** A failed fetch: `role="alert"`, the icon turns `danger`, and — with no `actions` slot — the
 * component's own "Try again" button. */
export const Error: Story = {
  args: {
    variant: 'error',
    title: "We couldn't load these products",
    text: 'The connection dropped while loading Ceramics. Your cart is safe.',
  },
};

/** The built-in "Try again" button mid-retry: spinner, `aria-busy="true"`, label hidden. */
export const ErrorRetrying: Story = {
  args: { ...Error.args, retrying: true },
};

/** No border or background — for a state already inside a drawer, list or card. */
export const Plain: Story = {
  args: {
    variant: 'empty',
    plain: true,
    icon: IconHeart,
    title: 'No saved items yet',
    text: 'Tap the heart on any product to keep it here.',
  },
};

/** Text well over the spec's two-sentence guidance and a long title: the 36ch text measure wraps
 * onto several lines instead of stretching the panel, and the title wraps within the panel's own
 * width rather than overflowing it. */
export const LongContent: Story = {
  args: {
    variant: 'error',
    title: 'We could not finish loading the Ceramics, Ceramics Glaze and Studio Seconds sections',
    text:
      'The connection dropped while loading Ceramics, and we were not able to reach the server ' +
      'again after several attempts. Nothing in your cart was lost, and no payment was charged ' +
      '— reload this section once your connection is steady again, or come back to it later.',
  },
};

/** A 20rem container. The title and text wrap and the actions row wraps onto a second line
 * instead of overflowing (1.4.10). */
export const Narrow: Story = {
  render: () => ({
    components: { EmptyState, Button },
    template: `
      <div class="w-80">
        <EmptyState
          variant="noResults"
          title='No results for "hand-thrown ceramics"'
          text="Check the spelling or try a broader word."
        >
          <template #actions>
            <Button variant="outline">Clear filters</Button>
            <Button variant="primary" href="/collections/ceramics">Browse all ceramics</Button>
          </template>
        </EmptyState>
      </div>
    `,
  }),
};

/**
 * Forced colours. The dashed panel boundary and the icon circle stay a real system-colour stroke
 * rather than a fill alone, and the error state reads by its triangle icon and words, not only by
 * colour (1.4.1, 1.4.11).
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { EmptyState, Button },
    template: `
      <div class="flex flex-col gap-6">
        <EmptyState variant="empty" title="Your cart is empty" text="Free shipping on orders over $80.">
          <template #actions>
            <Button variant="primary">Shop bestsellers</Button>
          </template>
        </EmptyState>
        <EmptyState variant="error" title="We couldn't load these products" text="Your cart is safe." />
      </div>
    `,
  }),
};
