<script setup lang="ts">
import { computed } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { useEldraUiCurrency, useEldraUiLocale } from '../../composables/useLocale';
import { useMessages } from '../../composables/useMessages';
import { createNumberFormat, currencyFractionDigits } from '../../utils/number-format';
import type { PriceProps, PriceSize } from './types';

const props = withDefaults(defineProps<PriceProps>(), {
  compareAt: undefined,
  currency: undefined,
  locale: undefined,
  size: 'md',
  from: false,
  unitPrice: undefined,
  labels: undefined,
  lang: undefined,
  loading: false,
  classes: undefined,
});

const ambientLocale = useEldraUiLocale();
const ambientCurrency = useEldraUiCurrency();
const messages = useMessages();

const locale = computed(() => props.locale ?? ambientLocale.value);
const currency = computed(() => props.currency ?? ambientCurrency.value);

/**
 * Spec "Price" → Properties, `compareAt` row: "Sale state turns on automatically only when
 * `compareAt > amount`; otherwise it is ignored." A `compareAt` equal to or below `amount` is not
 * a sale — a store correcting a price upward must not render a struck-through "discount".
 */
const isSale = computed(() => props.compareAt != null && props.compareAt > props.amount);

/**
 * Amounts arrive in minor units (spec "Price" → Properties, `amount` row: "in minor units
 * (cents)"). `currencyFractionDigits` reads the currency's own minor-unit count from ICU data —
 * 2 for `USD`, 0 for `ISK` — so `toMajor` divides by the right power of ten whatever the currency,
 * and a zero-decimal currency's minor units equal its major units untouched.
 */
const fractionDigits = computed(() => currencyFractionDigits(currency.value, locale.value));
function toMajor(minorUnits: number): number {
  return minorUnits / 10 ** fractionDigits.value;
}

/**
 * `Intl.NumberFormat`'s constructor throws `RangeError` for a currency code it does not recognise
 * — an unknown or malformed ISO 4217 code (`'XYZ1'`, `''`) — and this runs inside a `computed`,
 * where a throw breaks the whole render, not just the price (task-2-fix-1.md item 2: "Never throw
 * from a computed"). On failure, fall back to a plain decimal formatter and append the raw code
 * after the number (`"1,234 XYZ1"`), and warn once per bad code in dev so the mistake is visible
 * without taking the page down. `currencyFractionDigits` (used by `toMajor` above) already guards
 * the same construction internally and defaults to 2, so it needs no change here.
 *
 * `lastWarnedInvalidCurrency` is a plain closure variable, not a `ref` — it exists only to
 * de-duplicate the warning, never to drive a re-render — and it is scoped to this component
 * instance (`<script setup>` re-runs per mount), so it neither leaks across unrelated `<Price>`s
 * on the same page nor accumulates for the life of the app.
 */
let lastWarnedInvalidCurrency: string | null = null;
function warnInvalidCurrency(code: string): void {
  if (!import.meta.env?.DEV || lastWarnedInvalidCurrency === code) return;
  lastWarnedInvalidCurrency = code;
  console.warn(
    `[@eldrajs/ui] <Price currency="${code}"> is not a valid ISO 4217 currency code; falling ` +
      'back to plain number formatting.'
  );
}

/**
 * `Intl.NumberFormat({ style: 'currency' })` already applies the currency's own fraction-digit
 * rule when formatting — no minor units for `ISK`/`JPY`, two for `USD` — so once `toMajor` has
 * converted the raw integer, the formatter needs nothing else to produce `"$48.00"` or `"6.990
 * kr."` exactly (spec "Price" → Variants, Locale row). `invalid` records whether construction fell
 * back, so `formatAmount` below knows to append the raw code itself.
 */
const currencyFormat = computed<{ formatter: Intl.NumberFormat; invalid: boolean }>(() => {
  try {
    return {
      formatter: createNumberFormat({
        locale: locale.value,
        style: 'currency',
        currency: currency.value,
      }),
      invalid: false,
    };
  } catch {
    warnInvalidCurrency(currency.value);
    return {
      formatter: createNumberFormat({ locale: locale.value, style: 'decimal' }),
      invalid: true,
    };
  }
});

function formatAmount(minorUnits: number): string {
  const { formatter, invalid } = currencyFormat.value;
  const formatted = formatter.format(toMajor(minorUnits));
  return invalid ? `${formatted} ${currency.value}` : formatted;
}

const formattedCurrent = computed(() => formatAmount(props.amount));
const formattedCompareAt = computed(() =>
  props.compareAt != null ? formatAmount(props.compareAt) : ''
);

/** Spec "Price" → Anatomy, part 4: "$5.10 / 100 g" — the formatted per-unit amount plus
 * `messages.perUnit`'s separator and the caller's own `per` text, rendered verbatim. */
const formattedUnitLine = computed(() => {
  if (!props.unitPrice) return '';
  const amount = formatAmount(props.unitPrice.amount);
  return `${amount} ${messages.value.perUnit(props.unitPrice.per)}`;
});

/**
 * `labels` overrides each of the three texts independently (spec "Price" → Properties, `labels`
 * row); anything not overridden falls back to `useMessages()`, so a consumer overriding only
 * `from` still gets the default hidden sale/regular labels.
 */
const saleLabel = computed(() => props.labels?.sale ?? messages.value.salePrice);
const regularLabel = computed(() => props.labels?.regular ?? messages.value.regularPrice);
const fromLabel = computed(() => props.labels?.from ?? messages.value.from);

/**
 * Only `sm` and `lg` set an explicit size; `md` inherits (spec "Price" → Sizes, Current column:
 * "inherits parent (1rem by default)") — see `text-price-sm`/`text-price-lg` in `tailwind.css`.
 */
const SIZE_CLASS: Record<PriceSize, string> = {
  sm: 'text-price-sm',
  md: '',
  lg: 'text-price-lg',
};

/**
 * Spec "Section" → "Colour switching on primary and accent sections": "Price … (outside cards)
 * inherit `primary-contrast`/`accent-contrast`; sale colour dropped." The same
 * `group-data-[section=…]/section:` mechanism `Button` and `Link` already use — a coloured
 * `Section` (a later task) renders `class="group/section" data-section="primary|accent"`, and a
 * `Card` between it and a `Price` shadows the named group with its own unprefixed `group/section`
 * (no `data-section`), which is what keeps a card's own price on the card's normal colours per the
 * same rule ("Cards … keep their own `background` fill and normal colours"). These utilities are
 * layered on top of every part's own colour class rather than replacing it, so on an ordinary
 * section they do nothing at all; only a `Section` ancestor with a matching `data-section` turns
 * them on, in which case they win in the generated stylesheet regardless of source order the same
 * way `Link`'s `SECTION` constant already does.
 */
const SECTION =
  'group-data-[section=primary]/section:text-primary-contrast ' +
  'group-data-[section=accent]/section:text-accent-contrast';

/**
 * `w-full` applies only while `loading`. The skeleton below is `w-[35%]` (task-2-fix-1.md item
 * 1), and a percentage width on a flex item cannot resolve against a flex container whose own
 * width is `auto` — `inline-flex`'s ordinary shrink-to-fit sizing — so without this the skeleton
 * silently collapses to 0 and renders invisible (confirmed empirically: both the `Loading` and
 * `ReducedMotion` screenshots were blank before this was added). Giving the root a definite width
 * exactly when there is a percentage child depending on one fixes it without affecting the
 * ordinary (non-loading) inline-flex row, which has no such child.
 */
const rootClass = computed(() =>
  partClass(
    cx(
      'inline-flex flex-wrap items-baseline gap-x-2 gap-y-0',
      props.loading && 'w-full',
      SIZE_CLASS[props.size]
    ),
    props.classes,
    'root'
  )
);

/** Spec "Price" → States: Regular current is `text`; Sale current is `accent`. */
const currentClass = computed(() =>
  partClass(
    cx('text-price-current', isSale.value ? 'text-accent' : 'text-text', SECTION),
    props.classes,
    'current'
  )
);

/** Spec "Price" → Anatomy, part 3: a real `<s>`, `muted`, struck through at 1px. */
const compareAtClass = computed(() =>
  partClass(
    cx('text-price-secondary text-muted line-through decoration-1', SECTION),
    props.classes,
    'compareAt'
  )
);

/** Spec "Price" → States, "From / unit" row: label `muted`. */
const fromClass = computed(() =>
  partClass(cx('text-price-secondary text-muted', SECTION), props.classes, 'from')
);

const unitClass = computed(() =>
  partClass(cx('text-price-unit text-muted basis-full', SECTION), props.classes, 'unit')
);

const srLabelClass = computed(() => partClass('sr-only', props.classes, 'srLabel'));

/**
 * Spec "Price" → States, Loading row: "text skeleton (`surface-strong`) at 35% width" — every
 * other column is blank, so loading replaces the whole price with one shape rather than a
 * skeleton per part. `w-[35%]` is the spec's own literal percentage, not a rem magnitude with a
 * token to reach for (task-2-fix-1.md item 1), so it stays a percentage rather than a fixed
 * width — the height still tracks the current type size via the relative `0.85em`.
 * `eldra-skeleton` (`tailwind.css`) is the shimmer this component shares with the `Skeleton`
 * primitive a later task adds.
 */
const skeletonClass = computed(() =>
  partClass(
    'eldra-skeleton inline-block align-middle rounded-sm h-[0.85em] w-[35%]',
    props.classes,
    'skeleton'
  )
);
</script>

<template>
  <p data-part="root" :class="rootClass" :lang="lang ?? undefined">
    <!--
      Every space below is an explicit `{{ ' ' }}` interpolation, never whitespace-only text
      between tags: Vue's default template compiler strips any run of whitespace that contains a
      newline, so a "naturally" indented multi-line template renders with no space between parts
      at all — "Sale price$38.40" rather than "Sale price $38.40" (spec "Price" → Acceptance
      criteria: the sentence a screen reader reads is exactly "Sale price $38.40 Regular price
      $48.00"). This comment lives inside the root `<p>` rather than above it, so the template
      keeps a single root element instead of becoming a fragment.
    -->
    <span v-if="loading" data-part="skeleton" :class="skeletonClass" aria-hidden="true" />
    <template v-else>
      <template v-if="from"
        ><span data-part="from" :class="fromClass">{{ fromLabel }}</span
        >{{ ' ' }}</template
      ><template v-if="isSale"
        ><span data-part="srLabel" :class="srLabelClass">{{ saleLabel }}</span
        >{{ ' ' }}</template
      ><span data-part="current" :class="currentClass">{{ formattedCurrent }}</span
      ><template v-if="isSale"
        >{{ ' ' }}<span data-part="srLabel" :class="srLabelClass">{{ regularLabel }}</span
        >{{ ' '
        }}<s data-part="compareAt" :class="compareAtClass">{{ formattedCompareAt }}</s></template
      ><template v-if="unitPrice"
        >{{ ' ' }}<span data-part="unit" :class="unitClass">{{ formattedUnitLine }}</span></template
      >
    </template>
  </p>
</template>
