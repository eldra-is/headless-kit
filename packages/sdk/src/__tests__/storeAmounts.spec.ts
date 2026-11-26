import { describe, expect, it } from 'vitest';
import { storeAmountsFromDelivery } from '../storeAmounts';

/** WS-1473: "Free shipping over …" comes from the merchant's delivery methods. */
describe('storeAmountsFromDelivery', () => {
  it('takes the lowest threshold per currency among active methods, in minor units', () => {
    expect(
      storeAmountsFromDelivery([
        { status: 'ACTIVE', currency: 'ISK', freeShippingThreshold: 20000 },
        {
          status: 'ACTIVE',
          currency: 'ISK',
          freeShippingThreshold: 15000,
          currencyPrices: [
            {
              currency: 'EUR',
              shippingPrice: 9.5,
              freeShippingThreshold: 100.5,
            },
            { currency: 'USD', shippingPrice: 10 },
          ],
        },
        { status: 'INACTIVE', currency: 'ISK', freeShippingThreshold: 1 },
      ])
    ).toEqual({ freeShippingThreshold: { ISK: 15000, EUR: 10050 } });
  });

  it('keeps a zero threshold, and publishes nothing for a store without thresholds', () => {
    expect(
      storeAmountsFromDelivery([{ status: 'ACTIVE', currency: 'ISK', freeShippingThreshold: 0 }])
    ).toEqual({ freeShippingThreshold: { ISK: 0 } });
    expect(storeAmountsFromDelivery([{ status: 'ACTIVE', currency: 'ISK' }])).toEqual({});
    expect(storeAmountsFromDelivery(null)).toEqual({});
    expect(
      storeAmountsFromDelivery([{ currency: 'isk', freeShippingThreshold: -1 }, 'junk'])
    ).toEqual({});
  });
});
