import { IconLeaf, IconRotate2, IconTruck } from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import FeatureCard from './FeatureCard.vue';

/**
 * One story per state of the design spec's "Feature card" section, named after the state it
 * shows. `eldra-starter-spec/images/core/feature-card.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Display/FeatureCard',
  component: FeatureCard,
  tags: ['autodocs'],
  args: {
    icon: IconTruck,
    title: 'Free shipping over $80',
    body: 'Delivered in 2-4 business days, no minimum order beyond the threshold.',
  },
  argTypes: {
    icon: { table: { disable: true } },
    variant: { control: 'inline-radio', options: ['plain', 'surface', 'outlined'] },
    headingLevel: { control: 'number' },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A short value proposition: icon tile, title and one or two sentences, used in rows of',
          'three or four (shipping, returns, guarantees). Optionally linked. For articles use',
          '`ContentCard`.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `iconTile`,',
          '`title`, `titleLink` (linked only), `body`, `cue` (linked only).',
          '',
          '**Slots**: `title`, `body`, `cue` — each falls back to the matching prop (`cue` falls',
          'back to the `learnMore` message when no `cue` prop is given either).',
          '',
          '**`href`** makes the card linked: the title wraps a stretched link (the whole card',
          'becomes one tab stop, with the standard focus ring around it) and the "Learn more →"',
          'cue appears, `aria-hidden`. With no `href` the card has no tab stop at all.',
          '',
          '**`variant`**: `plain` (default, no padding/border/container — for a row of value',
          'props with no card chrome). `surface` (`surface` fill, padding, and the icon tile',
          'switches to a `background` fill). `outlined` (1px `border`, padding). Use the same',
          'variant for every card in a row.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof FeatureCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No padding, border or visible container — a row of unlinked value propositions. */
export const Plain: Story = {
  render: () => ({
    components: { FeatureCard },
    setup: () => ({ icons: { IconTruck, IconRotate2, IconLeaf } }),
    template: `
      <ul role="list" class="grid grid-cols-1 gap-6 sm:grid-cols-3 list-none p-0 m-0">
        <li><FeatureCard :icon="icons.IconTruck" title="Free shipping over $80" body="Delivered in 2-4 business days." /></li>
        <li><FeatureCard :icon="icons.IconRotate2" title="30-day returns" body="Return or exchange within 30 days of delivery." /></li>
        <li><FeatureCard :icon="icons.IconLeaf" title="Sustainably made" body="Natural fibres, low-impact dyes, small batches." /></li>
      </ul>
    `,
  }),
};

/** `surface` fill, padding, and a `background` icon tile. */
export const Surface: Story = {
  args: { icon: IconTruck, variant: 'surface' },
};

/** Linked: the title wraps a stretched link, and a "Learn more →" cue shows below the body. */
export const Linked: Story = {
  args: { icon: IconTruck, href: '/shipping', variant: 'outlined' },
};

/** A title long enough to wrap across four lines: the icon tile stays a fixed 2.75rem square. */
export const LongContent: Story = {
  args: {
    icon: IconTruck,
    title:
      'Free worldwide shipping on every order over eighty dollars, no minimum weight or size limit',
    body:
      'Every order is insured and tracked from the moment it leaves the studio until it reaches ' +
      'your door, wherever that door happens to be.',
    href: '/shipping',
  },
};

/** A 20rem container: the title and body wrap instead of overflowing (1.4.10). */
export const Narrow: Story = {
  render: () => ({
    components: { FeatureCard },
    setup: () => ({ icon: IconTruck }),
    template: `
      <div class="w-80">
        <FeatureCard
          :icon="icon"
          title="Free shipping over $80"
          body="Delivered in 2-4 business days, no minimum order beyond the threshold."
          href="/shipping"
          variant="surface"
        />
      </div>
    `,
  }),
};

/**
 * Forced colours. The outlined boundary and the focus ring stay real system-colour strokes; the
 * icon tile keeps a visible edge rather than reading as a colour-only fill (1.4.1, 1.4.11).
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { FeatureCard },
    setup: () => ({ icons: { IconTruck, IconRotate2 } }),
    template: `
      <div class="grid grid-cols-1 gap-6 sm:grid-cols-2" style="max-width: 40rem;">
        <FeatureCard :icon="icons.IconTruck" title="Free shipping over $80" body="Delivered in 2-4 business days." variant="outlined" href="/shipping" />
        <FeatureCard :icon="icons.IconRotate2" title="30-day returns" body="Return or exchange within 30 days." variant="surface" />
      </div>
    `,
  }),
};
