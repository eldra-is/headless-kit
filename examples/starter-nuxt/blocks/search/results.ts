import type { SearchResultItem, SearchResults } from '@eldrajs/ui';
import type { StorefrontSearchProduct, StorefrontSearchResponse } from '../../app/storefront/types';

/**
 * Spec "Search results page" → Do/Don't: "Don't show sold-out products at the top of suggestions.
 * Rank them last." A stable sort (available/in-stock first, sold out last) run before the
 * `suggestionsPerGroup` cap below, so a sold-out item only displaces an in-stock one when there
 * genuinely aren't enough of the latter to fill the group.
 */
function isSoldOut(product: StorefrontSearchProduct): boolean {
  return product.available === false || product.stock === 'out';
}

function rankProducts(products: StorefrontSearchProduct[]): StorefrontSearchProduct[] {
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
 *
 * **No response, no results object.** `undefined` is `SearchBar`'s "nothing yet" — it shows no panel
 * and, past 300ms, its loading view. An empty shape with `total: 0` is its "nothing found", which is
 * a different and wrong answer while the read for the query is still in flight: that is what put
 * "No results for “bowl”" under the field for the whole second it took to answer.
 *
 * `formatPrice` is the block's own `useMoney().format` — the store's currency and the page's
 * locale, resolved where a composable can be called. This function is pure, so it takes the
 * formatter rather than reaching for the currency itself: the currency is the platform's, provided
 * to the component tree, and nothing outside a `setup()` can read it.
 */
export function toSearchBarResults(
  response: StorefrontSearchResponse | null,
  suggestionsPerGroup: number,
  formatPrice: (amount: number) => string
): SearchResults | undefined {
  if (response === null) return undefined;

  const products: SearchResultItem[] = rankProducts(response.products)
    .slice(0, suggestionsPerGroup)
    .map((product) => ({
      id: product.productId,
      title: product.title,
      href: product.url,
      // `SearchResultItem.price` is optional, so a product this storefront could not price keeps its
      // row and loses only the price. Formatting a `null` as a number would print the store's own
      // "$0.00" — a real price, and the wrong one (`StorefrontSearchProduct`).
      price: product.price === null ? undefined : formatPrice(product.price.amount),
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
