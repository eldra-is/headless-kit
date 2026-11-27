import type { Component } from 'vue';
import type { ProductCardPart } from '@eldrajs/ui';
import { iconComponent } from '../composables/iconComponent';

/**
 * The theme's product card: how `collection-grid`, `product-carousel` and `search` all draw
 * `@eldrajs/ui`'s `ProductCard`, restyled through its props and `classes`, never forked. One place,
 * so the three blocks cannot drift apart the way three copies of a class map would.
 *
 * What it draws: the photo with a "New" (white) or "Sale" (accent) chip top-left and a "+ Add" pill
 * bottom-right on it; under the photo the title and the price on one row (price right) once the
 * block is wider than 760px, stacked on a phone; the maker in muted text; then a plain row of
 * colour dots. No rating and no stock line. On a phone the pill is a round "+" alone, still named
 * "Add <title> to cart". The title is not underlined until hover.
 *
 * The card root becomes a one-column grid so the pill can share the photo's grid cell without
 * knowing its height. The `@min-[47.5625rem]` / `@max-[47.5rem]` breakpoints are container
 * queries against the block, the same 760px line the rest of the theme switches at.
 */

/** The card root: a one-column grid, photo in the first row. */
export const PRODUCT_CARD_CLASS = 'min-w-0 grid grid-cols-1 grid-rows-[auto_1fr] content-start';

/* Every class is written out in full, never assembled from pieces: Tailwind finds classes by
   reading the source text, so a class put together from parts is a class it never generates. */

export const PRODUCT_CARD_CLASSES: Partial<Record<ProductCardPart, string>> = {
  media: '[grid-area:1/1]',
  // The design's badges have 0.25rem corners (`.nw-pc__badge`), tighter than the theme's `radius-sm`.
  newBadge:
    'rounded-[0.25rem] border-transparent text-xs font-bold tracking-[0.04em] bg-background text-text',
  saleBadge: 'rounded-[0.25rem] border-transparent text-xs font-bold tracking-[0.04em]',
  soldOutBadge: 'rounded-[0.25rem] text-xs font-bold tracking-[0.04em]',
  body:
    '[grid-area:2/1] mt-3 grid grid-cols-1 content-start gap-0 ' +
    '@min-[47.5625rem]:grid-cols-[minmax(0,1fr)_auto] @min-[47.5625rem]:items-baseline @min-[47.5625rem]:gap-x-3',
  title: 'leading-[1.35] tracking-normal',
  link:
    'no-underline hover:underline hover:decoration-1 hover:decoration-current ' +
    'hover:underline-offset-[0.2em]',
  price: 'whitespace-nowrap [&>[data-part=root]]:text-base',
  vendor: 'mt-1 text-sm leading-[1.6] tracking-normal @min-[47.5625rem]:col-span-2',
  swatches: 'mt-3 @min-[47.5625rem]:col-span-2',
  quickAdd:
    '[grid-area:1/1] z-10 m-3 mt-0 self-end justify-self-end w-auto h-10 min-h-10 gap-1.5 [&_svg]:size-4 ' +
    'rounded-full border-0 bg-background px-3.5 text-sm font-semibold text-text ' +
    'shadow-[0_2px_8px_rgb(29_27_24/0.15)] hover:bg-text hover:text-background disabled:opacity-90 ' +
    '@max-[47.5rem]:enabled:w-10 @max-[47.5rem]:enabled:min-w-10 @max-[47.5rem]:enabled:px-0 @max-[47.5rem]:enabled:justify-center',
  quickAddLabel: '@max-[47.5rem]:hidden',
};

/** The pill's "+". */
const PlusIcon: Component = iconComponent('plus');

/** `vue-i18n`'s `t`, as much of it as this needs. */
type Translate = (key: string, values?: Record<string, unknown>) => string;

/**
 * Every prop the theme sets on a `<ProductCard>`, for `v-bind`. The block still passes the
 * product, ratio, heading level, link component, currency, locale and refresh state itself, and
 * `showSwatches`/`quickAdd` where its own fields decide them.
 */
export function productCardLook(t: Translate, title: string) {
  return {
    class: PRODUCT_CARD_CLASS,
    classes: PRODUCT_CARD_CLASSES,
    showVendor: true,
    vendorPlacement: 'below' as const,
    showRating: false,
    maxSwatches: 6,
    saleBadgeLabel: t('productCard.sale'),
    quickAddLabel: t('productCard.add'),
    quickAddName: t('productCard.addName', { title }),
    quickAddIcon: PlusIcon,
  };
}
