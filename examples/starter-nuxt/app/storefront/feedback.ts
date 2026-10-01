import { EldraHttpError } from '@eldrajs/sdk';
import type { MessageKey } from '../i18n/messages';

/**
 * What a *failed storefront mutation* is, in one shape, and which sentence a shopper is told about
 * it. Framework-free and pure: `app/storefront/cart.ts` records failures through
 * `toStorefrontFailure`, and `app/composables/useStorefrontFeedback.ts` is the one place that turns
 * one into a toast.
 *
 * **Why it exists.** A read that fails leaves the page showing what it already had, and the blocks
 * say so in place (`StorefrontResult.error`). A *mutation* that fails leaves nothing behind: the
 * shopper pressed Add to cart, the button's spinner stopped, and the page looks exactly as it did —
 * so unless something says otherwise, a refusal is indistinguishable from a button that does
 * nothing. That is what happened to a real add the gateway answered `409
 * { code: 'CONFLICT', errorId: 'CART_INSUFFICIENT_STOCK' }`.
 *
 * **Why the message is not the backend's.** `EldraHttpError.message` is "Web Studio request failed
 * with 409 Conflict". It is the right thing to keep for a developer and the wrong thing to show a
 * shopper, so `message` below stays out of the UI and the copy is chosen from `errorId` here instead
 * — one mapping, in one file, rather than a sentence invented by each block that mutates.
 */
export interface StorefrontFailure {
  /** The thrown error's own message. For diagnosis, never for display — see above. */
  message: string;
  /** The problem body's `errorId`: which failure this is (`CART_INSUFFICIENT_STOCK`). */
  errorId: string | null;
  /** The problem body's `code`: the *class* of failure (`CONFLICT`), shared by unrelated refusals. */
  code: string | null;
  /** The HTTP status, when the failure was an answer at all rather than a dropped request. */
  status: number | null;
}

/** The gateway refused the add because the stock is not there. */
export const INSUFFICIENT_STOCK = 'CART_INSUFFICIENT_STOCK';

/**
 * The failures this theme has its own words for. Everything else — and every failure that never
 * reached the gateway — gets `storefront.mutationFailed`, because a sentence a shopper cannot act on
 * is worse than the plain one: naming an `errorId` at them is noise, and guessing a cause from a
 * status is how "check your spelling" ends up in front of someone whose connection dropped.
 */
const MESSAGE_BY_ERROR_ID: Record<string, MessageKey> = {
  [INSUFFICIENT_STOCK]: 'storefront.outOfStock',
  CART_INVALID_PRODUCT: 'storefront.unavailable',
};

/**
 * Reads the structured halves off whatever was thrown. `@eldrajs/sdk` throws `EldraHttpError` for
 * any non-2xx answer, carrying the problem body's `code`/`errorId`; a request that never got an
 * answer (offline, aborted) throws an ordinary `Error`, which has neither — and that difference is
 * itself information, so it is kept rather than flattened into a string.
 */
export function toStorefrontFailure(caught: unknown): StorefrontFailure {
  if (caught instanceof EldraHttpError) {
    return {
      message: caught.message,
      errorId: caught.errorId ?? null,
      code: caught.code ?? null,
      status: caught.status,
    };
  }
  return {
    message: caught instanceof Error ? caught.message : 'Something went wrong.',
    errorId: null,
    code: null,
    status: null,
  };
}

/** The sentence to show for a failure — `storefront.mutationFailed` unless it names a known cause. */
export function failureMessageKey(failure: StorefrontFailure | null): MessageKey {
  if (failure === null) return 'storefront.mutationFailed';
  // `code` is read as well as `errorId` because the two fields carry the same vocabulary in
  // different gateway versions: one deployment answers `{ code: 'INSUFFICIENT_STOCK' }` where
  // another answers `{ code: 'CONFLICT', errorId: 'CART_INSUFFICIENT_STOCK' }`.
  return (
    MESSAGE_BY_ERROR_ID[failure.errorId ?? ''] ??
    MESSAGE_BY_ERROR_ID[failure.code ?? ''] ??
    MESSAGE_BY_ERROR_ID[`CART_${failure.code ?? ''}`] ??
    'storefront.mutationFailed'
  );
}

/**
 * Was this refusal about stock — the one failure a *page* reacts to and not only reports. The
 * product page flips its own stock line to sold out on it, because the cart service has just proved
 * it knows something the page's own read did not.
 */
export function isOutOfStock(failure: StorefrontFailure | null): boolean {
  return failure !== null && failureMessageKey(failure) === 'storefront.outOfStock';
}
