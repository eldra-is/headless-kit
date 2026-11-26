import { computed, type ComputedRef } from 'vue';
import { provideEldraPrices, useEldraBlockField } from '@eldrajs/theme-vue';
import { priceNodeResolver, resolveBlockTokens, usePriceTokenOptions } from './usePriceTokens';

/**
 * Typed access to a block's CMS data. `EldraBlockData`/`EldraBlockEntry` are
 * global ambient types declared by the generated `.eldra/block-types.d.ts`
 * (written by `@eldrajs/vite-plugin-theme`'s block-types generator) — no
 * import needed, the same way `.nuxt/nuxt.d.ts`'s ambient types work.
 *
 * `EldraBlockEntry<K>` carries only `id` and `data`; a block's own `apiId`
 * is not part of the entry at runtime (it is a type parameter, erased by
 * compile time). `blocks/article/Block.vue` already faces the same gap and
 * passes `api-id="article"` to `EldraRichText` as a literal — `apiId` here
 * is the same idea: a `Block.vue` always knows its own apiId statically, so
 * it passes it once as the second argument.
 *
 * `data` has every **price token** already written in the shopper's currency, in every string at
 * any depth, and the block's rich text gets the resolver for its `price` nodes
 * (`usePriceTokens.ts`): this is the one place prices resolve, so no block handles them itself.
 */
export function useBlockData<K extends keyof EldraBlockData>(
  props: { entry: EldraBlockEntry<K> },
  apiId: K
): {
  data: ComputedRef<EldraBlockData[K]>;
  entryId: string;
  field: (fieldId: string) => ReturnType<typeof useEldraBlockField>;
} {
  const tokens = usePriceTokenOptions();
  provideEldraPrices(priceNodeResolver(tokens));
  return {
    data: computed(() => resolveBlockTokens(props.entry.data, tokens.value)),
    entryId: props.entry.id,
    field: (fieldId: string) => useEldraBlockField(apiId, fieldId),
  };
}
