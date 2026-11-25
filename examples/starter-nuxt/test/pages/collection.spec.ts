// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { axe } from '../support/axe';
import {
  expectPageLandmarks,
  expectSkipLinkLandsAfterTheHeader,
  mountPage,
  mountPageWithSkipLink,
  pageBlockRoots,
  type PageFixture,
} from '../support/mountPage';
import fixture from '../../pages/collection.page.json';

const page = fixture as unknown as PageFixture;

const COLLECTION_TITLE = 'The winter edit';
const ACTIVE_FILTERS_LABEL = 'Active filters';
/** The filter bar's own group label (`grid.filterAndSort`, `i18n/en-US.json`). */
const FILTER_BAR_LABEL = 'Filter and sort';

/** jsdom reports `scrollHeight`/`clientHeight` as `0`/`0` for every element, so `collection-header`'s
 *  clamp never "overflows" on its own — the same limitation that block's own spec works around.
 *  Stubbing both on the element prototype (restored after each test) is what lets a test drive its
 *  Read more disclosure deterministically, which the tab-order assertion below needs present. */
let restoreOverflowStub: (() => void) | null = null;
function stubOverflow(scrollHeight: number, clientHeight: number): void {
  const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
  const clientDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  });
  restoreOverflowStub = () => {
    if (scrollDescriptor)
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollDescriptor);
    else delete (HTMLElement.prototype as Record<string, unknown>).scrollHeight;
    if (clientDescriptor)
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientDescriptor);
    else delete (HTMLElement.prototype as Record<string, unknown>).clientHeight;
  };
}

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) {
    // Read the container before unmounting: the page harness has three root nodes (banner, main,
    // contentinfo), so `wrapper.element` is the mount container — and `@vue/test-utils` reports it
    // as `null` once the component is gone.
    const container = wrapper.element;
    wrapper.unmount();
    container?.remove();
  }
  restoreOverflowStub?.();
  restoreOverflowStub = null;
});

/**
 * `mountPage` does not attach its harness to `document.body` (most page specs never need real
 * focus tracking). The filter bar's group popovers do — each teleports its panel to the body, and
 * `document.activeElement` only reflects reality for a node that is actually in the live document —
 * so this attaches the harness the same way `collection-grid`'s own block spec passes
 * `attachTo: document.body`.
 */
async function mountAttached(): Promise<VueWrapper> {
  const wrapper = await mountPage(page, { attachTo: document.body });
  wrappers.push(wrapper);
  return wrapper;
}

/** The `filter-bar` variant's one row of controls: a chip per group, a pressed chip per on/off
 *  value, then the sort — the same `role="group"` `collection-grid`'s own filter-bar spec keys off. */
function filterBar(gridEl: Element): Element {
  const bar = gridEl.querySelector(`[role="group"][aria-label="${FILTER_BAR_LABEL}"]`);
  if (!bar) throw new Error('No filter bar found in the grid.');
  return bar;
}
/** A group's popover trigger in the bar, by its visible label (a count badge may follow it). */
function barTrigger(gridEl: Element, label: string): HTMLButtonElement {
  const trigger = Array.from(
    filterBar(gridEl).querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')
  ).find((button) => button.textContent?.trim().startsWith(label));
  if (!trigger) throw new Error(`No filter bar chip named "${label}" found.`);
  return trigger;
}
/** The open popover a trigger controls — teleported, so looked up in the document, and only
 *  present while open. */
function popoverOf(trigger: Element): HTMLElement | null {
  return document.getElementById(trigger.getAttribute('aria-controls') ?? '');
}
/** The bar's on/off chip for a value (`aria-pressed`), by its visible label. */
function pressedChip(gridEl: Element, label: string): HTMLButtonElement {
  const chip = Array.from(
    filterBar(gridEl).querySelectorAll<HTMLButtonElement>('button[aria-pressed]')
  ).find((button) => button.textContent?.trim() === label);
  if (!chip) throw new Error(`No on/off chip named "${label}" found.`);
  return chip;
}

/** The popover's open sequence and the panel's live path both settle over a few ticks and a
 *  macrotask (the same flush the block spec's filter-bar tests use). */
async function flush(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** What a browser does when `Enter` activates a focused `<button>`: keydown, then a `detail: 0`
 *  click (jsdom turns neither into the other). */
async function pressEnter(button: HTMLElement): Promise<void> {
  button.focus();
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
  await flush();
}

/** Opens a group's popover from its bar chip and ticks its `index`-th checkbox. */
async function tickInPopover(gridEl: Element, group: string, index: number): Promise<void> {
  const trigger = barTrigger(gridEl, group);
  await pressEnter(trigger);
  const panel = popoverOf(trigger);
  if (!panel) throw new Error(`The "${group}" popover did not open.`);
  panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[index]!.click();
  await flush();
}

describe('collection sample page', () => {
  it('renders the six blocks, in order, on their documented grounds and containers', async () => {
    const wrapper = await mountPage(page);
    // Every block root in document order across the page's three landmark regions: `navigation`
    // renders before `<main id="main">` and `footer` after it (`app/utils/pageStructure.ts`).
    const children = pageBlockRoots(wrapper);
    expect(children).toHaveLength(6);
    const [navEl, breadcrumbsEl, headerEl, gridEl, ctaEl, footerEl] = children;

    expect(navEl!.tagName).toBe('HEADER');
    expect(navEl!.querySelector('[data-eldra-header-focus]')).not.toBeNull();
    expect(breadcrumbsEl!.tagName).toBe('DIV');
    expect(breadcrumbsEl!.querySelector('nav[aria-label]')).not.toBeNull();
    expect(headerEl!.tagName).toBe('HEADER');
    expect(headerEl!.querySelector('h1')).not.toBeNull();
    expect(gridEl!.tagName).toBe('SECTION');
    expect(ctaEl!.tagName).toBe('SECTION');
    expect(footerEl!.tagName).toBe('FOOTER');

    // The ground each block sits on (Section's `data-section-bg`), in order. The header and the
    // breadcrumbs are not Sections, so they carry no ground at all and never take part in the
    // adjacent-section padding collapse.
    const grounds = children.map((el) => el.getAttribute('data-section-bg'));
    expect(grounds).toEqual([null, null, 'none', 'none', 'surface', 'primary']);

    // The grid starts directly under the collection header with its own short 1.5rem top padding
    // (`pt-6`, hand-rolled rather than read from `Section`'s `spacing` prop — see the block's own
    // top-of-file comment), and the call to action keeps a full band of padding on its `surface`
    // ground (`Section`'s own `eldra:pt-[var(--eldra-section-md)]`), so this is what proves the
    // page actually renders those values.
    expect(gridEl!.classList.contains('pt-6')).toBe(true);
    expect(ctaEl!.classList.contains('eldra:pt-[var(--eldra-section-md)]')).toBe(true);
  });

  it('has exactly one h1 (the collection title) and one breadcrumb nav on the page', async () => {
    const wrapper = await mountPage(page);
    wrapper.get('main#main'); // throws when the landmark is missing

    const h1s = wrapper.findAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.text()).toBe(COLLECTION_TITLE);

    // `showBreadcrumb: false` on the collection-header block: its own breadcrumb never renders, so
    // the standalone Breadcrumbs block's own trail is the only one on the page.
    const crumbs = wrapper.findAll('nav[aria-label="Breadcrumb"]');
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]!.text()).toContain('Shop');
    expect(crumbs[0]!.text()).toContain(COLLECTION_TITLE);

    const headerEl = pageBlockRoots(wrapper)[2]!;
    expect(headerEl.querySelector('nav[aria-label="Breadcrumb"]')).toBeNull();
  });

  it("names the grid section, and keeps the header's own count non-live while the grid's is a polite status", async () => {
    const wrapper = await mountPage(page);
    const [, , headerEl, gridEl] = pageBlockRoots(wrapper);

    expect(gridEl!.getAttribute('aria-label')).toBe('The winter edit products');

    // The collection header's own "N products" line is a plain `<p>` — never announced live.
    const headerCount = Array.from(headerEl!.querySelectorAll('p')).find((p) =>
      p.textContent?.includes('products')
    );
    expect(headerCount).toBeDefined();
    expect(headerCount!.textContent).toContain('48 products');
    expect(headerCount!.hasAttribute('aria-live')).toBe(false);

    // The grid's own count is the block's polite status line — a `<p>` with `tabindex="-1"`, which
    // is what tells it apart from a searchable list facet's own `role="status"` "No matches" line
    // in a filter panel (also persistent, with no `aria-live` of its own — a native `role="status"`
    // needs none).
    const gridCount = gridEl!.querySelector('p[role="status"][tabindex="-1"]');
    expect(gridCount).not.toBeNull();
    expect(gridCount!.getAttribute('aria-live')).toBe('polite');
    expect(gridCount!.textContent).toContain('48 products');
  });

  /**
   * The `filter-bar` variant replaces the sidebar *and* the drawer: there is no Filter button and no
   * `<dialog>` drawer at any width — the bar's row wraps on a phone (`flex-wrap`), and the block
   * renders its drawer only when `!isBar` — so the drawer's old dialog contract has no subject on
   * this page. What it guarded still does: a filter control that opens a dialog-like surface names
   * it (`aria-haspopup`/`aria-expanded`/`aria-controls`), applies on the shopper's action, and Esc
   * returns focus to the control that opened it. Unlike the drawer, a bar popover applies **live**
   * (the sidebar's own path), so there is no pending "Show N products" step to defer to.
   */
  it('offers its filters in a bar with no drawer; a group chip opens a dialog popover, applies live, and Esc returns focus to the chip', async () => {
    const wrapper = await mountAttached();
    const gridEl = pageBlockRoots(wrapper)[3]!;

    // No sidebar, no Filter button, no drawer — the bar is the only filter path, at every width.
    expect(gridEl.querySelector('aside')).toBeNull();
    expect(gridEl.querySelector('dialog')).toBeNull();
    expect(
      Array.from(gridEl.querySelectorAll('button')).some(
        (button) => button.textContent?.trim() === 'Filter'
      )
    ).toBe(false);
    // A chip per group (on/off Availability is a pressed chip of its own, not a popover).
    expect(
      Array.from(filterBar(gridEl).querySelectorAll('button[aria-haspopup="dialog"]')).map(
        (button) => button.textContent?.trim()
      )
    ).toEqual(['Category', 'Size', 'Colour', 'Price']);

    const colour = barTrigger(gridEl, 'Colour');
    expect(colour.getAttribute('aria-expanded')).toBe('false');
    await pressEnter(colour);
    expect(colour.getAttribute('aria-expanded')).toBe('true');
    const panel = popoverOf(colour)!;
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('Colour');
    expect(await axe(panel)).toHaveNoViolations();

    // Oat — the demo catalogue's first colour value — applies at once: its tag appears under the
    // bar and the chip counts it, with nothing left to confirm.
    const oat = panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0]!;
    oat.focus();
    oat.click();
    await flush();
    const tags = gridEl.querySelector(`ul[aria-label="${ACTIVE_FILTERS_LABEL}"]`)!;
    expect(tags).not.toBeNull();
    expect(tags.textContent).toContain('Oat');
    expect(tags.querySelector('[data-part="removeButton"]')!.getAttribute('aria-label')).toBe(
      'Remove filter Colour: Oat'
    );
    expect(barTrigger(gridEl, 'Colour').textContent).toContain('1');

    oat.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );
    await flush();
    expect(popoverOf(colour)).toBeNull();
    expect(colour.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(colour);
  });

  it('live-applies exactly the three tags Size: M, Colour: Oat and Availability: In stock, in that order, from the filter bar', async () => {
    const wrapper = await mountAttached();
    const gridEl = pageBlockRoots(wrapper)[3]!;

    // Each change is flushed before the next: the popover's panel is a *controlled* component (its
    // `modelValue` is the grid's selection, round-tripped through a render), so a second change
    // read back through a prop that has not re-rendered yet would overwrite the first rather than
    // add to it.
    // XS, S, M, L, XL — M is the third box in the Size popover.
    await tickInPopover(gridEl, 'Size', 2);
    // Oat is the demo catalogue's first colour value.
    await tickInPopover(gridEl, 'Colour', 0);
    // Availability is an on/off facet: a pressed chip in the bar itself, not a popover.
    const inStock = pressedChip(gridEl, 'In stock only');
    expect(inStock.getAttribute('aria-pressed')).toBe('false');
    inStock.click();
    await flush();
    expect(inStock.getAttribute('aria-pressed')).toBe('true');

    const chips = wrapper
      .get('main#main')
      .get(`ul[aria-label="${ACTIVE_FILTERS_LABEL}"]`)
      .findAll('li');
    expect(chips).toHaveLength(3);
    // The visible tag text is just the value's own label; the facet rides in each remove button's
    // own aria-label.
    expect(chips[0]!.text()).toContain('M');
    expect(chips[0]!.get('[data-part="removeButton"]').attributes('aria-label')).toBe(
      'Remove filter Size: M'
    );
    expect(chips[1]!.text()).toContain('Oat');
    expect(chips[1]!.get('[data-part="removeButton"]').attributes('aria-label')).toBe(
      'Remove filter Colour: Oat'
    );
    expect(chips[2]!.text()).toContain('In stock only');
    expect(chips[2]!.get('[data-part="removeButton"]').attributes('aria-label')).toBe(
      'Remove filter Availability: In stock only'
    );
    // The group chips count what each applied.
    expect(barTrigger(gridEl, 'Size').textContent).toContain('1');
    expect(barTrigger(gridEl, 'Colour').textContent).toContain('1');
    expect(
      Array.from(gridEl.querySelectorAll('button')).some(
        (button) => button.textContent?.trim() === 'Clear all'
      )
    ).toBe(true);

    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  /**
   * In `filter-bar` the controls come first — the group chips, the on/off chips, the sort — and the
   * applied tags and Clear all sit *under* the bar beside the count, before the cards. So a tag for
   * an already-applied filter follows every bar control, including the one that produced it (the
   * sidebar put its applied chips at the head of the panel instead).
   */
  it('follows the tab order header → breadcrumbs → Read more → filter bar → applied tags → Clear all → cards → Load more → call to action → footer', async () => {
    stubOverflow(200, 100);
    const wrapper = await mountAttached();
    const [navEl, breadcrumbsEl, headerEl, gridEl, ctaEl, footerEl] = pageBlockRoots(wrapper);

    // Availability → In stock rather than Size → M: the demo source honours `filters`
    // (`app/storefront/demo.ts`), and 44 of this collection's 48 items are in stock, so the grid
    // still has more than one page and a real Load more button in the tab order — Size → M leaves
    // 12, i.e. everything already shown, and no Load more at all.
    const inStock = pressedChip(gridEl!, 'In stock only');
    inStock.click();
    // A filter change starts a new (demo-async) `collectionProducts` request — the grid shows
    // skeletons (an `aria-hidden` list) until it resolves, so this waits for the real card list.
    await flush();
    await flushPromises();

    const readMore = Array.from(headerEl!.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Read more'
    )!;
    expect(readMore).toBeDefined();

    const firstGroupChip = barTrigger(gridEl!, 'Category');
    const lastGroupChip = barTrigger(gridEl!, 'Price');
    const sort = filterBar(gridEl!).querySelector('[role="combobox"]')!;
    const tagRemove = gridEl!
      .querySelector(`ul[aria-label="${ACTIVE_FILTERS_LABEL}"]`)!
      .querySelector('[data-part="removeButton"]')!;
    const clearAll = Array.from(gridEl!.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Clear all'
    )!;
    const firstCardLink = gridEl!.querySelector(
      'ul[aria-labelledby]:not([aria-hidden]) li a[href]'
    )!;
    const loadMoreButton = gridEl!.querySelector('[data-part="button"]')!;
    const ctaButton = Array.from(ctaEl!.querySelectorAll('a, button')).find(
      (el) => el.textContent?.trim() === 'Send a gift card'
    )!;
    const footerFirstLink = footerEl!.querySelector('a[href]')!;

    // Whole page, not just `<main>`: the header block is a sibling of it, and its own controls are
    // the first stop in the page's tab order.
    const focusable = Array.from(
      wrapper.element.querySelectorAll<HTMLElement>('a[href], button, input, [tabindex]')
    ).filter((el) => el.getAttribute('tabindex') !== '-1' && el.closest('dialog') === null);
    const indexOf = (el: Element | null) => focusable.indexOf(el as HTMLElement);

    const navFirst = navEl!.querySelector('a[href], button')!;
    const breadcrumbShopLink = Array.from(breadcrumbsEl!.querySelectorAll('a[href]')).find(
      (a) => a.textContent?.trim() === 'Shop'
    )!;

    expect(indexOf(navFirst)).toBeGreaterThanOrEqual(0);
    expect(indexOf(navFirst)).toBeLessThan(indexOf(breadcrumbShopLink));
    expect(indexOf(breadcrumbShopLink)).toBeLessThan(indexOf(readMore));
    expect(indexOf(readMore)).toBeLessThan(indexOf(firstGroupChip));
    expect(indexOf(firstGroupChip)).toBeLessThan(indexOf(lastGroupChip));
    expect(indexOf(lastGroupChip)).toBeLessThan(indexOf(inStock));
    expect(indexOf(inStock)).toBeLessThan(indexOf(sort));
    expect(indexOf(sort)).toBeLessThan(indexOf(tagRemove));
    expect(indexOf(tagRemove)).toBeLessThan(indexOf(clearAll));
    expect(indexOf(clearAll)).toBeLessThan(indexOf(firstCardLink));
    expect(indexOf(firstCardLink)).toBeLessThan(indexOf(loadMoreButton));
    expect(indexOf(loadMoreButton)).toBeLessThan(indexOf(ctaButton));
    expect(indexOf(ctaButton)).toBeLessThan(indexOf(footerFirstLink));
  });

  it('keeps exactly one promotion between the grid and the footer', async () => {
    const wrapper = await mountPage(page);
    const children = pageBlockRoots(wrapper);
    const between = children.slice(4, children.length - 1);
    expect(between).toHaveLength(1);

    const cta = between[0]!;
    expect(cta.querySelector('h2')?.textContent).toBe('Not sure what to give?');
    const button = Array.from(cta.querySelectorAll('a, button')).find(
      (el) => el.textContent?.trim() === 'Send a gift card'
    );
    expect(button).toBeDefined();
  });

  it('exposes exactly one banner, one main and one contentinfo landmark', async () => {
    // Two `<header>` elements render on this page — `navigation`'s and `collection-header`'s — but
    // only the first is a `banner`: the route renders it before `<main id="main">`, while
    // `collection-header`'s sits inside `<main>` and so carries no landmark role at all
    // (`app/utils/pageStructure.ts`).
    const wrapper = await mountPage(page);
    expectPageLandmarks(wrapper);
  });

  it('puts the skip link first, landing the visitor after the header', async () => {
    const wrapper = await mountPageWithSkipLink(page);
    expectSkipLinkLandsAfterTheHeader(wrapper);
    wrapper.unmount();
  });

  it('has no axe violations over the whole rendered page', async () => {
    const wrapper = await mountPage(page);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
