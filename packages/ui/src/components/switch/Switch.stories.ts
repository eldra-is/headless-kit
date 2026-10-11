import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import Switch from './Switch.vue';

/**
 * One story per state of the design spec's Switch section, named after the state it shows.
 * `eldra-starter-spec/images/core/switch.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Forms/Switch',
  component: Switch,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'An on/off control for a setting that takes effect immediately — "In stock only" in a',
          'filter bar, a notification preference. If the choice is submitted with a form, use a',
          '**Checkbox** instead.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root` (the',
          '`<button type="button" role="switch">`), `track`, `thumb`, `label` and `description`.',
          'The hidden mirror `<input type="checkbox">` has no `classes` key, the same reasoning as',
          "Checkbox's own native input: restyling it would break the pattern rather than restyle it.",
          '',
          '**A real button, not a hidden input.** `Space` and `Enter` toggle because the control is',
          'a native `<button>`: this component adds no key handling at all. `aria-checked` reflects',
          'the state, and the visible label is the button’s own content, so the accessible name',
          'matches the screen. A hidden `<input type="checkbox">` mirrors `modelValue` and carries',
          '`name` for a plain form submit; it takes no part in focus or activation.',
          '',
          '**The label never changes between states.** On/off is shown by the thumb’s position and',
          'the check icon, never by colour alone, and never by "On"/"Off" words inside the track.',
          '',
          '**Description.** A second `muted` line, linked with `aria-describedby` rather than',
          'folded into the accessible name — it is `aria-hidden` in the button’s own content so it',
          'is read as a description, not repeated as part of the name.',
          '',
          '**Inside a `FieldWrapper`.** A plain (non-group) wrapper renders a `<label for>` that',
          'already names the button, so the switch drops its own `label` part and takes the',
          "wrapper's id — the same shape Checkbox's `labelsControl` uses. Give the switch an `id`",
          'of its own and it keeps its own label, because the wrapper’s `for` can no longer reach',
          'it. This wiring is not part of the design spec, which never discusses a Switch inside a',
          'field wrapper; it mirrors the task’s own instruction.',
          '',
          '**Motion**: the thumb slides and the track fills over `duration-fast` with `ease-out`.',
          'With reduced motion the thumb jumps and the colours change instantly —',
          '`tokens.css` zeroes the duration.',
          '',
          '**CSS variables**: `--eldra-switch-radius` (default `var(--eldra-radius-full)`),',
          '`--eldra-switch-track-border-width` (default `1.5px`) and `--eldra-switch-thumb-offset`',
          '(default `0.1875rem`, the thumb’s rest inset from the track’s start edge).',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Off: `background` track, `border-strong` boundary and thumb, no icon, at the start. */
export const Off: Story = {
  render: () => ({
    components: { Switch },
    setup: () => ({ value: ref(false) }),
    template: `<Switch v-model="value">Gift receipt</Switch>`,
  }),
};

/** On: `primary` track, `primary-contrast` thumb with a check in `primary`, at the end. */
export const On: Story = {
  render: () => ({
    components: { Switch },
    setup: () => ({ value: ref(true) }),
    template: `<Switch v-model="value">Hide prices on packing slip</Switch>`,
  }),
};

/** `sm`: the filter-bar size, 2.25 × 1.25rem. */
export const Small: Story = {
  render: () => ({
    components: { Switch },
    setup: () => ({ inStock: ref(true), onSale: ref(false) }),
    template: `
      <div class="flex flex-wrap items-center gap-6">
        <Switch v-model="inStock" size="sm">In stock only</Switch>
        <Switch v-model="onSale" size="sm">On sale</Switch>
      </div>
    `,
  }),
};

/** A second, `muted` line under the label, linked by `aria-describedby`. */
export const WithDescription: Story = {
  render: () => ({
    components: { Switch },
    setup: () => ({ restock: ref(true), packaging: ref(false) }),
    template: `
      <div class="flex max-w-96 flex-col gap-4">
        <Switch v-model="restock" description="Email me when a sold-out size is back.">
          Restock alerts
        </Switch>
        <Switch v-model="packaging" description="Paper mailer instead of a poly bag.">
          Plastic-free packaging
        </Switch>
      </div>
    `,
  }),
};

/** Disabled, both ways: dashed `surface-strong` off, solid `muted` on — the thumb keeps its check. */
export const Disabled: Story = {
  render: () => ({
    components: { Switch },
    template: `
      <div class="flex flex-col gap-2">
        <Switch disabled>Collect from the Bristol studio</Switch>
        <Switch disabled :model-value="true">Gift wrap this order</Switch>
      </div>
    `,
  }),
};

/** A long label and a long description wrap under the track without shrinking it. */
export const LongContent: Story = {
  render: () => ({
    components: { Switch },
    setup: () => ({ value: ref(true) }),
    template: `
      <div class="max-w-96">
        <Switch
          v-model="value"
          description="About one email a month, and never your address or your order history — restocks only, no marketing."
        >
          Email me about new arrivals, restocks of the things I have looked at, and the studio journal
        </Switch>
      </div>
    `,
  }),
};

/** A 20rem container: the label and description wrap, the track never shrinks (1.4.10). */
export const Narrow: Story = {
  render: () => ({
    components: { Switch },
    setup: () => ({ restock: ref(true), inStock: ref(false) }),
    template: `
      <div class="border-border flex w-80 flex-col gap-4 border p-4">
        <Switch v-model="restock" description="Email me when a sold-out size is back.">
          Restock alerts
        </Switch>
        <Switch v-model="inStock" size="sm">In stock only, even for pre-orders and backorders</Switch>
      </div>
    `,
  }),
};

/**
 * Reduced motion. `scripts/screenshots.mjs` captures any story whose id ends in
 * `--reduced-motion` with Playwright's `reducedMotion: 'reduce'` emulation: `duration-fast` reads
 * `--eldra-duration-fast`, which `tokens.css` zeroes under `prefers-reduced-motion`, so the thumb
 * jumps to its end position instead of sliding — this story renders identically to `On` under that
 * emulation, which is the point.
 */
export const ReducedMotion: Story = {
  render: () => ({
    components: { Switch },
    setup: () => ({ value: ref(true) }),
    template: `<Switch v-model="value">Hide prices on packing slip</Switch>`,
  }),
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in `--forced-colors`
 * with Playwright's `forcedColors: 'active'` emulation: the track stays a real border in every
 * state — solid, dashed for disabled off — so on, off and disabled stay told apart, and the focus
 * ring takes the system Highlight colour.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Switch },
    setup: () => ({ off: ref(false), on: ref(true) }),
    template: `
      <div class="flex flex-col gap-2">
        <Switch v-model="off">Gift receipt</Switch>
        <Switch v-model="on">Hide prices on packing slip</Switch>
        <Switch disabled>Collect from the Bristol studio</Switch>
        <Switch disabled :model-value="true">Gift wrap this order</Switch>
      </div>
    `,
  }),
};
