// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';

/** The genuinely minimal fixture: only the fields the block requires. */
const bare = {
  variant: 'columns',
  items: [{ icon: 'truck', title: 'Free shipping' }],
};

/** `trust-strip` resolves every icon (items and payment marks alike) through `EldraIcon`'s own
 *  machinery (`useEldraIcon`); outside Nuxt that means an injected `ICON_FETCHER_KEY` — the same
 *  stub `feature-grid`'s and `team`'s own specs use. */
const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

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
      provide: { ...base.global.provide, [ICON_FETCHER_KEY]: stubFetcher },
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

  describe('the mobileLayout "scroll" region', () => {
    it('is a focusable, named list with the standard focus ring', () => {
      const wrapper = mountBlock({ ...mock, mobileLayout: 'scroll' });
      const region = wrapper.get('ul[tabindex="0"]');
      expect(region.attributes('aria-label')).toBe('Why shop with us, scrolls sideways');
      expect(region.classes()).toContain('focus-visible:ring-2');
    });

    it('the grid layout carries no tabindex anywhere', () => {
      const wrapper = mountBlock({ ...mock, mobileLayout: 'grid' });
      expect(wrapper.find('[tabindex]').exists()).toBe(false);
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
});
