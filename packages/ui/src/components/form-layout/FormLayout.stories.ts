import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import Button from '../button/Button.vue';
import FieldWrapper from '../field-wrapper/FieldWrapper.vue';
import Input from '../input/Input.vue';
import Link from '../link/Link.vue';
import Textarea from '../textarea/Textarea.vue';
import FormLayout from './FormLayout.vue';

/**
 * One story per variant and state of the design spec's Form layout section, named after what it
 * shows. `eldra-starter-spec/images/core/form-layout.png` is the review target for all of them;
 * `scripts/screenshots.mjs` compares each against the committed baseline in `__screenshots__/`.
 */
const meta = {
  title: 'Forms/FormLayout',
  component: FormLayout,
  tags: ['autodocs'],
  argTypes: {
    classes: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'Arranges `FieldWrapper`s into a single column, a responsive two-column grid or an inline',
          'row, and closes the form with a row of actions. It is a real `<form novalidate>`, so it',
          'still posts with `action` and `method` when scripting fails.',
          '',
          '**Parts** (`data-part`, and the keys of the `classes` prop): `root`, `heading`, `fields`,',
          '`actions`. **Slots**: `default` (the fields) and `actions`.',
          '',
          '**Name**: `heading` renders a visible title and names the form through `aria-labelledby`;',
          '`ariaLabel` names a form with no visible title (the newsletter). A visible heading always',
          'wins, so the accessible name never disagrees with what is on the screen. `headingLevel`',
          '(2, 3 or 4; default 2) picks the element — "h4" in the spec names the *type style*, not',
          'the outline level, so a form nested under a page\'s own `<h3>` says `heading-level="4"`.',
          '',
          '**Two columns are a container query, not a media query**: the pairs appear from a **36rem',
          'container** and stack below it, measured on the form itself — so a form in a narrow',
          'page-builder column behaves like a form on a narrow phone, which is the point. `full` on',
          'a `FieldWrapper` spans both columns (the address line, a checkbox, a sub-heading), and',
          'the actions row always spans them because it is a row of the form, not of the grid.',
          '',
          '**The inline row**: the field *is* the row. A `FieldWrapper` in an inline form flattens',
          '(`display: contents`) so its label-and-control group is the growing flex item (`flex: 1 1',
          '14rem`) sitting level with the button, and its error and foot row wrap onto full-width',
          'rows below both — without moving anything in the DOM or the tab order. So an inline form',
          'holds one `FieldWrapper` and one button, which is what the spec uses it for, and',
          '`classes.fields` has no box to style there.',
          '',
          '**The actions row**: the primary action is **last in the DOM** and sits at the end on',
          'wide layouts. Below 36rem the row reverses visually (`flex-col-reverse`) so the primary',
          'is on top and every button fills the width — the reading and tab order stays the DOM',
          'order. A tertiary back link comes first and pushes itself to the start of a wide row (it',
          "is the only `<a>` the spec's actions row holds), so the row reads as space-between with a",
          'back link and end-aligned without one, and there is nothing for you to remember.',
          '',
          '**Submitting**: `submitting` provides `FORM_SUBMITTING_KEY`, which every `Button` below',
          'injects — the `type="submit"` button becomes `loading` (`aria-busy="true"`, spinner, its',
          'width kept) and every other action becomes `disabled`, so a second action cannot start',
          'mid-submit. The fields stay editable.',
          '',
          '**It is a `@container`**, which is also what lets the md Buttons inside it grow to the',
          '2.75rem touch target when the *form* is narrower than 48rem rather than when the page is.',
          '',
          '**Submitting is guarded**: on `submit` the form asks the DOM which fields are invalid',
          '(`[aria-invalid="true"]`, which every control in this package sets from its field\'s',
          '`error`), so the accessibility state and the validity state cannot drift apart. If any',
          'field is invalid the submit is stopped, focus moves to the first one, and **`invalid`**',
          'fires with their ids — which is what an error summary links to. Otherwise **`submit`**',
          "fires with `{ event, data }`, where `data` is the form's own `FormData`, and the default",
          'is deliberately not prevented: a form with an `action` still posts without scripting.',
          'Call `preventDefault()` in your own handler for a scripted form. `novalidate` is on by',
          'default so the messages are the components own, consistent and translated ones rather',
          'than the browser bubbles.',
          '',
          "**Error summary**: fill the `errorSummary` slot and the form draws the spec's alert box",
          'above the fields (`surface` fill, 1px `danger` border, `danger` icon) around your list of',
          'links to the failed fields. It renders only when the slot is given; the links are yours,',
          'because only you know which fields failed.',
          '',
          '**Success**: `statusMessage` feeds a polite `role="status"` region that is always in the',
          'DOM and always visually hidden, so a confirmation set after a successful submit is',
          "announced without moving focus. The *visible* confirmation is still the page's job —",
          'replace the form, or navigate.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof FormLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Single column: contact, login, account details. 28–40rem is the recommended width. */
export const Single: Story = {
  args: { heading: 'Ask the studio' },
  render: (args) => ({
    components: { FormLayout, FieldWrapper, Input, Textarea, Button },
    setup: () => ({ args, name: ref(''), email: ref(''), message: ref('') }),
    template: `
      <div class="max-w-narrow">
        <FormLayout v-bind="args">
          <FieldWrapper label="Name" required><Input v-model="name" autocomplete="name" /></FieldWrapper>
          <FieldWrapper label="Email address" required><Input v-model="email" type="email" autocomplete="email" /></FieldWrapper>
          <FieldWrapper label="Message" required>
            <Textarea v-model="message" placeholder="Questions about sizing, glazes or a wholesale order" />
          </FieldWrapper>
          <template #actions>
            <Button variant="primary" type="submit" label="Sending your message">Send message</Button>
          </template>
        </FormLayout>
      </div>
    `,
  }),
};

/**
 * Two columns: addresses and checkout details. The address line spans both columns with `full`,
 * the postcode shows an error, and the actions row carries a back link, a secondary and the
 * primary last.
 */
export const TwoColumn: Story = {
  args: { layout: 'two', heading: 'Shipping address' },
  render: (args) => ({
    components: { FormLayout, FieldWrapper, Input, Button, Link },
    setup: () => ({
      args,
      first: ref('Maren'),
      last: ref('Holt'),
      address: ref('14 Harbour Lane'),
      town: ref('Bristol'),
      postcode: ref('BS1 4X'),
    }),
    template: `
      <div class="max-w-3xl">
        <FormLayout v-bind="args">
          <FieldWrapper label="First name" required><Input v-model="first" autocomplete="given-name" /></FieldWrapper>
          <FieldWrapper label="Last name" required><Input v-model="last" autocomplete="family-name" /></FieldWrapper>
          <FieldWrapper label="Address" required full><Input v-model="address" autocomplete="address-line1" /></FieldWrapper>
          <FieldWrapper label="Town or city" required><Input v-model="town" autocomplete="address-level2" /></FieldWrapper>
          <FieldWrapper label="Postcode" required error="Enter a full postcode.">
            <Input v-model="postcode" autocomplete="postal-code" />
          </FieldWrapper>
          <template #actions>
            <Link href="/basket" variant="standalone">Return to basket</Link>
            <Button variant="outline">Save for later</Button>
            <Button variant="primary" type="submit" label="Continuing to shipping">Continue to shipping</Button>
          </template>
        </FormLayout>
      </div>
    `,
  }),
};

/** Inline: one field and one button — newsletter, promo code, postcode lookup. Shown valid and invalid. */
export const Inline: Story = {
  args: { layout: 'inline', ariaLabel: 'Newsletter sign-up' },
  render: (args) => ({
    components: { FormLayout, FieldWrapper, Input, Button },
    setup: () => ({ args, email: ref(''), invalidEmail: ref('maren@example') }),
    template: `
      <div class="flex max-w-narrow flex-col gap-8">
        <FormLayout v-bind="args">
          <FieldWrapper
            label="Email address"
            help="One letter a month: new glazes, restocks and studio notes. Unsubscribe anytime."
          >
            <Input v-model="email" type="email" placeholder="you@example.com" autocomplete="email" />
          </FieldWrapper>
          <template #actions>
            <Button variant="primary" type="submit" label="Subscribing">Subscribe</Button>
          </template>
        </FormLayout>

        <FormLayout layout="inline" aria-label="Newsletter sign-up, with an error">
          <FieldWrapper label="Email address" error="Enter an email like name@example.com.">
            <Input v-model="invalidEmail" type="email" autocomplete="email" />
          </FieldWrapper>
          <template #actions>
            <Button variant="primary" type="submit" label="Subscribing">Subscribe</Button>
          </template>
        </FormLayout>
      </div>
    `,
  }),
};

/** Submitting: the primary action is busy with its spinner, every other action is disabled, the fields stay editable. */
export const Submitting: Story = {
  args: { layout: 'two', heading: 'Shipping address', submitting: true },
  render: (args) => ({
    components: { FormLayout, FieldWrapper, Input, Button, Link },
    setup: () => ({
      args,
      first: ref('Maren'),
      last: ref('Holt'),
      address: ref('14 Harbour Lane'),
    }),
    template: `
      <div class="max-w-3xl">
        <FormLayout v-bind="args">
          <FieldWrapper label="First name" required><Input v-model="first" autocomplete="given-name" /></FieldWrapper>
          <FieldWrapper label="Last name" required><Input v-model="last" autocomplete="family-name" /></FieldWrapper>
          <FieldWrapper label="Address" required full><Input v-model="address" autocomplete="address-line1" /></FieldWrapper>
          <template #actions>
            <Link href="/basket" variant="standalone">Return to basket</Link>
            <Button variant="outline">Save for later</Button>
            <Button variant="primary" type="submit" label="Continuing to shipping">Continue to shipping</Button>
          </template>
        </FormLayout>
      </div>
    `,
  }),
};

/**
 * The failed-submit state of a long form: the spec's error summary alert above the fields, each
 * error linked, and every failed field showing its own message.
 */
export const WithErrorSummary: Story = {
  args: { layout: 'two', heading: 'Shipping address' },
  render: (args) => ({
    components: { FormLayout, FieldWrapper, Input, Button },
    setup: () => ({
      args,
      first: ref(''),
      address: ref('14 Harbour Lane'),
      postcode: ref('BS1 4X'),
    }),
    template: `
      <div class="max-w-3xl">
        <FormLayout v-bind="args" status-message="There are 2 problems with this form.">
          <template #errorSummary>
            <p class="font-semibold">There are 2 problems with this form</p>
            <ul class="mt-1 list-disc ps-4">
              <li><a href="#summary-first" class="underline">Enter your first name</a></li>
              <li><a href="#summary-postcode" class="underline">Enter a full postcode</a></li>
            </ul>
          </template>
          <FieldWrapper id="summary-first" label="First name" required error="Enter your first name.">
            <Input v-model="first" autocomplete="given-name" />
          </FieldWrapper>
          <FieldWrapper label="Last name" required><Input model-value="Holt" autocomplete="family-name" /></FieldWrapper>
          <FieldWrapper label="Address" required full><Input v-model="address" autocomplete="address-line1" /></FieldWrapper>
          <FieldWrapper id="summary-postcode" label="Postcode" required error="Enter a full postcode.">
            <Input v-model="postcode" autocomplete="postal-code" />
          </FieldWrapper>
          <template #actions>
            <Button variant="outline">Save for later</Button>
            <Button variant="primary" type="submit" label="Continuing to shipping">Continue to shipping</Button>
          </template>
        </FormLayout>
      </div>
    `,
  }),
};

/**
 * A 22rem container, below the 36rem two-column breakpoint: the pairs stack into one column and
 * the actions go full width with the primary first, without moving in the DOM.
 */
export const Narrow: Story = {
  args: { layout: 'two', heading: 'Shipping address' },
  render: (args) => ({
    components: { FormLayout, FieldWrapper, Input, Button },
    setup: () => ({ args, first: ref('Maren'), last: ref('Holt') }),
    template: `
      <div class="border-border w-88 border p-4">
        <FormLayout v-bind="args">
          <FieldWrapper label="First name" required><Input v-model="first" autocomplete="given-name" /></FieldWrapper>
          <FieldWrapper label="Last name" required><Input v-model="last" autocomplete="family-name" /></FieldWrapper>
          <template #actions>
            <Button variant="outline">Save for later</Button>
            <Button variant="primary" type="submit" label="Continuing to shipping">Continue to shipping</Button>
          </template>
        </FormLayout>
      </div>
    `,
  }),
};
