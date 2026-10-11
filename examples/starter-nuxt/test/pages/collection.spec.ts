// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, type VueWrapper } from '@vue/test-utils';
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
 * focus tracking). The filter drawer's own dialog contract does — `document.activeElement` only
 * reflects reality for a node that is actually in the live document — so this appends the mounted
 * root the same way `collection-grid`'s own block spec passes `attachTo: document.body`.
 */
async function mountAttached(): Promise<VueWrapper> {
  const wrapper = await mountPage(page);
  document.body.appendChild(wrapper.element);
  wrappers.push(wrapper);
  return wrapper;
}

/** The filter-group disclosure triggers — a `<button>` inside an `h3`, the same shape
 *  `collection-grid`'s own spec keys off (nothing else on the page nests a button in an `h3`). */
function groupTriggers(root: Element): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('h3 > button[aria-expanded]'));
}
/** A group's panel, found by its own visually hidden `<legend>` text, scoped to `root` — pass the
 *  sidebar (excluding the drawer) or the open `<dialog>` to pick the right one of the two copies. */
function panelFor(root: Element, legend: string): Element {
  const trigger = groupTriggers(root).find(
    (candidate) =>
      root.querySelector(`#${candidate.getAttribute('aria-controls')}`)?.querySelector('legend')
        ?.textContent === legend
  );
  if (!trigger) throw new Error(`No filter group panel named "${legend}" found.`);
  return root.querySelector(`#${trigger.getAttribute('aria-controls')}`)!;
}

/**
 * jsdom (30.x, this repo's pin) runs a checkbox's native click activation — `checked` flips — but
 * does not follow it with an `input`/`change` event the way a real browser does, so a plain
 * `.click()` never reaches the block's own `@change` handler (Vue Test Utils' own `setValue()`
 * works around exactly this by setting `checked` and dispatching `change` by hand, rather than
 * clicking). This does the same for a raw DOM reference.
 */
function checkBox(input: HTMLInputElement): void {
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
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
    expect(navEl!.querySelector('nav')).not.toBeNull();
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
    expect(grounds).toEqual([null, null, 'none', 'none', 'surface', 'surface-strong']);

    // The grid starts directly under the collection header with its own short 1.5rem top padding
    // (`pt-6`) rather than the shared spacing scale, and the call to action keeps a full band of
    // padding on its `surface` ground (`pt-[var(--eldra-section-md)]`) — both blocks hand-roll
    // their own padding rather than reading `Section`'s `spacing` prop (see each block's own
    // top-of-file comment), so this is what proves the page actually renders those literal values.
    expect(gridEl!.classList.contains('pt-6')).toBe(true);
    expect(ctaEl!.classList.contains('pt-[var(--eldra-section-md)]')).toBe(true);
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
    // in the sidebar (also persistent, with no `aria-live` of its own — a native `role="status"`
    // needs none).
    const gridCount = gridEl!.querySelector('p[role="status"][tabindex="-1"]');
    expect(gridCount).not.toBeNull();
    expect(gridCount!.getAttribute('aria-live')).toBe('polite');
    expect(gridCount!.textContent).toContain('48 products');
  });

  it('opens the filter drawer as a dialog from the Filter button, returns focus on Esc, and applies nothing until "Show 48 products" is pressed', async () => {
    const wrapper = await mountAttached();
    const gridEl = pageBlockRoots(wrapper)[3]!;

    const filterButton = gridEl.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    filterButton.focus();
    filterButton.click();
    // `useDialog` calls the native `showModal()` from a `watch(open, …)` callback, then applies
    // initial focus a tick *after that* (`void nextTick(focusInitial)`) so slot content has time to
    // render first — two ticks, not one, before focus actually lands on the close button.
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const dialog = gridEl.querySelector('dialog')!;
    expect(dialog.getAttribute('open')).toBe('');
    expect(filterButton.getAttribute('aria-expanded')).toBe('true');
    expect(filterButton.getAttribute('aria-controls')).toBe(dialog.id);
    expect(document.activeElement).toBe(dialog.querySelector('[data-part="close"]'));

    // The drawer's own primary button always reads the demo collection's full count.
    const applyButton = Array.from(dialog.querySelectorAll('button')).find((button) =>
      button.textContent?.trim().startsWith('Show ')
    )!;
    expect(applyButton.textContent?.trim()).toBe('Show 48 products');

    // Ticking a box in the drawer's own copy of the groups changes nothing live yet.
    const drawerColour = panelFor(dialog, 'Colour');
    const drawerOatCheckbox =
      drawerColour.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0]!;
    checkBox(drawerOatCheckbox);
    await wrapper.vm.$nextTick();
    // Nothing live has moved — the drawer's own chip row shows its still-pending tick (its own
    // preview of what applying would do), but the sidebar's own applied panel has none.
    const sidebarForChips = Array.from(gridEl.querySelectorAll('aside')).find(
      (el) => el.closest('dialog') === null
    )!;
    expect(sidebarForChips.querySelector(`ul[aria-label="${ACTIVE_FILTERS_LABEL}"]`)).toBeNull();

    applyButton.click();
    await wrapper.vm.$nextTick();

    // The visible chip text is just the value's own label; the facet name rides in its remove
    // button's own aria-label instead. Both panels now agree (the drawer's own pending copy
    // matches the just-applied selection), so the sidebar's own row is found by element rather
    // than by the (now ambiguous) aria-label alone.
    const chipsEl = sidebarForChips.querySelector(`ul[aria-label="${ACTIVE_FILTERS_LABEL}"]`)!;
    expect(chipsEl.textContent).toContain('Oat');
    expect(chipsEl.querySelector('[data-part="removeButton"]')!.getAttribute('aria-label')).toBe(
      'Remove filter Colour: Oat'
    );
    expect(dialog.getAttribute('open')).toBeNull();

    // Reopen, then Esc closes it and returns focus to the Filter button. Waits out the same two
    // ticks as the first open (see above) so the drawer's own initial-focus placement has already
    // landed on the close button before Esc is pressed — otherwise that still-pending focus call
    // fires *after* Esc's own focus-return and steals it back.
    filterButton.click();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(dialog.getAttribute('open')).toBe('');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await new Promise((resolve) => setTimeout(resolve));
    await wrapper.vm.$nextTick();

    expect(dialog.getAttribute('open')).toBeNull();
    expect(document.activeElement).toBe(filterButton);
  });

  it('live-applies exactly the three chips Size: M, Colour: Oat and Availability: In stock, in that order, from the sidebar', async () => {
    const wrapper = await mountPage(page);
    const main = wrapper.get('main#main');
    const gridEl = pageBlockRoots(wrapper)[3]!;
    // The sidebar's own copies of the groups — excluding the drawer's duplicate set, which sits
    // inside a `<dialog>` the same page also renders.
    const sidebar = Array.from(gridEl.querySelectorAll('aside')).find(
      (el) => el.closest('dialog') === null
    )!;

    // Each tick is awaited before the next: the panel is a *controlled* component now (its own
    // `modelValue` prop is the parent's `selection`, round-tripped through a render), so a second
    // change read back through a prop that has not re-rendered yet would overwrite the first
    // rather than add to it — unlike the old uncontrolled `FilterGroups.vue`, which read the
    // parent's own ref directly.
    const sizePanel = panelFor(sidebar, 'Size');
    // XS, S, M, L, XL — M is the third pill.
    checkBox(sizePanel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[2]!);
    await wrapper.vm.$nextTick();
    const colourPanel = panelFor(sidebar, 'Colour');
    // Oat is the demo catalogue's first colour value.
    checkBox(colourPanel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0]!);
    await wrapper.vm.$nextTick();
    // Availability is a `toggle` facet now (a real `<button role="switch">`, not a checkbox).
    const availabilityPanel = panelFor(sidebar, 'Availability');
    const availabilitySwitch =
      availabilityPanel.querySelector<HTMLButtonElement>('[role="switch"]')!;
    availabilitySwitch.click();
    await wrapper.vm.$nextTick();

    const chips = main.get(`ul[aria-label="${ACTIVE_FILTERS_LABEL}"]`).findAll('li');
    expect(chips).toHaveLength(3);
    // The visible chip text is just the value's own label; the facet rides in each remove
    // button's own aria-label.
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
  });

  /**
   * The panel's own head — **Clear all** and the applied chips — comes before its group triggers
   * now (the panel owns applied state), so a chip for an already-ticked filter sits before
   * every facet control in the sidebar, including the one that produced it.
   */
  it('follows the tab order header → breadcrumbs → Read more → sidebar chips → filters → cards → Load more → call to action → footer', async () => {
    stubOverflow(200, 100);
    const wrapper = await mountPage(page);
    const main = wrapper.get('main#main');
    const [navEl, breadcrumbsEl, headerEl, gridEl, ctaEl, footerEl] = pageBlockRoots(wrapper);

    const sidebar = Array.from(gridEl!.querySelectorAll('aside')).find(
      (el) => el.closest('dialog') === null
    )!;
    // Availability → In stock rather than Size → M: the demo source honours `filters` now
    // (`app/storefront/demo.ts`), and 44 of this collection's 48 items are in stock, so the grid
    // still has more than one page and a real Load more button in the tab order — Size → M leaves
    // 12, i.e. everything already shown, and no Load more at all.
    const availabilitySwitch = panelFor(sidebar, 'Availability').querySelector<HTMLButtonElement>(
      '[role="switch"]'
    )!;
    availabilitySwitch.click();
    // Ticking a sidebar filter starts a new (demo-async) `collectionProducts` request — the grid
    // shows skeletons (an `aria-hidden` list) until it resolves, so this waits for the real card
    // list to come back rather than a single `nextTick`.
    await flushPromises();

    const readMore = Array.from(headerEl!.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Read more'
    )!;
    expect(readMore).toBeDefined();

    const chipRemove = main
      .get(`ul[aria-label="${ACTIVE_FILTERS_LABEL}"]`)
      .element.querySelector('[data-part="removeButton"]')!;
    const firstCardLink = gridEl!.querySelector(
      'ul[aria-labelledby]:not([aria-hidden]) li a[href]'
    )!;
    const loadMoreButton = gridEl!.querySelector('[data-part="button"]')!;
    const ctaButton = Array.from(ctaEl!.querySelectorAll('a, button')).find(
      (el) => el.textContent?.trim() === 'Send a gift card'
    )!;
    const footerFirstLink = footerEl!.querySelector('a[href]')!;

    // Whole page, not just `<main>`: the header block is a sibling of it now, and its own controls
    // are the first stop in the page's tab order.
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
    expect(indexOf(readMore)).toBeLessThan(indexOf(chipRemove));
    expect(indexOf(chipRemove)).toBeLessThan(indexOf(availabilitySwitch));
    expect(indexOf(chipRemove)).toBeLessThan(indexOf(firstCardLink));
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
