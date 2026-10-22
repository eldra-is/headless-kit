import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { isIS } from '../../../messages/is-IS';
import { axe } from '../../../test/axe';
import { mountWith } from '../../../test/mount';
import NavMenu from '../NavMenu.vue';
import type { NavMenuItem } from '../types';

const ITEMS: NavMenuItem[] = [
  {
    label: 'Shop',
    children: [
      { label: 'Sweaters', href: '/sweaters', group: 'Knitwear', description: 'Merino and wool' },
      { label: 'Cardigans', href: '/cardigans', group: 'Knitwear', badge: 'New' },
      { label: 'Mugs', href: '/mugs', group: 'Ceramics' },
      { label: 'Glass', href: null, group: 'Ceramics' },
    ],
  },
  {
    label: 'Journal',
    href: '/journal',
    children: [
      { label: 'Stories', href: '/stories', current: true },
      { label: 'Makers', href: 'https://makers.test', newTab: true },
    ],
  },
  { label: 'About', href: '/about', current: true },
  { label: null, href: '/hidden' },
];

type Wrapper = VueWrapper<InstanceType<typeof NavMenu>>;

function mount(props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}): Wrapper {
  return mountWith(NavMenu, {
    props: { items: ITEMS, ...props },
    slots: slots as never,
  }) as Wrapper;
}

function triggers(wrapper: Wrapper): HTMLButtonElement[] {
  return wrapper.findAll('[data-part="trigger"]').map((t) => t.element as HTMLButtonElement);
}

function panel(wrapper: Wrapper, index: number): HTMLElement {
  return document.getElementById(triggers(wrapper)[index]!.getAttribute('aria-controls')!)!;
}

function isShown(element: HTMLElement): boolean {
  return element.style.display !== 'none';
}

function key(target: EventTarget, name: string): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
  );
}

function pointer(target: EventTarget, type: string, pointerType = 'mouse'): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: type === 'pointerdown', pointerType }));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('NavMenu — structure', () => {
  it('is a named navigation landmark with one list entry per item that has a label', () => {
    const wrapper = mount();
    const nav = wrapper.get('[data-part="nav"]');
    expect(nav.element.tagName).toBe('NAV');
    expect(nav.attributes('aria-label')).toBe('Main');
    expect(wrapper.get('[data-part="list"]').element.tagName).toBe('UL');
    expect(wrapper.findAll('[data-part="item"]')).toHaveLength(3);
    expect(wrapper.text()).not.toContain('/hidden');
    wrapper.unmount();
  });

  it('renders a plain item as a link and marks the current page', () => {
    const wrapper = mount();
    const link = wrapper.get('[data-part="link"]');
    expect(link.element.tagName).toBe('A');
    expect(link.attributes('href')).toBe('/about');
    expect(link.attributes('aria-current')).toBe('page');
    wrapper.unmount();
  });

  it('renders an item with children as a disclosure button controlling a hidden panel', () => {
    const wrapper = mount();
    const [shop] = triggers(wrapper);
    expect(shop!.tagName).toBe('BUTTON');
    expect(shop!.type).toBe('button');
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    expect(shop!.hasAttribute('aria-haspopup')).toBe(false);
    expect(isShown(panel(wrapper, 0))).toBe(false);
    wrapper.unmount();
  });

  it('marks the trigger whose panel holds the current page', () => {
    const wrapper = mount();
    const [shop, journal] = triggers(wrapper);
    expect(shop!.hasAttribute('data-current')).toBe(false);
    expect(journal!.hasAttribute('data-current')).toBe(true);
    wrapper.unmount();
  });

  it('takes Icelandic built-in labels from the message set', () => {
    const wrapper = mount({ messages: isIS, modelValue: 1 });
    expect(wrapper.get('[data-part="nav"]').attributes('aria-label')).toBe('Aðalvalmynd');
    expect(wrapper.get('[data-part="toggle"]').attributes('aria-label')).toBe('Valmynd');
    expect(wrapper.get('[data-part="overview"]').text()).toBe('Journal: yfirlit');
    wrapper.unmount();
  });

  it('lets ariaLabel name the landmark', () => {
    const wrapper = mount({ ariaLabel: 'Primary' });
    expect(wrapper.get('[data-part="nav"]').attributes('aria-label')).toBe('Primary');
    wrapper.unmount();
  });
});

describe('NavMenu — panels', () => {
  it('opens on click and closes on a second click', async () => {
    const wrapper = mount();
    const [shop] = triggers(wrapper);
    shop!.click();
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    expect(isShown(panel(wrapper, 0))).toBe(true);
    expect(wrapper.emitted('update:modelValue')).toEqual([[0]]);
    shop!.click();
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    expect(isShown(panel(wrapper, 0))).toBe(false);
    wrapper.unmount();
  });

  it('keeps only one panel open', async () => {
    const wrapper = mount();
    const [shop, journal] = triggers(wrapper);
    shop!.click();
    await nextTick();
    journal!.click();
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    expect(journal!.getAttribute('aria-expanded')).toBe('true');
    expect(isShown(panel(wrapper, 0))).toBe(false);
    expect(isShown(panel(wrapper, 1))).toBe(true);
    wrapper.unmount();
  });

  it('closes on Escape and puts focus back on the trigger', async () => {
    const wrapper = mount();
    const [shop] = triggers(wrapper);
    shop!.click();
    await nextTick();
    const link = panel(wrapper, 0).querySelector('a')!;
    link.focus();
    key(link, 'Escape');
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(shop);
    wrapper.unmount();
  });

  it('closes on a pointer press outside, and not on one inside', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const wrapper = mount();
    const [shop] = triggers(wrapper);
    shop!.click();
    await nextTick();
    pointer(panel(wrapper, 0), 'pointerdown');
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    pointer(outside, 'pointerdown');
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('stays open while Tab moves into the panel and closes once focus leaves it', async () => {
    const wrapper = mount();
    const [shop, journal] = triggers(wrapper);
    shop!.click();
    await nextTick();
    const link = panel(wrapper, 0).querySelector('a')!;
    shop!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: link }));
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    link.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: journal }));
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('closes when a link in the panel is followed', async () => {
    const wrapper = mount();
    const [shop] = triggers(wrapper);
    shop!.click();
    await nextTick();
    const link = panel(wrapper, 0).querySelector('a')!;
    link.addEventListener('click', (event) => event.preventDefault());
    link.click();
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('follows a bound modelValue', async () => {
    const wrapper = mount({ modelValue: 1 });
    expect(triggers(wrapper)[1]!.getAttribute('aria-expanded')).toBe('true');
    await wrapper.setProps({ modelValue: null });
    expect(triggers(wrapper)[1]!.getAttribute('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('fades a closing panel out, unclickable, rather than cutting it', async () => {
    const wrapper = mountWith(NavMenu, {
      props: { items: ITEMS },
      global: { stubs: { transition: false } },
    }) as Wrapper;
    const [shop] = triggers(wrapper);
    shop!.click();
    await nextTick();
    shop!.click();
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    expect([...panel(wrapper, 0).classList]).toEqual(
      expect.arrayContaining([
        'pointer-events-none',
        'transition-opacity',
        'duration-fast',
        'ease-in',
      ])
    );
    wrapper.unmount();
  });

  it('closes the panel and the drawer through the exposed close()', async () => {
    const wrapper = mount({ modelValue: 0, drawerOpen: true });
    (wrapper.vm as unknown as { close: () => void }).close();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
    expect(wrapper.emitted('update:drawerOpen')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });
});

describe('NavMenu — panel content', () => {
  it('puts grouped entries in labelled columns with descriptions and badges', () => {
    const wrapper = mount({ modelValue: 0 });
    const groups = panel(wrapper, 0).querySelectorAll('[data-part="group"]');
    expect(groups).toHaveLength(2);
    const heading = groups[0]!.querySelector('[data-part="groupHeading"]')!;
    expect(heading.textContent?.trim()).toBe('Knitwear');
    expect(groups[0]!.querySelector('ul')!.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(groups[0]!.querySelector('[data-part="description"]')!.textContent?.trim()).toBe(
      'Merino and wool'
    );
    expect(groups[0]!.querySelectorAll('a')[1]!.textContent).toContain('New');
    wrapper.unmount();
  });

  it('renders an entry without a destination as text, not a link', () => {
    const wrapper = mount({ modelValue: 0 });
    const glass = [...panel(wrapper, 0).querySelectorAll('[data-part="panelLink"]')].find((el) =>
      el.textContent?.includes('Glass')
    )!;
    expect(glass.tagName).toBe('SPAN');
    expect(glass.hasAttribute('href')).toBe(false);
    wrapper.unmount();
  });

  it("links an item's own page first in its panel, and opens new-tab entries safely", () => {
    const wrapper = mount({ modelValue: 1 });
    const overview = wrapper.get('[data-part="overview"]');
    expect(overview.attributes('href')).toBe('/journal');
    expect(overview.text()).toBe('Journal: overview');
    const external = panel(wrapper, 1).querySelector('a[target="_blank"]')!;
    expect(external.getAttribute('rel')).toBe('noopener noreferrer');
    expect(external.textContent).toContain('opens in a new tab');
    expect(panel(wrapper, 1).querySelector('[aria-current="page"]')!.textContent).toContain(
      'Stories'
    );
    wrapper.unmount();
  });

  it('spans the menu for a mega panel and hangs a dropdown under its own item', () => {
    const wrapper = mount();
    const [shopItem, journalItem] = wrapper.findAll('[data-part="item"]');
    expect(shopItem!.classes()).not.toContain('relative');
    expect(panel(wrapper, 0).className).toContain('inset-x-0');
    expect(journalItem!.classes()).toContain('relative');
    expect(panel(wrapper, 1).className).toContain('start-0');
    wrapper.unmount();
  });

  it('passes a router link component the destination as `to`', () => {
    const RouterLink = defineComponent({
      props: { to: { type: String, required: true } },
      setup:
        (props, { slots }) =>
        () =>
          h('a', { href: `#${props.to}` }, slots.default?.()),
    });
    const wrapper = mount({ linkAs: RouterLink, modelValue: 0 });
    expect(wrapper.get('[data-part="link"]').attributes('href')).toBe('#/about');
    expect(panel(wrapper, 0).querySelector('a')!.getAttribute('href')).toBe('#/sweaters');
    wrapper.unmount();
  });

  it('takes no room for a panel footer the slot leaves empty for that panel', async () => {
    const wrapper = mount(
      {},
      {
        panelFooter: ({ index }: { index: number }) =>
          index === 0 ? h('a', { href: '/all' }, 'All') : undefined,
      }
    );
    const footer = (index: number): HTMLElement =>
      panel(wrapper, index).querySelector('[data-part="footer"]')!;
    expect(footer(0).classList).toContain('empty:hidden');
    expect(footer(0).matches(':empty')).toBe(false);
    expect(footer(1).matches(':empty')).toBe(true);
    wrapper.unmount();
  });

  it('renders the slots with their scope', async () => {
    const wrapper = mount(
      {},
      {
        panelItem: ({ link }: { link: { label: string } }) => h('em', link.label.toUpperCase()),
        groupHeading: ({ group }: { group: string }) => h('strong', `${group}!`),
        panelFooter: ({ close }: { close: () => void }) =>
          h('button', { type: 'button', class: 'done', onClick: close }, 'Done'),
      }
    );
    triggers(wrapper)[0]!.click();
    await nextTick();
    expect(panel(wrapper, 0).querySelector('em')!.textContent).toBe('SWEATERS');
    expect(panel(wrapper, 0).querySelector('strong')!.textContent).toBe('Knitwear!');
    (panel(wrapper, 0).querySelector('.done') as HTMLButtonElement).click();
    await nextTick();
    expect(triggers(wrapper)[0]!.getAttribute('aria-expanded')).toBe('false');
    wrapper.unmount();
  });
});

describe('NavMenu — arrow keys', () => {
  function press(target: Element, name: string, init: KeyboardEventInit = {}): boolean {
    const event = new KeyboardEvent('keydown', {
      key: name,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

  function attached(props: Record<string, unknown> = {}): Wrapper {
    return mountWith(NavMenu, {
      props: { items: ITEMS, ...props },
      attachTo: document.body,
    }) as Wrapper;
  }

  const about = (wrapper: Wrapper): HTMLElement =>
    wrapper.get('[data-part="link"]').element as HTMLElement;
  const panelLinks = (wrapper: Wrapper, index: number): HTMLElement[] => [
    ...panel(wrapper, index).querySelectorAll<HTMLElement>('a[href]'),
  ];

  it('ArrowDown on a trigger opens its panel and focuses the first link once it is shown', async () => {
    const wrapper = attached();
    const [shop] = triggers(wrapper);
    shop!.focus();
    expect(press(shop!, 'ArrowDown')).toBe(true);
    expect(document.activeElement).toBe(shop);
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(panelLinks(wrapper, 0)[0]);
    wrapper.unmount();
  });

  it('ArrowUp on a trigger opens its panel at the last link', async () => {
    const wrapper = attached();
    const [, journal] = triggers(wrapper);
    journal!.focus();
    press(journal!, 'ArrowUp');
    await nextTick();
    expect(document.activeElement).toBe(panelLinks(wrapper, 1).at(-1));
    wrapper.unmount();
  });

  it('ArrowDown/ArrowUp walk the panel and clamp; Home/End jump to its ends', async () => {
    const wrapper = attached({ modelValue: 0 });
    const links = panelLinks(wrapper, 0);
    expect(links).toHaveLength(3);
    links[0]!.focus();
    press(links[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(links[1]);
    press(links[1]!, 'ArrowUp');
    press(links[0]!, 'ArrowUp');
    expect(document.activeElement).toBe(links[0]);
    press(links[0]!, 'End');
    await nextTick();
    expect(document.activeElement).toBe(links[2]);
    press(links[2]!, 'ArrowDown');
    expect(document.activeElement).toBe(links[2]);
    press(links[2]!, 'Home');
    await nextTick();
    expect(document.activeElement).toBe(links[0]);
    wrapper.unmount();
  });

  it('ArrowRight/ArrowLeft move along the bar, carrying an open panel, and clamp at the ends', async () => {
    const wrapper = attached();
    const [shop, journal] = triggers(wrapper);
    shop!.focus();
    press(shop!, 'ArrowRight');
    await nextTick();
    expect(document.activeElement).toBe(journal);
    expect(journal!.getAttribute('aria-expanded')).toBe('false');

    journal!.click();
    await nextTick();
    press(journal!, 'ArrowLeft');
    await nextTick();
    expect(document.activeElement).toBe(shop);
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    expect(journal!.getAttribute('aria-expanded')).toBe('false');

    press(shop!, 'ArrowLeft');
    expect(document.activeElement).toBe(shop);
    press(shop!, 'End');
    await nextTick();
    expect(document.activeElement).toBe(about(wrapper));
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    press(about(wrapper), 'ArrowRight');
    expect(document.activeElement).toBe(about(wrapper));
    press(about(wrapper), 'Home');
    expect(document.activeElement).toBe(shop);
    wrapper.unmount();
  });

  it('ArrowRight from inside a panel lands on the next entry itself, its panel open', async () => {
    const wrapper = attached();
    const [shop, journal] = triggers(wrapper);
    shop!.click();
    await nextTick();
    const first = panelLinks(wrapper, 0)[0]!;
    first.focus();
    press(first, 'ArrowRight');
    await nextTick();
    expect(document.activeElement).toBe(journal);
    expect(journal!.getAttribute('aria-expanded')).toBe('true');
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('leaves every other key, a modified arrow and a typing field to the page', async () => {
    const wrapper = attached({ modelValue: 0 });
    const [shop] = triggers(wrapper);
    for (const name of ['Tab', 'PageDown', 'a', 'Enter']) {
      expect(press(shop!, name), name).toBe(false);
      expect(press(about(wrapper), name), name).toBe(false);
    }
    expect(press(about(wrapper), 'ArrowDown')).toBe(false);
    expect(press(shop!, 'ArrowRight', { altKey: true })).toBe(false);
    const input = document.createElement('input');
    panel(wrapper, 0).querySelector('[data-part="content"]')!.append(input);
    expect(press(input, 'ArrowLeft')).toBe(false);
    wrapper.unmount();
  });
});

describe('NavMenu — hover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const root = (wrapper: Wrapper): Element => wrapper.get('[data-part="root"]').element;

  it('opens once a mouse rests on a trigger, and closes a moment after it leaves the menu', async () => {
    const wrapper = mount({ openOnHover: true });
    const [shop] = triggers(wrapper);
    pointer(shop!, 'pointerenter');
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    vi.advanceTimersByTime(150);
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    pointer(root(wrapper), 'pointerleave');
    vi.advanceTimersByTime(100);
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    vi.advanceTimersByTime(50);
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('opens nothing for a pointer passing over a trigger', async () => {
    const wrapper = mount({ openOnHover: true });
    const [shop] = triggers(wrapper);
    pointer(shop!, 'pointerenter');
    vi.advanceTimersByTime(100);
    pointer(shop!, 'pointerleave');
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('stays open when the pointer comes back within the grace period', async () => {
    const wrapper = mount({ openOnHover: true });
    const [shop] = triggers(wrapper);
    pointer(shop!, 'pointerenter');
    vi.advanceTimersByTime(150);
    pointer(root(wrapper), 'pointerleave');
    vi.advanceTimersByTime(100);
    pointer(root(wrapper), 'pointerenter');
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    wrapper.unmount();
  });

  it('ignores touch, and stays off unless asked for', async () => {
    const touch = mount({ openOnHover: true });
    pointer(triggers(touch)[0]!, 'pointerenter', 'touch');
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(triggers(touch)[0]!.getAttribute('aria-expanded')).toBe('false');
    touch.unmount();
    const off = mount();
    pointer(triggers(off)[0]!, 'pointerenter');
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(triggers(off)[0]!.getAttribute('aria-expanded')).toBe('false');
    off.unmount();
  });

  it('keeps a hover-opened panel open when it is clicked, then leaving does not close it', async () => {
    const wrapper = mount({ openOnHover: true });
    const [shop] = triggers(wrapper);
    pointer(shop!, 'pointerenter');
    vi.advanceTimersByTime(150);
    await nextTick();
    shop!.click();
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    pointer(root(wrapper), 'pointerleave');
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    wrapper.unmount();
  });

  it('keeps a hover-opened panel open while keyboard focus is inside it', async () => {
    const wrapper = mount({ openOnHover: true });
    const [shop] = triggers(wrapper);
    pointer(shop!, 'pointerenter');
    vi.advanceTimersByTime(150);
    await nextTick();
    panel(wrapper, 0).querySelector('a')!.focus();
    pointer(root(wrapper), 'pointerleave');
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    wrapper.unmount();
  });

  it('does not close a clicked-open panel when the pointer leaves', async () => {
    const wrapper = mount({ openOnHover: true });
    const [shop] = triggers(wrapper);
    shop!.click();
    await nextTick();
    pointer(root(wrapper), 'pointerleave');
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    wrapper.unmount();
  });

  it('drops a pending hover open once the panel closes another way', async () => {
    const wrapper = mount({ openOnHover: true });
    const [shop, journal] = triggers(wrapper);
    shop!.click();
    await nextTick();
    pointer(journal!, 'pointerenter');
    (wrapper.vm as unknown as { close: () => void }).close();
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(journal!.getAttribute('aria-expanded')).toBe('false');
    wrapper.unmount();
  });
});

describe('NavMenu — narrow screens', () => {
  it('collapses below lg by default: bar hidden below, menu button hidden above', () => {
    const wrapper = mount();
    expect(wrapper.get('[data-part="nav"]').classes()).toEqual(
      expect.arrayContaining(['hidden', 'lg:block'])
    );
    const toggle = wrapper.get('[data-part="toggle"]');
    expect(toggle.classes()).toContain('lg:hidden');
    expect(toggle.attributes('aria-label')).toBe('Menu');
    expect(toggle.attributes('aria-haspopup')).toBe('dialog');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('never collapses with collapseBelow="never", and renders no drawer', () => {
    const wrapper = mount({ collapseBelow: 'never' });
    expect(wrapper.get('[data-part="nav"]').classes()).toEqual(['block']);
    expect(wrapper.find('[data-part="toggle"]').exists()).toBe(false);
    expect(wrapper.find('dialog').exists()).toBe(false);
    wrapper.unmount();
  });

  it('collapses against the nearest container with an @ breakpoint', () => {
    const wrapper = mount({ collapseBelow: '@content' });
    expect(wrapper.get('[data-part="nav"]').classes()).toEqual(['hidden', '@content:block']);
    const toggle = wrapper.get('[data-part="toggle"]').classes();
    expect(toggle).toContain('@content:hidden');
    expect(toggle.some((token) => /^(md|lg|xl):/.test(token))).toBe(false);
    wrapper.unmount();
  });

  it('shows only the menu button with collapseBelow="always"', () => {
    const wrapper = mount({ collapseBelow: 'always' });
    expect(wrapper.find('[data-part="nav"]').exists()).toBe(false);
    const toggle = wrapper.get('[data-part="toggle"]').classes();
    expect(toggle.some((token) => token.endsWith(':hidden'))).toBe(false);
    expect(wrapper.get('dialog').findAll('[data-part="drawerItem"]')).toHaveLength(3);
    wrapper.unmount();
  });

  it('draws no empty navigation landmark when no entry has a label', () => {
    const wrapper = mount(
      { items: [{ label: null, href: '/x' }] },
      { drawerFooter: () => h('a', { href: '/contact' }, 'Contact') }
    );
    expect(wrapper.findAll('nav')).toHaveLength(0);
    expect(wrapper.find('[data-part="toggle"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('points the menu button at the drawer, named by its own message', () => {
    const wrapper = mount({ messages: { navMenuOpen: 'Open menu', navMenuDrawer: 'Site menu' } });
    const toggle = wrapper.get('[data-part="toggle"]');
    const dialog = wrapper.get('dialog');
    expect(toggle.attributes('aria-label')).toBe('Open menu');
    expect(toggle.attributes('aria-controls')).toBe(dialog.attributes('id'));
    expect(dialog.attributes('aria-label')).toBe('Site menu');
    wrapper.unmount();
  });

  it('opens a Drawer named "Menu" holding the same items', async () => {
    const wrapper = mount({}, { drawerFooter: () => h('a', { href: '/contact' }, 'Contact') });
    await wrapper.get('[data-part="toggle"]').trigger('click');
    await nextTick();
    const dialog = wrapper.get('dialog').element as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('aria-label')).toBe('Menu');
    expect(wrapper.get('[data-part="toggle"]').attributes('aria-expanded')).toBe('true');
    expect(dialog.querySelector('nav')!.getAttribute('aria-label')).toBe('Main');
    expect(dialog.querySelectorAll('details')).toHaveLength(2);
    expect(dialog.querySelector('[data-part="drawerLink"]')!.getAttribute('href')).toBe('/about');
    expect(dialog.querySelector('[data-part="footer"]')!.textContent).toContain('Contact');
    wrapper.unmount();
  });

  it('closes the drawer when one of its links is followed', async () => {
    const wrapper = mount({ drawerOpen: true });
    await nextTick();
    const link = wrapper.get('dialog [data-part="drawerLink"]').element as HTMLAnchorElement;
    link.addEventListener('click', (event) => event.preventDefault());
    link.click();
    await nextTick();
    expect(wrapper.emitted('update:drawerOpen')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });
});

describe('NavMenu — customisation', () => {
  it('merges classes onto their parts, replacing what they conflict with', () => {
    const wrapper = mount({
      modelValue: 0,
      classes: { trigger: 'px-6', columns: 'grid-cols-5', content: 'rounded-none', root: 'static' },
    });
    expect(wrapper.get('[data-part="root"]').classes()).toContain('static');
    expect(wrapper.get('[data-part="root"]').classes()).not.toContain('relative');
    const trigger = wrapper.get('[data-part="trigger"]').classes();
    expect(trigger).toContain('px-6');
    expect(trigger).not.toContain('px-3');
    const columns = panel(wrapper, 0).querySelector('[data-part="columns"]')!.classList;
    expect(columns.contains('grid-cols-5')).toBe(true);
    expect(columns.contains('eldra-nav-menu-columns')).toBe(false);
    wrapper.unmount();
  });
});

describe('NavMenu — variants', () => {
  const FILL = '[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]';

  function partClasses(root: ParentNode, part: string): string[] {
    return [...root.querySelectorAll(`[data-part="${part}"]`)].flatMap((el) => [...el.classList]);
  }

  /** A class that changes weight in some state but not at rest would shift the text. */
  const STATE_WEIGHT = /^(hover|aria-expanded|aria-\[current=page\]|data-\[current\]):font-/;

  it('defaults to ghost: text colour, filled on hover and while open', () => {
    const wrapper = mount({ modelValue: 0 });
    for (const part of ['trigger', 'link']) {
      const classes = wrapper.get(`[data-part="${part}"]`).classes();
      expect(classes, part).toEqual(
        expect.arrayContaining(['text-text', `hover:bg-${FILL}`, `aria-expanded:bg-${FILL}`])
      );
      expect(classes, part).not.toContain('text-muted');
    }
    const panelLinks = panel(wrapper, 0).querySelectorAll('a[data-part="panelLink"]');
    for (const link of panelLinks) {
      expect([...link.classList]).toEqual(
        expect.arrayContaining(['text-text', 'hover:bg-surface'])
      );
    }
    wrapper.unmount();
  });

  it('muted: muted text turning the text colour on hover, open and current, with no fill', () => {
    const wrapper = mount({ variant: 'muted', modelValue: 0 });
    const trigger = wrapper.get('[data-part="trigger"]').classes();
    expect(trigger).toEqual(
      expect.arrayContaining([
        'text-muted',
        'hover:text-text',
        'aria-expanded:text-text',
        'data-[current]:text-text',
      ])
    );
    const link = wrapper.get('[data-part="link"]').classes();
    expect(link).toEqual(
      expect.arrayContaining(['text-muted', 'hover:text-text', 'aria-[current=page]:text-text'])
    );
    // The current page keeps its underline: colour alone is not enough to mark it.
    expect(link).toContain('aria-[current=page]:underline');

    const bar = wrapper.get('[data-part="nav"]').element;
    for (const token of [...partClasses(bar, 'trigger'), ...partClasses(bar, 'link')]) {
      expect(token).not.toMatch(/^(hover|aria-expanded):bg-/);
      expect(token).not.toMatch(STATE_WEIGHT);
    }
    wrapper.unmount();
  });

  it('muted: the panel links are quiet too, and an entry without a destination never lights up', async () => {
    const wrapper = mount({ variant: 'muted', modelValue: 0 });
    const links = [...panel(wrapper, 0).querySelectorAll<HTMLElement>('[data-part="panelLink"]')];
    for (const link of links.filter((el) => el.tagName === 'A')) {
      expect([...link.classList]).toEqual(
        expect.arrayContaining(['text-muted', 'hover:text-text', 'aria-[current=page]:text-text'])
      );
    }
    const glass = links.find((el) => el.tagName === 'SPAN')!;
    expect([...glass.classList]).toContain('text-muted');
    expect([...glass.classList]).not.toContain('hover:text-text');

    await wrapper.setProps({ modelValue: 1 });
    const overview = wrapper.get('[data-part="overview"]').classes();
    expect(overview).toEqual(expect.arrayContaining(['text-muted', 'hover:text-text']));

    for (const token of [
      ...partClasses(panel(wrapper, 0), 'panelLink'),
      ...partClasses(panel(wrapper, 1), 'panelLink'),
      ...overview,
    ]) {
      expect(token).not.toMatch(/^hover:bg-/);
      expect(token).not.toMatch(STATE_WEIGHT);
    }
    wrapper.unmount();
  });

  it('leaves the drawer rows as they are under either variant', async () => {
    const drawerClasses = async (variant: 'ghost' | 'muted'): Promise<string[]> => {
      const wrapper = mount({ variant, drawerOpen: true });
      await nextTick();
      const dialog = wrapper.get('dialog').element;
      const classes = ['drawerLink', 'panelLink', 'overview'].map((part) =>
        partClasses(dialog, part).join(' ')
      );
      wrapper.unmount();
      return classes;
    };
    expect(await drawerClasses('muted')).toEqual(await drawerClasses('ghost'));
  });

  it('lets classes override what the variant sets', () => {
    const wrapper = mount({ variant: 'muted', classes: { link: 'text-primary' } });
    const link = wrapper.get('[data-part="link"]').classes();
    expect(link).toContain('text-primary');
    expect(link).not.toContain('text-muted');
    wrapper.unmount();
  });

  it('has no axe violations in the muted variant, closed, open and with the drawer open', async () => {
    const closed = mount({ variant: 'muted' });
    expect(await axe(closed.element)).toHaveNoViolations();
    closed.unmount();
    const open = mount({ variant: 'muted', modelValue: 0 });
    expect(await axe(open.element)).toHaveNoViolations();
    open.unmount();
    const drawer = mount({ variant: 'muted', drawerOpen: true });
    await nextTick();
    expect(await axe(drawer.get('dialog').element)).toHaveNoViolations();
    drawer.unmount();
  });
});

describe('NavMenu — accessibility', () => {
  it('has no axe violations closed, with a panel open, and with the drawer open', async () => {
    const closed = mount();
    expect(await axe(closed.element)).toHaveNoViolations();
    closed.unmount();
    const open = mount({ modelValue: 0 });
    expect(await axe(open.element)).toHaveNoViolations();
    open.unmount();
    // The open drawer is modal: the page behind it, the bar included, is inert.
    const drawer = mount({ drawerOpen: true });
    await nextTick();
    expect(await axe(drawer.get('dialog').element)).toHaveNoViolations();
    drawer.unmount();
  });
});
