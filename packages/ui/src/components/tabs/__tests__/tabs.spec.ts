import { defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import type { VueWrapper } from '@vue/test-utils';
import { axe } from '../../../test/axe';
import { mountNarrow, mountWith } from '../../../test/mount';
import Tab from '../Tab.vue';
import TabPanel from '../TabPanel.vue';
import Tabs from '../Tabs.vue';
import { TABS_KEY } from '../context';
import type { TabsItem } from '../types';

/** The spec's own "Product information" tabs. */
const ITEMS: TabsItem[] = [
  { value: 'description', title: 'Description', content: 'A relaxed-fit crew neck sweater.' },
  { value: 'materials', title: 'Materials & care', content: 'Hand wash cold, dry flat.' },
  { value: 'shipping', title: 'Shipping & returns', content: 'Ships in 2-3 business days.' },
];

const mounted: VueWrapper[] = [];

/**
 * Registration happens in each `Tab`'s own `onMounted` (see `context.ts`), which runs *after* that
 * tab's first render — so the registry (and everything derived from it: the default-selected first
 * tab, and `TabPanel`'s own mounted focusability check) only reaches the DOM on the next tick.
 * Every test that reads selection-derived state awaits this instead of the bare wrapper.
 */
async function mount(props: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
  const wrapper = mountWith(Tabs, {
    props: { ariaLabel: 'Product information', items: ITEMS, ...props },
    ...options,
  });
  mounted.push(wrapper as unknown as VueWrapper);
  await nextTick();
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
});

type MountedWrapper = Awaited<ReturnType<typeof mount>>;

const tabsOf = (wrapper: MountedWrapper) => wrapper.findAll('[role="tab"]');
const panelsOf = (wrapper: MountedWrapper) => wrapper.findAll('[role="tabpanel"]');

describe('Tabs — roles and structure', () => {
  it('renders a tablist with the given accessible name', async () => {
    const wrapper = await mount();
    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe('Product information');
  });

  it('renders one tab per item, each a real button named by its title', async () => {
    const wrapper = await mount();
    const tabs = tabsOf(wrapper);
    expect(tabs).toHaveLength(3);
    tabs.forEach((tab, index) => {
      expect(tab.element.tagName).toBe('BUTTON');
      expect(tab.attributes('type')).toBe('button');
      expect(tab.text()).toBe(ITEMS[index]!.title);
    });
  });

  it('wires each tab and its panel together by id', async () => {
    const wrapper = await mount();
    const tabs = tabsOf(wrapper);
    const panels = panelsOf(wrapper);
    expect(panels).toHaveLength(3);
    tabs.forEach((tab, index) => {
      const panel = panels[index]!;
      expect(tab.attributes('aria-controls')).toBe(panel.attributes('id'));
      expect(panel.attributes('aria-labelledby')).toBe(tab.attributes('id'));
    });
  });

  it('renders the tablist inside root and the panels as siblings after it, not inside it', async () => {
    const wrapper = await mount();
    const root = wrapper.get('[data-part="root"]');
    const list = root.get('[data-part="list"]');
    expect(list.find('[role="tabpanel"]').exists()).toBe(false);
    expect(root.findAll('[role="tabpanel"]')).toHaveLength(3);
  });

  it('selects the first tab by default: exactly one aria-selected="true" and tabindex="0"', async () => {
    const wrapper = await mount();
    const tabs = tabsOf(wrapper);
    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs.map((tab) => tab.attributes('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('hides every panel but the selected one', async () => {
    const wrapper = await mount();
    const panels = panelsOf(wrapper).map((panel) => panel.element as HTMLElement);
    expect(panels[0]!.hidden).toBe(false);
    expect(panels[1]!.hidden).toBe(true);
    expect(panels[2]!.hidden).toBe(true);
  });
});

describe('Tabs — selection', () => {
  it('emits update:modelValue and change when a tab is clicked', async () => {
    const wrapper = await mount();
    await tabsOf(wrapper)[2]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['shipping']]);
    expect(wrapper.emitted('change')).toEqual([['shipping']]);
    expect(tabsOf(wrapper)[2]!.attributes('aria-selected')).toBe('true');
  });

  it('is controlled once modelValue is bound', async () => {
    const wrapper = await mount({ modelValue: 'materials', 'onUpdate:modelValue': () => {} });
    expect(tabsOf(wrapper)[1]!.attributes('aria-selected')).toBe('true');
    await wrapper.setProps({ modelValue: 'shipping' });
    expect(tabsOf(wrapper)[2]!.attributes('aria-selected')).toBe('true');
    expect(tabsOf(wrapper)[1]!.attributes('aria-selected')).toBe('false');
  });
});

describe('Tabs — roving tabindex and arrow keys', () => {
  it('ArrowRight moves focus to the next tab, wrapping at the end, selecting under automatic activation', async () => {
    const wrapper = await mount();
    const tabs = tabsOf(wrapper);
    (tabs[0]!.element as HTMLElement).focus();

    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]!.element);
    expect(tabs[1]!.attributes('aria-selected')).toBe('true');

    await tabs[1]!.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[2]!.element);

    // wraps from the last tab back to the first
    await tabs[2]!.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[0]!.element);
    expect(tabs[0]!.attributes('aria-selected')).toBe('true');
  });

  it('ArrowLeft wraps from the first tab to the last', async () => {
    const wrapper = await mount();
    const tabs = tabsOf(wrapper);
    (tabs[0]!.element as HTMLElement).focus();
    await tabs[0]!.trigger('keydown', { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs[2]!.element);
    expect(tabs[2]!.attributes('aria-selected')).toBe('true');
  });

  it('Home/End jump to the first/last tab', async () => {
    const wrapper = await mount();
    const tabs = tabsOf(wrapper);
    (tabs[1]!.element as HTMLElement).focus();

    await tabs[1]!.trigger('keydown', { key: 'End' });
    expect(document.activeElement).toBe(tabs[2]!.element);

    await tabs[2]!.trigger('keydown', { key: 'Home' });
    expect(document.activeElement).toBe(tabs[0]!.element);
  });

  it('moves aria-selected and tabindex together on every selection', async () => {
    const wrapper = await mount();
    const tabs = tabsOf(wrapper);
    (tabs[0]!.element as HTMLElement).focus();
    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(tabs.map((tab) => tab.attributes('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual(['false', 'true', 'false']);
  });
});

describe('Tabs — manual activation', () => {
  it('moves focus without selecting; a later click selects', async () => {
    const wrapper = await mount({ activation: 'manual' });
    const tabs = tabsOf(wrapper);
    (tabs[0]!.element as HTMLElement).focus();

    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]!.element);
    expect(tabs[0]!.attributes('aria-selected')).toBe('true');
    expect(tabs[1]!.attributes('aria-selected')).toBe('false');

    await tabs[1]!.trigger('click');
    expect(tabs[1]!.attributes('aria-selected')).toBe('true');
    expect(tabs[0]!.attributes('aria-selected')).toBe('false');
  });

  it('does not intercept Enter/Space, leaving native button activation to select (needed with manual activation)', async () => {
    const wrapper = await mount({ activation: 'manual' });
    const tab = tabsOf(wrapper)[1]!.element;
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    tab.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    tab.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
  });

  /**
   * Final review item 6: the test above only proves this component gets *out of the way* of
   * Enter/Space — it never proves a focused tab actually *selects* on either key, which is the
   * whole reason not intercepting them matters. A real `<button>` fires its own `click` when Enter
   * or Space is pressed while it has focus (the platform's own default action for a focused
   * button); jsdom/happy-dom do not synthesize that default action for a raw `KeyboardEvent`, so
   * this dispatches the `click` a browser would fire immediately after, the same way
   * `firstMeaningfulControl`'s own focused-button contract is exercised elsewhere in this package.
   */
  it.each(['Enter', ' '])(
    'selects the focused tab when %s is pressed (via the native button click it triggers)',
    async (key) => {
      const wrapper = await mount({ activation: 'manual' });
      const tab = tabsOf(wrapper)[1]!.element as HTMLElement;
      tab.focus();
      const keydown = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      tab.dispatchEvent(keydown);
      expect(keydown.defaultPrevented).toBe(false);
      await tabsOf(wrapper)[1]!.trigger('click');
      expect(tabsOf(wrapper)[1]!.attributes('aria-selected')).toBe('true');
      expect(wrapper.emitted('update:modelValue')).toEqual([['materials']]);
    }
  );
});

describe('TabPanel — focusability rule', () => {
  it('gets tabindex="0" when it holds no focusable content', async () => {
    const wrapper = await mount();
    expect(panelsOf(wrapper)[0]!.attributes('tabindex')).toBe('0');
  });

  it('omits tabindex when the panel already contains a focusable element', async () => {
    const wrapper = mountWith(Tabs, {
      props: { ariaLabel: 'Product information' },
      slots: {
        tabs: '<Tab value="description">Description</Tab>',
        default: '<TabPanel value="description"><a href="/care">Care guide</a></TabPanel>',
      },
      global: { components: { Tab, TabPanel } },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    await nextTick();
    expect(wrapper.get('[role="tabpanel"]').attributes('tabindex')).toBeUndefined();
  });
});

describe('Tabs — indicator', () => {
  it('gives the underline variant a colour-only transition, never a slide', async () => {
    const wrapper = await mount();
    const classes = wrapper.get('[data-part="indicator"]').classes();
    expect(classes).toContain('eldra:eldra-transition-colors');
    expect(classes.some((name) => name.includes('translate') || name.includes('transform'))).toBe(
      false
    );
  });

  it('recolours the indicator on selection', async () => {
    const wrapper = await mount();
    const indicatorOf = (index: number) =>
      wrapper.findAll('[data-part="indicator"]')[index]!.classes();
    expect(indicatorOf(0)).toContain('eldra:bg-primary');
    expect(indicatorOf(1)).toContain('eldra:bg-transparent');
    await tabsOf(wrapper)[1]!.trigger('click');
    expect(indicatorOf(0)).toContain('eldra:bg-transparent');
    expect(indicatorOf(1)).toContain('eldra:bg-primary');
  });

  it('renders no indicator part in the pills variant', async () => {
    const wrapper = await mount({ variant: 'pills' });
    expect(wrapper.find('[data-part="indicator"]').exists()).toBe(false);
  });
});

describe('Tabs — variants', () => {
  it('gives the pills variant a filled selected tab and a bordered unselected one', async () => {
    const wrapper = await mount({ variant: 'pills' });
    const tabs = tabsOf(wrapper);
    expect(tabs[0]!.classes()).toEqual(
      expect.arrayContaining(['eldra:bg-primary', 'eldra:border-primary', 'eldra:rounded-full'])
    );
    expect(tabs[1]!.classes()).toEqual(expect.arrayContaining(['eldra:border-border-strong']));
  });
});

describe('Tabs — the items and slots APIs render the same structure', () => {
  it('renders identical roles/attributes from a slots-based equivalent of the same items', async () => {
    const fromItems = await mount();

    const fromSlots = mountWith(Tabs, {
      props: { ariaLabel: 'Product information' },
      slots: {
        tabs: ITEMS.map((item) => `<Tab value="${item.value}">${item.title}</Tab>`).join(''),
        default: ITEMS.map(
          (item) => `<TabPanel value="${item.value}">${item.content}</TabPanel>`
        ).join(''),
      },
      global: { components: { Tab, TabPanel } },
    });
    mounted.push(fromSlots as unknown as VueWrapper);
    await nextTick();

    expect(tabsOf(fromSlots).map((tab) => tab.attributes('aria-selected'))).toEqual(
      tabsOf(fromItems).map((tab) => tab.attributes('aria-selected'))
    );
    expect(tabsOf(fromSlots).map((tab) => tab.text())).toEqual(
      tabsOf(fromItems).map((tab) => tab.text())
    );
  });
});

/**
 * M7 (final review): every v-model test above (`describe('Tabs — selection')`) mounts through the
 * `items` prop. The slot-children path — `<Tab>`s registering themselves through `TABS_KEY` — is
 * the API the README leads with, and had no `update:modelValue`/controlled-value coverage of its
 * own before this: a regression that broke `v-model` only through the slots API could ship
 * unnoticed while every `items`-based test kept passing.
 */
describe('Tabs — v-model through the slots API (M7)', () => {
  function mountFromSlots(props: Record<string, unknown> = {}) {
    const wrapper = mountWith(Tabs, {
      props: { ariaLabel: 'Product information', ...props },
      slots: {
        tabs: ITEMS.map((item) => `<Tab value="${item.value}">${item.title}</Tab>`).join(''),
        default: ITEMS.map(
          (item) => `<TabPanel value="${item.value}">${item.content}</TabPanel>`
        ).join(''),
      },
      global: { components: { Tab, TabPanel } },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    return wrapper;
  }

  it('emits update:modelValue and change when a slot-placed Tab is clicked', async () => {
    const wrapper = mountFromSlots();
    await nextTick();
    await tabsOf(wrapper)[2]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['shipping']]);
    expect(wrapper.emitted('change')).toEqual([['shipping']]);
    expect(tabsOf(wrapper)[2]!.attributes('aria-selected')).toBe('true');
  });

  it('is controlled once modelValue is bound, through the slots API', async () => {
    const wrapper = mountFromSlots({ modelValue: 'materials', 'onUpdate:modelValue': () => {} });
    await nextTick();
    expect(tabsOf(wrapper)[1]!.attributes('aria-selected')).toBe('true');
    await wrapper.setProps({ modelValue: 'shipping' });
    expect(tabsOf(wrapper)[2]!.attributes('aria-selected')).toBe('true');
    expect(tabsOf(wrapper)[1]!.attributes('aria-selected')).toBe('false');
  });
});

describe('Tabs — classes', () => {
  it('accepts a class override for every part, including the parts a child component draws', async () => {
    const wrapper = await mount(
      { classes: { list: 'italic', tab: 'uppercase', indicator: 'opacity-50', panel: 'pt-2' } },
      { attrs: { class: 'ring-1' } }
    );
    expect(wrapper.classes()).toContain('ring-1');
    expect(wrapper.get('[data-part="list"]').classes()).toContain('italic');
    expect(tabsOf(wrapper)[0]!.classes()).toContain('uppercase');
    expect(wrapper.get('[data-part="indicator"]').classes()).toContain('opacity-50');
    expect(wrapper.get('[role="tabpanel"]').classes()).toContain('pt-2');
  });

  it('accepts a class override on a standalone Tab and TabPanel', async () => {
    const wrapper = mountWith(Tabs, {
      props: { ariaLabel: 'Product information' },
      slots: {
        tabs: '<Tab value="description" class="uppercase" :classes="{ indicator: \'opacity-50\' }">Description</Tab>',
        default: '<TabPanel value="description" class="italic">Content</TabPanel>',
      },
      global: { components: { Tab, TabPanel } },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    await nextTick();
    expect(wrapper.get('[role="tab"]').classes()).toContain('uppercase');
    expect(wrapper.get('[data-part="indicator"]').classes()).toContain('opacity-50');
    expect(wrapper.get('[role="tabpanel"]').classes()).toContain('italic');
  });
});

describe('Tabs — narrow', () => {
  it('scrolls the list horizontally instead of wrapping', async () => {
    const many: TabsItem[] = Array.from({ length: 10 }, (_, index) => ({
      value: `v${index}`,
      title: `Section ${index}`,
    }));
    const wrapper = mountNarrow(Tabs, {
      props: { ariaLabel: 'Sections', items: many },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    await nextTick();
    const list = wrapper.get('[role="tablist"]');
    expect(list.classes()).toContain('eldra:overflow-x-auto');
    expect(list.classes()).toContain('eldra:eldra-scrollbar-hide');
    expect(list.classes()).not.toContain('eldra:flex-wrap');
  });
});

const WITH_DISABLED: TabsItem[] = [
  { value: 'description', title: 'Description', content: 'A relaxed-fit crew neck sweater.' },
  { value: 'materials', title: 'Materials & care', content: 'Hand wash cold.', disabled: true },
  { value: 'shipping', title: 'Shipping & returns', content: 'Ships in 2-3 business days.' },
];

describe('Tabs — disabled tabs', () => {
  it('marks a disabled tab aria-disabled, never native disabled, and leaves the others alone', async () => {
    const wrapper = await mount({ items: WITH_DISABLED });
    const tabs = tabsOf(wrapper);
    expect(tabs.map((tab) => tab.attributes('aria-disabled'))).toEqual([
      undefined,
      'true',
      undefined,
    ]);
    expect(tabs[1]!.attributes('disabled')).toBeUndefined();
    expect(tabs[1]!.classes()).toContain('eldra:cursor-not-allowed');
  });

  it('renders exactly as before when no tab is disabled', async () => {
    const wrapper = await mount();
    for (const tab of tabsOf(wrapper)) {
      expect(tab.attributes('aria-disabled')).toBeUndefined();
      expect(tab.classes()).toContain('eldra:cursor-pointer');
    }
  });

  it('ignores a click on a disabled tab', async () => {
    const wrapper = await mount({ items: WITH_DISABLED });
    await tabsOf(wrapper)[1]!.trigger('click');
    expect(tabsOf(wrapper)[0]!.attributes('aria-selected')).toBe('true');
    expect(tabsOf(wrapper)[1]!.attributes('aria-selected')).toBe('false');
    expect(wrapper.emitted('change')).toBeUndefined();
  });

  it('skips a disabled tab with the arrow keys, both ways', async () => {
    const wrapper = await mount({ items: WITH_DISABLED });
    const tabs = tabsOf(wrapper);
    (tabs[0]!.element as HTMLElement).focus();
    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[2]!.element);
    expect(tabs[2]!.attributes('aria-selected')).toBe('true');
    await tabs[2]!.trigger('keydown', { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs[0]!.element);
  });

  it('Home/End land on the first/last tab that is not disabled', async () => {
    const items = [
      { ...WITH_DISABLED[0]!, disabled: true },
      WITH_DISABLED[2]!,
      { value: 'reviews', title: 'Reviews', disabled: true },
    ];
    const wrapper = await mount({ items, modelValue: 'shipping' });
    const tabs = tabsOf(wrapper);
    (tabs[1]!.element as HTMLElement).focus();
    await tabs[1]!.trigger('keydown', { key: 'Home' });
    expect(document.activeElement).toBe(tabs[1]!.element);
    await tabs[1]!.trigger('keydown', { key: 'End' });
    expect(document.activeElement).toBe(tabs[1]!.element);
  });

  it('defaults to the first tab that is not disabled', async () => {
    const items = [{ ...WITH_DISABLED[0]!, disabled: true }, ...WITH_DISABLED.slice(1)];
    const wrapper = await mount({ items });
    expect(tabsOf(wrapper).map((tab) => tab.attributes('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
    ]);
  });

  it('keeps a selected disabled tab as the one tab stop, and moves nowhere when every tab is disabled', async () => {
    const items = ITEMS.map((item) => ({ ...item, disabled: true }));
    const wrapper = await mount({ items, modelValue: 'materials' });
    const tabs = tabsOf(wrapper);
    expect(tabs.map((tab) => tab.attributes('tabindex'))).toEqual(['-1', '0', '-1']);
    (tabs[1]!.element as HTMLElement).focus();
    await tabs[1]!.trigger('keydown', { key: 'ArrowRight' });
    await tabs[1]!.trigger('keydown', { key: 'End' });
    expect(document.activeElement).toBe(tabs[1]!.element);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('draws a selected disabled underline tab with a muted bar, not the primary one', async () => {
    const items = ITEMS.map((item) => ({ ...item, disabled: true }));
    const wrapper = await mount({ items });
    const indicators = wrapper.findAll('[data-part="indicator"]');
    expect(indicators[0]!.classes()).toContain('eldra:bg-muted');
    expect(indicators[0]!.classes()).not.toContain('eldra:bg-primary');
  });

  it('takes disabled on a standalone Tab in the slots API', async () => {
    const wrapper = mountWith(Tabs, {
      props: { ariaLabel: 'Product information' },
      slots: {
        tabs: '<Tab value="a" title="A" /><Tab value="b" title="B" disabled />',
        default: '<TabPanel value="a">A</TabPanel><TabPanel value="b">B</TabPanel>',
      },
      global: { components: { Tab, TabPanel } },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    await nextTick();
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs[1]!.attributes('aria-disabled')).toBe('true');
    await tabs[1]!.trigger('click');
    expect(tabs[0]!.attributes('aria-selected')).toBe('true');
  });

  it('has no axe violations with a disabled tab (underline and pills)', async () => {
    const underline = await mount({ items: WITH_DISABLED });
    expect(await axe(underline.element)).toHaveNoViolations();
    const pills = await mount({ items: WITH_DISABLED, variant: 'pills' });
    expect(await axe(pills.element)).toHaveNoViolations();
  });
});

describe('Tabs — accessibility', () => {
  it('has no axe violations (underline)', async () => {
    const wrapper = await mount();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('has no axe violations (pills)', async () => {
    const wrapper = await mount({ variant: 'pills' });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('has no axe violations under manual activation', async () => {
    const wrapper = await mount({ activation: 'manual' });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});

describe('Tabs — a registered entry without `disabled`', () => {
  it('reads an entry registered without `disabled` as enabled, for selection and the arrow keys', async () => {
    const CustomTab = defineComponent({
      props: { value: { type: String, required: true } },
      setup(props) {
        const context = inject(TABS_KEY)!;
        const el = ref<HTMLButtonElement | null>(null);
        let unregister: (() => void) | undefined;
        onMounted(() => {
          unregister = context.register({ value: props.value, focus: () => el.value?.focus() });
        });
        onBeforeUnmount(() => unregister?.());
        return () =>
          h(
            'button',
            {
              ref: el,
              type: 'button',
              role: 'tab',
              id: context.tabId(props.value),
              'aria-selected': context.isSelected(props.value) ? 'true' : 'false',
              onKeydown: (event: KeyboardEvent) => {
                if (event.key === 'ArrowRight') context.moveFocus(props.value, 1);
              },
            },
            props.value
          );
      },
    });
    const wrapper = mountWith(Tabs, {
      props: { ariaLabel: 'Product information' },
      slots: {
        tabs: '<CustomTab value="custom" /><Tab value="materials">Materials</Tab>',
        default:
          '<TabPanel value="custom">Custom</TabPanel><TabPanel value="materials">Materials</TabPanel>',
      },
      global: { components: { CustomTab, Tab, TabPanel } },
    });
    mounted.push(wrapper as unknown as VueWrapper);
    await nextTick();
    const tabs = tabsOf(wrapper);
    expect(tabs[0]!.attributes('aria-selected')).toBe('true');
    (tabs[1]!.element as HTMLElement).focus();
    await tabs[1]!.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[0]!.element);
    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs[1]!.element);
  });
});
