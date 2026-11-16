import type { Meta, StoryObj } from '@storybook/vue3-vite';
import StepIndicator from './StepIndicator.vue';

const STEPS = [
  { label: 'Received', description: '3 Mar' },
  { label: 'In review', description: '4 Mar' },
  { label: 'Approved' },
  { label: 'Published' },
];

/**
 * One story per state. `StepIndicator` is not in design spec 1 (README, "Additions beyond the
 * spec"); its states are the ones its own README entry lists.
 */
const meta = {
  title: 'Feedback/StepIndicator',
  component: StepIndicator,
  tags: ['autodocs'],
  args: { steps: STEPS, current: 1 },
  // Attributes reach the `<ol>`: every story names the list, as a page would.
  render: (args) => ({
    components: { StepIndicator },
    setup: () => ({ args }),
    template: `<StepIndicator v-bind="args" aria-label="Progress" />`,
  }),
  argTypes: {
    orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] },
    current: { control: { type: 'number', min: -1, max: 4 } },
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'An ordered list showing how far something has come. It only reports: no step is a link',
          'or a button and nothing in it takes focus. For steps a visitor moves between use',
          '`Tabs`; for a trail of pages use `Breadcrumb`.',
          '',
          '**Parts** (`data-part`; every one but `root` is a `classes` key): `root` (the `<ol>`),',
          '`step`, `marker`, `content`, `label`, `labelIcon`, `status`, `description`.',
          '',
          '**`current`** is the index of the current step, from 0. Steps before it are done, steps',
          'after it are upcoming; `steps.length` marks every step done, a negative number marks',
          'every step upcoming. Each step carries its state as `data-state`.',
          '',
          '**Naming it.** Attributes reach the `<ol>`, so name the list with `aria-label` or',
          '`aria-labelledby` ("Order progress").',
          '',
          '**What a screen reader hears.** The list, its length and each position; the current',
          'step through `aria-current="step"`; "(completed)" or "(not started)" after the other',
          'labels (`messages.stepCompleted`, `messages.stepNotStarted`). The check mark, the bold',
          'current label and the muted upcoming labels say the same to the eye, so no state rests',
          'on colour alone.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof StepIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Horizontal, the second of four steps current. */
export const Horizontal: Story = {};

export const Vertical: Story = { args: { orientation: 'vertical' } };

/** The first step current: nothing done yet. */
export const FirstStep: Story = { name: 'First step', args: { current: 0 } };

/** The last step current. */
export const LastStep: Story = {
  name: 'Last step',
  args: {
    current: 3,
    steps: STEPS.map((step, index) => ({ ...step, description: `${3 + index} Mar` })),
  },
};

/** `current` equal to `steps.length`: every step done, none current. */
export const AllDone: Story = {
  name: 'All done',
  args: {
    current: 4,
    steps: STEPS.map((step, index) => ({ ...step, description: `${3 + index} Mar` })),
  },
};

/** A negative `current`: every step upcoming. */
export const NotStarted: Story = { name: 'Not started', args: { current: -1 } };

/** No secondary lines. */
export const NoDescriptions: Story = {
  name: 'No descriptions',
  args: { steps: STEPS.map(({ label }) => ({ label })) },
};

/** Vertical, every state at once, with secondary lines. */
export const VerticalAllStates: Story = {
  name: 'Vertical, all states',
  args: { orientation: 'vertical', current: 2 },
};

const LONG_STEPS = [
  { label: 'Application received and logged', description: 'Monday 3 March 2025 at 09:14' },
  { label: 'Under review by the selection committee', description: 'Tuesday 4 March 2025' },
  { label: 'Approved, waiting for a publication date' },
  { label: 'Published on the website and in the newsletter' },
];

/** Twice the usual length: each label wraps inside its own column. */
export const LongContent: Story = { name: 'Long content', args: { steps: LONG_STEPS } };

/** Horizontal in a 20rem container: the columns shrink and the labels wrap. */
export const NarrowContainer: Story = {
  name: 'Narrow container',
  render: (args) => ({
    components: { StepIndicator },
    setup: () => ({ args }),
    template: `<div style="width: 20rem"><StepIndicator v-bind="args" aria-label="Progress" /></div>`,
  }),
};

/** Vertical in a 20rem container, long content: the form to use on a phone. */
export const NarrowContainerVertical: Story = {
  name: 'Narrow container, vertical',
  args: { orientation: 'vertical', steps: LONG_STEPS },
  render: (args) => ({
    components: { StepIndicator },
    setup: () => ({ args }),
    template: `<div style="width: 20rem"><StepIndicator v-bind="args" aria-label="Progress" /></div>`,
  }),
};

/** With forced colours the fills go; the check mark, the weight and the marker borders stay. */
export const ForcedColors: Story = {
  name: 'Forced colours',
  parameters: { eldra: { forcedColors: true } },
  render: (args) => ({
    components: { StepIndicator },
    setup: () => ({ args }),
    template: `
      <div class="flex flex-col gap-8">
        <StepIndicator v-bind="args" aria-label="Progress" />
        <StepIndicator v-bind="args" orientation="vertical" aria-label="Progress, vertical" />
      </div>
    `,
  }),
};
