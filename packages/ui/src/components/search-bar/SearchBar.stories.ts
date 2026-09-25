import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import SearchBar from './SearchBar.vue';
import type { SearchResults } from './types';

/**
 * One story per state of the design spec's Search bar section, named after the state it shows.
 * `eldra-starter-spec/images/core/search-bar.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * The panel stories open the panel with `autofocus`, which is the one way a static render can
 * reach it (the panel opens on focus, and a screenshot script cannot type). They also zero the
 * motion tokens on the story's own wrapper, so the panel's entrance and the focused field's own
 * border and ring transitions are already finished whenever the screenshot lands — the same end
 * state, without a baseline that depends on when the shutter fell. Neither is component behaviour:
 * a real header never autofocuses, which is why the closed stories do not.
 */
const meta = {
  title: 'Forms/SearchBar',
  component: SearchBar,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
    messages: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A search field whose grouped results appear in a panel right below it: products,',
          'collections, journal and help pages, plus a “See all results” row that opens the Search',
          'page. Use it inline — in a header, at the top of a Search block (`size="lg"`), in a',
          'collection toolbar. When there is no room for a field, the Search **modal** is the same',
          'component inside a native `<dialog>`.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `form`, `field`,',
          '`leadingIcon`, `clearButton`, `shortcutHint`, `panel`, `listbox`, `section`,',
          '`sectionHeading`, `item`, `itemImage`, `itemTitle`, `itemMeta`, `itemArrow`, `recent`,',
          '`clearRecent`, `popular`, `chip`, `viewAll`, `loading`, `empty` and `liveRegion`.',
          '',
          '**Not a dialog.** The results panel is a non-modal popup (the spec’s non-negotiable 2),',
          'rendered in place, positioned with `useFloating` (matching the field’s width) and closed',
          'by `useOverlay`. Focus never leaves the field: rows are reached through',
          '`aria-activedescendant`, and a pointer press inside the panel does not blur the caret.',
          '',
          '**The form is real.** `<form role="search" method="get" :action>` with the field named',
          '`q`, so pressing `Enter` with no active row goes to the Search page with or without',
          'scripting. `submit` fires with the query first; nothing is prevented.',
          '',
          '**Four views, one at a time.** `idle` (recent rows and popular chips on an empty query),',
          '`results` (Products max 4, Collections max 3, Journal and help max 3, then “See all N',
          'results”), `none` (the query, one line of advice and the popular chips as suggestions)',
          'and `loading` — which shows only after a request has been in flight for **300ms**, so a',
          'fast response never flickers the panel.',
          '',
          '**Keyboard.** `/` anywhere on the page focuses the field (never while someone is typing',
          'somewhere else). `ArrowDown`/`ArrowUp` open and walk every row across groups without',
          'wrapping, `Enter` follows the active row (or fills the field from a recent row or chip,',
          'or submits when nothing is active), `Escape` clears the active row, then the query, then',
          'closes, and `Tab` closes and moves on.',
          '',
          '**Recent searches** come from `localStorage["eldra-ui:recent-searches"]` when the',
          '`recent` prop is not given (read defensively: a storage that refuses is simply no',
          'history), and “Clear recent searches” empties it and emits `clearRecent`.',
          '',
          '**CSS variables**: `--eldra-search-panel-max-height` (default `32rem`, clamped to',
          '`70vh`), `--eldra-search-text-line`, `--eldra-search-empty-line`, `--eldra-search-kbd-',
          'line`, `--eldra-input-radius`, `--eldra-field-border-width`, `--eldra-z-popover`, and',
          '`--eldra-popover-origin` (set by the panel itself from the placement it resolved to:',
          '`top left` below the field, `bottom left` above it — the corner the entrance grows from).',
          '',
          '**Entrance**: the panel fades in and scales from 98% over `duration-base`, the same',
          'entrance `Select` and `MultiSelect` play. Closing is instant, and under reduced motion',
          'the panel simply appears (`--eldra-duration-base` is `0ms` there).',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof SearchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A flat colour stands in for product photography, exactly as the spec's reference images do — as a
 * `data:` URI, because an Artifact-style static render has no network and a broken image would be
 * a worse baseline than no image at all.
 */
const swatch = (colour: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${colour}"/></svg>`
  )}`;

/** The spec's own results for "mer", from the reference image. */
const RESULTS: SearchResults = {
  products: [
    {
      id: 'p1',
      title: 'Merino crew sweater',
      href: '/products/merino-crew-sweater',
      price: '$96.00',
      image: swatch('#8a6a52'),
      imageAlt: '',
    },
    {
      id: 'p2',
      title: 'Merino rib beanie',
      href: '/products/merino-rib-beanie',
      price: '$38.00',
      image: swatch('#5f7a5e'),
      imageAlt: '',
    },
    {
      id: 'p3',
      title: 'Chunky merino cardigan',
      href: '/products/chunky-merino-cardigan',
      price: '$148.00',
      image: swatch('#6f6f6f'),
      imageAlt: '',
    },
  ],
  collections: [{ id: 'c1', title: 'Knitwear', href: '/collections/knitwear' }],
  articles: [
    { id: 'a1', title: 'Caring for merino: a short guide', href: '/journal/caring-for-merino' },
  ],
  pages: [{ id: 'g1', title: 'Care guides', href: '/pages/care-guides' }],
  total: 7,
};

const EMPTY: SearchResults = { products: [], collections: [], articles: [], pages: [], total: 0 };

const RECENT = ['merino scarf', 'espresso cups'];
const POPULAR = ['Gifts under $50', 'Merino', 'Stoneware mugs', 'Linen'];

/**
 * Zeroes every motion token for a stable screenshot: the panel's 200ms entrance and the focused
 * field's own border-colour and focus-ring transitions all read these. Story-only — the same end
 * state, without a baseline that depends on when the shutter fell. See the file's own note.
 */
const STILL =
  'style="--eldra-duration-fast: 0ms; --eldra-duration-base: 0ms; --eldra-duration-slow: 0ms"';

/** The header's centred search: md, in a row with the shop name and the account and bag icons. */
export const Header: Story = {
  args: { shortcut: true },
  render: (args) => ({
    components: { SearchBar },
    setup: () => ({ args, query: ref('') }),
    template: `
      <header class="border-border flex items-center gap-6 rounded-lg border p-4">
        <span class="text-h4">Northwind Goods</span>
        <div class="max-w-lg flex-1">
          <SearchBar v-bind="args" v-model="query" />
        </div>
        <span class="text-muted text-body-sm">account · bag</span>
      </header>
    `,
  }),
};

/** The header's fully rounded variant. */
export const Pill: Story = {
  args: { pill: true },
  render: (args) => ({
    components: { SearchBar },
    setup: () => ({ args, query: ref('') }),
    template: `<div class="max-w-lg"><SearchBar v-bind="args" v-model="query" /></div>`,
  }),
};

/** The Search page's field: 3rem tall, 1rem text, a 1.25rem icon. */
export const Large: Story = {
  args: { size: 'lg' },
  render: (args) => ({
    components: { SearchBar },
    setup: () => ({ args, query: ref('') }),
    template: `<div class="max-w-xl"><SearchBar v-bind="args" v-model="query" /></div>`,
  }),
};

/** Typing "mer": grouped results, the match marked in each title, and the "See all" row last. */
export const WithResults: Story = {
  args: { modelValue: 'mer', results: RESULTS, autofocus: true },
  render: (args) => ({
    components: { SearchBar },
    setup: () => ({ args }),
    template: `
      <div class="max-w-lg pb-96" ${STILL}>
        <SearchBar v-bind="args" />
      </div>
    `,
  }),
};

/** A request in flight for more than 300ms: three skeleton rows in place of the last answer. */
export const Loading: Story = {
  args: { modelValue: 'wool', results: EMPTY, loading: true, autofocus: true },
  render: (args) => ({
    components: { SearchBar },
    setup: () => ({ args }),
    template: `
      <div class="max-w-lg pb-80" ${STILL}>
        <SearchBar v-bind="args" />
      </div>
    `,
  }),
};

/** A query with nothing behind it: the query by name, one line of advice, and the popular chips. */
export const NoResults: Story = {
  args: { modelValue: 'teapot', results: EMPTY, popular: POPULAR, autofocus: true },
  render: (args) => ({
    components: { SearchBar },
    setup: () => ({ args }),
    template: `
      <div class="max-w-lg pb-80" ${STILL}>
        <SearchBar v-bind="args" />
      </div>
    `,
  }),
};

/** The idle view: up to five recent rows, the row that empties them, then the popular chips. */
export const RecentAndPopular: Story = {
  args: { recent: RECENT, popular: POPULAR, autofocus: true },
  render: (args) => ({
    components: { SearchBar },
    setup: () => ({ args }),
    template: `
      <div class="max-w-sm pb-96" ${STILL}>
        <SearchBar v-bind="args" />
      </div>
    `,
  }),
};

/** A 20rem container: the panel matches the field, and every title truncates with an ellipsis. */
export const Narrow: Story = {
  args: { modelValue: 'mer', results: RESULTS, autofocus: true },
  render: (args) => ({
    components: { SearchBar },
    setup: () => ({ args }),
    template: `
      <div class="border-border w-80 border p-4 pb-96" ${STILL}>
        <SearchBar v-bind="args" />
      </div>
    `,
  }),
};

/**
 * Forced colours. Every boundary is a real border — the field, the keyboard-key chip, the panel,
 * the suggestion chips — so nothing depends on a fill that the mode replaces, and the focus ring
 * takes the system Highlight colour.
 */
export const ForcedColors: Story = {
  args: { popular: POPULAR, recent: RECENT, autofocus: true },
  parameters: { eldra: { forcedColors: true } },
  render: (args) => ({
    components: { SearchBar },
    setup: () => ({ args, plain: ref(''), large: ref('') }),
    template: `
      <div class="flex max-w-lg flex-col gap-4 pb-96" ${STILL}>
        <SearchBar v-model="plain" pill />
        <SearchBar v-model="large" size="lg" :shortcut="false" />
        <SearchBar v-bind="args" />
      </div>
    `,
  }),
};
