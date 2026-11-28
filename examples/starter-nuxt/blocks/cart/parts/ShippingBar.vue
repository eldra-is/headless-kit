<script setup lang="ts">
/**
 * The cart's free-shipping note: one sentence in words plus an `aria-hidden` progress bar (spec
 * `02-blocks.md` "Cart" → States, "Free shipping pending"/"Free shipping unlocked"; Accessibility:
 * "The shipping message is `role="status"` … The bar is `aria-hidden`").
 *
 * The threshold is the store's own (`freeShippingThreshold` from its delivery methods, in the
 * cart's currency; `blocks/cart/Block.vue`), in major units like every cart amount
 * (`app/storefront/types.ts`), so the two compare directly and only the `<Price>` below converts
 * (`money.minor`, because `@eldrajs/ui` money inputs read minor units). No threshold, or a
 * non-positive one, renders nothing at all, which also keeps the bar from claiming the shopper is
 * 0 away from anything.
 *
 * The remaining amount is a real `<Price>` inside the sentence, not a formatted string spliced into
 * the translation: vue-i18n's `Translation` fills `{amount}` from a slot, so the words either side
 * stay translated, the amount sits where each language puts it, and the money keeps the store's
 * own currency and locale formatting. No `tag`: `Price`'s root is a `<p>`, and a `<p>` inside a
 * `<span>` is not valid HTML, so the words and the price render straight into the status row.
 */
import { computed } from 'vue';
import { Price } from '@eldrajs/ui';
import { Translation, useI18n } from 'vue-i18n';
import { roundMoney, useMoney } from '../../../app/storefront/money';
import EldraIcon from '../../../app/components/EldraIcon.vue';

const props = withDefaults(
  defineProps<{
    /** The store's free-shipping threshold in the cart's currency, major units. `null` renders nothing. */
    threshold?: number | null;
    /** The cart subtotal, in major units. */
    subtotal: number;
    /** `edge` spans the drawer edge to edge on `surface`; `card` is the page's rounded panel. */
    panel?: 'edge' | 'card';
  }>(),
  { threshold: null, panel: 'card' }
);

const { t } = useI18n();
const money = useMoney();

const thresholdAmount = computed<number | null>(() => {
  const amount = props.threshold;
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : null;
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
 * The message's `{amount}` is filled by `Translation`'s `amount` slot, so the money renders as a
 * `<Price>` wherever the translation puts it ("You're {amount} away…", "Þú ert {amount} frá…").
 * Reading the template with no params and splitting it does not work: vue-i18n fills a missing
 * `{amount}` with nothing, so there is no slot left to split on and the price lands at the end.
 */

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
        <Translation keypath="cart.awayFromFree" scope="global">
          <template #amount
            ><Price :amount="money.minor(remaining)" class="inline font-semibold"
          /></template>
        </Translation>
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
