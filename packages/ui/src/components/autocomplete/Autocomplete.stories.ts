import { IconMapPin } from '@tabler/icons-vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import FieldWrapper from '../field-wrapper/FieldWrapper.vue';
import Autocomplete from './Autocomplete.vue';
import type { AutocompleteSuggestion } from './types';

/**
 * One story per state, named after the state it shows. The stories render the **closed** field,
 * as `Select`'s do: the panel is opened by a real interaction (type "Lau" into any of them), and a
 * screenshot taken while its entrance animation is running would be a flaky baseline. The open
 * panel, its roles, its keyboard and `axe` are covered by `__tests__/autocomplete.spec.ts`.
 */
const meta = {
  title: 'Forms/Autocomplete',
  component: Autocomplete,
  tags: ['autodocs'],
  args: { size: 'md', minLength: 1 },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    suggestions: { table: { disable: true } },
    leadingIcon: { table: { disable: true } },
    classes: { table: { disable: true } },
    messages: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component: [
          'A free-text field with a list of suggestions under it, for a value that is still text',
          'once it is chosen: a street address, a company name. The value is always the text in the',
          'field. Choosing a suggestion fills the field with its `label`; nothing has to be chosen,',
          'and anything typed is kept. For a value that must be one of a list use `Select`; for a',
          'shop search whose rows navigate use `SearchBar`.',
          '',
          '**The consumer supplies the rows.** `suggestions` is the list for the text now in the',
          'field: filter a local list in a `computed`, or fetch on `update:modelValue` and set',
          '`loading` while waiting. The component filters nothing.',
          '',
          '**Parts** (`data-part`; `root` takes `class`, the rest are keys of the `classes` prop):',
          "`Input`'s `root`, `leadingIcon`, `prefix`, `control`, `clearButton` and `suffix`; `busy`",
          '(the spinner); `panel`, `listbox`, `option`, `optionLabel`, `optionDescription` and',
          '`footer`.',
          '',
          '**Slots**: `option` (`{ suggestion, active }`) draws a row; `footer` is a line under the',
          'list inside the panel, for a data-source credit (text only: `Tab` closes the panel, so a',
          "link there is not reachable from the keyboard). `Input`'s `leadingIcon`, `prefix` and",
          '`suffix` are forwarded.',
          '',
          '**It is an `Input`.** The field is the same component, so it has the same box, sizes,',
          'states and clear button, and inside a `FieldWrapper` it takes its `id`,',
          '`aria-describedby`, invalid and required state from it.',
          '',
          '**When the panel shows.** While the field has focus, the text is at least `minLength`',
          'long and there is a suggestion. With none it is closed: there is no "no results" row,',
          'because this is a help and not a search. A single suggestion whose label is exactly the',
          'text shows too: it confirms the text. After a selection, `Escape`, `Tab` or a press outside, it',
          'stays closed until the text is typed in again, the field is focused again or an arrow',
          'key asks for it, whatever `suggestions` holds meanwhile.',
          '',
          '**Loading.** While `loading`, an open panel keeps its rows even if `suggestions` is',
          'emptied, so it does not close and re-open on every keystroke; a closed panel stays',
          'closed. A spinner shows in the field once the wait has lasted 300ms.',
          '',
          '**Keyboard.** No row is active when the panel opens, so `Enter` submits the surrounding',
          'form as a plain input would. `ArrowDown`/`ArrowUp` walk the rows without wrapping,',
          '`Enter` on an active row chooses it (and does not submit), `Escape` closes and keeps the',
          'text, `Tab` closes and moves on. `Home`, `End`, `Space` and every printable key belong',
          'to the text field.',
          '',
          '**Events.** Choosing a row emits `update:modelValue` with its `label`, then `select` with',
          'the suggestion; read the rest of an address (postcode, town) from `select`.',
          '',
          '**Accessibility.** The field is `role="combobox"` with `aria-autocomplete="list"`; focus',
          'never leaves it, and rows are reached through `aria-activedescendant`. The list is a',
          '`role="listbox"` named by the `suggestions` message ("Suggestions"). The `autocomplete`',
          'token you pass is kept as given (`address-line1`), never forced to `off`.',
          '',
          '**Teleported.** The panel is rendered through a `<Teleport>` to `document.body` (or to',
          'the open native `<dialog>` the field sits in), exactly as wide as the field, with',
          "`Select`'s panel look and CSS variables (`--eldra-select-panel-*`, `--eldra-z-popover`).",
        ].join('\n'),
      },
    },
  },
} satisfies Meta<typeof Autocomplete>;

export default meta;
type Story = StoryObj<typeof meta>;

const STREETS: AutocompleteSuggestion[] = [
  { value: 'laugavegur-1', label: 'Laugavegur 1', description: '101 Reykjavík' },
  { value: 'laugavegur-10', label: 'Laugavegur 10', description: '101 Reykjavík' },
  { value: 'laugarnesvegur-3', label: 'Laugarnesvegur 3', description: '105 Reykjavík' },
  { value: 'hafnarstraeti-5', label: 'Hafnarstræti 5', description: '600 Akureyri' },
  { value: 'hafnargata-2', label: 'Hafnargata 2', description: '230 Reykjanesbær' },
  { value: 'austurvegur-4', label: 'Austurvegur 4', description: '800 Selfoss' },
  { value: 'main-street-8', label: 'Main Street 8', description: 'Springfield' },
];

const TOWNS: AutocompleteSuggestion[] = [
  'Akureyri',
  'Egilsstaðir',
  'Hafnarfjörður',
  'Húsavík',
  'Ísafjörður',
  'Kópavogur',
  'Reykjavík',
  'Selfoss',
].map((town) => ({ value: town, label: town }));

/** Case- and accent-insensitive "starts with or contains", which is the consumer's job. */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase();
const matching = (list: AutocompleteSuggestion[], text: string) =>
  text.trim() === '' ? [] : list.filter((row) => fold(row.label).includes(fold(text.trim())));

/** A plain list filtered by the typed text. Type "ak" or "re". */
export const Default: Story = {
  render: (args) => ({
    components: { Autocomplete, FieldWrapper },
    setup: () => {
      const value = ref('');
      const suggestions = computed(() => matching(TOWNS, value.value));
      return { args, value, suggestions };
    },
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Town">
          <Autocomplete v-bind="args" v-model="value" :suggestions="suggestions"
            autocomplete="address-level2" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** A `description` is a muted second line under the label. Type "lau" or "hafnar". */
export const WithDescriptions: Story = {
  render: (args) => ({
    components: { Autocomplete, FieldWrapper },
    setup: () => {
      const value = ref('');
      const chosen = ref('');
      const suggestions = computed(() => matching(STREETS, value.value));
      const onSelect = (suggestion: AutocompleteSuggestion) =>
        (chosen.value = `${suggestion.label}, ${suggestion.description}`);
      return { args, value, chosen, suggestions, onSelect, IconMapPin };
    },
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Street address" help="Start typing and pick your address, or type it in full.">
          <Autocomplete v-bind="args" v-model="value" :suggestions="suggestions"
            :leading-icon="IconMapPin" autocomplete="address-line1" clearable @select="onSelect" />
        </FieldWrapper>
        <p class="text-body-sm text-muted mt-2">Last chosen: {{ chosen || 'nothing yet' }}</p>
      </div>
    `,
  }),
};

/**
 * A wait in progress: the spinner shows in the field once it has lasted 300ms, and no empty panel
 * is drawn.
 */
export const Loading: Story = {
  args: { modelValue: 'Laugav', suggestions: [], loading: true },
  render: (args) => ({
    components: { Autocomplete, FieldWrapper },
    setup: () => ({ args }),
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Street address">
          <Autocomplete v-bind="args" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** The `footer` slot: one line under the list, inside the panel. Type "lau". */
export const WithFooter: Story = {
  render: (args) => ({
    components: { Autocomplete, FieldWrapper },
    setup: () => {
      const value = ref('');
      const suggestions = computed(() => matching(STREETS, value.value));
      return { args, value, suggestions };
    },
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Street address">
          <Autocomplete v-bind="args" v-model="value" :suggestions="suggestions">
            <template #footer>Addresses from the public address register</template>
          </Autocomplete>
        </FieldWrapper>
      </div>
    `,
  }),
};

/** The `option` slot draws the row; `active` is true under the pointer or the arrow keys. */
export const CustomOption: Story = {
  render: (args) => ({
    components: { Autocomplete, FieldWrapper },
    setup: () => {
      const value = ref('');
      const suggestions = computed(() => matching(STREETS, value.value));
      return { args, value, suggestions };
    },
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Street address">
          <Autocomplete v-bind="args" v-model="value" :suggestions="suggestions">
            <template #option="{ suggestion, active }">
              <span class="min-w-0 flex-1 truncate">
                <span :class="active ? 'font-semibold' : 'font-normal'">{{ suggestion.label }}</span>
                <span class="text-muted">, {{ suggestion.description }}</span>
              </span>
            </template>
          </Autocomplete>
        </FieldWrapper>
      </div>
    `,
  }),
};

/** Neither opens: a disabled field is out of the form, a read-only one shows a fixed value. */
export const DisabledAndReadOnly: Story = {
  args: { suggestions: STREETS },
  render: (args) => ({
    components: { Autocomplete, FieldWrapper },
    setup: () => ({ args }),
    template: `
      <div class="flex max-w-96 flex-col gap-4">
        <FieldWrapper label="Street address · disabled">
          <Autocomplete v-bind="args" model-value="Laugavegur 1" disabled />
        </FieldWrapper>
        <FieldWrapper label="Street address · read-only">
          <Autocomplete v-bind="args" model-value="Laugavegur 1" readonly />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** In a `FieldWrapper` with a label, help text and an error: the same wiring as `Input`. */
export const InFieldWrapper: Story = {
  render: (args) => ({
    components: { Autocomplete, FieldWrapper },
    setup: () => {
      const value = ref('');
      const suggestions = computed(() => matching(STREETS, value.value));
      const error = computed(() => (value.value.trim() === '' ? 'Enter a street address.' : ''));
      return { args, value, suggestions, error };
    },
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Street address" required :error="error">
          <Autocomplete v-bind="args" v-model="value" :suggestions="suggestions"
            name="street" autocomplete="address-line1" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** The three sizes are `Input`'s, so the field lines up with the ones beside it. */
export const Sizes: Story = {
  render: (args) => ({
    components: { Autocomplete, FieldWrapper },
    setup: () => {
      const sm = ref('');
      const md = ref('');
      const lg = ref('');
      const rows = (text: string) => matching(TOWNS, text);
      return { args, sm, md, lg, rows };
    },
    template: `
      <div class="flex max-w-96 flex-col gap-4">
        <FieldWrapper label="Town · sm">
          <Autocomplete v-bind="args" v-model="sm" :suggestions="rows(sm)" size="sm" />
        </FieldWrapper>
        <FieldWrapper label="Town · md">
          <Autocomplete v-bind="args" v-model="md" :suggestions="rows(md)" size="md" />
        </FieldWrapper>
        <FieldWrapper label="Town · lg">
          <Autocomplete v-bind="args" v-model="lg" :suggestions="rows(lg)" size="lg" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/**
 * An answer that arrives after a short delay, as a lookup service's does: each keystroke starts a
 * wait, a newer keystroke drops the older one, and `loading` is set until the answer lands. From
 * three characters, so a lookup is not made for "L".
 */
export const Async: Story = {
  args: { minLength: 3 },
  render: (args) => ({
    components: { Autocomplete, FieldWrapper },
    setup: () => {
      const value = ref('');
      const suggestions = ref<AutocompleteSuggestion[]>([]);
      const loading = ref(false);
      let timer: ReturnType<typeof setTimeout> | undefined;
      /** Set by `select`: the text a chosen row wrote needs no lookup of its own. */
      let chosen = '';

      watch(value, (text) => {
        if (timer !== undefined) clearTimeout(timer);
        if (text === chosen || text.trim().length < 3) {
          suggestions.value = [];
          loading.value = false;
          return;
        }
        loading.value = true;
        timer = setTimeout(() => {
          suggestions.value = matching(STREETS, text);
          loading.value = false;
        }, 400);
      });
      onBeforeUnmount(() => timer !== undefined && clearTimeout(timer));

      const onSelect = (suggestion: AutocompleteSuggestion) => (chosen = suggestion.label);
      return { args, value, suggestions, loading, onSelect };
    },
    template: `
      <div class="max-w-96">
        <FieldWrapper label="Street address" help="Answers after 0.4 seconds, from three characters.">
          <Autocomplete v-bind="args" v-model="value" :suggestions="suggestions" :loading="loading"
            autocomplete="address-line1" @select="onSelect" />
        </FieldWrapper>
      </div>
    `,
  }),
};

/** A 20rem container: the field fills its column and the panel is as wide as the field. */
export const Narrow: Story = {
  render: (args) => ({
    components: { Autocomplete, FieldWrapper },
    setup: () => {
      const value = ref('');
      const suggestions = computed(() => matching(STREETS, value.value));
      return { args, value, suggestions };
    },
    template: `
      <div class="border-border w-80 border p-4">
        <FieldWrapper label="Street address">
          <Autocomplete v-bind="args" v-model="value" :suggestions="suggestions" />
        </FieldWrapper>
      </div>
    `,
  }),
};
