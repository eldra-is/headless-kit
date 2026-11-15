import { IconMapPin } from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Button from '../button/Button.vue';
import Link from '../link/Link.vue';
import Notice from './Notice.vue';

/**
 * One story per state. `Notice` is not in design spec 1 (README, "Additions beyond the spec");
 * its states are the ones its own README entry lists.
 */
const meta = {
  title: 'Feedback/Notice',
  component: Notice,
  tags: ['autodocs'],
  args: { text: 'Orders placed before 14:00 are sent the same day.' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['info', 'success', 'warning', 'danger'] },
    title: { control: 'text' },
    text: { control: 'text' },
    announce: { control: 'boolean' },
    headingLevel: { control: 'inline-radio', options: [undefined, 2, 3, 4, 5, 6] },
    icon: { table: { disable: true } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A message that stays in the page flow: guidance beside a form, or the outcome of',
          'something the visitor did. It has no close button and never moves focus. For a message',
          'that comes and goes on its own use `Toast`; for an empty or failed page region use',
          '`EmptyState`; for an error on one field use `FieldWrapper`.',
          '',
          '**Parts** (`data-part`; every one but `root` is a `classes` key): `root`, `icon`,',
          '`content`, `title`, `text`, `actions`.',
          '',
          '**Slots**: `default` (the body, overrides `text`), `title` (overrides `title`),',
          '`actions` (a row of buttons or links under the body).',
          '',
          '**Tones**: `info` (default), `success`, `warning`, `danger`, also on the root as',
          '`data-tone`. Each has its own icon, so colour is never the only signal; `icon` replaces',
          'it and `icon: null` removes it.',
          '',
          '**Live region.** `info`, `success` and `warning` are `role="status"` (announced',
          'politely); `danger` is `role="alert"` (announced at once). Set `announce` to `false`',
          'for a notice inside an element that is already a live region, or one that is plain page',
          'content from the first render.',
          '',
          '**`headingLevel`** renders the title as a heading; without it the title is a `<p>`.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Notice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Information, body only: the default tone, the default icon. */
export const Info: Story = {};

export const Success: Story = {
  args: { tone: 'success', title: 'Changes saved', text: 'Your address book is up to date.' },
};

export const Warning: Story = {
  args: {
    tone: 'warning',
    title: 'Two items are low in stock',
    text: 'Order soon to be sure of getting them.',
  },
};

/** `role="alert"`: the only tone announced assertively. */
export const Danger: Story = {
  args: {
    tone: 'danger',
    title: 'We could not save your changes',
    text: 'Check your connection and try again.',
  },
};

/** A title above the body. */
export const WithTitle: Story = {
  name: 'With title',
  args: { title: 'Same-day dispatch' },
};

/** `icon: null`: text only. */
export const NoIcon: Story = {
  name: 'No icon',
  args: { icon: null },
};

/** A caller's own icon in place of the tone's. */
export const CustomIcon: Story = {
  name: 'Custom icon',
  args: {
    icon: IconMapPin,
    title: 'Harbour Street studio',
    text: 'Open weekdays from 10:00 to 18:00.',
  },
};

/** A body with a link, through the default slot. */
export const RichBody: Story = {
  name: 'Rich body',
  render: (args) => ({
    components: { Notice, Link },
    setup: () => ({ args }),
    template: `
      <Notice v-bind="args">
        Prices include tax. See <Link href="#">how delivery costs are worked out</Link>.
      </Notice>
    `,
  }),
};

/** A heading title and an action under the body. */
export const WithActions: Story = {
  name: 'With actions',
  args: { tone: 'success', title: 'Thank you for your message', headingLevel: 2 },
  render: (args) => ({
    components: { Notice, Button },
    setup: () => ({ args }),
    template: `
      <Notice v-bind="args" text="We reply within two working days.">
        <template #actions>
          <Button variant="primary" size="sm" label="Back to the shop" />
          <Button variant="ghost" size="sm" label="Send another" />
        </template>
      </Notice>
    `,
  }),
};

/** `announce: false`: no role, for a notice inside another live region or static page content. */
export const NotAnnounced: Story = {
  name: 'Not announced',
  args: { announce: false },
};

/** All four tones, to compare. */
export const Tones: Story = {
  render: () => ({
    components: { Notice },
    template: `
      <div class="flex flex-col gap-3">
        <Notice :announce="false" title="Information" text="Neutral guidance beside a form." />
        <Notice :announce="false" tone="success" title="Success" text="Something went as intended." />
        <Notice :announce="false" tone="warning" title="Warning" text="Something needs attention soon." />
        <Notice :announce="false" tone="danger" title="Danger" text="Something failed." />
      </div>
    `,
  }),
};

/** Twice the usual length: the text wraps and the icon stays on the first line. */
export const LongContent: Story = {
  name: 'Long content',
  args: {
    tone: 'warning',
    title:
      'Deliveries to the highlands and the westfjords are taking longer than usual this month because of road closures',
    text: 'We send every order as soon as the roads open again and email you a tracking link when it leaves the warehouse. If you would rather collect your order from the studio, reply to your confirmation email and we will hold it for you for up to fourteen days.',
  },
};

/** In a 20rem container. */
export const NarrowContainer: Story = {
  name: 'Narrow container',
  args: { tone: 'success', title: 'Changes saved', text: 'Your address book is up to date.' },
  render: (args) => ({
    components: { Notice },
    setup: () => ({ args }),
    template: `<div style="width: 20rem"><Notice v-bind="args" /></div>`,
  }),
};

/** With forced colours the tint goes and the border and icon carry the notice. */
export const ForcedColors: Story = {
  name: 'Forced colours',
  parameters: { eldra: { forcedColors: true } },
  args: { tone: 'danger', title: 'We could not save your changes', text: 'Try again.' },
};
