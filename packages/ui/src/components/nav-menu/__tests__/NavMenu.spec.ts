import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
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

describe('NavMenu — hover', () => {
  it('opens for a resting mouse and closes when it leaves the menu', async () => {
    const wrapper = mount({ openOnHover: true });
    const [shop] = triggers(wrapper);
    pointer(shop!, 'pointerenter');
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    pointer(wrapper.get('[data-part="root"]').element, 'pointerleave');
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('ignores touch, and stays off unless asked for', async () => {
    const touch = mount({ openOnHover: true });
    pointer(triggers(touch)[0]!, 'pointerenter', 'touch');
    await nextTick();
    expect(triggers(touch)[0]!.getAttribute('aria-expanded')).toBe('false');
    touch.unmount();
    const off = mount();
    pointer(triggers(off)[0]!, 'pointerenter');
    await nextTick();
    expect(triggers(off)[0]!.getAttribute('aria-expanded')).toBe('false');
    off.unmount();
  });

  it('keeps a hover-opened panel open when it is clicked, then leaving does not close it', async () => {
    const wrapper = mount({ openOnHover: true });
    const [shop] = triggers(wrapper);
    pointer(shop!, 'pointerenter');
    await nextTick();
    shop!.click();
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    pointer(wrapper.get('[data-part="root"]').element, 'pointerleave');
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    wrapper.unmount();
  });

  it('keeps a hover-opened panel open while keyboard focus is inside it', async () => {
    const wrapper = mount({ openOnHover: true });
    const [shop] = triggers(wrapper);
    pointer(shop!, 'pointerenter');
    await nextTick();
    panel(wrapper, 0).querySelector('a')!.focus();
    pointer(wrapper.get('[data-part="root"]').element, 'pointerleave');
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
    wrapper.unmount();
  });

  it('does not close a clicked-open panel when the pointer leaves', async () => {
    const wrapper = mount({ openOnHover: true });
    const [shop] = triggers(wrapper);
    shop!.click();
    await nextTick();
    pointer(wrapper.get('[data-part="root"]').element, 'pointerleave');
    await nextTick();
    expect(shop!.getAttribute('aria-expanded')).toBe('true');
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
