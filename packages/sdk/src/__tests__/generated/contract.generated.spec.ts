import { describe, expect, expectTypeOf, it } from 'vitest';
import { createEldraClient } from '../../index';
import { stubHttpClient } from '../support';
import type {
  EldraAddCartItemInput,
  EldraBrand,
  EldraCart,
  EldraCartGiftCard,
  EldraCartDiscountCodeEntry,
  EldraCartGiftCardEntry,
  EldraCartTotals,
  EldraContractResponse,
  EldraCreateSalesOrderInput,
  EldraCustomerLocation,
  EldraCustomerLocationList,
  EldraCustomerMe,
  EldraCustomerMembership,
  EldraOrderDiscountCode,
  EldraOrderPreview,
  EldraOrderPreviewDiscountCode,
  EldraOrderPreviewGiftCard,
  EldraProductDetails,
  EldraProductExtensions,
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

  // What the CMS types the Vite plugin writes add for a schema `clothing` that extends products:
  // `interface EldraProductExtensions extends EldraCMSProductExtensions {}`.
  interface EldraProductExtensions {
    clothing?: { material?: string; careInstructions?: string[] };
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

  it('types brands, the product brand and seo, and the cart gift card (contract 6.4.0)', async () => {
    const client = createEldraClient({ orgId: 'org-123', httpClient: stubHttpClient(() => []) });

    expectTypeOf(await client.catalog.listBrands()).toEqualTypeOf<EldraBrand[]>();
    expectTypeOf<EldraBrand['name']>().toEqualTypeOf<string>();
    // The shared SEO value (contract 6.6.0): the members a CMS entry's `seo` field has.
    type BrandSeo = NonNullable<EldraBrand['seo']>;
    expectTypeOf<BrandSeo['canonicalUrl']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<BrandSeo['imageUrl']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<BrandSeo['noindex']>().toEqualTypeOf<boolean | undefined>();
    // A product card carries only the two crawl members.
    type CardSeo = NonNullable<EldraProductListItem['seo']>;
    expectTypeOf<CardSeo>().toEqualTypeOf<{ canonicalUrl?: string; noindex?: boolean }>();
    expectTypeOf<NonNullable<EldraProductDetails['brand']>['slug']>().toEqualTypeOf<string>();
    expectTypeOf<NonNullable<EldraProductDetails['seo']>['title']>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<NonNullable<EldraCartGiftCard>['amountDue']>().toEqualTypeOf<number>();
    expectTypeOf(await client.cart.applyGiftCard('cart-1', 'GC')).toEqualTypeOf<EldraCart>();
    const applied = await client.cart.applyCode('cart-1', 'GC');
    expectTypeOf(applied.appliedAs).toEqualTypeOf<'DISCOUNT' | 'GIFT_CARD'>();
    expectTypeOf(applied.giftCard).toEqualTypeOf<EldraCart['giftCard']>();
  });

  it('types several gift cards on the cart and the checkout summary (contract 6.8.0)', async () => {
    const client = createEldraClient({ orgId: 'org-123', httpClient: stubHttpClient(() => ({})) });

    expectTypeOf<EldraCart['amountDue']>().toEqualTypeOf<number>();
    expectTypeOf<EldraCartGiftCardEntry['entryId']>().toEqualTypeOf<string>();
    expectTypeOf<EldraCartGiftCardEntry['applied']>().toEqualTypeOf<number>();
    expectTypeOf<EldraCartGiftCardEntry['amountDue']>().toEqualTypeOf<number>();
    expectTypeOf(
      await client.cart.removeGiftCardEntry('cart-1', 'entry-1')
    ).toEqualTypeOf<EldraCart>();
    expectTypeOf<EldraOrderPreviewGiftCard>().toEqualTypeOf<{ amount: number; last4: string }>();
    expectTypeOf<EldraOrderPreview['amountDue']>().toEqualTypeOf<number>();
  });

  it('types several discount codes on the cart, the order and the checkout summary (contract 6.9.0)', async () => {
    const client = createEldraClient({ orgId: 'org-123', httpClient: stubHttpClient(() => ({})) });

    expectTypeOf<EldraCartDiscountCodeEntry>().toEqualTypeOf<{ amount: number; code: string }>();
    expectTypeOf<EldraOrderDiscountCode>().toEqualTypeOf<{ amount: number; code: string }>();
    expectTypeOf<EldraOrderPreviewDiscountCode>().toEqualTypeOf<{ amount: number; code: string }>();
    expectTypeOf(
      await client.cart.removeDiscountEntry('cart-1', 'SUMMER10')
    ).toEqualTypeOf<EldraCart>();
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
      creditCurrency?: string;
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

  it('types product extensions through the registry, not the contract', () => {
    expectTypeOf<EldraProductDetails['extensions']>().toEqualTypeOf<
      EldraProductExtensions | undefined
    >();
    expectTypeOf<EldraProductDetails['title']>().toEqualTypeOf<string>();
    expectTypeOf<EldraProductDetails['slug']>().toEqualTypeOf<string>();

    const product = {} as EldraProductDetails;
    expectTypeOf(product.extensions?.clothing?.material).toEqualTypeOf<string | undefined>();
    expectTypeOf(product.extensions?.clothing?.careInstructions).toEqualTypeOf<
      string[] | undefined
    >();
    // @ts-expect-error a schema that does not extend products has no key
    void product.extensions?.jewellery;
    // @ts-expect-error a field the schema does not have
    void product.extensions?.clothing?.colour;
  });
});
