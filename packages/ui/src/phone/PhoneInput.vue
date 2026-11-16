<!--
  A phone number field with its country inside it: a country button (flag, dialling code, chevron)
  at the start of the box, the number beside it. One control to the eye, with one focus ring around
  the whole box, and two tab stops: the button, then the number.

  The country list is the panel a `Select` opens, composed from the same parts (`SelectPanel`,
  `useOptionList`, `useListbox`, `usePopover`), so its search, its keyboard and its ARIA are the
  ones the rest of the package has. It opens under the whole field, as wide as it.

  The value is the number in E.164. The field shows the national number only, spaced the way the
  chosen country writes it, re-spaced on every keystroke with the caret kept by what was typed
  (`./caret.ts`). Text starting with `+` picks its own country (`typePhone` in `./phone.ts`).
-->
<script setup lang="ts">
import { comparator } from '@eldrajs/sdk/format';
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue';
import SelectPanel from '../components/select/SelectPanel.vue';
import type { SelectOption } from '../components/select/types';
import { useListbox } from '../components/select/useListbox';
import { useOptionList } from '../components/select/useOptionList';
import { usePopover } from '../components/select/usePopover';
import { FIELD_KEY } from '../components/field-wrapper/context';
import { FIELD_RADIUS, FIELD_TEXT } from '../components/input/classes';
import { useControllableModel } from '../composables/useControllableModel';
import { useEldraScope } from '../composables/useEldraScope';
import { useEldraUiLocale } from '../composables/useLocale';
import { useMessages } from '../composables/useMessages';
import { joinIds, useUiId } from '../utils/id';
import { caretAfter, significantBefore } from './caret';
import { phoneExample } from './examples';
import {
  isValidPhone,
  phoneCallingCode,
  phoneCountries,
  readPhone,
  typePhone,
  type PhoneInputState,
} from './phone';
import CountryFlag from '../flag/CountryFlag.vue';
import { phoneCountryName } from './rule';
import type { PhoneInputChange, PhoneInputProps, PhoneInputSize } from './types';

const eldra = useEldraScope();

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<PhoneInputProps>(), {
  modelValue: undefined,
  country: undefined,
  defaultCountry: undefined,
  preferredCountries: undefined,
  countries: undefined,
  locale: undefined,
  size: 'md',
  id: undefined,
  name: undefined,
  placeholder: undefined,
  autocomplete: 'tel-national',
  // Undefined, not false: these three fall back to the field wrapper's context.
  invalid: undefined,
  describedBy: undefined,
  required: undefined,
  readonly: false,
  disabled: false,
  messages: undefined,
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:country': [country: string];
  /** After every edit and every change of country. */
  change: [value: PhoneInputChange];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
  open: [];
  close: [];
}>();

const m = useMessages(() => props.messages);
const providedLocale = useEldraUiLocale();
const locale = computed(() => props.locale ?? providedLocale.value);

// --- the field wrapper ---------------------------------------------------------------------------

const field = inject(FIELD_KEY, null);
const controlId = useUiId(
  'phone',
  () => props.id ?? (field?.value.labelsControl === true ? field.value.id : undefined)
);
const describedBy = computed(() => joinIds(props.describedBy, field?.value.describedBy));
const isInvalid = computed(() => props.invalid ?? field?.value.invalid ?? false);
const isRequired = computed(() => props.required ?? field?.value.required ?? false);
const showsInvalid = computed(() => isInvalid.value && !props.disabled);

const panelId = computed(() => `${controlId.value}-panel`);
const listboxId = computed(() => `${controlId.value}-listbox`);

// --- countries -------------------------------------------------------------------------------------

const known = new Set(phoneCountries());

/** The countries on offer, in the order given: every one, or the `countries` this field is limited to. */
const offered = computed<readonly string[]>(() =>
  props.countries === undefined
    ? phoneCountries()
    : [...new Set(props.countries)].filter((country) => known.has(country))
);
const offeredSet = computed(() => new Set(offered.value));
const allowed = (country: string): boolean => offeredSet.value.has(country);

const preferred = computed(() =>
  [...new Set(props.preferredCountries ?? [])].filter((country) => allowed(country))
);

function startingCountry(): string {
  const limited = props.countries === undefined ? undefined : offered.value[0];
  for (const country of [props.country, props.defaultCountry, preferred.value[0], limited, 'US']) {
    if (country !== undefined && allowed(country)) return country;
  }
  return offered.value[0] ?? 'US';
}

// --- the value ---------------------------------------------------------------------------------

/** Controlled when the parent binds `modelValue`, self-managing when it does not. */
const model = useControllableModel<string>(props, emit, () => '');

/**
 * The field's own state: the text it shows and the country it is on. The text is not derived from
 * the model, because the model cannot hold it: `07400` and `7400` are the same E.164 digits, and a
 * field re-derived from the model on every keystroke would eat the `0` as it was typed. The model
 * is read only when it holds something this state did not produce (`syncFromModel`).
 */
const state = ref<PhoneInputState>(readPhone(model.value, startingCountry(), allowed));
const text = computed(() => state.value.text);
const country = computed(() => state.value.country);
const callingCode = computed(() => phoneCallingCode(country.value));

function describe(next: PhoneInputState): PhoneInputChange {
  return {
    e164: next.e164,
    country: next.country,
    callingCode: phoneCallingCode(next.country),
    nationalNumber: next.nationalNumber,
    valid: isValidPhone(next.e164, next.country),
  };
}

/** Takes a new state and tells the parent what changed. */
function commit(next: PhoneInputState): void {
  const previous = state.value;
  state.value = next;
  if (next.country !== previous.country) emit('update:country', next.country);
  if (next.e164 !== model.value) model.value = next.e164;
  if (next.country !== previous.country || next.e164 !== previous.e164)
    emit('change', describe(next));
  // A controlled parent may refuse the value: the watcher below never fires for a prop that did
  // not change, so the field is put back on what the model actually says.
  void nextTick(syncFromModel);
}

function syncFromModel(): void {
  if (model.value === state.value.e164) return;
  const previous = state.value;
  state.value = readPhone(model.value, previous.country, allowed);
  if (state.value.country !== previous.country) emit('update:country', state.value.country);
}

watch(model, syncFromModel);

/** The digits to carry over to another country: what was typed, without a dialling code. */
function carriedDigits(): string {
  const current = state.value;
  return current.text.trimStart().startsWith('+') ? current.nationalNumber : current.text;
}

/** A country chosen from the list, or bound from outside: the digits stay, re-spaced for it. */
function setCountry(next: string): void {
  if (next === country.value || !allowed(next)) return;
  // Only `next` is allowed here, so a number that happens to be valid in a country sharing the
  // dialling code does not pull the choice straight back.
  commit(typePhone(carriedDigits(), next, (candidate) => candidate === next));
}

watch(
  () => props.country,
  (next) => {
    if (next !== undefined) setCountry(next);
  }
);

onMounted(() => {
  // The value can name a country the `country` binding does not (a saved `+45…` under `IS`).
  if (props.country !== undefined && props.country !== country.value) {
    emit('update:country', country.value);
  }
});

// --- typing --------------------------------------------------------------------------------------

const controlRef = ref<HTMLInputElement | null>(null);

function onInput(event: Event): void {
  // A composition's intermediate text is not re-spaced; its final `input` event is.
  if ((event as InputEvent).isComposing) return;
  const element = event.target as HTMLInputElement;
  const raw = element.value;
  const before = significantBefore(raw, element.selectionStart ?? raw.length);
  const next = typePhone(raw, country.value, allowed);

  // Written to the element as well as through the state: a keystroke that changes no digit (a
  // letter, a second space) leaves the bound text identical, so Vue would not patch it away.
  element.value = next.text;
  const caret = caretAfter(next.text, before - next.stripped);
  element.setSelectionRange(caret, caret);
  commit(next);
}

const placeholderText = computed(() => {
  if (props.placeholder === false) return undefined;
  return props.placeholder ?? phoneExample(country.value);
});

// --- the country list ----------------------------------------------------------------------------

const countryName = (code: string): string => phoneCountryName(code, locale.value);

/**
 * Suggested countries first, in the order given, then every other one from A to Z in the locale's
 * own order. A country is listed once: a suggested one is not repeated below. The dialling code
 * and the ISO code are keywords, so "+45", "45" and "dk" all find Denmark.
 */
const options = computed<SelectOption[]>(() => {
  const compare = comparator(locale.value);
  const grouped = preferred.value.length > 0;
  const entry = (code: string, group: string | undefined): SelectOption => {
    const dial = phoneCallingCode(code);
    return {
      value: code,
      label: countryName(code),
      meta: `+${dial}`,
      keywords: [`+${dial}`, dial, code],
      group,
    };
  };
  const suggested = preferred.value.map((code) =>
    entry(code, grouped ? m.value.phoneSuggested : undefined)
  );
  const rest = offered.value
    .filter((code) => !preferred.value.includes(code))
    .map((code) => entry(code, grouped ? m.value.phoneAllCountries : undefined))
    .sort((a, b) => compare(a.label, b.label));
  return [...suggested, ...rest];
});

const indexOfValue = computed(
  () => new Map(options.value.map((option, index) => [option.value, index]))
);
const optionId = (value: string): string =>
  `${controlId.value}-o${indexOfValue.value.get(value) ?? 0}`;

const query = ref('');
const fieldRef = ref<HTMLElement | null>(null);
const buttonRef = ref<HTMLButtonElement | null>(null);
const panelComponent = ref<InstanceType<typeof SelectPanel> | null>(null);
const panelRef = computed<HTMLElement | null>(() => panelComponent.value?.root ?? null);
const searchRef = computed<HTMLInputElement | null>(
  () => panelComponent.value?.searchInput ?? null
);

const { sections, listOptions, hasOptions, highlights, renderMore, reveal, resetBatch } =
  useOptionList({
    options: () => options.value,
    query: () => query.value,
    searchable: () => true,
    controlId: () => controlId.value,
  });

const canOpen = (): boolean => !props.disabled && !props.readonly;

const {
  isOpen,
  panelStyle,
  placement,
  teleportTo,
  teleportDisabled,
  open: openPopover,
  close: closePopover,
  onTriggerPointerDown,
  onTriggerClick,
} = usePopover({
  trigger: buttonRef,
  content: panelRef,
  // Under the whole field and as wide as it, not under the button alone.
  anchor: fieldRef,
  matchWidth: true,
  canOpen,
  onOpen: () => {
    listbox.resetTypeahead();
    emit('open');
  },
  onClose: () => {
    listbox.resetTypeahead();
    resetBatch();
    query.value = '';
    emit('close');
  },
  afterOpen: async () => {
    await nextTick();
    searchRef.value?.focus();
  },
  openFromPointer: () => openPanel(),
});

const listbox = useListbox({
  options: () => listOptions.value,
  isOpen: () => isOpen.value,
  canOpen,
  searchable: () => true,
  optionId,
  open: () => openPanel(),
  close: () => closePopover(),
  select: (option) => choose(option as SelectOption),
  startQuery: (character) => {
    query.value = character;
  },
  escape: () => {
    if (query.value === '') return false;
    query.value = '';
    return true;
  },
});
watch(listbox.activeValue, reveal, { flush: 'sync' });
watch(query, () => {
  if (isOpen.value) listbox.activateFrom(undefined);
});

function openPanel(): void {
  openPopover(() => listbox.activateFrom(country.value));
}

/** Choosing a country hands the keyboard to the number: that is what is typed next. */
function choose(option: SelectOption): void {
  setCountry(option.value);
  closePopover(false);
  controlRef.value?.focus();
}

const selectedValues = computed(() => [country.value]);
const emptyText = computed(() =>
  query.value.trim() === '' ? m.value.noResults : m.value.phoneNoMatch(query.value.trim())
);
const buttonLabel = computed(() =>
  m.value.phoneCountry(countryName(country.value), `+${callingCode.value}`)
);

// --- classes -------------------------------------------------------------------------------------

const rootClass = 'eldra:relative eldra:block eldra:w-full';

/**
 * The field box: `Input`'s box (its border variable, its radius variable, its heights, its state
 * colours), drawn on a wrapper because two controls sit in it. The one focus ring is the box's:
 * `eldra-focus-proxy` turns it on while the number or the button is `:focus-visible`, and
 * `eldra-focus-has-open` keeps it on while the list is open and focus is in the list's search
 * field. No `transition-*` utility beside `eldra-focus`, which owns the transition list.
 */
const FIELD_BOX =
  `eldra:flex eldra:w-full eldra:min-w-0 eldra:items-stretch eldra:eldra-field-border ${FIELD_RADIUS} ` +
  'eldra:eldra-focus eldra:eldra-focus-proxy eldra:eldra-focus-has-open';
const FIELD_HEIGHT: Record<PhoneInputSize, string> = {
  sm: 'eldra:control-h-sm',
  md: 'eldra:control-h',
  lg: 'eldra:control-h-lg',
};
const LIVE_FILL = 'eldra:bg-background eldra:text-text';
const REST = 'eldra:border-border-strong eldra:hover:border-text eldra:focus-within:border-text';
const OPEN = 'eldra:border-text';
const INVALID = 'eldra:border-danger';
const DISABLED =
  'eldra:bg-surface-strong eldra:border-border eldra:border-dashed eldra:text-muted eldra:cursor-not-allowed';
const READONLY_FILL = 'eldra:bg-surface eldra:text-text';

function fieldState(): string {
  if (props.disabled) return DISABLED;
  if (props.readonly)
    return `${READONLY_FILL} ${showsInvalid.value ? INVALID : 'eldra:border-border'}`;
  return `${LIVE_FILL} ${showsInvalid.value ? INVALID : isOpen.value ? OPEN : REST}`;
}

const fieldClass = computed(() => [
  FIELD_BOX,
  FIELD_HEIGHT[props.size],
  fieldState(),
  showsInvalid.value && 'eldra:eldra-field-invalid',
  props.classes?.field,
]);

/** The start corners follow the box's, one border-width in, so the hover fill never pokes out. */
const BUTTON_BASE =
  'eldra:flex eldra:shrink-0 eldra:items-center eldra:gap-1.5 eldra:ps-2.5 eldra:pe-2 eldra:border-e eldra:border-border ' +
  'eldra:tabular-nums eldra:outline-none ' +
  'eldra:rounded-s-[calc(var(--eldra-input-radius,var(--eldra-radius-md))-var(--eldra-field-border-width,1px))]';
const BUTTON_LIVE =
  'eldra:cursor-pointer eldra:hover:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)] ' +
  'eldra:focus-visible:bg-[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]';

const buttonClass = computed(() => [
  BUTTON_BASE,
  FIELD_TEXT[props.size],
  props.disabled
    ? 'eldra:cursor-not-allowed'
    : props.readonly
      ? 'eldra:cursor-default'
      : BUTTON_LIVE,
  props.classes?.countryButton,
]);

const chevronClass = computed(() => [
  'eldra:size-3.5 eldra:shrink-0 eldra:text-muted eldra:transition-transform eldra:duration-base',
  isOpen.value && 'eldra:rotate-180',
  props.classes?.chevron,
]);

const controlClass = computed(() => [
  'eldra:block eldra:min-w-0 eldra:flex-1 eldra:bg-transparent eldra:px-2.75 eldra:tabular-nums eldra:outline-none eldra:placeholder:text-muted',
  FIELD_TEXT[props.size],
  props.disabled && 'eldra:cursor-not-allowed',
  props.classes?.control,
]);

/** `control` is the number `<input>`; `country` the one the field is on, whoever chose it. */
defineExpose({ control: controlRef, focus: () => controlRef.value?.focus(), country });
</script>

<template>
  <div
    data-eldra-ui
    :data-eldra-scope="eldra.scope"
    data-part="root"
    :class="[rootClass, $attrs.class]"
  >
    <div ref="fieldRef" data-part="field" :class="fieldClass">
      <button
        ref="buttonRef"
        data-part="countryButton"
        type="button"
        role="combobox"
        :class="buttonClass"
        aria-haspopup="listbox"
        :aria-expanded="isOpen ? 'true' : 'false'"
        :aria-controls="listboxId"
        :aria-label="buttonLabel"
        :aria-disabled="disabled ? 'true' : undefined"
        :aria-readonly="readonly ? 'true' : undefined"
        :disabled="disabled || undefined"
        @pointerdown="onTriggerPointerDown"
        @click="onTriggerClick"
        @keydown="listbox.onKeydown"
      >
        <span :data-eldra-slot="eldra.slotHost('flag')" class="eldra:flex eldra:shrink-0">
          <slot name="flag" :country="country">
            <CountryFlag :country="country" :class="classes?.flag" />
          </slot>
        </span>
        <span data-part="callingCode" :class="classes?.callingCode">+{{ callingCode }}</span>
        <span v-if="!readonly" data-part="chevron" :class="chevronClass" aria-hidden="true">
          <!-- Tabler's `chevron-down`. -->
          <svg
            class="eldra:size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            focusable="false"
          >
            <path d="M6 9l6 6l6 -6" />
          </svg>
        </span>
      </button>

      <input
        ref="controlRef"
        v-bind="{ ...$attrs, class: undefined }"
        data-part="control"
        type="tel"
        inputmode="tel"
        :class="controlClass"
        :id="controlId"
        :value="text"
        :placeholder="placeholderText"
        :autocomplete="autocomplete"
        :required="isRequired || undefined"
        :readonly="readonly || undefined"
        :disabled="disabled || undefined"
        :aria-invalid="isInvalid ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="onInput"
        @focus="emit('focus', $event as FocusEvent)"
        @blur="emit('blur', $event as FocusEvent)"
      />
    </div>

    <!-- The E.164 value for a form post; the visible field holds the national number only. -->
    <input
      v-if="name"
      data-part="native"
      type="hidden"
      :name="name"
      :value="model"
      :disabled="disabled || undefined"
    />

    <!-- `v-if` on the `<Teleport>`, as `Select` has it: a server render emits nothing. -->
    <Teleport v-if="isOpen" :to="teleportTo" :disabled="teleportDisabled">
      <SelectPanel
        ref="panelComponent"
        :panel-id="panelId"
        :listbox-id="listboxId"
        :sections="sections"
        :has-options="hasOptions"
        :highlights="highlights"
        :option-id="optionId"
        :active-value="listbox.activeValue.value"
        :selected-values="selectedValues"
        :searchable="true"
        :query="query"
        :search-placeholder="m.phoneSearch"
        :empty-text="emptyText"
        :fallback-label="m.phoneCountryList"
        :panel-style="panelStyle"
        :placement="placement"
        :classes="classes"
        @search="query = $event"
        @select="choose"
        @activate="listbox.setActive"
        @scroll-end="renderMore"
        @keydown="listbox.onKeydown"
      >
        <template #optionContent="{ option, match }">
          <slot name="flag" :country="option.value">
            <CountryFlag :country="option.value" :class="classes?.flag" />
          </slot>
          <span
            data-part="optionLabel"
            :class="['eldra:min-w-0 eldra:flex-1', classes?.optionLabel]"
          >
            <template v-if="match"
              >{{ match.before }}<span class="eldra:eldra-select-match">{{ match.match }}</span
              >{{ match.after }}</template
            >
            <template v-else>{{ option.label }}</template>
          </span>
          <span
            data-part="optionMeta"
            :class="[
              'eldra:ms-3 eldra:shrink-0 eldra:text-caption eldra:tabular-nums eldra:text-[color:var(--eldra-select-panel-muted,var(--eldra-color-muted))]',
              classes?.optionMeta,
            ]"
          >
            {{ option.meta }}
          </span>
        </template>
      </SelectPanel>
    </Teleport>
  </div>
</template>
