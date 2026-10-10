// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

/** Stats has no media fields, so — unlike most rebuilt blocks — there is no `preview.json` to
 * merge on top of `mock.json`. `mock.json` itself is therefore the block's one full ("merged")
 * content fixture; `bare` below is the genuinely minimal one, only the fields the block requires. */
const bare = {
  heading: 'What customers say',
  items: [
    { value: '38', label: 'Independent makers' },
    { value: '12', label: 'Years trading' },
  ],
};

function mountBlock(data: Record<string, unknown>, options: { editing?: boolean } = {}) {
  const opts = mountOptions({ entry: { id: 'e1', data } });
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  return mount(Block, opts);
}

describe('stats block', () => {
  it('renders the full mock.json content with no axe violations', async () => {
    const wrapper = mountBlock(mock);
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.text()).toContain(mock.intro);
    for (const item of mock.items) {
      expect(wrapper.text()).toContain(item.value);
      expect(wrapper.text()).toContain(item.label);
    }
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare, required-fields-only content with no axe violations', async () => {
    const wrapper = mountBlock(bare);
    expect(wrapper.text()).toContain(bare.heading);
    for (const item of bare.items) {
      expect(wrapper.text()).toContain(item.value);
      expect(wrapper.text()).toContain(item.label);
    }
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['row', 'split'] as const)(
    'renders the %s variant with no axe violations',
    async (variant) => {
      const wrapper = mountBlock({ ...mock, variant });
      expect(wrapper.findAll('li')).toHaveLength(mock.items.length);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it.each(['primary', 'accent'] as const)(
    'renders the %s section background with no axe violations',
    async (sectionBackground) => {
      const wrapper = mountBlock({ ...mock, sectionBackground });
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('renders the block root as a labelled <section> that measures its own width (@container)', () => {
    const wrapper = mountBlock(mock);
    const section = wrapper.get('section');
    expect(section.classes()).toContain('@container');
    expect(section.attributes('aria-labelledby')).toBeTruthy();
  });

  it('the heading is an h2, the figures are a <ul>, and each value comes before its label', () => {
    const wrapper = mountBlock(mock);
    const heading = wrapper.get('h2');
    expect(heading.text()).toBe(mock.heading);
    const list = wrapper.get('ul');
    expect(
      heading.element.compareDocumentPosition(list.element) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const items = list.findAll('li');
    expect(items).toHaveLength(mock.items.length);
    items.forEach((item, index) => {
      const paragraphs = item.findAll('p');
      expect(paragraphs).toHaveLength(2);
      expect(paragraphs[0]!.text()).toBe(mock.items[index]!.value);
      expect(paragraphs[1]!.text()).toBe(mock.items[index]!.label);
    });
  });

  it('has no focusable parts: nothing in the block is a tab stop', () => {
    const wrapper = mountBlock(mock);
    expect(wrapper.findAll('a, button, input, [tabindex]')).toHaveLength(0);
  });

  it('renders 8 items as 8 list items', () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      value: String(index + 1),
      label: `Figure ${index + 1}`,
    }));
    const wrapper = mountBlock({ ...mock, items });
    expect(wrapper.findAll('li')).toHaveLength(8);
  });

  it('a single item spans the full width', () => {
    const wrapper = mountBlock({ ...mock, items: [mock.items[0]!] });
    const items = wrapper.findAll('li');
    expect(items).toHaveLength(1);
    expect(items[0]!.classes()).toContain('col-span-full');
  });

  it('does not span the full width when there is more than one item', () => {
    const wrapper = mountBlock({ ...mock, items: mock.items.slice(0, 2) });
    for (const item of wrapper.findAll('li')) {
      expect(item.classes()).not.toContain('col-span-full');
    }
  });

  it('a 7-character value gets the wrap-anywhere class', () => {
    const wrapper = mountBlock({ ...mock, items: [{ value: '1234567', label: 'Long figure' }] });
    const value = wrapper.get('li p');
    expect(value.text()).toBe('1234567');
    expect(value.classes()).toContain('wrap-anywhere');
  });

  it('has no transition or animation class anywhere in the block', () => {
    const wrapper = mountBlock(mock);
    const classes = wrapper.element.querySelectorAll('*');
    for (const element of classes) {
      for (const className of element.classList) {
        expect(className.startsWith('transition-')).toBe(false);
        expect(className.startsWith('animate-')).toBe(false);
      }
    }
  });

  it('an item with an empty value is not rendered live', () => {
    const wrapper = mountBlock({
      ...mock,
      items: [...mock.items, { value: '', label: 'Not yet filled in' }],
    });
    expect(wrapper.findAll('li')).toHaveLength(mock.items.length);
    expect(wrapper.text()).not.toContain('Not yet filled in');
  });

  it('shows the heading hint only in the editor when heading is empty, with no axe violations', async () => {
    const data = { ...mock, heading: '' };
    const live = mountBlock(data);
    expect(live.text()).not.toContain('Add a heading');
    expect(live.find('h2').exists()).toBe(false);

    const editing = mountBlock(data, { editing: true });
    expect(editing.text()).toContain('Add a heading');
    expect(await axe(editing.element)).toHaveNoViolations();
  });

  it('shows the intro hint only in the editor when intro is empty', () => {
    const data = { ...mock, intro: '' };
    const live = mountBlock(data);
    expect(live.text()).not.toContain('Add an intro');

    const editing = mountBlock(data, { editing: true });
    expect(editing.text()).toContain('Add an intro (optional)');
  });

  it('does not render an intro paragraph at all when intro is empty, live', () => {
    const wrapper = mountBlock({ ...mock, intro: '' });
    expect(wrapper.findAll('p').some((p) => p.text() === mock.intro)).toBe(false);
  });

  it('shows a per-item hint in the editor for an empty item, and renders it live as nothing', async () => {
    const data = { ...mock, items: [{ value: '', label: '' }] };
    const live = mountBlock(data);
    expect(live.findAll('li')).toHaveLength(0);

    const editing = mountBlock(data, { editing: true });
    expect(editing.findAll('li')).toHaveLength(1);
    expect(editing.text()).toContain('Add a figure');
    expect(await axe(editing.element)).toHaveNoViolations();
  });

  it('defaults sectionBackground to none when unset', () => {
    const { sectionBackground: _omit, ...withoutBackground } = mock;
    const wrapper = mountBlock(withoutBackground);
    const section = wrapper.get('section');
    expect(section.attributes('data-section-bg')).toBe('none');
  });
});
