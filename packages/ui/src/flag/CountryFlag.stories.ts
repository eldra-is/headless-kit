import type { Meta, StoryObj } from '@storybook/vue3-vite';
import CountryFlag from './CountryFlag.vue';

const meta = {
  title: 'Display/CountryFlag',
  component: CountryFlag,
  tags: ['autodocs'],
  args: { country: 'IS' },
  argTypes: { country: { control: 'text' }, label: { control: 'text' } },
  parameters: {
    docs: {
      description: {
        component: [
          'A country’s flag by its two-letter code, from the `@eldrajs/ui/flag` entry. The artwork',
          'is one lazy chunk, fetched when the first flag mounts; until then the flag is an empty',
          'box of the same size. Decorative unless it is given a `label`.',
        ].join(' '),
      },
    },
  },
} satisfies Meta<typeof CountryFlag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Named: Story = { args: { country: 'NO', label: 'Norway' } };

/** Beside the country's name, where it is decorative: a select's row, an address line. */
export const BesideAName: Story = {
  render: () => ({
    components: { CountryFlag },
    template: `
      <ul class="eldra:grid eldra:gap-2 eldra:text-body">
        <li v-for="[code, name] in [['IS', 'Iceland'], ['NO', 'Norway'], ['GB', 'United Kingdom'], ['CA', 'Canada']]" :key="code" class="eldra:flex eldra:items-center eldra:gap-2">
          <CountryFlag :country="code" />{{ name }}
        </li>
      </ul>`,
  }),
};

/** A code with no flag keeps the box, so a list of rows stays aligned. */
export const UnknownCode: Story = { args: { country: 'ZZ' } };
