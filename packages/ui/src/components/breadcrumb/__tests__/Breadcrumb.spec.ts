import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Breadcrumb from '../Breadcrumb.vue';
import type { BreadcrumbItem } from '../types';

/** The spec's own product trail (spec "Breadcrumb" → the section's own screenshot). */
const PRODUCT_TRAIL: BreadcrumbItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Knitwear', href: '/knitwear' },
  { label: 'Sweaters', href: '/knitwear/sweaters' },
  { label: 'Merino crew sweater' },
];

/** Six levels, three hidden behind the ellipsis at the default `collapseAfter`/`keepLast` — the
 *  same count the spec's own example gives verbatim ("Show 3 more levels"). */
const CERAMICS_TRAIL: BreadcrumbItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Ceramics', href: '/ceramics' },
  { label: 'Tableware', href: '/ceramics/tableware' },
  { label: 'Serving', href: '/ceramics/tableware/serving' },
  { label: 'Bowls', href: '/ceramics/tableware/serving/bowls' },
  { label: 'Hand-thrown serving bowl, large' },
];

/** Twice the length of the spec's own example titles. */
const LONG_TITLE =
  'Extra-large hand-thrown stoneware serving bowl with a reactive ash glaze and a natural edge';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Breadcrumb — landmark and current page', () => {
  it('is a nav landmark named "Breadcrumb" wrapping an ordered list', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: PRODUCT_TRAIL } });
    expect(wrapper.element.tagName).toBe('NAV');
    expect(wrapper.attributes('aria-label')).toBe('Breadcrumb');
    expect(wrapper.attributes('data-part')).toBe('root');
    expect(wrapper.get('[data-part="list"]').element.tagName).toBe('OL');
    wrapper.unmount();
  });

  it('renders the last item as a non-link current page, and every other item as a link', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: PRODUCT_TRAIL } });
    const current = wrapper.get('[data-part="current"]');
    expect(current.element.tagName).toBe('SPAN');
    expect(current.attributes('aria-current')).toBe('page');
    expect(current.text()).toBe('Merino crew sweater');

    const links = wrapper.findAll('[data-part="link"]');
    expect(links).toHaveLength(3);
    expect(links.map((link) => link.text())).toEqual(['Home', 'Knitwear', 'Sweaters']);
    for (const link of links) {
      expect(link.element.tagName).toBe('A');
    }
    wrapper.unmount();
  });

  it('renders the last item as current even if it is given an href', () => {
    const wrapper = mountWith(Breadcrumb, {
      props: {
        items: [
          { label: 'Home', href: '/' },
          { label: 'Current page', href: '/should-be-ignored' },
        ],
      },
    });
    const current = wrapper.get('[data-part="current"]');
    expect(current.attributes('aria-current')).toBe('page');
    expect(wrapper.findAll('[data-part="link"]')).toHaveLength(1);
    wrapper.unmount();
  });

  it('renders a non-last item with no href as plain text, not a link', () => {
    const wrapper = mountWith(Breadcrumb, {
      props: {
        // `keepLast: 3` keeps every non-"Home" item visible and uncollapsed, so "Unlinked level"
        // renders through `endItems`, not hidden behind the ellipsis.
        keepLast: 3,
        items: [
          { label: 'Home', href: '/' },
          { label: 'Unlinked level' },
          { label: 'Parent', href: '/parent' },
          { label: 'Current page' },
        ],
      },
    });
    const unlinked = wrapper.findAll('li').find((li) => li.text().includes('Unlinked level'))!;
    expect(unlinked.find('[data-part="current"]').exists()).toBe(false);
    // Same `data-part="link"` a real anchor gets (`Link.vue`'s own href-less convention: the part
    // name tracks the role, not the tag), but a `<span>`, not an `<a>`, and no `href`.
    const part = unlinked.get('[data-part="link"]');
    expect(part.element.tagName).toBe('SPAN');
    expect(part.attributes('href')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('Breadcrumb — link underline', () => {
  it('underlines every trail link at rest, not only on hover (operator ruling: all links underlined)', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: PRODUCT_TRAIL } });
    const links = wrapper.findAll('[data-part="link"]');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.classes()).toContain('underline');
      expect(link.classes()).not.toContain('no-underline');
    }
    wrapper.unmount();
  });

  it('leaves the current page as plain text with no underline utility at all', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: PRODUCT_TRAIL } });
    const current = wrapper.get('[data-part="current"]');
    expect(current.classes()).not.toContain('underline');
    wrapper.unmount();
  });
});

describe('Breadcrumb — separator geometry', () => {
  /** A short, three-level trail with nothing to collapse (`items.length` is not greater than
   *  `collapseAfter + keepLast`, so `hasMiddle` is `false` and every level renders through
   *  `endItems` — see `Breadcrumb.vue`'s own `hasMiddle` comment): exactly two separators, one
   *  before the "Category" link and one before the current page. */
  const SHORT_TRAIL: BreadcrumbItem[] = [
    { label: 'Home', href: '/' },
    { label: 'Category', href: '/category' },
    { label: 'Current page' },
  ];

  /** Review t14 (round 2): the two separators used to carry different class recipes — `self-center`
   *  before a link/the ellipsis, a hand-tuned `mt-1.875` before the current page — centred against
   *  two different reference boxes (24px vs. 21px), which is exactly what left them visibly
   *  misaligned in the required baselines. This asserts the fix at the level the review asked for:
   *  every separator in the trail carries the *identical* class recipe, with no per-position branch
   *  to drift apart again — not merely "which one Tailwind class name is present", which the
   *  previous round's tests already passed while the pixels were still wrong. */
  it('gives every separator in the trail the identical class recipe — no per-position branch', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: SHORT_TRAIL } });
    const separators = wrapper.findAll('[data-part="separator"]');
    expect(separators).toHaveLength(2);
    const [beforeLink, beforeCurrent] = separators;
    expect([...beforeLink!.classes()].sort()).toEqual([...beforeCurrent!.classes()].sort());
    wrapper.unmount();
  });

  /** `separatorClass`'s own comment in `Breadcrumb.vue`: every separator is a fixed `h-6` (24px —
   *  the same `target-min` height `linkClass`/`ellipsisClass` give their own sibling) flex frame,
   *  pinned to the `<li>`'s top edge, with the chevron centred inside that frame — not the old
   *  `self-center`/`mt-1.875` pair. */
  it('sizes every separator as a 24px (h-6) top-pinned frame around the chevron', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: SHORT_TRAIL } });
    const separators = wrapper.findAll('[data-part="separator"]');
    for (const separator of separators) {
      const classes = separator.classes();
      expect(classes).toContain('h-6');
      expect(classes).toContain('items-center');
      expect(classes).toContain('self-start');
      expect(classes).not.toContain('mt-1.875');
      expect(classes).not.toContain('self-center');
    }
    wrapper.unmount();
  });

  /** `currentClass`'s own comment: the current-page `<span>` now carries the same `target-min`
   *  frame the trail's links use, which is what lets one separator recipe stay correct against
   *  either kind of sibling. */
  it('gives the current-page span the same target-min frame the trail links carry', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: SHORT_TRAIL } });
    const current = wrapper.get('[data-part="current"]');
    const link = wrapper.get('[data-part="link"]');
    expect(current.classes()).toContain('target-min');
    expect(current.classes()).toContain('items-center');
    expect(link.classes()).toContain('target-min');
    wrapper.unmount();
  });

  /** `LongTitles`-shaped: the current page wraps onto several lines inside a narrow host. The
   *  separator before it keeps the exact same class recipe as every other separator in the trail —
   *  no branch reappears just because this one sibling can wrap — which is what pins its 24px frame
   *  to the `<li>`'s top edge instead of the fixed frame floating down to centre against the whole
   *  wrapped block. */
  it('keeps the identical separator recipe before a current-page title long enough to wrap', () => {
    const wrapper = mountNarrow(Breadcrumb, {
      props: {
        items: [
          { label: 'Home', href: '/' },
          { label: 'Category', href: '/category' },
          { label: LONG_TITLE },
        ],
      },
    });
    const separators = wrapper.findAll('[data-part="separator"]');
    expect(separators.length).toBeGreaterThan(1);
    const [beforeLink] = separators;
    const beforeCurrent = separators[separators.length - 1]!;
    expect([...beforeLink!.classes()].sort()).toEqual([...beforeCurrent.classes()].sort());
    expect(beforeCurrent.classes()).toContain('h-6');
    expect(beforeCurrent.classes()).toContain('self-start');
    wrapper.unmount();
  });

  /** Operator report (2026-09-26): "Breadcrumb arrow icons are way, way too small" — the chevron
   *  `<svg>` grows from the spec's own `size-1.5` (0.375rem) to `size-4` (1rem), still centred
   *  inside the same fixed 24px (`h-6`) separator frame the previous test above already proves. */
  it("sizes the chevron svg at size-4 (1rem), overriding the spec's 0.375rem", () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: SHORT_TRAIL } });
    const separators = wrapper.findAll('[data-part="separator"]');
    expect(separators.length).toBeGreaterThan(0);
    for (const separator of separators) {
      const svg = separator.find('svg');
      expect(svg.exists()).toBe(true);
      expect(svg.classes()).toContain('size-4');
      expect(svg.classes()).not.toContain('size-1.5');
    }
    wrapper.unmount();
  });
});

describe('Breadcrumb — collapse rule', () => {
  it('collapses the middle levels behind an ellipsis named with the hidden count', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: CERAMICS_TRAIL } });
    const items = wrapper.findAll('li');
    // Home, ellipsis, Ceramics, Tableware, Serving, Bowls, current — 7 <li>s.
    expect(items).toHaveLength(7);

    const ellipsis = wrapper.get('[data-part="ellipsis"]');
    expect(ellipsis.element.tagName).toBe('BUTTON');
    expect(ellipsis.attributes('type')).toBe('button');
    expect(ellipsis.attributes('aria-label')).toBe('Show 3 more levels');

    // The three collapsed levels (Ceramics, Tableware, Serving) carry the container-query class
    // that hides them below the 48rem threshold; Home, the ellipsis's own `<li>`, Bowls and the
    // current page never do.
    const hiddenLabels = ['Ceramics', 'Tableware', 'Serving'];
    for (const li of items) {
      const text = li.text();
      const isHiddenLevel = hiddenLabels.some((label) => text.includes(label));
      expect(li.classes().includes('@max-tablet:hidden')).toBe(isHiddenLevel);
    }
    wrapper.unmount();
  });

  it('never shows an ellipsis for a trail with nothing to collapse', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: PRODUCT_TRAIL.slice(0, 3) } });
    expect(wrapper.find('[data-part="ellipsis"]').exists()).toBe(false);
    for (const li of wrapper.findAll('li')) {
      expect(li.classes()).not.toContain('@max-tablet:hidden');
    }
    wrapper.unmount();
  });

  it('honours custom collapseAfter/keepLast counts', () => {
    const wrapper = mountWith(Breadcrumb, {
      props: { items: CERAMICS_TRAIL, collapseAfter: 2, keepLast: 1 },
    });
    // Home, Ceramics kept at the start; only the final current page kept at the end; the three
    // in between (Tableware, Serving, Bowls) collapse — one level more than the default
    // `collapseAfter`/`keepLast` would have hidden for this same six-level trail.
    expect(wrapper.get('[data-part="ellipsis"]').attributes('aria-label')).toBe(
      'Show 3 more levels'
    );
    const hiddenLinks = wrapper
      .findAll('[data-part="link"]')
      .filter((link) => link.element.closest('li')?.classList.contains('@max-tablet:hidden'));
    expect(hiddenLinks.map((link) => link.text())).toEqual(['Tableware', 'Serving', 'Bowls']);
    wrapper.unmount();
  });

  it('singularises the ellipsis label for exactly one hidden level', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: PRODUCT_TRAIL } });
    expect(wrapper.get('[data-part="ellipsis"]').attributes('aria-label')).toBe(
      'Show 1 more level'
    );
    wrapper.unmount();
  });
});

/**
 * Fix round 1 (review of `ebeec99`, Major finding): `keepLast: 0` reached a bare
 * `props.items.slice(-props.keepLast)`, and `slice(-0)` is specified to behave as `slice(0)` — the
 * whole array — not an empty one, because `-0` is not `< 0`. The current page leaked into
 * `middleItems` as a demoted, non-current item and `endItems` duplicated the entire trail on top
 * of it, so every label rendered twice and the true current page briefly lost its `aria-current`.
 * Fixed by clamping `keepLast` up to a minimum of `1` (`effectiveKeepLast` in `Breadcrumb.vue`) —
 * every case below asserts each label renders exactly once, in order, and `aria-current="page"`
 * sits on the last one only, for the three boundary values the review named plus the review's own
 * "no collapse" cases (`collapseAfter + keepLast >= items.length`, `keepLast > items.length`).
 */
describe('Breadcrumb — collapse boundary values', () => {
  /** Every level's own `[data-part="link"]`/`[data-part="current"]` text, in DOM order — the
   *  general "no duplicates, right labels, right order" probe every case below reuses. */
  function renderedLabels(wrapper: VueWrapper): string[] {
    return wrapper.findAll('[data-part="link"], [data-part="current"]').map((el) => el.text());
  }

  it('keepLast: 0 renders every label exactly once and keeps aria-current on the true last item', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: CERAMICS_TRAIL, keepLast: 0 } });

    // `effectiveKeepLast` clamps 0 up to 1, so the current page alone survives in `endItems` and
    // the other four levels (Ceramics, Tableware, Serving, Bowls) collapse — one level more
    // than the `collapseAfter: 1, keepLast: 1` case would, since nothing is reserved for a
    // separate "parent" slot.
    expect(renderedLabels(wrapper)).toEqual(CERAMICS_TRAIL.map((item) => item.label));

    const currents = wrapper.findAll('[data-part="current"]');
    expect(currents).toHaveLength(1);
    expect(currents[0]!.attributes('aria-current')).toBe('page');
    expect(currents[0]!.text()).toBe('Hand-thrown serving bowl, large');

    expect(wrapper.get('[data-part="ellipsis"]').attributes('aria-label')).toBe(
      'Show 4 more levels'
    );
    wrapper.unmount();
  });

  it('keepLast: 0 keeps hasMiddle in lock step with middleItems, so no stale ellipsis shows', () => {
    // A two-item trail with the default `collapseAfter: 1`: `effectiveKeepLast` clamps `0` up to
    // `1`, so `items.length (2) > collapseAfter (1) + effectiveKeepLast (1)` is false — nothing to
    // collapse. Read `hasMiddle` off the *raw* `keepLast: 0` instead (as the pre-fix code did) and
    // it computes `2 > 1 + 0`, true — an ellipsis for a `middleItems` that (reading the clamped
    // value, same as this fix) is actually empty. Both computations reading the same clamped value
    // is what keeps this trail collapse-free instead of showing a stale, empty ellipsis.
    const wrapper = mountWith(Breadcrumb, {
      props: {
        keepLast: 0,
        items: [{ label: 'Home', href: '/' }, { label: 'Current page' }],
      },
    });
    expect(wrapper.find('[data-part="ellipsis"]').exists()).toBe(false);
    expect(renderedLabels(wrapper)).toEqual(['Home', 'Current page']);
    expect(wrapper.get('[data-part="current"]').attributes('aria-current')).toBe('page');
    wrapper.unmount();
  });

  it('collapseAfter: 0 keeps no levels at the start, renders every label once', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: CERAMICS_TRAIL, collapseAfter: 0 } });

    // Nothing is reserved for "Home" specifically, so it collapses along with Ceramics, Tableware
    // and Serving (default `keepLast: 2` still keeps Bowls and the current page visible) — the
    // ellipsis itself is the trail's first rendered element.
    expect(renderedLabels(wrapper)).toEqual(CERAMICS_TRAIL.map((item) => item.label));
    const currents = wrapper.findAll('[data-part="current"]');
    expect(currents).toHaveLength(1);
    expect(currents[0]!.attributes('aria-current')).toBe('page');
    expect(wrapper.get('[data-part="ellipsis"]').attributes('aria-label')).toBe(
      'Show 4 more levels'
    );
    wrapper.unmount();
  });

  it('collapseAfter + keepLast >= items.length never collapses, renders every label once', () => {
    const wrapper = mountWith(Breadcrumb, {
      // 3 items, collapseAfter (1, default) + keepLast (2, default) = 3 = items.length.
      props: { items: CERAMICS_TRAIL.slice(0, 3) },
    });
    expect(wrapper.find('[data-part="ellipsis"]').exists()).toBe(false);
    expect(renderedLabels(wrapper)).toEqual(['Home', 'Ceramics', 'Tableware']);
    const currents = wrapper.findAll('[data-part="current"]');
    expect(currents).toHaveLength(1);
    expect(currents[0]!.attributes('aria-current')).toBe('page');
    expect(currents[0]!.text()).toBe('Tableware');
    wrapper.unmount();
  });

  it('keepLast > items.length never collapses, renders every label once', () => {
    const wrapper = mountWith(Breadcrumb, {
      props: { items: CERAMICS_TRAIL.slice(0, 3), keepLast: 10 },
    });
    expect(wrapper.find('[data-part="ellipsis"]').exists()).toBe(false);
    expect(renderedLabels(wrapper)).toEqual(['Home', 'Ceramics', 'Tableware']);
    const currents = wrapper.findAll('[data-part="current"]');
    expect(currents).toHaveLength(1);
    expect(currents[0]!.attributes('aria-current')).toBe('page');
    wrapper.unmount();
  });
});

describe('Breadcrumb — expand', () => {
  it('reveals every level, removes the ellipsis for good, and moves focus to the first revealed link', async () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: CERAMICS_TRAIL } });
    const ellipsis = wrapper.get('[data-part="ellipsis"]');

    await ellipsis.trigger('click');
    await nextTick();
    await nextTick();

    expect(wrapper.find('[data-part="ellipsis"]').exists()).toBe(false);
    for (const li of wrapper.findAll('li')) {
      expect(li.classes()).not.toContain('@max-tablet:hidden');
    }

    const links = wrapper.findAll('[data-part="link"]');
    expect(links.map((link) => link.text())).toEqual([
      'Home',
      'Ceramics',
      'Tableware',
      'Serving',
      'Bowls',
    ]);

    const firstRevealed = links[1]!; // Ceramics — the first item middleItems reveals.
    expect(document.activeElement).toBe(firstRevealed.element);
  });

  it('stays expanded even if resized narrow again — there is no way back to collapsed', async () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: CERAMICS_TRAIL } });
    await wrapper.get('[data-part="ellipsis"]').trigger('click');
    await nextTick();
    await nextTick();
    // Nothing in this component measures width with JavaScript, so "resizing" is simulated by
    // asserting the collapse class never comes back once `expanded` flips — there is no code path
    // that could reintroduce it.
    expect(wrapper.html()).not.toContain('@max-tablet:hidden');
  });
});

describe('Breadcrumb — no truncation', () => {
  it('renders a long current-page title in full, with no truncation class', () => {
    const wrapper = mountWith(Breadcrumb, {
      props: {
        items: [
          { label: 'Home', href: '/' },
          { label: 'Ceramics', href: '/ceramics' },
          { label: LONG_TITLE },
        ],
      },
    });
    const current = wrapper.get('[data-part="current"]');
    expect(current.text()).toBe(LONG_TITLE);
    const classString = current.classes().join(' ');
    expect(classString).not.toMatch(/truncate|line-clamp|text-ellipsis/);
    expect(current.attributes('title')).toBeUndefined();
    wrapper.unmount();
  });

  it('renders a long link label in full, with no truncation class', () => {
    const wrapper = mountWith(Breadcrumb, {
      props: {
        items: [
          { label: 'Home', href: '/' },
          { label: LONG_TITLE, href: '/x' },
          { label: 'Current' },
        ],
      },
    });
    const link = wrapper.findAll('[data-part="link"]').find((l) => l.text() === LONG_TITLE)!;
    expect(link).toBeTruthy();
    expect(link.classes().join(' ')).not.toMatch(
      /truncate|line-clamp|text-ellipsis|whitespace-nowrap/
    );
    wrapper.unmount();
  });
});

describe('Breadcrumb — linkAs prop', () => {
  const FakeNuxtLink = defineComponent({
    props: { to: { type: String, required: true } },
    setup:
      (props, { slots }) =>
      () =>
        h('a', { 'data-fake-nuxt-link': props.to }, slots.default?.()),
  });

  it('routes every level link through a component linkAs, passing href as to', () => {
    const wrapper = mountWith(Breadcrumb, {
      props: { items: PRODUCT_TRAIL, linkAs: FakeNuxtLink },
    });
    const links = wrapper.findAll('[data-fake-nuxt-link]');
    expect(links).toHaveLength(3);
    expect(links[0]!.attributes('data-fake-nuxt-link')).toBe('/');
    expect(links[0]!.attributes('href')).toBeUndefined();
    wrapper.unmount();
  });

  it('never routes the current page through linkAs, even when it is a component', () => {
    const wrapper = mountWith(Breadcrumb, {
      props: { items: PRODUCT_TRAIL, linkAs: FakeNuxtLink },
    });
    // Three routed links (Home, Knitwear, Sweaters) — the fourth, current item never becomes one.
    expect(wrapper.findAll('[data-fake-nuxt-link]')).toHaveLength(3);
    const current = wrapper.get('[data-part="current"]');
    expect(current.element.tagName).toBe('SPAN');
    expect(current.attributes('data-fake-nuxt-link')).toBeUndefined();
    expect(current.text()).toBe('Merino crew sweater');
    wrapper.unmount();
  });

  it('uses a string linkAs as the tag and still passes href as href', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: PRODUCT_TRAIL, linkAs: 'a' } });
    const links = wrapper.findAll('[data-part="link"]');
    expect(links[0]!.attributes('href')).toBe('/');
    wrapper.unmount();
  });
});

describe('Breadcrumb — structured data', () => {
  it('emits a BreadcrumbList matching the full, uncollapsed items', () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: CERAMICS_TRAIL } });
    const script = wrapper.get('script[type="application/ld+json"]');
    const data = JSON.parse(script.element.textContent ?? '{}') as {
      '@type': string;
      itemListElement: Array<{ position: number; name: string; item?: string }>;
    };
    expect(data['@type']).toBe('BreadcrumbList');
    expect(data.itemListElement).toHaveLength(CERAMICS_TRAIL.length);
    expect(data.itemListElement[0]).toMatchObject({ position: 1, name: 'Home', item: '/' });
    const last = data.itemListElement[data.itemListElement.length - 1]!;
    expect(last.name).toBe('Hand-thrown serving bowl, large');
    expect(last.item).toBeUndefined();
    wrapper.unmount();
  });
});

describe('Breadcrumb — narrow container', () => {
  it('renders inside a narrow container without throwing, wrapping every label intact', () => {
    const wrapper = mountNarrow(Breadcrumb, { props: { items: CERAMICS_TRAIL } });
    expect(wrapper.get('[data-part="current"]').text()).toBe('Hand-thrown serving bowl, large');
    expect(wrapper.find('[data-part="ellipsis"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('Breadcrumb — customisation', () => {
  it('lets classes.link replace a colour utility instead of landing beside it', () => {
    const wrapper = mountWith(Breadcrumb, {
      props: { items: PRODUCT_TRAIL, classes: { link: 'text-accent' } },
    });
    const link = wrapper.get('[data-part="link"]');
    expect(link.classes()).toContain('text-accent');
    expect(link.classes()).not.toContain('text-muted');
    wrapper.unmount();
  });
});

describe('Breadcrumb — accessibility', () => {
  it.each<[string, BreadcrumbItem[]]>([
    ['a short trail', PRODUCT_TRAIL.slice(0, 2)],
    ['a collapsible trail', PRODUCT_TRAIL],
    ['a deep trail', CERAMICS_TRAIL],
  ])('has no axe violations: %s', async (_name, items) => {
    const wrapper = mountWith(Breadcrumb, { props: { items } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations once expanded', async () => {
    const wrapper = mountWith(Breadcrumb, { props: { items: CERAMICS_TRAIL } });
    await wrapper.get('[data-part="ellipsis"]').trigger('click');
    await nextTick();
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
