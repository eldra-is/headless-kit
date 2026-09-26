import { IconCopy, IconHeart, IconUser } from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { getCurrentInstance, nextTick, onMounted } from 'vue';
import Button from '../button/Button.vue';
import Tooltip from './Tooltip.vue';

/**
 * One story per state of the design spec's Tooltip section, named after the state it shows.
 * `eldra-starter-spec/images/core/tooltip.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Overlays/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  args: { text: 'Add to wishlist' },
  argTypes: {
    placement: { control: 'inline-radio', options: ['top', 'bottom'] },
    align: { control: 'inline-radio', options: ['start', 'center', 'end'] },
    role: { control: 'inline-radio', options: ['label', 'description'] },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A short text label that names an icon-only trigger on hover and keyboard focus. Never',
          'the only place for information a shopper needs — prices, stock, errors and links stay',
          'visible text.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root` (the inline wrapper',
          'around the trigger — this is what the hover/focus listeners and the floating position',
          'key off, whatever the trigger itself is), `bubble` (the floating box, teleported to',
          '`body` or the open modal `<dialog>` the trigger sits in) and `arrow` (the small',
          'triangle). The `0.5rem` hover bridge (WCAG 1.4.13) is drawn, not a fourth part.',
          '',
          '**Slot**: `default`, exactly one element — the trigger. Its `aria-labelledby` (or',
          '`aria-describedby`) is wired on automatically; nothing else needs to change on it.',
          '',
          '**No delay**, on hover or on focus — the spec is explicit both ways. `Esc` hides it',
          'without moving focus; leaving with the pointer or moving focus away — either one —',
          'clears the dismissal so hovering or focusing again re-shows it.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Shows the tooltip the way keyboard focus does — immediately, with no delay — so the screenshot
 * harness (which settles for 400ms, never hovers anything) captures it open. This is also the
 * spec's own reference image: "a focused outline heart button" with its tooltip shown above it.
 *
 * The trigger is looked up inside **this story's own root**, not the document: an autodocs page
 * renders every story on the page at once, and a document-wide query would focus whichever
 * tooltip's trigger happened to come first in it rather than this one's.
 */
function showOnMount(): void {
  const instance = getCurrentInstance();
  onMounted(() => {
    void nextTick(() => {
      const root = instance?.proxy?.$el as Element | null | undefined;
      root?.querySelector<HTMLElement>('button, a[href], [tabindex]')?.focus();
    });
  });
}

/** Spec anatomy: an icon-only trigger named entirely by its tooltip (`role="label"`, the default). */
export const Label: Story = {
  render: (args) => ({
    components: { Tooltip, Button },
    setup: () => {
      showOnMount();
      return { args, IconHeart };
    },
    template: `
      <div class="p-16">
        <Tooltip v-bind="args">
          <Button variant="ghost" icon-only :icon="IconHeart" label="Add to wishlist" />
        </Tooltip>
      </div>
    `,
  }),
};

/** `role="description"`: an extra hint on a trigger that already has a visible label. */
export const Description: Story = {
  args: { text: 'Copies the snippet above', role: 'description' },
  render: (args) => ({
    components: { Tooltip, Button },
    setup: () => {
      showOnMount();
      return { args, IconCopy };
    },
    template: `
      <div class="p-16">
        <Tooltip v-bind="args">
          <Button variant="outline" :icon-left="IconCopy">Copy code</Button>
        </Tooltip>
      </div>
    `,
  }),
};

/** Spec → Variants: below the trigger, for header icons near the top of the viewport. */
export const Bottom: Story = {
  args: { text: 'Account', placement: 'bottom' },
  render: (args) => ({
    components: { Tooltip, Button },
    setup: () => {
      showOnMount();
      return { args, IconUser };
    },
    template: `
      <div class="p-16">
        <Tooltip v-bind="args">
          <Button variant="ghost" icon-only :icon="IconUser" label="Account" />
        </Tooltip>
      </div>
    `,
  }),
};

/**
 * Spec → Variants, Start / end: "Aligned to the trigger's left / right edge; combinable with
 * bottom" — for a trigger near a screen edge, where a centred bubble would run off it.
 */
export const Aligned: Story = {
  render: () => ({
    components: { Tooltip, Button },
    setup: () => {
      const instance = getCurrentInstance();
      onMounted(() => {
        void nextTick(() => {
          const root = instance?.proxy?.$el as Element | null | undefined;
          for (const trigger of root?.querySelectorAll?.<HTMLElement>('button') ?? []) {
            trigger.focus();
          }
        });
      });
      return { IconHeart, IconUser };
    },
    template: `
      <div class="flex items-start justify-between p-16">
        <Tooltip text="Add to wishlist" align="start">
          <Button variant="ghost" icon-only :icon="IconHeart" label="Add to wishlist" />
        </Tooltip>
        <Tooltip text="Account" placement="bottom" align="end">
          <Button variant="ghost" icon-only :icon="IconUser" label="Account" />
        </Tooltip>
      </div>
    `,
  }),
};

/** One line, however long the text — the spec's own "no wrap" rule. */
export const LongContent: Story = {
  args: {
    text: 'Add this hand-finished merino wool crew neck sweater to your wishlist for later',
  },
  render: (args) => ({
    components: { Tooltip, Button },
    setup: () => {
      showOnMount();
      return { args, IconHeart };
    },
    template: `
      <div class="p-16">
        <Tooltip v-bind="args">
          <Button variant="ghost" icon-only :icon="IconHeart" label="Add to wishlist" />
        </Tooltip>
      </div>
    `,
  }),
};

/** A 20rem container: the bubble is teleported, so a narrow ancestor never clips it. */
export const Narrow: Story = {
  render: (args) => ({
    components: { Tooltip, Button },
    setup: () => {
      showOnMount();
      return { args, IconHeart };
    },
    template: `
      <div class="w-80 border-border border p-4">
        <Tooltip v-bind="args">
          <Button variant="ghost" icon-only :icon="IconHeart" label="Add to wishlist" />
        </Tooltip>
      </div>
    `,
  }),
};

/**
 * Reduced motion. `scripts/screenshots.mjs` captures any story whose id ends in
 * `--reduced-motion` with `prefers-reduced-motion: reduce` emulation: `--eldra-duration-fast`
 * becomes `0ms` (`tokens.css`), so the opacity transition this story would otherwise be mid-way
 * through at the 400ms settle mark has already finished — the bubble simply appears.
 */
export const ReducedMotion: Story = {
  render: (args) => ({
    components: { Tooltip, Button },
    setup: () => {
      showOnMount();
      return { args, IconHeart };
    },
    template: `
      <div class="p-16">
        <Tooltip v-bind="args">
          <Button variant="ghost" icon-only :icon="IconHeart" label="Add to wishlist" />
        </Tooltip>
      </div>
    `,
  }),
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in `--forced-colors`
 * with Playwright's `forcedColors: 'active'` emulation: the bubble's `bg-text`/`text-background`
 * fill is replaced by the system `Canvas`/`CanvasText` pair, and the trigger's focus ring takes
 * the system `Highlight` colour — the bubble stays readable because it is real text on a real
 * (system-substituted) fill, not a colour-only cue.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: (args) => ({
    components: { Tooltip, Button },
    setup: () => {
      showOnMount();
      return { args, IconHeart };
    },
    template: `
      <div class="p-16">
        <Tooltip v-bind="args">
          <Button variant="ghost" icon-only :icon="IconHeart" label="Add to wishlist" />
        </Tooltip>
      </div>
    `,
  }),
};
