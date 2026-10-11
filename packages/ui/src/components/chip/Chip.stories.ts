import { IconTag } from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Chip from './Chip.vue';
import ChipGroup from './ChipGroup.vue';

/**
 * `Chip` and `ChipGroup` are an operator addition (2026-09-25), not a design spec 1 section — see
 * `README.md`'s Additions list for the reason (the private component library's `FilterChip`, which
 * a consumer migrating onto this package needs an equivalent of). There is no
 * `eldra-starter-spec/images/core/chip.png` review target for the same reason; these stories are
 * reviewed against the spec sections the visual language is derived from instead — Badge's pill
 * shape and Multi-select's removable tag row — both named in `types.ts`.
 */
const PORTRAIT = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect width="200" height="200" fill="#d7c9b8"/>
    <circle cx="100" cy="82" r="40" fill="#8a6a52"/>
    <path d="M38 200c0 -54 28 -88 62 -88s62 34 62 88z" fill="#5b3f2b"/>
  </svg>`
)}`;

const meta = {
  title: 'Forms/Chip',
  component: Chip,
  tags: ['autodocs'],
  args: { label: 'Knitwear' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    removable: { control: 'boolean' },
    selectable: { control: 'boolean' },
    selected: { control: 'boolean' },
    disabled: { control: 'boolean' },
    icon: { table: { disable: true } },
    avatar: { table: { disable: true } },
    value: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A removable tag or a selectable filter chip — never both at once on the same element',
          "(see `Chip.vue`'s own comment: a removable body is never also the selection toggle,",
          'because that would nest a `<button>` inside a `<button>`). Plain by default (a `<span>`',
          'with no role), a real `<button type="button" aria-pressed>` when `selectable`, and',
          '`removable` adds a separate `<button>` named `"Remove <label>"`.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `icon`, `avatar`,',
          '`label`, `removeButton`.',
          '',
          '**Slots**: `default` (the label, overrides `label`), `icon`, `avatar`.',
          '',
          '**Keyboard**: `Enter`/`Space` toggle a selectable chip through native `<button>`',
          'behaviour — the component adds no keydown handler of its own for them, so they never',
          "double-toggle. `Backspace`/`Delete` on a focused removable chip's root, or on its remove",
          'button, emits `remove`.',
          '',
          '**`ChipGroup`** (`modelValue: string[]`, `ariaLabel`, `disabled`) renders `role="group"` with',
          'that `aria-label` and provides context a member `Chip` with both `selectable` and a',
          '`value` reads: its `selected` prop is ignored in favour of whether `value` is in',
          "`modelValue`, and a click toggles the group's `modelValue` instead of the chip's own",
          '`selected`. It does not render its children — put `<Chip>`s in its default slot, the',
          'same shape `ButtonGroup` uses.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A plain, static chip: a `<span>`, no role, no interaction. */
export const Default: Story = { args: { label: 'Knitwear' } };

/** A removable tag. `Backspace`/`Delete` on the focused root or the remove button removes it too. */
export const Removable: Story = { args: { label: 'Sweaters', removable: true } };

/** A selectable filter chip: a real `<button aria-pressed>`, filled `primary` when selected. */
export const Selectable: Story = {
  render: () => ({
    components: { Chip },
    template: `
      <div class="flex flex-wrap gap-2">
        <Chip label="Cotton" selectable />
        <Chip label="Merino wool" selectable :selected="true" />
      </div>
    `,
  }),
};

/** A `ChipGroup` of selectable chips, `modelValue` driving which are selected. */
export const Group: Story = {
  render: () => ({
    components: { Chip, ChipGroup },
    data: () => ({ materials: ['wool'] }),
    template: `
      <ChipGroup v-model="materials" ariaLabel="Materials">
        <Chip value="wool" label="Merino wool" selectable />
        <Chip value="cotton" label="Cotton" selectable />
        <Chip value="linen" label="Washed linen" selectable />
      </ChipGroup>
    `,
  }),
};

/** A decorative leading icon, and a leading avatar drawn at the chip's own icon size. */
export const WithIcon: Story = {
  render: () => ({
    components: { Chip },
    setup: () => ({ IconTag, PORTRAIT }),
    template: `
      <div class="flex flex-wrap items-center gap-2">
        <Chip label="Organic cotton" :icon="IconTag" />
        <Chip label="Ingrid Solberg" :avatar="PORTRAIT" removable />
      </div>
    `,
  }),
};

/**
 * M13's own fix: `Avatar`'s initials/icon fallbacks are drawn for its own `sm` size (a 2rem
 * circle), not for a chip's much smaller leading slot — without scaling them down too, a failed
 * image nearly fills a `sm` chip's 0.875rem box with the user icon, or overflows it with initials.
 * `Chip` passes its own `label` as the internal `Avatar`'s `name`, so a broken (or absent) image
 * falls back to initials of the label — shown at both chip sizes here.
 */
export const WithAvatarFallback: Story = {
  render: () => ({
    components: { Chip },
    template: `
      <div class="flex flex-wrap items-center gap-2">
        <Chip label="Ingrid Solberg" size="sm" avatar="/broken-image-url.jpg" />
        <Chip label="Ingrid Solberg" size="md" avatar="/broken-image-url.jpg" />
      </div>
    `,
  }),
};

/** `sm` (the exact `MultiSelect` tag row recipe) and `md`, this component's own larger size. */
export const Sizes: Story = {
  render: () => ({
    components: { Chip },
    template: `
      <div class="flex flex-wrap items-center gap-2">
        <Chip label="Sweaters" size="sm" removable />
        <Chip label="Sweaters" size="md" removable />
      </div>
    `,
  }),
};

/** Muted, `cursor-not-allowed`, no press or hover feedback, whether selected or not. */
export const Disabled: Story = {
  render: () => ({
    components: { Chip },
    template: `
      <div class="flex flex-wrap items-center gap-2">
        <Chip label="Sold out" selectable disabled />
        <Chip label="Sold out" selectable :selected="true" disabled />
        <Chip label="Sweaters" removable disabled />
      </div>
    `,
  }),
};

/** The label never wraps — it truncates instead, inside the chip's own `max-w-full`. */
export const LongContent: Story = {
  args: {
    label: 'Hand-glazed stoneware bowl set, made to order in small batches over six weeks',
    removable: true,
  },
};

/** A 20rem container. Chips wrap onto their own line, and a long label truncates rather than
 *  overflowing it. */
export const Narrow: Story = {
  render: () => ({
    components: { Chip, ChipGroup },
    data: () => ({ materials: ['wool'] }),
    template: `
      <div class="w-80 border border-border p-4 flex flex-col gap-3">
        <ChipGroup v-model="materials" ariaLabel="Materials">
          <Chip value="wool" label="Merino wool" selectable />
          <Chip value="cotton" label="Cotton" selectable />
          <Chip value="linen" label="Washed linen" selectable />
        </ChipGroup>
        <Chip
          label="Hand-glazed stoneware bowl set, made to order in small batches over six weeks"
          removable
        />
      </div>
    `,
  }),
};

/**
 * Forced colours. The selected fill is still `primary`/`primary-contrast` (both remapped by the
 * system palette), and the remove button keeps its own focus ring and hit target — nothing here
 * relies on a background hue alone to say "selected" versus "not".
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Chip },
    template: `
      <div class="flex flex-wrap items-center gap-2">
        <Chip label="Cotton" selectable />
        <Chip label="Merino wool" selectable :selected="true" />
        <Chip label="Sweaters" removable />
      </div>
    `,
  }),
};
