import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import Textarea from './Textarea.vue';

/**
 * One story per state of the design spec's Textarea section, named after the state it shows.
 * `eldra-starter-spec/images/core/textarea.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Forms/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'Multi-line text entry that grows with its content from `minHeight` (5rem by default)',
          'up to 16rem, then scrolls. For a single short value use `Input`. It always sits in a',
          '`FieldWrapper` so it has a visible label — a placeholder is an example, never the label.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `control`, `foot`,',
          '`counter`. `foot` and `counter` render only while `counter` and `maxLength` are both',
          'set — a bare `<Textarea />` renders just the box.',
          '',
          '**Field wrapper**: like `Input`, a Textarea inside a `FieldWrapper` takes its `id`,',
          '`aria-describedby`, invalid and required state from it through `FIELD_KEY`. Any',
          'explicit prop wins over the wrapper.',
          '',
          '**Auto-grow**: `field-sizing: content` where the runtime supports it; elsewhere `rows`',
          'is grown on every `input` by measuring `scrollHeight` against `clientHeight`, capped at',
          'the same 16rem the CSS `max-height` enforces everywhere. Growth is instant, with no',
          'height animation.',
          '',
          '**Counter**: `counter` shows `"n / maxLength"` in the foot row once `maxLength` is also',
          'set. It reads `muted` under the limit and turns `danger` weight 600 once the value runs',
          'over it — typing past a *soft* limit (the default) is still allowed; `hardLimit` also',
          'sets the native `maxlength`, so typing stops there instead. The counter itself carries',
          'no `aria-live` at all — a live count would be read on every keystroke. Announcing is a',
          'separate, always-present, visually hidden polite `role="status"` region that speaks',
          '**once per crossing**: once on reaching 80% of the limit ("20 characters left") and',
          'once on passing it ("Over the limit by 3"), each a snapshot of the moment it was',
          'crossed rather than a running total. Typing on within the same zone stays silent, and',
          'dropping back under 80% clears the region, so a later crossing is announced again.',
          '',
          '**Error**: `invalid` sets `aria-invalid="true"` and draws the same 2px `danger`',
          'boundary as `Input`. The message itself belongs to the `FieldWrapper`.',
          '',
          '**CSS variables**: `--eldra-textarea-radius` (default `var(--eldra-radius-md)`),',
          '`--eldra-textarea-min-height` (set from the `minHeight` prop, default `5rem`) and',
          '`--eldra-counter-line-height` (default `1.5`).',
          '',
          '**Viewport, not container**: like `Input`, the control text grows to 1rem below a',
          '48rem *viewport* (`max-md:`), so iOS never zooms into a focused field.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A label, because the spec's Textarea never appears without one. `FieldWrapper` lands in Task 7. */
const LABEL_CLASS = 'text-label text-text mb-1 block';
const HELP_CLASS = 'text-body-sm text-muted mt-1';

/** The plain box, with no counter — the reference image's "Focus-visible · auto-grown" panel. */
export const Default: Story = {
  render: () => ({
    components: { Textarea },
    setup: () => ({
      value: ref(
        'Please leave the parcel with the neighbour at number 16 if nobody answers.\n' +
          'The side gate is unlocked during the day and there is a covered porch by the kitchen ' +
          'door where it will stay dry. Ring twice, the bell is quiet.'
      ),
    }),
    template: `
      <div class="max-w-96">
        <label for="story-default" class="${LABEL_CLASS}">Delivery instructions</label>
        <Textarea id="story-default" v-model="value" />
      </div>
    `,
  }),
};

/** With counter, soft limit (default) — the reference image's "Default · empty with counter" panel. */
export const WithCounter: Story = {
  render: () => ({
    components: { Textarea },
    setup: () => ({ value: ref('Happy birthday, Anna! Something warm for the long winter.') }),
    template: `
      <div class="max-w-96">
        <label for="story-counter" class="${LABEL_CLASS}">Gift message <span class="text-muted">(optional)</span></label>
        <Textarea id="story-counter" v-model="value" counter :max-length="200" />
        <p class="${HELP_CLASS}">Printed on a card inside the parcel.</p>
      </div>
    `,
  }),
};

/** Over a soft limit: the counter turns danger weight 600, typing is still allowed. */
export const AtLimit: Story = {
  render: () => ({
    components: { Textarea },
    setup: () => ({
      value: ref('The oatmeal merino crew is the softest jumper I have ever owned'),
    }),
    template: `
      <div class="max-w-96">
        <label for="story-at-limit" class="${LABEL_CLASS}">Review headline</label>
        <Textarea id="story-at-limit" v-model="value" invalid counter :max-length="60"
          described-by="story-at-limit-error" />
        <p id="story-at-limit-error" class="text-body-sm text-danger mt-1 flex items-center gap-1">
          <svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          Keep the headline to 60 characters.
        </p>
      </div>
    `,
  }),
};

/** `hardLimit` also sets native `maxlength`, so typing stops there — engraving, monograms. */
export const HardLimit: Story = {
  render: () => ({
    components: { Textarea },
    setup: () => ({ value: ref('To my favourite') }),
    template: `
      <div class="max-w-96">
        <label for="story-hard-limit" class="${LABEL_CLASS}">Engraving text</label>
        <Textarea id="story-hard-limit" v-model="value" hard-limit counter :max-length="30" min-height="3rem" />
        <p class="${HELP_CLASS}">Engraving is only offered on the oak serving boards.</p>
      </div>
    `,
  }),
};

/** The error state: a 2px `danger` boundary, `aria-invalid`, and a message that says what to do. */
export const Invalid: Story = {
  render: () => ({
    components: { Textarea },
    setup: () => ({ value: ref('Could the mug handle be a little wider') }),
    template: `
      <div class="max-w-96">
        <label for="story-invalid" class="${LABEL_CLASS}">Your note to the maker</label>
        <Textarea id="story-invalid" v-model="value" invalid described-by="story-invalid-error" />
        <p id="story-invalid-error" class="text-body-sm text-danger mt-1 flex items-center gap-1">
          <svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          Finish your note before sending it to the maker.
        </p>
      </div>
    `,
  }),
};

/** Disabled: `surface-strong`, a dashed decorative border, and skipped by `Tab`. */
export const Disabled: Story = {
  render: () => ({
    components: { Textarea },
    setup: () => ({ value: ref('Not available for this item') }),
    template: `
      <div class="max-w-96">
        <label for="story-disabled" class="${LABEL_CLASS}">Engraving text</label>
        <Textarea id="story-disabled" v-model="value" disabled />
        <p class="${HELP_CLASS}">Engraving is only offered on the oak serving boards.</p>
      </div>
    `,
  }),
};

/** Read-only: still focusable and selectable, which is why it is never a disabled field. */
export const ReadOnly: Story = {
  render: () => ({
    components: { Textarea },
    setup: () => ({ value: ref('Could the mug handle be a little wider? Thank you!') }),
    template: `
      <div class="max-w-96">
        <label for="story-readonly" class="${LABEL_CLASS}">Your note to the maker</label>
        <Textarea id="story-readonly" v-model="value" readonly />
      </div>
    `,
  }),
};

/** Twice the example length: the box grows to its 16rem max height and then scrolls. */
export const LongContent: Story = {
  render: () => ({
    components: { Textarea },
    setup: () => ({
      value: ref(
        'We ordered the stoneware dinner set in Sage for our new flat.\n' +
          'Two of the side plates arrived with a small chip on the rim, and one of the bowls has ' +
          'a glaze run on the base.\n' +
          'Everything else is perfect and the packaging was excellent, lots of paper and no ' +
          'plastic at all.\n' +
          'Could you send replacements for the two plates? We are happy to send photos if that ' +
          'helps, and thank you for such careful packing on the rest of the order.'
      ),
    }),
    template: `
      <div class="max-w-96">
        <label for="story-long" class="${LABEL_CLASS}">Tell us about your order</label>
        <Textarea id="story-long" v-model="value" />
      </div>
    `,
  }),
};

/** A 20rem container: the field fills its column, and the foot row wraps without breaking the counter. */
export const Narrow: Story = {
  render: () => ({
    components: { Textarea },
    setup: () => ({ value: ref('Happy birthday, Anna! Something warm for the long winter.') }),
    template: `
      <div class="border-border w-80 border p-4">
        <label for="story-narrow" class="${LABEL_CLASS}">Gift message</label>
        <Textarea id="story-narrow" v-model="value" counter :max-length="200" />
        <p class="${HELP_CLASS}">Printed on a card inside the parcel.</p>
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
    components: { Textarea },
    setup: () => ({
      message: ref('Happy birthday, Anna! Something warm for the long winter.'),
      headline: ref('The oatmeal merino crew is the softest jumper I have ever owned'),
    }),
    template: `
      <div class="flex max-w-96 flex-col gap-4">
        <div>
          <label for="story-fc-message" class="${LABEL_CLASS}">Gift message</label>
          <Textarea id="story-fc-message" v-model="message" counter :max-length="200" />
        </div>
        <div>
          <label for="story-fc-invalid" class="${LABEL_CLASS}">Review headline</label>
          <Textarea id="story-fc-invalid" v-model="headline" invalid counter :max-length="60" />
        </div>
        <div>
          <label for="story-fc-disabled" class="${LABEL_CLASS}">Engraving text</label>
          <Textarea id="story-fc-disabled" model-value="Not available for this item" disabled />
        </div>
      </div>
    `,
  }),
};
