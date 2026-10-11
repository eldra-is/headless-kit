import { IconCircleCheck, IconLeaf } from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Badge from './Badge.vue';
import StockBadge from './StockBadge.vue';

/**
 * One story per state of the design spec's Badge section, named after the state it shows.
 * `eldra-starter-spec/images/core/badge.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Display/Badge',
  component: Badge,
  tags: ['autodocs'],
  args: { label: 'Knitwear' },
  argTypes: {
    tone: {
      control: 'inline-radio',
      options: ['neutral', 'primary', 'accent', 'success', 'warning', 'danger'],
    },
    variant: { control: 'inline-radio', options: ['none', 'sale', 'new'] },
    outline: { control: 'boolean' },
    pill: { control: 'boolean' },
    icon: { table: { disable: true } },
    as: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A short, non-interactive label for product flags (Sale, New, Sold out), categories,',
          'materials and order states — an inline `<span>`, never focusable and never a link or',
          'button. `StockBadge`, documented on this page under "Stock", is the same section\'s',
          'inline stock status line: icon + words, no fill.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `icon`, `label`,',
          '`hiddenSuffix`.',
          '',
          '**Slots**: `default` (the label, overrides the `label` prop).',
          '',
          '**`variant` overrides `tone`.** `sale` always renders like `accent`, `new` always like',
          '`primary`, whatever `tone` is passed alongside it. A product shows at most two badges,',
          'ordered New, then Sale.',
          '',
          '**`outline` replaces the fill entirely**, independent of tone: a `background` fill with',
          'a 1px inset `border-strong` boundary, for "Sold out" on media and low-emphasis tags.',
          '`pill` is a separate, combinable modifier — fully rounded ends, wider padding — for',
          'category chips.',
          '',
          '**`success`/`warning`/`danger` require an `icon`.** Colour is never the only signal',
          '(WCAG 1.4.1); a badge with one of these tones and no icon warns in development. The',
          '`icon` prop takes a Vue icon component (for example `IconCircleCheck` from',
          "`@tabler/icons-vue`), rendered decorative (`aria-hidden`) at the spec's 0.875rem / 2.25",
          'stroke, drawn directly rather than through the shared `Icon` component (neither that',
          "size nor that stroke is one of `Icon`'s four).",
          '',
          '**`hiddenSuffix`** completes a symbol for assistive technology — `label="−20%"`,',
          '`hidden-suffix=" off"` reads "−20% off". The value is rendered verbatim, leading space',
          'included.',
          '',
          '**`revalidating`** (`StockBadge` only) keeps the level on screen, dimmed, with a small',
          'spinner beside it while a fresher one is fetched — `aria-busy="true"` on the root and a',
          'hidden live region reading `messages.updatingStock` (`announce: false` drops that region',
          'for a page that announces the refresh once itself). Parts: `spinner`, `srStatus`, and',
          '`labelValue`, the inner span holding the words. Independently of the flag, changed',
          'wording fades in over `duration-base` rather than the line simply reading differently —',
          'enter only, on the element that already holds the new words, and with no animation at',
          'all under `prefers-reduced-motion: reduce`.',
          '',
          '**Messages** (`StockBadge` only): `stockIn`, `stockLow(n)`, `soldOut` (shared with the',
          '`Badge` sold-out state above — one key, not two, for the same phrase),',
          '`stockPreorder(date?)` — the default copy per level. `StockBadge` has no `date` prop, so',
          'the pre-order default reads plain "Pre-order"; pass `message` for the exact ship date.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The six fill colours, default shape. */
export const Tones: Story = {
  render: () => ({
    components: { Badge },
    setup: () => ({ IconCircleCheck }),
    template: `
      <div class="flex flex-wrap items-center gap-2">
        <Badge label="Hand-glazed" tone="neutral" />
        <Badge label="Bestseller" tone="primary" />
        <Badge label="Gift ready" tone="accent" />
        <Badge label="Paid" tone="success" :icon="IconCircleCheck" />
        <Badge label="Back-order" tone="warning" :icon="IconCircleCheck" />
        <Badge label="Cancelled" tone="danger" :icon="IconCircleCheck" />
      </div>
    `,
  }),
};

/** The product discount flag. Renders like `accent`; overrides `tone`. */
export const Sale: Story = {
  render: () => ({
    components: { Badge },
    template: `
      <div class="flex items-center gap-2">
        <Badge label="−20%" variant="sale" hidden-suffix=" off" />
        <Badge label="Sale" variant="sale" />
      </div>
    `,
  }),
};

/** The new-product flag. Renders like `primary`; overrides `tone`. */
export const New: Story = { args: { label: 'New', variant: 'new' } };

/** Background fill with a 1px inset boundary. "Sold out" on media, low-emphasis tags. */
export const Outline: Story = {
  render: () => ({
    components: { Badge },
    setup: () => ({ IconLeaf }),
    template: `
      <div class="flex flex-wrap items-center gap-2">
        <Badge label="Sold out" outline />
        <Badge label="Organic cotton" outline :icon="IconLeaf" />
      </div>
    `,
  }),
};

/** Fully rounded ends, wider padding. Combinable with any tone or outline. */
export const Pill: Story = {
  render: () => ({
    components: { Badge },
    template: `
      <div class="flex flex-wrap items-center gap-2">
        <Badge label="Knitwear" pill />
        <Badge label="Bestseller" tone="primary" pill />
        <Badge label="Hand-glazed" outline pill />
      </div>
    `,
  }),
};

/** A decorative leading icon, hidden from assistive technology. */
export const WithIcon: Story = {
  args: { label: 'Paid', tone: 'success', icon: IconCircleCheck },
};

/** A hidden word completes a symbol: "−20%" is announced "−20% off". */
export const HiddenSuffix: Story = {
  args: { label: '−20%', variant: 'sale', hiddenSuffix: ' off' },
};

/** The `in` level: success + circle-check. */
export const StockInStock: Story = {
  name: 'Stock/InStock',
  render: () => ({ components: { StockBadge }, template: `<StockBadge level="in" />` }),
};

/** The `low` level: warning + alert-triangle, with the quantity in the copy. */
export const StockLowStock: Story = {
  name: 'Stock/LowStock',
  render: () => ({
    components: { StockBadge },
    template: `<StockBadge level="low" :quantity="3" />`,
  }),
};

/** The `out` level: danger + circle-x. */
export const StockSoldOut: Story = {
  name: 'Stock/SoldOut',
  render: () => ({ components: { StockBadge }, template: `<StockBadge level="out" />` }),
};

/** The `preorder` level: muted + clock. `message` supplies the exact ship date. */
export const StockPreorder: Story = {
  name: 'Stock/Preorder',
  render: () => ({
    components: { StockBadge },
    template: `<StockBadge level="preorder" message="Pre-order, ships 14 Nov" />`,
  }),
};

/**
 * `revalidating`: the stock line as it renders normally, then while a live level is on its way —
 * the words stay, dimmed (`--eldra-revalidating-opacity`, deep enough to read as unsettled rather
 * than as settled text), with a spinner drawn beside them outside the line's own box, so nothing
 * moves. `aria-busy="true"` and a hidden live region reading `messages.updatingStock` come with it,
 * and when the fresher level lands its wording fades in — see `Display/Price`'s own `ValueChange`
 * story for that half, which a still image cannot show.
 */
export const StockRevalidating: Story = {
  name: 'Stock/Revalidating',
  render: () => ({
    components: { StockBadge },
    template: `
      <div class="flex flex-col items-start gap-2">
        <StockBadge level="in" />
        <StockBadge level="in" revalidating />
        <StockBadge level="low" :quantity="3" revalidating />
      </div>
    `,
  }),
};

/** The label never wraps — the min-height grows instead, so 1.4.12 text spacing never clips it. */
export const LongContent: Story = {
  args: { label: 'Hand-glazed stoneware, made to order in small batches over six weeks' },
};

/** A 20rem container. Badges wrap onto their own line rather than overflowing. */
export const Narrow: Story = {
  render: () => ({
    components: { Badge, StockBadge },
    template: `
      <div class="w-80 border border-border p-4 flex flex-col gap-2">
        <div class="flex flex-wrap gap-2">
          <Badge label="New" variant="new" />
          <Badge label="Sale" variant="sale" />
          <Badge label="Hand-glazed stoneware" tone="neutral" />
        </div>
        <StockBadge level="low" :quantity="3" />
      </div>
    `,
  }),
};

/**
 * Forced colours. The outline boundary is a real border, so it stays visible when fills are
 * replaced by the system canvas; the stock status lines keep their icon-plus-word pairing, which
 * carries the meaning once colour is gone (1.4.1).
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Badge, StockBadge },
    setup: () => ({ IconCircleCheck }),
    template: `
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <Badge label="Knitwear" tone="neutral" />
          <Badge label="New" variant="new" />
          <Badge label="Sale" variant="sale" />
          <Badge label="Sold out" outline />
          <Badge label="Paid" tone="success" :icon="IconCircleCheck" />
        </div>
        <div class="flex flex-col gap-1">
          <StockBadge level="in" />
          <StockBadge level="low" :quantity="3" />
          <StockBadge level="out" />
          <StockBadge level="preorder" message="Pre-order, ships 14 Nov" />
        </div>
      </div>
    `,
  }),
};
