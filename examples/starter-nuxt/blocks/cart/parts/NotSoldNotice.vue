<script setup lang="ts">
import { computed } from 'vue';
import { Button, Notice } from '@eldrajs/ui';
import { useI18n } from 'vue-i18n';
import { useStorefront } from '../../../app/composables/useStorefront';
import { useStorefrontFeedback } from '../../../app/composables/useStorefrontFeedback';
import { safeHref } from '../../../app/utils/links';
import { useNotSoldSentence } from './notSold';

const storefront = useStorefront();
const cart = storefront.cart;
const feedback = useStorefrontFeedback();
const { t } = useI18n();
const sentence = useNotSoldSentence(cart);
const shopInDefault = computed(() => {
  const fallback = storefront.currency.defaultCurrency;
  return fallback !== undefined && cart.currency.value !== fallback;
});

let leaving = false;

async function checkoutWithout(): Promise<void> {
  if (leaving) return;
  leaving = true;
  try {
    await removeThenCheckout();
  } finally {
    leaving = false;
  }
}

async function removeThenCheckout(): Promise<void> {
  const failure = await cart.removeNotSold();
  if (failure !== null) {
    feedback.report(failure);
    return;
  }
  const checkout = safeHref(cart.checkoutUrl.value);
  if (checkout !== null && cart.lines.value.length > 0) {
    cart.beginCheckout();
    window.location.assign(checkout);
  }
}
</script>

<template>
  <Notice
    tone="warning"
    :text="sentence"
    :classes="{ content: 'text-start' }"
    data-eldra-not-sold-notice
  >
    <template #actions>
      <Button
        variant="primary"
        size="sm"
        type="button"
        :loading="cart.pending.value"
        @click="checkoutWithout"
      >
        {{ t('currency.checkoutWithout') }}
      </Button>
      <Button
        v-if="shopInDefault"
        variant="outline"
        size="sm"
        type="button"
        @click="storefront.currency.chooseBase()"
      >
        {{ t('currency.shopIn', { currency: storefront.currency.defaultCurrency }) }}
      </Button>
    </template>
  </Notice>
</template>
