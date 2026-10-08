<script setup lang="ts">
/**
 * A `range` facet: the two-thumb `RangeSlider`, the decorative histogram above its track, and the
 * Min and Max fields below it (spec "Filter panel" → Variants, `range` facet row).
 *
 * Nothing about a range is drawn here. `RangeSlider` already owns the thumbs that cannot cross,
 * every key in the spec's own keyboard table, the `aria-valuetext` each thumb announces and the
 * commit rules a typed value goes through; this component composes it and supplies the two things
 * a *filter* adds — the histogram, through the slider's `track` slot, and the labelled money
 * fields, through its `inputs` slot.
 *
 * **Both fields are supplied rather than left to the slider's built-in row**, in both the money
 * and the plain case. The spec's Anatomy item 12 gives each field a visible "Min" / "Max" label
 * above it, and the built-in row has none: its fields are named for assistive technology and
 * nothing else. A money range draws `CurrencyInput`, which puts the store's own sign where the
 * locale wants it; any other range draws the spec's own `<input type="number" inputmode="numeric">`
 * inside a `FieldWrapper` that owns the label. Neither is a second source of truth, because every
 * write goes through the row's own `commit`.
 *
 * `formatValue` is handed the end it is formatting, which is what the spec's "the top thumb at the
 * maximum adds ' or more'" needs: above the catalogue's highest price there is nothing left to
 * exclude, so "$240 or more" is the honest announcement and "$240" is not.
 */
import { computed, ref, watch } from 'vue';
import { useEldraUiCurrency, useEldraUiLocale } from '../../../composables/useLocale';
import { useMessages } from '../../../composables/useMessages';
import { cx, partClass } from '../../../utils/cx';
import { formatCurrency, formatNumber } from '../../../utils/number-format';
import CurrencyInput from '../../currency-input/CurrencyInput.vue';
import FieldWrapper from '../../field-wrapper/FieldWrapper.vue';
import Input from '../../input/Input.vue';
import RangeSlider from '../../range-slider/RangeSlider.vue';
import Histogram from '../Histogram.vue';
import { rangeLimits, rangeOf } from '../useFilterPanel';
import type { RangeSliderEnd } from '../../range-slider/types';
import type { FacetProps } from './shared';

const props = withDefaults(
  defineProps<
    FacetProps & {
      /** The locale numbers and prices are formatted in. The panel's own, resolved there. */
      locale?: string;
      /** The currency a money range is formatted in. */
      currency?: string;
    }
  >(),
  { dense: false, classes: undefined, messages: undefined, locale: undefined, currency: undefined }
);

const emit = defineEmits<{
  /**
   * The move is over — pointer release, the key release that ends an arrow-key run, a committed
   * field — so this is the span to apply.
   *
   * There is deliberately no event for a move *in progress*. `RangeSlider` reports every step of
   * a drag and every arrow key, and a filter that re-queried on each of them would send one
   * request per pixel; the thumb follows the gesture from this component's own state instead (see
   * `pair` below), so nothing on screen waits for the panel either way.
   */
  commit: [range: [number, number]];
}>();

const m = useMessages(() => props.messages);
const ambientLocale = useEldraUiLocale();
const ambientCurrency = useEldraUiCurrency();

const locale = computed(() => props.locale ?? ambientLocale.value);
/**
 * The empty string means "this store has no currency", the same reading `useEldraUiCurrency` gives
 * it: it is not a code `Intl` accepts, and it is how a platform that has not published one says so.
 */
const currency = computed(() => {
  const resolved = props.currency ?? ambientCurrency.value;
  return resolved === '' ? undefined : resolved;
});

const limits = computed(() => rangeLimits(props.facet));
const step = computed(() => props.facet.step ?? 1);
const applied = computed(() => rangeOf(props.selection, props.facet));

/**
 * The block's `priceSlider: false` draws the labelled Min / Max fields alone — no track, no
 * thumbs, no histogram. `RangeSlider`'s own `trackVisible` prop hides the rail and the `track`
 * slot; the fields keep every clamping/snapping/commit rule because they are the same `commit`
 * function and the same model either way.
 */
const showTrack = computed(() => props.facet.slider !== false);

/**
 * Whether this range is money the store can actually name. `facet.currency` says the numbers *are*
 * money; a currency code says we know which. Without a code the fields fall back to plain numeric
 * ones rather than to a `CurrencyInput` guessing a sign — a dollar sign in front of krónur is a
 * wrong price, where a bare number is only an incomplete one.
 */
const isMoney = computed(() => props.facet.currency === true && currency.value !== undefined);

/**
 * The slider's own pair, and why it is local state rather than a computed over the selection.
 *
 * `RangeSlider` is controlled here, so the thumb only moves when this value does — a drag that
 * waited for the panel to apply the move would not move at all. So every step writes here and only
 * the end of the move leaves the component, which is also one request per gesture rather than one
 * per pixel. It re-seeds from the selection whenever that changes or the facet's bounds do (a chip
 * removed, **Clear all**, facets arriving after the first paint) unless a move is in flight, which
 * is what stops a late refresh snatching the thumb mid-drag.
 */
const pair = ref<[number, number]>(applied.value);
const moving = ref(false);
watch([applied, limits], () => {
  if (moving.value) return;
  pair.value = applied.value;
});

function onMove(range: [number, number]): void {
  moving.value = true;
  pair.value = range;
}

function onCommit(range: [number, number]): void {
  moving.value = false;
  pair.value = range;
  emit('commit', range);
}

/**
 * Spec → Behaviour: 'Each thumb's value text uses the store's currency with no decimals ("$40";
 * "3.500 kr."); the top thumb at the maximum adds " or more" ("$240 or more").'
 */
function formatValue(amount: number, end?: RangeSliderEnd): string {
  const text = isMoney.value
    ? formatCurrency(amount, locale.value, currency.value, true, 0)
    : formatNumber(amount, { locale: locale.value, maxFraction: 0, minFraction: 0 });
  const atMax = end === 1 && amount >= limits.value[1];
  return atMax ? `${text}${m.value.filterPanelOrMore}` : text;
}

/**
 * The two fields' own numbers. Local for the reason a money field always needs its own: it
 * reformats as it is typed, and `commit` snaps to the step grid and clamps against the other
 * thumb, so calling it per keystroke would move the figure under the caret. They re-seed from the
 * control's pair, so a drag, an arrow key and **Clear all** all reach the fields.
 */
const typed = ref<[number | null, number | null]>([pair.value[0], pair.value[1]]);
watch(pair, (next) => {
  typed.value = [next[0], next[1]];
});

/* ------------------------------------------------------------------ classes */

/**
 * Spec → Sizes, Min / Max fields row: "3-column grid (`1fr | auto | 1fr`), bottom-aligned, 0.5rem
 * gaps, 0.75rem above."
 *
 * `col-span-full` is load-bearing. This row is rendered **inside** `RangeSlider`'s own `inputs`
 * element, which is already a `1fr | auto | 1fr` grid — so without it this whole row is one child
 * of that grid and sits in its first column, a third of the width, with both fields clipped. The
 * 0.75rem above is that element's, not this one's, which is why there is no margin here.
 */
const FIELDS_BASE = 'col-span-full grid grid-cols-[1fr_auto_1fr] items-end gap-2';
/** Spec → Sizes: 'Label "Min" / "Max" 0.75rem weight 500 `muted`, 0.125rem above its Input sm.' */
const FIELD_LABEL = 'mb-0.5 block text-filter-tile-count font-medium text-muted';
/** A `FieldWrapper` draws its own gap between label and control; the label recipe owns it here. */
const FIELD_WRAPPER = 'gap-0';
/** Spec → Sizes: "Tabular figures." The unit inside the box is the field's own. */
const FIELD_CONTROL = 'tabular-nums';
/**
 * Spec → Sizes: "En dash between the fields in `muted`." Punctuation, so it is hidden. The row is
 * bottom-aligned, so the dash is a box as tall as the sm control sitting on the same baseline as
 * the two fields, with the glyph centred in it — centring on the whole row would put it level
 * with the labels above the fields instead.
 */
const SEPARATOR_BASE = 'self-end flex control-h-sm items-center justify-center text-body-sm text-muted';
/**
 * Spec → Sizes, Histogram and Range rows: the track and the bars are inset by the thumb's radius,
 * not by half a touch target — the slider's own default keeps a 44px band inside its box, which
 * leaves a 15rem sidebar's track at two thirds of the width. The rail keeps its height, so the
 * press band is unchanged; only the ends move out to the panel's edges.
 */
const SLIDER_CLASSES = { group: 'eldra-range-gutter-thumb' } as const;

const fieldsClass = computed(() => partClass(FIELDS_BASE, props.classes, 'fields'));
const separatorClass = computed(() => partClass(SEPARATOR_BASE, props.classes, 'separator'));
const fieldClass = computed(() => partClass('', props.classes, 'field'));
const rangeClass = computed(() => partClass('min-w-0', props.classes, 'range'));

/** `CurrencyInput` draws its own label, so the money field needs one bag. */
const MONEY_CLASSES = computed(() => ({
  root: fieldClass.value,
  label: FIELD_LABEL,
  control: FIELD_CONTROL,
}));
/** The plain field's label belongs to its `FieldWrapper`, so that one needs two. */
const PLAIN_WRAPPER_CLASSES = computed(() => ({
  root: cx(FIELD_WRAPPER, fieldClass.value),
  label: FIELD_LABEL,
}));
const PLAIN_CONTROL_CLASSES = { control: FIELD_CONTROL } as const;

/**
 * The plain field's text, as the number the row commits. `Input` is a string control, so the two
 * are bridged here rather than in the template: an emptied field is `null`, which `commit` reads
 * as "back to that end of the range".
 */
function plainText(end: 0 | 1): string {
  const amount = typed.value[end];
  return amount === null ? '' : String(amount);
}

function onPlainInput(end: 0 | 1, raw: string): void {
  const parsed = raw.trim() === '' ? null : Number(raw);
  typed.value[end] = parsed === null || Number.isNaN(parsed) ? null : parsed;
}
</script>

<template>
  <div data-part="range" :class="rangeClass">
    <!-- No visible `label` on the slider: the group's own trigger and its hidden `<legend>`
         already say "Price", and a third copy inside the body would be read as a second field
         name. The two thumbs are named explicitly instead, which is what the spec asks for
         ("Minimum price", "Maximum price"). -->
    <RangeSlider
      :model-value="pair"
      :min="limits[0]"
      :max="limits[1]"
      :step="step"
      :min-label="m.minimumOf(facet.label)"
      :max-label="m.maximumOf(facet.label)"
      :format-value="formatValue"
      inputs
      :track-visible="showTrack"
      :classes="SLIDER_CLASSES"
      @update:model-value="onMove"
      @change="onCommit"
    >
      <!-- Spec → Anatomy item 10: only when the store supplied a distribution, and only with the
           track itself — `slider: false` omits both together. The panel never invents
           a distribution it cannot see either way — one page is not the range. -->
      <template
        v-if="showTrack && facet.histogram && facet.histogram.length > 0"
        #track="{ value }"
      >
        <Histogram :bars="facet.histogram" :range="value" :limits="limits" :classes="classes" />
      </template>

      <!-- The fields are named by their **own visible labels** ("Min" / "Max"), which is what the
           spec asks for, rather than by the thumb names the slot offers: the facet's own hidden
           `<legend>` ("Price") is what says which range they belong to, and a field whose visible
           word is not in its accessible name fails 2.5.3. -->
      <template #inputs="{ step: fieldStep, disabled, commit }">
        <div data-part="fields" :class="fieldsClass">
          <CurrencyInput
            v-if="isMoney"
            v-model="typed[0]"
            data-input="min"
            size="sm"
            :currency="currency"
            :locale="locale"
            :label="m.filterPanelMin"
            :max-fraction="0"
            :step="fieldStep"
            :disabled="disabled"
            :classes="MONEY_CLASSES"
            @blur="typed[0] = commit(0, typed[0])"
            @keydown.enter.prevent="typed[0] = commit(0, typed[0])"
          />
          <FieldWrapper v-else :label="m.filterPanelMin" :classes="PLAIN_WRAPPER_CLASSES">
            <Input
              data-input="min"
              type="number"
              inputmode="numeric"
              size="sm"
              autocomplete="off"
              :model-value="plainText(0)"
              :disabled="disabled"
              :classes="PLAIN_CONTROL_CLASSES"
              @update:model-value="onPlainInput(0, $event)"
              @blur="typed[0] = commit(0, typed[0])"
              @keydown.enter.prevent="typed[0] = commit(0, typed[0])"
            />
          </FieldWrapper>

          <span data-part="separator" :class="separatorClass" aria-hidden="true">–</span>

          <CurrencyInput
            v-if="isMoney"
            v-model="typed[1]"
            data-input="max"
            size="sm"
            :currency="currency"
            :locale="locale"
            :label="m.filterPanelMax"
            :max-fraction="0"
            :step="fieldStep"
            :disabled="disabled"
            :classes="MONEY_CLASSES"
            @blur="typed[1] = commit(1, typed[1])"
            @keydown.enter.prevent="typed[1] = commit(1, typed[1])"
          />
          <FieldWrapper v-else :label="m.filterPanelMax" :classes="PLAIN_WRAPPER_CLASSES">
            <Input
              data-input="max"
              type="number"
              inputmode="numeric"
              size="sm"
              autocomplete="off"
              :model-value="plainText(1)"
              :disabled="disabled"
              :classes="PLAIN_CONTROL_CLASSES"
              @update:model-value="onPlainInput(1, $event)"
              @blur="typed[1] = commit(1, typed[1])"
              @keydown.enter.prevent="typed[1] = commit(1, typed[1])"
            />
          </FieldWrapper>
        </div>
      </template>
    </RangeSlider>
  </div>
</template>
