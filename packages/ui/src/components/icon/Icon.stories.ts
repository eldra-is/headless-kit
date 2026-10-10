import {
  IconAlertTriangle,
  IconSearch,
  IconShoppingBag,
  IconStar,
  IconTrash,
} from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Icon from './Icon.vue';

/**
 * One story per state, as the design spec's testing section requires. The
 * reference PNGs in `eldra-starter-spec/images/core` are the review target for
 * these; `scripts/screenshots.mjs` compares each story against the committed
 * baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Foundations/Icon',
  component: Icon,
  args: { icon: IconSearch, size: 'md' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'xl'] },
    icon: { table: { disable: true } },
    label: { control: 'text' },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Renders a Tabler outline icon at one of the four spec sizes (1, 1.25, 1.5 and 2rem) ' +
          'with stroke 1.75, in the current text colour. Decorative by default (`aria-hidden`); ' +
          'pass `label` to give it an accessible name (`role="img"`).',
      },
    },
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default size, 1.25rem. */
export const Default: Story = {};

/** 1rem — inline with body text and inside small controls. */
export const Small: Story = { args: { size: 'sm', icon: IconShoppingBag } };

/** 1.5rem — feature tiles. */
export const Large: Story = { args: { size: 'lg', icon: IconStar } };

/** 2rem — empty states. */
export const ExtraLarge: Story = { args: { size: 'xl', icon: IconAlertTriangle } };

/** Every size beside the others, to check optical weight at stroke 1.75. */
export const AllSizes: Story = {
  render: (args) => ({
    components: { Icon },
    setup: () => ({ args, sizes: ['sm', 'md', 'lg', 'xl'] as const }),
    template: `
      <div class="flex items-end gap-4">
        <Icon v-for="size in sizes" :key="size" :icon="args.icon" :size="size" />
      </div>
    `,
  }),
};

/**
 * An icon that carries meaning nothing else on screen carries takes a `label`,
 * which makes it `role="img"` with an accessible name instead of hidden.
 */
export const Labelled: Story = { args: { icon: IconTrash, label: 'Delete', size: 'lg' } };

/** The icon takes the current text colour, so it needs no per-section variant. */
export const InText: Story = {
  render: (args) => ({
    components: { Icon },
    setup: () => ({ args }),
    template: `
      <p class="text-body flex items-center gap-2">
        <Icon v-bind="args" size="sm" />
        <span>Search the shop</span>
      </p>
    `,
  }),
};

/** Narrow container: the icon never shrinks and never forces a horizontal scroll. */
export const NarrowContainer: Story = {
  render: (args) => ({
    components: { Icon },
    setup: () => ({ args }),
    template: `
      <div class="w-80 border border-border p-4">
        <p class="text-body flex items-center gap-2">
          <Icon v-bind="args" />
          <span>A label long enough to wrap inside a twenty-rem container</span>
        </p>
      </div>
    `,
  }),
};

/**
 * Reduced motion. `scripts/screenshots.mjs` captures any story whose id ends in
 * `--reduced-motion` with Playwright's `reducedMotion: 'reduce'` emulation.
 */
export const ReducedMotion: Story = {
  parameters: { eldra: { reducedMotion: true } },
  render: (args) => ({
    components: { Icon },
    setup: () => ({ args }),
    template: `<Icon v-bind="args" />`,
  }),
};

/**
 * Forced colours. Captured with `forcedColors: 'active'`; the icon must stay
 * visible because it inherits `currentColor` rather than setting its own.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: (args) => ({
    components: { Icon },
    setup: () => ({ args }),
    template: `
      <p class="text-body flex items-center gap-2">
        <Icon v-bind="args" />
        <span>Search the shop</span>
      </p>
    `,
  }),
};
