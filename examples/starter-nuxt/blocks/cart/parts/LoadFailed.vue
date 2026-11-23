<script setup lang="ts">
import { Button, Notice } from '@eldrajs/ui';
import { useI18n } from 'vue-i18n';
import { useStorefront } from '../../../app/composables/useStorefront';

const cart = useStorefront().cart;
const { t } = useI18n();
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
        @click="cart.reload()"
      >
        {{ t('cart.tryAgain') }}
      </Button>
    </template>
  </Notice>
</template>
