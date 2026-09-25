import { IconDiscount, IconMail, IconSearch } from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import Input from './Input.vue';

/**
 * One story per state of the design spec's Input section, named after the state it shows.
 * `eldra-starter-spec/images/core/input.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Forms/Input',
  component: Input,
  tags: ['autodocs'],
  args: { size: 'md', type: 'text' },
  argTypes: {
    type: {
      control: 'inline-radio',
      options: ['text', 'email', 'tel', 'number', 'search', 'url', 'password'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    leadingIcon: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'Single-line text entry for names, emails, numbers, codes and search. It always sits in',
          'a `FieldWrapper` so it has a visible label — a placeholder is an example, never the',
          'label. For multi-line text use `Textarea`; for quantities use `QuantityStepper`.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `leadingIcon`,',
          '`control`, `clearButton`, `suffix`. `suffix` is the whole end-edge area: the clear',
          'button and the `suffix` slot share it, so a field with both keeps them on one row in',
          'reading — and tab — order.',
          '',
          '**Slots**: `leadingIcon` (overrides the `leadingIcon` prop) and `suffix`.',
          '',
          '**Field wrapper**: an Input inside a `FieldWrapper` takes its `id`, `aria-describedby`,',
          'invalid and required state from it through `FIELD_KEY`, so a bare `<Input />` needs no',
          'wiring. Any explicit prop wins over the wrapper.',
          '',
          "**Focus**: the ring is drawn on the `<input>` itself, which the spec's anatomy calls",
          '"the field box", and it uses `eldra-focus-always` — a text field shows the ring on any',
          'focus, pointer included, because a caret alone is easy to miss.',
          '',
          '**Error**: `invalid` sets `aria-invalid="true"`, colours the 1px boundary `danger` and',
          'draws a second 1px line just inside it, so the boundary reads as 2px without the value',
          'shifting by a pixel between the valid and invalid states. The message itself belongs to',
          'the `FieldWrapper`; colour is never the only signal.',
          '',
          '**Masks**: `mask` takes a format such as `(###) ###-####` or `A#A #A#` (`#` a digit,',
          '`A` a letter, `*` either, everything else a separator). The field shows the formatted',
          'text and `v-model` stays the raw value, so what you submit is what you store.',
          '`applyMask` and `stripMask` are exported for the same job outside a component.',
          '',
          '**CSS variables**: `--eldra-input-radius` (default `var(--eldra-radius-md)`),',
          '`--eldra-control-font-size` (default `0.9375rem`, the one control size with no type',
          'token of its own), `--eldra-control-font-size-mobile` (default `1rem`),',
          '`--eldra-control-line-height` (default `1.5rem`) and `--eldra-field-border-width`',
          '(default `1px`).',
          '',
          "**Messages**: `clear` — the clear button's accessible name. Name it for the field",
          '("Clear search") with `provideEldraUiMessages`.',
          '',
          '**Viewport, not container**: md text grows to 1rem below a 48rem *viewport*',
          '(`max-md:`), so iOS never zooms into a focused field. That is a viewport rule in the',
          'spec, unlike the Button touch target, which measures the block.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A label, because the spec's Input never appears without one. `FieldWrapper` lands in Task 7. */
const LABEL_CLASS = 'text-label text-text mb-1 block';

/** The default md field with a value, as the reference image's first row shows it. */
export const Default: Story = {
  render: () => ({
    components: { Input },
    setup: () => ({ value: ref('Maren Holt') }),
    template: `
      <div class="max-w-80">
        <label for="story-name" class="${LABEL_CLASS}">Full name</label>
        <Input id="story-name" v-model="value" autocomplete="name" />
      </div>
    `,
  }),
};

/** The three compact-control heights: 2rem, 2.5rem and 3rem. */
export const Sizes: Story = {
  render: () => ({
    components: { Input },
    setup: () => ({ IconSearch }),
    template: `
      <div class="flex max-w-80 flex-col gap-4">
        <div>
          <label for="story-sm" class="${LABEL_CLASS}">sm — dense filter bars</label>
          <Input id="story-sm" size="sm" placeholder="Min $" />
        </div>
        <div>
          <label for="story-md" class="${LABEL_CLASS}">md — every form</label>
          <Input id="story-md" size="md" placeholder="Apartment, suite, unit" />
        </div>
        <div>
          <label for="story-lg" class="${LABEL_CLASS}">lg — hero newsletter</label>
          <Input id="story-lg" size="lg" type="email" placeholder="you@example.com" />
        </div>
      </div>
    `,
  }),
};

/** A decorative icon before the value; the label still names the field. */
export const WithLeadingIcon: Story = {
  render: () => ({
    components: { Input },
    setup: () => ({ IconDiscount, IconMail, value: ref('WINTER15') }),
    template: `
      <div class="flex max-w-80 flex-col gap-4">
        <div>
          <label for="story-promo" class="${LABEL_CLASS}">Promo code</label>
          <Input id="story-promo" v-model="value" :leading-icon="IconDiscount" />
        </div>
        <div>
          <label for="story-email-icon" class="${LABEL_CLASS}">Email address</label>
          <Input
            id="story-email-icon"
            type="email"
            autocomplete="email"
            placeholder="you@example.com"
            :leading-icon="IconMail"
          />
        </div>
      </div>
    `,
  }),
};

/** `type="search"`: a leading search icon, and the browser's own clear button hidden. */
export const Search: Story = {
  render: () => ({
    components: { Input },
    setup: () => ({ IconSearch, value: ref('') }),
    template: `
      <div class="max-w-80">
        <label for="story-search" class="${LABEL_CLASS}">Search the shop</label>
        <Input id="story-search" v-model="value" type="search" placeholder="Search the shop"
          :leading-icon="IconSearch" />
      </div>
    `,
  }),
};

/** The clear button shows only while there is a value, and returns focus to the input. */
export const Clearable: Story = {
  render: () => ({
    components: { Input },
    setup: () => ({ IconSearch, value: ref('merino scarf') }),
    template: `
      <div class="max-w-80">
        <label for="story-clearable" class="${LABEL_CLASS}">Search the shop</label>
        <Input id="story-clearable" v-model="value" type="search" :leading-icon="IconSearch" />
      </div>
    `,
  }),
};

/** The error state: a 2px `danger` boundary, `aria-invalid`, and a message that says what to do. */
export const Invalid: Story = {
  render: () => ({
    components: { Input },
    setup: () => ({ value: ref('BS1 4X') }),
    template: `
      <div class="max-w-80">
        <label for="story-postcode" class="${LABEL_CLASS}">Postcode</label>
        <Input
          id="story-postcode"
          v-model="value"
          invalid
          autocomplete="postal-code"
          described-by="story-postcode-error"
        />
        <p id="story-postcode-error" class="text-body-sm text-danger mt-1 flex items-center gap-1">
          <svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          Enter a full UK postcode, like BS1 4XE.
        </p>
      </div>
    `,
  }),
};

/** Disabled: `surface-strong`, a dashed decorative border, and skipped by `Tab`. */
export const Disabled: Story = {
  render: () => ({
    components: { Input },
    setup: () => ({ value: ref('United Kingdom') }),
    template: `
      <div class="max-w-80">
        <label for="story-disabled" class="${LABEL_CLASS}">Country</label>
        <Input id="story-disabled" v-model="value" disabled />
      </div>
    `,
  }),
};

/** Read-only: still focusable and selectable, which is why it is never a disabled field. */
export const ReadOnly: Story = {
  render: () => ({
    components: { Input },
    setup: () => ({ value: ref('NW-10482') }),
    template: `
      <div class="max-w-80">
        <label for="story-readonly" class="${LABEL_CLASS}">Order number</label>
        <Input id="story-readonly" v-model="value" readonly />
        <p class="text-body-sm text-muted mt-1">Read-only: copied from your confirmation email.</p>
      </div>
    `,
  }),
};

/** `mask` formats as you type; `v-model` stays the raw value underneath. */
export const Masked: Story = {
  render: () => ({
    components: { Input },
    setup: () => ({ phone: ref('5551234567'), postcode: ref('M1A1A1') }),
    template: `
      <div class="flex max-w-80 flex-col gap-4">
        <div>
          <label for="story-phone" class="${LABEL_CLASS}">Phone number</label>
          <Input id="story-phone" v-model="phone" type="tel" autocomplete="tel"
            mask="(###) ###-####" />
          <p class="text-body-sm text-muted mt-1">Raw value: {{ phone }}</p>
        </div>
        <div>
          <label for="story-postcode-mask" class="${LABEL_CLASS}">Postcode</label>
          <Input id="story-postcode-mask" v-model="postcode" autocomplete="postal-code"
            mask="A#A #A#" />
          <p class="text-body-sm text-muted mt-1">Raw value: {{ postcode }}</p>
        </div>
      </div>
    `,
  }),
};

/** `type="number"`: `inputmode="numeric"`, `min`/`max`/`step` and tabular numerals. */
export const Number: Story = {
  render: () => ({
    components: { Input },
    setup: () => ({ value: ref('75') }),
    template: `
      <div class="max-w-80">
        <label for="story-number" class="${LABEL_CLASS}">Gift card amount ($)</label>
        <Input id="story-number" v-model="value" type="number" :min="25" :max="500" :step="25" />
      </div>
    `,
  }),
};

/** `type="password"`, with the browser's own reveal control left alone. */
export const Password: Story = {
  render: () => ({
    components: { Input },
    setup: () => ({ value: ref('northwind-goods') }),
    template: `
      <div class="max-w-80">
        <label for="story-password" class="${LABEL_CLASS}">Password</label>
        <Input id="story-password" v-model="value" type="password"
          autocomplete="current-password" />
      </div>
    `,
  }),
};

/** Twice the example length: the value scrolls inside the box rather than stretching it. */
export const LongContent: Story = {
  render: () => ({
    components: { Input },
    setup: () => ({
      IconMail,
      value: ref(
        'maren.holt-jonsdottir+northwind-goods-newsletter@an-unusually-long-domain.example.com'
      ),
    }),
    template: `
      <div class="max-w-80">
        <label for="story-long" class="${LABEL_CLASS}">Email address for your order confirmation and dispatch notices</label>
        <Input id="story-long" v-model="value" type="email" autocomplete="email"
          :leading-icon="IconMail" />
      </div>
    `,
  }),
};

/** A 20rem container: the field fills its column, with no horizontal scroll. */
export const Narrow: Story = {
  render: () => ({
    components: { Input },
    setup: () => ({ IconSearch, value: ref('merino scarf') }),
    template: `
      <div class="border-border w-80 border p-4">
        <label for="story-narrow" class="${LABEL_CLASS}">Search the shop</label>
        <Input id="story-narrow" v-model="value" type="search" :leading-icon="IconSearch" />
      </div>
    `,
  }),
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in `--forced-colors`
 * with Playwright's `forcedColors: 'active'` emulation: the borders stay real borders, and the
 * error boundary falls back to `CanvasText` because `danger` is not rendered.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Input },
    setup: () => ({ IconSearch, search: ref('merino scarf'), postcode: ref('BS1 4X') }),
    template: `
      <div class="flex max-w-80 flex-col gap-4">
        <div>
          <label for="story-fc-search" class="${LABEL_CLASS}">Search the shop</label>
          <Input id="story-fc-search" v-model="search" type="search" :leading-icon="IconSearch" />
        </div>
        <div>
          <label for="story-fc-postcode" class="${LABEL_CLASS}">Postcode</label>
          <Input id="story-fc-postcode" v-model="postcode" invalid />
        </div>
        <div>
          <label for="story-fc-disabled" class="${LABEL_CLASS}">Country</label>
          <Input id="story-fc-disabled" model-value="United Kingdom" disabled />
        </div>
      </div>
    `,
  }),
};
