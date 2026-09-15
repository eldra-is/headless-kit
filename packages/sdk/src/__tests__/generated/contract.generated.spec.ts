import { describe, expect, expectTypeOf, it } from 'vitest';
import { createEldraClient } from '../../index';
import { stubHttpClient } from '../support';
import type {
  EldraAddCartItemInput,
  EldraCart,
  EldraCartTotals,
  EldraContractResponse,
  EldraProductListItem,
} from '../../index';
import type { paths } from '../fixtures/contract';

// This file is type-checked by tsconfig.generated.json only. It does what a storefront's
// generated `.eldra/web-studio/contract.ts` does — fill EldraContract in — and proves that every
// SDK method is then typed against the document. The fixture is a real gateway document.
declare module '../../index' {
  interface EldraContract {
    paths: paths;
  }
}

describe('eldra sdk with generated contract types', () => {
  it('types catalog responses from the contract', async () => {
    const client = createEldraClient({
      orgId: 'org-123',
      httpClient: stubHttpClient(() => ({ data: [], meta: { page: 1 } })),
    });

    const list = await client.catalog.listProducts();

    expectTypeOf(list.data).toEqualTypeOf<EldraProductListItem[] | null>();
    expectTypeOf<EldraProductListItem['minPrice']>().toEqualTypeOf<number>();
    expectTypeOf<EldraProductListItem['compareAtPrice']>().toEqualTypeOf<number | undefined>();
    expect(list.meta.page).toBe(1);
  });

  it('types the cart, its totals and the add-item body', () => {
    expectTypeOf<EldraCartTotals>().toEqualTypeOf<{
      discount: number;
      subtotal: number;
      taxAmount: number;
      total: number;
    }>();
    expectTypeOf<EldraCart['discountCode']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<EldraAddCartItemInput['quantity']>().toEqualTypeOf<number>();
  });

  it('exposes request and response shapes for any path', () => {
    type Order = EldraContractResponse<'/order/v1/{orderId}', 'get'>;
    expectTypeOf<Order['id']>().toEqualTypeOf<string>();
  });
});
