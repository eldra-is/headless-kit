import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Badge from '../badge/Badge.vue';
import Button from '../button/Button.vue';
import Container from '../container/Container.vue';
import Link from '../link/Link.vue';
import Section from './Section.vue';

/**
 * One story per state of the design spec's "Container and section" section, named after the state
 * it shows. `eldra-starter-spec/images/core/section.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Layout/Section',
  component: Section,
  tags: ['autodocs'],
  args: { background: 'none', spacing: 'md' },
  argTypes: {
    background: {
      control: 'inline-radio',
      options: ['none', 'surface', 'surface-strong', 'primary', 'accent'],
    },
    spacing: { control: 'inline-radio', options: ['none', 'sm', 'md', 'lg'] },
    as: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          "The block's landmark: background and vertical spacing, and the root that measures every",
          'container query inside it (its own `Container`, and any block-specific breakpoint). Every',
          'block root is a `<section aria-labelledby>` named by its own heading, `aria-label` with no',
          'visible heading, or a plain `<div>` when the block is not a meaningful region.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`.',
          '',
          '**Slots**: `default`.',
          '',
          '**Colour switching**: a `primary`/`accent` Section marks itself `class="group/section"',
          'data-section="primary|accent"`, which `Button`, `Link`, `Price` and `Rating` read to',
          'invert their own colours — see the Backgrounds story below.',
          '',
          "**Adjacent same-background Sections drop the top padding** (spec Do/Don't: alternate",
          '`none`/`surface` instead of adding divider lines) — see the Adjacent story.',
          '',
          '**`SECTION_KEY`**: provided for the subtree; a `Section` mounted inside another warns in',
          'development (spec: "Sections are never nested inside another section").',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Section>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The four Container widths, each inside a Section so the gutter breakpoints have a block to read. */
export const Widths: Story = {
  render: () => ({
    components: { Section, Container },
    setup: () => ({ widths: ['narrow', 'content', 'wide', 'full'] as const }),
    template: `
      <div class="flex flex-col gap-px">
        <Section v-for="width in widths" :key="width" background="surface" spacing="sm">
          <Container :width="width">
            <div class="bg-background text-text rounded-md p-4 text-center text-sm">
              {{ width }}
            </div>
          </Container>
        </Section>
      </div>
    `,
  }),
};

/**
 * Every background at spacing `sm`, with Buttons, a Link and a Badge inside — the review target
 * for "Colour switching on primary and accent sections": the primary button inverts, the outline
 * button (and secondary on accent) becomes an outline in the contrast colour, and the link
 * inherits it. Cards keep their own colours regardless of ground, which is why this story leaves
 * none in — that is `Price`/`Rating`'s own story to show.
 */
export const Backgrounds: Story = {
  render: () => ({
    components: { Section, Container, Button, Link, Badge },
    setup: () => ({
      backgrounds: ['none', 'surface', 'surface-strong', 'primary', 'accent'] as const,
    }),
    template: `
      <div class="flex flex-col gap-px">
        <Section v-for="background in backgrounds" :key="background" :background="background" spacing="sm">
          <Container width="wide">
            <div class="flex flex-wrap items-center gap-4">
              <span class="text-body-sm w-24 shrink-0 font-semibold">{{ background }}</span>
              <Button variant="primary">Add to cart</Button>
              <Button variant="outline">Our story</Button>
              <Button variant="ghost">Save for later</Button>
              <Link href="/care" variant="standalone" arrow>Size guide</Link>
              <Badge label="New" tone="accent" />
            </div>
          </Container>
        </Section>
      </div>
    `,
  }),
};

/** Padding-block none / sm / md / lg, each bounded so the step is legible. */
export const Spacing: Story = {
  render: () => ({
    components: { Section, Container },
    setup: () => ({ steps: ['none', 'sm', 'md', 'lg'] as const }),
    template: `
      <div class="flex flex-col gap-4">
        <div v-for="spacing in steps" :key="spacing" class="border-border border">
          <Section background="surface" :spacing="spacing">
            <Container width="content">
              <div class="bg-background text-text rounded-md p-2 text-center text-sm">
                spacing="{{ spacing }}"
              </div>
            </Container>
          </Section>
        </div>
      </div>
    `,
  }),
};

/**
 * Two `surface` Sections back to back drop the seam: the second one's top padding disappears, so
 * the pair reads as one band (spec Do/Don't: alternate `none`/`surface` instead of a divider
 * line). A `none` Section between two `surface` ones keeps its own padding on every side, because
 * its neighbours do not match it.
 */
export const Adjacent: Story = {
  render: () => ({
    components: { Section, Container },
    template: `
      <div class="border-border border">
        <Section background="surface" spacing="md">
          <Container width="content">
            <div class="bg-background text-text rounded-md p-3 text-center text-sm">
              surface — first
            </div>
          </Container>
        </Section>
        <Section background="surface" spacing="md">
          <Container width="content">
            <div class="bg-background text-text rounded-md p-3 text-center text-sm">
              surface — second, top padding dropped
            </div>
          </Container>
        </Section>
        <Section background="none" spacing="md">
          <Container width="content">
            <div class="bg-surface text-text rounded-md p-3 text-center text-sm">
              none — different ground, padding kept
            </div>
          </Container>
        </Section>
      </div>
    `,
  }),
};

/** A 20rem block — well below every gutter and spacing breakpoint, no horizontal scroll. */
export const Narrow: Story = {
  render: () => ({
    components: { Section, Container, Button },
    template: `
      <div class="w-80 border-border border">
        <Section background="surface" spacing="sm">
          <Container width="wide">
            <div class="flex flex-col items-start gap-2">
              <p class="text-body-sm">A block this narrow still keeps its mobile gutter.</p>
              <Button variant="primary" size="sm">Add to cart</Button>
            </div>
          </Container>
        </Section>
      </div>
    `,
  }),
};

/**
 * Forced colours. Captured with `forcedColors: 'active'`: on `primary`/`accent` the outline and
 * inverted-primary boundaries stay visible because every one of them is a real 1px border, not
 * only a colour change.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Section, Container, Button, Link },
    template: `
      <div class="flex flex-col gap-px">
        <Section background="primary" spacing="sm">
          <Container width="wide">
            <div class="flex flex-wrap items-center gap-4">
              <Button variant="primary">Add to cart</Button>
              <Button variant="outline">Our story</Button>
              <Link href="/care" variant="standalone">Size guide</Link>
            </div>
          </Container>
        </Section>
        <Section background="accent" spacing="sm">
          <Container width="wide">
            <div class="flex flex-wrap items-center gap-4">
              <Button variant="primary">Add to cart</Button>
              <Button variant="secondary">Shop the sale</Button>
              <Button variant="outline">Our story</Button>
            </div>
          </Container>
        </Section>
      </div>
    `,
  }),
};
