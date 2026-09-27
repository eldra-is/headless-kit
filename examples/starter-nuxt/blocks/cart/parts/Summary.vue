<script setup lang="ts">
/**
 * The cart page's order summary: the discount code, the totals, Check out, the note and the payment
 * icons (spec `02-blocks.md` "Cart" → Layout, "Summary"). An `<aside>` labelled by its own `h2`,
 * sticky beside the items from 64rem of container width.
 *
 * **Discount states.** Applied is a `role="status"` line — a check icon, "Applied:" and a removable
 * `Chip` whose remove button is renamed through the package's own `messages.removeTag` so it reads
 * "Remove discount code WINTER15" rather than the generic "Remove WINTER15" — plus a
 * "Discount (WINTER15) −$21.00" row in `success` among the totals. A refused code marks the `Input`
 * invalid — but only when the backend actually refused the *code*; a request that failed or a
 * backend with no discount support gets its own message and leaves the field alone (see
 * `DiscountRefusal`). Either way it is a `role="alert"` linked by `aria-describedby`: the error is the block's
 * own element rather than `FieldWrapper`'s `error` prop, because the wrapper's error row is a plain
 * `<p>` (correct for a field the shopper is still filling in, but the spec asks for an alert here) —
 * the same "hand-written row reusing `FieldError`'s recipe" the `newsletter` block already uses for
 * its consent error. The alert is cleared as soon as the code is edited, both because a corrected
 * field should stop shouting and because `FormLayout` refuses to submit a form that still contains
 * an `aria-invalid` control.
 *
 * **Money.** Every amount is a `<Price>`, which formats from the store's own currency and locale —
 * including the discount row, passed as a negative amount so the minus sign is the locale's own.
 * Shipping is the one row that can be words instead of a number: `null` reads "Calculated at
 * checkout" and `0` reads "Free" (`app/storefront/types.ts`).
 *
 * **Check out** is a link styled as a primary `lg` button, so it is a navigation the browser can
 * open in a new tab. With no checkout URL from the store there is nothing to link to, and a button
 * that goes nowhere is worse than none, so the row renders nothing at all until the store has one.
 */
import { computed, inject, ref, watch } from 'vue';
import {
  Button,
  Chip,
  FieldWrapper,
  FormLayout,
  Input,
  MESSAGES_KEY,
  Price,
  provideEldraUiMessages,
  type FormLayoutSubmitPayload,
} from '@eldrajs/ui';
import { useStorefront } from '../../../app/composables/useStorefront';
import { useT } from '../../../app/composables/useT';
import { useUiId } from '../../../app/composables/useUiId';
import EldraIcon from '../../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../../app/components/EldraRouterLink.vue';
import { isInternalHref, safeHref } from '../../../app/utils/links';

const props = withDefaults(
  defineProps<{
    /** The `h2` this `<aside>` is labelled by — the id is the host block's, so it stays unique. */
    headingId: string;
    showDiscount?: boolean;
    showPaymentIcons?: boolean;
    note?: string;
  }>(),
  { showDiscount: true, showPaymentIcons: true, note: '' }
);

const t = useT();
const cart = useStorefront().cart;

/**
 * `Chip` names its remove button from `messages.removeTag` ("Remove WINTER15") and takes no
 * `messages` prop of its own, so the spec's "Remove discount code WINTER15" is set by providing the
 * overridden message to this subtree — the inherited set spread back in first, so the rest of the
 * package's strings stay whatever the app (and its content locale) provided. The label the chip
 * passes in *is* the code, and `t` reads the active locale on every call, so one static provide
 * covers every code and every locale.
 */
const inheritedUiMessages = inject(MESSAGES_KEY, undefined);
provideEldraUiMessages({
  ...inheritedUiMessages,
  removeTag: (label: string) => t('cart.removeCode', { code: label }),
});

const uid = useUiId();
const errorId = `cart-discount-error-${uid}`;

const totals = computed(() => cart.totals.value);
const discount = computed(() => totals.value?.discount ?? null);

const code = ref('');
const applying = ref(false);

/**
 * Why the code was refused, never just "it was". `StorefrontAck.reason` (`app/storefront/types.ts`)
 * separates a code the backend does not recognise from a request that never got an answer, and the
 * cart store answers `{ ok: false, reason: 'failed' }` for anything that threw — so reporting every
 * refusal as a misspelling tells a shopper whose connection dropped to check their spelling. Only
 * `invalid` is the field's fault, so only `invalid` marks the `Input`; the other two are about the
 * request and say so. (The store also keeps the underlying message in `cart.error`, which stays out
 * of the UI: it is a backend string, not one of this theme's translated sentences.)
 */
type DiscountRefusal = { reason: 'invalid'; code: string } | { reason: 'failed' | 'unsupported' };

const refusal = ref<DiscountRefusal | null>(null);
const isInvalidCode = computed(() => refusal.value?.reason === 'invalid');

const refusalMessage = computed(() => {
  const current = refusal.value;
  if (current === null) return '';
  if (current.reason === 'invalid') return t('cart.invalidCode', { code: current.code });
  return current.reason === 'unsupported' ? t('cart.applyUnsupported') : t('cart.applyFailed');
});

watch(code, () => {
  refusal.value = null;
});

async function onApply(payload: FormLayoutSubmitPayload): Promise<void> {
  payload.event.preventDefault();
  if (applying.value) return;
  const entered = code.value.trim().toUpperCase();
  if (entered === '') return;
  applying.value = true;
  try {
    const ack = await cart.applyDiscount(entered);
    if (ack.ok) {
      code.value = '';
      refusal.value = null;
    } else if (ack.reason === 'unsupported' || ack.reason === 'failed') {
      refusal.value = { reason: ack.reason };
    } else {
      refusal.value = { reason: 'invalid', code: entered };
    }
  } finally {
    applying.value = false;
  }
}

function onRemoveCode(applied: string): void {
  void cart.removeDiscount(applied);
}

const checkoutHref = computed(() => safeHref(cart.checkoutUrl.value));
const checkoutAs = computed(() =>
  checkoutHref.value !== null && isInternalHref(checkoutHref.value) ? EldraRouterLink : undefined
);

/** Spec Accessibility: "The payment icons are one image labelled 'We accept Visa, Mastercard,
 *  PayPal and Apple Pay'" — one `role="img"`, not four named marks. Tabler ships no
 *  `brand-apple-pay`, so Apple Pay is `brand-apple` (the same ruling the `trust-strip` block
 *  records); the name above is what says which methods these are. */
const PAYMENT_ICONS = ['brand-visa', 'brand-mastercard', 'brand-paypal', 'brand-apple'];

const ROW_CLASS = 'flex items-baseline justify-between gap-4';
const LABEL_CLASS = 'text-muted text-body-sm';
const VALUE_CLASS = 'text-text text-body-sm font-medium tabular-nums';
</script>

<template>
  <aside
    :aria-labelledby="props.headingId"
    class="bg-surface @content:sticky @content:top-6 grid gap-5 rounded-lg p-6"
  >
    <h2 :id="props.headingId" class="text-text text-base font-semibold">{{ t('cart.summary') }}</h2>

    <template v-if="props.showDiscount">
      <div
        v-if="discount"
        role="status"
        class="text-body-sm flex flex-wrap items-center gap-x-2 gap-y-2"
      >
        <span class="text-success flex items-center gap-1 font-semibold">
          <EldraIcon name="circle-check" size="sm" class="shrink-0" />
          {{ t('cart.applied') }}
        </span>
        <Chip size="sm" removable :label="discount.code" @remove="onRemoveCode(discount.code)" />
      </div>

      <FormLayout
        v-else
        layout="inline"
        :aria-label="t('cart.discountCode')"
        :submitting="applying"
        @submit="onApply"
      >
        <FieldWrapper :label="t('cart.discountCode')">
          <Input
            v-model="code"
            name="discountCode"
            autocomplete="off"
            :placeholder="t('cart.discountPlaceholder')"
            :invalid="isInvalidCode"
            :described-by="refusal !== null ? errorId : undefined"
            :classes="{ control: 'uppercase' }"
          />
        </FieldWrapper>
        <p
          v-if="refusal !== null"
          :id="errorId"
          role="alert"
          class="text-field-note text-danger flex basis-full items-start gap-1.5 font-medium"
        >
          <EldraIcon name="alert-circle" size="sm" class="shrink-0" />
          <span>{{ refusalMessage }}</span>
        </p>
        <template #actions>
          <Button type="submit" variant="outline">{{ t('cart.apply') }}</Button>
        </template>
      </FormLayout>
    </template>

    <dl v-if="totals" class="grid gap-2">
      <div :class="ROW_CLASS">
        <dt :class="LABEL_CLASS">{{ t('cart.subtotal') }}</dt>
        <dd :class="VALUE_CLASS">
          <Price :amount="totals.subtotal" size="sm" :classes="{ root: 'inline' }" />
        </dd>
      </div>
      <div v-if="discount" :class="ROW_CLASS">
        <dt :class="LABEL_CLASS">{{ t('cart.discount', { code: discount.code }) }}</dt>
        <dd :class="VALUE_CLASS">
          <Price
            :amount="-discount.amount"
            size="sm"
            :classes="{ root: 'inline', current: 'text-success' }"
          />
        </dd>
      </div>
      <div :class="ROW_CLASS">
        <dt :class="LABEL_CLASS">{{ t('cart.shipping') }}</dt>
        <dd :class="VALUE_CLASS">
          <span v-if="totals.shipping === null">{{ t('cart.shippingPending') }}</span>
          <span v-else-if="totals.shipping === 0">{{ t('cart.shippingFree') }}</span>
          <Price v-else :amount="totals.shipping" size="sm" :classes="{ root: 'inline' }" />
        </dd>
      </div>
      <div class="border-border flex items-baseline justify-between gap-4 border-t pt-3">
        <dt class="text-text text-base font-semibold">{{ t('cart.total') }}</dt>
        <dd class="text-text text-base font-semibold tabular-nums">
          <Price :amount="totals.total" :classes="{ root: 'inline' }" />
        </dd>
      </div>
    </dl>

    <Button
      v-if="checkoutHref"
      variant="primary"
      size="lg"
      block
      :href="checkoutHref"
      :as="checkoutAs"
    >
      <template #leadingIcon>
        <EldraIcon name="lock" size="sm" />
      </template>
      {{ t('cart.checkout') }}
    </Button>

    <p v-if="props.note" class="text-muted text-body-sm text-center">{{ props.note }}</p>

    <div
      v-if="props.showPaymentIcons"
      role="img"
      :aria-label="t('cart.paymentsAccepted')"
      class="text-muted flex flex-wrap items-center justify-center gap-3"
    >
      <EldraIcon v-for="icon in PAYMENT_ICONS" :key="icon" :name="icon" size="lg" />
    </div>
  </aside>
</template>
