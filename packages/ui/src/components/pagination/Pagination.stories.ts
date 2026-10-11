import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import Pagination from './Pagination.vue';

/**
 * One story per state of the design spec's Pagination section, named after the state it shows.
 * `eldra-starter-spec/images/core/pagination.png` is the review target; `scripts/screenshots.mjs`
 * compares each against the committed baseline in `__screenshots__/`, at both 1280 and 360 —
 * which is also what makes the plain `Default` story demonstrate the responsive rule with no
 * story-specific wrapper: at 1280 the pagination's own width comfortably clears the 48rem
 * `@container` edge and the numbered form shows; at 360 (22.5rem) it does not, and the compact
 * form shows instead. `Narrow` below forces the same edge explicitly, independent of the capture
 * width.
 */
const meta = {
  title: 'Navigation/Pagination',
  component: Pagination,
  tags: ['autodocs'],
  args: {
    page: 6,
    totalPages: 12,
    hrefForPage: (page: number) => `?page=${page}`,
  },
  argTypes: {
    classes: { table: { disable: true } },
    hrefForPage: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'Numbered links with previous/next, collapsing to "…" past `siblings` pages on each',
          'side of the current one; first and last always show. Renders nothing at all with a',
          'single page.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `list`, `item`,',
          '`page`, `current`, `ellipsis`, `prev` and `next`.',
          '',
          '**Real links by default, buttons as the fallback.** With `hrefForPage` (page → URL),',
          'every control renders as a real `<a href>` — crawlable, opens in a new tab, `rel="prev"`',
          '/`rel="next"` on the ends. Without it, the same controls render as `<button',
          'type="button">` and the component emits `update:page` instead, for state-only paging',
          'with no URL to build.',
          '',
          '**Numbered and compact are driven by the same data**, and both render at once: the',
          'numbered `<ul>` and the compact row are two sibling elements inside one `<nav>`, and a',
          '`@container` query on the root — not the viewport — switches which one is visible,',
          "from 48rem of the pagination's *own* width. `compact` forces the compact form on",
          'regardless of width, in which case the numbered list is not rendered at all.',
          '',
          '**Disabled ends are inert, not just styled.** At either end, `prev`/`next` render as a',
          'plain, non-focusable `<span aria-disabled="true">` rather than a dead link or button —',
          'so `Tab` skips straight past it.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A middle page of twelve: the spec's own "1 … 5 [6] 7 … 12" example. */
export const Default: Story = {};

/** Many more pages: the window still shows only the current ±1 plus the ends. */
export const ManyPages: Story = {
  args: { page: 42, totalPages: 250 },
};

/** Forced compact, regardless of the capture width: "Page 6 of 12" between two outline arrows. */
export const Compact: Story = {
  args: { compact: true },
};

/** At the first page: previous is disabled (an inert span), next is not. */
export const FirstPage: Story = {
  args: { page: 1, totalPages: 12 },
};

/** At the last page: next is disabled, previous is not. */
export const LastPage: Story = {
  args: { page: 12, totalPages: 12 },
};

/** A 20rem host, well under the 48rem edge: the compact form shows regardless of the capture
 *  width, proving the rule is measured on the pagination's own container, not the viewport. */
export const Narrow: Story = {
  render: (args) => ({
    components: { Pagination },
    setup: () => ({ args }),
    template: `
      <div class="border-border w-80 border p-4">
        <Pagination v-bind="args" />
      </div>
    `,
  }),
};

/**
 * State-only paging with no URL: `hrefForPage` is omitted, so every control is a native button
 * emitting `update:page` — a two-way `v-model:page`-style demo, not one of the task's required
 * screenshot states, but useful in Storybook's own interactive canvas.
 */
export const ButtonMode: Story = {
  args: { hrefForPage: undefined },
  render: (args) => ({
    components: { Pagination },
    setup: () => {
      const page = ref(args.page ?? 1);
      return { args, page };
    },
    template: `<Pagination v-bind="args" :page="page" @update:page="page = $event" />`,
  }),
};

/**
 * Forced colours. Captured with `forcedColors: 'active'`: the current page's fill is a Canvas/
 * CanvasText-respecting system colour, and the compact arrows' outline stays a real border so
 * selection and the touch targets both read without relying on colour alone.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Pagination },
    setup: () => ({
      numberedPage: ref(6),
      compactPage: ref(6),
    }),
    template: `
      <div class="flex flex-col gap-8">
        <Pagination :page="numberedPage" :total-pages="12" :href-for-page="(n) => \`?page=\${n}\`" />
        <Pagination :page="compactPage" :total-pages="12" compact :href-for-page="(n) => \`?page=\${n}\`" />
      </div>
    `,
  }),
};
