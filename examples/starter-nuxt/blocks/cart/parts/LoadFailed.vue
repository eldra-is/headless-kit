<script setup lang="ts">
import { Button, Notice } from '@eldrajs/ui';
import { useI18n } from 'vue-i18n';
import { useStorefront } from '../../../app/composables/useStorefront';
import { useStorefrontFeedback } from '../../../app/composables/useStorefrontFeedback';

const cart = useStorefront().cart;
const feedback = useStorefrontFeedback();
const { t } = useI18n();

async function tryAgain(): Promise<void> {
  const failure = await cart.reload();
  if (failure !== null) feedback.report(failure, { id: 'cart-load' });
}
</script>

<template>
  <Notice
    v-if="cart.loadFailed.value"
    tone="danger"
    :text="t('cart.loadFailed')"
    class="mb-4"
    data-eldra-cart-load-failed
  >
    <template #actions>
      <Button
        variant="outline"
        size="sm"
        type="button"
        :loading="cart.pending.value"
        @click="tryAgain"
      >
        {{ t('cart.tryAgain') }}
      </Button>
    </template>
  </Notice>
</template>
