import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import Input from '../input/Input.vue';
import Textarea from '../textarea/Textarea.vue';
import FieldWrapper from './FieldWrapper.vue';

/**
 * One story per state of the design spec's Field wrapper section, named after the state it shows.
 * `eldra-starter-spec/images/core/field.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Forms/FieldWrapper',
  component: FieldWrapper,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'The wrapper every form control sits in. It owns the visible label, the required or',
          'optional mark, the help text, the error text with its icon and the character counter —',
          'and it owns the wiring, so a bare `<Input />` inside it needs no `id`, no',
          '`aria-describedby` and no `required` of its own.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `label`,',
          '`requiredMark`, `optionalText`, `control`, `error`, `errorIcon`, `foot`, `help`,',
          '`counter`. Everything but `root`, `label` and `control` renders only when the prop or',
          'slot behind it is set.',
          '',
          '**Slots**: `default` (the control), `label`, `help` and `error`. A slot is content, not',
          'a different feature: `<template #error>` makes the field invalid and gets linked exactly',
          'as the `error` prop does.',
          '',
          '**The wiring** (`FIELD_KEY`): the wrapper provides `{ id, describedBy, invalid,',
          'required }`, and `Input`, `Textarea` and every other control inject it. `describedBy` is',
          'the error id **first**, then the help id, and only ids that actually render — the error',
          'is what a screen reader should hear first on focus. Any explicit prop on the control',
          'wins over the wrapper, so one control inside a valid field can still be marked invalid.',
          '',
          '**The error is linked, not announced.** It is a plain `<p>` tied by `aria-describedby`,',
          'with no `role="alert"` and no live region: announcing a failed submit belongs to the',
          "form's error summary, and a live error would be read again every time it rendered. The",
          'label stays `text` while the field is invalid — the boundary and the message are enough,',
          'and a red label reads as "required".',
          '',
          '**Per-field wording.** The strings a control emits on its own come from the message',
          'catalogue, so a search field inside a field wrapper is renamed by providing around it',
          'rather than by a prop:',
          '',
          '```ts',
          "import { provideEldraUiMessages } from '@eldrajs/ui';",
          '',
          '// in the setup() of the component that renders this one field',
          "provideEldraUiMessages({ clear: 'Clear search' });",
          '```',
          '',
          "Everything below that component sees it, so scope it to the field (or to the search bar's",
          'own wrapper) rather than to the page. App-wide, use `app.provide(MESSAGES_KEY, messages)`.',
          '',
          '**In an inline form** the wrapper flattens (`display: contents`) so the label and the',
          'control travel together as the growing half of the row, level with the button, and the',
          'error and foot row wrap onto full-width rows below both. Nothing moves in the DOM.',
          '',
          '**The counter does not decide the error.** It turns `danger` weight 600 once `value`',
          'runs past `max`, because the spec makes that a visible state of the counter — but it does',
          'not make the field invalid on its own: the boundary and the message come from `error`, so',
          'pass it with the over-limit wording you want ("Use no more than three letters."). A soft',
          'limit that is merely exceeded is still a legitimate state, and only you know whether this',
          'one is.',
          '',
          '**Full width**: `full` spans both columns of a two-column `FormLayout` and does nothing',
          'anywhere else — it reads the layout from `FORM_LAYOUT_KEY`, so a field standing on its',
          'own in a page-builder column is unaffected.',
          '',
          '**Groups**: `group` renders the whole wrapper as a `<fieldset>` with the label as its',
          "`<legend>` — the spec's shape for a set of checkboxes or radios that answer one",
          'question. There is no single control for a `<label for>` to point at, so the help and',
          'error are linked to the fieldset itself with `aria-describedby`; the required and',
          'optional marks move into the legend, and the fieldset keeps no border, padding or',
          'min-width, laying its controls out on a 0.75rem grid. It still provides `FIELD_KEY`, so',
          'a group control inside it reads the same `id` and `required`. The `<legend>` is the',
          "fieldset's **first child**, which is what names it — a box around it would leave the",
          "fieldset nameless however the CSS is written. (For a set of this package's own",
          'checkboxes, reach for `CheckboxGroup`, which owns its fieldset already.)',
          '',
          '**CSS variable**: `--eldra-field-note-line-height` (default `1.45`) is the line the help',
          'and error text share.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof FieldWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

const FRAME = 'max-w-96';

/** Label + control: the plainest field there is. */
export const Default: Story = {
  args: { label: 'Email address' },
  render: (args) => ({
    components: { FieldWrapper, Input },
    setup: () => ({ args, value: ref('maren.holt@example.com') }),
    template: `
      <div class="${FRAME}">
        <FieldWrapper v-bind="args">
          <Input v-model="value" type="email" autocomplete="email" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** The required mark: a `danger` asterisk that is `aria-hidden`, with native `required` doing the announcing. */
export const Required: Story = {
  args: { label: 'Street address', required: true },
  render: (args) => ({
    components: { FieldWrapper, Input },
    setup: () => ({ args, value: ref('14 Harbour Lane') }),
    template: `
      <div class="${FRAME}">
        <FieldWrapper v-bind="args">
          <Input v-model="value" autocomplete="address-line1" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** The optional mark. Mark the minority per form: checkout marks the optional fields, sign-up the required ones. */
export const Optional: Story = {
  args: { label: 'Company', optional: true },
  render: (args) => ({
    components: { FieldWrapper, Input },
    setup: () => ({ args, value: ref('') }),
    template: `
      <div class="${FRAME}">
        <FieldWrapper v-bind="args">
          <Input v-model="value" autocomplete="organization" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Help text: a short instruction, linked by `aria-describedby` so it is announced on focus. */
export const WithHelp: Story = {
  args: { label: 'Email address', help: 'We send your receipt and tracking link here.' },
  render: (args) => ({
    components: { FieldWrapper, Input },
    setup: () => ({ args, value: ref('maren.holt@example.com') }),
    template: `
      <div class="${FRAME}">
        <FieldWrapper v-bind="args">
          <Input v-model="value" type="email" autocomplete="email" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/**
 * The error state: `alert-circle` plus a message that says how to fix it, the control's 2px
 * `danger` boundary, and the error id first in `aria-describedby`. The label does not turn red.
 */
export const WithError: Story = {
  args: {
    label: 'Phone',
    required: true,
    error: 'Enter a phone number with at least 10 digits. The courier texts you on delivery day.',
  },
  render: (args) => ({
    components: { FieldWrapper, Input },
    setup: () => ({ args, value: ref('07700 90') }),
    template: `
      <div class="${FRAME}">
        <FieldWrapper v-bind="args">
          <Input v-model="value" type="tel" autocomplete="tel" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** The foot row: help at the start, the counter at the end. Over the limit it turns `danger` weight 600. */
export const WithCounter: Story = {
  args: {
    label: 'Monogram',
    optional: true,
    help: 'Up to 3 letters, stitched on the cuff.',
    counter: { max: 3, value: 2 },
  },
  render: (args) => ({
    components: { FieldWrapper, Input },
    setup: () => ({ args, value: ref('MH') }),
    template: `
      <div class="flex ${FRAME} flex-col gap-4">
        <FieldWrapper v-bind="args">
          <Input v-model="value" />
        </FieldWrapper>
        <FieldWrapper
          label="Monogram"
          help="Up to 3 letters, stitched on the cuff."
          error="Use no more than three letters."
          :counter="{ max: 3, value: 4 }"
        >
          <Input model-value="MHJ B" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Twice the example length everywhere: the label, the help and the error all wrap without overlap. */
export const LongContent: Story = {
  args: {
    label: 'Delivery instructions for the courier, including the gate code and the safe place',
    required: true,
    help: 'Tell the courier where to leave the parcel if nobody answers the door, and anything they need to get to it — a gate code, a side entrance, or the neighbour who takes parcels in.',
    error:
      'Enter instructions the courier can follow without calling you, or clear the field and we will leave the parcel with a neighbour instead.',
    counter: { max: 120, value: 164 },
  },
  render: (args) => ({
    components: { FieldWrapper, Textarea },
    setup: () => ({
      args,
      value: ref(
        'Please leave the parcel with the neighbour at number 16 if nobody answers. The side ' +
          'gate is unlocked during the day and there is a covered porch by the kitchen door.'
      ),
    }),
    template: `
      <div class="${FRAME}">
        <FieldWrapper v-bind="args">
          <Textarea v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** A set of checkboxes that answer one question: a `<fieldset>` named by its `<legend>`. */
export const Group: Story = {
  args: {
    label: 'What are you shopping for?',
    group: true,
    optional: true,
    help: 'Pick as many as you like — it only changes what we show you first.',
  },
  render: (args) => ({
    components: { FieldWrapper },
    setup: () => ({ args, options: ['Knitwear', 'Ceramics', 'Kitchen goods'] }),
    template: `
      <div class="${FRAME}">
        <FieldWrapper v-bind="args">
          <label v-for="option in options" :key="option" class="text-body-sm flex items-center gap-2">
            <input type="checkbox" :value="option" class="size-4" />
            {{ option }}
          </label>
        </FieldWrapper>
      </div>
    `,
  }),
};

/** The same group in error: the message is linked to the fieldset, which carries `aria-invalid`. */
export const GroupError: Story = {
  args: {
    label: 'What are you shopping for?',
    group: true,
    required: true,
    help: 'Pick as many as you like.',
    error: 'Choose at least one so we know where to start.',
  },
  render: (args) => ({
    components: { FieldWrapper },
    setup: () => ({ args, options: ['Knitwear', 'Ceramics', 'Kitchen goods'] }),
    template: `
      <div class="${FRAME}">
        <FieldWrapper v-bind="args">
          <label v-for="option in options" :key="option" class="text-body-sm flex items-center gap-2">
            <input type="checkbox" :value="option" class="size-4" />
            {{ option }}
          </label>
        </FieldWrapper>
      </div>
    `,
  }),
};

/** A 20rem container: the foot row wraps, and the counter keeps its place at the end. */
export const Narrow: Story = {
  args: {
    label: 'Monogram',
    required: true,
    help: 'Up to 3 letters, stitched on the cuff.',
    counter: { max: 3, value: 2 },
  },
  render: (args) => ({
    components: { FieldWrapper, Input },
    setup: () => ({ args, value: ref('MH') }),
    template: `
      <div class="border-border w-80 border p-4">
        <FieldWrapper v-bind="args">
          <Input v-model="value" />
        </FieldWrapper>
      </div>
    `,
  }),
};
