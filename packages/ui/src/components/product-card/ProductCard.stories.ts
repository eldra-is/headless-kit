import type { Meta, StoryObj } from '@storybook/vue3-vite';
import ProductCard from './ProductCard.vue';
import type { ProductCardProduct } from './types';

/**
 * One story per state of the design spec's Product card section, named after the state it shows.
 * `eldra-starter-spec/images/core/product-card.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * A hand-drawn scene stands in for product photography, exactly as `Image`'s own stories do — as
 * a `data:` URI, because the screenshot harness runs offline and a broken external image would be
 * a worse baseline than no image at all.
 */
function scene(fill: string, accent: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800">
      <rect width="640" height="800" fill="${fill}"/>
      <rect x="120" y="180" width="400" height="480" rx="24" fill="${accent}"/>
      <circle cx="320" cy="300" r="70" fill="#ffffff" fill-opacity="0.35"/>
    </svg>`
  )}`;
}

const SWEATER: ProductCardProduct = {
  title: 'Merino crew sweater',
  url: '/products/merino-crew-sweater',
  vendor: 'Kiln Street Studio',
  featuredImage: {
    src: scene('#e7ded1', '#a9895f'),
    alt: 'Oatmeal merino crew sweater, folded',
    width: 640,
    height: 800,
  },
  price: { amount: 3840, compareAt: 4800 },
  rating: { value: 4.5, count: 128 },
  colours: [
    { name: 'Oatmeal', swatch: '#e7ded1' },
    { name: 'Charcoal', swatch: '#2f2f2f' },
    { name: 'Moss', swatch: '#4d5a45' },
    { name: 'Clay', swatch: '#8c3b2a' },
    { name: 'Ecru', swatch: '#f2ede3' },
  ],
  badge: { variant: 'sale' },
  available: true,
};

const meta = {
  title: 'Commerce/ProductCard',
  component: ProductCard,
  tags: ['autodocs'],
  args: { product: SWEATER },
  argTypes: {
    showVendor: { control: 'boolean' },
    showRating: { control: 'boolean' },
    showSwatches: { control: 'boolean' },
    quickAdd: { control: 'boolean' },
    ratio: { control: 'inline-radio', options: ['4x5', '1x1', '3x4'] },
    headingLevel: { control: 'inline-radio', options: [2, 3, 4, 5, 6] },
    loading: { control: 'boolean' },
    currency: { control: 'text' },
    locale: { control: 'text' },
    as: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'The product tile used in every grid, carousel and search result: image, badges,',
          'optional vendor, title, price, rating, colour dots and an optional quick-add button. The',
          'whole card is one link to the product; quick add is the only other control.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `media`, `badges`,',
          '`body`, `vendor`, `title`, `link`, `price`, `rating`, `stockLine` (an addition beyond',
          'the literal spec anatomy — see below), `swatches`, `swatch`, `swatchOverflow`,',
          '`quickAdd`, `skeleton`.',
          '',
          '**The stretched link.** The title link carries a card-covering `::after`',
          '(`after:absolute after:inset-0`) anchored to the card root, so clicking anywhere except',
          'quick add opens the product; the focus ring is drawn on the *card*',
          '(`eldra-focus-proxy`) rather than just around the title text, matching the design',
          "spec's 2.4.7 requirement. Quick add sits above that overlay (`relative z-10`), so",
          'clicking it never navigates.',
          '',
          '**Quick add** is named "Quick add" plus the full product title',
          "(`messages.quickAdd(title)`, applied as the button's `aria-label`) — a whole-sentence",
          "function message rather than a glued-on suffix, because a locale's natural word order",
          'need not put the product name last (the Icelandic catalogue puts it in the middle).',
          '',
          '**Sold out** (`product.available === false`): the media dims to 60% opacity, the badge',
          'stack shows an outline "Sold out" badge (suppressing any sale/new badge — never a third',
          'badge), and quick add becomes a disabled "Sold out" button.',
          '',
          '**Colour dots** show up to three, then a "+N" overflow; the row is `aria-hidden`,',
          'summarised by a visually hidden "Available in N colours" sentence.',
          '',
          "**`stockLine`** is an addition beyond the spec's own 8-part anatomy: when",
          '`product.stock` is set (and the product is not sold out), a `StockBadge` status line',
          'renders above quick add — giving the `StockBadge` half of this component\'s "composes',
          'Badge/StockBadge" brief a real use beyond the sold-out badge, which is a plain `Badge`.',
          '',
          '**Loading** renders a skeleton — media, three text lines, a button bar — as a',
          '`role="group"` `aria-busy="true"` region named "Loading product", in place of the whole',
          'card.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof ProductCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every single-card story below renders through this one helper, at a realistic grid-column
 * width (16rem — close to the spec's own reference image, ~250px columns in a 1100px, four-up
 * grid) rather than the card's bare, full-width default (spec "Product card" → Sizes, Card row:
 * "fills its grid column" — a real grid is what supplies that column outside a story).
 */
function cardStory(args: Record<string, unknown>) {
  return {
    render: () => ({
      components: { ProductCard },
      setup: () => ({ args }),
      template: `<div class="w-64"><ProductCard v-bind="args" /></div>`,
    }),
  };
}

/** The full card: sale badge, vendor hidden (the default), rating, five colours (three dots +
 * "+2"), quick add. */
export const Default: Story = cardStory({ product: SWEATER });

/** `badge: { variant: 'sale' }` with `price.compareAt` set: the rounded percentage badge, sale
 * price in `accent`, struck-through compare-at. */
export const Sale: Story = cardStory({ product: SWEATER });

/** `badge: { variant: 'new' }`, no `compareAt`: the "New" badge, regular price. */
export const New: Story = cardStory({
  product: {
    ...SWEATER,
    title: 'Chunky merino cardigan',
    price: { amount: 6200 },
    badge: { variant: 'new' },
  },
});

/** `available: false`: media at 60% opacity, outline "Sold out" badge, quick add replaced by a
 * disabled "Sold out" button — never both a sale badge and "Sold out" at once. */
export const SoldOut: Story = cardStory({
  product: { ...SWEATER, badge: null, available: false },
});

/** `featuredImage: null`: the live hatched placeholder at the same ratio, decorative (the title
 * sits right next to it). */
export const NoImage: Story = cardStory({ product: { ...SWEATER, featuredImage: null } });

/** `rating: null`: no rating row at all, even though `showRating` defaults to `true` — there is
 * nothing to show. */
export const NoRating: Story = cardStory({ product: { ...SWEATER, rating: null } });

/** `showVendor`, on: the vendor line above the title. */
export const WithVendor: Story = cardStory({ product: SWEATER, showVendor: true });

/** Two-, three- and six-colour products side by side: two and three dots render with no
 * overflow; six clamps to three dots plus "+3". */
export const Swatches: Story = {
  render: () => ({
    components: { ProductCard },
    setup: () => ({
      two: { ...SWEATER, title: 'Merino rib beanie', colours: SWEATER.colours!.slice(0, 2) },
      three: { ...SWEATER, title: 'Wool blend scarf', colours: SWEATER.colours!.slice(0, 3) },
      six: {
        ...SWEATER,
        title: 'Chunky merino cardigan',
        colours: [...SWEATER.colours!, { name: 'Slate', swatch: '#5a6b78' }],
      },
    }),
    template: `
      <div class="grid max-w-3xl grid-cols-3 gap-6">
        <ProductCard :product="two" />
        <ProductCard :product="three" />
        <ProductCard :product="six" />
      </div>
    `,
  }),
};

/** The three media ratios the card offers, side by side, one per grid. */
export const Ratios: Story = {
  render: () => ({
    components: { ProductCard },
    setup: () => ({ product: SWEATER }),
    template: `
      <div class="grid max-w-3xl grid-cols-3 gap-6">
        <ProductCard :product="product" ratio="4x5" />
        <ProductCard :product="product" ratio="1x1" />
        <ProductCard :product="product" ratio="3x4" />
      </div>
    `,
  }),
};

/** `loading`: a skeleton in place of the whole card — media, three text lines at 80/35/50%
 * width, and a button bar — `role="group"` `aria-busy="true"` named "Loading product". */
export const Loading: Story = cardStory({ product: SWEATER, loading: true });

/** A long title (clamped to two lines, full text kept in the link's accessible name), a long
 * vendor name and every optional row on, to prove nothing overflows or misaligns. */
export const LongContent: Story = cardStory({
  showVendor: true,
  product: {
    ...SWEATER,
    title: 'Hand-finished merino wool crew neck sweater in a relaxed fit with ribbed cuffs and hem',
    vendor: 'The Kiln Street Studio Collective, est. 1994',
  },
});

/** A 20rem container: the card stays single-column, the title still clamps, and quick add
 * remains full width with no horizontal overflow. */
export const Narrow: Story = {
  render: (args) => ({
    components: { ProductCard },
    setup: () => ({ args }),
    template: `<div class="w-80"><ProductCard v-bind="args" /></div>`,
  }),
};

/** Forced colours. Swatch dots and the sold-out badge's boundary stay real borders rather than
 * shadows; the proxy focus ring still shows via `Highlight`. */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { ProductCard },
    setup: () => ({
      sweater: SWEATER,
      soldOut: { ...SWEATER, badge: null, available: false },
    }),
    template: `
      <div class="grid max-w-2xl grid-cols-2 gap-6">
        <ProductCard :product="sweater" />
        <ProductCard :product="soldOut" />
      </div>
    `,
  }),
};
