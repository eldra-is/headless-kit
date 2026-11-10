import { describe, expectTypeOf, it } from 'vitest';
import type { EldraProductDetails, EldraProductExtensions } from '../../index';

// Type-checked by tsconfig.generated-bare.json only: the generated contract is present (the fixture
// fills in EldraContract) but no CMS types augment EldraProductExtensions, as in a project whose
// organisation has no schema that extends products.
describe('eldra sdk with the contract and no product extension augmentation', () => {
  it('types extensions as the empty registry', () => {
    expectTypeOf<EldraProductExtensions>().toEqualTypeOf<{}>();
    expectTypeOf<keyof EldraProductExtensions>().toBeNever();
    expectTypeOf<EldraProductDetails['extensions']>().toEqualTypeOf<
      EldraProductExtensions | undefined
    >();
    expectTypeOf<EldraProductDetails['title']>().toEqualTypeOf<string>();

    const product = {} as EldraProductDetails;
    // @ts-expect-error no schema extends products, so there is no key to read
    void product.extensions?.clothing;
  });
});
