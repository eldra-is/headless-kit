import { useToast } from '@eldrajs/ui';
import { failureMessageKey, type StorefrontFailure } from '../storefront/feedback';
import { useI18n } from 'vue-i18n';

/**
 * The one way a block tells a shopper that a storefront *mutation* failed, and the only place the
 * `failure → sentence → toast` path is written. Every block that changes something in the store —
 * add to cart, change a quantity, remove a line, undo a removal — calls `report()` the moment the
 * store says it failed.
 *
 * **Why a toast.** The spec's own rule for the Toast primitive (`01-core-components.md` → "Toast":
 * "Use it to confirm background actions… Don't use it for form validation (show errors next to the
 * field)") splits this cleanly, and the split is deliberate here: a *form* refusal stays inline next
 * to the field that caused it (the discount code, the back-in-stock address, the contact fields all
 * do, and keep doing so — see `blocks/cart/parts/Summary.vue`), while a button that acts on the cart
 * has no field to annotate and nothing on screen that changes, so it needs a message of its own or
 * the shopper sees nothing at all.
 *
 * **One `Toaster`, one toast per cause.** `useToast` is a module-level queue rendered by the single
 * `Toaster` in `app/app.vue`. Each report carries a fixed `id` per cause, so a shopper who presses a
 * refused button three times replaces one toast in place instead of stacking three (the primitive
 * keeps at most three, and two of them saying the same thing is noise). Nothing focuses it: the
 * toast is a live region, and moving focus out of the button a shopper just pressed would lose their
 * place.
 */
export interface StorefrontFeedback {
  /**
   * Raises the toast for a failure. `danger` because the shopper's action did not happen — which,
   * per the primitive's own timing rules, is also what keeps it on screen until it is dismissed.
   *
   * `id` groups the toasts that must not stack; it defaults to one shared `storefront-mutation`
   * bucket, which is right wherever a block has a single mutating control.
   */
  report(failure: StorefrontFailure | null, options?: { id?: string }): void;
}

export function useStorefrontFeedback(): StorefrontFeedback {
  const { t } = useI18n();
  const toast = useToast();
  return {
    report(failure, options = {}) {
      toast.show({
        id: options.id ?? 'storefront-mutation',
        variant: 'danger',
        title: t(failureMessageKey(failure)),
      });
    },
  };
}
