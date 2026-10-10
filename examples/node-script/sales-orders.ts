// Orders on account for a signed-in business customer (docs/sales-orders.md).
// Server-side only: the token comes from your session store, never from the browser.
import { randomUUID } from 'node:crypto';
import { createEldraClient, customerHeaders, EldraHttpError } from '@eldrajs/sdk';
import type { EldraSalesOrder } from '@eldrajs/sdk';

type Eldra = ReturnType<typeof createEldraClient>;

export interface BusinessSession {
  accessToken: string;
  /** The active company; leave out when the person has exactly one. */
  customerId?: string;
}

export interface AccountCheckout {
  cartId: string;
  locationId?: string;
  purchaseOrderNumber?: string;
  note?: string;
  /** Kept with the checkout attempt; a new one whenever the cart or the form changes. */
  idempotencyKey: string;
}

/** Start a checkout attempt, or start over after the cart or the form changed. */
export function newAttempt(form: Omit<AccountCheckout, 'idempotencyKey'>): AccountCheckout {
  return { ...form, idempotencyKey: randomUUID() };
}

export async function previewOnAccount(
  eldra: Eldra,
  session: BusinessSession,
  checkout: AccountCheckout
) {
  const headers = customerHeaders(session.accessToken, session.customerId);
  return eldra.salesOrders.preview(
    { cartId: checkout.cartId, locationId: checkout.locationId },
    { headers }
  );
}

export type PlaceResult =
  | { kind: 'placed'; order: EldraSalesOrder }
  | { kind: 'already-ordered'; salesOrderId: string }
  | { kind: 'retry' }
  | { kind: 'sign-in' }
  | { kind: 'refused'; errorId: string | undefined };

export async function placeOnAccount(
  eldra: Eldra,
  session: BusinessSession,
  checkout: AccountCheckout
): Promise<PlaceResult> {
  const headers = customerHeaders(session.accessToken, session.customerId);
  try {
    const order = await eldra.salesOrders.create(
      {
        cartId: checkout.cartId,
        locationId: checkout.locationId,
        purchaseOrderNumber: checkout.purchaseOrderNumber,
        note: checkout.note,
      },
      { idempotencyKey: checkout.idempotencyKey },
      { headers }
    );
    return { kind: 'placed', order };
  } catch (error) {
    if (!(error instanceof EldraHttpError)) {
      // A timeout or a dropped connection: the order may have been placed. Retry with the same
      // checkout, and so the same key, which replays it rather than placing a second.
      return { kind: 'retry' };
    }
    if (error.errorId === 'SALES_ORDER_CART_ALREADY_ORDERED') {
      const salesOrderId = error.errors?.salesOrderId;
      if (typeof salesOrderId === 'string') return { kind: 'already-ordered', salesOrderId };
    }
    // Only an invalid token means sign in again; SALES_ORDER_UPSTREAM_REFUSED (502) never does.
    if (error.status === 401 && error.errorId === 'SHOP_TOKEN_INVALID') return { kind: 'sign-in' };
    // 502 and 503 may follow a placed order too: retry with the same key.
    if (error.status === 502 || error.status === 503) return { kind: 'retry' };
    return { kind: 'refused', errorId: error.errorId };
  }
}
