import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Breadcrumb from './Breadcrumb.vue';
import type { BreadcrumbItem } from './types';

/**
 * One story per state of the design spec's Breadcrumb section, named after the state it shows.
 * `eldra-starter-spec/images/core/breadcrumb.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`
 * (captured at 1280 and 360 — the collapse itself needs no dedicated "narrow viewport" story to
 * prove, since the component's own `@container` already collapses at the 360 capture and stays
 * open at the 1280 one).
 */
/** The spec's own product trail (spec "Breadcrumb" → the section's own screenshot). */
const PRODUCT_TRAIL: BreadcrumbItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Knitwear', href: '/knitwear' },
  { label: 'Sweaters', href: '/knitwear/sweaters' },
  { label: 'Merino crew sweater' },
];

const meta = {
  title: 'Navigation/Breadcrumb',
  component: Breadcrumb,
  tags: ['autodocs'],
  // `items` is required with no sensible package-wide default, so every story below supplies its
  // own through a local `setup()` rather than `args` — this meta-level value only satisfies the
  // type (`StoryObj<typeof meta>` needs every required prop covered somewhere) and seeds the
  // autodocs args table.
  args: { items: PRODUCT_TRAIL },
  argTypes: {
    linkAs: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'Shows where a product, collection or article sits in the catalogue and links back up',
          "the trail. Don't show it on the home page or in checkout, and don't rely on it as the",
          'only way back — the header navigation stays.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `list`, `item`,',
          '`link`, `current`, `separator`, `ellipsis`.',
          '',
          '**The collapse is driven by the breadcrumb’s own width, not the viewport.** Below a',
          '48rem **container** width — a `@container` query on this component’s own root, the',
          'same breakpoint `Container`’s gutters already use — a long trail collapses its middle',
          'levels behind an ellipsis button, keeping `collapseAfter` levels at the start (default',
          '1, “Home”) and `keepLast` at the end (default 2, the parent and the current page).',
          'A short trail with nothing to collapse never shows the ellipsis at any width.',
          '',
          '**Activating the ellipsis is one-way.** `Enter`/`Space` on the native `<button>` reveals',
          'every level, removes the ellipsis for the rest of the page view, and moves focus to the',
          'first level it just revealed — there is no collapsing back short of remounting.',
          '',
          '**No title is ever truncated.** A long current-page title wraps inside its own list',
          'item instead of clipping, at every container width — see the `LongTitles` story.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Breadcrumb>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The spec's own collapsing example: six levels, three of them hidden behind the ellipsis at a
 * collapsed width — the same count the spec's own accessibility note gives verbatim
 * (`aria-label="Show 3 more levels"`).
 */
const CERAMICS_TRAIL: BreadcrumbItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Ceramics', href: '/ceramics' },
  { label: 'Tableware', href: '/ceramics/tableware' },
  { label: 'Serving', href: '/ceramics/tableware/serving' },
  { label: 'Bowls', href: '/ceramics/tableware/serving/bowls' },
  { label: 'Hand-thrown serving bowl, large' },
];

/** The default variant: the whole trail, collapsing only once the capture (or the window) narrows
 *  past the component's own 48rem width. */
export const Default: Story = {
  render: () => ({
    components: { Breadcrumb },
    setup: () => ({ items: PRODUCT_TRAIL }),
    template: `<Breadcrumb :items="items" class="w-full" />`,
  }),
};

/** A deep, six-level trail — visible in full above the 48rem collapse threshold, wrapping onto a
 *  second row rather than collapsing there. */
export const Deep: Story = {
  render: () => ({
    components: { Breadcrumb },
    setup: () => ({ items: CERAMICS_TRAIL }),
    template: `<Breadcrumb :items="items" class="w-full" />`,
  }),
};

/**
 * The same deep trail, forced into a 22rem host well below the 48rem threshold — the spec's own
 * point that the collapse reads the breadcrumb's own width, not the viewport: this collapses even
 * captured at 1280, exactly as it would in a narrow sidebar on a wide screen.
 */
export const Collapsed: Story = {
  render: () => ({
    components: { Breadcrumb },
    setup: () => ({ items: CERAMICS_TRAIL }),
    template: `
      <div class="w-88">
        <Breadcrumb :items="items" />
      </div>
    `,
  }),
};

/** A long current-page title wraps inside its own list item instead of clipping, at any width —
 *  the design spec's own "titles are never truncated" rule (binding over an earlier draft of this
 *  component's own interface, which would have truncated at 40 characters; see the README's
 *  Deviations entry). Three items only, so there is nothing to collapse either. */
export const LongTitles: Story = {
  render: () => ({
    components: { Breadcrumb },
    setup: () => ({
      items: [
        { label: 'Home', href: '/' },
        { label: 'Ceramics', href: '/ceramics' },
        {
          label:
            'Extra-large hand-thrown stoneware serving bowl with a reactive ash glaze and a natural edge',
        },
      ] satisfies BreadcrumbItem[],
    }),
    template: `
      <div class="w-72">
        <Breadcrumb :items="items" />
      </div>
    `,
  }),
};

/** A 20rem host, the package's own narrow-container convention — the trail wraps and, below the
 *  48rem collapse threshold, hides its middle level behind the ellipsis, without ever scrolling
 *  the page horizontally (spec's own 320px acceptance criterion). */
export const Narrow: Story = {
  render: () => ({
    components: { Breadcrumb },
    setup: () => ({ items: CERAMICS_TRAIL }),
    template: `
      <div class="border-border w-80 border p-4">
        <Breadcrumb :items="items" />
      </div>
    `,
  }),
};

/**
 * Forced colours. Captured with `forcedColors: 'active'`: the links and the ellipsis keep the
 * standard focus ring and the ellipsis's own text stays legible without relying on the 6% fill
 * alone — nothing here depends on colour to read.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Breadcrumb },
    setup: () => ({ productTrail: PRODUCT_TRAIL, ceramicsTrail: CERAMICS_TRAIL }),
    template: `
      <div class="flex flex-col gap-8">
        <Breadcrumb :items="productTrail" class="w-full" />
        <div class="w-88">
          <Breadcrumb :items="ceramicsTrail" />
        </div>
      </div>
    `,
  }),
};
