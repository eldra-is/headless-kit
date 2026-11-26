import { computed, type ComputedRef } from 'vue';
import { listFormat } from '@eldrajs/sdk/format/list';
import { useI18n } from 'vue-i18n';
import type { CartStore } from '../../../app/storefront/cart';

/** "Walnut spoon can't be bought in EUR.": the cart's lines with no price in its currency, named. */
export function useNotSoldSentence(cart: CartStore): ComputedRef<string> {
  // The list's "and" is a word of the sentence, so it follows the content locale (`useI18n`), not
  // the regional format `useEldraUiLocale()` answers for numbers and dates — an English page of an
  // Icelandic store says "Spoon and Bowl", not "Spoon og Bowl".
  const { t, locale } = useI18n();
  return computed(() =>
    t('currency.cartNotSold', {
      currency: cart.currency.value ?? '',
      items: listFormat(locale.value, { type: 'conjunction' }).format(
        cart.notSold.value.map((line) => line.title)
      ),
    })
  );
}
