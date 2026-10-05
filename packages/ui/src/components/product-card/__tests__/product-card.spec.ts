import { defineComponent, h, nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { provideEldraUiMessages } from '../../../composables/useMessages';
import { isIS } from '../../../messages/is-IS';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import ProductCard from '../ProductCard.vue';
import type { ProductCardProduct } from '../types';

/** The spec's own reference product (spec "Product card" → Anatomy example row). */
const PRODUCT: ProductCardProduct = {
  title: 'Merino crew sweater',
  url: '/products/merino-crew-sweater',
  vendor: 'Kiln Street Studio',
  featuredImage: { src: '/img/sweater.jpg', alt: 'Oatmeal merino crew sweater, folded' },
  price: { amount: 3840, compareAt: 4800 },
  rating: { value: 4.5, count: 128 },
  colours: [
    { name: 'Oatmeal', swatch: '#e7ded1' },
    { name: 'Charcoal', swatch: '#2f2f2f' },
    { name: 'Moss', swatch: '#4d5a45' },
    { name: 'Clay', swatch: '#8c3b2a' },
    { name: 'Ecru', swatch: '#f2ede3' },
  ],
  badge: { variant: 'sale' },
  available: true,
};

/** Twice the length of the spec's own title example. */
const LONG_TITLE =
  'Hand-finished merino wool crew neck sweater in a relaxed fit with ribbed cuffs and hem';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ProductCard — element and parts', () => {
  it('renders an article with data-part on every part', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT, showVendor: true } });
    expect(wrapper.element.tagName).toBe('ARTICLE');
    expect(wrapper.attributes('data-part')).toBe('root');
    for (const part of [
      'media',
      'badges',
      'body',
      'vendor',
      'title',
      'link',
      'price',
      'rating',
      'swatches',
      'quickAdd',
    ]) {
      expect(wrapper.find(`[data-part="${part}"]`).exists(), part).toBe(true);
    }
    wrapper.unmount();
  });

  it('renders the title at the default heading level (h3)', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    expect(wrapper.get('[data-part="title"]').element.tagName).toBe('H3');
    wrapper.unmount();
  });

  it('renders the title at a caller-given heading level', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT, headingLevel: 2 } });
    expect(wrapper.get('[data-part="title"]').element.tagName).toBe('H2');
    wrapper.unmount();
  });

  it('renders the full title text in the link, unclamped in the DOM text', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: { ...PRODUCT, title: LONG_TITLE } },
    });
    expect(wrapper.get('[data-part="link"]').text()).toBe(LONG_TITLE);
    wrapper.unmount();
  });

  it('clamps the title to two lines', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    expect(wrapper.get('[data-part="title"]').classes()).toContain('line-clamp-2');
    wrapper.unmount();
  });
});

describe('ProductCard — the stretched link', () => {
  it('points the link at the product url', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    const link = wrapper.get('[data-part="link"]');
    expect(link.element.tagName).toBe('A');
    expect(link.attributes('href')).toBe(PRODUCT.url);
    wrapper.unmount();
  });

  it('underlines the title at rest, thickening on hover (operator decision: all links underlined)', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    const link = wrapper.get('[data-part="link"]').classes();
    expect(link).toContain('underline');
    expect(link).not.toContain('no-underline');
    expect(link).toContain('hover:decoration-2');
    wrapper.unmount();
  });

  it('covers the card with an ::after pseudo-element rather than the link box alone', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    const link = wrapper.get('[data-part="link"]');
    expect(link.classes()).toContain('after:absolute');
    expect(link.classes()).toContain('after:inset-0');
    // Anchored to the card, not itself: the link carries no `relative` of its own.
    expect(link.classes()).not.toContain('relative');
    wrapper.unmount();
  });

  /**
   * I6: `ProductCard` consumes `card/stretchedLink.ts`'s `STRETCHED_LINK`/`STRETCHED_LINK_OUTLINE`
   * rather than a hand-rolled copy of the same two class strings — asserting `outline-none`
   * specifically (not just the `after:*` pair above) is what a coincidentally-identical hard-coded
   * string would also pass; this is the one that would break if `ProductCard` stopped importing
   * the shared constant.
   */
  it('suppresses the native outline the same way ContentCard/FeatureCard do (shared stretchedLink.ts)', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    expect(wrapper.get('[data-part="link"]').classes()).toContain('outline-none');
    wrapper.unmount();
  });

  it('draws the proxy focus ring on the root, not on the link', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    expect(wrapper.classes()).toContain('eldra-focus-proxy');
    expect(wrapper.classes()).toContain('eldra-focus');
    expect(wrapper.get('[data-part="link"]').classes()).not.toContain('eldra-focus-proxy');
    wrapper.unmount();
  });

  it('gives the root radius-lg corners for the ring to follow', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    expect(wrapper.classes()).toContain('rounded-lg');
    wrapper.unmount();
  });

  it('renders the link as the given `linkAs` component and forwards the url as `to`', () => {
    const FakeRouterLink = defineComponent({
      props: { to: { type: String, required: true } },
      setup:
        (props, { slots }) =>
        () =>
          h('a', { 'data-fake-router-link': props.to }, slots.default?.()),
    });
    const wrapper = mountWith(ProductCard, {
      props: { product: PRODUCT, linkAs: FakeRouterLink },
    });
    const link = wrapper.get('[data-part="link"]');
    expect(link.attributes('data-fake-router-link')).toBe(PRODUCT.url);
    expect(link.attributes('href')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('ProductCard — quick add', () => {
  it('renders the quick-add button outside the stretched link, above it in stacking order', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    const button = wrapper.get('[data-part="quickAdd"]');
    expect(button.element.tagName).toBe('BUTTON');
    expect(button.classes()).toContain('relative');
    expect(button.classes()).toContain('z-10');
    wrapper.unmount();
  });

  it('names the quick-add button "Quick add" plus the full product title', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    const button = wrapper.get('[data-part="quickAdd"]');
    expect(button.attributes('aria-label')).toBe('Quick add Merino crew sweater');
    wrapper.unmount();
  });

  it('reads the Icelandic accessible name, title placed mid-sentence', () => {
    const Wrapped = defineComponent({
      setup() {
        provideEldraUiMessages(isIS);
        return () => h(ProductCard, { product: PRODUCT });
      },
    });
    const wrapper = mountWith(Wrapped);
    expect(wrapper.get('[data-part="quickAdd"]').attributes('aria-label')).toBe(
      'Setja Merino crew sweater í körfu'
    );
    wrapper.unmount();
  });

  it('shows "Quick add" as the visible label', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    expect(wrapper.get('[data-part="quickAdd"]').text()).toBe('Quick add');
    wrapper.unmount();
  });

  it('emits quickAdd with the product when clicked', async () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    await wrapper.get('[data-part="quickAdd"]').trigger('click');
    expect(wrapper.emitted('quickAdd')).toEqual([[PRODUCT]]);
    wrapper.unmount();
  });

  it('never navigates when quick add is clicked (no click reaches the link)', async () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    const linkClicks: Event[] = [];
    wrapper.get('[data-part="link"]').element.addEventListener('click', (e) => linkClicks.push(e));
    await wrapper.get('[data-part="quickAdd"]').trigger('click');
    expect(linkClicks).toHaveLength(0);
    wrapper.unmount();
  });

  it('hides the quick-add control entirely when quickAdd is false', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT, quickAdd: false } });
    expect(wrapper.find('[data-part="quickAdd"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('is at least 2.5rem tall (Button md, control-h)', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    expect(wrapper.get('[data-part="quickAdd"]').classes()).toContain('control-h');
    wrapper.unmount();
  });
});

describe('ProductCard — sold out', () => {
  const soldOut = { ...PRODUCT, available: false };

  it('dims the media to 60% opacity', () => {
    const wrapper = mountWith(ProductCard, { props: { product: soldOut } });
    expect(wrapper.get('[data-part="media"] img').classes()).toContain('opacity-60');
    wrapper.unmount();
  });

  it('does not dim the media for an available product', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    expect(wrapper.get('[data-part="media"] img').classes()).not.toContain('opacity-60');
    wrapper.unmount();
  });

  it('shows an outline "Sold out" badge in the badge stack', () => {
    const wrapper = mountWith(ProductCard, { props: { product: soldOut } });
    const badges = wrapper.findAll('[data-part="badges"] [data-part="root"]');
    expect(badges).toHaveLength(1);
    expect(badges[0]?.text()).toBe('Sold out');
    expect(badges[0]?.classes()).toContain('border-border-strong');
    wrapper.unmount();
  });

  it('suppresses the sale/new badge while sold out', () => {
    const wrapper = mountWith(ProductCard, { props: { product: soldOut } });
    expect(wrapper.text()).not.toContain('−');
    wrapper.unmount();
  });

  it('replaces quick add with a disabled "Sold out" button', () => {
    const wrapper = mountWith(ProductCard, { props: { product: soldOut } });
    const button = wrapper.get('[data-part="quickAdd"]');
    expect(button.text()).toBe('Sold out');
    expect((button.element as HTMLButtonElement).disabled).toBe(true);
    wrapper.unmount();
  });

  it('renders no quick-add control at all when quickAdd is false, sold out included', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: soldOut, quickAdd: false },
    });
    expect(wrapper.find('[data-part="quickAdd"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('removes the disabled button from the tab order', () => {
    const wrapper = mountWith(ProductCard, { props: { product: soldOut } });
    const focusable = wrapper.findAll('a, button:not([disabled]), [tabindex]');
    expect(focusable).toHaveLength(1);
    expect(focusable[0]?.element.tagName).toBe('A');
    wrapper.unmount();
  });
});

describe('ProductCard — sale badge', () => {
  it('renders the rounded percentage with a hidden "off"', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    const badge = wrapper.get('[data-part="badges"] [data-part="root"]');
    expect(badge.get('[data-part="label"]').text()).toBe('−20%');
    expect(badge.get('[data-part="hiddenSuffix"]').text()).toBe('off');
    wrapper.unmount();
  });

  it('renders no badge when there is no compareAt or badge flag', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: { ...PRODUCT, badge: null, price: { amount: 3840 } } },
    });
    expect(wrapper.find('[data-part="badges"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders a "New" badge for badge.variant "new"', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: { ...PRODUCT, badge: { variant: 'new' }, price: { amount: 3840 } } },
    });
    expect(wrapper.get('[data-part="badges"]').text()).toBe('New');
    wrapper.unmount();
  });

  /**
   * M9's own defect: `badge: { variant: 'sale' }` with no `compareAt` (or one that is not actually
   * higher than `amount`) previously rendered a fabricated "−0%" badge — `discountPercent` is `0`
   * whenever there is no real discount, and the old template rendered the sale badge whenever
   * `badgeKind === 'sale'` regardless of that value.
   */
  it('renders no sale badge, and no badge at all, when badge is "sale" but there is no discount', () => {
    const wrapper = mountWith(ProductCard, {
      props: {
        product: {
          ...PRODUCT,
          badge: { variant: 'sale' },
          price: { amount: 3840, compareAt: null },
        },
      },
    });
    // The badge-stack wrapper still renders (`badgeKind` is `'sale'`, unrelated to the discount),
    // but no `Badge` renders inside it — never a fabricated "−0%".
    expect(wrapper.find('[data-part="badges"] [data-part="root"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('%');
    wrapper.unmount();
  });

  it('renders no sale badge when compareAt is equal to or lower than amount', () => {
    const wrapper = mountWith(ProductCard, {
      props: {
        product: {
          ...PRODUCT,
          badge: { variant: 'sale' },
          price: { amount: 3840, compareAt: 3840 },
        },
      },
    });
    expect(wrapper.find('[data-part="badges"] [data-part="root"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('%');
    wrapper.unmount();
  });
});

describe('ProductCard — vendor, rating and swatch toggles', () => {
  it('hides the vendor by default', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    expect(wrapper.find('[data-part="vendor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the vendor when showVendor is true', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT, showVendor: true } });
    expect(wrapper.get('[data-part="vendor"]').text()).toBe('Kiln Street Studio');
    wrapper.unmount();
  });

  it('renders no vendor line when the product has none, even with showVendor true', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: { ...PRODUCT, vendor: undefined }, showVendor: true },
    });
    expect(wrapper.find('[data-part="vendor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows the rating by default', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    expect(wrapper.find('[data-part="rating"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hides the rating when showRating is false', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT, showRating: false } });
    expect(wrapper.find('[data-part="rating"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('hides the rating when the product has none, even with showRating true', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: { ...PRODUCT, rating: null }, showRating: true },
    });
    expect(wrapper.find('[data-part="rating"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('shows up to three swatch dots plus a "+N" overflow', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    expect(wrapper.findAll('[data-part="swatch"]')).toHaveLength(3);
    expect(wrapper.get('[data-part="swatchOverflow"]').text()).toBe('+2');
    wrapper.unmount();
  });

  it('renders no overflow badge with three or fewer colours', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: { ...PRODUCT, colours: PRODUCT.colours!.slice(0, 2) } },
    });
    expect(wrapper.findAll('[data-part="swatch"]')).toHaveLength(2);
    expect(wrapper.find('[data-part="swatchOverflow"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('sets each dot colour as an inline style, never a class', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    const swatch = wrapper.get('[data-part="swatch"]');
    expect((swatch.element as HTMLElement).getAttribute('style')).toContain('e7ded1');
    expect(swatch.classes().join(' ')).not.toContain('#e7ded1');
    wrapper.unmount();
  });

  it('hides the swatch row from assistive technology and names the count in hidden text', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    expect(wrapper.get('[data-part="swatches"]').attributes('aria-hidden')).toBe('true');
    expect(wrapper.text()).toContain('Available in 5 colours');
    wrapper.unmount();
  });

  it('hides swatches when showSwatches is false', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT, showSwatches: false } });
    expect(wrapper.find('[data-part="swatches"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders no swatch row when the product has no colours', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: { ...PRODUCT, colours: undefined } },
    });
    expect(wrapper.find('[data-part="swatches"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('ProductCard — stock line (addition beyond the literal anatomy)', () => {
  it('renders no stock line when the product has none', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    expect(wrapper.find('[data-part="stockLine"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders the StockBadge line for a given level', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: { ...PRODUCT, stock: 'low' } },
    });
    expect(wrapper.get('[data-part="stockLine"]').text()).toContain('Low stock');
    wrapper.unmount();
  });

  it('suppresses the stock line while sold out', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: { ...PRODUCT, stock: 'low', available: false } },
    });
    expect(wrapper.find('[data-part="stockLine"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('ProductCard — image ratio', () => {
  it('passes the ratio through to the media frame', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT, ratio: '1x1' } });
    const frame = wrapper.get('[data-part="media"] [data-part="frame"]');
    expect((frame.element as HTMLElement).style.aspectRatio).toBe('1 / 1');
    wrapper.unmount();
  });

  it('defaults to 4x5', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    const frame = wrapper.get('[data-part="media"] [data-part="frame"]');
    expect((frame.element as HTMLElement).style.aspectRatio).toBe('4 / 5');
    wrapper.unmount();
  });

  it('renders the no-image placeholder, decorative, at the same ratio', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: { ...PRODUCT, featuredImage: null } },
    });
    const placeholder = wrapper.get('[data-part="media"] [data-part="placeholder"]');
    expect(placeholder.attributes('aria-hidden')).toBe('true');
    expect(placeholder.attributes('role')).toBeUndefined();
    const frame = wrapper.get('[data-part="media"] [data-part="frame"]');
    expect((frame.element as HTMLElement).style.aspectRatio).toBe('4 / 5');
    wrapper.unmount();
  });

  it('scales the image on hover, off the card root, and drops it under reduced motion', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT } });
    const img = wrapper.get('[data-part="media"] img');
    expect(img.classes()).toContain('group-hover:scale-[1.03]');
    expect(img.classes()).toContain('motion-reduce:transition-none');
    // The hover trigger is the card root's own `:hover` (`group`), not a `group-has-*` on the
    // stretched link — see `rootClass`'s own comment.
    expect(wrapper.classes()).toContain('group');
  });
});

describe('ProductCard — loading', () => {
  it('renders role=group, aria-busy and the loading accessible name', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT, loading: true } });
    expect(wrapper.attributes('role')).toBe('group');
    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.attributes('aria-label')).toBe('Loading product');
    wrapper.unmount();
  });

  it('renders a skeleton in place of the whole card', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT, loading: true } });
    expect(wrapper.find('[data-part="skeleton"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="link"]').exists()).toBe(false);
    expect(wrapper.find('[data-part="quickAdd"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders no interactive element while loading', () => {
    const wrapper = mountWith(ProductCard, { props: { product: PRODUCT, loading: true } });
    expect(wrapper.findAll('a, button, [tabindex]')).toHaveLength(0);
    wrapper.unmount();
  });
});

describe('ProductCard — currency and locale', () => {
  it('formats the price with a given currency and locale', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: PRODUCT, currency: 'ISK', locale: 'is-IS' },
    });
    expect(wrapper.get('[data-part="price"] [data-part="current"]').text()).toContain('kr');
    wrapper.unmount();
  });
});

describe('ProductCard — composed children keep their own data-part="root" (I7)', () => {
  it('wraps Price, Rating and StockBadge so each keeps its own data-part="root" nested inside', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: { ...PRODUCT, stock: 'low' } },
    });
    // The wrapper carries the parent's own part name...
    expect(wrapper.get('[data-part="price"]').element.tagName).toBe('DIV');
    expect(wrapper.get('[data-part="rating"]').element.tagName).toBe('DIV');
    expect(wrapper.get('[data-part="stockLine"]').element.tagName).toBe('DIV');
    // ...while each child's own root, with its own data-part="root", survives nested inside it —
    // proving the fallthrough `data-part` no longer overwrites it.
    expect(wrapper.find('[data-part="price"] [data-part="root"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="rating"] [data-part="root"]').exists()).toBe(true);
    expect(wrapper.find('[data-part="stockLine"] [data-part="root"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('ProductCard — customisation', () => {
  it('merges an override onto every part', () => {
    const wrapper = mountWith(ProductCard, {
      props: {
        product: PRODUCT,
        classes: {
          root: 'ring-1',
          media: 'ring-2',
          badges: 'gap-4',
          body: 'gap-4',
          vendor: 'italic',
          title: 'uppercase',
          link: 'font-bold',
          price: 'ml-4',
          rating: 'ml-4',
          swatches: 'ml-4',
          swatch: 'grayscale',
          swatchOverflow: 'italic',
          quickAdd: 'ml-4',
        },
      },
    });
    expect(wrapper.classes()).toContain('ring-1');
    expect(wrapper.get('[data-part="media"]').classes()).toContain('ring-2');
    expect(wrapper.get('[data-part="badges"]').classes()).toContain('gap-4');
    expect(wrapper.get('[data-part="body"]').classes()).toContain('gap-4');
    expect(wrapper.get('[data-part="title"]').classes()).toContain('uppercase');
    expect(wrapper.get('[data-part="link"]').classes()).toContain('font-bold');
    expect(wrapper.get('[data-part="price"]').classes()).toContain('ml-4');
    expect(wrapper.get('[data-part="rating"]').classes()).toContain('ml-4');
    expect(wrapper.get('[data-part="swatch"]').classes()).toContain('grayscale');
    expect(wrapper.get('[data-part="swatchOverflow"]').classes()).toContain('italic');
    expect(wrapper.get('[data-part="quickAdd"]').classes()).toContain('ml-4');
    wrapper.unmount();
  });
});

describe('ProductCard — narrow container', () => {
  it('renders without horizontal overflow in a 20rem container', () => {
    const wrapper = mountNarrow(ProductCard, { props: { product: PRODUCT, showVendor: true } });
    expect(wrapper.attributes('data-part')).toBe('root');
    expect((wrapper.element as HTMLElement).scrollWidth).toBeLessThanOrEqual(
      (wrapper.element as HTMLElement).offsetWidth + 1
    );
    wrapper.unmount();
  });

  it('renders a long title clamped rather than overflowing', () => {
    const wrapper = mountNarrow(ProductCard, {
      props: { product: { ...PRODUCT, title: LONG_TITLE } },
    });
    expect(wrapper.get('[data-part="title"]').classes()).toContain('line-clamp-2');
    wrapper.unmount();
  });
});

describe('ProductCard — accessibility', () => {
  it.each([
    ['default', { product: PRODUCT }],
    ['with vendor', { product: PRODUCT, showVendor: true }],
    ['sold out', { product: { ...PRODUCT, available: false } }],
    ['no image', { product: { ...PRODUCT, featuredImage: null } }],
    ['no rating', { product: PRODUCT, showRating: false }],
    ['no quick add', { product: PRODUCT, quickAdd: false }],
    ['minimal', { product: PRODUCT, showRating: false, showSwatches: false, quickAdd: false }],
    ['loading', { product: PRODUCT, loading: true }],
    ['stock line', { product: { ...PRODUCT, stock: 'preorder' } }],
  ] as const)('has no axe violations: %s', async (_name, props) => {
    const wrapper = mountWith(ProductCard, { props });
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

/**
 * The card owns no refresh presentation of its own: `revalidating` reaches the two parts whose
 * values a prerendered page refreshes after load — the price and the stock line — and each draws
 * the state itself (dimmed value, spinner, `aria-busy`, live region).
 */
describe('ProductCard — revalidating', () => {
  const REFRESHABLE: ProductCardProduct = { ...PRODUCT, stock: 'low' };

  it('forwards the state to the price and the stock line', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: REFRESHABLE, revalidating: true },
    });
    const price = wrapper.get('[data-part="price"] [data-part="root"]');
    const stock = wrapper.get('[data-part="stockLine"] [data-part="root"]');
    expect(price.attributes('aria-busy')).toBe('true');
    expect(stock.attributes('aria-busy')).toBe('true');
    expect(wrapper.findAll('[data-part="spinner"]').length).toBe(2);
    wrapper.unmount();
  });

  it('keeps the price and stock text exactly as they render without it', () => {
    const plain = mountWith(ProductCard, { props: { product: REFRESHABLE } });
    const busy = mountWith(ProductCard, { props: { product: REFRESHABLE, revalidating: true } });
    const textOf = (wrapper: { element: Element }, part: string): string => {
      const clone = wrapper.element.querySelector(`[data-part="${part}"]`)?.cloneNode(true);
      const element = clone as HTMLElement;
      element.querySelector('[data-part="srStatus"]')?.remove();
      return element.textContent ?? '';
    };
    expect(textOf(busy, 'price')).toBe(textOf(plain, 'price'));
    expect(textOf(busy, 'stockLine')).toBe(textOf(plain, 'stockLine'));
    plain.unmount();
    busy.unmount();
  });

  it('leaves the rest of the card alone', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: REFRESHABLE, revalidating: true },
    });
    expect(wrapper.attributes('aria-busy')).toBeUndefined();
    expect(wrapper.get('[data-part="title"]').text()).toBe(PRODUCT.title);
    expect(wrapper.get('[data-part="quickAdd"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('draws no spinner at all when it is not revalidating', () => {
    const wrapper = mountWith(ProductCard, { props: { product: REFRESHABLE } });
    expect(wrapper.findAll('[data-part="spinner"]').length).toBe(0);
    wrapper.unmount();
  });

  it('lets loading win over revalidating', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: REFRESHABLE, loading: true, revalidating: true },
    });
    expect(wrapper.find('[data-part="skeleton"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-part="spinner"]').length).toBe(0);
    expect(wrapper.find('[data-part="price"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('forwards announce to both parts, so a grid can announce once at page level', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: REFRESHABLE, revalidating: true, announce: false },
    });
    expect(wrapper.findAll('[data-part="srStatus"]').length).toBe(0);
    expect(wrapper.get('[data-part="price"] [data-part="root"]').attributes('aria-busy')).toBe(
      'true'
    );
    expect(wrapper.get('[data-part="stockLine"] [data-part="root"]').attributes('aria-busy')).toBe(
      'true'
    );
    expect(wrapper.findAll('[data-part="spinner"]').length).toBe(2);
    wrapper.unmount();
  });

  it('announces from both parts by default', () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: REFRESHABLE, revalidating: true },
    });
    expect(wrapper.findAll('[data-part="srStatus"]').length).toBe(2);
    wrapper.unmount();
  });

  it('has no axe violations while revalidating', async () => {
    const wrapper = mountWith(ProductCard, {
      props: { product: REFRESHABLE, revalidating: true },
    });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('renders inside a narrow container while revalidating', () => {
    const wrapper = mountNarrow(ProductCard, {
      props: { product: REFRESHABLE, revalidating: true, currency: 'USD', locale: 'en-US' },
    });
    expect(wrapper.get('[data-part="price"]').text()).toContain('$38.40');
    wrapper.unmount();
  });
});
