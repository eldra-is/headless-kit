import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { computed, ref } from 'vue';
import FieldWrapper from '../field-wrapper/FieldWrapper.vue';
import Checkbox from './Checkbox.vue';
import CheckboxGroup from './CheckboxGroup.vue';

/**
 * One story per state of the design spec's Checkbox section, named after the state it shows.
 * `eldra-starter-spec/images/core/checkbox.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Forms/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'One or more independent options, either alone (consent) or in a group (filters,',
          'preferences). For a setting that applies immediately use a **Switch**; for one choice',
          'from a set, a **Radio group**.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root` (the `<label>`),',
          '`box` (the drawn box), `check` (the tick or dash), `label` and `hint`. The native',
          '`<input type="checkbox">` is the one element with no `classes` key: it is `sr-only`',
          'inside the box, and restyling it would break the pattern rather than restyle it.',
          '',
          '**Slots**: `default` (the label text) and `hint`.',
          '',
          '**Attributes**: `inheritAttrs` is off, so anything you put on the component —',
          '`data-testid`, `aria-*`, `autofocus`, a native `form` — lands on the **hidden input**,',
          'which is the control. Nothing falls through to the row: style the row with',
          '`classes.root` (and the box with `classes.box`).',
          '',
          '**The whole row is the target.** The `<label>` wraps the input, so clicking the box,',
          'the label or the hint toggles, and the row is at least 1.5rem tall (`target-min`) even',
          'for a one-word option — WCAG 2.5.8. `Space` toggles because the control is a real',
          'native checkbox: this component adds no key handling at all.',
          '',
          '**Proxy focus.** The input is visually hidden, so the standard focus ring is drawn on',
          'the *box* — `eldra-focus` plus the new `eldra-focus-proxy` utility, which turns the',
          'ring on when a descendant is `:focus-visible`. That is the focus-ring foundation’s',
          '"Proxy focus" rule, and it means what a keyboard user sees is the shape they can see.',
          '',
          '**Indeterminate** sets the native `indeterminate` property on the element (and',
          '`aria-checked="mixed"` beside it), so assistive technology reads "mixed"; the box shows',
          'a dash instead of a tick. Name the children it stands for with `controls`',
          '(`aria-controls`). What activating a parent *does* to those children — check them all,',
          'clear them all, recompute the parent from them afterwards — is the caller’s: this',
          'component has no children of its own. It does re-assert `indeterminate` after every',
          'toggle, because activating a checkbox clears the property in the browser.',
          '',
          '**Error.** `invalid` sets `aria-invalid="true"` and thickens the box boundary to 2px',
          '`danger`; the message itself is the `CheckboxGroup`’s `error`, a `FieldWrapper`’s,',
          'or yours, linked with `describedBy`. A **disabled** box drops the danger boundary and',
          'keeps `aria-invalid` — the same reading as `Input` and `Textarea`: still invalid, just',
          'not correctable here.',
          '',
          '**Inside a `FieldWrapper`.** A plain `FieldWrapper` renders a `<label for>` that already',
          'names the box, so the box drops its own `<label>` and its root becomes a `<span>` —',
          'one control, one label. The drawn box stays clickable because the control covers it.',
          'For the spec\u2019s **single consent** shape, where the sentence belongs *beside* the box,',
          'use `<FieldWrapper group>`: the wrapper contributes the legend, the error and the',
          'wiring, and the box keeps its own label (a `<legend>` is not a `<label>`). Give the box',
          'an `id` of its own and it keeps its label either way, because the wrapper\u2019s `for` can',
          'no longer reach it.',
          '',
          '**Groups** are a `CheckboxGroup`: a real `<fieldset>` with a `<legend>`, so the question',
          'is read with each option. Its `error` is linked to the **fieldset** with',
          '`aria-describedby` and marks the fieldset `aria-invalid="true"`; the individual options',
          'stay valid, because repeating "invalid" on every one of five boxes is noise rather than',
          'information. A `CheckboxGroup` therefore needs **no** `FieldWrapper` around it — and',
          'must not be put inside one with `group` set, which would nest a second `<fieldset>` and',
          'a second legend around the first. Its `modelValue` is in **check order** — a value is',
          'appended when its box is ticked and filtered out when it is cleared — so the array reads',
          'as the sequence the customer chose in, not as the order of `options`.',
          '',
          '**Motion**: the mark scales in from 0 over `duration-fast` with `ease-out`, and the fill',
          'and border fade over the same duration (both owned by `eldra-focus`’s transition',
          'list). With reduced motion `tokens.css` zeroes that duration, so the tick simply',
          'appears.',
          '',
          '**CSS variables**: `--eldra-checkbox-radius` (default `var(--eldra-radius-sm)`),',
          '`--eldra-checkbox-border-width` (default `1.5px`) and',
          '`--eldra-checkbox-border-width-invalid` (default `2px`).',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The spec's own vertical group. */
const MATERIALS = [
  { value: 'merino', label: 'Merino wool' },
  { value: 'cotton', label: 'Organic cotton' },
  { value: 'linen', label: 'Washed linen', hint: 'Pre-softened, will not shrink further' },
];

/** The spec's own row group. */
const SIZES = ['XS', 'S', 'M', 'L', 'XL'].map((size) => ({
  value: size.toLowerCase(),
  label: size,
}));

/** An unchecked box with its label. The whole row is the click target. */
export const Default: Story = {
  render: () => ({
    components: { Checkbox },
    setup: () => ({ value: ref(false) }),
    template: `<Checkbox v-model="value" name="material" value="merino">Merino wool</Checkbox>`,
  }),
};

/** Checked: `primary` fill, `primary-contrast` tick — fill *and* shape, never colour alone. */
export const Checked: Story = {
  render: () => ({
    components: { Checkbox },
    setup: () => ({ value: ref(true) }),
    template: `<Checkbox v-model="value" name="material" value="merino">Merino wool</Checkbox>`,
  }),
};

/**
 * An indeterminate parent over its children, the spec's "Indeterminate parent" variant: the dash,
 * `aria-controls` naming the children, and the parent recomputed from them after every change —
 * which is the page's logic, shown here in full.
 */
export const Indeterminate: Story = {
  render: () => ({
    components: { Checkbox },
    setup: () => {
      const children = ref({ arrivals: true, journal: false, sales: true });
      const values = computed(() => Object.values(children.value));
      const all = computed(() => values.value.every(Boolean));
      const some = computed(() => values.value.some(Boolean) && !all.value);
      function toggleAll(checked: boolean): void {
        children.value = { arrivals: checked, journal: checked, sales: checked };
      }
      return { children, all, some, toggleAll };
    },
    template: `
      <div class="flex flex-col gap-2">
        <Checkbox
          :model-value="all"
          :indeterminate="some"
          controls="story-arrivals story-journal story-sales"
          @change="toggleAll"
        >All updates</Checkbox>
        <div class="ms-7 flex flex-col gap-2">
          <Checkbox id="story-arrivals" v-model="children.arrivals">New arrivals</Checkbox>
          <Checkbox id="story-journal" v-model="children.journal">Studio journal</Checkbox>
          <Checkbox id="story-sales" v-model="children.sales">Sale previews</Checkbox>
        </div>
      </div>
    `,
  }),
};

/** A second line under the label, `muted`, inside the label so it is part of the click target. */
export const WithHint: Story = {
  render: () => ({
    components: { Checkbox },
    setup: () => ({ value: ref(true) }),
    template: `
      <Checkbox v-model="value" hint="Pre-softened, will not shrink further">Washed linen</Checkbox>
    `,
  }),
};

/** `lg`: a 1.5rem box, top-aligned, for a single prominent option. */
export const Large: Story = {
  render: () => ({
    components: { Checkbox },
    setup: () => ({ value: ref(true) }),
    template: `<Checkbox v-model="value" size="lg">Gift wrap this order</Checkbox>`,
  }),
};

/**
 * Required consent in error, in a real `FieldWrapper`: a 2px `danger` boundary on the box, and the
 * wrapper's own error row linked by id. `group` is what keeps the sentence beside the box — the
 * wrapper's `<legend>` names the field, and the box keeps its own label.
 */
export const Invalid: Story = {
  render: () => ({
    components: { Checkbox, FieldWrapper },
    setup: () => ({ value: ref(false) }),
    template: `
      <div class="max-w-96">
        <FieldWrapper
          group
          label="Terms of sale"
          required
          error="Tick the box to agree to the terms before you pay."
        >
          <Checkbox v-model="value">
            I agree to the <a class="underline" href="#terms">terms of sale</a>
          </Checkbox>
        </FieldWrapper>
      </div>
    `,
  }),
};

/**
 * An invalid box that is also ticked keeps its `primary` fill: the mark is `primary-contrast`, so
 * a `background` fill would draw the tick in the page's own colour and lose it. The error is the
 * 2px `danger` boundary.
 */
export const InvalidChecked: Story = {
  render: () => ({
    components: { Checkbox },
    template: `
      <div class="flex flex-col gap-2">
        <Checkbox invalid :model-value="true">I agree to the terms of sale</Checkbox>
        <Checkbox invalid :indeterminate="true">All updates</Checkbox>
        <Checkbox invalid>I agree to the terms of sale</Checkbox>
      </div>
    `,
  }),
};

/** Disabled, both ways: a dashed empty box, and a solid `muted` fill that keeps its tick. */
export const Disabled: Story = {
  render: () => ({
    components: { Checkbox },
    template: `
      <div class="flex flex-col gap-2">
        <Checkbox disabled>Collect from the Bristol studio</Checkbox>
        <Checkbox disabled :model-value="true">Gift wrap this order</Checkbox>
      </div>
    `,
  }),
};

/** A vertical group: `<fieldset>` + `<legend>`, so the question is read with each option. */
export const Group: Story = {
  render: () => ({
    components: { CheckboxGroup },
    setup: () => ({ options: MATERIALS, value: ref(['merino', 'linen']) }),
    template: `
      <div class="max-w-96">
        <CheckboxGroup v-model="value" legend="Material" name="material" :options="options" />
      </div>
    `,
  }),
};

/** A row group for short labels, wrapping rather than overflowing. */
export const GroupRow: Story = {
  render: () => ({
    components: { CheckboxGroup },
    setup: () => ({ options: SIZES, value: ref(['xs', 'm']) }),
    template: `
      <div class="max-w-96">
        <CheckboxGroup v-model="value" legend="Size" name="size" layout="row" :options="options" />
      </div>
    `,
  }),
};

/** A group in error: the message is linked to the fieldset, which reads `aria-invalid="true"`. */
export const GroupError: Story = {
  render: () => ({
    components: { CheckboxGroup },
    setup: () => ({ options: MATERIALS, value: ref([]) }),
    template: `
      <div class="max-w-96">
        <CheckboxGroup
          v-model="value"
          legend="Material"
          name="material"
          :options="options"
          error="Choose at least one material to filter by."
        />
      </div>
    `,
  }),
};

/** Long labels and hints wrap under the text column, never under the box. */
export const LongContent: Story = {
  render: () => ({
    components: { Checkbox },
    setup: () => ({ value: ref(true) }),
    template: `
      <div class="max-w-96 flex flex-col gap-2">
        <Checkbox
          v-model="value"
          hint="About one email a month, and never your address or your order history."
        >Email me about new arrivals, restocks of the things I have looked at, and the studio journal</Checkbox>
        <Checkbox size="lg">Deliver to the address on my account rather than to this one</Checkbox>
      </div>
    `,
  }),
};

/** A 20rem container: the row group wraps and the hints stay in their column. */
export const Narrow: Story = {
  render: () => ({
    components: { Checkbox, CheckboxGroup },
    setup: () => ({
      materials: MATERIALS,
      sizes: SIZES,
      chosen: ref(['linen']),
      picked: ref(['m']),
      consent: ref(false),
    }),
    template: `
      <div class="border-border flex w-80 flex-col gap-6 border p-4">
        <CheckboxGroup v-model="chosen" legend="Material" :options="materials" />
        <CheckboxGroup v-model="picked" legend="Size" layout="row" :options="sizes" />
        <Checkbox v-model="consent" hint="One email a month at most.">Email me about new arrivals</Checkbox>
      </div>
    `,
  }),
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in `--forced-colors`
 * with Playwright's `forcedColors: 'active'` emulation: the box stays a real border, so checked,
 * unchecked and disabled stay told apart, and the focus ring takes the system Highlight colour.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Checkbox, CheckboxGroup },
    setup: () => ({ options: MATERIALS, value: ref(['merino', 'linen']) }),
    template: `
      <div class="flex max-w-96 flex-col gap-6">
        <CheckboxGroup v-model="value" legend="Material" :options="options" />
        <div class="flex flex-col gap-2">
          <Checkbox :indeterminate="true">All updates</Checkbox>
          <Checkbox invalid required>I agree to the terms of sale</Checkbox>
          <Checkbox disabled>Collect from the Bristol studio</Checkbox>
          <Checkbox disabled :model-value="true">Gift wrap this order</Checkbox>
        </div>
      </div>
    `,
  }),
};
