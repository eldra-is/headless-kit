import { computed, type ComputedRef } from 'vue';
import { useEldraUiLocale } from '@eldrajs/ui';
import { listFormat } from '@eldrajs/sdk/format/list';
import { useI18n } from 'vue-i18n';
import type { CartStore } from '../../../app/storefront/cart';

/** "Walnut spoon can't be bought in EUR.": the cart's lines with no price in its currency, named. */
export function useNotSoldSentence(cart: CartStore): ComputedRef<string> {
  const { t } = useI18n();
  const locale = useEldraUiLocale();
  return computed(() =>
    t('currency.cartNotSold', {
      currency: cart.currency.value ?? '',
      items: listFormat(locale.value, { type: 'conjunction' }).format(
        cart.notSold.value.map((line) => line.title)
      ),
    })
  );
}
