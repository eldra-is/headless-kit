<script setup lang="ts">
import { computed, ref, watchPostEffect } from 'vue';
import { useControllableModel } from '../../composables/useControllableModel';
import { useMessages } from '../../composables/useMessages';
import { cx, partClass } from '../../utils/cx';
import type { VariantPickerOption, VariantPickerProps } from './types';

const props = withDefaults(defineProps<VariantPickerProps>(), {
  modelValue: undefined,
  type: 'pills',
  classes: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  /** Spec "Variant picker" → Events: "`change`: fires with the new value. … Focus doesn't move." */
  change: [value: string];
}>();

const m = useMessages();

/**
 * Spec "Variant picker" → Properties, `value` row: "the first available option" is the default.
 * `useControllableModel`'s `fallback` is only ever read once, for the uncontrolled starting value —
 * exactly the hook this component needs, so no extra watcher picks the first option a second time.
 * Falls back to the very first option when none is available, rather than nothing: the spec's own
 * "sold-out options stay selectable" means a fully sold-out product still needs a legend and a
 * checked radio, not a picker that starts on no selection at all.
 */
const model = useControllableModel<string>(
  props,
  emit,
  () => props.options.find((option) => option.available)?.value ?? props.options[0]?.value ?? ''
);

function isSelected(value: string): boolean {
  return model.value === value;
}

const selectedOption = computed(() => props.options.find((option) => option.value === model.value));

/**
 * Spec "Variant picker" → Behaviour & motion: 'the legend value updates ("Size: M", "Colour: Clay,
 * sold out")'. The suffix reuses the shared `soldOut` message — lower-cased, since here it
 * continues a sentence ("Clay, sold out") rather than standing alone the way a badge's "Sold out"
 * does.
 *
 * `toLowerCase()` assumes `soldOut` has no interior capitals — true of `enUS`'s "Sold out" and
 * `isIS`'s "Uppselt" today, but not guaranteed for every future locale (an initialism, say). A
 * locale where mid-sentence lower-casing reads wrong needs a dedicated message key of its own
 * (e.g. `soldOutSuffix`) rather than a transform of `soldOut`.
 */
const soldOutSuffix = computed(() => m.value.soldOut.toLowerCase());

const legendValueText = computed(() => {
  const option = selectedOption.value;
  if (!option) return '';
  return option.available ? option.label : `${option.label}, ${soldOutSuffix.value}`;
});

const radioRefs = ref<(HTMLInputElement | null)[]>([]);

/**
 * Re-asserts `checked` on every radio after render — the same reason `RadioGroup` and `Checkbox`
 * do: a controlled parent that refuses the change leaves `modelValue` exactly as it was, so Vue's
 * bound `:checked` expression evaluates to the same booleans as before and patches nothing, while
 * the browser has already flipped the DOM's own `checked` properties on click.
 */
function syncElements(): void {
  props.options.forEach((option, index) => {
    const el = radioRefs.value[index];
    if (el) el.checked = isSelected(option.value);
  });
}
watchPostEffect(syncElements);

function onChange(option: VariantPickerOption): void {
  model.value = option.value;
  emit('change', option.value);
  syncElements();
}

/**
 * Spec "Variant picker" → Anatomy: "no border or padding." `min-w-0` keeps a long label or a
 * narrow container (the `Narrow` story) from forcing the fieldset wider than its own column.
 */
const rootClass = computed(() =>
  partClass(cx('block min-w-0 rounded-none border-0 p-0'), props.classes, 'root')
);

/**
 * Spec "Variant picker" → Anatomy, point 2: "the option name (weight 600) + the current value
 * (weight 400, `muted`), with a 0.5rem gap, baseline-aligned." `text-variant-legend` carries only
 * the size and line — see its own comment in `tailwind.css` for why the two weights cannot live in
 * one shorthand `font` declaration — so `font-semibold`/`text-text` here and `font-normal`/
 * `text-muted` on `legendValue` below are what split it into the spec's two runs.
 */
const legendClass = computed(() =>
  partClass(
    cx('mb-3 flex w-fit items-baseline gap-2 text-variant-legend font-semibold text-text'),
    props.classes,
    'legend'
  )
);

const legendValueClass = computed(() =>
  partClass(cx('text-variant-legend font-normal text-muted'), props.classes, 'legendValue')
);

/** Spec "Variant picker" → Anatomy, point 3: "wraps, 0.5rem (`space-2`) gap." */
const optionsClass = computed(() =>
  partClass(cx('flex flex-wrap gap-2'), props.classes, 'options')
);

/**
 * Spec "Variant picker" → Anatomy, point 4: "a `<label>` holding a native radio … and the visible
 * pill or swatch." `group` is what lets `radio`'s own hover state read `group-hover:*` below,
 * exactly as `RadioGroup`'s row does.
 */
const optionClass = computed(() =>
  partClass(cx('group inline-flex cursor-pointer'), props.classes, 'option')
);

/**
 * The drawn pill (spec "Variant picker" → Sizes, Pill row: "min 2.5rem (`control-height`), min
 * width 3rem | 0 1rem (`space-4`) | … | `radius-md`"). The native radio is `opacity-0` and
 * stretched *over* this element — the exact `Checkbox`/`RadioGroup` proxy-focus shape — which is
 * what makes `eldra-focus-proxy` draw the one focus ring here (spec "Focus ring" → Proxy focus)
 * rather than on the hidden input.
 */
const PILL_BASE =
  'relative inline-flex min-w-12 items-center justify-center control-h rounded-md px-4 ' +
  'eldra-variant-pill-border eldra-focus eldra-focus-proxy';

/** Spec "Variant picker" → States, table rows "Default"/"Hover": `background` fill, 1px
 * `border-strong` at rest, 1px `text` on hover. */
const PILL_DEFAULT = 'bg-background border-border-strong group-hover:border-text';
/** States, "Selected" row: `primary` fill and border. The fill alone already carries the state, so
 * the 1px border underneath the (invisible-against-the-fill) real border needs no colour of its
 * own beyond matching the fill. */
const PILL_SELECTED = 'bg-primary border-primary';
/** States, "Sold out" row: `background` fill, 1px **dashed** `border-strong` — the diagonal line
 * itself is the separate `soldOutLine` part, drawn on top. */
const PILL_SOLD_OUT = 'bg-background border-dashed border-border-strong group-hover:border-text';
/** States, "Sold out + selected" row: `surface-strong` fill, **2px** solid `text`. The real border
 * and the `eldra-variant-pill-selected-line` inset line share the same `text` colour so the two
 * 1px layers read as one 2px boundary rather than two different-coloured rings. */
const PILL_SOLD_OUT_SELECTED = 'bg-surface-strong border-text eldra-variant-pill-selected-line';

function pillState(option: VariantPickerOption): string {
  const selected = isSelected(option.value);
  if (!option.available) return selected ? PILL_SOLD_OUT_SELECTED : PILL_SOLD_OUT;
  return selected ? PILL_SELECTED : PILL_DEFAULT;
}

/** States, "Pill text" column: 500 by default, 600 selected; `muted` sold out, `primary-contrast`
 * selected, `text` sold-out-and-selected. Same shorthand-free reasoning as the legend above. */
function pillLabelState(option: VariantPickerOption): string {
  const selected = isSelected(option.value);
  if (!option.available) return selected ? 'font-semibold text-text' : 'font-medium text-muted';
  return selected ? 'font-semibold text-primary-contrast' : 'font-medium text-text';
}

/**
 * The swatch's own ring (spec "Variant picker" → Sizes, Swatch row: "2.75 × 2.75rem outer; a 2px
 * ring (transparent at rest), then a 3px gap, then the colour disc"). `size-11` is the 2.75rem
 * outer shape; `p-0.75` (`--spacing` × 0.75 = 0.1875rem = 3px) is the gap, which is also what lets
 * `swatchClass` below fill the remaining space with a plain `size-full` rather than a second
 * literal measurement. The ring stays `eldra-variant-swatch-ring`'s constant 2px width in every
 * state — only its colour changes below — so the swatch never resizes when it gains a ring; the
 * native radio and the proxy focus ring live on this same shape, same as the pill above.
 */
const SWATCH_BASE =
  'relative inline-flex size-11 shrink-0 items-center justify-center rounded-full p-0.75 ' +
  'eldra-variant-swatch-ring eldra-focus eldra-focus-proxy';
/** States, "Swatch" column, "Default"/"Hover" rows: transparent at rest, `border-strong` ring on
 * hover. */
const SWATCH_RING_DEFAULT = 'border-transparent group-hover:border-border-strong';
/** States, "Selected" and "Sold out + selected" rows: "2px ring `text`" either way — the sold-out
 * line is a separate part drawn on top, so the ring itself only ever depends on selection. */
const SWATCH_RING_SELECTED = 'border-text';

function radioClass(option: VariantPickerOption): string {
  const base =
    props.type === 'swatches'
      ? cx(SWATCH_BASE, isSelected(option.value) ? SWATCH_RING_SELECTED : SWATCH_RING_DEFAULT)
      : cx(PILL_BASE, pillState(option));
  return partClass(base, props.classes, 'radio');
}

/**
 * The colour disc (spec "Variant picker" → Sizes, Swatch row: "the colour disc with a 1px inner
 * `border-strong` edge"; → Accessibility: "pale swatches … keep a 3:1 boundary (1.4.11)"). A real
 * border, not an inset `box-shadow`, because forced-colours mode can drop a decorative shadow but
 * keeps a real one (spec "Actions and forms" → Forced colours) — see `eldra-variant-swatch-edge`'s
 * own comment in `tailwind.css`. The one per-item colour the spec allows (`swatch`, from product
 * data) is set as an inline style by the caller of this function, never a class.
 */
const swatchClass = computed(() =>
  partClass(
    cx('block size-full rounded-full border-border-strong eldra-variant-swatch-edge'),
    props.classes,
    'swatch'
  )
);

/**
 * Spec "Variant picker" → Sizes, Pill row: "0.9375rem, 500 (600 selected)." `text-variant-pill`
 * carries only the size and line, for the same shorthand-free reason `text-variant-legend` does.
 */
function pillLabelClass(option: VariantPickerOption): string {
  return partClass(cx('text-variant-pill', pillLabelState(option)), props.classes, 'label');
}

/**
 * Spec "Variant picker" → Variants, Swatches row: "The colour name lives in visually hidden text
 * inside the label"; → Accessibility: "the colour name is visually hidden text inside the label, so
 * it isn't conveyed by colour alone (1.4.1)."
 */
const swatchLabelClass = computed(() => partClass(cx('sr-only'), props.classes, 'label'));

function labelClass(option: VariantPickerOption): string {
  return props.type === 'swatches' ? swatchLabelClass.value : pillLabelClass(option);
}

/**
 * The swatch's sold-out diagonal line (spec "Variant picker" → Anatomy: "sold out: diagonal
 * line …"; → States, Sold out row: "2px diagonal line in `text` with a 1.5px `background`
 * halo, from 4px inside the top to 4px inside the bottom, rotated 45°"). An inline `<svg>` — see
 * `tailwind.css`'s own comment on why, the same forced-colours reasoning as the pill's line below.
 * `text-text` sets the `currentColor` the main `<line>` strokes with; the wider halo line under it
 * is `background`, given directly as a `var()` since it is a second, different colour on a sibling
 * element rather than the one `currentColor` an SVG root can carry.
 *
 * The endpoints are the spec's own geometry, not a CSS `rotate`: a vertical bar inset 4px from the
 * top and bottom of the 2.75rem swatch, centred, rotated 45° about the swatch's centre, comes out
 * at (34.73, 9.27) and (9.27, 34.73) of a 44-unit box — (78.9, 21.1) and (21.1, 78.9) as the
 * percentages `viewBox="0 0 100 100"` reads directly.
 */
const soldOutSwatchLineClass = computed(() =>
  partClass(
    cx('pointer-events-none absolute inset-0 size-full text-text'),
    props.classes,
    'soldOutLine'
  )
);

/**
 * The pill's sold-out diagonal line (spec "Variant picker" → States, Sold out row: "a 1px
 * diagonal `border-strong` line (bottom-left to top-right)"), on the `<svg>` in the template
 * below — see its own comment in `tailwind.css` for why a pill's line is an SVG rather than a
 * class-only utility. `text-border-strong` sets the `currentColor` the `<line>` strokes with.
 */
const soldOutPillLineClass = computed(() =>
  partClass(
    cx('pointer-events-none absolute inset-0 size-full text-border-strong'),
    props.classes,
    'soldOutLine'
  )
);
</script>

<template>
  <fieldset data-part="root" :class="rootClass">
    <legend data-part="legend" :class="legendClass">
      <span>{{ name }}: </span>
      <span data-part="legendValue" :class="legendValueClass">{{ legendValueText }}</span>
    </legend>

    <div data-part="options" :class="optionsClass">
      <label
        v-for="(option, index) in options"
        :key="option.value"
        data-part="option"
        :class="optionClass"
      >
        <span data-part="radio" :class="radioClass(option)">
          <!-- Native radio, invisible but focusable, stretched over the drawn pill or swatch —
               the pill/swatch is its appearance. Sold-out options are never `disabled` (spec
               "Variant picker" → Do/Don't: "Don't disable or hide sold-out options"), so arrow
               keys, wrapping and the single tab stop are exactly native <input type="radio">
               behaviour with no key handling of any kind here. -->
          <input
            :ref="(el) => (radioRefs[index] = el as HTMLInputElement | null)"
            class="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0"
            type="radio"
            :name="name"
            :value="option.value"
            :checked="isSelected(option.value)"
            @change="onChange(option)"
          />
          <span
            v-if="type === 'swatches'"
            data-part="swatch"
            :class="swatchClass"
            aria-hidden="true"
            :style="{ backgroundColor: option.swatch }"
          />
          <!-- Both sold-out lines are inline SVGs, not class-drawn shapes — see
               `soldOutSwatchLineClass` and `soldOutPillLineClass`'s own comments: a plain
               `background`/`box-shadow` line survives neither a pill's label-dependent width nor
               forced-colours mode (which drops both properties outright), while an SVG
               `<line stroke="currentColor">` keeps its geometry and stays visible in both. -->
          <svg
            v-if="!option.available && type === 'swatches'"
            data-part="soldOutLine"
            :class="soldOutSwatchLineClass"
            aria-hidden="true"
            viewBox="0 0 100 100"
            focusable="false"
          >
            <line
              x1="78.9"
              y1="21.1"
              x2="21.1"
              y2="78.9"
              stroke="var(--eldra-color-background)"
              stroke-width="5"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
            />
            <line
              x1="78.9"
              y1="21.1"
              x2="21.1"
              y2="78.9"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <svg
            v-if="!option.available && type !== 'swatches'"
            data-part="soldOutLine"
            :class="soldOutPillLineClass"
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            focusable="false"
          >
            <line
              x1="0"
              y1="100"
              x2="100"
              y2="0"
              stroke="currentColor"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <span data-part="label" :class="labelClass(option)">
            {{ option.label
            }}<span v-if="!option.available" class="sr-only">, {{ soldOutSuffix }}</span>
          </span>
        </span>
      </label>
    </div>
  </fieldset>
</template>
