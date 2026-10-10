import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import Button from '../components/button/Button.vue';
import FieldWrapper from '../components/field-wrapper/FieldWrapper.vue';
import Link from '../components/link/Link.vue';
import FieldCheckbox from './FieldCheckbox.vue';
import FieldInput from './FieldInput.vue';
import FieldSelect from './FieldSelect.vue';
import FieldTextarea from './FieldTextarea.vue';
import Form from './Form.vue';

/**
 * The optional `@eldrajs/ui/vee-validate` entry. One story per shape the design spec's Form layout
 * section draws with a real form behind it: the inline newsletter, the single-column contact form,
 * and a form carrying the server's own field errors.
 */
const meta = {
  title: 'Forms/Form',
  component: Form,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
    validationSchema: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          '`Form` is `FormLayout` with a vee-validate form behind it, from the optional',
          '`@eldrajs/ui/vee-validate` entry. Every `FormLayout` prop passes straight through, so the',
          'layout, the heading, the actions row and the two-column container query are the ones the',
          'agnostic component ships; what this adds is `useForm`, a `submit` that only fires with',
          'valid values, the error summary, and somewhere for a server response to attach to.',
          '',
          '```ts',
          "import { Form, FieldInput } from '@eldrajs/ui/vee-validate';",
          "import { FieldWrapper, Button } from '@eldrajs/ui';",
          '```',
          '',
          '**The `FieldWrapper` pattern.** A `Field*` renders **only** the control — the label, the',
          "help text and the error row are the `FieldWrapper`'s, exactly as they are without",
          "validation. So the message reaches the wrapper through the form's default slot:",
          '',
          '```vue',
          '<Form :validation-schema="schema" @submit="send">',
          '  <template #default="{ errors }">',
          '    <FieldWrapper label="Email address" required :error="errors.email">',
          '      <FieldInput name="email" type="email" autocomplete="email" />',
          '    </FieldWrapper>',
          '  </template>',
          '  <template #actions>',
          '    <Button variant="primary" type="submit">Send</Button>',
          '  </template>',
          '</Form>',
          '```',
          '',
          'Vue refuses a `v-slot` on the component when named slot templates are also children, so the',
          'fields go in an explicit `<template #default="{ errors }">` whenever there is an actions',
          'row — which there almost always is.',
          '',
          "`errors` is keyed by each field's `name`, and it holds only the messages that should",
          '**show**: a field appears there once it has been touched or the form has been submitted.',
          'That is the same gate each `Field*` puts on its own `aria-invalid`, so the wrapper and the',
          'control cannot disagree. The other slot props are `values`, `meta`, `isSubmitting` and',
          '`submitCount`.',
          '',
          '**Three controls draw their own error row** when they stand *outside* a `FieldWrapper` —',
          '`FieldRadioGroup`, `FieldCheckboxGroup` and `FieldQuantityStepper`, the three agnostic',
          'components that own an `error` prop. Inside a wrapper they stay quiet and the wrapper says',
          'it once.',
          '',
          "**`name` and `path`.** `name` is the control's native form field name, and by default the",
          "field's path as well. The one control where the two differ is `FieldVariantPicker`: a",
          '`VariantPicker`\'s `name` is the *visible* option name ("Size", "Colour"), so `path` says',
          'where the value lives — `<FieldVariantPicker name="Size" path="size" />` keeps the legend',
          'reading "Size" while `values.size` holds the choice.',
          '',
          '**Validation.** Either a form-level `validationSchema` (a vee-validate rule map, or a typed',
          'schema through yup / `@vee-validate/zod`) or `rules` on each `Field*`. `label` on a',
          '`Field*` is the name a rule message uses for it, not a visible label.',
          '',
          "**Submit.** `submit` fires with `(values, ctx)` — vee-validate's own submission context, so",
          '`ctx.resetForm()` and `ctx.setErrors()` are to hand — and never with values that failed',
          'validation. A failed attempt emits `invalid` with the messages instead, after focus has',
          'already moved to the first invalid field. `submitting` comes from `isSubmitting`, so the',
          'primary button goes busy and the other actions disable themselves; because `submit` is an',
          'event rather than an awaited handler, bind `submitting` yourself for a request you own.',
          '',
          "**Error summary.** After a failed submit the spec's alert box appears above the fields",
          'with a link to each error (the link text *is* the message; the link points at the',
          "control's own id, which is the one the `FieldWrapper` generated). Fill the `errorSummary`",
          'slot to replace the list — the box, its border and its icon are still drawn for you.',
          '',
          '**Server errors.** `apiErrors` is a `{ [name]: message }` map applied with `setErrors`.',
          'Each entry disappears the moment its own field changes, because a server error is a',
          'statement about the value that was sent. A `Field*` can read the same map through',
          '`API_ERRORS_KEY` outside a `Form`.',
          '',
          "**Success.** `successMessage` is announced in the form's polite live region after a submit",
          'passes validation. It is never visible — replacing the form with a confirmation, or',
          'navigating, is still the page\'s job (spec "Form layout" → States, Success).',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Form>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rule functions, so the stories need no `defineRule` set-up and no rule-string parser. */
const email = (value: unknown) =>
  (typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) ||
  'Enter an email like name@example.com.';

const required = (message: string) => (value: unknown) =>
  (typeof value === 'string' ? value.trim() !== '' : Boolean(value)) || message;

/**
 * The inline newsletter row, validated. One `FieldWrapper`, one `FieldInput`, one button — and the
 * error takes a full-width row below both, which is the inline layout's own geometry.
 */
export const Newsletter: Story = {
  args: { layout: 'inline', ariaLabel: 'Newsletter sign-up' },
  render: (args) => ({
    components: { Form, FieldWrapper, FieldInput, Button },
    setup: () => ({ args, email }),
    template: `
      <div class="max-w-narrow">
        <Form v-bind="args" success-message="Thanks, you're subscribed.">
          <template #default="{ errors }">
          <FieldWrapper
            label="Email address"
            :error="errors.email"
            help="One letter a month: new glazes, restocks and studio notes. Unsubscribe anytime."
          >
            <FieldInput
              name="email"
              :rules="email"
              label="Email address"
              type="email"
              placeholder="you@example.com"
              autocomplete="email"
            />
          </FieldWrapper>
          </template>
          <template #actions>
            <Button variant="primary" type="submit" label="Subscribing">Subscribe</Button>
          </template>
        </Form>
      </div>
    `,
  }),
};

/**
 * The single-column contact form with real `FieldWrapper`s: each one takes its message from the
 * form's `errors` slot prop, so the label, the help text, the required mark and the error row are
 * the agnostic wrapper's, and the `Field*` inside renders only the control.
 */
export const Contact: Story = {
  args: { heading: 'Ask the studio' },
  render: (args) => ({
    components: {
      Form,
      FieldWrapper,
      FieldInput,
      FieldTextarea,
      FieldSelect,
      FieldCheckbox,
      Button,
    },
    setup: () => ({
      args,
      schema: {
        name: required('Enter your name.'),
        email,
        topic: required('Choose what your message is about.'),
        message: required('Write your message.'),
        consent: required('Agree to be contacted so we can reply.'),
      },
      topics: [
        { value: 'order', label: 'An order' },
        { value: 'wholesale', label: 'Wholesale' },
        { value: 'workshops', label: 'Workshops' },
      ],
    }),
    template: `
      <div class="max-w-narrow">
        <Form v-bind="args" :validation-schema="schema">
          <template #default="{ errors }">
          <FieldWrapper label="Name" required :error="errors.name">
            <FieldInput name="name" autocomplete="name" />
          </FieldWrapper>

          <FieldWrapper label="Email address" required :error="errors.email">
            <FieldInput name="email" type="email" autocomplete="email" />
          </FieldWrapper>

          <FieldWrapper label="What is it about?" required :error="errors.topic">
            <FieldSelect name="topic" :options="topics" placeholder="Choose a topic" />
          </FieldWrapper>

          <FieldWrapper label="Message" required :error="errors.message">
            <FieldTextarea
              name="message"
              placeholder="Questions about sizing, glazes or a wholesale order"
            />
          </FieldWrapper>

          <!-- The spec's single-consent shape: \`group\` keeps the sentence beside the box (a
               \`<legend>\` is not a \`<label>\`), and the wrapper still owns the error row. -->
          <FieldWrapper group label="Consent" required :error="errors.consent">
            <FieldCheckbox name="consent">Yes, the studio may email me back</FieldCheckbox>
          </FieldWrapper>
          </template>

          <template #actions>
            <Button variant="primary" type="submit" label="Sending your message">Send message</Button>
          </template>
        </Form>
      </div>
    `,
  }),
};

/**
 * The server answered. `apiErrors` attaches each message to the field it belongs to rather than to
 * a banner over the form, and each one clears the moment its own field changes.
 */
export const ApiErrors: Story = {
  args: { layout: 'two', heading: 'Create your account' },
  render: (args) => ({
    components: { Form, FieldWrapper, FieldInput, Button, Link },
    setup: () => ({
      args,
      apiErrors: ref<Record<string, string>>({
        email: 'That address already has an account.',
        postcode: 'We do not deliver to this postcode yet.',
      }),
      initialValues: {
        first: 'Maren',
        last: 'Holt',
        email: 'maren@example.com',
        postcode: 'BS1 4XE',
      },
    }),
    template: `
      <div class="max-w-3xl">
        <Form
          v-bind="args"
          :api-errors="apiErrors"
          :initial-values="initialValues"
        >
          <template #default="{ errors }">
          <FieldWrapper label="First name" required :error="errors.first">
            <FieldInput name="first" autocomplete="given-name" />
          </FieldWrapper>
          <FieldWrapper label="Last name" required :error="errors.last">
            <FieldInput name="last" autocomplete="family-name" />
          </FieldWrapper>
          <FieldWrapper label="Email address" required full :error="errors.email">
            <FieldInput name="email" type="email" autocomplete="email" />
          </FieldWrapper>
          <FieldWrapper label="Postcode" required :error="errors.postcode">
            <FieldInput name="postcode" autocomplete="postal-code" />
          </FieldWrapper>
          </template>
          <template #actions>
            <Link href="/basket" variant="standalone">Return to basket</Link>
            <Button variant="primary" type="submit" label="Creating your account">Create account</Button>
          </template>
        </Form>
      </div>
    `,
  }),
};
