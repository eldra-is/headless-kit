import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Skeleton from './Skeleton.vue';

/**
 * One story per state of the design spec's Skeleton section, named after the state it shows.
 * `eldra-starter-spec/images/core/skeleton.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * Every story here is animated (the `eldra-skeleton` shimmer, `tailwind.css`), except
 * `ReducedMotion`, which the screenshot harness captures with `prefers-reduced-motion: reduce`
 * emulated — the story name itself is the channel (`scripts/screenshots.mjs#emulationFor`).
 */
const meta = {
  title: 'Display/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'inline-radio', options: ['text', 'title', 'circle', 'media', 'btn'] },
    lines: { control: { type: 'number', min: 1, max: 6 } },
    width: { control: 'text' },
    ratio: {
      control: 'inline-radio',
      options: ['auto', '1x1', '4x3', '3x2', '16x9', '3x4', '4x5'],
    },
    size: { control: 'text' },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A neutral, shimmering placeholder that holds the layout while content loads after',
          'first paint — never for static text that ships with the page, and never together with a',
          'spinner for the same region.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `line` (one per text',
          'row, or one for every other variant).',
          '',
          '**`variant`**: `text` (default, `lines` rows, deterministic widths cycling 85/70/55/35%),',
          '`title` (one 60%-wide bar), `circle` (`size`, default `2.5rem`, width = height),',
          '`media` (`ratio`, default `4x5`, the same presets `Image` uses), `btn` (the shared',
          '`control-height`, matching a resting `Button`).',
          '',
          '**`width`** sizes the root itself instead of letting it fill its container — the escape',
          'hatch for a shrink-to-fit ancestor (`inline-flex`/`inline-block`), where a percentage-wide',
          'shape would otherwise collapse to nothing. The root is `block`/`w-full` by default so the',
          'default percentage widths above resolve against *something* even without it.',
          '',
          '**Motion.** The shimmer sweeps left to right over 1.4s, infinitely; under',
          '`prefers-reduced-motion: reduce` it is removed outright and the shapes are static.',
          '',
          '**Accessibility.** The root is `aria-hidden="true"` — shapes carry no information, and a',
          "region's own `aria-busy`/hidden loading text is the caller's responsibility, not this",
          "primitive's.",
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Three text lines, widths cycling 85%, 70%, 55% — a paragraph placeholder. */
export const Text: Story = { args: { variant: 'text', lines: 3 } };

/** One 60%-wide bar, taller than a text line — a heading placeholder. */
export const Title: Story = { args: { variant: 'title' } };

/** A 2.5rem circle — an avatar placeholder. */
export const Circle: Story = { args: { variant: 'circle' } };

/** A 4:5 media block, `radius-lg` — the same frame a product card's `Image` renders into. */
export const Media: Story = {
  render: () => ({
    components: { Skeleton },
    template: `<div class="w-48"><Skeleton variant="media" /></div>`,
  }),
};

/** A full-width bar at the shared control height — a resting `Button` placeholder. */
export const Button: Story = {
  render: () => ({
    components: { Skeleton },
    template: `<div class="w-48"><Skeleton variant="btn" /></div>`,
  }),
};

/** Composed: media, title and text lines inside a card-sized box — the shape a loading product
 * card takes before `Image` and `Price` have real content. */
export const Card: Story = {
  render: () => ({
    components: { Skeleton },
    template: `
      <div class="w-64 flex flex-col gap-3">
        <Skeleton variant="media" ratio="4x5" />
        <Skeleton variant="title" />
        <Skeleton variant="text" :lines="2" />
      </div>
    `,
  }),
};

/** The shimmer, disabled: shapes stay static under `prefers-reduced-motion: reduce` rather than
 * sweeping (spec "Skeleton" → Behaviour & motion). */
export const ReducedMotion: Story = {
  parameters: { eldra: { reducedMotion: true } },
  render: () => ({
    components: { Skeleton },
    template: `
      <div class="w-64 flex flex-col gap-3">
        <Skeleton variant="media" ratio="4x5" />
        <Skeleton variant="title" />
        <Skeleton variant="text" :lines="2" />
      </div>
    `,
  }),
};
