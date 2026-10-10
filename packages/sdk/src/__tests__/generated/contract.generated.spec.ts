import { describe, expect, expectTypeOf, it } from 'vitest';
import { createEldraClient } from '../../index';
import { stubHttpClient } from '../support';
import type {
  EldraAddCartItemInput,
  EldraCart,
  EldraCartTotals,
  EldraContractResponse,
  EldraCreateSalesOrderInput,
  EldraCustomerLocation,
  EldraCustomerLocationList,
  EldraCustomerMe,
  EldraCustomerMembership,
  EldraProductListItem,
  EldraSalesOrder,
  EldraSalesOrderCredit,
  EldraSalesOrderLine,
  EldraSalesOrderList,
  EldraSalesOrderListOptions,
  EldraSalesOrderPreview,
  EldraSalesOrderPreviewInput,
  EldraSalesOrderStatus,
  EldraSalesOrderWarning,
  EldraShopUser,
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

  it('types the business customer from the contract', async () => {
    const client = createEldraClient({
      orgId: 'org-123',
      httpClient: stubHttpClient(() => ({ shopUser: {}, memberships: [] })),
    });

    const me = await client.customer.me();

    expectTypeOf(me).toEqualTypeOf<EldraCustomerMe>();
    expectTypeOf(me.memberships).toEqualTypeOf<EldraCustomerMembership[]>();
    expectTypeOf<EldraShopUser['email']>().toEqualTypeOf<string>();
    expectTypeOf<EldraCustomerMembership['role']>().toEqualTypeOf<'BUYER' | 'ADMIN'>();
    expectTypeOf<EldraCustomerMembership['status']>().toEqualTypeOf<'INVITED' | 'ACTIVE'>();
    expect(me.memberships).toEqual([]);
  });

  it('types delivery locations and sales orders from the contract', async () => {
    const client = createEldraClient({
      orgId: 'org-123',
      httpClient: stubHttpClient(() => ({ data: [] })),
    });

    const locations = await client.customer.locations();
    const preview = await client.salesOrders.preview({ cartId: 'c' });
    const order = await client.salesOrders.create({ cartId: 'c' }, { idempotencyKey: 'k' });
    const list = await client.salesOrders.list({ status: 'OPEN' });
    const one = await client.salesOrders.get('so-1');

    expectTypeOf(locations).toEqualTypeOf<EldraCustomerLocationList>();
    expectTypeOf(locations.data).toEqualTypeOf<EldraCustomerLocation[]>();
    expectTypeOf<EldraCustomerLocation['isDefault']>().toEqualTypeOf<boolean>();
    expectTypeOf(preview).toEqualTypeOf<EldraSalesOrderPreview>();
    expectTypeOf<EldraSalesOrderCredit>().toEqualTypeOf<{
      status: 'NOT_CHECKED' | 'NO_LIMIT' | 'WITHIN' | 'OVER' | 'UNCHECKED';
      wouldBlock: boolean;
    }>();
    expectTypeOf<EldraSalesOrderPreviewInput>().toEqualTypeOf<{
      cartId: string;
      locationId?: string;
    }>();
    expectTypeOf<EldraCreateSalesOrderInput>().toEqualTypeOf<{
      cartId: string;
      customerOrderDate?: string;
      locationId?: string;
      note?: string;
      purchaseOrderNumber?: string;
    }>();
    expectTypeOf(order).toEqualTypeOf<EldraSalesOrder>();
    expectTypeOf(one).toEqualTypeOf<EldraSalesOrder>();
    expectTypeOf<EldraSalesOrderStatus>().toEqualTypeOf<
      'OPEN' | 'ON_HOLD' | 'PART_DELIVERED' | 'DELIVERED' | 'CANCELLED'
    >();
    expectTypeOf<EldraSalesOrderLine['backorder']>().toEqualTypeOf<number>();
    expectTypeOf<EldraSalesOrderLine['variantId']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<EldraSalesOrderWarning['code']>().toEqualTypeOf<
      'SALES_ORDER_STOCK_NOT_SET_ASIDE' | 'SALES_ORDER_PAYMENT_NOT_RECORDED'
    >();
    expectTypeOf(list).toEqualTypeOf<EldraSalesOrderList>();
    expectTypeOf<EldraSalesOrderList['data'][number]['lineCount']>().toEqualTypeOf<number>();
    expectTypeOf<EldraSalesOrderListOptions['pageSize']>().toEqualTypeOf<number | undefined>();
    expect(locations).toEqual({ data: [] });
  });
});
