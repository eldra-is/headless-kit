import { IconPhoto, IconPlus } from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import EditorPlaceholder from './EditorPlaceholder.vue';

/**
 * One story per state of the design spec's "Empty and error states" → "Editor hint" anatomy: the
 * Studio page-builder's own view of an unfilled block field. Never rendered on the live storefront
 * — there, an empty optional part simply does not render — so this page's title sits under its own
 * "Editor" group rather than beside `EmptyState`'s "Display" one.
 * `eldra-starter-spec/images/core/empty-state.png`'s row 2 ("editor hint, inline editor hint") is
 * the review target; `scripts/screenshots.mjs` compares each story against the committed baseline
 * in `__screenshots__/`.
 */
const meta = {
  title: 'Editor/EditorPlaceholder',
  component: EditorPlaceholder,
  tags: ['autodocs'],
  args: {
    icon: IconPlus,
    label: 'Add products',
    help: 'Pick a collection or up to 12 products to show in this grid.',
  },
  argTypes: {
    icon: { table: { disable: true } },
    inline: { control: 'boolean' },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `icon` (optional),',
          '`label` (the action, strong), `help` (guidance).',
          '',
          'No ARIA role: the spec\'s own accessibility note says editor hints "need no roles" —',
          "they exist only inside the page builder's own chrome, never on the storefront a screen",
          'reader visitor reaches.',
          '',
          '**`inline`** shrinks the padding from `2rem` to `1rem`, for a hint inside a compact',
          'inline field (an empty heading) rather than a whole empty block.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof EditorPlaceholder>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A whole unfilled block: icon, action label, guidance. */
export const Default: Story = {};

/** An empty inline field (a heading with nothing typed yet): compact padding, no icon — the spec's
 * own example, "Hidden on the live site until filled." */
export const Inline: Story = {
  args: {
    icon: undefined,
    label: 'Add a heading',
    help: 'Hidden on the live site until filled.',
    inline: true,
  },
};

/** No `help` line — the label alone is still a complete hint. */
export const LabelOnly: Story = {
  args: { icon: IconPhoto, label: 'Choose an image', help: undefined },
};

/** Long guidance text wraps inside the panel instead of stretching it. */
export const LongContent: Story = {
  args: {
    label: 'Add products',
    help:
      'Pick a collection, or choose up to twelve individual products, to show in this grid — ' +
      'mixing a collection with individual products is not supported for this block.',
  },
};

/** A 20rem container: the label and help text wrap instead of overflowing (1.4.10). */
export const Narrow: Story = {
  render: () => ({
    components: { EditorPlaceholder },
    template: `
      <div class="w-80">
        <EditorPlaceholder
          :icon="undefined"
          label="Add products"
          help="Pick a collection or up to 12 products to show in this grid."
        />
      </div>
    `,
  }),
};

/** Forced colours: the dashed boundary stays a real system-colour stroke. */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
};
