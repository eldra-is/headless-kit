// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import { afterEach, describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

/** The genuinely minimal fixture: only the fields the block requires. */
const bare = {
  variant: 'columns',
  items: [{ icon: 'truck', title: 'Free shipping' }],
};

/** The injected fetcher still resolves through a promise; flush one microtask/macrotask turn
 *  before asserting on icon markup — the same wait `feature-grid`'s own spec uses. */
async function flushIcons(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
}

function mountBlock(data: Record<string, unknown>, options: { editing?: boolean } = {}) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const opts = {
    ...base,
    global: {
      ...base.global,
    },
  };
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  return mount(Block, opts);
}

/**
 * `Block.vue` measures the list's own `scrollWidth`/`clientWidth` through a `ResizeObserver` (see
 * its module doc comment) to decide whether the `mobileLayout: "scroll"` list is actually
 * overflowing before making it a tab stop. jsdom has no `ResizeObserver` at all (confirmed: it is
 * `undefined` in this suite's environment), so most specs exercise the real "guarded, no observer"
 * path for free. The two tests below need to *drive* that measurement directly: this stub replaces
 * `globalThis.ResizeObserver` with a fake that only captures the callback the component passes
 * (`observe`/`unobserve`/`disconnect` are no-ops — nothing here needs real layout), so a test can
 * call `trigger()` after changing the element's `scrollWidth`/`clientWidth` to simulate a resize.
 */
function stubResizeObserver(): { trigger: () => void; restore: () => void } {
  let captured: ResizeObserverCallback | null = null;
  class FakeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      captured = callback;
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  const original = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;
  return {
    trigger: () => captured?.([] as unknown as ResizeObserverEntry[], {} as ResizeObserver),
    restore: () => {
      (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = original;
    },
  };
}

/** jsdom's `scrollWidth`/`clientWidth` are always `0`; shadow them with own properties so the
 *  element reads as overflowing (or not) the way a real, narrower-than-its-content list would. */
function setOverflowing(el: Element, overflowing: boolean): void {
  Object.defineProperty(el, 'scrollWidth', { value: overflowing ? 800 : 400, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
}

describe('trust-strip block', () => {
  it('renders the full mock content with no axe violations', async () => {
    const wrapper = mountBlock(mock);
    for (const item of mock.items) expect(wrapper.text()).toContain(item.title);
    expect(wrapper.text()).toContain(mock.paymentsLabel);
    await flushIcons();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare, required-fields-only content with no axe violations', async () => {
    const wrapper = mountBlock(bare);
    expect(wrapper.text()).toContain('Free shipping');
    await flushIcons();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['columns', 'inline'] as const)(
    'renders variant "%s" with no axe violations',
    async (variant) => {
      const wrapper = mountBlock({ ...mock, variant });
      await flushIcons();
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('has no axe violations with mobileLayout "scroll"', async () => {
    const wrapper = mountBlock({ ...mock, mobileLayout: 'scroll' });
    await flushIcons();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('has no axe violations with mobileLayout "scroll" while the list is actually overflowing', async () => {
    const stub = stubResizeObserver();
    try {
      const wrapper = mountBlock({ ...mock, mobileLayout: 'scroll' });
      setOverflowing(wrapper.get('ul').element, true);
      stub.trigger();
      await nextTick();
      await flushIcons();
      expect(wrapper.get('ul').attributes('tabindex')).toBe('0');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    } finally {
      stub.restore();
    }
  });

  it('labels the section with the hidden h2', () => {
    const wrapper = mountBlock(mock);
    const heading = wrapper.get('h2');
    expect(heading.classes()).toContain('sr-only');
    expect(wrapper.get('section').attributes('aria-labelledby')).toBe(heading.attributes('id'));
    expect(heading.text()).toBe('Why shop with Northwind');
  });

  it('keeps every item icon aria-hidden', async () => {
    const wrapper = mountBlock(mock);
    await flushIcons();
    const svgs = wrapper.findAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      if (svg.attributes('aria-hidden') !== 'true') {
        throw new Error('expected every icon svg to be aria-hidden');
      }
    }
  });

  it('names every payment mark inside the labelled payments list, monochrome icon included', async () => {
    const wrapper = mountBlock(mock);
    await flushIcons();
    const list = wrapper.get('ul[aria-label="Accepted payment methods"]');
    const marks = list.findAll('li');
    expect(marks).toHaveLength(4);
    const names = marks.map((mark) => mark.text());
    expect(names).toEqual(['Visa', 'Mastercard', 'PayPal', 'Apple Pay']);
    for (const mark of marks) {
      expect(mark.get('svg').attributes('aria-hidden')).toBe('true');
    }
  });

  it('renders apple-pay as the brand-apple icon while keeping the "Apple Pay" hidden name', async () => {
    const wrapper = mountBlock({ ...mock, payments: [{ brand: 'apple-pay' }] });
    await flushIcons();
    const mark = wrapper.get('ul[aria-label="Accepted payment methods"] li');
    expect(mark.text()).toBe('Apple Pay');
  });

  it('caps items at four: a fifth is not rendered', () => {
    const fifth = { icon: 'gift', title: 'Gift wrapping', text: 'Free on request.' };
    const wrapper = mountBlock({ ...mock, items: [...mock.items, fifth] });
    expect(wrapper.text()).not.toContain('Gift wrapping');
    expect(wrapper.findAll('h2').length + wrapper.findAll('p').length).toBeGreaterThan(0);
  });

  it('renders nothing live when no item has a title', () => {
    const wrapper = mountBlock({
      ...mock,
      items: [
        { icon: 'truck', title: '' },
        { icon: 'lock', title: '   ' },
      ],
    });
    expect(wrapper.find('section').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });

  it('skips only the untitled item, keeping titled siblings, live', () => {
    const wrapper = mountBlock({
      ...mock,
      items: [{ icon: 'truck', title: '' }, ...mock.items.slice(1)],
    });
    expect(wrapper.text()).not.toContain(mock.items[0]!.title);
    for (const item of mock.items.slice(1)) expect(wrapper.text()).toContain(item.title);
  });

  it('shows an editor-only hint for a still-empty item, and renders it live as nothing', async () => {
    const data = { ...mock, items: [{ icon: 'truck', title: '' }] };
    const live = mountBlock(data);
    expect(live.find('section').exists()).toBe(false);

    const editing = mountBlock(data, { editing: true });
    expect(editing.find('section').exists()).toBe(true);
    expect(editing.text()).toContain('Add a promise');
    expect(await axe(editing.element)).toHaveNoViolations();
  });

  describe('the mobileLayout "scroll" region is focusable only while it actually overflows', () => {
    afterEach(() => {
      // Belt and braces: every test in this block restores the global itself too, but a thrown
      // assertion before that `restore()` call must not leak a fake `ResizeObserver` into a later
      // test file — `enableAutoUnmount` only unmounts components, it does not know about globals.
      delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    });

    it('under plain jsdom (no ResizeObserver, scrollWidth/clientWidth both 0) it is not a tab stop, in either layout', () => {
      expect(typeof globalThis.ResizeObserver).toBe('undefined');
      for (const mobileLayout of ['grid', 'scroll'] as const) {
        const wrapper = mountBlock({ ...mock, mobileLayout });
        expect(wrapper.find('[tabindex]').exists()).toBe(false);
        expect(wrapper.get('ul').attributes('aria-label')).toBeUndefined();
      }
    });

    it('becomes a focusable, named list with the standard focus ring once it overflows, and loses all three once it no longer does', async () => {
      const stub = stubResizeObserver();
      try {
        const wrapper = mountBlock({ ...mock, mobileLayout: 'scroll' });
        const list = wrapper.get('ul');

        setOverflowing(list.element, true);
        stub.trigger();
        await nextTick();
        expect(list.attributes('tabindex')).toBe('0');
        expect(list.attributes('aria-label')).toBe('Why shop with us, scrolls sideways');
        expect(list.classes()).toContain('focus-visible:ring-2');

        setOverflowing(list.element, false);
        stub.trigger();
        await nextTick();
        expect(list.attributes('tabindex')).toBeUndefined();
        expect(list.attributes('aria-label')).toBeUndefined();
        expect(list.classes()).not.toContain('focus-visible:ring-2');
      } finally {
        stub.restore();
      }
    });

    it('the grid layout carries no tabindex anywhere, even while the list overflows', async () => {
      const stub = stubResizeObserver();
      try {
        const wrapper = mountBlock({ ...mock, mobileLayout: 'grid' });
        setOverflowing(wrapper.get('ul').element, true);
        stub.trigger();
        await nextTick();
        expect(wrapper.find('[tabindex]').exists()).toBe(false);
      } finally {
        stub.restore();
      }
    });
  });

  it('Tab reaches only the item links, in reading order — nothing else carries a tabindex', () => {
    const wrapper = mountBlock(mock);
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'));
    const expected = mock.items
      .filter((item) => 'href' in item)
      .map((item) => (item as { href: string }).href);
    expect(hrefs).toEqual(expected);
    expect(wrapper.findAll('[tabindex]')).toHaveLength(0);
  });

  it('has no transition or animation class anywhere in the block', () => {
    const wrapper = mountBlock({ ...mock, mobileLayout: 'scroll' });
    for (const element of wrapper.element.querySelectorAll('*')) {
      for (const className of element.classList) {
        expect(className.startsWith('transition-')).toBe(false);
        expect(className.startsWith('animate-')).toBe(false);
      }
    }
  });

  it('re-measures overflow when the rendered items change, not only when the list box resizes', async () => {
    const wrapper = mountBlock({ ...mock, mobileLayout: 'scroll', items: mock.items.slice(0, 1) });
    const list = wrapper.get('ul').element as HTMLUListElement;
    Object.defineProperty(list, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(list, 'scrollWidth', { configurable: true, value: 300 });
    expect(wrapper.get('ul').attributes('tabindex')).toBeUndefined();

    Object.defineProperty(list, 'scrollWidth', { configurable: true, value: 900 });
    await wrapper.setProps({
      entry: { ...(wrapper.props('entry') as object), data: { ...mock, mobileLayout: 'scroll' } },
    });
    await nextTick();
    await nextTick();
    expect(wrapper.get('ul').attributes('tabindex')).toBe('0');
  });
});
