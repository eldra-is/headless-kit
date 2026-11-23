<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '@eldrajs/ui';
import { useI18n } from 'vue-i18n';
import { useStorefront } from '../../../app/composables/useStorefront';
import EldraIcon from '../../../app/components/EldraIcon.vue';
import EldraRouterLink from '../../../app/components/EldraRouterLink.vue';
import { useUiId } from '../../../app/composables/useUiId';
import { isInternalHref, safeHref } from '../../../app/utils/links';
import { useNotSoldSentence } from './notSold';

const { t } = useI18n();
const cart = useStorefront().cart;

const checkoutHref = computed(() => safeHref(cart.checkoutUrl.value));
const checkoutAs = computed(() =>
  checkoutHref.value !== null && isInternalHref(checkoutHref.value) ? EldraRouterLink : undefined
);
/** Held, not hidden, while a line has no price in the cart's currency, so the reason sits where the shopper looks. */
const held = computed(() => cart.notSold.value.length > 0);
const reason = useNotSoldSentence(cart);
const reasonId = `cart-checkout-held-${useUiId()}`;
</script>

<template>
  <Button
    v-if="checkoutHref || held"
    variant="primary"
    size="lg"
    block
    :href="held ? undefined : (checkoutHref ?? undefined)"
    :as="held ? undefined : checkoutAs"
    :disabled="held"
    :aria-describedby="held ? reasonId : undefined"
    @click="cart.beginCheckout()"
  >
    <template #leadingIcon>
      <EldraIcon name="lock" size="sm" />
    </template>
    {{ t('cart.checkout') }}
  </Button>
  <p v-if="held" :id="reasonId" class="text-muted text-body-sm text-center">
    {{ reason }}
  </p>
</template>
