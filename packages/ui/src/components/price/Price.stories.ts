import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Price from './Price.vue';

/**
 * One story per state of the design spec's Price section, named after the state it shows.
 * `eldra-starter-spec/images/core/price.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Display/Price',
  component: Price,
  tags: ['autodocs'],
  args: { amount: 4800, currency: 'USD', locale: 'en-US' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    compareAt: { control: 'number' },
    amount: { control: 'number' },
    from: { control: 'boolean' },
    loading: { control: 'boolean' },
    revalidating: { control: 'boolean' },
    unitPrice: { table: { disable: true } },
    labels: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'The formatted price of a product or line item — a `<p>` that renders `amount` (in',
          'minor units) with `Intl.NumberFormat`, never a hand-concatenated currency symbol. Sale,',
          '`from` and per-unit are independent flags that combine freely.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `current`,',
          '`compareAt`, `from`, `unit`, `srText` (the hidden "Sale price"/"Regular price" labels,',
          'two elements sharing one part name), `skeleton`.',
          '',
          '**Sale is automatic.** It turns on only when `compareAt` is greater than `amount`; a',
          '`compareAt` at or below `amount` is ignored. On sale, `current` turns `accent` and',
          '`compareAt` renders as a real `<s>`, `muted` and struck through — each preceded by a',
          'visually hidden label (`messages.salePrice`/`regularPrice`, or `labels.sale`/`regular`',
          'per instance) so a screen reader reads "Sale price $38.40 Regular price $48.00" even',
          'though many screen readers do not announce strike-through on their own.',
          '',
          '**`currency`/`locale`** default to `useEldraUiCurrency()`/`useEldraUiLocale()` — a new',
          "`provideEldraUiCurrency()`, the `LOCALE_KEY` pair's sibling — and either prop wins over",
          'the ambient value per instance.',
          '',
          '**`unitPrice`** renders a second, full-width line ("$5.10 / 100 g") — `amount` in minor',
          'units, `per` rendered verbatim after `messages.perUnit`.',
          '',
          '**`loading`** replaces the whole price with one shimmering text skeleton at the current',
          "size, rather than a skeleton per part — the shimmer is `tailwind.css`'s `eldra-skeleton`",
          'utility, shared with the `Skeleton` primitive a later task adds.',
          '',
          '**`revalidating`** is the other half of that pair, for a price that is already on screen',
          'while a fresher one is fetched (a prerendered amount refreshing after load): the amount',
          'stays, dimmed to `--eldra-revalidating-opacity`, with a small spinner drawn beside it',
          "— outside the root's own box, so the price keeps exactly the width and the line breaks",
          'it had — plus `aria-busy="true"` and a hidden live region reading `messages.updatingPrice`.',
          '`loading` wins when both are set.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Price>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A regular price, no sale. */
export const Default: Story = {};

/** `compareAt` above `amount` turns on the sale state: `accent` current, struck-through `muted`
 * compare-at, and the hidden "Sale price"/"Regular price" labels. */
export const Sale: Story = { args: { amount: 3840, compareAt: 4800 } };

/** `from`, for a product whose variants differ in price. */
export const From: Story = { args: { amount: 1530, from: true } };

/** A per-unit price on its own full-width second line, combined with a sale to show every part at
 * once ("From $15.30 ~~$18.00~~ / $5.10 / 100 g"). */
export const UnitPrice: Story = {
  args: {
    amount: 1530,
    compareAt: 1800,
    from: true,
    unitPrice: { amount: 510, per: '100 g' },
  },
};

/** `is-IS` / `ISK`: no minor units, "." groups thousands — `formatNumber`'s own locale data, not a
 * hand-written rule. */
export const Isk: Story = {
  args: {
    amount: 6990,
    compareAt: 8990,
    currency: 'ISK',
    locale: 'is-IS',
    labels: { sale: 'Tilboðsverð', regular: 'Fullt verð' },
  },
};

/** The three sizes, sale and regular. `md`'s current price takes no size of its own — it inherits
 * whatever the surrounding text sets, 1rem here. */
export const Sizes: Story = {
  render: () => ({
    components: { Price },
    template: `
      <div class="flex flex-col gap-3">
        <Price size="sm" :amount="4800" />
        <Price size="sm" :amount="3840" :compare-at="4800" />
        <Price size="md" :amount="4800" />
        <Price size="md" :amount="3840" :compare-at="4800" />
        <Price size="lg" :amount="4800" />
        <Price size="lg" :amount="3840" :compare-at="4800" />
      </div>
    `,
  }),
};

/** A text skeleton at 35% width, at the current size, instead of the price, while a page waits on
 * the real value. */
export const Loading: Story = { args: { loading: true } };

/** The loading skeleton's shimmer, disabled: shapes stay static under `prefers-reduced-motion:
 * reduce` rather than sweeping (spec "Skeleton" → Behaviour & motion). */
export const ReducedMotion: Story = {
  parameters: { eldra: { reducedMotion: true } },
  args: { loading: true },
};

/**
 * `revalidating`: the same price, twice — as it renders normally, and while a live value is on
 * its way. The dimmed row is the second one, and the two are exactly the same width, in the same
 * place, with the same line breaks: the spinner is drawn outside the price's own box, so a value
 * being refreshed never moves the page around it.
 */
export const Revalidating: Story = {
  render: () => ({
    components: { Price },
    template: `
      <div class="flex flex-col gap-3">
        <Price :amount="3840" :compare-at="4800" />
        <Price :amount="3840" :compare-at="4800" revalidating />
        <Price size="lg" :amount="1530" from :unit-price="{ amount: 510, per: '100 g' }" revalidating />
      </div>
    `,
  }),
};

/** A 20rem container. The combined kind (from, sale, unit) wraps across lines instead of
 * overflowing. */
export const Narrow: Story = {
  render: () => ({
    components: { Price },
    template: `
      <div class="w-80 border border-border p-4">
        <Price
          :amount="1530"
          :compare-at="1800"
          from
          :unit-price="{ amount: 510, per: '100 g' }"
        />
      </div>
    `,
  }),
};

/**
 * Forced colours. The compare-at keeps a real `<s>` strike-through and the hidden sale/regular
 * labels remain, so the sale state reads correctly once the `accent` colour is gone (1.4.1).
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  args: { amount: 3840, compareAt: 4800 },
};
