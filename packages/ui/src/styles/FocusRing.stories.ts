import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Button from '../components/button/Button.vue';

/**
 * The stories' own markup is compiled by this Storybook's app-level Tailwind (see
 * `.storybook/preview.css`), apart from the package's prefixed sheet, which is exactly how a
 * consumer such as Studio meets the ring: its own `shadow-*` from its own, later `utilities` layer.
 */
const meta = {
  title: 'Foundations/FocusRing',
  parameters: {
    docs: {
      description: {
        component:
          'The one focus ring, `eldra-focus`: a `focus-inner` infill hugging the element and a ' +
          '`focus` ring outside it, fading in over `duration-base`. It is drawn through ' +
          "Tailwind's own ring variables (`--tw-ring-offset-shadow`, `--tw-ring-shadow`), so a " +
          '`shadow-*` utility on the same element keeps the ring and draws its shadow beneath ' +
          'it. A `ring-*`, `ring-offset-*` or `inset-ring-*` utility replaces the ring, as ' +
          "Tailwind's own `ring` does, and a `transition-*` utility replaces the fade, so a " +
          'focusable element carries neither.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Link cards with one of the theme's shadows each (`shadow-sm`, `shadow-md`, `shadow-float`) and
 * `eldra-focus` beside it. Tab through them: every card shows the ring, with its shadow still under
 * it.
 */
export const WithShadows: Story = {
  render: () => ({
    setup: () => ({
      cards: [
        { shadow: 'shadow-sm', title: 'Order confirmation', body: 'When an order is placed' },
        { shadow: 'shadow-md', title: 'Order refund', body: 'When an order is refunded' },
        { shadow: 'shadow-float', title: 'Ready for pickup', body: 'When an order is ready' },
      ],
    }),
    template: `
      <div class="grid max-w-3xl gap-6 p-6 sm:grid-cols-3">
        <a
          v-for="card in cards"
          :key="card.shadow"
          href="#"
          :class="['eldra-focus flex flex-col gap-2 rounded-xl border border-border bg-background p-4 text-text no-underline', card.shadow]"
          @click.prevent
        >
          <span class="text-body font-semibold">{{ card.title }}</span>
          <span class="text-small text-muted">{{ card.body }}</span>
          <code class="text-small text-muted">{{ card.shadow }}</code>
        </a>
      </div>
    `,
  }),
};

/**
 * The package's own `Button`, given a `shadow-*` by the app. The button's ring comes from the
 * package's sheet and the shadow from the app's, and the two still compose. Tab to each one.
 */
export const OnComponents: Story = {
  render: () => ({
    components: { Button },
    setup: () => ({
      buttons: [
        { variant: 'primary', shadow: 'shadow-md' },
        { variant: 'secondary', shadow: 'shadow-md' },
        { variant: 'outline', shadow: 'shadow-sm' },
      ],
    }),
    template: `
      <div class="flex flex-wrap items-center gap-6 p-6">
        <Button v-for="b in buttons" :key="b.variant" :variant="b.variant" :class="b.shadow">
          {{ b.variant }} + {{ b.shadow }}
        </Button>
      </div>
    `,
  }),
};
