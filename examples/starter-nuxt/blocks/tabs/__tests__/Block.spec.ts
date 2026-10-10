// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

/** `mock.json` is Studio's insert seed (no media); `preview.json` is the demo-imagery overlay a
 *  story/preview merges on top of it, replacing the whole `tabs` list — same shallow-merge shape
 *  `testimonials`'/`hero`'s own tests use. */
const withMedia = { ...mock, ...preview };

/** The genuinely minimal fixture: only the fields the block requires. */
const bare = {
  heading: 'Looking after your things',
  tabs: [
    {
      label: 'Care',
      heading: 'Take care of it',
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Handle with care.' }] }],
      },
    },
    {
      label: 'Repairs',
      heading: 'When something breaks',
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We can help.' }] }],
      },
    },
  ],
};

function mountBlock(
  data: Record<string, unknown>,
  options: { editing?: boolean; attach?: boolean } = {}
) {
  const opts = mountOptions({ entry: { id: 'e1', data } });
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  // Keyboard tests move real DOM focus (`document.activeElement`), which jsdom only tracks for
  // elements attached to `document.body` — the same reason `faq`'s own interactive suite attaches.
  return mount(Block, options.attach ? { ...opts, attachTo: document.body } : opts);
}

describe('tabs block', () => {
  it('renders the full (mock + preview) content with no axe violations', async () => {
    const wrapper = mountBlock(withMedia);
    await nextTick();
    expect(wrapper.text()).toContain(withMedia.heading);
    expect(wrapper.text()).toContain(withMedia.intro);
    for (const tab of withMedia.tabs) {
      expect(wrapper.text()).toContain(tab.label);
      expect(wrapper.text()).toContain(tab.heading);
      expect(wrapper.text()).toContain(tab.linkLabel);
    }
    expect(wrapper.findAll('img')).toHaveLength(withMedia.tabs.length);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare, required-fields-only content with no axe violations', async () => {
    const wrapper = mountBlock(bare);
    await nextTick();
    expect(wrapper.text()).toContain(bare.heading);
    expect(wrapper.text()).toContain(bare.tabs[0]!.label);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['none', 'surface', 'surface-strong'] as const)(
    'renders the %s section background with no axe violations',
    async (sectionBackground) => {
      const wrapper = mountBlock({ ...mock, sectionBackground });
      await nextTick();
      const section = wrapper.get('section');
      expect(section.attributes('data-section-bg')).toBe(sectionBackground);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('selects the second tab with defaultTab: 2, with no axe violations', async () => {
    const wrapper = mountBlock({ ...mock, defaultTab: 2 });
    await nextTick();
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('labels the tablist with the heading text and the section by the same heading id', () => {
    const wrapper = mountBlock(mock);
    const section = wrapper.get('section');
    const headingId = wrapper.get('h2').attributes('id');
    expect(headingId).toBeTruthy();
    expect(section.attributes('aria-labelledby')).toBe(headingId);
    expect(wrapper.get('[role="tablist"]').attributes('aria-label')).toBe(mock.heading);
  });

  it('exposes aria-selected/aria-controls on each tab and aria-labelledby/hidden on each panel', async () => {
    const wrapper = mountBlock(mock);
    await nextTick();
    const tabs = wrapper.findAll('[role="tab"]');
    const panels = wrapper.findAll('[role="tabpanel"]');
    expect(tabs).toHaveLength(mock.tabs.length);
    expect(panels).toHaveLength(mock.tabs.length);
    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    tabs.forEach((tab, index) => {
      const panel = panels[index]!;
      expect(tab.attributes('aria-controls')).toBe(panel.attributes('id'));
      expect(panel.attributes('aria-labelledby')).toBe(tab.attributes('id'));
    });
    expect((panels[0]!.element as HTMLElement).hidden).toBe(false);
    for (const panel of panels.slice(1)) {
      expect((panel.element as HTMLElement).hidden).toBe(true);
    }
  });

  describe('keyboard & accessibility', () => {
    it('ArrowRight/ArrowLeft move and select with wrap-around', async () => {
      const wrapper = mountBlock(mock, { attach: true });
      const tabs = wrapper.findAll('[role="tab"]');
      (tabs[0]!.element as HTMLElement).focus();

      await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
      expect(document.activeElement).toBe(tabs[1]!.element);
      expect(tabs[1]!.attributes('aria-selected')).toBe('true');

      await tabs[1]!.trigger('keydown', { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(tabs[0]!.element);
      expect(tabs[0]!.attributes('aria-selected')).toBe('true');

      // wraps from the first tab back to the last
      await tabs[0]!.trigger('keydown', { key: 'ArrowLeft' });
      const last = tabs[tabs.length - 1]!;
      expect(document.activeElement).toBe(last.element);
      expect(last.attributes('aria-selected')).toBe('true');
    });

    it('Home/End jump to the first/last tab, selected', async () => {
      const wrapper = mountBlock(mock, { attach: true });
      const tabs = wrapper.findAll('[role="tab"]');
      (tabs[1]!.element as HTMLElement).focus();

      await tabs[1]!.trigger('keydown', { key: 'End' });
      const last = tabs[tabs.length - 1]!;
      expect(document.activeElement).toBe(last.element);
      expect(last.attributes('aria-selected')).toBe('true');

      await last.trigger('keydown', { key: 'Home' });
      expect(document.activeElement).toBe(tabs[0]!.element);
      expect(tabs[0]!.attributes('aria-selected')).toBe('true');
    });

    it('only the selected tab is in the Tab order', async () => {
      const wrapper = mountBlock(mock);
      const tabs = wrapper.findAll('[role="tab"]');
      expect(tabs.map((tab) => tab.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
      (tabs[0]!.element as HTMLElement).focus();
      await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
      expect(tabs.map((tab) => tab.attributes('tabindex'))).toEqual(['-1', '0', '-1', '-1']);
    });

    it('the selected panel carries no tabindex of its own — its link is the next Tab stop', () => {
      const wrapper = mountBlock(mock);
      const panel = wrapper.get('[role="tabpanel"]:not([hidden])');
      expect(panel.attributes('tabindex')).toBeUndefined();
      const link = panel.get('a');
      expect(link.attributes('tabindex')).toBeUndefined();
    });

    it('has no axe violations with reduced motion tokens absent (instant panel switch)', async () => {
      const wrapper = mountBlock(mock);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  it('clamps defaultTab: 9 to the last tab', () => {
    const wrapper = mountBlock({ ...mock, defaultTab: 9 });
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs[tabs.length - 1]!.attributes('aria-selected')).toBe('true');
    for (const tab of tabs.slice(0, -1)) expect(tab.attributes('aria-selected')).toBe('false');
  });

  it('re-clamps selectedTab when the tabs list shrinks below it, keeping exactly one tab selected', async () => {
    // Mutation check (manual): removing the `watch(() => tabs.value.length, …)` block in
    // `Block.vue` leaves `selectedTab` pointing at an index no longer in the (shrunk) list —
    // confirmed by temporarily deleting it and observing every tab read `aria-selected="false"`.
    const wrapper = mountBlock({ ...mock, defaultTab: mock.tabs.length });
    const before = wrapper.findAll('[role="tab"]');
    expect(before[before.length - 1]!.attributes('aria-selected')).toBe('true');

    const shrunk = { ...mock, tabs: mock.tabs.slice(0, mock.tabs.length - 2) };
    await wrapper.setProps({ entry: { ...(wrapper.props('entry') as object), data: shrunk } });
    await nextTick();

    const after = wrapper.findAll('[role="tab"]');
    expect(after).toHaveLength(shrunk.tabs.length);
    const selected = after.filter((tab) => tab.attributes('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]!.element).toBe(after[after.length - 1]!.element);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('leaves selectedTab untouched when the tabs list shrinks but the selected index still fits', async () => {
    const wrapper = mountBlock({ ...mock, defaultTab: 1 });
    const shrunk = { ...mock, tabs: mock.tabs.slice(0, mock.tabs.length - 1) };
    await wrapper.setProps({ entry: { ...(wrapper.props('entry') as object), data: shrunk } });
    await nextTick();

    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs[0]!.attributes('aria-selected')).toBe('true');
  });

  it('panel headings use the leading-tight (1.25) line-height token, not a literal 1.3', () => {
    // `--eldra-text-h3-line` (`packages/ui/src/styles/tokens.css`) is `1.25`, not `1.3` — the
    // rich-text typography table's `h3` line height (a different, unrelated scale) is 1.3, and the
    // panel heading previously copied that number by mistake.
    const wrapper = mountBlock(mock);
    const panelHeading = wrapper.get('h3');
    expect(panelHeading.classes()).toContain('leading-tight');
    expect(panelHeading.classes()).not.toContain('leading-[1.3]');
  });

  it('caps a text-only panel copy at 40rem (mock.json has no tab images)', () => {
    const wrapper = mountBlock(mock);
    const richTextRoots = wrapper.findAll('[data-eldra-rich-text]');
    expect(richTextRoots).toHaveLength(mock.tabs.length);
    for (const root of richTextRoots) {
      expect(root.element.parentElement!.className).toContain('max-w-[40rem]');
    }
  });

  it('carries the mobile bleed and sideways-scroll classes on the tab row', () => {
    const wrapper = mountBlock(mock);
    const list = wrapper.get('[role="tablist"]');
    expect(list.classes()).toContain('overflow-x-auto');
    expect(list.classes()).toContain('eldra-scrollbar-hide');
    expect(list.classes()).toContain('-mx-[var(--eldra-gutter-mobile)]');
    expect(list.classes()).toContain('px-[var(--eldra-gutter-mobile)]');
    expect(list.classes()).toContain('scroll-px-[var(--eldra-gutter-mobile)]');
    expect(list.classes()).toContain('@tablet:mx-0');
    expect(list.classes()).toContain('@tablet:px-0');
    expect(list.classes()).toContain('@tablet:scroll-px-0');
  });

  it('never auto-rotates: the selected tab is unchanged after 30 seconds', () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountBlock(mock);
      const before = wrapper.findAll('[role="tab"]').map((tab) => tab.attributes('aria-selected'));
      vi.advanceTimersByTime(30_000);
      const after = wrapper.findAll('[role="tab"]').map((tab) => tab.attributes('aria-selected'));
      expect(after).toEqual(before);
      expect(before).toEqual(['true', 'false', 'false', 'false']);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('empty tabs', () => {
    it('renders nothing live when tabs is empty', () => {
      const wrapper = mountBlock({ ...mock, tabs: [] });
      expect(wrapper.find('section').exists()).toBe(false);
      expect(wrapper.text()).toBe('');
    });

    it('shows heading and tab-list hints in the editor when tabs is empty, with no axe violations', async () => {
      const wrapper = mountBlock({ ...mock, heading: '', tabs: [] }, { editing: true });
      expect(wrapper.find('section').exists()).toBe(true);
      expect(wrapper.text()).toContain('Add a heading');
      expect(wrapper.text()).toContain('Tab 1');
      expect(wrapper.text()).toContain('Add tab content');
      expect(wrapper.find('[role="tablist"]').exists()).toBe(false);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  it('defaults sectionBackground to none when unset', () => {
    const { sectionBackground: _omit, ...withoutBackground } = mock;
    const wrapper = mountBlock(withoutBackground);
    const section = wrapper.get('section');
    expect(section.attributes('data-section-bg')).toBe('none');
  });
});
