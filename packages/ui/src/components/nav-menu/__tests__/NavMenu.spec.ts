import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { isIS } from '../../../messages/is-IS';
import { axe } from '../../../test/axe';
import { mountWith } from '../../../test/mount';
import { formatPrice } from '@eldrajs/sdk/format';
import { CURRENCY_KEY, LOCALE_KEY } from '../../../composables/useLocale';
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

const CARDS: NavMenuItem[] = [
  {
    label: 'Shop',
    sections: [
      { heading: 'Knitwear', links: [{ label: 'Sweaters', href: '/sweaters' }] },
      {
        heading: 'Featured',
        display: 'card',
        links: [
          {
            label: 'Tall mug',
            href: '/tall',
            display: 'card',
            card: { image: '/tall.jpg', title: 'Tall mug', price: 2800 },
          },
          {
            label: 'Mugs',
            href: '/mugs',
            display: 'card',
            card: { image: '/mugs.jpg', title: 'Mugs' },
          },
          { label: 'Glaze guide', href: '/glaze' },
        ],
      },
    ],
  },
];

function mount(
  props: Record<string, unknown> = {},
  slots: Record<string, unknown> = {},
  provide: Record<symbol, unknown> = {}
): Wrapper {
  return mountWith(NavMenu, {
    props: { items: ITEMS, ...props },
    slots: slots as never,
    global: { provide },
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
    // Only Journal's "Stories" is the page here; the fixture's own "About" also says current.
    const wrapper = mount({
      items: ITEMS.map((item) => (item.label === 'About' ? { ...item, current: false } : item)),
    });
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
        'eldra:pointer-events-none',
        'eldra:transition-opacity',
        'eldra:duration-fast',
        'eldra:ease-in',
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

  it('closes a drawer that was already open at mount once the screen is wide', async () => {
    const wrapper = mount({ drawerOpen: true });
    expect(wrapper.emitted('update:drawerOpen')).toBeUndefined();
    const style = vi
      .spyOn(window, 'getComputedStyle')
      .mockReturnValue({ display: 'none' } as CSSStyleDeclaration);
    window.dispatchEvent(new Event('resize'));
    style.mockRestore();
    await nextTick();
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

  it('names a described link by its label and describes it by the description', () => {
    const wrapper = mount({ modelValue: 0 });
    const [sweaters, cardigans] = panel(wrapper, 0).querySelectorAll<HTMLElement>(
      '[data-part="panelLink"]'
    );
    const desc = sweaters!.querySelector('[data-part="description"]')!;
    const label = sweaters!.querySelector('[data-part="panelLabel"]')!;
    expect(desc.id).not.toBe('');
    expect(sweaters!.getAttribute('aria-describedby')).toBe(desc.id);
    expect(sweaters!.getAttribute('aria-labelledby')).toBe(label.id);
    expect(document.getElementById(label.id)!.textContent?.trim()).toBe('Sweaters');
    // No description: no element, no extra attributes, the name comes from the content.
    expect(cardigans!.querySelector('[data-part="description"]')).toBeNull();
    expect(cardigans!.hasAttribute('aria-describedby')).toBe(false);
    expect(cardigans!.hasAttribute('aria-labelledby')).toBe(false);
    wrapper.unmount();
  });

  it('keeps the new-tab text in the name of a described link that opens one', () => {
    const wrapper = mount({
      modelValue: 0,
      items: [
        {
          label: 'Journal',
          children: [
            { label: 'Makers', href: 'https://m.test', newTab: true, description: 'Who we are' },
          ],
        },
      ],
    });
    const link = panel(wrapper, 0).querySelector<HTMLElement>('[data-part="panelLink"]')!;
    const names = link.getAttribute('aria-labelledby')!.split(' ');
    expect(names).toHaveLength(2);
    expect(names.map((id) => document.getElementById(id)!.textContent?.trim()).join(' ')).toBe(
      'Makers (opens in a new tab)'
    );
    expect(document.getElementById(link.getAttribute('aria-describedby')!)!.textContent).toContain(
      'Who we are'
    );
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
    expect(shopItem!.classes()).not.toContain('eldra:relative');
    expect(panel(wrapper, 0).className).toContain('eldra:inset-x-0');
    expect(journalItem!.classes()).toContain('eldra:relative');
    expect(panel(wrapper, 1).className).toContain('eldra:start-0');
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
    expect(footer(0).classList).toContain('eldra:empty:hidden');
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
      expect.arrayContaining(['eldra:hidden', 'eldra:lg:block'])
    );
    const toggle = wrapper.get('[data-part="toggle"]');
    expect(toggle.classes()).toContain('eldra:lg:hidden');
    expect(toggle.attributes('aria-label')).toBe('Menu');
    expect(toggle.attributes('aria-haspopup')).toBe('dialog');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('never collapses with collapseBelow="never", and renders no drawer', () => {
    const wrapper = mount({ collapseBelow: 'never' });
    expect(wrapper.get('[data-part="nav"]').classes()).toEqual(['eldra:block']);
    expect(wrapper.find('[data-part="toggle"]').exists()).toBe(false);
    expect(wrapper.find('dialog').exists()).toBe(false);
    wrapper.unmount();
  });

  it('collapses against the nearest container with an @ breakpoint', () => {
    const wrapper = mount({ collapseBelow: '@content' });
    expect(wrapper.get('[data-part="nav"]').classes()).toEqual([
      'eldra:hidden',
      'eldra:@content:block',
    ]);
    const toggle = wrapper.get('[data-part="toggle"]').classes();
    expect(toggle).toContain('eldra:@content:hidden');
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

  it("replaces the accordion's own summary height and panel width with the drawer row's", () => {
    const wrapper = mount({ collapseBelow: 'always' });
    const details = wrapper.get('dialog').find('details');
    const summary = details.get('summary[data-part="summary"]').classes();
    expect(summary).toContain('eldra:eldra-nav-menu-drawer-row');
    expect(summary).not.toContain('eldra:min-h-14');
    const panelPart = details.get('[data-part="panel"]').classes();
    expect(panelPart).toEqual(expect.arrayContaining(['eldra:max-w-none', 'eldra:text-text']));
    expect(panelPart).not.toContain('eldra:max-w-[65ch]');
    expect(panelPart).not.toContain('eldra:text-muted');
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

describe('NavMenu — linked column headings', () => {
  const linked: NavMenuItem[] = [
    { ...ITEMS[0]!, groups: [{ label: 'Knitwear', href: '/knitwear' }, { label: 'Ceramics' }] },
    ...ITEMS.slice(1),
  ];

  it('makes a heading with a page a link in the bar, and leaves one without as text', async () => {
    const wrapper = mount({ items: linked, modelValue: 0 });
    await nextTick();
    const headings = panel(wrapper, 0).querySelectorAll('[data-part="groupHeading"]');
    const link = headings[0]!.querySelector('[data-part="groupLink"]')!;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/knitwear');
    expect(headings[1]!.querySelector('[data-part="groupLink"]')).toBeNull();
    expect(headings[1]!.textContent!.trim()).toBe('Ceramics');
    wrapper.unmount();
  });

  it('makes the same heading a link in the drawer', async () => {
    const wrapper = mount({ items: linked, drawerOpen: true, drawerLayout: 'sections' });
    await nextTick();
    const link = wrapper.get('dialog').element.querySelector('[data-part="drawerGroupLink"]')!;
    expect(link.getAttribute('href')).toBe('/knitwear');
    wrapper.unmount();
  });

  it('still names its list by the heading, link or not', async () => {
    const wrapper = mount({ items: linked, modelValue: 0 });
    await nextTick();
    const heading = panel(wrapper, 0).querySelector('[data-part="groupHeading"]')!;
    const list = panel(wrapper, 0).querySelector('[data-part="panelList"]')!;
    expect(list.getAttribute('aria-labelledby')).toBe(heading.id);
    wrapper.unmount();
  });
});

describe('NavMenu — drawer layouts and entries', () => {
  async function openDrawer(
    props: Record<string, unknown> = {},
    slots: Record<string, unknown> = {}
  ): Promise<{ wrapper: Wrapper; dialog: HTMLDialogElement }> {
    const wrapper = mount({ drawerOpen: true, ...props }, slots);
    await nextTick();
    return { wrapper, dialog: wrapper.get('dialog').element as HTMLDialogElement };
  }

  const texts = (root: ParentNode, selector: string): string[] =>
    [...root.querySelectorAll(selector)].map((el) => el.textContent!.trim());

  it('defaults to accordion rows, each panel folded into a disclosure', async () => {
    const { wrapper, dialog } = await openDrawer();
    expect(dialog.querySelectorAll('details')).toHaveLength(2);
    expect(dialog.querySelector('[data-part="drawerSectionHeading"]')).toBeNull();
    wrapper.unmount();
  });

  it('sections: lists every panel open under its heading, the heading naming its list', async () => {
    const { wrapper, dialog } = await openDrawer({ drawerLayout: 'sections' });
    expect(dialog.querySelectorAll('details')).toHaveLength(0);
    expect(texts(dialog, '[data-part="drawerSectionHeading"]')).toEqual(['Shop', 'Journal']);
    const journal = dialog.querySelectorAll('[data-part="drawerItem"]')[1]!;
    const heading = journal.querySelector('[data-part="drawerSectionHeading"]')!;
    const list = journal.querySelector('[data-part="drawerPanelList"]')!;
    expect(list.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(texts(journal, 'a')).toEqual(['Journal', 'Stories', 'Makers (opens in a new tab)']);
    expect(dialog.querySelector('[data-part="drawerLink"]')!.getAttribute('href')).toBe('/about');
    wrapper.unmount();
  });

  it('sections: a heading whose entry has a page is that link, with no overview row; one without is text', async () => {
    const { wrapper, dialog } = await openDrawer({ drawerLayout: 'sections' });
    const [shop, journal] = dialog.querySelectorAll('[data-part="drawerSectionHeading"]');
    expect(journal!.tagName).toBe('A');
    expect(journal!.getAttribute('href')).toBe('/journal');
    expect(dialog.querySelector('[data-part="drawerOverview"]')).toBeNull();
    expect(shop!.tagName).toBe('SPAN');
    wrapper.unmount();
  });

  it('indents every panel beneath its row, in both layouts', async () => {
    for (const drawerLayout of ['accordion', 'sections']) {
      const { wrapper, dialog } = await openDrawer({ drawerLayout });
      const nests = dialog.querySelectorAll('[data-part="drawerNest"]');
      expect(nests, drawerLayout).toHaveLength(2);
      expect(nests[1]!.querySelector('[data-part="drawerPanelList"]'), drawerLayout).not.toBeNull();
      wrapper.unmount();
    }
  });

  it('accordion: keeps the overview row inside the indent', async () => {
    const { wrapper, dialog } = await openDrawer();
    const journal = dialog.querySelectorAll('[data-part="drawerNest"]')[1]!;
    expect(journal.querySelector('[data-part="drawerOverview"]')!.textContent!.trim()).toBe(
      'Journal: overview'
    );
    wrapper.unmount();
  });

  it('sections: keeps group headings when a panel has them, and draws none when it has not', async () => {
    const { wrapper, dialog } = await openDrawer({ drawerLayout: 'sections' });
    const [shop, journal] = dialog.querySelectorAll('[data-part="drawerItem"]');
    expect(texts(shop!, '[data-part="drawerGroupHeading"]')).toEqual(['Knitwear', 'Ceramics']);
    const lists = shop!.querySelectorAll('[data-part="drawerPanelList"]');
    const headings = shop!.querySelectorAll('[data-part="drawerGroupHeading"]');
    expect(lists[0]!.getAttribute('aria-labelledby')).toBe(headings[0]!.id);
    expect(journal!.querySelector('[data-part="drawerGroupHeading"]')).toBeNull();
    wrapper.unmount();
  });

  it('draws drawerItems in the drawer, leaving the bar on items', async () => {
    const drawerItems: NavMenuItem[] = [
      { label: 'Areas', children: [{ label: 'Sales', href: '/sales', current: true }] },
      { label: 'Developers', href: '/developers' },
      { label: '', href: '/skipped' },
    ];
    const { wrapper, dialog } = await openDrawer({ drawerItems, drawerLayout: 'sections' });
    expect(texts(dialog, '[data-part="drawerSectionHeading"]')).toEqual(['Areas']);
    expect(texts(dialog, '[data-part="drawerLink"]')).toEqual(['Developers']);
    expect(dialog.querySelector('a[href="/sales"]')!.getAttribute('aria-current')).toBe('page');
    expect(dialog.querySelector('a[href="/skipped"]')).toBeNull();
    expect(texts(wrapper.get('[data-part="list"]').element, '[data-part="trigger"]')).toEqual([
      'Shop',
      'Journal',
    ]);
    wrapper.unmount();
  });

  it('draws no drawer landmark when no drawer entry has a label, whatever the bar holds', async () => {
    const { wrapper, dialog } = await openDrawer({ drawerItems: [{ label: null, href: '/x' }] });
    expect(dialog.querySelector('nav')).toBeNull();
    expect(wrapper.find('[data-part="nav"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("names the drawer's copies of the panel parts with a drawer prefix, styled apart from the bar", async () => {
    const { wrapper, dialog } = await openDrawer({ modelValue: 0, drawerLayout: 'sections' }, {});
    await wrapper.setProps({
      classes: { panelLink: 'bar-link', drawerPanelLink: 'drawer-link', groupHeading: 'bar-head' },
    });
    const bar = panel(wrapper, 0);
    expect(bar.querySelector('[data-part="panelLink"]')!.classList).toContain('bar-link');
    expect(bar.querySelector('[data-part="drawerPanelLink"]')).toBeNull();
    expect(dialog.querySelector('[data-part="panelLink"]')).toBeNull();
    const drawerLink = dialog.querySelector('[data-part="drawerPanelLink"]')!;
    expect(drawerLink.classList).toContain('drawer-link');
    expect(drawerLink.classList).not.toContain('bar-link');
    expect(dialog.querySelector('.bar-head')).toBeNull();
    wrapper.unmount();
  });

  it('puts the drawerHeader slot in the header row, before the close button, and hands it close', async () => {
    const { wrapper, dialog } = await openDrawer(
      {},
      {
        drawerHeader: ({ close }: { close: () => void }) =>
          h('button', { type: 'button', class: 'cta', onClick: close }, 'Contact'),
      }
    );
    const header = dialog.querySelector('[data-part="header"]')!;
    const cta = header.querySelector('.cta') as HTMLButtonElement;
    const closeButton = header.querySelector('[data-part="close"]')!;
    expect(
      cta.compareDocumentPosition(closeButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    cta.click();
    await nextTick();
    expect(wrapper.emitted('update:drawerOpen')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it("restyles the drawer's dialog, header, close button and body through classes", async () => {
    const { wrapper, dialog } = await openDrawer({
      classes: {
        drawerRoot: 'backdrop:bg-transparent',
        drawer: 'h-auto',
        drawerHeader: 'min-h-0',
        drawerClose: 'size-8',
        drawerBody: 'p-4',
        drawerSectionHeading: 'pt-5',
      },
      drawerLayout: 'sections',
    });
    const classesOf = (part: string) => [
      ...dialog.querySelector(`[data-part="${part}"]`)!.classList,
    ];
    expect([...dialog.classList]).toContain('backdrop:bg-transparent');
    expect(classesOf('panel')).toContain('h-auto');
    expect(classesOf('header')).toContain('min-h-0');
    expect(classesOf('close')).toContain('size-8');
    expect(classesOf('body')).toContain('p-4');
    expect(classesOf('drawerSectionHeading')).toContain('pt-5');
    wrapper.unmount();
  });
});

describe('NavMenu — slots that know where they render', () => {
  it('hands panelItem and groupHeading the placement, bar or drawer', async () => {
    const seen = new Set<string>();
    const wrapper = mount(
      { modelValue: 0, drawerOpen: true, drawerLayout: 'sections' },
      {
        panelItem: ({ link, placement }: { link: NavMenuItem; placement: string }) => {
          seen.add(`item:${placement}`);
          return h('em', `${placement}:${link.label}`);
        },
        groupHeading: ({ group, placement }: { group: string; placement: string }) => {
          seen.add(`heading:${placement}`);
          return h('strong', `${placement}:${group}`);
        },
      }
    );
    await nextTick();
    expect(panel(wrapper, 0).querySelector('em')!.textContent).toBe('bar:Sweaters');
    expect(panel(wrapper, 0).querySelector('strong')!.textContent).toBe('bar:Knitwear');
    const dialog = wrapper.get('dialog').element;
    expect(dialog.querySelector('em')!.textContent).toBe('drawer:Sweaters');
    expect(dialog.querySelector('strong')!.textContent).toBe('drawer:Knitwear');
    expect([...seen].sort()).toEqual(['heading:bar', 'heading:drawer', 'item:bar', 'item:drawer']);
    wrapper.unmount();
  });

  it('replaces the chevron with the triggerIcon slot, which turns over with its panel', async () => {
    const wrapper = mount(
      {},
      {
        triggerIcon: ({ item, open }: { item: NavMenuItem; open: boolean }) =>
          h('i', { class: 'arrow' }, `${item.label}:${open}`),
      }
    );
    const icon = () => wrapper.get('[data-part="trigger"] [data-part="triggerIcon"]');
    expect(icon().element.querySelector('svg')).toBeNull();
    expect(icon().text()).toBe('Shop:false');
    expect(icon().attributes('aria-hidden')).toBe('true');
    expect(icon().classes()).not.toContain('eldra:rotate-180');
    triggers(wrapper)[0]!.click();
    await nextTick();
    expect(icon().text()).toBe('Shop:true');
    expect(icon().classes()).toContain('eldra:rotate-180');
    expect(triggers(wrapper)[0]!.textContent!.trim()).toBe('ShopShop:true');
    wrapper.unmount();
  });

  it('keeps the chevron without the slot', () => {
    const wrapper = mount();
    const icon = wrapper.get('[data-part="triggerIcon"]');
    expect(icon.element.querySelector('svg path')!.getAttribute('d')).toBe('M6 9l6 6l6 -6');
    wrapper.unmount();
  });
});

describe('NavMenu — customisation', () => {
  it('appends classes to their parts, and takes class on the root', () => {
    const wrapper = mountWith(NavMenu, {
      props: {
        items: ITEMS,
        modelValue: 0,
        classes: { trigger: 'px-6', columns: 'grid-cols-5', content: 'rounded-none' },
      },
      attrs: { class: 'static' },
    }) as Wrapper;
    expect(wrapper.get('[data-part="root"]').classes()).toContain('static');
    expect(wrapper.get('[data-part="trigger"]').classes()).toContain('px-6');
    const columns = panel(wrapper, 0).querySelector('[data-part="columns"]')!.classList;
    expect(columns.contains('grid-cols-5')).toBe(true);
    const content = panel(wrapper, 0).querySelector('[data-part="content"]')!.classList;
    expect(content.contains('rounded-none')).toBe(true);
    wrapper.unmount();
  });
});

describe('NavMenu — variants', () => {
  const FILL = '[color-mix(in_oklab,var(--eldra-color-text),transparent_94%)]';

  function partClasses(root: ParentNode, part: string): string[] {
    return [...root.querySelectorAll(`[data-part="${part}"]`)].flatMap((el) => [...el.classList]);
  }

  /** A class that changes weight in some state but not at rest would shift the text. */
  const STATE_WEIGHT = /^eldra:(hover|aria-expanded|aria-\[current=page\]|data-\[current\]):font-/;

  it('defaults to ghost: text colour, filled on hover and while open', () => {
    const wrapper = mount({ modelValue: 0 });
    for (const part of ['trigger', 'link']) {
      const classes = wrapper.get(`[data-part="${part}"]`).classes();
      expect(classes, part).toEqual(
        expect.arrayContaining([
          'eldra:text-text',
          `eldra:hover:bg-${FILL}`,
          `eldra:aria-expanded:bg-${FILL}`,
        ])
      );
      expect(classes, part).not.toContain('eldra:text-muted');
    }
    const panelLinks = panel(wrapper, 0).querySelectorAll('a[data-part="panelLink"]');
    for (const link of panelLinks) {
      expect([...link.classList]).toEqual(
        expect.arrayContaining(['eldra:text-text', 'eldra:hover:bg-surface'])
      );
    }
    wrapper.unmount();
  });

  it('muted: muted text turning the text colour on hover, open and current, with no fill', () => {
    const wrapper = mount({ variant: 'muted', modelValue: 0 });
    const trigger = wrapper.get('[data-part="trigger"]').classes();
    expect(trigger).toEqual(
      expect.arrayContaining([
        'eldra:text-muted',
        'eldra:hover:text-text',
        'eldra:aria-expanded:text-text',
        'eldra:data-[current]:text-text',
      ])
    );
    const link = wrapper.get('[data-part="link"]').classes();
    expect(link).toEqual(
      expect.arrayContaining([
        'eldra:text-muted',
        'eldra:hover:text-text',
        'eldra:aria-[current=page]:text-text',
      ])
    );
    // The current page keeps its underline: colour alone is not enough to mark it.
    expect(link).toContain('eldra:aria-[current=page]:underline');

    const bar = wrapper.get('[data-part="nav"]').element;
    for (const token of [...partClasses(bar, 'trigger'), ...partClasses(bar, 'link')]) {
      expect(token).not.toMatch(/^eldra:(hover|aria-expanded):bg-/);
      expect(token).not.toMatch(STATE_WEIGHT);
    }
    wrapper.unmount();
  });

  it('muted: the panel links are quiet too, and an entry without a destination never lights up', async () => {
    const wrapper = mount({ variant: 'muted', modelValue: 0 });
    const links = [...panel(wrapper, 0).querySelectorAll<HTMLElement>('[data-part="panelLink"]')];
    for (const link of links.filter((el) => el.tagName === 'A')) {
      expect([...link.classList]).toEqual(
        expect.arrayContaining([
          'eldra:text-muted',
          'eldra:hover:text-text',
          'eldra:aria-[current=page]:text-text',
        ])
      );
    }
    const glass = links.find((el) => el.tagName === 'SPAN')!;
    expect([...glass.classList]).toContain('eldra:text-muted');
    expect([...glass.classList]).not.toContain('eldra:hover:text-text');

    await wrapper.setProps({ modelValue: 1 });
    const overview = wrapper.get('[data-part="overview"]').classes();
    expect(overview).toEqual(expect.arrayContaining(['eldra:text-muted', 'eldra:hover:text-text']));

    for (const token of [
      ...partClasses(panel(wrapper, 0), 'panelLink'),
      ...partClasses(panel(wrapper, 1), 'panelLink'),
      ...overview,
    ]) {
      expect(token).not.toMatch(/^eldra:hover:bg-/);
      expect(token).not.toMatch(STATE_WEIGHT);
    }
    wrapper.unmount();
  });

  it('leaves the drawer rows as they are under either variant', async () => {
    const drawerClasses = async (variant: 'ghost' | 'muted'): Promise<string[]> => {
      const wrapper = mount({ variant, drawerOpen: true });
      await nextTick();
      const dialog = wrapper.get('dialog').element;
      const classes = ['drawerLink', 'drawerPanelLink', 'drawerOverview'].map((part) =>
        partClasses(dialog, part).join(' ')
      );
      wrapper.unmount();
      return classes;
    };
    const muted = await drawerClasses('muted');
    expect(muted.every((classes) => classes !== '')).toBe(true);
    expect(muted).toEqual(await drawerClasses('ghost'));
  });

  it('appends a class to what the variant sets', () => {
    const wrapper = mount({ variant: 'muted', classes: { link: 'text-primary' } });
    const link = wrapper.get('[data-part="link"]').classes();
    expect(link).toContain('text-primary');
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
  it('has no axe violations with the drawer open in either layout, with a header and other entries', async () => {
    const drawerHeader = () => [
      h('a', { href: '/' }, 'Home'),
      h('a', { href: '/contact' }, 'Contact us'),
    ];
    const drawerItems: NavMenuItem[] = [
      { label: 'Areas', children: [{ label: 'Sales', href: '/sales' }] },
      { label: 'Contact', href: '/contact' },
    ];
    for (const drawerLayout of ['accordion', 'sections']) {
      for (const items of [undefined, drawerItems]) {
        const wrapper = mount(
          { drawerOpen: true, drawerLayout, ...(items ? { drawerItems: items } : {}) },
          { drawerHeader }
        );
        await nextTick();
        expect(await axe(wrapper.get('dialog').element), drawerLayout).toHaveNoViolations();
        wrapper.unmount();
      }
    }
  });

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

describe('NavMenu — sections', () => {
  const sectioned: NavMenuItem[] = [
    {
      label: 'Shop',
      sections: [
        {
          heading: 'Knitwear',
          headingLink: { label: 'Knitwear', href: '/knitwear' },
          links: [{ label: 'Sweaters', href: '/sweaters' }],
          seeAll: { label: 'See all knitwear', href: '/knitwear' },
        },
        { heading: 'Knitwear', links: [{ label: 'Hats', href: '/hats' }] },
      ],
    },
  ];

  it('draws one labelled column per section, a linked heading and a see-all entry last', async () => {
    const wrapper = mount({ items: sectioned, modelValue: 0 });
    await nextTick();
    const columns = panel(wrapper, 0).querySelectorAll('[data-part="group"]');
    expect(columns).toHaveLength(2);
    expect(columns[0]!.querySelector('[data-part="groupLink"]')!.getAttribute('href')).toBe(
      '/knitwear'
    );
    const entries = [...columns[0]!.querySelectorAll('[data-part="panelLink"]')];
    expect(entries.map((entry) => entry.textContent!.trim())).toEqual([
      'Sweaters',
      'See all knitwear',
    ]);
    expect(entries[1]!.hasAttribute('data-see-all')).toBe(true);
    expect(columns[1]!.querySelector('[data-part="groupLink"]')).toBeNull();
    wrapper.unmount();
  });

  it('draws a section with only a heading link under that link as its heading', async () => {
    const items: NavMenuItem[] = [
      {
        label: 'Shop',
        sections: [
          { headingLink: { label: 'Mugs', href: '/mugs' }, links: [{ label: 'Tall', href: '/t' }] },
        ],
      },
    ];
    const wrapper = mount({ items, modelValue: 0 });
    await nextTick();
    const link = panel(wrapper, 0).querySelector(
      '[data-part="groupHeading"] [data-part="groupLink"]'
    )!;
    expect(link.textContent!.trim()).toBe('Mugs');
    expect(link.getAttribute('href')).toBe('/mugs');
    wrapper.unmount();
  });

  it('gives the panelItem slot isSeeAll for the see-all entry only', async () => {
    const seen: Array<[string, boolean | undefined]> = [];
    const wrapper = mount(
      { items: sectioned, modelValue: 0 },
      {
        panelItem: ({ link, isSeeAll }: { link: { label: string | null }; isSeeAll?: boolean }) => {
          seen.push([link.label ?? '', isSeeAll]);
          return h('span', link.label ?? '');
        },
      }
    );
    await nextTick();
    expect(seen).toContainEqual(['Sweaters', false]);
    expect(seen).toContainEqual(['See all knitwear', true]);
    wrapper.unmount();
  });

  it('hands a resolved card to the panelItem slot, which replaces the card the panel draws', async () => {
    const items = [
      {
        label: 'Shop',
        children: [
          {
            label: 'Mug',
            href: '/mug',
            display: 'card' as const,
            card: { image: '/mug.jpg', title: 'Mug', price: 28 },
          },
        ],
      },
    ];
    const seen: unknown[] = [];
    const wrapper = mount(
      { items, modelValue: 0 },
      {
        panelItem: ({ link }: { link: { card?: unknown } }) => {
          seen.push(link.card);
          return h('span', 'x');
        },
      }
    );
    await nextTick();
    expect(seen).toContainEqual({ image: '/mug.jpg', title: 'Mug', price: 28 });
    wrapper.unmount();
  });

  it('draws a link whose card did not resolve as a plain link', async () => {
    const items = [
      {
        label: 'Shop',
        children: [{ label: 'Mug', href: '/mug', display: 'card' as const }],
      },
    ];
    const plain = mount({ items, modelValue: 0 });
    await nextTick();
    const link = plain.element.querySelector('[data-part="panelLink"]')!;
    expect(link.getAttribute('href')).toBe('/mug');
    expect(link.querySelector('img')).toBeNull();
    plain.unmount();
  });

  it('draws a card with its picture cropped to the aspect, its title and its price', async () => {
    const wrapper = mount(
      { items: CARDS, modelValue: 0, cardAspect: '4:5' },
      {},
      { [CURRENCY_KEY as symbol]: 'ISK', [LOCALE_KEY as symbol]: 'is-IS' }
    );
    await nextTick();
    const cards = [...panel(wrapper, 0).querySelectorAll('[data-part="card"]')];
    expect(cards).toHaveLength(2);
    const img = cards[0]!.querySelector('img')!;
    // The title beside it names the link; a copy as `alt` would be read twice (axe image-redundant-alt).
    expect(img.getAttribute('alt')).toBe('');
    expect(cards[0]!.closest('a')!.textContent).toContain('Tall mug');
    expect(img.getAttribute('src')).toBe('/tall.jpg');
    // Through a variable the picture's own class reads, so a theme's class can still replace it.
    expect(img.style.getPropertyValue('--eldra-nav-menu-card-aspect')).toBe('4 / 5');
    expect(img.className).toContain('eldra:aspect-(--eldra-nav-menu-card-aspect)');
    expect(img.style.aspectRatio).toBe('');
    expect(cards[0]!.querySelector('[data-part="cardTitle"]')!.textContent).toBe('Tall mug');
    expect(cards[0]!.querySelector('[data-part="cardPrice"]')!.textContent).toBe(
      formatPrice(2800, 'ISK', 'is-IS')
    );
    // A collection card has no price line.
    expect(cards[1]!.querySelector('[data-part="cardPrice"]')).toBeNull();
    expect(cards[0]!.closest('a')!.getAttribute('href')).toBe('/tall');
    wrapper.unmount();
  });

  it('lays cards in two columns beside a text column, and a plain entry takes a whole row', async () => {
    const wrapper = mount({ items: CARDS, modelValue: 0 });
    await nextTick();
    const lists = [...panel(wrapper, 0).querySelectorAll('[data-part="panelList"]')];
    expect(lists[0]!.className).not.toContain('grid-cols-2');
    expect(lists[1]!.className).toContain('eldra:grid-cols-2');
    const items = [...lists[1]!.querySelectorAll('[data-part="panelItem"]')];
    expect(items.map((i) => i.className.includes('col-span-2'))).toEqual([false, false, true]);
    wrapper.unmount();
  });

  it('crops to 4:3 when the aspect is missing or malformed, and prints a bare number with no currency', async () => {
    for (const cardAspect of [undefined, 'wide', '0:3']) {
      const wrapper = mount({ items: CARDS, modelValue: 0, cardAspect });
      await nextTick();
      const img = panel(wrapper, 0).querySelector('img')!;
      expect(img.style.getPropertyValue('--eldra-nav-menu-card-aspect')).toBe('4 / 3');
      expect(panel(wrapper, 0).querySelector('[data-part="cardPrice"]')!.textContent).toBe('2,800');
      wrapper.unmount();
    }
  });

  it('starts the heading link, the cards and the plain links of a cards column at the same edge', async () => {
    const items: NavMenuItem[] = [
      {
        label: 'Shop',
        sections: [
          {
            heading: 'Featured',
            headingLink: { label: 'Featured', href: '/featured' },
            links: [
              {
                label: 'Tall mug',
                href: '/tall',
                display: 'card',
                card: { image: '/tall.jpg', title: 'Tall mug' },
              },
              { label: 'Glaze guide', href: '/glaze' },
            ],
            seeAll: { label: 'See all featured', href: '/all' },
          },
          { heading: 'Care', links: [{ label: 'Care guides', href: '/care' }] },
        ],
      },
    ];
    const wrapper = mount({ items, modelValue: 0 });
    await nextTick();
    const [cards, plain] = [...panel(wrapper, 0).querySelectorAll('[data-part="group"]')];
    expect(cards!.hasAttribute('data-cards')).toBe(true);
    expect(plain!.hasAttribute('data-cards')).toBe(false);
    expect(
      panel(wrapper, 0).querySelector('[data-part="columns"]')!.hasAttribute('data-cards')
    ).toBe(true);
    const edge = (element: Element | null) => element!.className.includes('eldra:px-3');
    expect(edge(cards!.querySelector('[data-part="groupHeading"]'))).toBe(false);
    for (const link of cards!.querySelectorAll('[data-part="panelLink"]')) {
      expect(edge(link)).toBe(false);
    }
    expect(cards!.querySelector('[data-see-all]')).not.toBeNull();
    expect(cards!.querySelector('[data-part="groupLink"]')!.getAttribute('href')).toBe('/featured');
    // A column without cards keeps its indent, heading and links alike.
    expect(edge(plain!.querySelector('[data-part="groupHeading"]'))).toBe(true);
    expect(edge(plain!.querySelector('[data-part="panelLink"]'))).toBe(true);
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('draws the cards in the drawer under drawer part names', async () => {
    const wrapper = mount({ items: CARDS, drawerOpen: true, drawerLayout: 'sections' });
    await nextTick();
    const dialog = wrapper.get('dialog').element as HTMLDialogElement;
    expect(dialog.querySelectorAll('[data-part="drawerCard"] img')).toHaveLength(2);
    expect(dialog.querySelector('[data-part="drawerCardPrice"]')).not.toBeNull();
    expect(await axe(dialog)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('has no axe violations on an open panel with cards', async () => {
    const wrapper = mount({ items: CARDS, modelValue: 0 });
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('draws sections in the drawer, in both layouts, with no axe violations', async () => {
    for (const drawerLayout of ['accordion', 'sections']) {
      const wrapper = mount({ items: sectioned, drawerOpen: true, drawerLayout });
      await nextTick();
      const dialog = wrapper.get('dialog').element as HTMLDialogElement;
      if (drawerLayout === 'accordion') dialog.querySelector('details')!.open = true;
      const headings = [...dialog.querySelectorAll('[data-part="drawerGroupHeading"]')];
      expect(headings.map((h) => h.textContent!.trim())).toEqual(['Knitwear', 'Knitwear']);
      expect(dialog.querySelector('[data-part="drawerGroupLink"]')!.getAttribute('href')).toBe(
        '/knitwear'
      );
      expect(dialog.querySelector('[data-see-all]')!.textContent).toContain('See all knitwear');
      expect(await axe(dialog)).toHaveNoViolations();
      wrapper.unmount();
    }
  });

  it('has no axe violations on an open sectioned panel', async () => {
    const wrapper = mount({ items: sectioned, modelValue: 0 });
    await nextTick();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});

describe('NavMenu — panel layout and tone', () => {
  it('names each panel and its content by layout, so a theme can style a dropdown apart', async () => {
    const items: NavMenuItem[] = [
      ITEMS[0]!,
      { label: 'Journal', layout: 'dropdown', children: [{ label: 'Care', href: '/care' }] },
    ];
    const wrapper = mount({ items, modelValue: 0 });
    await nextTick();
    expect(panel(wrapper, 0).dataset.layout).toBe('mega');
    expect(
      panel(wrapper, 0).querySelector('[data-part="content"]')!.getAttribute('data-layout')
    ).toBe('mega');
    expect(panel(wrapper, 1).dataset.layout).toBe('dropdown');
    expect(
      panel(wrapper, 1).querySelector('[data-part="content"]')!.getAttribute('data-layout')
    ).toBe('dropdown');
    wrapper.unmount();
  });

  /**
   * WS-1277: a mega sheet played the popover entrance, which grows from the top-left corner; on a
   * sheet as wide as the window that read as the whole sheet sliding in from the left, and on a
   * dropdown much the same. Every panel shows its top at once and unrolls the rest instead.
   */
  /**
   * WS-1277: a page that is both its own entry ("Ceramics") and a link inside another entry's panel
   * ("Shop") marked both entries, which reads as two places at once.
   */
  it('marks one entry as current: the one whose own link is the page, else the first holding it', async () => {
    const shop: NavMenuItem = {
      label: 'Shop',
      children: [
        { label: 'Ceramics', href: '/ceramics', current: true },
        { label: 'Knitwear', href: '/knitwear' },
      ],
    };
    const marked = async (items: NavMenuItem[]) => {
      const wrapper = mount({ items });
      await nextTick();
      // One entry per element: a marked trigger carries both `data-current` and `aria-current`.
      const elements = new Set([
        ...wrapper.findAll('[data-part="trigger"][data-current]').map((el) => el.element),
        ...wrapper
          .findAll('[aria-current="page"]')
          .filter((el) => !el.element.closest('[data-part="panel"]'))
          .map((el) => el.element),
      ]);
      const labels = [...elements].map((el) => el.textContent!.trim());
      wrapper.unmount();
      return labels;
    };
    // Its own entry wins, whether it is a dropdown of its own or a plain link.
    expect(
      await marked([
        shop,
        {
          label: 'Ceramics',
          href: '/ceramics',
          current: true,
          children: [{ label: 'Mugs', href: '/mugs' }],
        },
      ])
    ).toEqual(['Ceramics']);
    expect(await marked([shop, { label: 'Ceramics', href: '/ceramics', current: true }])).toEqual([
      'Ceramics',
    ]);
    // Held only inside panels: the first entry holding it.
    expect(
      await marked([
        shop,
        { label: 'More', children: [{ label: 'Ceramics', href: '/ceramics', current: true }] },
      ])
    ).toEqual(['Shop']);
  });

  it('opens every panel from the bar, a mega sheet and a dropdown alike', async () => {
    const items: NavMenuItem[] = [
      ITEMS[0]!,
      { label: 'Journal', layout: 'dropdown', children: [{ label: 'Care', href: '/care' }] },
    ];
    const wrapper = mount({ items, modelValue: 0 });
    await nextTick();
    const content = (index: number) =>
      panel(wrapper, index).querySelector('[data-part="content"]')!.className.split(' ');
    expect(content(0)).toContain('eldra:animate-eldra-menu-in');
    expect(content(0)).not.toContain('eldra:animate-eldra-popover-in');
    expect(content(1)).toContain('eldra:animate-eldra-menu-in');
    expect(content(1)).not.toContain('eldra:animate-eldra-popover-in');
    wrapper.unmount();
  });

  it('draws an accent entry in the accent colour, in the bar and in the drawer', async () => {
    const items: NavMenuItem[] = [
      { label: 'About', href: '/about' },
      { label: 'Sale', href: '/sale', tone: 'accent' },
    ];
    const wrapper = mount({ items, drawerOpen: true });
    await nextTick();
    const [about, sale] = wrapper.findAll('[data-part="link"]');
    expect(sale!.attributes('data-tone')).toBe('accent');
    expect(sale!.classes()).toContain('eldra:text-accent');
    // One colour per element: the accent replaces the entry's own text colour.
    expect(sale!.classes()).not.toContain('eldra:text-text');
    expect(about!.classes()).toContain('eldra:text-text');
    expect(about!.attributes('data-tone')).toBeUndefined();
    const drawerSale = wrapper.findAll('dialog [data-part="drawerLink"]')[1]!;
    expect(drawerSale.attributes('data-tone')).toBe('accent');
    expect(drawerSale.classes()).toContain('eldra:text-accent');
    expect(drawerSale.classes()).not.toContain('eldra:text-text');
    wrapper.unmount();
  });
});

describe('NavMenu — inline drawer', () => {
  function mountInline(
    props: Record<string, unknown> = {},
    slots: Record<string, unknown> = {}
  ): Wrapper {
    return mountWith(NavMenu, {
      props: { items: ITEMS, drawerMode: 'inline', ...props },
      slots: slots as never,
      attachTo: document.body,
      // The real `Transition`, which renders no element of its own, so the drawer keeps its place
      // in the tab order (the default stub wraps it).
      global: { stubs: { transition: false } },
    }) as Wrapper;
  }
  const inlineDrawer = (wrapper: Wrapper): HTMLElement =>
    wrapper.get('[data-part="drawer"]').element as HTMLElement;

  it('is a disclosure under the bar, not a dialog', async () => {
    // `always`: jsdom applies no stylesheet, so the bar's own `nav` (hidden by its breakpoint class
    // in a browser whenever the menu button shows) would read as a second "Main" landmark.
    const wrapper = mountInline(
      { collapseBelow: 'always' },
      { drawerFooter: () => h('a', { href: '/contact' }, 'Contact') }
    );
    expect(wrapper.find('dialog').exists()).toBe(false);
    const toggle = wrapper.get('[data-part="toggle"]');
    const drawer = inlineDrawer(wrapper);
    expect(toggle.attributes('aria-haspopup')).toBeUndefined();
    expect(toggle.attributes('aria-controls')).toBe(drawer.id);
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(drawer.style.display).toBe('none');
    for (const token of [
      'eldra:absolute',
      'eldra:top-full',
      'eldra:inset-x-0',
      'eldra:overflow-y-auto',
    ]) {
      expect(drawer.className).toContain(token);
    }

    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('true');
    expect(drawer.style.display).toBe('');
    expect(drawer.querySelector('nav')!.getAttribute('aria-label')).toBe('Main');
    expect(drawer.querySelectorAll('details')).toHaveLength(2);
    expect(drawer.querySelector('[data-part="drawerFooter"]')!.textContent).toContain('Contact');
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('keeps its foot at the bottom of the window, above the safe area', () => {
    const wrapper = mountInline(
      {},
      { drawerFooter: () => h('a', { href: '/contact' }, 'Contact') }
    );
    const drawer = inlineDrawer(wrapper);
    expect(drawer.className).toContain(
      'eldra:h-[calc(100dvh-var(--eldra-nav-menu-drawer-top,0px))]'
    );
    expect(drawer.className).toContain('eldra:flex-col');
    const foot = drawer.querySelector('[data-part="drawerFooter"]')!.className.split(' ');
    expect(foot).toContain('eldra:mt-auto');
    expect(foot).toContain('eldra:shrink-0');
    expect(foot).toContain('eldra:eldra-drawer-footer-bottom');
    expect(drawer.querySelector('[data-part="drawerBody"]')!.className).toContain('eldra:shrink-0');
    wrapper.unmount();
  });

  it('turns its button into Close while open, and the button closes it again', async () => {
    const wrapper = mountInline();
    const toggle = wrapper.get('[data-part="toggle"]');
    expect(toggle.attributes('aria-label')).toBe('Menu');
    await toggle.trigger('click');
    // The visible label changes to Close, so the name does too (2.5.3).
    expect(toggle.attributes('aria-label')).toBe('Close');
    expect(toggle.find('path[d="M18 6l-12 12"]').exists()).toBe(true);
    await toggle.trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(toggle.attributes('aria-label')).toBe('Menu');
    expect(wrapper.emitted('update:drawerOpen')).toEqual([[true], [false]]);
    wrapper.unmount();
  });

  it('hands the toggle slot its open state', async () => {
    const wrapper = mountInline(
      {},
      { toggle: ({ open }: { open: boolean }) => (open ? 'Close' : 'Menu') }
    );
    const toggle = wrapper.get('[data-part="toggle"]');
    expect(toggle.text()).toBe('Menu');
    await toggle.trigger('click');
    expect(toggle.text()).toBe('Close');
    wrapper.unmount();
  });

  it('closes on Escape and puts focus back on its button', async () => {
    const wrapper = mountInline();
    const toggle = wrapper.get('[data-part="toggle"]');
    await toggle.trigger('click');
    const link = inlineDrawer(wrapper).querySelector<HTMLElement>('[data-part="drawerLink"]')!;
    link.focus();
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle.element);
    wrapper.unmount();
  });

  it('follows its button in the tab order, and closes once focus leaves it', async () => {
    const wrapper = mountWith(
      defineComponent({
        render: () =>
          h('div', [
            h(NavMenu, { items: ITEMS, drawerMode: 'inline' }),
            h('a', { id: 'after', href: '/after' }, 'After'),
          ]),
      }),
      { attachTo: document.body, global: { stubs: { transition: false } } }
    );
    const toggle = wrapper.get('[data-part="toggle"]');
    await toggle.trigger('click');
    const drawer = wrapper.get('[data-part="drawer"]').element;
    // A disclosure's content comes right after its button.
    expect(toggle.element.nextElementSibling).toBe(drawer);
    const last = [...drawer.querySelectorAll<HTMLElement>('a, summary')].at(-1)!;
    last.focus();
    const after = document.getElementById('after')!;
    last.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: after }));
    after.focus();
    await nextTick();
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(after);
    wrapper.unmount();
  });

  it('closes when a pointer presses outside it, and when one of its links is followed', async () => {
    const wrapper = mountInline({ drawerOpen: true });
    await nextTick();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(wrapper.emitted('update:drawerOpen')?.at(-1)).toEqual([false]);

    const followed = mountInline({ drawerOpen: true });
    await nextTick();
    const link = inlineDrawer(followed).querySelector<HTMLAnchorElement>(
      '[data-part="drawerLink"]'
    )!;
    link.addEventListener('click', (event) => event.preventDefault());
    link.click();
    expect(followed.emitted('update:drawerOpen')?.at(-1)).toEqual([false]);
    wrapper.unmount();
    followed.unmount();
  });

  it('lists panels as sections in the sections layout, and restyles through the drawer parts', async () => {
    const wrapper = mountInline({
      drawerOpen: true,
      collapseBelow: 'always',
      drawerLayout: 'sections',
      classes: { drawer: 'inline-sheet', drawerBody: 'inline-body', drawerLink: 'inline-row' },
    });
    await nextTick();
    const drawer = inlineDrawer(wrapper);
    expect(drawer.className).toContain('inline-sheet');
    expect(drawer.querySelector('[data-part="drawerBody"]')!.className).toContain('inline-body');
    expect(drawer.querySelectorAll('[data-part="drawerSectionHeading"]')).toHaveLength(2);
    expect(drawer.querySelector('[data-part="drawerLink"]')!.className).toContain('inline-row');
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('fills the window below its own top edge', async () => {
    const wrapper = mountInline();
    const drawer = inlineDrawer(wrapper);
    // Its own box is shifted 4px up by its entrance while it is measured; the layout position (its
    // positioning box's top plus its offset) is what counts, so it is not left 4px too tall.
    drawer.getBoundingClientRect = () => ({ top: 92 }) as DOMRect;
    const box = document.createElement('div');
    box.getBoundingClientRect = () => ({ top: 24 }) as DOMRect;
    Object.defineProperty(drawer, 'offsetParent', { configurable: true, get: () => box });
    Object.defineProperty(drawer, 'offsetTop', { configurable: true, get: () => 72 });
    await wrapper.get('[data-part="toggle"]').trigger('click');
    await nextTick();
    expect(drawer.style.getPropertyValue('--eldra-nav-menu-drawer-top')).toBe('96px');
    expect(drawer.className).toContain(
      'eldra:h-[calc(100dvh-var(--eldra-nav-menu-drawer-top,0px))]'
    );
    wrapper.unmount();
  });

  it('keeps the sheet as the default', () => {
    const wrapper = mount();
    expect(wrapper.find('dialog').exists()).toBe(true);
    expect(wrapper.find('[data-part="drawer"]').exists()).toBe(false);
    expect(wrapper.get('[data-part="toggle"]').attributes('aria-haspopup')).toBe('dialog');
    wrapper.unmount();
  });
});
