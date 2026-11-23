<script setup lang="ts">
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

async function checkoutWithout(): Promise<void> {
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
        v-if="storefront.currency.base"
        variant="outline"
        size="sm"
        type="button"
        @click="storefront.currency.chooseBase()"
      >
        {{ t('currency.shopIn', { currency: storefront.currency.base }) }}
      </Button>
    </template>
  </Notice>
</template>
