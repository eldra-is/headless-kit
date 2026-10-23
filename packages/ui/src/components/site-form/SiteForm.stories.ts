import type { EldraFormDefinition, EldraFormSubmitResult } from '@eldrajs/sdk';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { isIS } from '../../messages/is-IS';
import SiteForm from './SiteForm.vue';
import type { SiteFormClient } from './types';

type Answer = 'ok' | 'pending' | 'refused' | 'rate-limited' | 'too-large' | 'network';

function storyClient(answer: Answer, definition?: EldraFormDefinition): SiteFormClient {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  return {
    forms: {
      async get() {
        await wait(800);
        if (!definition) throw Object.assign(new Error('not found'), { status: 404 });
        return definition;
      },
      async submit(): Promise<EldraFormSubmitResult> {
        await wait(600);
        if (answer === 'ok' || answer === 'pending') {
          return { status: 'ok', pending: answer === 'pending' };
        }
        if (answer === 'refused') {
          return {
            status: 'invalid',
            errors: { email: ['Enter a valid email address.'] },
            form: ['The spam check failed. Try again.'],
          };
        }
        if (answer === 'network') throw new TypeError('Failed to fetch');
        throw Object.assign(new Error('refused'), {
          status: answer === 'rate-limited' ? 429 : 413,
        });
      },
    },
  };
}

const CONTACT: EldraFormDefinition = {
  key: 'contact',
  name: 'Contact',
  fields: [
    { id: 'name', type: 'text', required: true, label: { 'en-US': 'Name', 'is-IS': 'Nafn' } },
    {
      id: 'company',
      type: 'text',
      required: false,
      label: { 'en-US': 'Company', 'is-IS': 'Fyrirtæki' },
    },
    {
      id: 'email',
      type: 'email',
      required: true,
      label: { 'en-US': 'Email', 'is-IS': 'Netfang' },
    },
    {
      id: 'note',
      type: 'textarea',
      required: false,
      label: { 'en-US': 'What would you like to talk about?', 'is-IS': 'Um hvað viltu ræða?' },
    },
  ],
  honeypotField: 'website',
  turnstileSiteKey: null,
  success: {
    message: {
      'en-US': 'Thanks. We will get back to you and find a time.',
      'is-IS': 'Takk. Við höfum samband og finnum tíma.',
    },
  },
  kinds: ['store', 'notify'],
};

const EVERY_TYPE: EldraFormDefinition = {
  ...CONTACT,
  key: 'booking',
  name: 'Booking request',
  fields: [
    { id: 'name', type: 'text', required: true, label: { 'en-US': 'Name' } },
    { id: 'email', type: 'email', required: true, label: { 'en-US': 'Email' } },
    { id: 'phone', type: 'phone', required: false, label: { 'en-US': 'Phone' } },
    { id: 'guests', type: 'number', required: true, label: { 'en-US': 'Guests' } },
    { id: 'site', type: 'url', required: false, label: { 'en-US': 'Company website' } },
    {
      id: 'room',
      type: 'select',
      required: true,
      label: { 'en-US': 'Room' },
      placeholder: { 'en-US': 'Choose a room' },
      options: [
        { value: 'studio', label: { 'en-US': 'The studio' } },
        { value: 'loft', label: { 'en-US': 'The loft' } },
      ],
    },
    {
      id: 'note',
      type: 'textarea',
      required: false,
      label: { 'en-US': 'Anything we should know?' },
      validation: { maxLength: 300 },
    },
    { id: 'news', type: 'checkbox', required: false, label: { 'en-US': 'Send me news' } },
    {
      id: 'terms',
      type: 'consent',
      required: true,
      label: { 'en-US': 'I accept the booking terms' },
    },
  ],
};

const NEWSLETTER: EldraFormDefinition = {
  key: 'newsletter',
  name: 'Newsletter',
  fields: [
    {
      id: 'email',
      type: 'email',
      required: true,
      label: { 'en-US': 'Email' },
      placeholder: { 'en-US': 'you@example.com' },
    },
  ],
  honeypotField: 'website',
  turnstileSiteKey: null,
  success: { message: {} },
  kinds: ['store', 'subscribe'],
  consentText: {
    'en-US': 'I want to receive the newsletter from Northwind. I can unsubscribe at any time.',
  },
};

const meta = {
  title: 'Forms/SiteForm',
  component: SiteForm,
  tags: ['autodocs'],
  argTypes: {
    client: { table: { disable: true } },
    classes: { table: { disable: true } },
    messages: { table: { disable: true } },
    navigate: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'Any form built in Studio, drawn from its public definition and submitted through',
          "`@eldrajs/sdk`'s `client.forms`. Each story's fake client answers a submission the way",
          'its name says, after a short wait, so the busy button, the field messages, the error',
          'summary and the success panel can all be tried here. See the README, "Site forms".',
        ].join('\n'),
      },
    },
  },
  render: (args) => ({
    components: { SiteForm },
    setup: () => ({ args }),
    template: '<div class="max-w-narrow"><SiteForm v-bind="args" /></div>',
  }),
} satisfies Meta<typeof SiteForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A contact form: two required fields, two optional ones. Sends successfully. */
export const Contact: Story = {
  args: { definition: CONTACT, client: storyClient('ok'), locale: 'en-US', pagePath: '/contact' },
};

/** Every field type, in two columns from a 36rem container. */
export const EveryFieldType: Story = {
  args: {
    definition: EVERY_TYPE,
    client: storyClient('ok'),
    locale: 'en-US',
    pagePath: '/book',
    layout: 'two',
    heading: 'Book a room',
  },
  render: (args) => ({
    components: { SiteForm },
    setup: () => ({ args }),
    template: '<div class="max-w-content"><SiteForm v-bind="args" /></div>',
  }),
};

/** A sign-up on one row, with the consent sentence a subscribing form carries. Answers `pending`. */
export const Newsletter: Story = {
  args: {
    definition: NEWSLETTER,
    client: storyClient('pending'),
    locale: 'en-US',
    pagePath: '/',
    layout: 'inline',
    submitLabel: 'Subscribe',
  },
};

/** The platform refuses the submission with a field message and a form message. */
export const Refused: Story = {
  args: { ...Contact.args, client: storyClient('refused') },
};

/** The platform answers `429`. */
export const RateLimited: Story = {
  args: { ...Contact.args, client: storyClient('rate-limited') },
};

/** The network fails. */
export const Offline: Story = {
  args: { ...Contact.args, client: storyClient('network') },
};

/** The same form for an Icelandic visitor, with the Icelandic message set. */
export const Icelandic: Story = {
  args: { ...Contact.args, locale: 'is-IS', messages: isIS },
};

/** Only a key: the definition is read in the browser. */
export const ReadByKey: Story = {
  args: { formKey: 'contact', client: storyClient('ok', CONTACT), locale: 'en-US', pagePath: '/' },
};

/** A key the platform does not know. */
export const UnknownKey: Story = {
  args: { formKey: 'missing', client: storyClient('ok'), locale: 'en-US', pagePath: '/' },
};
