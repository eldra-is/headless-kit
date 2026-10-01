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
  it('says out of stock for a refusal about stock, however the gateway spells it', () => {
    for (const body of [
      { code: 'CONFLICT', errorId: 'CART_INSUFFICIENT_STOCK' },
      { code: 'CART_INSUFFICIENT_STOCK' },
      { code: 'INSUFFICIENT_STOCK' },
    ]) {
      const failure = toStorefrontFailure(refusal(409, body));
      expect(failureMessageKey(failure)).toBe('storefront.outOfStock');
      expect(isOutOfStock(failure)).toBe(true);
    }
  });

  it('says the item is gone for a product the shop no longer sells', () => {
    const failure = toStorefrontFailure(refusal(409, { errorId: 'CART_INVALID_PRODUCT' }));
    expect(failureMessageKey(failure)).toBe('storefront.unavailable');
    // Specific, but not the stock case — the page must not flip its stock line for it.
    expect(isOutOfStock(failure)).toBe(false);
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
