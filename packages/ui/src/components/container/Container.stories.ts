import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Container from './Container.vue';

/**
 * One story per state of the design spec's "Container and section" section, named after the state
 * it shows. `eldra-starter-spec/images/core/section.png` is the review target;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * Every story mounts `Container` inside a `@container` host so its gutter breakpoints have
 * something to measure, the same shape a `Section` gives it in real use.
 */
const meta = {
  title: 'Layout/Container',
  component: Container,
  tags: ['autodocs'],
  args: { width: 'content' },
  argTypes: {
    width: { control: 'inline-radio', options: ['narrow', 'content', 'wide', 'full'] },
    as: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          "The block's own max-width and side gutters. Renders a `<div>` (or `as`), centred, with a",
          '`max-w-*` cap and a `px-*` gutter that grows with the **block** width — not the',
          "viewport — through the container-query breakpoints a `Section` ancestor's own `@container`",
          'establishes. Every block root is a width container (see `Section`), which is what keeps a',
          'gallery in a narrow page-builder column at the mobile gutter even on a wide screen.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`.',
          '',
          '**Slots**: `default`.',
          '',
          '**Nesting**: Containers may nest to put full-bleed media (`width="full"`) inside a',
          'narrower block — the one case the spec allows, since Sections themselves never nest.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Container>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A visible box so the max-width and gutter are legible at every width. */
function box(width?: 'narrow' | 'content' | 'wide' | 'full') {
  return () => ({
    components: { Container },
    setup: () => ({ width }),
    template: `
      <div class="@container w-full">
        <Container v-bind="width ? { width } : {}">
          <div class="bg-surface-strong text-text rounded-md p-4 text-center text-sm">
            {{ width ?? 'content' }}
          </div>
        </Container>
      </div>
    `,
  });
}

/** 40rem — FAQ, rich text, newsletter, quote. */
export const Narrow: Story = { render: box('narrow') };

/** 64rem, the default — most blocks, product detail, cart. */
export const Content: Story = { render: box('content') };

/** 80rem — product grids, galleries, collection pages, header, footer. */
export const Wide: Story = { render: box('wide') };

/** 100%, no gutters — full-bleed media, image-background hero, gallery carousel. */
export const Full: Story = { render: box('full') };

/**
 * The four widths together, in a wide host, so the caps and the gutters compare directly.
 */
export const Widths: Story = {
  render: () => ({
    components: { Container },
    setup: () => ({ widths: ['narrow', 'content', 'wide', 'full'] as const }),
    template: `
      <div class="@container flex w-full flex-col gap-4">
        <div v-for="width in widths" :key="width" class="border-border border">
          <Container :width="width">
            <div class="bg-surface-strong text-text rounded-md p-4 text-center text-sm">
              {{ width }}
            </div>
          </Container>
        </div>
      </div>
    `,
  }),
};

/**
 * A 20rem host — below the 48rem/64rem gutter breakpoints, so every width keeps the 1rem mobile
 * gutter, exactly as it would in a narrow page-builder column on a wide screen.
 */
export const NarrowHost: Story = {
  name: 'Narrow host',
  render: () => ({
    components: { Container },
    template: `
      <div class="@container w-80 border-border border">
        <Container width="wide">
          <div class="bg-surface-strong text-text rounded-md p-4 text-center text-sm">
            wide, in a 20rem block
          </div>
        </Container>
      </div>
    `,
  }),
};
