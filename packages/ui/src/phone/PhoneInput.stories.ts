import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { getCurrentInstance, nextTick, onMounted, ref } from 'vue';
import Button from '../components/button/Button.vue';
import FieldWrapper from '../components/field-wrapper/FieldWrapper.vue';
import Input from '../components/input/Input.vue';
import { provideEldraUiLocale } from '../composables/useLocale';
import { provideEldraUiMessages } from '../composables/useMessages';
import isIS from '../messages/is-IS';
import Form from '../vee-validate/Form.vue';
import PhoneInput from './PhoneInput.vue';
import FieldPhoneInput from './vee-validate/FieldPhoneInput.vue';

const HELP = 'Only used if we need to reach you about this order.';

/**
 * One story per state. `PhoneInput` is not in design spec 1 (README, "Additions beyond the spec");
 * its states are the ones its own README entry lists.
 */
const meta = {
  title: 'Forms/PhoneInput',
  component: PhoneInput,
  tags: ['autodocs'],
  args: { defaultCountry: 'IS', preferredCountries: ['IS'] },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    modelValue: { control: 'text' },
    country: { control: 'text' },
    defaultCountry: { control: 'text' },
    disabled: { control: 'boolean' },
    readonly: { control: 'boolean' },
    invalid: { control: 'boolean' },
    classes: { table: { disable: true } },
    messages: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A phone number field with its country inside it, from the optional `@eldrajs/ui/phone`',
          'entry (it needs the `libphonenumber-js` peer). The country button shows a flag and the',
          'dialling code; the number beside it is spaced the way the country writes it, as it is',
          'typed.',
          '',
          '**Value.** `modelValue` is the whole number in E.164 (`+3545812345`), `""` while the',
          'field holds no digit. `v-model:country` follows the country; `change` carries the',
          'number taken apart (`e164`, `country`, `callingCode`, `nationalNumber`, `valid`).',
          '',
          '**Country.** It starts on `defaultCountry`. The button opens a searchable list under',
          'the field: `preferredCountries` first, then every country from A to Z, found by name or',
          'by dialling code. Typing or pasting a number that starts with `+` picks the country by',
          'itself. `countries` limits the list.',
          '',
          '**Parts** (`data-part`; every one but `root` is a `classes` key): `root`, `field`,',
          "`countryButton`, `flag`, `callingCode`, `chevron`, `control`, and the list's `panel`,",
          '`search`, `listbox`, `group`, `groupLabel`, `option`, `optionLabel`, `optionMeta`,',
          '`optionCheck`, `empty`.',
          '',
          '**Slots**: `flag` (`{ country }`), for artwork of your own in the button and the rows.',
          '',
          '**Keyboard.** `Tab` reaches the country button, then the number. On the button,',
          '`Enter`, `Space` or an arrow key opens the list and moves focus to its search field;',
          'arrows move through the countries, `Enter` chooses one and moves focus to the number,',
          '`Escape` clears the search, then closes the list and returns focus to the button.',
          '',
          "**Validation** is the form's: `phoneRule` and `FieldPhoneInput` are in",
          '`@eldrajs/ui/phone/vee-validate`. Give the field a visible label with `FieldWrapper`.',
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof PhoneInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every state story is the field under its label, at the width of a checkout column. The value is
 * held in the story, starting from `modelValue`, so the field can be typed into and its country
 * changed: bound to the bare arg, every edit would be refused.
 */
function field(extra: { error?: string; setup?: (root: () => HTMLElement | null) => void } = {}) {
  return (args: Record<string, unknown>) => ({
    components: { PhoneInput, FieldWrapper },
    setup() {
      const instance = getCurrentInstance();
      extra.setup?.(() => (instance?.proxy?.$el as HTMLElement | null) ?? null);
      const value = ref(typeof args.modelValue === 'string' ? args.modelValue : '');
      return { args, value, HELP, error: extra.error };
    },
    template: `
      <div class="max-w-narrow">
        <FieldWrapper label="Phone number" :help="HELP" :error="error">
          <PhoneInput v-bind="args" v-model="value" />
        </FieldWrapper>
      </div>
    `,
  });
}

/** Opens the country list once mounted, and types `search` into its search field. */
function opened(search = '') {
  return (root: () => HTMLElement | null) => {
    onMounted(async () => {
      root()?.querySelector<HTMLButtonElement>('[data-part="countryButton"]')?.click();
      if (search === '') return;
      await nextTick();
      await nextTick();
      const input = document.querySelector<HTMLInputElement>('[data-part="search"]');
      if (input === null) return;
      input.value = search;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
}

/** Empty: the field starts on the shop's country, with an example number as its placeholder. */
export const Empty: Story = { render: field() };

/** Focused: the whole field takes the focus ring, not the number alone. */
export const Focused: Story = {
  args: { modelValue: '+354581' },
  render: field({
    setup: (root) => {
      onMounted(() => root()?.querySelector<HTMLInputElement>('[data-part="control"]')?.focus());
    },
  }),
};

/** Filled: spaced the way the country writes it. */
export const Filled: Story = { args: { modelValue: '+3545812345' }, render: field() };

/** Invalid: the field wrapper's error, naming the country. */
export const Invalid: Story = {
  args: { modelValue: '+35458123' },
  render: field({ error: 'Enter a valid phone number for Iceland.' }),
};

/** Another country: the value's dialling code picks it, and length and spacing follow it. */
export const AnotherCountry: Story = {
  name: 'Another country',
  args: { modelValue: '+4532123456' },
  render: field(),
};

export const Disabled: Story = {
  args: { modelValue: '+3545812345', disabled: true },
  render: field(),
};

/** Read-only: the number can be read and copied; the country cannot be changed. */
export const ReadOnly: Story = {
  name: 'Read-only',
  args: { modelValue: '+3545812345', readonly: true },
  render: field(),
};

/** The list open: the suggested country first, then every country from A to Z. */
export const ListOpen: Story = {
  name: 'List open',
  render: field({ setup: opened() }),
  parameters: { docs: { story: { inline: false, height: '32rem' } } },
};

/** Searching by dialling code. A name works the same way. */
export const Searching: Story = {
  render: field({ setup: opened('+4') }),
  parameters: { docs: { story: { inline: false, height: '32rem' } } },
};

/** No match: the list says so in text. */
export const NoMatch: Story = {
  name: 'No match',
  render: field({ setup: opened('Atlantis') }),
  parameters: { docs: { story: { inline: false, height: '20rem' } } },
};

/** A list limited to a few countries, with none suggested: no headings. */
export const LimitedCountries: Story = {
  name: 'Limited to some countries',
  args: { countries: ['IS', 'DK', 'FI', 'NO', 'SE'], preferredCountries: undefined },
  render: field({ setup: opened() }),
  parameters: { docs: { story: { inline: false, height: '24rem' } } },
};

/** The three sizes, the same heights as `Input`. */
export const Sizes: Story = {
  render: (args) => ({
    components: { PhoneInput, FieldWrapper },
    setup: () => ({ args }),
    template: `
      <div class="max-w-narrow flex flex-col gap-4">
        <FieldWrapper v-for="size in ['sm', 'md', 'lg']" :key="size" :label="'Phone number (' + size + ')'">
          <PhoneInput v-bind="args" :size="size" model-value="+3545812345" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Bound both ways: the E.164 value, the country, and what `change` carries. */
export const Bound: Story = {
  name: 'Bound value and country',
  render: (args) => ({
    components: { PhoneInput, FieldWrapper },
    setup() {
      const value = ref('');
      const country = ref('IS');
      const last = ref('');
      const onChange = (change: unknown) => {
        last.value = JSON.stringify(change);
      };
      return { args, value, country, last, onChange };
    },
    template: `
      <div class="max-w-narrow flex flex-col gap-3">
        <FieldWrapper label="Phone number" help="Try typing +45 32 12 34 56, or pasting it.">
          <PhoneInput v-bind="args" v-model="value" v-model:country="country" @change="onChange" />
        </FieldWrapper>
        <dl class="text-body-sm text-muted">
          <div><dt class="inline">modelValue: </dt><dd class="inline">{{ value || '(empty)' }}</dd></div>
          <div><dt class="inline">country: </dt><dd class="inline">{{ country }}</dd></div>
          <div><dt class="inline">change: </dt><dd class="inline">{{ last || '(none yet)' }}</dd></div>
        </dl>
      </div>
    `,
  }),
};

/** Icelandic: country names, their order, and every message. */
export const Icelandic: Story = {
  args: { preferredCountries: ['IS', 'DK'] },
  render: (args) => ({
    components: { PhoneInput, FieldWrapper },
    setup() {
      provideEldraUiLocale('is-IS');
      provideEldraUiMessages(isIS);
      const instance = getCurrentInstance();
      opened()(() => (instance?.proxy?.$el as HTMLElement | null) ?? null);
      return { args };
    },
    template: `
      <div class="max-w-narrow" lang="is">
        <FieldWrapper label="Símanúmer" help="Aðeins notað ef við þurfum að ná í þig vegna pöntunarinnar.">
          <PhoneInput v-bind="args" />
        </FieldWrapper>
      </div>
    `,
  }),
  parameters: { docs: { story: { inline: false, height: '32rem' } } },
};

/** At phone width, in a delivery card: the list opens as wide as the field. */
export const InDeliveryCard: Story = {
  name: 'In a delivery card, phone width',
  render: (args) => ({
    components: { PhoneInput, FieldWrapper, Input },
    setup() {
      const instance = getCurrentInstance();
      opened()(() => (instance?.proxy?.$el as HTMLElement | null) ?? null);
      return { args };
    },
    template: `
      <div style="width: 21.5rem">
        <div class="rounded-lg border border-border bg-background p-5">
          <div class="flex flex-col gap-4">
            <h3 class="text-heading-sm">Delivery</h3>
            <div class="grid grid-cols-2 gap-3">
              <FieldWrapper label="Postal code"><Input model-value="200" /></FieldWrapper>
              <FieldWrapper label="City"><Input model-value="Kópavogur" /></FieldWrapper>
            </div>
            <FieldWrapper label="Phone number">
              <PhoneInput v-bind="args" />
            </FieldWrapper>
          </div>
        </div>
      </div>
    `,
  }),
  parameters: { docs: { story: { inline: false, height: '36rem' } } },
};

/**
 * In a form (`@eldrajs/ui/phone/vee-validate`): `FieldPhoneInput` checks the number against the
 * country the field is on when the field is left, and on submit. Type `581 23` and leave the field.
 */
export const InAForm: Story = {
  name: 'In a form, validated for the country',
  render: (args) => ({
    components: { Form, FieldWrapper, FieldPhoneInput, Button },
    setup() {
      const sent = ref('');
      const onSubmit = (values: Record<string, unknown>) => {
        sent.value = String(values.phone ?? '');
      };
      return { args, sent, onSubmit, HELP };
    },
    template: `
      <div class="max-w-narrow flex flex-col gap-3">
        <Form aria-label="Contact details" @submit="onSubmit">
          <template #default="{ errors }">
            <FieldWrapper label="Phone number" :help="HELP" :error="errors.phone">
              <FieldPhoneInput name="phone" v-bind="args" />
            </FieldWrapper>
          </template>
          <template #actions>
            <Button variant="primary" type="submit" label="Saving">Save</Button>
          </template>
        </Form>
        <p v-if="sent" class="text-body-sm text-muted">Submitted: {{ sent }}</p>
      </div>
    `,
  }),
};
