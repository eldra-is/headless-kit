import { describe, expect, expectTypeOf, it } from 'vitest';
import { createEldraClient } from '../index';
import { stubHttpClient } from './support';
import type {
  EldraAddCartItemInput,
  EldraCart,
  EldraCartTotals,
  EldraContractResponse,
  EldraProductListItem,
} from '../index';

// Without the generated contract (see ./generated for the other half) nothing is typed and
// nothing is guessed: responses are `unknown`, request bodies and queries are plain objects.
describe('eldra sdk without generated contract types', () => {
  it('passes responses through untyped', async () => {
    const client = createEldraClient({
      orgId: 'org-123',
      httpClient: stubHttpClient(() => ({ data: [{ title: 'Tee' }], meta: { page: 1 } })),
    });

    const list = await client.catalog.listProducts();

    expectTypeOf(list).toBeUnknown();
    expect(list).toEqual({ data: [{ title: 'Tee' }], meta: { page: 1 } });
  });

  it('resolves every contract-derived type to unknown or a plain object', () => {
    expectTypeOf<EldraCart>().toBeUnknown();
    expectTypeOf<EldraCartTotals>().toBeUnknown();
    expectTypeOf<EldraProductListItem>().toBeUnknown();
    expectTypeOf<EldraContractResponse<'/order/v1/{orderId}', 'get'>>().toBeUnknown();
    expectTypeOf<EldraAddCartItemInput>().toEqualTypeOf<Record<string, unknown>>();
  });

  it('still lets a caller name a response type explicitly', async () => {
    const client = createEldraClient({
      orgId: 'org-123',
      httpClient: stubHttpClient(() => ({ data: [], meta: { page: 1 } })),
    });

    const list = await client.catalog.listProducts<{ data: unknown[]; meta: { page: number } }>();

    expectTypeOf(list.meta.page).toEqualTypeOf<number>();
  });
});
