import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { IconArrowsSort, IconGift, IconTruck, IconWorld } from '@tabler/icons-vue';
import { nextTick, onMounted, ref } from 'vue';
import FieldWrapper from '../field-wrapper/FieldWrapper.vue';
import Select from './Select.vue';
import type { SelectOption } from './types';

/**
 * One story per state of the design spec's Select section, named after the state it shows.
 * `eldra-starter-spec/images/core/select.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * The stories render the **closed** control: the panel is opened by a real interaction, and a
 * screenshot taken while its 200ms entrance animation is still running would be a flaky baseline.
 * The open panel — its listbox roles, groups, filtering, empty state and keyboard — is covered by
 * `__tests__/select.spec.ts`, including `axe` on every open shape.
 *
 * The two exceptions are `InClippedCard` and `UnderStickyHeader`, whose whole subject is *where*
 * the panel renders: they open it on mount and rely on the screenshot harness's own 400ms settle,
 * exactly as the `SearchBar`'s panel stories do through its `autofocus` prop.
 */
const meta = {
  title: 'Forms/Select',
  component: Select,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
    messages: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'Choose one value from a list with a **custom** dropdown, never the platform’s native',
          'select UI. For several values use **MultiSelect**; for 2 to 5 options that fit on screen',
          'use **RadioGroup**.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `trigger`,',
          '`leadingIcon`, `value`, `placeholder`, `chevron`, `clearButton`, `panel`, `search`,',
          '`listbox`, `group`, `groupLabel`, `option`, `optionLabel`, `optionHint`, `optionMeta`,',
          '`optionSwatch`, `optionIcon`, `optionCheck`, `empty` and `native`.',
          '',
          '**Progressive enhancement.** A real `<select name>` stays in the form underneath —',
          '`hidden`, `aria-hidden="true"`, `tabindex="-1"`, with `<optgroup>`s mirroring `group` —',
          'and is kept in sync with every change, firing a bubbling native `change` so forms post',
          'the value and existing listeners keep working.',
          '',
          '**Not a dialog.** The panel is a non-modal popup (the spec’s non-negotiable 2),',
          'positioned with `useFloating` (`matchWidth`, flipping above when there is no room',
          'below) and closed by `useOverlay`. Focus is never trapped: `Tab` always moves on, and',
          'focus landing outside closes it. Opening one select closes any other that is open.',
          '',
          '**Teleported.** The panel is rendered through a `<Teleport>` to `document.body` — or to',
          'the open native `<dialog>` the control sits in, which is in the browser’s top layer —',
          'and positioned with floating-ui’s `fixed` strategy, so no ancestor’s `overflow: hidden`',
          'clips it and no stacking context between the control and the page root paints over it.',
          '`teleport` takes a CSS selector for a target of your own, or `false` for the old',
          'in-place rendering. See the README’s **Layering** section for what follows from the',
          'move: set `--eldra-*` overrides on `:root` rather than on a wrapper, and the panel is no',
          'longer in document order after its trigger.',
          '',
          '**Keyboard.** `ArrowDown`/`Enter`/`Space` open with the selected option active, `ArrowUp`',
          'opens on the last one (or the selected one when the list is searchable), the arrows move',
          'by one and `PageUp`/`PageDown` by ten, `Home`/`End` jump to the ends, `Enter` selects and',
          'closes, `Alt+ArrowUp` selects without moving, `Escape` clears the query before it closes,',
          '`Tab` closes without changing the value, and `Backspace`/`Delete` clear a clearable',
          'value. Without a search field, printable keys are type-ahead with a 0.6s buffer that',
          'ignores case and diacritics.',
          '',
          '**Searchable** turns on by itself past 10 options. Opening then moves focus into the',
          'search field (`role="combobox"`, `aria-autocomplete="list"`), which carries',
          '`aria-activedescendant`; without it, focus stays on the trigger and the trigger carries',
          'it. Filtering ignores case and diacritics, bolds and underlines the match, hides groups',
          'with no matches, and shows “No matches for “…”” as real text.',
          '',
          '**CSS variables**: `--eldra-select-panel-max-height` (default `20rem`),',
          '`--eldra-select-panel-max-width` (default `22rem`, clamped to `90vw`),',
          '`--eldra-z-popover` (default `30`), `--eldra-field-radius`, `--eldra-field-border-width`,',
          '`--eldra-select-group-tracking`, `--eldra-select-option-line`,',
          '`--eldra-select-swatch-edge`, the `--eldra-select-match-*` trio, and',
          '`--eldra-popover-origin` (which the panel sets itself from the placement it resolved',
          'to, so a flip does not replay the entrance animation: `top left` below the trigger,',
          '`bottom left` above it — the corner the entrance grows from).',
          '',
          '**Entrance**: the panel fades in and scales from 98% over `duration-base`, growing out',
          'of that corner. No slide (operator ruling — see the README’s Deviations); closing is',
          'instant, and under reduced motion the panel simply appears.',
          '',
          '**Forced colours.** The active row’s fill and the selected row’s weight both disappear',
          'there, so each gets a real boundary of its own: `eldra-select-option-active` draws a 2px',
          '`Highlight` inset outline and `eldra-select-option-selected` a 1px `CanvasText` one.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The spec's own "Topic" list: six plain options, so no search field. */
const TOPIC: SelectOption[] = [
  { value: 'order', label: "An order I've placed" },
  { value: 'returns', label: 'Returns and exchanges' },
  { value: 'care', label: 'Product care' },
  { value: 'wholesale', label: 'Wholesale and stockists' },
  { value: 'other', label: 'Something else' },
];

/** The spec's own country list: a "Most used" group first, then the full one. */
const COUNTRIES: SelectOption[] = [
  { value: 'is', label: 'Ísland', group: 'Most used' },
  { value: 'us', label: 'United States', group: 'Most used' },
  { value: 'gb', label: 'United Kingdom', group: 'Most used' },
  { value: 'de', label: 'Germany', group: 'All countries' },
  { value: 'dk', label: 'Denmark', group: 'All countries' },
  { value: 'fr', label: 'France', group: 'All countries' },
  { value: 'mx', label: 'Mexico', group: 'All countries' },
  { value: 'nl', label: 'Netherlands', group: 'All countries' },
  { value: 'no', label: 'Norway', group: 'All countries' },
  { value: 'se', label: 'Sweden', group: 'All countries' },
  { value: 'es', label: 'Spain', group: 'All countries' },
  { value: 'it', label: 'Italy', group: 'All countries' },
];

/** The spec's own glaze colours: swatches, stock notes and a sold-out option. */
const COLOURS: SelectOption[] = [
  { value: 'oat', label: 'Oat', swatch: '#e7ded1', meta: 'In stock' },
  {
    value: 'charcoal',
    label: 'Charcoal',
    swatch: '#2f2f2f',
    meta: 'Only 2 left',
    metaTone: 'warning',
  },
  { value: 'clay', label: 'Clay', swatch: '#8c3b2a', meta: 'In stock' },
  {
    value: 'moss',
    label: 'Moss',
    swatch: '#2f5d4f',
    meta: 'Sold out',
    metaTone: 'danger',
    disabled: true,
  },
];

/** Shipping speeds: an icon and a hint line under each label. */
const SHIPPING: SelectOption[] = [
  {
    value: 'standard',
    label: 'Standard',
    hint: '3 to 5 business days',
    meta: 'Free',
    icon: IconTruck,
  },
  {
    value: 'express',
    label: 'Express',
    hint: 'Next business day if ordered by 2pm',
    meta: '$12.00',
    icon: IconTruck,
  },
];

const WRAP: SelectOption[] = [
  { value: 'none', label: 'No gift wrap', icon: IconGift },
  { value: 'kraft', label: 'Recycled paper, twine', icon: IconGift },
];

const SORT: SelectOption[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'new', label: 'Newest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
];

/** The default: a short plain list inside a field wrapper, which is how a form uses it. */
export const Default: Story = {
  args: { options: TOPIC, name: 'topic' },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, value: ref('returns') }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Topic">
          <Select v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** The three sizes share `Input`'s box, so a select and a text field line up in a row. */
export const Sizes: Story = {
  args: { options: SORT },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({
      args,
      sm: ref('featured'),
      md: ref('featured'),
      lg: ref('featured'),
      shipping: SHIPPING,
      wrap: WRAP,
      shippingValue: ref('standard'),
      wrapValue: ref('kraft'),
    }),
    template: `
      <div class="flex max-w-96 flex-col gap-4">
        <FieldWrapper label="Sort by · sm">
          <Select v-bind="args" v-model="sm" size="sm" />
        </FieldWrapper>
        <FieldWrapper label="Shipping speed · md">
          <Select :options="shipping" v-model="shippingValue" size="md" />
        </FieldWrapper>
        <FieldWrapper label="Gift wrap · lg">
          <Select :options="wrap" v-model="wrapValue" size="lg" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** No sensible default, so the placeholder shows in `muted` — and is invalid on submit. */
export const WithPlaceholder: Story = {
  args: { options: TOPIC, placeholder: 'Choose a size', required: true },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, value: ref('') }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Size" required>
          <Select v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/**
 * Twelve countries, so the search field turns on by itself. Opening moves focus into it; typing
 * filters as you type, ignoring case and diacritics ("island" finds "Ísland").
 */
export const Searchable: Story = {
  args: { options: COUNTRIES, searchPlaceholder: 'Search countries', name: 'country' },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, value: ref('us') }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Country" help="Where we ship to">
          <Select v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** The 3 to 5 most likely answers in a first group, then the full list. */
export const Groups: Story = {
  args: { options: COUNTRIES, searchable: false },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, value: ref('is') }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Country">
          <Select v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Swatches, hints, stock notes and a sold-out option. The chosen swatch shows in the trigger. */
export const RichOptions: Story = {
  args: { options: COLOURS, searchable: false },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, colour: ref('oat'), shipping: SHIPPING, speed: ref('express') }),
    template: `
      <div class="flex max-w-96 flex-col gap-4">
        <FieldWrapper label="Colour">
          <Select v-bind="args" v-model="colour" />
        </FieldWrapper>
        <FieldWrapper label="Shipping speed">
          <Select :options="shipping" v-model="speed" :searchable="false" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** The clear button sits beside the chevron — a separate `<button>`, after the trigger in the tab
 * order. `Backspace` or `Delete` on the closed trigger clears too. */
export const Clearable: Story = {
  args: { options: COUNTRIES, clearable: true, leadingIcon: IconWorld },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, value: ref('is'), sort: SORT, sortValue: ref(''), IconArrowsSort }),
    template: `
      <div class="flex max-w-96 flex-col gap-4">
        <FieldWrapper label="Language" help="Backspace or the × clears it.">
          <Select v-bind="args" v-model="value" />
        </FieldWrapper>
        <FieldWrapper label="Sort by">
          <Select :options="sort" v-model="sortValue" clearable :leading-icon="IconArrowsSort" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** The error state: a 2px `danger` boundary, `aria-invalid="true"`, and the message below. */
export const Invalid: Story = {
  args: { options: TOPIC, placeholder: 'Choose a size' },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, value: ref('') }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Size" required error="Choose a size">
          <Select v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Disabled: `surface-strong`, a dashed boundary, not focusable, and no clear button. */
export const Disabled: Story = {
  args: { options: TOPIC, disabled: true },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, value: ref('care') }),
    template: `
      <div class="flex max-w-96 flex-col gap-4">
        <FieldWrapper label="Topic">
          <Select v-bind="args" v-model="value" clearable />
        </FieldWrapper>
        <FieldWrapper label="Size">
          <Select :options="[]" disabled placeholder="One size" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Read-only: the value is readable but fixed — `surface`, no chevron, and it never opens. */
export const ReadOnly: Story = {
  args: { options: TOPIC, readonly: true },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, value: ref('wholesale') }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Account type">
          <Select v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** `placement="above"` always opens upward — the spec's example is a footer's language selector. */
export const Above: Story = {
  args: { options: COUNTRIES, placement: 'above', leadingIcon: IconWorld },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, value: ref('is') }),
    template: `
      <div class="bg-surface flex min-h-64 max-w-96 items-end p-4">
        <FieldWrapper label="Language" class="w-full">
          <Select v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Past 10 options the list is searchable by default and the panel scrolls at 20rem. */
export const ManyOptions: Story = {
  args: {
    options: Array.from({ length: 40 }, (_, index) => ({
      value: `sku-${index}`,
      label: `Merino crew sweater — colourway ${index + 1}`,
    })),
  },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, value: ref('sku-0') }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Product">
          <Select v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Twice the example length: the trigger truncates with an ellipsis rather than growing. */
export const LongContent: Story = {
  args: {
    options: [
      {
        value: 'standard',
        label:
          'Standard shipping, tracked and insured for the full value of your order, delivered by our carbon-neutral courier network',
        hint: 'Delivered within 3 to 5 business days, with a signature required on arrival',
        meta: 'Free',
      },
      { value: 'express', label: 'Express', hint: 'Next business day', meta: '$12.00' },
    ] satisfies SelectOption[],
    searchable: false,
  },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, value: ref('standard') }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Shipping method" help="The whole method name is on the option row.">
          <Select v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** A 20rem container: the trigger truncates and the panel matches its width. */
export const Narrow: Story = {
  args: { options: COLOURS, searchable: false, clearable: true },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, colour: ref('charcoal'), countries: COUNTRIES, country: ref('us') }),
    template: `
      <div class="border-border flex w-80 flex-col gap-4 border p-4">
        <FieldWrapper label="Colour">
          <Select v-bind="args" v-model="colour" />
        </FieldWrapper>
        <FieldWrapper label="Country">
          <Select :options="countries" v-model="country" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/**
 * Reduced motion. `scripts/screenshots.mjs` captures any story whose id ends in
 * `--reduced-motion` with Playwright's `reducedMotion: 'reduce'` emulation: the popover's
 * entrance, the chevron's turn, the border-colour change and the focus ring are all instant,
 * because `--eldra-duration-*` is 0ms under that media query.
 */
export const ReducedMotion: Story = {
  args: { options: TOPIC },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, value: ref('care') }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Topic">
          <Select v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/**
 * Forced colours. Every boundary is a real border, so default, error, disabled and read-only stay
 * told apart, and the focus ring takes the system Highlight colour.
 */
export const ForcedColors: Story = {
  args: { options: TOPIC },
  parameters: { eldra: { forcedColors: true } },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => ({ args, plain: ref('care'), colours: COLOURS, colour: ref('oat') }),
    template: `
      <div class="flex max-w-96 flex-col gap-4">
        <FieldWrapper label="Topic">
          <Select v-bind="args" v-model="plain" clearable />
        </FieldWrapper>
        <FieldWrapper label="Size" required error="Choose a size">
          <Select :options="args.options" placeholder="Choose a size" />
        </FieldWrapper>
        <FieldWrapper label="Colour">
          <Select :options="colours" v-model="colour" :searchable="false" readonly />
        </FieldWrapper>
        <FieldWrapper label="Account type">
          <Select :options="args.options" model-value="care" disabled />
        </FieldWrapper>
      </div>
    `,
  }),
};

/**
 * Opens the panel the way a pointer does, for the two stories below.
 *
 * Every other story here renders the control **closed**, because a screenshot taken while the
 * 200ms entrance is still running would be a flaky baseline — the screenshot harness lets a story
 * settle for 400ms first, which is what makes an opened one safe (the `SearchBar`'s panel stories
 * rely on the same wait, through its `autofocus` prop). A `Select` has no such prop, and it should
 * not grow one just for Storybook: the panel is opened from a real press instead. `pointerdown`
 * then `click()` is exactly the pair `usePopover`'s latch reads as "a pointer opened this" — a bare
 * `click()` would carry `detail: 0`, which is the label-forwarded click that focuses without
 * opening.
 */
function openOnMount(): void {
  onMounted(() => {
    void nextTick(() => {
      const trigger = document.querySelector<HTMLElement>('[data-part="trigger"]');
      trigger?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      trigger?.click();
    });
  });
}

/**
 * The panel escapes an ancestor that clips its overflow.
 *
 * A card with `overflow-hidden` — a rounded product card, a table cell, a carousel track — used to
 * cut the popover off at its edge, because the panel was a descendant of it. It is teleported to
 * `body` now, so the card clips its own content and nothing else. The card is deliberately shorter
 * than the panel, so a clipped panel would be unmistakable in the baseline.
 */
export const InClippedCard: Story = {
  args: { options: COLOURS, searchable: false, clearable: true },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => {
      openOnMount();
      return { args, value: ref('charcoal') };
    },
    template: `
      <div class="bg-surface p-4">
        <div class="border-border bg-background h-28 w-80 overflow-hidden rounded-lg border p-4">
          <FieldWrapper label="Colour">
            <Select v-bind="args" v-model="value" />
          </FieldWrapper>
        </div>
      </div>
    `,
  }),
};

/**
 * The panel renders over a sticky header.
 *
 * `z-sticky` is 20 and `z-popover` is 30, but a `z-index` only settles the order **within one
 * stacking context** — and a sticky header with a `z-index` of its own starts one, so a panel
 * nested below it in the page used to lose to it regardless of the numbers. On `body` both are
 * children of the root stacking context, where the two tokens mean what they say.
 *
 * The select opens `above`, which is what puts the panel over the header rather than beside it;
 * the header's title is drawn behind it, and the scroll container it all sits in would have
 * clipped the panel too.
 */
export const UnderStickyHeader: Story = {
  args: { options: SHIPPING, searchable: false, placement: 'above' },
  render: (args) => ({
    components: { Select, FieldWrapper },
    setup: () => {
      openOnMount();
      return { args, value: ref('express') };
    },
    template: `
      <div class="bg-surface relative h-80 overflow-y-auto">
        <header
          class="bg-background border-border z-sticky sticky top-0 border-b px-4 py-3 shadow-sm"
        >
          <p class="text-body-sm font-semibold">Stoneware &amp; Co. — checkout</p>
        </header>
        <div class="space-y-4 p-4 pt-24">
          <div class="max-w-80">
            <FieldWrapper label="Shipping method">
              <Select v-bind="args" v-model="value" />
            </FieldWrapper>
          </div>
        </div>
      </div>
    `,
  }),
};
