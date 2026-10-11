import { describe, expect, it } from 'vitest';
import { EldraHttpError } from '@eldrajs/sdk';
import {
  failureMessageKey,
  isOutOfStock,
  toStorefrontFailure,
} from '../../app/storefront/feedback';

/** A gateway refusal as the SDK throws it: an RFC 9457 problem body behind a status. */
function refusal(status: number, body: unknown): EldraHttpError {
  return new EldraHttpError({ status, statusText: 'Conflict' } as Response, body);
}

describe('toStorefrontFailure', () => {
  it('keeps the errorId, code and status of a gateway refusal', () => {
    const failure = toStorefrontFailure(
      refusal(409, {
        code: 'CONFLICT',
        errorId: 'CART_INSUFFICIENT_STOCK',
        detail: 'insufficient stock',
      })
    );

    expect(failure.errorId).toBe('CART_INSUFFICIENT_STOCK');
    expect(failure.code).toBe('CONFLICT');
    expect(failure.status).toBe(409);
    // The developer-facing text, kept for diagnosis and never shown to a shopper.
    expect(failure.message).toContain('409');
  });

  it('keeps a request that never got an answer apart from one that did', () => {
    const offline = toStorefrontFailure(new TypeError('Failed to fetch'));
    expect(offline.status).toBeNull();
    expect(offline.errorId).toBeNull();
    expect(offline.message).toBe('Failed to fetch');

    // Something that is not an Error at all still produces a usable failure rather than throwing.
    expect(toStorefrontFailure('nope').message).toBe('Something went wrong.');
  });
});

describe('failureMessageKey', () => {
  it('says out of stock for a refusal about stock', () => {
    // What the cart service actually sends: the generic `code` every conflict carries, and the
    // `errorId` that says which conflict it was.
    const failure = toStorefrontFailure(
      refusal(409, { code: 'CONFLICT', errorId: 'CART_INSUFFICIENT_STOCK' })
    );
    expect(failureMessageKey(failure)).toBe('storefront.outOfStock');
    expect(isOutOfStock(failure)).toBe(true);

    // `code` is read as a tolerance should a refusal ever arrive without the `errorId`.
    const idless = toStorefrontFailure(refusal(409, { code: 'CART_INSUFFICIENT_STOCK' }));
    expect(failureMessageKey(idless)).toBe('storefront.outOfStock');
  });

  it('says the item is gone for a product or variant that no longer resolves', () => {
    for (const errorId of [
      'CART_INVALID_PRODUCT',
      'CART_INVALID_PRODUCT_ID',
      'CART_INVALID_VARIANT_ID',
    ]) {
      const failure = toStorefrontFailure(refusal(409, { errorId }));
      expect(failureMessageKey(failure)).toBe('storefront.unavailable');
      // Specific, but not the stock case — the page must not flip its stock line for it.
      expect(isOutOfStock(failure)).toBe(false);
    }
  });

  it('says to reload when the cart, or the line in it, is gone', () => {
    for (const errorId of ['CART_NOT_FOUND', 'CART_ITEM_NOT_FOUND']) {
      expect(failureMessageKey(toStorefrontFailure(refusal(404, { errorId })))).toBe(
        'storefront.cartOutOfDate'
      );
    }
  });

  it('says something generic for the cart service’s internal failures', () => {
    // Real ids, and none of them anything a shopper can act on.
    for (const errorId of ['CART_DB_UPDATE_ERROR', 'CART_VERSION_CONFLICT', 'CART_MARSHAL_ERROR']) {
      expect(failureMessageKey(toStorefrontFailure(refusal(500, { errorId })))).toBe(
        'storefront.mutationFailed'
      );
    }
  });

  it('falls back to the generic sentence for anything else, and for no failure at all', () => {
    expect(failureMessageKey(toStorefrontFailure(refusal(500, { code: 'INTERNAL' })))).toBe(
      'storefront.mutationFailed'
    );
    expect(failureMessageKey(toStorefrontFailure(new Error('offline')))).toBe(
      'storefront.mutationFailed'
    );
    expect(failureMessageKey(null)).toBe('storefront.mutationFailed');
    expect(isOutOfStock(null)).toBe(false);
  });
});
