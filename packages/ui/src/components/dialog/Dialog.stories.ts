import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import Button from '../button/Button.vue';
import FieldWrapper from '../field-wrapper/FieldWrapper.vue';
import Input from '../input/Input.vue';
import Dialog from './Dialog.vue';

/**
 * One story per state of the design spec's Dialog section, named after the state it shows.
 * `eldra-starter-spec/images/core/dialog.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * Every story here starts **open** (`ref(true)`) rather than the closed default a real page would
 * use — a modal's whole visible subject is the box `showModal()` draws, so a story that only shows
 * its trigger button would give the screenshot harness nothing to review. Each still renders a real
 * "Open dialog" button beside it (`autodocs`' own interaction panel, and a keyboard/mouse pass
 * through Storybook) so the open → close → reopen cycle is exercised the normal way, not only
 * inspected in its settled state.
 */
const meta = {
  title: 'Overlays/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
    messages: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A small modal window for one decision or a short form. Use a Drawer for long content',
          '(cart, filters, menu) and a Toast for announcements — never open a Dialog on page load.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `panel`, `header`,',
          '`title`, `close`, `description`, `body`, `footer`. **Slots**: `default` (the body) and',
          '`footer` (the action buttons).',
          '',
          '**Native `<dialog>`, no custom focus trap.** Opened with `showModal()`; the rest of the',
          'page becomes inert and does not scroll while it is open. `Tab`/`Shift+Tab` already cycle',
          'only the dialog’s own controls — that is what the native element gives for free, so',
          'nothing here re-implements it.',
          '',
          '**Never two at once.** A second `Dialog` asked to open while one already is gets refused',
          '(a dev-only console warning) and its own `v-model` is put back to `false` — see',
          '`useDialog`/`dialogStack` in the package README’s Composables section.',
          '',
          '**Initial focus**: the first meaningful control that is not the close button (a field in',
          'the Form variant, the safe action in the Confirm variant — write it first in the',
          '`footer` slot) — never the close button itself while one exists. Focus returns to',
          'whatever opened the dialog the moment it closes, by any route.',
          '',
          '**Closing**: `Esc` and the close button always close it; a backdrop click closes it only',
          'when `dismissable` is `true` (the default). `close` fires with how: `"escape"`,',
          '`"backdrop"`, `"button"`, or an action value passed to the exposed `close(value)` method',
          '(`<Dialog ref="dialogRef">`, then `dialogRef.value.close(\'remove\')` from a footer',
          'button’s own click handler).',
          '',
          '**Entrance**: fade plus a 0.5rem rise and scale from 98%, over `duration-slow` `ease-out`.',
          'Reduced motion drops the rise/scale for a plain opacity fade over `duration-base`, linear.',
          'Exit is instant. **CSS variables**: `--eldra-dialog-title-size`/`-line`,',
          '`--eldra-dialog-width`/`-sm`, `--eldra-dialog-max-height`.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The spec's own Info variant: a title and short text, a single primary "Got it". */
export const Default: Story = {
  args: { title: 'Added to your wishlist' },
  render: (args) => ({
    components: { Dialog, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <div>
        <Button variant="outline" @click="open = true">Open dialog</Button>
        <Dialog v-bind="args" v-model="open" description="You can find it any time under Account · Wishlist.">
          <template #footer>
            <Button variant="primary" @click="open = false">Got it</Button>
          </template>
        </Dialog>
      </div>
    `,
  }),
};

/** `size="sm"` — the 24rem clamp, for a shorter message with a single action. */
export const Small: Story = {
  args: { title: 'Link copied', size: 'sm' },
  render: (args) => ({
    components: { Dialog, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <div>
        <Button variant="outline" @click="open = true">Open dialog</Button>
        <Dialog v-bind="args" v-model="open" description="Anyone with the link can view this page.">
          <template #footer>
            <Button variant="primary" @click="open = false">Got it</Button>
          </template>
        </Dialog>
      </div>
    `,
  }),
};

/**
 * The Form variant: a field is the body, so there is no `description`. Opening moves focus into
 * the email field automatically — it is the first meaningful control, and the close button never
 * wins that race.
 */
export const WithForm: Story = {
  args: { title: "Notify me when it's back" },
  render: (args) => ({
    components: { Dialog, Button, FieldWrapper, Input },
    setup: () => ({ args, open: ref(true), email: ref('') }),
    template: `
      <div>
        <Button variant="outline" @click="open = true">Open dialog</Button>
        <Dialog v-bind="args" v-model="open">
          <p class="text-body text-muted mb-4">We’ll email you the moment this is back in stock.</p>
          <FieldWrapper label="Email">
            <Input v-model="email" type="email" name="notify-email" placeholder="you@example.com" />
          </FieldWrapper>
          <template #footer>
            <Button variant="ghost" @click="open = false">Cancel</Button>
            <Button variant="primary" @click="open = false">Notify me</Button>
          </template>
        </Dialog>
      </div>
    `,
  }),
};

/**
 * The Confirm variant: the safe action ("Keep it") is written first in the footer, so it is the
 * first meaningful control and wins initial focus — the destructive action is last and never
 * focused first, per the spec's own rule.
 */
export const Confirm: Story = {
  args: { title: 'Remove from cart?' },
  render: (args) => ({
    components: { Dialog, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <div>
        <Button variant="outline" @click="open = true">Open dialog</Button>
        <Dialog v-bind="args" v-model="open" description="Merino crew sweater — Oat, size M.">
          <template #footer>
            <Button variant="outline" @click="open = false">Keep it</Button>
            <Button variant="danger" @click="open = false">Remove</Button>
          </template>
        </Dialog>
      </div>
    `,
  }),
};

/**
 * `dismissable: false` — a backdrop click no longer closes it (unsaved input, or a destructive
 * confirm a stray click must not count as an answer for). `Esc` and the close button still do.
 */
export const NotDismissable: Story = {
  args: { title: 'Discard your changes?', dismissable: false },
  render: (args) => ({
    components: { Dialog, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <div>
        <Button variant="outline" @click="open = true">Open dialog</Button>
        <Dialog v-bind="args" v-model="open" description="A backdrop click does nothing here — use a button, or Esc.">
          <template #footer>
            <Button variant="ghost" @click="open = false">Keep editing</Button>
            <Button variant="danger" @click="open = false">Discard</Button>
          </template>
        </Dialog>
      </div>
    `,
  }),
};

/** Content taller than `100vh - 4rem` scrolls inside the body; the header and footer stay put. */
export const LongContent: Story = {
  args: { title: 'Terms of service' },
  render: (args) => ({
    components: { Dialog, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <div>
        <Button variant="outline" @click="open = true">Open dialog</Button>
        <Dialog v-bind="args" v-model="open">
          <div class="text-body text-muted flex flex-col gap-4">
            <p v-for="n in 14" :key="n">
              Paragraph {{ n }} of a long agreement, long enough that it has to scroll inside the
              dialog rather than growing the dialog past the viewport.
            </p>
          </div>
          <template #footer>
            <Button variant="ghost" @click="open = false">Decline</Button>
            <Button variant="primary" @click="open = false">Accept</Button>
          </template>
        </Dialog>
      </div>
    `,
  }),
};

/**
 * Opened from a 20rem-wide ancestor — the dialog keeps its own `min(32rem, 100vw - 2rem)` width
 * regardless: a modal's box has no relationship to whatever container its trigger sits in.
 */
export const Narrow: Story = {
  args: { title: 'Remove from cart?' },
  render: (args) => ({
    components: { Dialog, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <div class="w-80">
        <Button variant="outline" @click="open = true">Open dialog</Button>
        <Dialog v-bind="args" v-model="open" description="Merino crew sweater — Oat, size M.">
          <template #footer>
            <Button variant="outline" @click="open = false">Keep it</Button>
            <Button variant="danger" @click="open = false">Remove</Button>
          </template>
        </Dialog>
      </div>
    `,
  }),
};

/** Reduced motion: a plain opacity fade over `duration-base`, no rise or scale. The screenshot
 *  harness captures this one with `prefers-reduced-motion: reduce` emulated (the story name itself
 *  is the channel — see `scripts/screenshots.mjs#emulationFor`). */
export const ReducedMotion: Story = {
  args: { title: 'Added to your wishlist' },
  parameters: { eldra: { reducedMotion: true } },
  render: (args) => ({
    components: { Dialog, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <Dialog v-bind="args" v-model="open" description="You can find it any time under Account · Wishlist.">
        <template #footer>
          <Button variant="primary" @click="open = false">Got it</Button>
        </template>
      </Dialog>
    `,
  }),
};

/** Forced colours: the panel's border and the focus ring are real borders/outlines, so the dialog
 *  stays legible with every fill replaced by the system canvas. */
export const ForcedColors: Story = {
  args: { title: 'Remove from cart?' },
  parameters: { eldra: { forcedColors: true } },
  render: (args) => ({
    components: { Dialog, Button },
    setup: () => ({ args, open: ref(true) }),
    template: `
      <Dialog v-bind="args" v-model="open" description="Merino crew sweater — Oat, size M.">
        <template #footer>
          <Button variant="outline" @click="open = false">Keep it</Button>
          <Button variant="danger" @click="open = false">Remove</Button>
        </template>
      </Dialog>
    `,
  }),
};
