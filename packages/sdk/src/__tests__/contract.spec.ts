import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createEldraClient, ELDRA_CONTRACT_VERSION } from '../index';
import { stubHttpClient } from './support';
import type { EldraContractBody, EldraContractResponse, EldraProductListItem } from '../index';

describe('eldra sdk contract', () => {
  it('reports the version of the snapshot it was generated from', () => {
    const snapshot = JSON.parse(
      readFileSync(resolve(__dirname, '../contract/web-gateway.v1.json'), 'utf8')
    ) as { info: { version: string } };

    expect(ELDRA_CONTRACT_VERSION).toBe(snapshot.info.version);
  });

  it('types catalog responses from the contract by default', async () => {
    const client = createEldraClient({
      orgId: 'org-123',
      httpClient: stubHttpClient(() => ({ data: [], meta: { page: 1 } })),
    });

    const list = await client.catalog.listProducts();

    expectTypeOf(list.data).toEqualTypeOf<EldraProductListItem[] | null>();
    expectTypeOf<EldraProductListItem['compareAtPrice']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<EldraProductListItem['minPrice']>().toEqualTypeOf<number>();
  });

  it('exposes request and response shapes for any path', () => {
    type CartTotals = EldraContractResponse<'/shopping-cart/v1/cart/{cartID}', 'get'>['totals'];
    type AddItem = EldraContractBody<'/shopping-cart/v1/cart/items', 'post'>;

    expectTypeOf<CartTotals>().toEqualTypeOf<{
      discount: number;
      subtotal: number;
      taxAmount: number;
      total: number;
    }>();
    expectTypeOf<AddItem['quantity']>().toEqualTypeOf<number>();
  });
});
