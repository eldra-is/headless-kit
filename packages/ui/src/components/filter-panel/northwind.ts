import type { FilterFacet, FilterFacetValue } from './types';

/**
 * The design spec's own Northwind facets, shared by this component's specs, its stories and its
 * browser spec, so all three are reviewed against the same panel. The colours are the palette the
 * spec publishes by name, which is also what makes the check-mark ink assertions meaningful.
 *
 * It sits beside the component rather than under `__tests__/` because the stories read it too, and
 * nothing in `src/index.ts` imports it — so it is sample content for this package's own review
 * surfaces and never reaches a consumer's bundle.
 */

export const NORTHWIND_COLOURS = {
  black: '#1f1d1b',
  brown: '#7a5236',
  natural: '#dccfb8',
  white: '#f7f5f0',
  charcoal: '#3d3c3b',
  clay: '#b0603f',
  moss: '#5f6b47',
  navy: '#27324a',
  multi:
    'conic-gradient(#b0603f 0deg 90deg, #5f6b47 90deg 180deg, #27324a 180deg 270deg, #dccfb8 270deg 360deg)',
} as const;

function value(
  id: string,
  label: string,
  count: number,
  extra: Partial<FilterFacetValue> = {}
): FilterFacetValue {
  return { value: id, label, count, ...extra };
}

export const CATEGORY_FACET: FilterFacet = {
  id: 'category',
  label: 'Category',
  type: 'list',
  values: [
    value('sweaters', 'Sweaters', 18),
    value('cardigans', 'Cardigans', 9),
    value('blankets', 'Blankets', 6),
    value('hats', 'Hats', 4),
  ],
};

/** Thirteen values: past the search threshold as well as past the six-value one. */
export const MATERIAL_FACET: FilterFacet = {
  id: 'material',
  label: 'Material',
  type: 'list',
  values: [
    value('merino', 'Merino', 14),
    value('lambswool', 'Lambswool', 11),
    value('cashmere', 'Cashmere', 8),
    value('alpaca', 'Alpaca', 7),
    value('mohair', 'Mohair', 5),
    value('linen', 'Linen', 5),
    value('cotton', 'Cotton', 4),
    value('silk', 'Silk', 3),
    value('hemp', 'Hemp', 3),
    value('jute', 'Jute', 2),
    value('creme-boucle', 'Crème bouclé', 2),
    value('stoneware', 'Stoneware', 2),
    value('porcelain', 'Porcelain', 1),
  ],
};

export const COLOUR_FACET: FilterFacet = {
  id: 'colour',
  label: 'Colour',
  type: 'colour',
  values: [
    value('black', 'Black', 14, { swatch: NORTHWIND_COLOURS.black }),
    value('brown', 'Brown', 9, { swatch: NORTHWIND_COLOURS.brown }),
    value('natural', 'Natural', 7, { swatch: NORTHWIND_COLOURS.natural }),
    value('clay', 'Clay', 6, { swatch: NORTHWIND_COLOURS.clay }),
    value('moss', 'Moss', 4, { swatch: NORTHWIND_COLOURS.moss }),
    value('multi', 'Multi', 3, { swatch: NORTHWIND_COLOURS.multi }),
    // Nothing left: stays in place, struck, disabled (spec → States).
    value('navy', 'Navy', 0, { swatch: NORTHWIND_COLOURS.navy }),
  ],
};

export const SIZE_FACET: FilterFacet = {
  id: 'size',
  label: 'Size',
  type: 'size',
  sizeGuideHref: '/pages/size-guide',
  values: [
    value('xs', 'XS', 8, { group: 'Knitwear' }),
    value('s', 'S', 12, { group: 'Knitwear' }),
    value('m', 'M', 14, { group: 'Knitwear' }),
    value('l', 'L', 12, { group: 'Knitwear' }),
    value('xl', 'XL', 8, { group: 'Knitwear' }),
    value('xxl', 'XXL', 0, { group: 'Knitwear' }),
    value('38-40', '38–40', 6, { group: 'Socks (EU)' }),
    value('42-44', '42–44', 0, { group: 'Socks (EU)' }),
  ],
};

export const PRICE_FACET: FilterFacet = {
  id: 'price',
  label: 'Price',
  type: 'range',
  min: 40,
  max: 240,
  step: 10,
  currency: true,
  // 24 buckets, the spec's own resolution.
  histogram: [1, 2, 4, 7, 11, 14, 17, 15, 12, 9, 7, 6, 5, 4, 4, 3, 3, 2, 2, 1, 1, 1, 0, 1],
};

export const AVAILABILITY_FACET: FilterFacet = {
  id: 'availability',
  label: 'Availability',
  type: 'toggle',
  values: [value('in_stock', 'In stock only', 41), value('preorder', 'Include pre-orders', 5)],
};

/** Every facet type at once, in the order the spec's own anatomy draws them. */
export const ALL_FACETS: FilterFacet[] = [
  CATEGORY_FACET,
  COLOUR_FACET,
  SIZE_FACET,
  PRICE_FACET,
  AVAILABILITY_FACET,
];

/** A facet the store answers as a tree: children sit one indent in under their parent. */
export const CATEGORY_TREE_FACET: FilterFacet = {
  id: 'category',
  label: 'Category',
  type: 'list',
  values: [
    value('tableware', 'Tableware', 16),
    value('cup', 'Cup', 6, { parent: 'tableware' }),
    value('bowl', 'Bowl', 4, { parent: 'tableware' }),
    value('knitwear', 'Knitwear', 18),
  ],
};
