import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { IconAdjustmentsHorizontal, IconWorld } from '@tabler/icons-vue';
import { ref } from 'vue';
import FieldWrapper from '../field-wrapper/FieldWrapper.vue';
import MultiSelect from './MultiSelect.vue';
import type { SelectOption } from './types';

/**
 * One story per state of the design spec's Multi-select section, named after the state it shows.
 * `eldra-starter-spec/images/core/multi-select.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * Like `Select`, the stories here render the **closed** control: the panel is opened by a real
 * interaction, and a screenshot taken while its 200ms entrance animation is still running would be
 * a flaky baseline. The open panel — the checkbox rows, the footer, filtering, the empty state and
 * the whole keyboard — is covered by `__tests__/multiselect.spec.ts`, `axe` included. (`Select`'s
 * own `InClippedCard` and `UnderStickyHeader` stories do show an open panel, because what they are
 * about is where it renders; both wait out the entrance before the shutter falls.)
 */
const meta = {
  title: 'Forms/MultiSelect',
  component: MultiSelect,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
    messages: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'Choose any number of values from a **custom** dropdown with a checkbox per option, a',
          'live count and removable tags under the control. It shares every measure, state and key',
          'of **Select**; only the differences are listed here.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): every part of `Select` —',
          '`root`, `trigger`, `leadingIcon`, `placeholder`, `chevron`, `clearButton`, `panel`,',
          '`search`, `listbox`, `group`, `groupLabel`, `option`, `optionLabel`, `optionHint`,',
          '`optionMeta`, `optionSwatch`, `optionIcon`, `optionCheck`, `empty`, `native` — plus',
          '`summary`, `summaryMore`, `tags`, `tag`, `tagRemove`, `footer`, `footerCount`,',
          '`footerClear` and `footerDone`. `optionCheck` is the option’s **checkbox** here: it is',
          'the mark that says a row is chosen in both controls.',
          '',
          '**Live changes, no Apply.** Every toggle updates the value, writes the hidden',
          '`<select multiple>`, fires `change` and updates the footer’s `aria-live` count. Done only',
          'closes; the footer’s Clear empties the selection and keeps the popover open. A',
          'surrounding drawer or form owns committing.',
          '',
          '**Keyboard.** As `Select`, except that `Enter` (and `Space` without a search field)',
          '*toggles* and leaves the popover open, `Alt+ArrowUp` toggles and closes, `Tab` walks from',
          'the search field to the footer’s Clear and Done with the popover still open,',
          '`Backspace` in an empty search field takes the last tag off, and `Backspace`/`Delete` on',
          'the closed trigger clear everything.',
          '',
          '**Teleported.** The panel — footer included — is rendered through a `<Teleport>` to',
          '`document.body`, or to the modal native `<dialog>` the control sits in, so nothing above',
          'the control can clip it or paint over it. The `Tab` line above still holds: sequential',
          'focus follows the DOM, and the panel has left it, so `usePopover`’s `tabRedirect` puts',
          'the two boundary steps back — `Tab` from the trigger moves into the footer, `Shift+Tab`',
          'on the footer’s Clear moves back to the trigger. `Tab` on Done is left to the browser,',
          'which is the way out, so this is a redirect rather than a focus trap. A searchable',
          'multi-select needs none of it: opening puts focus in the search field, from which the',
          'footer is already the browser’s next stop. See the README’s **Layering** section.',
          '',
          'One thing the walk does change: while the popover is open the trigger’s own clear',
          'button is not a `Tab` stop (the walk steps from the trigger into the panel, and the',
          'footer’s Clear does the same job). It is back in the order as soon as the popover',
          'closes.',
          '',
          '**Progressive enhancement.** A real `<select multiple name>` stays in the form',
          'underneath — `hidden`, `aria-hidden="true"`, `tabindex="-1"`, with `<optgroup>`s',
          'mirroring `group` — in sync both ways, firing a bubbling native `change`.',
          '',
          '**CSS variables**: everything `Select` reads, plus `--eldra-select-pill-line` (the “+N”',
          'pill’s line box) and `--eldra-checkbox-radius`/`--eldra-checkbox-border-width`, which the',
          'option’s box shares with `Checkbox` so a consumer restyles both at once.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof MultiSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The spec's own category list: two groups and facet counts in `meta`. */
const CATEGORIES: SelectOption[] = [
  { value: 'sweaters', label: 'Sweaters', group: 'Knitwear', meta: '18' },
  { value: 'cardigans', label: 'Cardigans', group: 'Knitwear', meta: '12' },
  { value: 'scarves', label: 'Scarves & wraps', group: 'Knitwear', meta: '9' },
  { value: 'hats', label: 'Hats', group: 'Knitwear', meta: '6' },
  { value: 'mugs', label: 'Mugs & cups', group: 'Tableware', meta: '24' },
  { value: 'bowls', label: 'Bowls', group: 'Tableware', meta: '11' },
  { value: 'plates', label: 'Plates', group: 'Tableware', meta: '8' },
];

/** The spec's own colour filter: swatches, and one sold-out colour. */
const COLOURS: SelectOption[] = [
  { value: 'oat', label: 'Oat', swatch: '#e7ded1', meta: '12' },
  { value: 'charcoal', label: 'Charcoal', swatch: '#2f2f2f', meta: '8' },
  { value: 'clay', label: 'Clay', swatch: '#8c3b2a', meta: '5' },
  {
    value: 'moss',
    label: 'Moss',
    swatch: '#2f5d4f',
    meta: 'Sold out',
    metaTone: 'danger',
    disabled: true,
  },
];

/** Sizes, for the tag row: short labels, several of them. */
const SIZES: SelectOption[] = [
  { value: 'xs', label: 'XS' },
  { value: 's', label: 'S' },
  { value: 'm', label: 'M' },
  { value: 'l', label: 'L' },
  { value: 'xl', label: 'XL' },
];

/** Materials, past the spec's ten-option threshold, so the search field turns itself on. */
const MATERIALS: SelectOption[] = [
  'Merino wool',
  'Lambswool',
  'Alpaca',
  'Cashmere',
  'Organic cotton',
  'Linen',
  'Hemp',
  'Stoneware',
  'Porcelain',
  'Terracotta',
  'Oak',
  'Walnut',
].map((label) => ({ value: label.toLowerCase().replaceAll(' ', '-'), label }));

/** The default: a grouped list inside a field wrapper, with tags under the control. */
export const Default: Story = {
  args: { options: CATEGORIES, name: 'categories' },
  render: (args) => ({
    components: { MultiSelect, FieldWrapper },
    setup: () => ({ args, value: ref(['sweaters', 'cardigans']) }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Categories">
          <MultiSelect v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Four selected: the trigger lists two labels and a "+2" pill, and every value gets a tag. */
export const WithTags: Story = {
  args: { options: SIZES, name: 'sizes' },
  render: (args) => ({
    components: { MultiSelect, FieldWrapper },
    setup: () => ({ args, value: ref(['xs', 's', 'm', 'l']) }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Sizes" help="Remove a size with the × on its tag.">
          <MultiSelect v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** `showTags: false` for a compact toolbar, where the trigger summary is enough. The sm size is
 *  the spec's own example of a dense desktop filter bar. */
export const NoTags: Story = {
  args: { options: COLOURS, showTags: false, searchable: false },
  render: (args) => ({
    components: { MultiSelect, FieldWrapper },
    setup: () => ({
      args,
      colour: ref(['oat', 'clay']),
      availability: ref([]),
      sizes: SIZES,
      size: ref(['m']),
      IconAdjustmentsHorizontal,
    }),
    template: `
      <div class="border-border flex max-w-[44rem] flex-wrap items-end gap-3 border p-4">
        <FieldWrapper label="Colour" class="w-56">
          <MultiSelect v-bind="args" v-model="colour" size="sm" />
        </FieldWrapper>
        <FieldWrapper label="Size" class="w-40">
          <MultiSelect :options="sizes" v-model="size" size="sm" :show-tags="false" />
        </FieldWrapper>
        <FieldWrapper label="Availability" class="w-48">
          <MultiSelect
            :options="[{ value: 'in', label: 'In stock' }, { value: 'pre', label: 'Pre-order' }]"
            v-model="availability"
            size="sm"
            :show-tags="false"
            :leading-icon="IconAdjustmentsHorizontal"
          />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Twelve materials, so the search field turns on by itself. Filtering ignores case and
 *  diacritics, bolds and underlines the match, and hides groups with nothing in them. */
export const Searchable: Story = {
  args: { options: MATERIALS, searchPlaceholder: 'Search materials', name: 'materials' },
  render: (args) => ({
    components: { MultiSelect, FieldWrapper },
    setup: () => ({ args, value: ref(['merino-wool', 'linen', 'oak']) }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Materials" help="Type to narrow the list.">
          <MultiSelect v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Groups with facet counts, and swatches on a colour filter. */
export const Groups: Story = {
  args: { options: CATEGORIES, searchable: false },
  render: (args) => ({
    components: { MultiSelect, FieldWrapper },
    setup: () => ({
      args,
      value: ref(['scarves', 'mugs', 'plates']),
      colours: COLOURS,
      colour: ref(['charcoal']),
    }),
    template: `
      <div class="flex max-w-96 flex-col gap-4">
        <FieldWrapper label="Categories">
          <MultiSelect v-bind="args" v-model="value" />
        </FieldWrapper>
        <FieldWrapper label="Colour">
          <MultiSelect :options="colours" v-model="colour" :searchable="false" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** The error state: a 2px `danger` boundary, `aria-invalid="true"`, and the message below. */
export const Invalid: Story = {
  args: {
    options: [
      { value: 'email', label: 'Email' },
      { value: 'sms', label: 'SMS' },
      { value: 'post', label: 'Post' },
    ],
    required: true,
  },
  render: (args) => ({
    components: { MultiSelect, FieldWrapper },
    setup: () => ({ args, value: ref([]) }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Channels" required error="Choose at least one channel">
          <MultiSelect v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Disabled: `surface-strong`, a dashed boundary, not focusable, no clear button. Read-only keeps
 *  the value readable and drops the chevron. */
export const Disabled: Story = {
  args: { options: CATEGORIES, disabled: true },
  render: (args) => ({
    components: { MultiSelect, FieldWrapper },
    setup: () => ({ args, value: ref(['sweaters', 'mugs']), sizes: SIZES, fixed: ref(['m', 'l']) }),
    template: `
      <div class="flex max-w-96 flex-col gap-4">
        <FieldWrapper label="Categories">
          <MultiSelect v-bind="args" v-model="value" />
        </FieldWrapper>
        <FieldWrapper label="Sizes">
          <MultiSelect :options="sizes" v-model="fixed" readonly />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Twice the example length: the summary truncates with an ellipsis, the tags wrap, and the whole
 *  label is still on the option row. */
export const LongContent: Story = {
  args: {
    options: [
      {
        value: 'knitwear',
        label: 'Hand-knitted merino crew sweaters, cardigans and everything else in knitwear',
        hint: 'Includes the winter collection and everything carried over from last season',
        meta: '128',
      },
      {
        value: 'tableware',
        label: 'Wheel-thrown stoneware tableware, glazed and fired in small batches',
        hint: 'Mugs, cups, bowls, plates and serving dishes',
        meta: '64',
      },
    ] satisfies SelectOption[],
    searchable: false,
  },
  render: (args) => ({
    components: { MultiSelect, FieldWrapper },
    setup: () => ({ args, value: ref(['knitwear', 'tableware']) }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Collections" help="The whole name is on the option row.">
          <MultiSelect v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** A 20rem container: the summary truncates, the "+N" pill keeps its size, and the tags wrap. */
export const Narrow: Story = {
  args: { options: CATEGORIES, searchable: false },
  render: (args) => ({
    components: { MultiSelect, FieldWrapper },
    setup: () => ({
      args,
      value: ref(['sweaters', 'cardigans', 'scarves', 'mugs']),
      materials: MATERIALS,
      material: ref(['merino-wool']),
      IconWorld,
    }),
    template: `
      <div class="border-border flex w-80 flex-col gap-4 border p-4">
        <FieldWrapper label="Categories">
          <MultiSelect v-bind="args" v-model="value" />
        </FieldWrapper>
        <FieldWrapper label="Materials">
          <MultiSelect :options="materials" v-model="material" :leading-icon="IconWorld" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/**
 * Forced colours. Every boundary is a real border, so default, error, disabled and read-only stay
 * told apart; the option rows take the package's `eldra-select-option-active`/`-selected`
 * outlines, and the focus ring takes the system Highlight colour.
 */
export const ForcedColors: Story = {
  args: { options: CATEGORIES },
  parameters: { eldra: { forcedColors: true } },
  render: (args) => ({
    components: { MultiSelect, FieldWrapper },
    setup: () => ({
      args,
      chosen: ref(['sweaters', 'cardigans', 'mugs']),
      sizes: SIZES,
      size: ref(['m']),
    }),
    template: `
      <div class="flex max-w-96 flex-col gap-4">
        <FieldWrapper label="Categories">
          <MultiSelect v-bind="args" v-model="chosen" />
        </FieldWrapper>
        <FieldWrapper label="Channels" required error="Choose at least one channel">
          <MultiSelect :options="args.options" :model-value="[]" />
        </FieldWrapper>
        <FieldWrapper label="Sizes">
          <MultiSelect :options="sizes" v-model="size" readonly />
        </FieldWrapper>
        <FieldWrapper label="Collections">
          <MultiSelect :options="args.options" :model-value="['sweaters']" disabled />
        </FieldWrapper>
      </div>
    `,
  }),
};
