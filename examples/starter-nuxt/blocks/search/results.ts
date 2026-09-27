import type { SearchResultItem, SearchResults } from '@eldrajs/ui';
import type {
  StorefrontProductListItem,
  StorefrontSearchResponse,
} from '../../app/storefront/types';

/**
 * `search.run()` responses are always USD (design doc §"Shared page facts": Northwind Goods
 * prices in USD) — the same fixed formatter `blocks/navigation/Block.vue` builds for its own
 * header `SearchBar` mapping, duplicated here rather than shared: neither block imports the
 * other, and a future currency-aware storefront would replace both call sites independently.
 */
const USD_FORMATTER = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatPrice(cents: number): string {
  return USD_FORMATTER.format(cents / 100);
}

/**
 * Spec "Search results page" → Do/Don't: "Don't show sold-out products at the top of suggestions.
 * Rank them last." A stable sort (available/in-stock first, sold out last) run before the
 * `suggestionsPerGroup` cap below, so a sold-out item only displaces an in-stock one when there
 * genuinely aren't enough of the latter to fill the group.
 */
function isSoldOut(product: StorefrontProductListItem): boolean {
  return product.available === false || product.stock === 'out';
}

function rankProducts(products: StorefrontProductListItem[]): StorefrontProductListItem[] {
  const inStock = products.filter((product) => !isSoldOut(product));
  const soldOut = products.filter(isSoldOut);
  return [...inStock, ...soldOut];
}

/**
 * Maps a `search.run()` response into `@eldrajs/ui`'s `SearchBar` `results` contract
 * (`products`/`collections`/`articles`/`pages`/`total`) for the block's own combobox panel —
 * never re-implemented, only fed. Each group is capped by the block's own `suggestionsPerGroup`
 * field (spec "Search results page" → Field → layout mapping: "`suggestionsPerGroup` → options
 * per group"); `SearchBar` applies its own further per-group caps on top (4 products, 3 for the
 * combined "journal and help" group) when this cap is left higher than those.
 *
 * `collections` is always empty: the storefront's `search.run()` response
 * (`StorefrontSearchResponse`) carries no collections group, and this block's own `types` field
 * only ever offers products, journal and pages.
 *
 * `total` is the *whole* result count the backend reports, not the number of rows returned here —
 * matching `SearchResults.total`'s own contract (the "See all N results" row reads it directly).
 */
export function toSearchBarResults(
  response: StorefrontSearchResponse | null,
  suggestionsPerGroup: number
): SearchResults {
  if (response === null) {
    return { products: [], collections: [], articles: [], pages: [], total: 0 };
  }

  const products: SearchResultItem[] = rankProducts(response.products)
    .slice(0, suggestionsPerGroup)
    .map((product) => ({
      id: product.variantId,
      title: product.title,
      href: product.url,
      price: formatPrice(product.price.amount),
      image: product.featuredImage?.src,
      imageAlt: product.featuredImage?.alt,
    }));

  const articles: SearchResultItem[] = response.articles
    .slice(0, suggestionsPerGroup)
    .map((article, index) => ({
      id: `article-${index}`,
      title: article.title,
      href: article.href,
      image: article.image?.src,
      imageAlt: article.image?.alt,
    }));

  const pages: SearchResultItem[] = response.pages
    .slice(0, suggestionsPerGroup)
    .map((page, index) => ({
      id: `page-${index}`,
      title: page.title,
      href: page.href,
    }));

  return { products, collections: [], articles, pages, total: response.total };
}
