import { nextTick, ref, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from '@eldrajs/ui';
import { useEldraLocale } from '@eldrajs/theme-vue';
import { useStorefront } from './useStorefront';
import { useStorefrontFeedback } from './useStorefrontFeedback';
import { CART_ADD_TOAST_ID } from '../storefront/feedback';
import type { StorefrontProduct } from '../storefront/types';

/**
 * A product card's "+ Add": reads the product the card names (its list item carries no variant),
 * adds one of its default variant to the cart, and says so in the shared cart toast — "Added to
 * cart", with "View cart" opening the cart drawer when the page has one, else linking to `/cart`.
 * A product with nothing to add, or an add the cart refuses, reports through the same toast.
 *
 * Shared by every block that draws `ProductCard`s with `quick-add` on (product-carousel,
 * collection-grid, search), so the button does the same thing everywhere. Not a Nuxt global: a
 * plain composable over `useStorefront()`, so blocks may call it.
 */
export function useQuickAdd(): {
  busy: Ref<boolean>;
  add: (item: { handle: string }) => Promise<void>;
} {
  const { t } = useI18n();
  const storefront = useStorefront();
  const toast = useToast();
  const feedback = useStorefrontFeedback();
  const activeLocale = useEldraLocale();

  /** `null` until a button is pressed, so the read asks for nothing on the server or on load. */
  const handle = ref<string | null>(null);
  const result = storefront.catalog.product(handle);
  const busy = ref(false);

  /** Resolves once the read for `wanted` has settled: the product, or `null` when it failed. */
  async function readProduct(wanted: string): Promise<StorefrontProduct | null> {
    handle.value = wanted;
    await nextTick();
    const settled = (): boolean =>
      !result.loading.value &&
      (result.data.value?.handle === wanted || result.error.value !== null);
    if (!settled()) {
      await new Promise<void>((resolve) => {
        const stop = watch(
          () => [result.loading.value, result.data.value, result.error.value],
          () => {
            if (!settled()) return;
            stop();
            resolve();
          }
        );
      });
    }
    const product = result.data.value;
    return product !== null && product.handle === wanted ? product : null;
  }

  async function add(item: { handle: string }): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    try {
      const product = await readProduct(item.handle);
      if (product === null || product.variantId === '') {
        feedback.report(null, { id: CART_ADD_TOAST_ID });
        return;
      }
      const cart = storefront.cart;
      const failure = await cart.add({
        productId: product.productId,
        variantId: product.variantId,
        quantity: 1,
      });
      if (failure !== null) {
        feedback.report(failure, { id: CART_ADD_TOAST_ID });
        return;
      }
      toast.show({
        id: CART_ADD_TOAST_ID,
        title: t('cart.added'),
        action: cart.drawerAvailable.value
          ? {
              label: t('cart.viewCart'),
              onActivate: () => {
                cart.drawerOpen.value = true;
              },
            }
          : { label: t('cart.viewCart'), href: activeLocale.path('/cart') },
      });
    } finally {
      busy.value = false;
    }
  }

  return { busy, add };
}
