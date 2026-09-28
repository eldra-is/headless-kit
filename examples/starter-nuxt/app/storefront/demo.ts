import { nextTick, reactive, ref, watch, type Ref } from 'vue';
import { createCartStore, type CartOps, type CartSnapshot } from './cart';
import { createHistoryStore, createWishlistStore } from './history';
import { roundMoney } from './money';
import type {
  StorefrontAck,
  StorefrontCartLine,
  StorefrontCartTotals,
  StorefrontCatalog,
  StorefrontCollectionInfo,
  StorefrontCollectionSelector,
  StorefrontFacet,
  StorefrontForms,
  StorefrontMedia,
  StorefrontOrder,
  StorefrontOrderStatus,
  StorefrontOrders,
  StorefrontProduct,
  StorefrontProductListItem,
  StorefrontResult,
  StorefrontRoute,
  StorefrontSearch,
  StorefrontSearchResponse,
  StorefrontSource,
} from './types';

/**
 * Northwind Goods — the fictional store every commerce block demos against (plan §"Global
 * Constraints": Portland, Oregon studio, USD, free shipping over $80, 30-day returns, 10 %
 * newsletter code). This is the data `test/support/mountBlock.ts` and `.storybook/eldra.ts` inject
 * for every block/story/preview, and what `test/storefront/demo.spec.ts` checks against the
 * catalogue named in `eldra-starter-spec/02-blocks.md` (lines 3140–3142, 3270–3272, 3373–3375,
 * 3581–3583, 3692–3694, 3806–3811).
 *
 * Money is major units throughout — see `types.ts`.
 */

const FREE_SHIPPING_THRESHOLD = 80; // $80.00
const FLAT_SHIPPING = 6; // $6.00, below the free-shipping threshold

function demoImage(index: number, alt: string): StorefrontMedia {
  // Only `product-1`..`product-6` exist in `public/demo/` today (scripts/demo-images.mjs) — a
  // commerce block that needs more can extend that manifest. Money doesn't come into it, this
  // just cycles through what already exists.
  const name = `product-${((index - 1) % 6) + 1}`;
  return { src: `/demo/${name}.svg`, alt };
}

// ---------------------------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------------------------

/** The `category` facet's own values (`WINTER_KNITWEAR_FACETS`). */
type DemoCategory = 'knitwear' | 'ceramics' | 'kitchen';

interface DemoProductDef {
  handle: string;
  title: string;
  amount: number;
  compareAt?: number;
  stock: 'in' | 'low' | 'out' | 'preorder';
  available: boolean;
  variantId: string;
  rating?: { value: number; count: number } | null;
  colours?: Array<{ name: string; swatch: string }>;
  /**
   * Which `category` facet value this product sits under, and which `size` values it is made in
   * (apparel only). Neither is part of `StorefrontProductListItem` — a product *card* never shows
   * them — but `collectionProducts` needs them to answer a filtered request, which is what a real
   * backend does from the same underlying product data. `PRODUCT_ATTRIBUTES` below is the lookup.
   */
  category: DemoCategory;
  sizes?: string[];
}

const PRODUCT_DEFS: DemoProductDef[] = [
  {
    handle: 'merino-crew-sweater',
    category: 'knitwear',
    sizes: ['xs', 's', 'm', 'l', 'xl'],
    title: 'Merino crew sweater',
    amount: 96,
    compareAt: 128,
    stock: 'in',
    available: true,
    variantId: 'merino-crew-sweater::oat::m',
    rating: { value: 4.5, count: 126 },
    colours: [
      { name: 'Oat', swatch: '#d8cbb0' },
      { name: 'Charcoal', swatch: '#3a3a3a' },
      { name: 'Clay', swatch: '#b5651d' },
      { name: 'Moss', swatch: '#6b7a4f' },
    ],
  },
  {
    handle: 'fisherman-rib-cardigan',
    category: 'knitwear',
    sizes: ['xs', 's', 'm', 'l', 'xl'],
    title: 'Fisherman rib cardigan',
    amount: 164,
    stock: 'in',
    available: true,
    variantId: 'fisherman-rib-cardigan::natural::m',
  },
  {
    handle: 'lambswool-throw-blanket',
    category: 'knitwear',
    title: 'Lambswool throw blanket',
    amount: 148,
    stock: 'in',
    available: true,
    variantId: 'lambswool-throw-blanket::default',
  },
  {
    handle: 'ribbed-lambswool-beanie',
    category: 'knitwear',
    sizes: ['s', 'm', 'l'],
    title: 'Ribbed lambswool beanie',
    amount: 38,
    stock: 'in',
    available: true,
    variantId: 'ribbed-lambswool-beanie::default',
  },
  {
    handle: 'linen-tea-towels-pair',
    category: 'kitchen',
    title: 'Linen tea towels, pair',
    amount: 24,
    stock: 'out',
    available: false,
    variantId: 'linen-tea-towels-pair::natural',
  },
  {
    handle: 'speckled-latte-mug',
    category: 'ceramics',
    title: 'Speckled latte mug',
    amount: 28,
    stock: 'in',
    available: true,
    variantId: 'speckled-latte-mug::clay',
    colours: [{ name: 'Clay', swatch: '#b5651d' }],
  },
  {
    handle: 'stoneware-dinner-plates-set-of-4',
    category: 'ceramics',
    title: 'Stoneware dinner plates, set of 4',
    amount: 72,
    stock: 'in',
    available: true,
    variantId: 'stoneware-dinner-plates-set-of-4::default',
  },
  {
    handle: 'walnut-serving-board',
    category: 'kitchen',
    title: 'Walnut serving board',
    amount: 58,
    stock: 'in',
    available: true,
    variantId: 'walnut-serving-board::large',
  },
  {
    handle: 'hand-thrown-serving-bowl',
    category: 'ceramics',
    title: 'Hand-thrown serving bowl',
    amount: 64,
    stock: 'in',
    available: true,
    variantId: 'hand-thrown-serving-bowl::default',
  },
  {
    handle: 'glazed-milk-jug',
    category: 'ceramics',
    title: 'Glazed milk jug',
    amount: 34,
    stock: 'in',
    available: true,
    variantId: 'glazed-milk-jug::default',
  },
  {
    handle: 'linen-napkins-set-of-4',
    category: 'kitchen',
    title: 'Linen napkins, set of 4',
    amount: 40,
    stock: 'in',
    available: true,
    variantId: 'linen-napkins-set-of-4::natural',
  },
  {
    handle: 'stonewashed-linen-throw',
    category: 'knitwear',
    title: 'Stonewashed linen throw',
    amount: 118,
    stock: 'in',
    available: true,
    variantId: 'stonewashed-linen-throw::default',
  },
];

/**
 * The filterable/sortable attributes of one product, keyed by the *item* handle — including the
 * suffixed clones `buildCollectionItems` makes (`merino-crew-sweater-2`), whose handles cannot be
 * mapped back to a def by string surgery (`stoneware-dinner-plates-set-of-4` already ends in a
 * number). Populated as items are built, which is why every item is created through
 * `buildListItem`/`buildCollectionItems` and never by hand.
 */
interface DemoProductAttributes {
  category: DemoCategory;
  /** The `size` facet values, or `[]` for a product with no sizes (everything but apparel). */
  sizes: readonly string[];
  /** The `colour` facet values (lower-cased colour names), or `[]`. */
  colours: readonly string[];
}
const NO_ATTRIBUTES: DemoProductAttributes = { category: 'knitwear', sizes: [], colours: [] };
const PRODUCT_ATTRIBUTES = new Map<string, DemoProductAttributes>();

function registerAttributes(handle: string, def: DemoProductDef): void {
  PRODUCT_ATTRIBUTES.set(handle, {
    category: def.category,
    sizes: def.sizes ?? [],
    colours: (def.colours ?? []).map((colour) => colour.name.toLowerCase()),
  });
}

function buildListItem(def: DemoProductDef, index: number): StorefrontProductListItem {
  registerAttributes(def.handle, def);
  return {
    handle: def.handle,
    title: def.title,
    url: `/products/${def.handle}`,
    featuredImage: demoImage(index + 1, def.title),
    price: { amount: def.amount, compareAt: def.compareAt ?? null },
    rating: def.rating ?? null,
    colours: def.colours,
    stock: def.stock,
    available: def.available,
    variantId: def.variantId,
  };
}

/** The Northwind catalogue — exactly the twelve products the block specs name. */
export const PRODUCTS: StorefrontProductListItem[] = PRODUCT_DEFS.map(buildListItem);

const MERINO_OPTIONS: StorefrontProduct['options'] = [
  {
    name: 'colour',
    label: 'Colour',
    type: 'swatches',
    values: [
      { value: 'oat', label: 'Oat', swatch: '#d8cbb0', available: true },
      { value: 'charcoal', label: 'Charcoal', swatch: '#3a3a3a', available: true },
      { value: 'clay', label: 'Clay', swatch: '#b5651d', available: true },
      { value: 'moss', label: 'Moss', swatch: '#6b7a4f', available: false },
    ],
  },
  {
    name: 'size',
    label: 'Size',
    type: 'pills',
    values: [
      { value: 'xs', label: 'XS', available: true },
      { value: 's', label: 'S', available: true },
      { value: 'm', label: 'M', available: true },
      { value: 'l', label: 'L', available: true },
      { value: 'xl', label: 'XL', available: false },
    ],
  },
];

function buildFullProduct(def: DemoProductDef, index: number): StorefrontProduct {
  const listItem = buildListItem(def, index);
  const isMerino = def.handle === 'merino-crew-sweater';
  return {
    ...listItem,
    images: [demoImage(index + 1, def.title), demoImage(index + 7, `${def.title}, alternate view`)],
    options: isMerino ? MERINO_OPTIONS : [],
    categoryTrail: isMerino
      ? [
          { label: 'Knitwear', href: '/collections/knitwear' },
          { label: 'Sweaters', href: '/collections/knitwear/sweaters' },
        ]
      : [{ label: 'Shop', href: '/collections/all' }],
    description: isMerino
      ? 'A relaxed crew knitted from extra-fine Merino in a family mill in Biella. Soft enough to wear next to skin, warm without the bulk.'
      : `${def.title}, from Northwind Goods' Portland studio.`,
    inventory: def.available ? 42 : 0,
    shipsBy: def.available ? 'Tue 29 Sep – Thu 1 Oct' : null,
  };
}

const PRODUCTS_FULL: Record<string, StorefrontProduct> = Object.fromEntries(
  PRODUCT_DEFS.map((def, index) => [def.handle, buildFullProduct(def, index)])
);

/** "You may also like" (`product-carousel`'s `related` variant default content). */
const RELATED_HANDLES = [
  'fisherman-rib-cardigan',
  'ribbed-lambswool-beanie',
  'lambswool-throw-blanket',
  'merino-crew-sweater',
  'speckled-latte-mug',
  'hand-thrown-serving-bowl',
  'walnut-serving-board',
];
const RELATED_ITEMS = RELATED_HANDLES.map((handle) =>
  PRODUCTS.find((product) => product.handle === handle)!
);

/** `product-carousel`'s `recently-viewed` variant default content. */
const DEFAULT_RECENTLY_VIEWED = [
  'speckled-latte-mug',
  'stoneware-dinner-plates-set-of-4',
  'linen-tea-towels-pair',
  'glazed-milk-jug',
  'ribbed-lambswool-beanie',
  'hand-thrown-serving-bowl',
];

// ---------------------------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------------------------

/** A curated subset of `PRODUCTS`, not a slice by position — see the `best-sellers` entry below. */
const BEST_SELLER_HANDLES = [
  'merino-crew-sweater',
  'speckled-latte-mug',
  'walnut-serving-board',
  'hand-thrown-serving-bowl',
  'stoneware-dinner-plates-set-of-4',
  'ribbed-lambswool-beanie',
];
const BEST_SELLER_ITEMS: StorefrontProductListItem[] = BEST_SELLER_HANDLES.map((handle) =>
  PRODUCTS.find((product) => product.handle === handle)!
);

const COLLECTIONS: Record<string, StorefrontCollectionInfo> = {
  'winter-knitwear': {
    handle: 'winter-knitwear',
    title: 'Winter knitwear',
    description:
      'Heavy-gauge knits for the coldest months, from our Portland studio and two family mills in Biella and the Scottish Borders.',
    image: demoImage(1, 'Winter knitwear'),
    productCount: 48,
  },
  'the-winter-edit': {
    handle: 'the-winter-edit',
    title: 'The winter edit',
    description:
      'Heavy-gauge knits, stoneware for slow breakfasts and kitchen goods for the cold months, from our Portland studio and two family mills in Biella and the Scottish Borders.',
    image: demoImage(2, 'The winter edit'),
    productCount: 48,
  },
  /**
   * `search`'s own `noResultsCollection` mock value (`blocks/search/mock.json`) — "Customers love
   * these" on the no-results page (spec `02-blocks.md` "Search results page" → Default content:
   * "Merino crew sweater, Speckled latte mug"), those two first so a `.slice(0, 4)` still leads
   * with them.
   */
  'best-sellers': {
    handle: 'best-sellers',
    title: 'Best sellers',
    description: 'The Northwind pieces shoppers reach for again and again.',
    image: demoImage(6, 'Best sellers'),
    productCount: BEST_SELLER_HANDLES.length,
  },
};

/**
 * The demo's catalog collection ids — what a CMS `reference` field stores when an
 * author picks a collection in Studio, and all a page builder draft overlay or a
 * depth-0 read hands a block. Keyed by id so `collectionProducts({ id })`
 * resolves to the handle the rest of this fixture is keyed by, which is exactly
 * what the real gateway does (`gateway.ts`'s `resolveCollectionSlug`). An id
 * nobody here knows resolves to nothing, like any other unknown collection.
 */
const COLLECTION_HANDLES_BY_ID: Record<string, string> = {
  '2f1b8d54-0d3a-4a6f-9a0b-7f6c1d2e3a01': 'winter-knitwear',
  '2f1b8d54-0d3a-4a6f-9a0b-7f6c1d2e3a02': 'the-winter-edit',
  '2f1b8d54-0d3a-4a6f-9a0b-7f6c1d2e3a03': 'best-sellers',
};

/** The id the demo fixture knows a collection by — the value a `reference` field
 *  carries for it, so a story or a test can seed one without repeating a uuid. */
export function demoCollectionId(handle: string): string | null {
  const found = Object.entries(COLLECTION_HANDLES_BY_ID).find(([, slug]) => slug === handle);
  return found?.[0] ?? null;
}

/** Collections whose items are a curated list rather than `buildCollectionItems`'s generic cycle
 *  through `PRODUCTS` by position — currently only `best-sellers`. */
const COLLECTION_ITEMS: Record<string, StorefrontProductListItem[]> = {
  'best-sellers': BEST_SELLER_ITEMS,
};
/** `best-sellers` has no facets — it is surfaced only by `search`'s no-results state, never
 *  browsed through `collection-grid`'s filter UI in this demo, so there is nothing to facet by. */
const COLLECTION_FACETS: Record<string, StorefrontFacet[]> = {
  'best-sellers': [],
};

const WINTER_KNITWEAR_FACETS: StorefrontFacet[] = [
  {
    source: 'category',
    label: 'Category',
    values: [
      { value: 'knitwear', label: 'Knitwear', count: 18 },
      { value: 'ceramics', label: 'Ceramics', count: 14 },
      { value: 'kitchen', label: 'Kitchen', count: 16 },
    ],
  },
  {
    source: 'size',
    label: 'Size',
    values: [
      { value: 'xs', label: 'XS', count: 6 },
      { value: 's', label: 'S', count: 10 },
      { value: 'm', label: 'M', count: 14 },
      { value: 'l', label: 'L', count: 10 },
      { value: 'xl', label: 'XL', count: 8 },
    ],
  },
  {
    source: 'colour',
    label: 'Colour',
    values: [
      { value: 'oat', label: 'Oat', count: 9, swatch: '#d8cbb0' },
      { value: 'charcoal', label: 'Charcoal', count: 8, swatch: '#3a3a3a' },
      { value: 'clay', label: 'Clay', count: 7, swatch: '#b5651d' },
      { value: 'moss', label: 'Moss', count: 6, swatch: '#6b7a4f' },
      { value: 'stone', label: 'Stone', count: 9, swatch: '#a8a196' },
      { value: 'natural', label: 'Natural', count: 9, swatch: '#e7ddc9' },
    ],
  },
  {
    source: 'availability',
    label: 'Availability',
    values: [
      { value: 'in-stock', label: 'In stock', count: 41 },
      { value: 'backorder', label: 'Include back-order', count: 7 },
    ],
  },
];

function buildCollectionItems(total: number): StorefrontProductListItem[] {
  return Array.from({ length: total }, (_, i) => {
    const base = PRODUCTS[i % PRODUCTS.length]!;
    const cycle = Math.floor(i / PRODUCTS.length);
    if (cycle === 0) return base;
    const suffix = `-${cycle + 1}`;
    const handle = `${base.handle}${suffix}`;
    // A clone is the same product in the shopper's eyes, so it filters and sorts identically.
    registerAttributes(handle, PRODUCT_DEFS[i % PRODUCTS.length]!);
    return {
      ...base,
      handle,
      url: `${base.url}${suffix}`,
      variantId: `${base.variantId}${suffix}`,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Filtering and sorting a collection — what a real backend does for `collectionProducts`
// ---------------------------------------------------------------------------------------------

/**
 * `collection-grid` sends `filters` keyed by its own `filters[].source` ids (see that block's
 * `requestFiltersFor`): `category`, `option:size`, `option:colour`, `availability`, and `price` as
 * a single `"<min>-<max>"` string in whole dollars with either end allowed to be empty. This is
 * the demo's answer to that request — without it the shopper's filter changed the URL, the chips
 * and the active-filter row while the grid and the count stayed exactly as they were, which is
 * worse than not offering filters at all.
 *
 * Every clause is AND-ed across sources and OR-ed within one source, the ordinary faceted-search
 * semantics the block's own UI implies (ticking two colours widens, ticking a colour and a size
 * narrows).
 */
function matchesFilters(
  item: StorefrontProductListItem,
  filters: Record<string, string[]> | undefined
): boolean {
  if (filters === undefined) return true;
  const attributes = PRODUCT_ATTRIBUTES.get(item.handle) ?? NO_ATTRIBUTES;

  for (const [source, selected] of Object.entries(filters)) {
    if (selected.length === 0) continue;
    if (source === 'category') {
      if (!selected.includes(attributes.category)) return false;
    } else if (source === 'option:size') {
      if (!selected.some((value) => attributes.sizes.includes(value))) return false;
    } else if (source === 'option:colour') {
      if (!selected.some((value) => attributes.colours.includes(value))) return false;
    } else if (source === 'availability') {
      // "In stock" means orderable now; "Include back-order" additionally admits pre-orders. A
      // sold-out product matches neither, which is why ticking either one drops it.
      const admits = selected.some((value) =>
        value === 'backorder' ? item.stock === 'preorder' : item.available && item.stock !== 'out'
      );
      if (!admits) return false;
    } else if (source === 'price') {
      if (!matchesPrice(item, selected[0])) return false;
    }
    // An unknown source is ignored rather than treated as "matches nothing": a backend that does
    // not know a filter has no business emptying the grid because of it.
  }
  return true;
}

/** `"<min>-<max>"` in whole dollars, either end empty for "no bound" (`grid.pricePrefix` is `$`). */
function matchesPrice(item: StorefrontProductListItem, range: string | undefined): boolean {
  if (range === undefined) return true;
  const [rawMin = '', rawMax = ''] = range.split('-');
  const dollars = item.price.amount;
  if (rawMin !== '' && dollars < Number(rawMin)) return false;
  if (rawMax !== '' && dollars > Number(rawMax)) return false;
  return true;
}

/**
 * The `sortOptions` values `collection-grid` offers. `featured` is the fixture's own curated order,
 * `newest` its reverse (the list is written oldest-first), and `best-selling` follows
 * `BEST_SELLER_HANDLES` with everything it does not name keeping its relative order behind them —
 * the demo has no per-product sales figures, and inventing some would be a fake statistic.
 *
 * Returns a new array; `Array.prototype.sort` is stable in every supported runtime, so equal keys
 * keep the collection's own order.
 */
function sortCollectionItems(
  items: readonly StorefrontProductListItem[],
  sort: string | undefined
): StorefrontProductListItem[] {
  const list = [...items];
  if (sort === undefined || sort === '' || sort === 'featured') return list;
  if (sort === 'newest') return list.reverse();
  if (sort === 'price-asc') return list.sort((a, b) => a.price.amount - b.price.amount);
  if (sort === 'price-desc') return list.sort((a, b) => b.price.amount - a.price.amount);
  if (sort === 'best-selling') {
    const rank = (item: StorefrontProductListItem): number => {
      const index = BEST_SELLER_HANDLES.indexOf(baseHandleOf(item));
      return index === -1 ? BEST_SELLER_HANDLES.length : index;
    };
    return list.sort((a, b) => rank(a) - rank(b));
  }
  return list;
}

/** A collection clone (`merino-crew-sweater-2`) ranks as the product it is a copy of. */
function baseHandleOf(item: StorefrontProductListItem): string {
  return PRODUCTS.some((product) => product.handle === item.handle)
    ? item.handle
    : item.handle.replace(/-\d+$/, '');
}

/**
 * The facet counts, recomputed over the collection's own items rather than hand-written.
 *
 * `WINTER_KNITWEAR_FACETS` supplies the vocabulary — which sources exist, in which order, with
 * which labels and swatches — and this supplies the numbers, so a count the filter UI shows is
 * always the number of products that value actually returns. It matters because the block hides a
 * value it counts zero of (`blocks/collection-grid/parts/groups.ts`): a hand-written count offers
 * the shopper a filter that empties the grid, which is precisely the mismatch this demo exists to
 * avoid showing. Counts are per single value (what a facet count means), so they are computed
 * against the *unfiltered* collection, like a backend that facets the whole collection.
 */
function countedFacets(
  facets: readonly StorefrontFacet[],
  items: readonly StorefrontProductListItem[]
): StorefrontFacet[] {
  const FACET_TO_FILTER_SOURCE: Record<string, string> = {
    category: 'category',
    size: 'option:size',
    colour: 'option:colour',
    availability: 'availability',
  };
  return facets.map((facet) => {
    const source = FACET_TO_FILTER_SOURCE[facet.source];
    if (source === undefined) return facet;
    return {
      ...facet,
      values: facet.values.map((value) => ({
        ...value,
        count: items.filter((item) => matchesFilters(item, { [source]: [value.value] })).length,
      })),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Order NW-10482 (`order-status`'s default content, spec lines ~3806–3835)
// ---------------------------------------------------------------------------------------------

const ORDER_LINES: StorefrontCartLine[] = [
  {
    id: 'nw-10482-1',
    variantId: 'fell-crew-sweater::oatmeal::m',
    title: 'Fell crew sweater',
    url: '/products/fell-crew-sweater',
    variantLabel: 'Oatmeal / M',
    quantity: 1,
    unitPrice: 148,
    lineTotal: 148,
    image: demoImage(1, 'Fell crew sweater'),
    max: null,
  },
  {
    id: 'nw-10482-2',
    variantId: 'everyday-mug::fjord::350ml',
    title: 'Everyday mug',
    url: '/products/everyday-mug',
    variantLabel: 'Fjord / 350 ml',
    quantity: 2,
    unitPrice: 32,
    lineTotal: 64,
    image: demoImage(2, 'Everyday mug'),
    max: null,
  },
  {
    id: 'nw-10482-3',
    variantId: 'linen-tea-towels-set-of-2::sage',
    title: 'Linen tea towels, set of 2',
    url: '/products/linen-tea-towels-set-of-2',
    variantLabel: 'Sage',
    quantity: 1,
    unitPrice: 32,
    lineTotal: 32,
    image: demoImage(3, 'Linen tea towels, set of 2'),
    max: null,
  },
];

const ORDER_TOTALS: StorefrontCartTotals = {
  subtotal: 244,
  discount: null,
  shipping: 0,
  tax: 19.52,
  total: 263.52,
};

const ORDER_SHIPPING_ADDRESS = [
  'Maren Holt',
  '214 Linden Street, Apt 3B',
  'Portland, OR 97209',
  'United States',
];

const ORDER_PAYMENT = { brand: 'Visa', last4: '4242' };
const ORDER_TRACKING_NUMBER = '1Z 999 AA1 01 2345 6784';
const ORDER_TRACKING_URL = 'https://www.ups.com/track?tracknum=1Z999AA10123456784';
const ORDER_CARRIER = 'UPS Standard';

function buildOrderSteps(status: StorefrontOrderStatus): StorefrontOrder['steps'] {
  switch (status) {
    case 'processing':
      return [
        { key: 'ordered', label: 'Ordered', date: '2026-09-18', state: 'done' },
        { key: 'packed', label: 'Packed', date: null, state: 'current' },
        { key: 'shipped', label: 'Shipped', date: null, state: 'upcoming' },
        { key: 'delivered', label: 'Delivered', date: null, state: 'upcoming' },
      ];
    case 'delivered':
      return [
        { key: 'ordered', label: 'Ordered', date: '2026-09-18', state: 'done' },
        { key: 'packed', label: 'Packed', date: '2026-09-19', state: 'done' },
        { key: 'shipped', label: 'Shipped', date: '2026-09-20', state: 'done' },
        { key: 'delivered', label: 'Delivered', date: '2026-09-24', state: 'done' },
      ];
    case 'delayed':
      return [
        { key: 'ordered', label: 'Ordered', date: '2026-09-18', state: 'done' },
        { key: 'packed', label: 'Packed', date: '2026-09-19', state: 'done' },
        { key: 'shipped', label: 'Shipped', date: '2026-09-20', state: 'done' },
        { key: 'delivered', label: 'Delivered', date: '2026-09-30', state: 'warning' },
      ];
    case 'cancelled':
      return [
        { key: 'ordered', label: 'Ordered', date: '2026-09-18', state: 'done' },
        { key: 'packed', label: 'Packed', date: '2026-09-19', state: 'warning' },
        { key: 'shipped', label: 'Shipped', date: null, state: 'upcoming' },
        { key: 'delivered', label: 'Delivered', date: null, state: 'upcoming' },
      ];
    case 'shipped':
    default:
      return [
        { key: 'ordered', label: 'Ordered', date: '2026-09-18', state: 'done' },
        { key: 'packed', label: 'Packed', date: '2026-09-19', state: 'done' },
        { key: 'shipped', label: 'Shipped', date: '2026-09-20', state: 'current' },
        { key: 'delivered', label: 'Delivered', date: '2026-09-26', state: 'upcoming' },
      ];
  }
}

/**
 * Exported so `order-status` can fall back to the same sample order the demo
 * storefront itself serves (`createDemoStorefront().orders.current`, `status` defaulting to
 * `'shipped'`) for its own "freshly inserted in the editor, no order token yet" case (spec →
 * States, "no empty layout") — without constructing a whole second `StorefrontSource` just to
 * reach one order.
 */
export function buildOrder(status: StorefrontOrderStatus = 'shipped'): StorefrontOrder {
  const base: StorefrontOrder = {
    number: 'NW-10482',
    placedAt: '2026-09-18',
    itemCount: ORDER_LINES.reduce((sum, line) => sum + line.quantity, 0),
    status,
    steps: buildOrderSteps(status),
    lines: ORDER_LINES,
    totals: ORDER_TOTALS,
    shippingAddress: ORDER_SHIPPING_ADDRESS,
    payment: ORDER_PAYMENT,
  };
  if (status === 'processing') return base;
  if (status === 'cancelled') {
    return {
      ...base,
      cancelNote:
        'Cancelled at your request on 19 September. A refund of $263.52 is on its way to Visa ending 4242 and should appear within 5 business days.',
    };
  }
  const withTracking: StorefrontOrder = {
    ...base,
    carrier: ORDER_CARRIER,
    trackingNumber: ORDER_TRACKING_NUMBER,
    trackingUrl: ORDER_TRACKING_URL,
  };
  if (status === 'delayed') {
    return {
      ...withTracking,
      eta: 'Monday 30 September',
      delayNote:
        'Storms in the North Sea have held up our carrier. New estimate: Monday 30 September. Sorry for the wait.',
    };
  }
  if (status === 'delivered') return withTracking;
  return { ...withTracking, eta: 'Thursday 26 September' };
}

// ---------------------------------------------------------------------------------------------
// Search — case-insensitive match on title, category and journal titles/deks; an empty query has
// nothing to search for, and a near miss gets a "did you mean" suggestion (spec `02-blocks.md`
// "Search results page" → Default content, the "linen" query and the "linnen napkns" no-results
// example).
// ---------------------------------------------------------------------------------------------

const JOURNAL_ARTICLES: StorefrontSearchResponse['articles'] = [
  {
    title: 'How to wash and store linen',
    href: '/journal/how-to-wash-and-store-linen',
    category: 'Care guide',
    readingTime: '4 min read',
    image: demoImage(1, 'How to wash and store linen'),
  },
  {
    title: 'Linen vs. cotton for the kitchen',
    href: '/journal/linen-vs-cotton-for-the-kitchen',
    category: 'Journal',
    readingTime: '6 min read',
    image: demoImage(2, 'Linen vs. cotton for the kitchen'),
  },
  {
    title: 'A visit to the Kortrijk flax mill',
    href: '/journal/a-visit-to-the-kortrijk-flax-mill',
    category: 'Journal',
    readingTime: '8 min read',
    image: demoImage(3, 'A visit to the Kortrijk flax mill'),
  },
];

const JOURNAL_PAGES: StorefrontSearchResponse['pages'] = [
  {
    title: 'Care guide: linen & wool',
    href: '/pages/care',
    path: 'northwindgoods.com/pages/care',
    snippet: 'How to wash, dry and store our linen and wool pieces.',
  },
  {
    title: 'Materials',
    href: '/pages/materials',
    path: 'northwindgoods.com/pages/materials',
    snippet: 'Where our linen, wool and stoneware come from.',
  },
];

/**
 * Search-friendly aliases for `PRODUCT_DEFS`, in the same order — shorter than some titles
 * ("Linen napkins, set of 4" → "linen napkins") so a "did you mean" suggestion reads the way a
 * shopper would type it, not the full merchandising title.
 */
const SEARCH_TERMS: string[] = [
  'merino crew sweater',
  'fisherman rib cardigan',
  'lambswool throw blanket',
  'ribbed lambswool beanie',
  'linen tea towels',
  'speckled latte mug',
  'stoneware dinner plates',
  'walnut serving board',
  'hand-thrown serving bowl',
  'glazed milk jug',
  'linen napkins',
  'stonewashed linen throw',
];

function normalise(text: string): string {
  return text.trim().toLowerCase();
}

function includesQuery(haystack: string, query: string): boolean {
  return normalise(haystack).includes(query);
}

/** Plain Levenshtein edit distance — short search terms only, never a document. */
function editDistance(a: string, b: string): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i += 1) rows[i]![0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + cost
      );
    }
  }
  return rows[a.length]![b.length]!;
}

/**
 * The closest `SEARCH_TERMS` entry within a quarter of its own length (at least 2 edits of
 * slack) — a real "did you mean" for a near miss ("linnen napkns" → "linen napkins"), not a guess
 * for a query that shares nothing with the catalogue.
 */
function suggestionFor(query: string): string | null {
  let best: { term: string; distance: number } | null = null;
  for (const term of SEARCH_TERMS) {
    const distance = editDistance(query, term);
    if (best === null || distance < best.distance) best = { term, distance };
  }
  if (best === null || best.distance === 0) return null;
  return best.distance <= Math.max(2, Math.ceil(best.term.length / 4)) ? best.term : null;
}

function buildSearchResponse(query: string): StorefrontSearchResponse {
  const q = normalise(query);
  if (q === '') {
    return { query, total: 0, products: [], articles: [], pages: [], suggestion: null };
  }
  const products = PRODUCTS.filter((product) => includesQuery(product.title, q));
  const articles = JOURNAL_ARTICLES.filter(
    (article) => includesQuery(article.title, q) || includesQuery(article.category, q)
  );
  const pages = JOURNAL_PAGES.filter(
    (page) => includesQuery(page.title, q) || includesQuery(page.snippet, q)
  );
  const total = products.length + articles.length + pages.length;
  return {
    query,
    total,
    products,
    articles,
    pages,
    suggestion: total === 0 ? suggestionFor(q) : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Demo cart — a small, generic in-memory engine (not the spec's exact cart-block fixture, which
// is that block's own mock/preview content; this is the "server" every block's own story adds
// items to).
// ---------------------------------------------------------------------------------------------

/**
 * The cart the `cart` block's own stories and specs render (spec `02-blocks.md` "Cart" →
 * "Default content": Merino crew sweater · Oat / M · $96.00, Speckled latte mug · Clay · $28.00
 * each × 2, Walnut serving board · Large, 45 cm · $58.00 — $210.00, over the $80 free-shipping
 * threshold). Seeded through `createDemoStorefront({ cartLines })`: the demo cart is empty by
 * default, the same as a real shopper's first visit, so nothing else changes by this existing.
 */
export const DEMO_CART_LINES: StorefrontCartLine[] = [
  {
    id: 'demo-cart-1',
    variantId: 'merino-crew-sweater::oat::m',
    title: 'Merino crew sweater',
    url: '/products/merino-crew-sweater',
    variantLabel: 'Oat / M',
    quantity: 1,
    unitPrice: 96,
    lineTotal: 96,
    image: demoImage(1, 'Merino crew sweater'),
    max: null,
  },
  {
    id: 'demo-cart-2',
    variantId: 'speckled-latte-mug::clay',
    title: 'Speckled latte mug',
    url: '/products/speckled-latte-mug',
    variantLabel: 'Clay',
    quantity: 2,
    unitPrice: 28,
    lineTotal: 56,
    image: demoImage(6, 'Speckled latte mug'),
    max: null,
  },
  {
    id: 'demo-cart-3',
    variantId: 'walnut-serving-board::large',
    title: 'Walnut serving board',
    url: '/products/walnut-serving-board',
    variantLabel: 'Large, 45 cm',
    quantity: 1,
    unitPrice: 58,
    lineTotal: 58,
    image: demoImage(8, 'Walnut serving board'),
    max: null,
  },
];

function createDemoCartOps(seedLines: StorefrontCartLine[]): CartOps {
  let lines: StorefrontCartLine[] = seedLines.map((line) => ({ ...line }));
  let discount: { code: string; amount: number } | null = null;
  let nextLineId = lines.length + 1;
  const checkoutUrl = ref<string | null>(null);

  function computeTotals(): StorefrontCartTotals {
    const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const shipping =
      subtotal === 0 ? null : subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING;
    const discountAmount = discount?.amount ?? 0;
    const total = roundMoney(Math.max(0, subtotal - discountAmount + (shipping ?? 0)));
    return { subtotal, discount, shipping, tax: null, total };
  }

  function snapshot(): CartSnapshot {
    checkoutUrl.value = lines.length > 0 ? '/checkout/demo-cart' : null;
    return { lines: [...lines], totals: computeTotals() };
  }

  return {
    async init() {
      return snapshot();
    },
    async add({ variantId, quantity }) {
      const product = PRODUCTS.find((p) => p.variantId === variantId);
      const existing = lines.find((line) => line.variantId === variantId);
      if (existing) {
        existing.quantity += quantity;
        existing.lineTotal = roundMoney(existing.unitPrice * existing.quantity);
      } else {
        const unitPrice = product?.price.amount ?? 0;
        lines = [
          ...lines,
          {
            id: `line-${nextLineId++}`,
            variantId,
            title: product?.title ?? 'Product',
            url: product?.url ?? '#',
            variantLabel: product?.colours?.[0]?.name ?? '',
            quantity,
            unitPrice,
            lineTotal: roundMoney(unitPrice * quantity),
            image: product?.featuredImage ?? null,
            max: null,
          },
        ];
      }
      return snapshot();
    },
    async setQuantity(lineId, quantity) {
      lines = lines.map((line) =>
        line.id === lineId
          ? { ...line, quantity, lineTotal: roundMoney(line.unitPrice * quantity) }
          : line
      );
      return snapshot();
    },
    async remove(lineId) {
      lines = lines.filter((line) => line.id !== lineId);
      return snapshot();
    },
    async applyDiscount(code) {
      if (code !== 'WINTER15') return { ack: { ok: false, reason: 'invalid' } };
      const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      discount = { code, amount: roundMoney(subtotal * 0.1) };
      return { ack: { ok: true }, snapshot: snapshot() };
    },
    async removeDiscount() {
      discount = null;
      return snapshot();
    },
    checkoutUrl,
  };
}

// ---------------------------------------------------------------------------------------------
// StorefrontResult helper — resolves on the next tick, so every consumer sees a real (if brief)
// `pending` transition instead of already-resolved data, matching the gateway's own async shape.
// ---------------------------------------------------------------------------------------------

/** The handle behind a selector: a slug as given, an id through the fixture's own
 *  id map — the demo's stand-in for the gateway's by-id lookup. */
function demoCollectionHandle(selector: StorefrontCollectionSelector | null): string | null {
  if (selector === null) return null;
  if ('slug' in selector) return selector.slug || null;
  return COLLECTION_HANDLES_BY_ID[selector.id] ?? null;
}

function createDemoResult<T>(
  sources: Ref<unknown>[],
  resolve: () => T | null
): StorefrontResult<T> {
  const data = ref<T | null>(null) as Ref<T | null>;
  const pending = ref(true);
  const error = ref<string | null>(null);

  async function load(): Promise<void> {
    pending.value = true;
    error.value = null;
    await nextTick();
    data.value = resolve();
    pending.value = false;
  }

  watch(sources, load, { immediate: true, deep: true });

  return { data, pending, error, refresh: load };
}

// ---------------------------------------------------------------------------------------------
// createDemoStorefront
// ---------------------------------------------------------------------------------------------

export interface DemoStorefrontOptions {
  orderStatus?: StorefrontOrderStatus;
  recentlyViewed?: string[];
  query?: string;
  collectionHandle?: string;
  productHandle?: string;
  failForms?: boolean;
  /** Seeds the cart with these lines, e.g. `DEMO_CART_LINES` — the demo cart is empty otherwise. */
  cartLines?: StorefrontCartLine[];
  /** Seeds `route.sort` — restores `collection-grid`'s sort choice the way a shared URL would. */
  sort?: string;
  /** Seeds `route.columns`. */
  columns?: string;
  /** Seeds `route.filters` — restores `collection-grid`'s filter selection and price range. */
  filters?: Record<string, string[]>;
}

/** Northwind fixtures in the theme's own view types — the "knobs" are exactly what a block spec
 * needs to demonstrate its states. */
export function createDemoStorefront(options: DemoStorefrontOptions = {}): StorefrontSource {
  const order = buildOrder(options.orderStatus ?? 'shipped');

  const route: StorefrontRoute = reactive({
    productHandle: options.productHandle ?? 'merino-crew-sweater',
    collectionHandle: options.collectionHandle ?? 'winter-knitwear',
    orderToken: 'demo-order-token',
    query: options.query ?? null,
    page: 1,
    sort: options.sort ?? null,
    columns: options.columns ?? null,
    filters: options.filters ?? {},
    setQuery(patch: Record<string, string | string[] | null>) {
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'q') {
          const first = Array.isArray(value) ? (value[0] ?? null) : value;
          route.query = first || null;
        } else if (key === 'page') {
          const first = Array.isArray(value) ? value[0] : value;
          const page = Number(first);
          route.page = Number.isFinite(page) && page > 0 ? page : 1;
        } else if (key === 'sort') {
          const first = Array.isArray(value) ? (value[0] ?? null) : value;
          route.sort = first || null;
        } else if (key === 'columns') {
          const first = Array.isArray(value) ? (value[0] ?? null) : value;
          route.columns = first || null;
        } else {
          // Every other key is a `collection-grid` filter or its price range — kept generically
          // (see `types.ts`'s own doc comment on `StorefrontRoute.filters`) rather than named here.
          const next = { ...route.filters };
          if (value === null) delete next[key];
          else next[key] = Array.isArray(value) ? value : [value];
          route.filters = next;
        }
      }
    },
  });

  async function ack(): Promise<StorefrontAck> {
    await nextTick();
    return options.failForms ? { ok: false, reason: 'failed' } : { ok: true };
  }

  const catalog: StorefrontCatalog = {
    product: (handle) =>
      createDemoResult([handle], () =>
        handle.value ? (PRODUCTS_FULL[handle.value] ?? null) : null
      ),
    collection: (handle) =>
      createDemoResult([handle], () => (handle.value ? (COLLECTIONS[handle.value] ?? null) : null)),
    /**
     * Honours `sort` and `filters`, not just `page`/`pageSize`. It used to destructure only the
     * paging pair, so in the scaffolded site and the collection sample page — both demo-backed —
     * choosing a filter or a sort updated the URL, the chips and the active-filter row while the
     * grid and the `total` never moved, and the drawer's "Show N products" button always quoted the
     * unfiltered count. `total` is now the size of the *filtered* set, which is what the grid's
     * count line and its paging both read.
     */
    collectionProducts: (collection, opts) =>
      createDemoResult([collection, opts], () => {
        const handle = demoCollectionHandle(collection.value);
        if (handle === null) return null;
        const info = COLLECTIONS[handle];
        if (!info) return null;
        const all = COLLECTION_ITEMS[handle] ?? buildCollectionItems(info.productCount);
        const { page, pageSize, sort, filters } = opts.value;
        const matching = all.filter((item) => matchesFilters(item, filters));
        const ordered = sortCollectionItems(matching, sort);
        const start = (page - 1) * pageSize;
        return {
          items: ordered.slice(start, start + pageSize),
          total: ordered.length,
          facets: countedFacets(COLLECTION_FACETS[handle] ?? WINTER_KNITWEAR_FACETS, all),
        };
      }),
    related: (handle, limit) =>
      createDemoResult([handle], () => (handle.value ? RELATED_ITEMS.slice(0, limit) : [])),
    byHandles: (handles) =>
      createDemoResult([handles], () =>
        handles.value
          .map((handle) => PRODUCTS.find((product) => product.handle === handle))
          .filter((product): product is StorefrontProductListItem => Boolean(product))
      ),
    notifyBackInStock: () => ack(),
  };

  const search: StorefrontSearch = {
    run: (query) => createDemoResult([query], () => buildSearchResponse(query.value)),
  };

  const orders: StorefrontOrders = {
    current: (token) => createDemoResult([token], () => (token.value ? order : null)),
  };

  const forms: StorefrontForms = {
    subscribe: () => ack(),
    sendMessage: () => ack(),
  };

  return {
    ready: ref(true),
    route,
    catalog,
    cart: createCartStore(createDemoCartOps(options.cartLines ?? [])),
    search,
    orders,
    forms,
    wishlist: createWishlistStore(),
    history: createHistoryStore({
      initialRecentlyViewed: options.recentlyViewed ?? DEFAULT_RECENTLY_VIEWED,
    }),
  };
}
