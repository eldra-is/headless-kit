import type { Meta, StoryObj } from '@storybook/vue3-vite';
import TablerIcon from './TablerIcon.vue';

const meta = {
  title: 'Foundations/TablerIcon',
  component: TablerIcon,
  args: { name: 'IconCashRegister', size: 'md' },
  argTypes: {
    name: { control: 'text' },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg', 'xl'] },
    strokeWidth: { control: { type: 'number', step: 0.25 } },
    label: { control: 'text' },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Any Tabler icon by the name a `tabler-icon` CMS field holds: the export name Studio stores ' +
          '(`IconCashRegister`) or the kebab-case name (`cash-register`). `Icon`’s sizes, stroke and ' +
          'ARIA; only the icons a page draws are loaded. An unknown name keeps an empty box and warns once.',
      },
    },
  },
} satisfies Meta<typeof TablerIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The value Studio's picker stores. */
export const Default: Story = {};

/** Tabler's kebab-case name draws the same icon. */
export const KebabCaseName: Story = { args: { name: 'cash-register' } };

/** A filled icon is filled in the current colour, with no stroke. */
export const Filled: Story = { args: { name: 'IconHeartFilled', size: 'lg' } };

/** Every size beside the others. */
export const AllSizes: Story = {
  render: (args) => ({
    components: { TablerIcon },
    setup: () => ({ args, sizes: ['sm', 'md', 'lg', 'xl'] as const }),
    template: `
      <div class="flex items-end gap-4">
        <TablerIcon v-for="size in sizes" :key="size" :name="args.name" :size="size" />
      </div>
    `,
  }),
};

/** A site's own stroke weight. */
export const StrokeWidth: Story = { args: { name: 'IconCalendar', size: 'xl', strokeWidth: 1.25 } };

/** An icon that carries meaning nothing else on screen carries. */
export const Labelled: Story = { args: { name: 'IconTrash', label: 'Delete', size: 'lg' } };

/** A name Tabler does not have keeps its box, so nothing around it moves. */
export const UnknownName: Story = {
  render: () => ({
    components: { TablerIcon },
    template: `
      <p class="text-body flex items-center gap-2">
        <TablerIcon name="IconNoSuchIcon" class="border border-dashed border-border" />
        <span>An unknown name renders an empty box</span>
      </p>
    `,
  }),
};

/** The kind of row a CMS feature list renders, each icon an editor's pick. */
export const FromContent: Story = {
  render: () => ({
    components: { TablerIcon },
    setup: () => ({
      items: [
        ['IconCashRegister', 'Point of sale'],
        ['calendar', 'Bookings'],
        ['IconFileInvoice', 'Invoices'],
        ['truck', 'Shipping'],
        ['IconChartBar', 'Reports'],
        ['users-group', 'Customers'],
      ],
    }),
    template: `
      <ul class="text-body grid gap-3">
        <li v-for="[name, text] in items" :key="name" class="flex items-center gap-2">
          <TablerIcon :name="name" size="lg" />
          <span>{{ text }}</span>
        </li>
      </ul>
    `,
  }),
};
