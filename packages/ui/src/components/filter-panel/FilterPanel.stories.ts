import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { getCurrentInstance, nextTick, onMounted, ref } from 'vue';
import FilterPanel from './FilterPanel.vue';
import {
  ALL_FACETS,
  AVAILABILITY_FACET,
  CATEGORY_FACET,
  CATEGORY_TREE_FACET,
  COLOUR_FACET,
  MATERIAL_FACET,
  PRICE_FACET,
  SIZE_FACET,
} from './northwind';
import type { FilterSelection } from './types';

/**
 * One story per state of the design spec's "Filter panel" section, named after the state it shows;
 * `eldra-starter-spec/images/core/filter-panel--part1.png` and `--part2.png` are the review target
 * for all of them, and `scripts/screenshots.mjs` compares each against the committed baseline in
 * `__screenshots__/`.
 *
 * **One departure from this package's story norm, deliberately.** Most stories here are `render:`
 * closures with local state that barely touch `args`. This panel puts `mode`, `title`, `showHead`,
 * `showApplied`, `locale`, `currency`, `resultCount`, `dense` **and `facets`** in `args`, so the
 * Controls panel alone moves it through every variant the spec names — which is what makes it
 * reviewable the way a configurable block is, rather than only as a gallery of fixed pictures. The
 * `facets` control is a `select` over named fixtures, because a raw object control for a list of
 * facets is not something anybody can edit by hand.
 *
 * The selection is always local to the story: the panel is controlled, and a story with no
 * `v-model` would render a panel nothing could tick.
 */

/** The facet sets the `facets` control picks between, each named for what it shows. */
const FACET_SETS = {
  'Every facet type': ALL_FACETS,
  'Category only': [CATEGORY_FACET],
  'Category as a tree': [CATEGORY_TREE_FACET],
  'Material (13 values)': [MATERIAL_FACET],
  'Colour only': [COLOUR_FACET],
  'Colour as a swatch grid': [{ ...COLOUR_FACET, layout: 'grid' as const }],
  'Size only': [SIZE_FACET],
  'Price only': [PRICE_FACET],
  'Price with no histogram': [{ ...PRICE_FACET, histogram: undefined }],
  'Availability only': [AVAILABILITY_FACET],
  'Every facet type, collapsed': ALL_FACETS.map((facet) => ({ ...facet, collapsed: true })),
  'Every facet type, plus a long list': [...ALL_FACETS, MATERIAL_FACET],
} satisfies Record<string, unknown>;

const meta = {
  title: 'Commerce/FilterPanel',
  component: FilterPanel,
  tags: ['autodocs'],
  args: {
    facets: ALL_FACETS,
    mode: 'sidebar',
    showHead: true,
    showApplied: false,
    locale: 'en-US',
    currency: 'USD',
    resultCount: 24,
    dense: false,
  },
  argTypes: {
    facets: {
      control: 'select',
      options: Object.keys(FACET_SETS),
      mapping: FACET_SETS,
      description: 'A named facet set from the design spec’s own Northwind sample.',
    },
    mode: { control: 'inline-radio', options: ['sidebar', 'drawer'] },
    showHead: { control: 'boolean' },
    showApplied: { control: 'boolean' },
    dense: { control: 'boolean' },
    title: { control: 'text' },
    label: { control: 'text' },
    locale: { control: 'inline-radio', options: ['en-US', 'is-IS'] },
    currency: { control: 'inline-radio', options: ['USD', 'ISK'] },
    resultCount: { control: 'number' },
    idPrefix: { table: { disable: true } },
    classes: { table: { disable: true } },
    messages: { table: { disable: true } },
    modelValue: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'The faceted product filter a collection or search page is narrowed with: collapsible',
          'facet groups with counts, real colour swatches, size tiles grouped by size system, a',
          'price range with an optional histogram, and availability switches. It sits in a sidebar',
          'from 64rem of block width and inside the filter **Drawer** below that. For a single',
          'choice inside a form use **Checkbox**, **RadioGroup** or **Select**; to choose a',
          "product's own variant use **VariantPicker**.",
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `head`, `title`,',
          '`clear`, `applied`, `chip`, `group`, `trigger`, `groupLabel`, `badge`, `summary`,',
          '`chevron`, `body`, `legend`, `search`, `noMatches`, `values`, `row`, `rowLabel`,',
          '`count`, `checkbox`, `showAll`, `swatch`, `swatchMark`, `swatchStrike`, `subheading`,',
          '`tile`, `tileLabel`, `sizeGuide`, `range`, `histogram`, `histogramBar`, `fields`,',
          '`field`, `fieldLabel`, `separator`, `switchRow`, `foot`. Two of them are composed',
          "children, so they are styled through these keys but addressed by the child's own",
          '`data-part`: a `list` row is a `Checkbox` (`[data-part="values"] [data-part="root"]`)',
          'and `chip` marks the `<li>` around each `Chip`.',
          '',
          '**It is controlled and URL-free.** The selection leaves as `v-model` / `change` and the',
          'owning page keeps the query string, the debounce window and the result count. A',
          'published component that wrote a query string would hard-wire a router into every store',
          'that installed it. `mode` is the one thing the panel knows about where it is: `drawer`',
          'draws the foot that batches, `sidebar` does not, and in both modes every edit is',
          'reported as it happens.',
          '',
          '**Facets.** `type` picks one of five shapes over the same values — `list` (checkbox rows',
          'with counts), `colour` (real product swatches as rows, or tiles with',
          "`layout: 'grid'`), `size` (equal tiles grouped under one sub-heading per size system,",
          'with a **Size guide** link), `range` (a two-thumb **RangeSlider** with Min/Max fields and',
          'an optional decorative histogram) and `toggle` (one **Switch** per yes/no facet, never a',
          'checkbox pair). `collapsed` starts a group closed, and a group with a selected value',
          'always starts open regardless.',
          '',
          '**Thresholds.** A `list` facet shows the first 6 values then **Show all N** / **Show',
          'fewer**; more than 12 values add a search field above it, which filters the *whole* list',
          'case- and accent-insensitively and says "No matches for “x”" in a status region.',
          '',
          '**Every value is a real checkbox**, however it is painted: a swatch and a size tile are',
          'one stretched invisibly over the whole row or tile, so the whole thing is the target and',
          'carries the one focus ring. A value with nothing left stays in place, disabled and',
          'struck through — never hidden, so the list does not jump while filtering — and a value',
          'the shopper has selected is never disabled.',
          '',
          "**A swatch's check mark works out its own ink** from the colour's relative luminance",
          '(`swatchInk`, exported): `text` above 0.35, `focus-inner` otherwise, with gradients and',
          'patterns counting as dark. Selection is three cues either way — a ring, a check mark and',
          'a bold name — never colour alone.',
          '',
          '**Keyboard**: `Tab` walks the head, the chips, then each group trigger followed by its',
          "open body's controls; `Space` checks any value and toggles any switch; the range thumbs",
          'take arrows, `PageUp`/`PageDown` and `Home`/`End`; `Enter` in a Min or Max field commits',
          'it and never submits the form; and `Esc` inside an expanded group collapses it and',
          'returns focus to its trigger — in the sidebar only, because in the drawer that key',
          'belongs to the dialog and has to reach it.',
          '',
          '**Events**: `update:modelValue` and `change` after every check, switch, committed range',
          "or field; `apply` when the drawer's **Show N products** is pressed; `clear` after",
          '**Clear all** has reset every facet, ranges included; `remove` with `{facetId, value}`',
          'for a chip. `defineExpose({ focusTitle, focusChip })` for the focus moves a page owns.',
          '',
          '**Slots**: `foot` (the drawer foot, whose default content is the spec’s own two buttons)',
          'and `facet` (one facet’s body, for a type this package does not draw).',
          '',
          '**CSS variables**: `--eldra-filter-subheading-tracking` (default `0.06em`),',
          '`--eldra-filter-swatch-edge-width` (`1px`), `--eldra-filter-swatch-ring-width`',
          '(`1.5px`), `--eldra-filter-histogram-bar-min` (`2px`) and',
          '`--eldra-filter-histogram-bar-radius` (`1px`).',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof FilterPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every story renders through this one helper, inside a column of a realistic width — the spec
 * sizes the panel at "sidebar 15–17rem, drawer full width", and a story's own page is neither, so
 * the width is stated rather than left to the viewport.
 */
function panel(width = '16rem', selection: FilterSelection = {}) {
  return {
    render: (args: Record<string, unknown>) => ({
      components: { FilterPanel },
      setup: () => ({ args, selection: ref<FilterSelection>({ ...selection }), width }),
      template: `
        <div :style="{ width }">
          <FilterPanel v-bind="args" v-model="selection" />
        </div>
      `,
    }),
  };
}

/**
 * Clicks the named groups' own triggers once the panel has mounted — the same real click
 * `Popover.stories.ts`'s `openOnMount` uses on its own trigger, for the same reason: a group whose
 * facet carries `collapsed: true` **and** a selection starts open regardless
 * (`useFilterPanel.ts`'s `facetStartsOpen`, spec → Facet shape, `collapsed`: "a group with a
 * selected value always starts open"), so a story wanting the *collapsed*-with-summary state the
 * reference image shows has to close it the way a shopper would — a click on the trigger — rather
 * than ask the panel to render a state its own rule forbids on mount.
 */
function collapseGroupsOnMount(facetIds: readonly string[]): void {
  const instance = getCurrentInstance();
  onMounted(() => {
    void nextTick(() => {
      const root = instance?.proxy?.$el as Element | null | undefined;
      for (const facetId of facetIds) {
        root
          ?.querySelector<HTMLElement>(
            `[data-part="group"][data-facet="${facetId}"] [data-part="trigger"]`
          )
          ?.click();
      }
    });
  });
}

/** The sidebar as a collection page draws it: every facet type, nothing selected yet. */
export const Sidebar: Story = { ...panel() };

/**
 * Every facet type with something chosen in each: the badge, the bold labels, the checked swatch
 * ring and check mark, the filled size tile, the narrowed range and the switch that is on.
 */
export const Selected: Story = {
  ...panel('16rem', {
    category: ['sweaters'],
    colour: ['brown', 'natural'],
    size: ['m'],
    price: [80, 160],
    availability: ['in_stock'],
  }),
};

/**
 * Collapsed groups with their summaries. A group with a selection would open itself
 * (`facetStartsOpen`), so Category and Colour are closed **after** mount, by the same real click a
 * shopper would make (`collapseGroupsOnMount`) — the summary is what the trigger shows once closed,
 * "Sweaters", "Brown, Natural", truncated with an ellipsis when it does not fit. Every other group
 * stays open, exactly as `collapsed: true` with no selection of its own already draws it.
 */
export const CollapsedSummaries: Story = {
  args: { facets: FACET_SETS['Every facet type, collapsed'] },
  render: (args: Record<string, unknown>) => ({
    components: { FilterPanel },
    setup: () => {
      collapseGroupsOnMount(['category', 'colour']);
      return {
        args,
        selection: ref<FilterSelection>({ category: ['sweaters'], colour: ['brown', 'natural'] }),
      };
    },
    template: `
      <div style="width: 16rem">
        <FilterPanel v-bind="args" v-model="selection" />
      </div>
    `,
  }),
};

/**
 * A long list facet: 13 values, so it shows the first six behind **Show all 13** *and* a search
 * field above them. Type into the field to see it filter the whole list rather than those six.
 */
export const LongListSearchable: Story = {
  args: { facets: FACET_SETS['Material (13 values)'] },
  ...panel('16rem'),
};

/** Colour as swatch rows, with Brown and Natural checked and Navy struck through at 0. */
export const SwatchRows: Story = {
  args: { facets: FACET_SETS['Colour only'] },
  ...panel('16rem', { colour: ['brown', 'natural'] }),
};

/**
 * The same rows at 28rem — past the spec's 26rem edge, so they take two columns. The breakpoint is
 * the **panel's** own width, not the viewport's, which is why a 15rem sidebar never does this.
 */
export const SwatchRowsTwoColumn: Story = {
  args: { facets: FACET_SETS['Colour only'] },
  ...panel('28rem', { colour: ['brown'] }),
};

/** Colour as swatch tiles (`layout: 'grid'`): the swatch above, the name and count centred below. */
export const SwatchGrid: Story = {
  args: { facets: FACET_SETS['Colour as a swatch grid'] },
  ...panel('22rem', { colour: ['natural'] }),
};

/**
 * Two size systems under their own sub-headings, never mixed in one grid, with the **Size guide**
 * link below — and two sizes nothing is left for, drawn dashed and struck through rather than
 * hidden.
 */
export const SizeSystems: Story = {
  args: { facets: FACET_SETS['Size only'] },
  ...panel('18rem', { size: ['m'] }),
};

/** The price range with its 24-bar histogram: the bars between the thumbs are the ones in range. */
export const PriceHistogram: Story = {
  args: { facets: FACET_SETS['Price only'] },
  ...panel('18rem', { price: [80, 160] }),
};

/** The same range with no distribution supplied: the panel draws no histogram at all rather than
 *  inventing one from the page it can see. */
export const PriceWithoutHistogram: Story = {
  args: { facets: FACET_SETS['Price with no histogram'] },
  ...panel('18rem'),
};

/**
 * The same range in Icelandic krónur: the thumbs announce "3.500 kr.", the fields put the sign
 * after the number, and the maximum thumb at its limit adds " eða meira" when the Icelandic
 * message set is provided (English "or more" here, since this story does not swap the catalogue).
 */
export const PriceIsIS: Story = {
  args: {
    facets: [{ ...PRICE_FACET, min: 3500, max: 14_000, step: 100 }],
    locale: 'is-IS',
    currency: 'ISK',
  },
  ...panel('18rem', { price: [5000, 11_000] }),
};

/**
 * Values nothing is left for, in all three shapes at once: a disabled checkbox row, a swatch at
 * 45% with a diagonal strike, and a dashed, struck size tile. They stay in place so the list does
 * not jump while filtering — and Navy is selected here as well, which is why that one is **not**
 * disabled: a selected value is the one the shopper has to be able to un-tick.
 */
export const ZeroCounts: Story = {
  args: {
    facets: [
      {
        id: 'fit',
        label: 'Fit',
        type: 'list',
        values: [
          { value: 'relaxed', label: 'Relaxed', count: 12 },
          { value: 'boxy', label: 'Boxy', count: 0 },
        ],
      },
      COLOUR_FACET,
      SIZE_FACET,
    ],
  },
  ...panel('18rem', { colour: ['navy'] }),
};

/** The applied-filter chips above the groups, one per selected value, each named by its facet. */
export const AppliedChips: Story = {
  args: { showApplied: true },
  ...panel('18rem', { category: ['sweaters'], colour: ['brown', 'natural'], size: ['m'] }),
};

/** A facet the store answers as a tree: children one indent in, inside a group named after their
 *  parent — a real grouping for a screen reader and no extra tab stop. */
export const NestedCategories: Story = {
  args: { facets: FACET_SETS['Category as a tree'] },
  ...panel('16rem', { category: ['tableware'] }),
};

/**
 * Drawer mode: no head (the drawer's own title is the heading), the applied chips above the
 * groups, and the sticky foot's **Clear all** / **Show 24 products** — whose number is the owning
 * page's own live count for the pending selection.
 */
export const Drawer: Story = {
  args: { mode: 'drawer', showHead: false, showApplied: true, resultCount: 24 },
  ...panel('22rem', { colour: ['brown'], size: ['m'] }),
};

/** The same foot before any count has arrived: the words stand alone rather than claiming a zero. */
export const DrawerWithoutCount: Story = {
  args: { mode: 'drawer', showHead: false, resultCount: null },
  ...panel('22rem'),
};

/** Nothing selected: **Clear all** is not on screen, because there is nothing for it to clear. */
export const NoSelection: Story = { ...panel('16rem') };

/** The narrowest column the spec's content checklist asks about, with every facet type in it. */
export const Narrow: Story = {
  args: { facets: FACET_SETS['Every facet type, plus a long list'] },
  ...panel('20rem', { size: ['m'] }),
};

/**
 * Reduced motion. `scripts/screenshots.mjs` captures any story whose id ends in
 * `--reduced-motion` with Playwright's `reducedMotion: 'reduce'` emulation: the chevron turns,
 * the hover tints, the check mark's fade and the thumb's press scale all read
 * `--eldra-duration-*`, which `tokens.css` zeroes under `prefers-reduced-motion`, so every one of
 * them is instant and this renders identically to `Selected`.
 */
export const ReducedMotion: Story = {
  ...panel('16rem', { colour: ['brown', 'natural'], size: ['m'], price: [80, 160] }),
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in `--forced-colors`
 * with Playwright's `forcedColors: 'active'` emulation. Every boundary that carries meaning here
 * is a real border or an SVG stroke rather than a fill or a shadow — the swatch's edge and its
 * selected ring, the size tile's border and its dashed unavailable state, the diagonal strike over
 * an empty swatch — so each survives the system replacing the colours, and selection is still
 * three cues deep.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  args: { showApplied: true },
  ...panel('18rem', { colour: ['brown', 'navy'], size: ['m'], price: [80, 160] }),
};
