import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import Button from '../button/Button.vue';
import SearchModal from './SearchModal.vue';
import type { SearchResults } from './types';

/**
 * One story per state of the design spec's Search modal section, named after the state it shows.
 * `eldra-starter-spec/images/core/search-modal.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * Every story mounts already **open** (`ref(true)`) — the same convention `Dialog`/`Drawer` use —
 * with a real "Open search" button beside it, so the open → close → reopen cycle stays exercisable
 * in Storybook's own interaction panel, not just inspected in its settled state.
 */
const meta = {
  title: 'Overlays/SearchModal',
  component: SearchModal,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
    messages: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'The same live search as `SearchBar`, inside a native `<dialog>`: opened from a header',
          'trigger you render yourself (a search icon button, a field-like "Search the shop ⌘K"',
          'pill) or with `/` / `⌘K` / `Ctrl+K` from anywhere. "Everything else is exactly as the',
          'Search bar" — read that component\'s own docs page first.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `form`, `field`,',
          '`leadingIcon`, `clear`, `close`, `results`, `footer`, plus every part of the reused',
          '`SearchResultsPanel` (`panel`, `listbox`, `section`, `sectionHeading`, `item`,',
          '`itemImage`, `itemTitle`, `itemMeta`, `itemArrow`, `recent`, `clearRecent`, `popular`,',
          '`chip`, `viewAll`, `loading`, `empty`, `liveRegion`) — `classes` is forwarded straight',
          'into that child.',
          '',
          '**Two v-models.** `v-model` is the open/closed state (as `Dialog`/`Drawer`);',
          '`v-model:query` is the text, its own name because `modelValue` is already spent on the',
          'first one.',
          '',
          '**`Esc`, in three steps** (focus stays in the field throughout): an active option is',
          'cleared first; then, with text in the field, the query is cleared and the dialog stays',
          'open; only then does `Esc` close it.',
          '',
          '**Shortcuts.** `⌘K` / `Ctrl+K` always opens it, even mid-keystroke elsewhere, and',
          "suppresses the browser's own default. `/` opens it only while no `SearchBar` on the page",
          'currently owns that key (`shortcutOwner.ts`, shared with `SearchBar`).',
          '',
          '**Full screen below a 48rem viewport**: no margin, radius, border or scrim; the Close',
          'icon button becomes a "Cancel" text button, the keyboard-hint foot hides, and the field',
          'text drops to 1rem so the browser does not zoom on focus.',
          '',
          '**CSS variables**: `--eldra-search-modal-width`/`-max-height` (both default `40rem`,',
          'clamped to the viewport), `--eldra-search-modal-field-size` (default `1.0625rem`),',
          '`--eldra-search-modal-foot-size`/`-line`, `--eldra-search-modal-kbd-size`, plus every',
          "variable `SearchBar`'s own results panel reads.",
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof SearchModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A flat colour stands in for product photography, as the spec's own reference images do. */
const swatch = (colour: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${colour}"/></svg>`
  )}`;

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

/** Zeroes every motion token for a stable screenshot — the same technique `SearchBar`'s own
 *  stories use, and for the same reason (the dialog's own entrance reads these too). */
const STILL =
  'style="--eldra-duration-fast: 0ms; --eldra-duration-base: 0ms; --eldra-duration-slow: 0ms"';

/** The idle view: recent searches and popular chips, before anyone has typed anything. */
export const Idle: Story = {
  args: { recent: RECENT, popular: POPULAR },
  render: (args) => ({
    components: { SearchModal, Button },
    setup: () => ({ args, open: ref(true), query: ref('') }),
    template: `
      <div ${STILL}>
        <Button variant="outline" @click="open = true">Open search</Button>
        <SearchModal v-bind="args" v-model="open" v-model:query="query" />
      </div>
    `,
  }),
};

/** Typing "mer": grouped results, the match marked in each title, and the "See all" row last. */
export const Results: Story = {
  args: { results: RESULTS },
  render: (args) => ({
    components: { SearchModal, Button },
    setup: () => ({ args, open: ref(true), query: ref('mer') }),
    template: `
      <div ${STILL}>
        <Button variant="outline" @click="open = true">Open search</Button>
        <SearchModal v-bind="args" v-model="open" v-model:query="query" />
      </div>
    `,
  }),
};

/** A request in flight for more than 300ms: three skeleton rows in place of the last answer. */
export const Loading: Story = {
  args: { results: EMPTY, loading: true },
  render: (args) => ({
    components: { SearchModal, Button },
    setup: () => ({ args, open: ref(true), query: ref('wool') }),
    template: `
      <div ${STILL}>
        <Button variant="outline" @click="open = true">Open search</Button>
        <SearchModal v-bind="args" v-model="open" v-model:query="query" />
      </div>
    `,
  }),
};

/** A query with nothing behind it: the query by name, one line of advice and the popular chips. */
export const NoResults: Story = {
  args: { results: EMPTY, popular: POPULAR },
  render: (args) => ({
    components: { SearchModal, Button },
    setup: () => ({ args, open: ref(true), query: ref('teapot') }),
    template: `
      <div ${STILL}>
        <Button variant="outline" @click="open = true">Open search</Button>
        <SearchModal v-bind="args" v-model="open" v-model:query="query" />
      </div>
    `,
  }),
};

/**
 * Below a 48rem viewport: full screen, no margin/radius/border/scrim, "Cancel" replaces the close
 * icon, the foot hides and the field text is 1rem. `scripts/screenshots.mjs` shoots every story at
 * two widths; this one is named for the state the narrow shot actually shows.
 */
export const Narrow: Story = {
  args: { recent: RECENT, popular: POPULAR },
  render: (args) => ({
    components: { SearchModal, Button },
    setup: () => ({ args, open: ref(true), query: ref('') }),
    template: `
      <div ${STILL}>
        <Button variant="outline" @click="open = true">Open search</Button>
        <SearchModal v-bind="args" v-model="open" v-model:query="query" />
      </div>
    `,
  }),
};

/** Reduced motion: a plain opacity fade over `duration-base`, no rise or scale — captured with
 *  `prefers-reduced-motion: reduce` emulated (the story name is the channel, `scripts/screenshots.mjs`
 *  `emulationFor`). */
export const ReducedMotion: Story = {
  args: { results: RESULTS },
  parameters: { eldra: { reducedMotion: true } },
  render: (args) => ({
    components: { SearchModal },
    setup: () => ({ args, open: ref(true), query: ref('mer') }),
    template: `<SearchModal v-bind="args" v-model="open" v-model:query="query" />`,
  }),
};

/** Forced colours: the field's inset ring, the boundary hairlines and the active row's border are
 *  all real, so nothing depends on a fill the mode replaces. */
export const ForcedColors: Story = {
  args: { recent: RECENT, popular: POPULAR },
  parameters: { eldra: { forcedColors: true } },
  render: (args) => ({
    components: { SearchModal },
    setup: () => ({ args, open: ref(true), query: ref('') }),
    template: `<SearchModal v-bind="args" v-model="open" v-model:query="query" />`,
  }),
};
