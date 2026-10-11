import { IconDots, IconDownload, IconPencil, IconTrash } from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { getCurrentInstance, nextTick, onMounted } from 'vue';
import Button from '../button/Button.vue';
import Popover from './Popover.vue';

/**
 * One story per state this addition needs shown, named after the state it shows.
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 *
 * Every story opens on mount: unlike `Select`, whose own stories mostly show the closed control,
 * `Popover` draws nothing of its own to show closed — the trigger is entirely the consumer's
 * markup — so the panel, the whole point of this addition, is what every baseline has to capture.
 * `openOnMount` mirrors `Select.stories.ts`'s own helper exactly: a real pointerdown-then-click on
 * the rendered trigger, so the same code path a shopper's mouse takes is what the screenshot
 * harness's 400ms settle captures, past the entrance animation.
 */
const meta = {
  title: 'Overlays/Popover',
  component: Popover,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A generic, non-modal trigger + floating panel (operator addition beyond design spec 1 —',
          "see the README) for menus, filters and dropdowns: the private component library's own",
          '`Popover`/`Dropdown` equivalent, built on the same `usePopover` machinery `Select`,',
          '`MultiSelect` and `SearchBar` share.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root` (a `display: contents`',
          "wrapper — never a box of its own), `trigger` (not drawn here at all — the consumer's own",
          'element) and `panel` (the floating box).',
          '',
          '**The trigger is wired, not rendered.** The `trigger` slot receives `{ open, toggle,',
          'attrs }` — `attrs` carries `id`, `type: "button"`, `aria-haspopup`, `aria-expanded`,',
          '`aria-controls` and the click handling, for `v-bind="attrs"` onto whatever element you',
          'render (a `<Button>`, a plain `<button>`, an `<a>`). `toggle` is there for a trigger that',
          'wants to open or close without going through `attrs` at all.',
          '',
          '**No default role on the panel.** Unlike `Select`\'s panel — always `role="listbox"`,',
          "because it always is one — a `Popover`'s content could be a menu, a listbox, or a plain",
          'filter form, so the panel renders role-free and forwards its own `$attrs`:',
          '`<Popover role="menu">` puts `role="menu"` on it directly, and `ariaLabel` sets its',
          '`aria-label` for a panel with no visible heading.',
          '',
          '**One open at a time, with `Select`/`MultiSelect`/`SearchBar`** — the same registry, so',
          'opening one closes whichever of the others was open. **Teleported** to `document.body`,',
          "or the open native `<dialog>` the trigger sits in, exactly like `Select`'s panel. `Tab`",
          "walks into the panel from the trigger and back out (`tabRedirect`, always on) — a menu's",
          "rows or a filter form's fields are exactly the real tab stops that exists for. Opening",
          "moves no focus into the panel by default (the private library's own `Popover` makes the",
          'same `focusOnOpen: false` choice); `Esc` and an outside click close it and return focus',
          'to the trigger.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A real pointerdown-then-click on this story's own trigger — see the file's own doc comment. */
function openOnMount(): void {
  const instance = getCurrentInstance();
  onMounted(() => {
    void nextTick(() => {
      const root = instance?.proxy?.$el as Element | null | undefined;
      const trigger = root?.querySelector?.<HTMLElement>('[data-part="trigger"]');
      trigger?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      trigger?.click();
    });
  });
}

/** A short menu of plain links/buttons — every story's own panel content, unless noted. */
const MenuContent = {
  components: { IconDownload, IconPencil, IconTrash },
  template: `
    <div class="flex min-w-40 flex-col p-1">
      <a href="#rename" role="menuitem" class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-body-sm text-text hover:bg-surface-strong">
        <IconPencil class="size-4" /> Rename
      </a>
      <button type="button" role="menuitem" class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-body-sm text-text hover:bg-surface-strong">
        <IconDownload class="size-4" /> Download
      </button>
      <button type="button" role="menuitem" class="flex items-center gap-2 rounded-sm px-2 py-1.5 text-body-sm text-danger hover:bg-surface-strong">
        <IconTrash class="size-4" /> Delete
      </button>
    </div>
  `,
};

/** The default: an icon-only `Button` trigger opening a short menu below it. */
export const Default: Story = {
  render: () => ({
    components: { Popover, Button, MenuContent, IconDots },
    setup: () => {
      openOnMount();
      return { IconDots };
    },
    template: `
      <div class="p-16">
        <Popover role="menu" aria-label="Row actions">
          <template #trigger="{ attrs }">
            <Button variant="ghost" icon-only :icon="IconDots" label="Row actions" v-bind="attrs" />
          </template>
          <template #default>
            <MenuContent />
          </template>
        </Popover>
      </div>
    `,
  }),
};

/** The private library's own case: a menu of `role="menuitem"` rows, `Tab` walking through them. */
export const Menu: Story = {
  render: () => ({
    components: { Popover, Button, MenuContent },
    setup: () => {
      openOnMount();
      return {};
    },
    template: `
      <div class="p-16">
        <Popover role="menu" aria-label="Order actions">
          <template #trigger="{ attrs }">
            <Button variant="outline" v-bind="attrs">Actions</Button>
          </template>
          <template #default>
            <MenuContent />
          </template>
        </Popover>
      </div>
    `,
  }),
};

/** `matchWidth="exact"`: the panel is exactly as wide as the trigger, never wider or narrower. */
export const MatchWidth: Story = {
  render: () => ({
    components: { Popover, Button },
    setup: () => {
      openOnMount();
      return {};
    },
    template: `
      <div class="p-16">
        <Popover match-width="exact" aria-label="Sort by">
          <template #trigger="{ attrs }">
            <Button variant="outline" class="w-56" v-bind="attrs">Sort by: Newest</Button>
          </template>
          <template #default="{ close }">
            <div class="flex flex-col p-1">
              <button
                v-for="label in ['Newest', 'Price: low to high', 'Price: high to low']"
                :key="label"
                type="button"
                class="rounded-sm px-2 py-1.5 text-start text-body-sm text-text hover:bg-surface-strong"
                @click="close"
              >
                {{ label }}
              </button>
            </div>
          </template>
        </Popover>
      </div>
    `,
  }),
};

/** `placement="above"`: always opens upward, the same escape-hatch `Select`'s own footer use takes. */
export const Above: Story = {
  render: () => ({
    components: { Popover, Button, MenuContent },
    setup: () => {
      openOnMount();
      return {};
    },
    template: `
      <div class="bg-surface flex min-h-64 items-end p-4">
        <Popover placement="above" role="menu" aria-label="Row actions">
          <template #trigger="{ attrs }">
            <Button variant="outline" v-bind="attrs">Actions</Button>
          </template>
          <template #default>
            <MenuContent />
          </template>
        </Popover>
      </div>
    `,
  }),
};

/**
 * The panel escapes an ancestor that clips its overflow — a card with `overflow-hidden` shorter
 * than the panel, the same proof `Select`'s own `InClippedCard` story gives for its popup.
 */
export const InClippedCard: Story = {
  render: () => ({
    components: { Popover, Button, MenuContent },
    setup: () => {
      openOnMount();
      return {};
    },
    template: `
      <div class="bg-surface p-4">
        <div class="border-border bg-background h-24 w-72 overflow-hidden rounded-lg border p-4">
          <p class="text-body-sm text-muted mb-2">Product card</p>
          <Popover role="menu" aria-label="Product actions">
            <template #trigger="{ attrs }">
              <Button variant="outline" size="sm" v-bind="attrs">Actions</Button>
            </template>
            <template #default>
              <MenuContent />
            </template>
          </Popover>
        </div>
      </div>
    `,
  }),
};

/** A 20rem container: the panel is teleported, so a narrow ancestor never clips it. */
export const Narrow: Story = {
  render: () => ({
    components: { Popover, Button, MenuContent },
    setup: () => {
      openOnMount();
      return {};
    },
    template: `
      <div class="w-80 border-border border p-4">
        <Popover role="menu" aria-label="Row actions">
          <template #trigger="{ attrs }">
            <Button variant="outline" v-bind="attrs">Actions</Button>
          </template>
          <template #default>
            <MenuContent />
          </template>
        </Popover>
      </div>
    `,
  }),
};

/**
 * Forced colours. `scripts/screenshots.mjs` captures any story whose id ends in `--forced-colors`
 * with Playwright's `forcedColors: 'active'` emulation. Unlike `Select`'s active/selected rows,
 * `Popover` draws no colour-only state of its own — the panel's border and the trigger's focus
 * ring are what this proves stay visible once every fill is replaced by the system palette.
 */
export const ForcedColors: Story = {
  parameters: { eldra: { forcedColors: true } },
  render: () => ({
    components: { Popover, Button, MenuContent },
    setup: () => {
      openOnMount();
      return {};
    },
    template: `
      <div class="p-16">
        <Popover role="menu" aria-label="Row actions">
          <template #trigger="{ attrs }">
            <Button variant="outline" v-bind="attrs">Actions</Button>
          </template>
          <template #default>
            <MenuContent />
          </template>
        </Popover>
      </div>
    `,
  }),
};
