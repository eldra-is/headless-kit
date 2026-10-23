import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import type { IconSize } from '../../icon/types';
import * as registry from '../registry';
import { preloadTablerIcons } from '../registry';
import * as data from '../tablerIconData';
import TablerIcon from '../TablerIcon.vue';

afterEach(() => {
  vi.restoreAllMocks();
});

/** An icon's paths as the DOM serialises them once drawn. */
async function paths(name: string): Promise<string> {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.innerHTML = (await data.tablerIconBody(name)) ?? '';
  return svg.innerHTML;
}

async function drawn(element: Element, name: string): Promise<void> {
  const expected = await paths(name);
  await vi.waitFor(() => expect(element.innerHTML).toBe(expected));
}

function quietWarnings() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {});
}

describe('TablerIcon', () => {
  it('draws the icon Studio stores by export name', async () => {
    const wrapper = mountWith(TablerIcon, { props: { name: 'IconCashRegister' } });
    expect(wrapper.element.tagName.toLowerCase()).toBe('svg');
    await drawn(wrapper.element, 'IconCashRegister');
    wrapper.unmount();
  });

  it("draws the same icon from Tabler's kebab-case name", async () => {
    const wrapper = mountWith(TablerIcon, { props: { name: 'file-invoice' } });
    await drawn(wrapper.element, 'IconFileInvoice');
    wrapper.unmount();
  });

  it('draws a name carrying Studio preview stega', async () => {
    const wrapper = mountWith(TablerIcon, { props: { name: 'calendar﻿​‌﻿' } });
    await drawn(wrapper.element, 'IconCalendar');
    wrapper.unmount();
  });

  it('strokes an outline icon in the current colour at the spec weight', () => {
    const wrapper = mountWith(TablerIcon, { props: { name: 'IconCalendar' } });
    expect(wrapper.attributes()).toMatchObject({
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.75',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      viewBox: '0 0 24 24',
      width: '24',
      height: '24',
    });
    wrapper.unmount();
  });

  it('takes its own stroke width', () => {
    const wrapper = mountWith(TablerIcon, { props: { name: 'IconCalendar', strokeWidth: 2.4 } });
    expect(wrapper.attributes('stroke-width')).toBe('2.4');
    wrapper.unmount();
  });

  it('fills a filled icon and draws no stroke', async () => {
    const wrapper = mountWith(TablerIcon, { props: { name: 'heart-filled' } });
    expect(wrapper.attributes()).toMatchObject({ fill: 'currentColor', stroke: 'none' });
    expect(wrapper.attributes('stroke-width')).toBeUndefined();
    await drawn(wrapper.element, 'IconHeartFilled');
    wrapper.unmount();
  });

  it.each([
    ['sm', 'size-4'],
    ['md', 'size-5'],
    ['lg', 'size-6'],
    ['xl', 'size-8'],
  ] as Array<[IconSize, string]>)("renders Icon's size %s as %s", (size, expected) => {
    const wrapper = mountWith(TablerIcon, { props: { name: 'IconCalendar', size } });
    expect(wrapper.classes()).toEqual(expect.arrayContaining([expected, 'shrink-0']));
    wrapper.unmount();
  });

  it('defaults to the medium size and marks its root part', () => {
    const wrapper = mountWith(TablerIcon, { props: { name: 'IconCalendar' } });
    expect(wrapper.classes()).toContain('size-5');
    expect(wrapper.attributes('data-part')).toBe('root');
    wrapper.unmount();
  });

  it('lets classes.root replace a conflicting utility', () => {
    const wrapper = mountWith(TablerIcon, {
      props: { name: 'IconCalendar', classes: { root: 'size-12 text-accent' } },
    });
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['size-12', 'text-accent']));
    expect(wrapper.classes()).not.toContain('size-5');
    wrapper.unmount();
  });

  it('is decorative by default and never a tab stop', async () => {
    const wrapper = mountWith(TablerIcon, { props: { name: 'IconCalendar' } });
    await drawn(wrapper.element, 'IconCalendar');
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.attributes('role')).toBeUndefined();
    expect(wrapper.attributes('focusable')).toBe('false');
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('becomes an image with an accessible name when labelled', async () => {
    const wrapper = mountWith(TablerIcon, { props: { name: 'IconCalendar', label: 'Bookings' } });
    await drawn(wrapper.element, 'IconCalendar');
    expect(wrapper.attributes()).toMatchObject({ role: 'img', 'aria-label': 'Bookings' });
    expect(wrapper.attributes('aria-hidden')).toBeUndefined();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });

  it('renders in a narrow container', () => {
    const wrapper = mountNarrow(TablerIcon, { props: { name: 'IconCalendar', size: 'xl' } });
    expect(wrapper.classes()).toContain('size-8');
    wrapper.unmount();
  });

  it('keeps an empty box, warning once, for a name Tabler does not have', async () => {
    const warn = quietWarnings();
    const first = mountWith(TablerIcon, { props: { name: 'IconNoSuchThing' } });
    const second = mountWith(TablerIcon, { props: { name: 'no-such-thing' } });
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    await flushPromises();
    expect(first.element.tagName.toLowerCase()).toBe('svg');
    expect(first.element.innerHTML).toBe('');
    expect(second.element.innerHTML).toBe('');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('IconNoSuchThing');
    first.unmount();
    second.unmount();
  });

  it('renders nothing for an empty name', () => {
    const warn = quietWarnings();
    for (const name of [undefined, null, '', '  ', '﻿​﻿']) {
      const wrapper = mountWith(TablerIcon, { props: { name } });
      expect(wrapper.find('svg').exists()).toBe(false);
      wrapper.unmount();
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('renders nothing, warning once, for a value that is not an icon name', () => {
    const warn = quietWarnings();
    const wrapper = mountWith(TablerIcon, { props: { name: 'Cash Register' } });
    const again = mountWith(TablerIcon, { props: { name: 'Cash Register' } });
    expect(wrapper.find('svg').exists()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    again.unmount();
  });

  it('never throws when an icon fails to load, and tries again on the next mount', async () => {
    const warn = quietWarnings();
    const failing = vi.spyOn(data, 'tablerIconBody').mockRejectedValueOnce(new Error('offline'));
    const wrapper = mountWith(TablerIcon, { props: { name: 'IconCloudOff' } });
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(wrapper.element.innerHTML).toBe('');
    failing.mockRestore();

    const retry = mountWith(TablerIcon, { props: { name: 'IconCloudOff' } });
    await drawn(retry.element, 'IconCloudOff');
    wrapper.unmount();
    retry.unmount();
  });

  it('swaps to the new icon when the name changes', async () => {
    const wrapper = mountWith(TablerIcon, { props: { name: 'IconTruck' } });
    await drawn(wrapper.element, 'IconTruck');
    await wrapper.setProps({ name: 'IconPackage' });
    await drawn(wrapper.element, 'IconPackage');
    wrapper.unmount();
  });

  it('ends on the last name when an earlier one loads later', async () => {
    let release: () => void = () => {};
    const real = data.tablerIconBody;
    vi.spyOn(data, 'tablerIconBody').mockImplementation(async (name) => {
      if (name === 'IconTruckDelivery') await new Promise<void>((resolve) => (release = resolve));
      return real(name);
    });
    const wrapper = mountWith(TablerIcon, { props: { name: 'IconTruckDelivery' } });
    await wrapper.setProps({ name: 'IconRocket' });
    await drawn(wrapper.element, 'IconRocket');
    release();
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(wrapper.element.innerHTML).toBe(await paths('IconRocket'));
    wrapper.unmount();
  });

  it('preloads one name given as a string, not its characters', async () => {
    const warn = quietWarnings();
    await preloadTablerIcons('lamp');
    expect(warn).not.toHaveBeenCalled();
    const lamp = mountWith(TablerIcon, { props: { name: 'IconLamp' } });
    expect(lamp.element.innerHTML).toBe(await paths('IconLamp'));
    lamp.unmount();
  });

  it('draws a preloaded icon in its first render', async () => {
    await preloadTablerIcons(['IconSofa', 'armchair', null, 'not a name']);
    const sofa = mountWith(TablerIcon, { props: { name: 'sofa' } });
    const armchair = mountWith(TablerIcon, { props: { name: 'IconArmchair' } });
    expect(sofa.element.innerHTML).toBe(await paths('IconSofa'));
    expect(armchair.element.innerHTML).toBe(await paths('IconArmchair'));
    sofa.unmount();
    armchair.unmount();
  });
});

describe('TablerIcon — server rendering', () => {
  const app = (name: string) => createSSRApp({ render: () => h(TablerIcon, { name }) });

  /** Server-renders `serverName`, then hydrates `clientName` in a browser that has loaded nothing. */
  async function hydrate(serverName: string, clientName = serverName) {
    const html = await renderToString(app(serverName));
    vi.spyOn(registry, 'cachedTablerIcon').mockReturnValue(undefined);
    const load = vi.spyOn(registry, 'loadTablerIcon');
    const warn = quietWarnings();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    const svg = () => container.querySelector('svg')!;
    const serverPaths = svg().innerHTML;
    app(clientName).mount(container);
    const pathsAtHydration = svg().innerHTML;
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const logged = [...warn.mock.calls, ...error.mock.calls].map(([message]) => String(message));
    return { container, svg, serverPaths, pathsAtHydration, load, logged };
  }

  it('puts the icon in the server HTML, stamped with its name', async () => {
    const html = await renderToString(app('IconBuildingBank'));
    expect(html).toContain(`>${await data.tablerIconBody('IconBuildingBank')}</svg>`);
    expect(html).toContain('data-tabler-icon="IconBuildingBank"');
  });

  it('renders an empty box rather than failing for an unknown name', async () => {
    quietWarnings();
    const html = await renderToString(app('IconNotOnTheServer'));
    expect(html).toMatch(/^<svg[^>]*><\/svg>$/);
  });

  it('hydrates the server icon as drawn and loads nothing', async () => {
    const { container, svg, serverPaths, pathsAtHydration, load, logged } =
      await hydrate('IconBuildingWarehouse');
    expect(serverPaths).toBe(await paths('IconBuildingWarehouse'));
    expect(pathsAtHydration).toBe(serverPaths);
    expect(svg().innerHTML).toBe(serverPaths);
    expect(load).not.toHaveBeenCalled();
    expect(logged.filter((message) => /hydration/i.test(message))).toEqual([]);
    container.remove();
  });

  it('hydrates an unknown name as the empty box the server drew, loading nothing', async () => {
    const { container, svg, load } = await hydrate('IconNotInTabler');
    expect(svg().innerHTML).toBe('');
    expect(load).not.toHaveBeenCalled();
    container.remove();
  });

  it('draws the client’s icon when the client renders another name than the server', async () => {
    const { container, svg, load } = await hydrate('IconSun', 'IconMoon');
    expect(load).toHaveBeenCalledWith('IconMoon');
    expect(svg().innerHTML).toBe(await paths('IconMoon'));
    expect(svg().getAttribute('data-tabler-icon')).toBe('IconMoon');
    container.remove();
  });

  it('loads in the browser an icon the server failed to load', async () => {
    quietWarnings();
    vi.spyOn(data, 'tablerIconBody').mockRejectedValueOnce(new Error('offline'));
    const html = await renderToString(app('IconCloudRain'));
    expect(html).not.toContain('data-tabler-icon');
    vi.restoreAllMocks();

    vi.spyOn(registry, 'cachedTablerIcon').mockReturnValue(undefined);
    quietWarnings();
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    app('IconCloudRain').mount(container);
    await drawn(container.querySelector('svg')!, 'IconCloudRain');
    container.remove();
  });
});
