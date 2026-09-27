import { nextTick, reactive, ref, watch, type Ref } from 'vue';
import { createCartStore, type CartOps, type CartSnapshot } from './cart';
import { createHistoryStore, createWishlistStore } from './history';
import type {
  StorefrontAck,
  StorefrontCartLine,
  StorefrontCartTotals,
  StorefrontCatalog,
  StorefrontCollectionInfo,
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
 * Money is minor units (cents) throughout — see `types.ts`.
 */

const FREE_SHIPPING_THRESHOLD = 8000; // $80.00
const FLAT_SHIPPING = 600; // $6.00, below the free-shipping threshold

function demoImage(index: number, alt: string): StorefrontMedia {
  // Only `product-1`..`product-6` exist in `public/demo/` today (scripts/demo-images.mjs) — later
  // commerce block tasks are what actually render these, and can extend that manifest then. Cents
  // don't apply to indices, this just cycles through what already exists.
  const name = `product-${((index - 1) % 6) + 1}`;
  return { src: `/demo/${name}.svg`, alt };
}

// ---------------------------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------------------------

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
}

const PRODUCT_DEFS: DemoProductDef[] = [
  {
    handle: 'merino-crew-sweater',
    title: 'Merino crew sweater',
    amount: 9600,
    compareAt: 12800,
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
    title: 'Fisherman rib cardigan',
    amount: 16400,
    stock: 'in',
    available: true,
    variantId: 'fisherman-rib-cardigan::natural::m',
  },
  {
    handle: 'lambswool-throw-blanket',
    title: 'Lambswool throw blanket',
    amount: 14800,
    stock: 'in',
    available: true,
    variantId: 'lambswool-throw-blanket::default',
  },
  {
    handle: 'ribbed-lambswool-beanie',
    title: 'Ribbed lambswool beanie',
    amount: 3800,
    stock: 'in',
    available: true,
    variantId: 'ribbed-lambswool-beanie::default',
  },
  {
    handle: 'linen-tea-towels-pair',
    title: 'Linen tea towels, pair',
    amount: 2400,
    stock: 'out',
    available: false,
    variantId: 'linen-tea-towels-pair::natural',
  },
  {
    handle: 'speckled-latte-mug',
    title: 'Speckled latte mug',
    amount: 2800,
    stock: 'in',
    available: true,
    variantId: 'speckled-latte-mug::clay',
    colours: [{ name: 'Clay', swatch: '#b5651d' }],
  },
  {
    handle: 'stoneware-dinner-plates-set-of-4',
    title: 'Stoneware dinner plates, set of 4',
    amount: 7200,
    stock: 'in',
    available: true,
    variantId: 'stoneware-dinner-plates-set-of-4::default',
  },
  {
    handle: 'walnut-serving-board',
    title: 'Walnut serving board',
    amount: 5800,
    stock: 'in',
    available: true,
    variantId: 'walnut-serving-board::large',
  },
  {
    handle: 'hand-thrown-serving-bowl',
    title: 'Hand-thrown serving bowl',
    amount: 6400,
    stock: 'in',
    available: true,
    variantId: 'hand-thrown-serving-bowl::default',
  },
  {
    handle: 'glazed-milk-jug',
    title: 'Glazed milk jug',
    amount: 3400,
    stock: 'in',
    available: true,
    variantId: 'glazed-milk-jug::default',
  },
  {
    handle: 'linen-napkins-set-of-4',
    title: 'Linen napkins, set of 4',
    amount: 4000,
    stock: 'in',
    available: true,
    variantId: 'linen-napkins-set-of-4::natural',
  },
  {
    handle: 'stonewashed-linen-throw',
    title: 'Stonewashed linen throw',
    amount: 11800,
    stock: 'in',
    available: true,
    variantId: 'stonewashed-linen-throw::default',
  },
];

function buildListItem(def: DemoProductDef, index: number): StorefrontProductListItem {
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
    return {
      ...base,
      handle: `${base.handle}${suffix}`,
      url: `${base.url}${suffix}`,
      variantId: `${base.variantId}${suffix}`,
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
    unitPrice: 14800,
    lineTotal: 14800,
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
    unitPrice: 3200,
    lineTotal: 6400,
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
    unitPrice: 3200,
    lineTotal: 3200,
    image: demoImage(3, 'Linen tea towels, set of 2'),
    max: null,
  },
];

const ORDER_TOTALS: StorefrontCartTotals = {
  subtotal: 24400,
  discount: null,
  shipping: 0,
  tax: 1952,
  total: 26352,
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
// Search — the "linen" query (spec lines ~3692–3694)
// ---------------------------------------------------------------------------------------------

function buildSearchResponse(query: string): StorefrontSearchResponse {
  return {
    query,
    total: 17,
    products: PRODUCTS,
    articles: [
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
    ],
    pages: [
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
    ],
    suggestion: null,
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
    unitPrice: 9600,
    lineTotal: 9600,
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
    unitPrice: 2800,
    lineTotal: 5600,
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
    unitPrice: 5800,
    lineTotal: 5800,
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
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const shipping =
      subtotal === 0 ? null : subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING;
    const discountAmount = discount?.amount ?? 0;
    const total = Math.max(0, subtotal - discountAmount + (shipping ?? 0));
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
        existing.lineTotal = existing.unitPrice * existing.quantity;
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
            lineTotal: unitPrice * quantity,
            image: product?.featuredImage ?? null,
            max: null,
          },
        ];
      }
      return snapshot();
    },
    async setQuantity(lineId, quantity) {
      lines = lines.map((line) =>
        line.id === lineId ? { ...line, quantity, lineTotal: line.unitPrice * quantity } : line
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
      discount = { code, amount: Math.round(subtotal * 0.1) };
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
}

/** Northwind fixtures in the theme's own view types — the "knobs" are exactly what a block spec
 * needs to demonstrate its states (design doc §"Storefront source"). */
export function createDemoStorefront(options: DemoStorefrontOptions = {}): StorefrontSource {
  const order = buildOrder(options.orderStatus ?? 'shipped');

  const route: StorefrontRoute = reactive({
    productHandle: options.productHandle ?? 'merino-crew-sweater',
    collectionHandle: options.collectionHandle ?? 'winter-knitwear',
    orderToken: 'demo-order-token',
    query: options.query ?? null,
    page: 1,
    setQuery(patch: Record<string, string | string[] | null>) {
      for (const [key, value] of Object.entries(patch)) {
        if (key === 'q') {
          const first = Array.isArray(value) ? (value[0] ?? null) : value;
          route.query = first || null;
        } else if (key === 'page') {
          const first = Array.isArray(value) ? value[0] : value;
          const page = Number(first);
          route.page = Number.isFinite(page) && page > 0 ? page : 1;
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
    collectionProducts: (handle, opts) =>
      createDemoResult([handle, opts], () => {
        if (!handle.value) return null;
        const info = COLLECTIONS[handle.value];
        if (!info) return null;
        const all = buildCollectionItems(info.productCount);
        const { page, pageSize } = opts.value;
        const start = (page - 1) * pageSize;
        return {
          items: all.slice(start, start + pageSize),
          total: info.productCount,
          facets: WINTER_KNITWEAR_FACETS,
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
