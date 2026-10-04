<script setup lang="ts">
import { computed } from 'vue';
import { cx, partClass } from '../../utils/cx';
import { useEldraUiCurrency, useEldraUiLocale } from '../../composables/useLocale';
import { useMessages } from '../../composables/useMessages';
import {
  createNumberFormat,
  currencyFractionDigits,
  formatCurrency,
} from '../../utils/number-format';
import ValueText from '../internal/ValueText.vue';
import Spinner from '../spinner/Spinner.vue';
import type { PriceProps, PriceSize } from './types';

const props = withDefaults(defineProps<PriceProps>(), {
  compareAt: undefined,
  currency: undefined,
  locale: undefined,
  size: 'md',
  from: false,
  narrowSymbol: true,
  unitPrice: undefined,
  labels: undefined,
  lang: undefined,
  loading: false,
  revalidating: false,
  announce: true,
  classes: undefined,
});

/**
 * `loading` wins when both are set (`PriceProps.revalidating`): there is no value to keep on
 * screen while the skeleton is showing, so a spinner beside it would be announcing the refresh of
 * something that is not there.
 */
const isRevalidating = computed(() => props.revalidating && !props.loading);

/**
 * The dim itself — `eldra-revalidating` (`tailwind.css`), which resolves
 * `--eldra-revalidating-opacity`. It is applied to each value part rather than to the root,
 * because CSS opacity composites down the tree: a dimmed root would take the spinner with it, and
 * a child cannot be more opaque than its parent. The spinner is the state's own signal and stays
 * at full strength.
 *
 * The dim says the amount on screen may be a moment old; the other half of the treatment is that
 * the amount *changing* is eased rather than simply replaced. `ValueText` (the inner span each
 * amount is rendered into, below) fades it in over `--eldra-duration-base` whenever its formatted
 * text changes, on the element that already holds the new text. Nothing fades out: a leaving half
 * would keep the previous amount on screen after `aria-busy`, the dim and the spinner had already
 * gone, which on a price is exactly the thing not to do. See `src/utils/valueFade.ts` for the
 * rest — why one element rather than a keyed `<Transition>`, and how reduced motion is answered.
 */
const dim = computed(() => (isRevalidating.value ? 'eldra-revalidating' : ''));

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
 * where a throw breaks the whole render, not just the price ("never throw from a computed" — the
 * same rule `src/utils/date.ts#formatDate` follows for a malformed date, for the identical reason).
 * On failure, fall back to a plain decimal formatter and append the raw code after the number
 * (`"1,234 XYZ1"`), and warn once per bad code in dev so the mistake is visible without taking the
 * page down. `currencyFractionDigits` (used by `toMajor` above) already guards the same
 * construction internally and defaults to 2, so it needs no change here.
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
 * Every amount is formatted by the package's own `formatCurrency` — the canonical copy of the
 * private library's currency formatter — so a price, a `CurrencyInput` and a theme's own formatted
 * sentence on the same page cannot write the same money three ways. Two of its arguments are
 * decided here rather than left to its defaults:
 *
 * - `narrowSymbol` is the prop, `true` by default and the same default `CurrencyInput` carries:
 *   `"kr 2,800"`, not `"ISK 2,800"`, under `en-US`/`ISK` (see `PriceProps.narrowSymbol`).
 * - `maxFraction` **and** `minFraction` are both the **currency's** own count (`fractionDigits`,
 *   above). The maximum matters because the util's default of `2` would print `2800.4` krónur as
 *   `"kr 2,800.4"` and round a three-decimal currency to two. The minimum is the util's
 *   *display* rule, and it is why a price reads `"$48.00"` rather than `"$48"`: called with five
 *   arguments the formatter pads nothing, which is right for a currency *field* showing what
 *   someone typed and ragged in a price list, where one row reading `$96` above another reading
 *   `$96.50` is not a column of money. A zero-decimal currency is unaffected by either — its own
 *   count is `0`, so `"kr 2,800"` stays exactly that.
 *
 * `invalid` records whether the currency code is one `Intl` rejects: `formatCurrency` throws for
 * such a code exactly as the private helper does, and this runs inside a `computed`, where a throw
 * breaks the whole render rather than just the price. So the code is probed once per
 * locale/currency/sign change rather than per amount, and `formatAmount` below falls back to a
 * plain decimal with the raw code appended (`"1,234 XYZ1"`).
 */
const currencyFormat = computed<{ format: (major: number) => string; invalid: boolean }>(() => {
  const format = (major: number): string =>
    formatCurrency(
      major,
      locale.value,
      currency.value,
      props.narrowSymbol,
      fractionDigits.value,
      fractionDigits.value
    );

  try {
    format(0);
    return { format, invalid: false };
  } catch {
    warnInvalidCurrency(currency.value);
    const formatter = createNumberFormat({ locale: locale.value, style: 'decimal' });
    return { format: (major) => formatter.format(major), invalid: true };
  }
});

function formatAmount(minorUnits: number): string {
  const { format, invalid } = currencyFormat.value;
  const formatted = format(toMajor(minorUnits));
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
 * `w-full` applies only while `loading`. The skeleton below is `w-[35%]`, and a percentage width
 * on a flex item cannot resolve against a flex container whose own width is `auto` —
 * `inline-flex`'s ordinary shrink-to-fit sizing — so without this the skeleton silently collapses
 * to 0 and renders invisible (confirmed empirically: both the `Loading` and `ReducedMotion`
 * screenshots were blank before this was added). Giving the root a definite width exactly when
 * there is a percentage child depending on one fixes it without affecting the ordinary
 * (non-loading) inline-flex row, which has no such child.
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
    cx('text-price-current', isSale.value ? 'text-accent' : 'text-text', SECTION, dim.value),
    props.classes,
    'current'
  )
);

/** Spec "Price" → Anatomy, part 3: a real `<s>`, `muted`, struck through at 1px. */
const compareAtClass = computed(() =>
  partClass(
    cx('text-price-secondary text-muted line-through decoration-1', SECTION, dim.value),
    props.classes,
    'compareAt'
  )
);

/** Spec "Price" → States, "From / unit" row: label `muted`. */
const fromClass = computed(() =>
  partClass(cx('text-price-secondary text-muted', SECTION, dim.value), props.classes, 'from')
);

const unitClass = computed(() =>
  partClass(cx('text-price-unit text-muted basis-full', SECTION, dim.value), props.classes, 'unit')
);

const srTextClass = computed(() => partClass('sr-only', props.classes, 'srText'));

/**
 * The two elements the fade plays on: an inner span per money value (`ValueText`), carrying
 * nothing of its own but the text and whatever `classes.currentValue`/`classes.compareAtValue`
 * adds. They exist so the fade and the dim are on different elements — opacity composites down the
 * tree, so the inner span fades 0 -> 1 *inside* the part's own `--eldra-revalidating-opacity`
 * instead of fighting it for the same property — and nothing else about the price's boxes changes:
 * an inline span in an inline formatting context adds no width, no line box and no baseline of its
 * own, and `tabular-nums` is inherited from the part.
 */
const currentValueClass = computed(() => partClass('', props.classes, 'currentValue'));
const compareAtValueClass = computed(() => partClass('', props.classes, 'compareAtValue'));

/**
 * Spec "Price" → States, Loading row: "text skeleton (`surface-strong`) at 35% width" — every
 * other column is blank, so loading replaces the whole price with one shape rather than a
 * skeleton per part. `w-[35%]` is the spec's own literal percentage, not a rem magnitude with a
 * token to reach for, so it stays a percentage rather than a fixed width — the height still tracks
 * the current type size via the relative `0.85em`.
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

/**
 * The spinner takes no room at all: a flex item of width `0` whose `-ms-2` cancels, exactly, the
 * `gap-x-2` the root would otherwise put in front of it, with the circle itself absolutely
 * positioned inside that zero-width box and overflowing to the right of it. So the price's own
 * width, its characters and its line breaks are identical with the state on and off — which is
 * what "no layout shift" has to mean for a value that is already on screen and only being
 * refreshed — while the circle still lands immediately after the last amount. Anchoring it to the
 * root's own box instead (`absolute` + `start-full`) looked equivalent and is not: a `Price` is an
 * `inline-flex`, and a flex or grid parent stretches that box to the column, which put the spinner
 * at the far edge of the column rather than beside the price (caught in the screenshot baseline).
 *
 * It renders *before* the unit line in the template for a related reason: `unit` is `basis-full`,
 * so anything after it wraps onto a third line instead of sitting beside the amount.
 *
 * `size-[1em]` tracks the price's own type size at every `size` — the "≤ 1em" the refresh design
 * asks for — and its `start-[0.25em]` offset from the amount is in `em` for the same reason: a
 * fixed `0.25rem` reads as a sensible gap at `sm` and as crowding at `lg`. `self-center` centres
 * it on the line it sits in, and `text-muted` keeps it furniture beside the number rather than
 * part of it.
 */
const spinnerClass = computed(() =>
  partClass(
    'pointer-events-none relative -ms-2 flex h-[1em] w-0 shrink-0 self-center text-muted',
    props.classes,
    'spinner'
  )
);

/**
 * Named `srStatus`, not `status`: `LoadMore` already owns a visible `status` part ("Showing 24 of
 * 96"), and a page holding both — a collection grid is exactly that — makes `[data-part="status"]`
 * ambiguous for a consumer's own selector (it broke the starter's own `LoadMore` assertion the
 * first time round). `sr` also matches the package's existing `srText` part, which is the same
 * kind of thing: text present for assistive technology only.
 *
 * The live region is rendered whether or not there is anything to say, and only its text changes:
 * a region that arrives in the DOM already holding its message is announced unreliably, because a
 * screen reader takes the region and its content in one pass and has no change to report. It is
 * `sr-only` — the refresh is visible to a sighted reader as the dim and the spinner.
 *
 * `announce: false` drops the region outright (not just its text) for a page that says it once
 * itself: a grid of 24 refreshing cards otherwise holds 48 polite regions, each announcing
 * separately. `aria-busy` and the visual state are unaffected — the value is still marked busy,
 * the caller has simply taken over the sentence.
 */
const srStatusClass = computed(() => partClass('sr-only', props.classes, 'srStatus'));
const srStatusText = computed(() => (isRevalidating.value ? messages.value.updatingPrice : ''));
</script>

<template>
  <p
    data-part="root"
    :class="rootClass"
    :lang="lang ?? undefined"
    :aria-busy="isRevalidating ? 'true' : undefined"
  >
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
        ><span data-part="srText" :class="srTextClass">{{ saleLabel }}</span
        >{{ ' ' }}</template
      ><span data-part="current" :class="currentClass"
        ><ValueText
          data-part="currentValue"
          :class="currentValueClass"
          :text="formattedCurrent" /></span
      ><template v-if="isSale"
        >{{ ' ' }}<span data-part="srText" :class="srTextClass">{{ regularLabel }}</span
        >{{ ' '
        }}<s data-part="compareAt" :class="compareAtClass"
          ><ValueText
            data-part="compareAtValue"
            :class="compareAtValueClass"
            :text="formattedCompareAt" /></s></template
      ><span v-if="isRevalidating" data-part="spinner" :class="spinnerClass" aria-hidden="true"
        ><Spinner class="absolute start-[0.25em] top-0 size-[1em]" /></span
      ><template v-if="unitPrice"
        >{{ ' ' }}<span data-part="unit" :class="unitClass">{{ formattedUnitLine }}</span></template
      >
    </template>
    <span v-if="announce" data-part="srStatus" :class="srStatusClass" aria-live="polite">{{
      srStatusText
    }}</span>
  </p>
</template>
