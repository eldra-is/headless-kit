import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { useToast } from '../../composables/useToast';
import Button from '../button/Button.vue';
import Dialog from '../dialog/Dialog.vue';
import Toaster from './Toaster.vue';

/**
 * One story per state of the design spec's Toast section, named after the state it shows.
 * `eldra-starter-spec/images/core/toast.png` is the review target for all of them.
 *
 * `useToast()` is a module-level queue (see its own doc comment), so every story clears it in
 * `setup()` before raising its own toast(s) — otherwise navigating between stories in Storybook's
 * dev server (which does not reload the page between stories) would carry a previous story's
 * toasts into the next one. `scripts/screenshots.mjs` captures each story on a fresh page load, so
 * this only matters for interactive browsing, not for the committed baselines.
 */
const meta = {
  title: 'Feedback/Toast',
  component: Toaster,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
    messages: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A brief, non-blocking status message in a live region at the bottom-right corner, with',
          'an optional action and a close button. Confirm background actions (added to cart, code',
          'copied, saved) — never form validation, and never anything the shopper must act on to',
          'continue (use a Dialog for that).',
          '',
          '**`Toaster`** is the one host an app mounts once, near its root — `<Toaster />`, with no',
          'props required. It renders nothing itself when the queue is empty; every toast comes from',
          '`useToast()`, callable from anywhere (a component, a store, a fetch error handler), not',
          'only from inside the `Toaster`’s own subtree:',
          '',
          '```ts',
          'const toast = useToast();',
          "toast.show({ title: 'Added to cart', text: 'Merino crew sweater · Oatmeal · M', action: { label: 'View cart (3)', href: '/cart' } });",
          "toast.show({ variant: 'danger', title: \"Couldn't update your cart\", action: { label: 'Try again', onActivate: retry } });",
          '```',
          '',
          '**Parts** (`data-part`): `Toaster` — `root` (the fixed region), `list` (the polite',
          '`role="status"` element inside it — a danger toast is a further direct child of `root`,',
          'a sibling of `list`, never nested inside it, so the two live regions never nest). `Toast`',
          '— `root`, `icon`, `title`, `text`, `action`, `close`.',
          '',
          '**Variants and timing**: `success` (default) auto-dismisses after 6s; `warning` after',
          '10s; `danger` never — it is `role="alert"`, the other two sit inside the always-present,',
          'always-polite `list`. Every timer pauses while the pointer is over the stack or focus is',
          'inside it, and resumes for whatever was left on leave. At most three toasts show at once;',
          'the oldest leaves when a fourth arrives, newest at the bottom.',
          '',
          '**Keyboard**: `Tab` reaches each toast’s action and close button in document order;',
          '`Esc` closes whichever toast holds focus — only that one, even when the toast is',
          'teleported inside an open `Dialog` (see **Inside a dialog** below).',
          '',
          '**Inside a dialog**: while a modal `Dialog` is open, `Toaster` teleports its region into',
          'that dialog’s own element (`TOAST_HOST_KEY`, from `useDialog`/`dialogStack`) instead of',
          '`<body>` — otherwise a toast raised during a modal flow would be inert behind it.',
          '',
          '**Motion**: enter with a fade and a 0.5rem rise over `duration-base` `ease-out`; reduced',
          'motion drops to an instant appearance (no separate keyframe needed — the zeroed duration',
          'already has no movement). Exit is instant, the same trade-off `Dialog`’s own exit makes.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The spec's own success example: a title, supporting text and a "View cart" link. */
export const Success: Story = {
  render: () => ({
    components: { Toaster },
    setup() {
      const toast = useToast();
      toast.clear();
      toast.show({
        title: 'Added to cart',
        text: 'Merino crew sweater · Oatmeal · M',
        action: { label: 'View cart (3)', href: '/cart' },
      });
      return {};
    },
    template: '<Toaster />',
  }),
};

/** Stays until closed or its 10s timer runs out — title only, no text or action. */
export const Warning: Story = {
  render: () => ({
    components: { Toaster },
    setup() {
      const toast = useToast();
      toast.clear();
      toast.show({ variant: 'warning', title: 'Only 2 left in stock' });
      return {};
    },
    template: '<Toaster />',
  }),
};

/** Never auto-dismisses; `role="alert"`, its own assertive region beside the polite one. */
export const Danger: Story = {
  render: () => ({
    components: { Toaster },
    setup() {
      const toast = useToast();
      toast.clear();
      toast.show({
        variant: 'danger',
        title: "Couldn't update your cart",
        action: { label: 'Try again', onActivate: () => {} },
      });
      return {};
    },
    template: '<Toaster />',
  }),
};

/** The two action shapes side by side: a real link (`href`) above a real button (`onActivate`). */
export const WithAction: Story = {
  render: () => ({
    components: { Toaster },
    setup() {
      const toast = useToast();
      toast.clear();
      toast.show({
        id: 'link',
        title: 'Added to cart',
        action: { label: 'View cart (3)', href: '/cart' },
      });
      toast.show({
        id: 'button',
        variant: 'danger',
        title: "Couldn't update your cart",
        action: { label: 'Try again', onActivate: () => {} },
      });
      return {};
    },
    template: '<Toaster />',
  }),
};

/** Three at once, newest at the bottom — a mix of variants, one title-only. */
export const Stack: Story = {
  render: () => ({
    components: { Toaster },
    setup() {
      const toast = useToast();
      toast.clear();
      toast.show({
        title: 'Added to cart',
        text: 'Merino crew sweater · Oatmeal · M',
        action: { label: 'View cart (3)', href: '/cart' },
      });
      toast.show({ variant: 'warning', title: 'Only 2 left in stock' });
      toast.show({ title: 'Code WELCOME10 copied' });
      return {};
    },
    template: '<Toaster />',
  }),
};

/**
 * Raised while a `Dialog` is open: the region renders inside the dialog's own box (see the
 * component description's "Inside a dialog") rather than being inert behind it.
 */
export const InsideDialog: Story = {
  render: () => ({
    components: { Toaster, Dialog, Button },
    setup() {
      const toast = useToast();
      toast.clear();
      toast.show({ title: 'Added to your wishlist' });
      return { open: ref(true) };
    },
    template: `
      <div>
        <Dialog title="Remove from cart?" v-model="open" description="Merino crew sweater — Oat, size M.">
          <template #footer>
            <Button variant="outline" @click="open = false">Keep it</Button>
            <Button variant="danger" @click="open = false">Remove</Button>
          </template>
        </Dialog>
        <Toaster />
      </div>
    `,
  }),
};

/** Long title and text, captured at 360px too: the region stays `100vw - 2rem` wide and text
 *  wraps rather than overflowing or truncating. */
export const Narrow: Story = {
  render: () => ({
    components: { Toaster },
    setup() {
      const toast = useToast();
      toast.clear();
      toast.show({
        title: 'Your order is on its way to Reykjavík',
        text: 'Merino crew sweater · Oatmeal · M — expect delivery within 3 to 5 business days.',
        action: { label: 'Track your order', href: '/orders/1042' },
      });
      return {};
    },
    template: '<Toaster />',
  }),
};

/** Reduced motion: an instant appearance, no fade or rise. `scripts/screenshots.mjs` captures any
 *  story whose id ends in `--reduced-motion` with Playwright's `reducedMotion: 'reduce'`. */
export const ReducedMotion: Story = {
  parameters: { eldra: { reducedMotion: true } },
  render: () => ({
    components: { Toaster },
    setup() {
      const toast = useToast();
      toast.clear();
      toast.show({
        title: 'Added to cart',
        text: 'Merino crew sweater · Oatmeal · M',
        action: { label: 'View cart (3)', href: '/cart' },
      });
      return {};
    },
    template: '<Toaster />',
  }),
};

/** Forced colours: the panel border, action underline and focus ring are all real borders/text
 *  decoration, so the toast stays legible with every fill replaced by the system canvas. */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Toaster },
    setup() {
      const toast = useToast();
      toast.clear();
      toast.show({
        variant: 'danger',
        title: "Couldn't update your cart",
        action: { label: 'Try again', onActivate: () => {} },
      });
      return {};
    },
    template: '<Toaster />',
  }),
};
