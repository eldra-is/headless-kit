import type { Meta, StoryObj } from '@storybook/vue3-vite';
import ContentCard from './ContentCard.vue';

/**
 * One story per state of the design spec's "Content card" section, named after the state it
 * shows. `eldra-starter-spec/images/core/content-card.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const IMAGE = {
  src:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">' +
        '<rect width="600" height="400" fill="#c8bfae"/>' +
        '<circle cx="180" cy="140" r="60" fill="#e9e4da"/>' +
        '<path d="M0 320 L200 200 L340 300 L480 220 L600 320 L600 400 L0 400 Z" fill="#a99b82"/>' +
        '</svg>'
    ),
  width: 600,
  height: 400,
};

const meta = {
  title: 'Display/ContentCard',
  component: ContentCard,
  tags: ['autodocs'],
  args: {
    title: 'The slow craft of hand-thrown ceramics',
    href: '/journal/slow-craft-ceramics',
  },
  argTypes: {
    image: { table: { disable: true } },
    ratio: { control: 'inline-radio', options: ['3x2', '4x3', '16x9'] },
    variant: { control: 'inline-radio', options: ['plain', 'surface', 'outlined'] },
    headingLevel: { control: 'number' },
    loading: { control: 'boolean' },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A card for journal articles, recipes, guides and collections: optional image,',
          'eyebrow, title, excerpt and meta, with the whole card as one link. For products use',
          '`ProductCard`; for short value propositions use `FeatureCard`.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `media`, `body`,',
          '`eyebrow`, `title`, `titleLink`, `excerpt`, `meta`, `cue`.',
          '',
          '**Slots**: `eyebrow`, `title`, `excerpt`, `meta`, `cue` — each falls back to the',
          'matching prop.',
          '',
          '**`variant`**: `plain` (default, media on top, no padding) auto-converts to `surface`',
          'when there is no `image` (spec: "A plain card with no image renders as the surface',
          'variant"). `surface` (`surface` fill, padding, an optional link `cue` pinned to the',
          'bottom). `outlined` (1px `border`, padding, a `meta` count pinned to the bottom — the',
          'collection card shape).',
          '',
          '**`date`** renders as `<time datetime>` through `src/utils/date.ts#formatDate`, in the',
          'locale from the `locale` prop or the ambient `useEldraUiLocale()`.',
          '',
          '**Accessibility.** Root `<article>`; the title is a heading at `headingLevel`',
          '(default `3`) wrapping the one stretched link — the whole card is a single tab stop,',
          'and the standard focus ring draws around it with `radius-lg` corners. The cue is',
          '`aria-hidden` so the destination is never read twice.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof ContentCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Media on top, `background` fill, no padding — the default journal card. */
export const Default: Story = {
  args: {
    image: IMAGE,
    eyebrow: 'Studio journal',
    excerpt:
      'The wheel turns slowly at first, then faster, and the clay rises between practiced ' +
      'hands into a shape that did not exist a minute ago.',
    date: '2026-09-12',
    meta: '4 min read',
  },
};

/** No image: `surface` fill, padding, and a "Read the update" link cue pinned to the bottom. */
export const Surface: Story = {
  args: {
    title: 'A note on this season’s glaze changes',
    href: '/journal/glaze-changes',
    variant: 'surface',
    eyebrow: 'Studio journal',
    excerpt: 'We have adjusted two of our stoneware glazes for a softer, more matte finish.',
    date: '2026-08-03',
    cue: 'Read the update',
  },
};

/** The collection-card shape: 1px border, padding, and a count meta pinned to the bottom. */
export const Outlined: Story = {
  args: {
    title: 'Ceramics',
    href: '/collections/ceramics',
    variant: 'outlined',
    excerpt: 'Hand-thrown mugs, bowls and vases from the studio floor.',
    meta: '24 products',
  },
};

/** A plain card with no `image` renders as the `surface` variant automatically (spec →
 * Properties, `variant` row). */
export const NoImage: Story = {
  args: {
    title: 'What we look for in a good glaze',
    href: '/journal/good-glaze',
    excerpt: 'Three questions every studio potter should ask before mixing a new batch.',
    date: '2026-07-21',
  },
};

/** The date and an extra meta string share one line, separated by "·". */
export const WithMeta: Story = {
  args: {
    image: IMAGE,
    eyebrow: 'Recipes',
    excerpt: 'A simple weeknight recipe using the last of the summer tomatoes.',
    date: '2026-09-01',
    meta: '6 min read',
  },
};

/** Skeleton media and three skeleton text lines instead of real content. */
export const Loading: Story = {
  args: { loading: true, image: IMAGE },
};

/** A long title (wraps fully, never clamps) and a long excerpt (clamped to three lines). */
export const LongContent: Story = {
  args: {
    title:
      'A very long journal article title about the slow craft of hand-thrown ceramics in the studio',
    href: '/journal/slow-craft-ceramics',
    image: IMAGE,
    eyebrow: 'Studio journal',
    excerpt:
      'The wheel turns slowly at first, then faster, and the clay rises between practiced ' +
      'hands into a shape that did not exist a minute ago — a small, ordinary kind of magic ' +
      'repeated daily, and the reason so many of us keep coming back to the studio long after ' +
      'the first lesson ends.',
    date: '2026-09-12',
    meta: '4 min read',
  },
};

/** A 20rem container: text and the excerpt wrap and clamp instead of overflowing (1.4.10). */
export const Narrow: Story = {
  render: () => ({
    components: { ContentCard },
    setup: () => ({ image: IMAGE }),
    template: `
      <div class="w-80">
        <ContentCard
          title="The slow craft of hand-thrown ceramics"
          href="/journal/slow-craft-ceramics"
          :image="image"
          eyebrow="Studio journal"
          excerpt="The wheel turns slowly at first, then faster, and the clay rises between practiced hands into a shape that did not exist a minute ago."
          date="2026-09-12"
          meta="4 min read"
        />
      </div>
    `,
  }),
};

/**
 * Forced colours. The outlined boundary and the focus ring stay real system-colour strokes; the
 * eyebrow and meta read by their position and weight, not colour alone (1.4.1, 1.4.11).
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { ContentCard },
    setup: () => ({ image: IMAGE }),
    template: `
      <div class="flex flex-col gap-6" style="max-width: 20rem;">
        <ContentCard
          title="The slow craft of hand-thrown ceramics"
          href="/journal/slow-craft-ceramics"
          :image="image"
          eyebrow="Studio journal"
          date="2026-09-12"
          meta="4 min read"
        />
        <ContentCard
          title="Ceramics"
          href="/collections/ceramics"
          variant="outlined"
          excerpt="Hand-thrown mugs, bowls and vases from the studio floor."
          meta="24 products"
        />
      </div>
    `,
  }),
};
