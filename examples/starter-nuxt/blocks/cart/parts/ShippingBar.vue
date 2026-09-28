<script setup lang="ts">
/**
 * The cart's free-shipping note: one sentence in words plus an `aria-hidden` progress bar (spec
 * `02-blocks.md` "Cart" → States, "Free shipping pending"/"Free shipping unlocked"; Accessibility:
 * "The shipping message is `role="status"` … The bar is `aria-hidden`").
 *
 * The threshold is a CMS string in major units ("80.00") and so is every cart amount
 * (`app/storefront/types.ts`), so the two compare directly and only the `<Price>` below converts
 * (`money.minor`, because `@eldrajs/ui` money inputs read minor units).
 * An empty, non-numeric or non-positive threshold renders nothing at all (spec Fields table:
 * "Empty hides the shipping bar"), which is also what keeps a mistyped field from drawing a bar
 * that would claim the shopper is 0 away from anything.
 *
 * The remaining amount is a real `<Price>` inside the sentence, not a formatted string spliced into
 * the translation: `awayParts` interpolates the message once against a sentinel and splits the
 * *result* around it, so the words either side stay translated and the money keeps the store's own
 * currency and locale formatting (the same technique `blocks/article/Block.vue` uses to put a
 * `<Link>` inside its byline). `Price`'s root is a `<p>`, so the row's own text is `<span>`s beside
 * it rather than a paragraph wrapping it — a `<p>` inside a `<p>` is not valid HTML.
 */
import { computed } from 'vue';
import { Price } from '@eldrajs/ui';
import { useT } from '../../../app/composables/useT';
import { roundMoney, useMoney } from '../../../app/storefront/money';
import EldraIcon from '../../../app/components/EldraIcon.vue';

const props = withDefaults(
  defineProps<{
    /** The `freeShippingThreshold` field, in major units. Empty/invalid renders nothing. */
    threshold?: string;
    /** The cart subtotal, in major units. */
    subtotal: number;
    /** `edge` spans the drawer edge to edge on `surface`; `card` is the page's rounded panel. */
    panel?: 'edge' | 'card';
  }>(),
  { threshold: undefined, panel: 'card' }
);

const t = useT();
const money = useMoney();

const thresholdAmount = computed<number | null>(() => {
  const raw = (props.threshold ?? '').trim();
  if (raw === '') return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
});

const remaining = computed(() =>
  roundMoney(Math.max(0, (thresholdAmount.value ?? 0) - props.subtotal))
);
const unlocked = computed(() => thresholdAmount.value !== null && remaining.value === 0);

/** 0–100, so the bar is never wider than its track however large the subtotal grows. */
const percent = computed(() => {
  const threshold = thresholdAmount.value;
  if (threshold === null) return 0;
  return Math.min(100, Math.round((props.subtotal / threshold) * 100));
});

/**
 * The message is read *un-interpolated* and split on its own `{amount}` placeholder, so the
 * translated words either side of the money can render as text and the amount itself as a `<Price>`
 * (`useT()` returns the template verbatim when it is called with no params).
 */
const AMOUNT_SLOT = '{amount}';
const awayParts = computed(() => {
  const [before = '', after = ''] = t('cart.awayFromFree').split(AMOUNT_SLOT);
  return { before: before.trim(), after: after.trim() };
});

const rootClass = computed(() =>
  props.panel === 'edge'
    ? 'bg-surface border-border border-b px-4 py-4'
    : 'bg-surface rounded-lg p-4'
);
</script>

<template>
  <div v-if="thresholdAmount !== null" :class="rootClass">
    <div
      role="status"
      class="text-body-sm flex flex-wrap items-center gap-x-1 gap-y-1"
      :class="unlocked ? 'text-success font-semibold' : 'text-text'"
    >
      <EldraIcon name="truck" size="sm" class="me-1 shrink-0" />
      <template v-if="unlocked">
        <span>{{ t('cart.freeUnlocked') }}</span>
      </template>
      <template v-else>
        <span>{{ awayParts.before }}</span>
        <Price :amount="money.minor(remaining)" :classes="{ root: 'inline font-semibold' }" />
        <span>{{ awayParts.after }}</span>
      </template>
    </div>
    <div aria-hidden="true" class="bg-surface-strong mt-2 h-1 w-full overflow-hidden rounded-full">
      <div
        class="motion-safe:duration-base h-full rounded-full motion-safe:transition-[width] motion-safe:ease-out"
        :class="unlocked ? 'bg-success' : 'bg-primary'"
        :style="{ width: `${percent}%` }"
      />
    </div>
  </div>
</template>
