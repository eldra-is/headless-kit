// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

/** FAQ has no media fields, so — like `stats` — there is no `preview.json` to merge on top of
 * `mock.json`: `mock.json` itself is the block's one full ("merged") content fixture; `bare` below
 * is the genuinely minimal one, only the fields the block requires. */
const bare = {
  variant: 'one-column',
  heading: 'Questions, answered',
  items: [
    {
      question: 'Do you ship internationally?',
      answer: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes, worldwide.' }] }],
      },
    },
  ],
};

// Per `@eldrajs/ui`'s own `AccordionItem`/`detailsExclusivity` comments (and this component's own
// v1 spec before it): a `<details>` click toggles its `open` attribute synchronously, but fires the
// `toggle` event — which drives `exclusive` mode's sibling-closing — via a queued task, one tick
// later.
async function flushToggle() {
  await new Promise((resolve) => setTimeout(resolve));
  await nextTick();
}

/**
 * `AccordionItem`'s exclusive-group fallback (`closeOtherOpenSiblings`, `@eldrajs/ui`) leans on a
 * real `name`-matched `<details open>` existing in the DOM; this suite's own `useUiId()`-derived
 * `accordionName` is `faq-v-0` for *every* separate `mount()` here (Vue's `useId()` counter resets
 * per fresh app, so it never varies test to test — confirmed empirically, not assumed). jsdom
 * itself, on top of that, keeps a same-`name` "currently open" reference alive for a `<details>`
 * that is left `open` — surviving `wrapper.unmount()` and going out of scope — until something
 * actually flips that element's own `open` back to `false`. Left alone, one test's own default
 * (item 0 open by design) leaks into the next mount's exclusivity click assertions and closes the
 * wrong item. Every wrapper this suite creates is tracked here and force-closed before unmount, so
 * each test starts the shared name clean regardless of run order.
 */
const trackedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of trackedWrappers.splice(0)) {
    for (const details of wrapper.findAll('details')) {
      (details.element as HTMLDetailsElement).open = false;
    }
    wrapper.unmount();
  }
});

function mountBlock(data: Record<string, unknown>, options: { editing?: boolean } = {}) {
  const opts = mountOptions({ entry: { id: 'e1', data } });
  if (options.editing) {
    const context = opts.global.provide[ELDRA_KEY] as {
      preview: { active: boolean; mode: string };
    };
    context.preview.active = true;
    context.preview.mode = 'edit';
  }
  const wrapper = mount(Block, opts);
  trackedWrappers.push(wrapper);
  return wrapper;
}

describe('faq block', () => {
  it('renders the full mock.json content with no axe violations', async () => {
    const wrapper = mountBlock(mock);
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.text()).toContain(mock.intro);
    for (const item of mock.items) expect(wrapper.text()).toContain(item.question);
    expect(wrapper.text()).toContain(mock.contactText);
    expect(wrapper.text()).toContain(mock.contactLinkLabel);
    // The lead-in and the link are one sentence: a space must separate them.
    expect(wrapper.text()).toContain(`${mock.contactText} ${mock.contactLinkLabel}`);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare, required-fields-only content with no axe violations', async () => {
    const wrapper = mountBlock(bare);
    expect(wrapper.text()).toContain(bare.heading);
    expect(wrapper.text()).toContain(bare.items[0]!.question);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['one-column', 'two-column'] as const)(
    'renders the %s variant with no axe violations',
    async (variant) => {
      const wrapper = mountBlock({ ...mock, variant });
      expect(wrapper.findAll('details')).toHaveLength(mock.items.length);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('renders each answer as rich text', () => {
    const wrapper = mountBlock(mock);
    const roots = wrapper.findAll('[data-eldra-rich-text]');
    expect(roots).toHaveLength(mock.items.length);
    expect(roots[0]!.attributes('data-eldra-field')).toBe('items.0.answer');
    expect(roots[0]!.attributes('data-eldra-entry')).toBe('e1');
    expect(wrapper.text()).toContain('US orders leave our Portland studio');
  });

  it('renders the block root as a labelled <section> that measures its own width (@container)', () => {
    const wrapper = mountBlock(mock);
    const section = wrapper.get('section');
    expect(section.classes()).toContain('@container');
    expect(section.attributes('aria-labelledby')).toBeTruthy();
  });

  it('answers cap at 65ch — the package panel class, not repeated here', () => {
    const wrapper = mountBlock(mock);
    for (const panel of wrapper.findAll('[data-part="panel"]')) {
      expect(panel.classes()).toContain('max-w-[65ch]');
    }
  });

  it('only the first item is open by default', () => {
    const wrapper = mountBlock(mock);
    const details = wrapper.findAll('details');
    expect((details[0]!.element as HTMLDetailsElement).open).toBe(true);
    for (const detail of details.slice(1)) {
      expect((detail.element as HTMLDetailsElement).open).toBe(false);
    }
  });

  it('respects an explicit open: false on the first item instead of forcing it open', () => {
    const items = mock.items.map((item, index) => (index === 0 ? { ...item, open: false } : item));
    const wrapper = mountBlock({ ...mock, items });
    const details = wrapper.findAll('details');
    expect((details[0]!.element as HTMLDetailsElement).open).toBe(false);
  });

  describe('exclusive grouping', () => {
    it('shares one name attribute across every item when exclusive is true (the default)', () => {
      const wrapper = mountBlock(mock);
      const names = wrapper.findAll('details').map((d) => d.attributes('name'));
      expect(names.every((name) => name !== undefined)).toBe(true);
      expect(new Set(names).size).toBe(1);
    });

    it('carries no name attribute on any item when exclusive is false', () => {
      const wrapper = mountBlock({ ...mock, exclusive: false });
      for (const detail of wrapper.findAll('details')) {
        expect(detail.attributes('name')).toBeUndefined();
      }
    });

    // Both items start closed here (item 0's own default-open-first behaviour is covered
    // separately, above, as a pure initial-state assertion) — opening each one through a real
    // click, in turn, is what proves the native/fallback exclusivity mechanism itself, matching
    // `@eldrajs/ui`'s own Accordion suite ("opening the second item closes the first").
    it('closes the previously open item when exclusive is true and a new one opens', async () => {
      const items = mock.items.map((item) => ({ ...item, open: false }));
      const wrapper = mount(Block, {
        ...mountOptions({ entry: { id: 'e1', data: { ...mock, exclusive: true, items } } }),
        attachTo: document.body,
      });
      trackedWrappers.push(wrapper);
      const summaries = wrapper.findAll('summary');
      const details = wrapper.findAll('details');
      await summaries[0]!.trigger('click');
      await flushToggle();
      expect((details[0]!.element as HTMLDetailsElement).open).toBe(true);

      await summaries[1]!.trigger('click');
      await flushToggle();
      expect((details[0]!.element as HTMLDetailsElement).open).toBe(false);
      expect((details[1]!.element as HTMLDetailsElement).open).toBe(true);
    });

    it('lets more than one item stay open when exclusive is false', async () => {
      const items = mock.items.map((item) => ({ ...item, open: false }));
      const wrapper = mount(Block, {
        ...mountOptions({ entry: { id: 'e1', data: { ...mock, exclusive: false, items } } }),
        attachTo: document.body,
      });
      trackedWrappers.push(wrapper);
      const summaries = wrapper.findAll('summary');
      await summaries[0]!.trigger('click');
      await flushToggle();
      await summaries[1]!.trigger('click');
      await flushToggle();
      const details = wrapper.findAll('details');
      expect((details[0]!.element as HTMLDetailsElement).open).toBe(true);
      expect((details[1]!.element as HTMLDetailsElement).open).toBe(true);
    });
  });

  describe('keyboard & accessibility', () => {
    /** Every summary is a native `<summary>` with no explicit `tabindex` override: `Tab` reaches
     *  it, and `Enter`/`Space` toggle it, entirely through the browser's own default action —
     *  `AccordionItem` adds no `@keydown` of its own (see that component's own spec, "carries no
     *  custom keydown handling"). A JS-dispatched `keydown` never triggers that native conversion
     *  in any DOM test environment (only a trusted, real key press does), so `.trigger('click')`
     *  below stands in for the browser's own Enter/Space outcome, exactly as that component's own
     *  suite does. */
    it('every summary is natively focusable (Tab reaches it) with no custom keydown handling', () => {
      const wrapper = mountBlock(mock);
      for (const summary of wrapper.findAll('summary')) {
        expect(summary.attributes('tabindex')).toBeUndefined();
      }
    });

    it('a link inside an open answer stays reachable (no keyboard trap)', () => {
      const items = [
        {
          question: 'Where is your returns policy?',
          open: true,
          answer: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'See our returns page.',
                    marks: [{ type: 'link', attrs: { href: '/pages/returns' } }],
                  },
                ],
              },
            ],
          },
        },
      ];
      const wrapper = mountBlock({ ...mock, items });
      const link = wrapper.get('[data-eldra-rich-text] a');
      expect(link.attributes('href')).toBe('/pages/returns');
      expect(link.attributes('tabindex')).toBeUndefined();
    });

    it('has no axe violations with reduced motion tokens absent (instant chevron/panel state)', async () => {
      const wrapper = mountBlock(mock);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });
  });

  describe('two-column layout', () => {
    it('carries the sticky head class with the header-height offset from 64rem', () => {
      const wrapper = mountBlock({ ...mock, variant: 'two-column' });
      const head = wrapper.get('h2').element.parentElement!;
      expect(head.className).toContain('@content:sticky');
      expect(head.className).toContain(
        '@content:top-[calc(2rem_+_var(--eldra-header-height,0px))]'
      );
    });

    it('places the contact line inside the head column, not after the accordion', () => {
      const wrapper = mountBlock({ ...mock, variant: 'two-column' });
      const head = wrapper.get('h2').element.parentElement!;
      expect(head.textContent).toContain(mock.contactLinkLabel);
    });
  });

  describe('contact line', () => {
    it('renders the contact line when contactLinkHref and contactLinkLabel are set', () => {
      const wrapper = mountBlock(mock);
      const link = wrapper.get('a[href="/pages/contact"]');
      expect(link.text()).toBe(mock.contactLinkLabel);
      expect(wrapper.text()).toContain(mock.contactText);
    });

    it('hides the contact line when contactLinkHref is empty', () => {
      const wrapper = mountBlock({ ...mock, contactLinkHref: '' });
      expect(wrapper.text()).not.toContain(mock.contactLinkLabel);
      expect(wrapper.text()).not.toContain(mock.contactText);
    });

    it('hides the contact line when contactLinkLabel is empty', () => {
      const wrapper = mountBlock({ ...mock, contactLinkLabel: '' });
      expect(wrapper.find('a[href="/pages/contact"]').exists()).toBe(false);
    });
  });

  describe('empty items', () => {
    it('renders nothing live when items is empty', () => {
      const wrapper = mountBlock({ ...mock, items: [] });
      expect(wrapper.find('section').exists()).toBe(false);
      expect(wrapper.text()).toBe('');
    });

    it('shows heading and first-question hints in the editor when items is empty, with no axe violations', async () => {
      const wrapper = mountBlock({ ...mock, heading: '', items: [] }, { editing: true });
      expect(wrapper.find('section').exists()).toBe(true);
      expect(wrapper.text()).toContain('Add a heading');
      expect(wrapper.text()).toContain('Add a question');
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
