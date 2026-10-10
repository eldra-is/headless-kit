// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

/** Timeline has no media fields, so — like `stats`/`faq` — there is no `preview.json` to merge on
 * top of `mock.json`. `mock.json` itself is therefore the block's one full ("merged") content
 * fixture; `bare` below is the genuinely minimal one, only the fields the block requires. */
const bare = {
  variant: 'steps',
  heading: 'How it is made',
  items: [{ title: 'One step' }],
};

/** The auto-generated "VariantHistory" Storybook story is `mock.json` with only `variant`
 * swapped, so its items carry no `year` (the Northwind/Portland-normalised copy for this variant
 * lives in the design spec, not `mock.json`). This fixture is the block's own realistic `history`
 * content, used here to actually exercise the year/marker/axe behaviour that empty years never
 * would. */
const historyItems = [
  {
    year: '2014',
    title: 'A stall in the Saturday market',
    text: 'Twelve blankets, a folding table and a borrowed card reader.',
  },
  {
    year: '2016',
    title: 'Our first potter joins',
    text: 'Tomás brings the speckled glaze that is still our best seller.',
  },
  {
    year: '2019',
    title: 'Tannery Lane opens',
    text: 'A workshop and shop under one roof, with room for the loom.',
  },
  {
    year: '2023',
    title: '38 makers and counting',
    text: 'From Shetland knitters to a woodturner in the Kyoto hills.',
  },
];
const historyMock = {
  ...mock,
  variant: 'history',
  heading: 'Twelve years, slowly',
  items: historyItems,
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

describe('timeline block', () => {
  it('renders the full mock.json content with no axe violations', async () => {
    const wrapper = mountBlock({ ...mock, linkHref: '/collections/blankets' });
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.text()).toContain(mock.intro);
    expect(wrapper.text()).toContain(mock.linkLabel);
    for (const item of mock.items) {
      expect(wrapper.text()).toContain(item.title);
      expect(wrapper.text()).toContain(item.text);
    }
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare, required-fields-only content with no axe violations', async () => {
    const wrapper = mountBlock(bare);
    expect(wrapper.text()).toContain(bare.heading);
    expect(wrapper.text()).toContain(bare.items[0]!.title);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the steps variant with no axe violations', async () => {
    const wrapper = mountBlock(mock);
    expect(wrapper.findAll('li')).toHaveLength(mock.items.length);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the history variant with no axe violations', async () => {
    const wrapper = mountBlock(historyMock);
    expect(wrapper.findAll('li')).toHaveLength(historyItems.length);
    for (const item of historyItems) {
      expect(wrapper.text()).toContain(item.year);
      expect(wrapper.text()).toContain(item.title);
    }
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the block root as a labelled <section> that measures its own width (@container)', () => {
    const wrapper = mountBlock(mock);
    const section = wrapper.get('section');
    expect(section.classes()).toContain('@container');
    expect(section.attributes('aria-labelledby')).toBeTruthy();
  });

  it('is an <ol> of items, each with an h3 title, after the h2', () => {
    const wrapper = mountBlock(mock);
    const heading = wrapper.get('h2');
    const list = wrapper.get('ol');
    expect(
      heading.element.compareDocumentPosition(list.element) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const items = list.findAll('li');
    expect(items).toHaveLength(mock.items.length);
    items.forEach((item, index) => {
      expect(item.get('h3').text()).toContain(mock.items[index]!.title);
    });
  });

  it('reads "Step 1: Fleece from two farms" once, with the visible number hidden from assistive tech', () => {
    const wrapper = mountBlock(mock);
    const firstTitle = wrapper.findAll('h3')[0]!;
    expect(firstTitle.text()).toBe('Step 1: Fleece from two farms');
    // The visually hidden prefix and the visible number are two different nodes: the sr-only
    // text is read once via the h3's own text content, and the visual number is separately
    // aria-hidden so nothing doubles it up.
    expect(firstTitle.findAll('.sr-only')).toHaveLength(1);
    const number = wrapper.get('li span[aria-hidden="true"].tabular-nums');
    expect(number.text()).toBe('1');
  });

  it('never shows a year for the steps variant, even when items carry one', () => {
    const items = mock.items.map((item, index) => ({ ...item, year: String(2000 + index) }));
    const wrapper = mountBlock({ ...mock, items });
    expect(wrapper.text()).not.toContain('2000');
  });

  it('shows the year in accent above the title for the history variant', () => {
    const wrapper = mountBlock(historyMock);
    const year = wrapper.get('p.text-accent');
    expect(year.text()).toBe('2014');
  });

  it('renders no connector for a single item', () => {
    const wrapper = mountBlock({ ...mock, items: [mock.items[0]!] });
    expect(wrapper.findAll('li')).toHaveLength(1);
    expect(wrapper.findAll('[data-part="connector"]')).toHaveLength(0);
  });

  it('sizes the marker to itself, not the full item width, so the connectors anchor correctly', () => {
    // Regression guard: an earlier version wrapped the marker in an unconstrained <div
    // class="relative">, which stretched to the item's full single-column track from `@content`
    // (grid's default `justify-self: stretch`) and became the connectors' own positioning context
    // — under-reaching the next item below `@content` and drawing a near-full-column-width line
    // from `@content`. The marker itself must stay pinned to its own box (`justify-self-start`)
    // and the `<li>` — not the marker — is what the connectors are positioned against.
    const wrapper = mountBlock({ ...mock, items: [mock.items[0]!, mock.items[1]!] });
    const li = wrapper.findAll('li')[0]!;
    const marker = li.element.firstElementChild as HTMLElement;
    expect(marker.className).toContain('justify-self-start');
    expect(marker.className).toContain('size-10');
    // The 1.5px `steps` ring: the spec's own measurement, via the same literal arbitrary-value
    // utility the package's own CSS uses for this width (no Tailwind border-width scale step is
    // that fine).
    expect(marker.className).toContain('border-[1.5px]');
    // The connectors are the marker's own next siblings on the <li> — never nested inside it.
    expect(marker.nextElementSibling?.getAttribute('data-part')).toBe('connector');
  });

  it("pins the connector stub's extent classes at both breakpoints", () => {
    const wrapper = mountBlock({ ...mock, items: [mock.items[0]!, mock.items[1]!] });
    const li = wrapper.findAll('li')[0]!;
    const connectors = li.findAll('[data-part="connector"]');
    expect(connectors).toHaveLength(2);
    const [vertical, horizontal] = connectors;
    // Below `@content`: a line from under the marker (`top-10` = 2.5rem, the `steps` marker's own
    // height) reaching `bottom-[-2rem]` past the item's own bottom edge into the 2rem item gap —
    // never a fixed short segment that only reaches as far as the marker's own box.
    expect(vertical!.classes()).toEqual(
      expect.arrayContaining([
        'absolute',
        'w-px',
        'bg-border-strong',
        'top-10',
        'left-5',
        'bottom-[-2rem]',
      ])
    );
    expect(vertical!.classes()).toContain('@content:hidden');
    // From `@content`: a short stub starting 0.75rem after the marker (`@content:left-13` =
    // 3.25rem = the 2.5rem marker + 0.75rem) and reaching 0.75rem past the item's own right edge
    // (`@content:-right-3`), into the column gap.
    expect(horizontal!.classes()).toEqual(
      expect.arrayContaining(['@content:left-13', '@content:top-5', '@content:-right-3', 'h-px'])
    );
    expect(horizontal!.classes()).toContain('hidden');
    expect(horizontal!.classes()).toContain('@content:block');
  });

  it('history markers keep the same connector anchoring, sized and offset for the smaller dot', () => {
    const wrapper = mountBlock({ ...historyMock, items: [historyItems[0]!, historyItems[1]!] });
    const li = wrapper.findAll('li')[0]!;
    const marker = li.element.firstElementChild as HTMLElement;
    expect(marker.className).toContain('justify-self-start');
    expect(marker.className).toContain('size-4');
    expect(marker.className).toContain('border-2');
    const connectors = li.findAll('[data-part="connector"]');
    const [vertical, horizontal] = connectors;
    // 1.75rem (the `history` dot's own height) below `@content`; 1rem after the dot from `@content`.
    expect(vertical!.classes()).toEqual(
      expect.arrayContaining(['top-7', 'left-2', 'bottom-[-2rem]'])
    );
    expect(horizontal!.classes()).toEqual(
      expect.arrayContaining(['@content:left-7', '@content:top-2', '@content:-right-3'])
    );
  });

  it('renders 12 items as 12, and the last item of a full row keeps its connector stub', () => {
    const items = Array.from({ length: 12 }, (_, index) => ({ title: `Step ${index + 1}` }));
    const wrapper = mountBlock({ ...mock, items, columns: '4' });
    const list = wrapper.get('ol');
    expect(list.classes()).toContain('@content:grid-cols-4');
    const liElements = wrapper.findAll('li');
    expect(liElements).toHaveLength(12);
    // Index 3 is the last item of the first (full) row of 4: it keeps its connector, signalling
    // the sequence continues onto the next row.
    expect(liElements[3]!.findAll('[data-part="connector"]')).toHaveLength(2);
    expect(liElements[7]!.findAll('[data-part="connector"]')).toHaveLength(2);
    // Only the true last item in the whole sequence has none.
    expect(liElements[11]!.findAll('[data-part="connector"]')).toHaveLength(0);
  });

  it('maps auto columns to the item count, capped at 4', () => {
    expect(
      mountBlock({ ...mock, items: mock.items.slice(0, 2) })
        .get('ol')
        .classes()
    ).toContain('@content:grid-cols-2');
    expect(
      mountBlock({
        ...mock,
        items: Array.from({ length: 6 }, (_, i) => ({ title: `Item ${i + 1}` })),
      })
        .get('ol')
        .classes()
    ).toContain('@content:grid-cols-4');
  });

  it('the only focusable element is the header link', () => {
    const wrapper = mountBlock({ ...mock, linkHref: '/collections/blankets' });
    const focusable = wrapper.findAll('a, button, input, [tabindex]');
    expect(focusable).toHaveLength(1);
    expect(focusable[0]!.element.tagName).toBe('A');
    expect(focusable[0]!.text()).toContain(mock.linkLabel);
  });

  it('hides the header link when linkHref is empty', () => {
    const wrapper = mountBlock({ ...mock, linkHref: '' });
    expect(wrapper.find('a').exists()).toBe(false);
  });

  it('hides the header link when linkLabel is empty', () => {
    const wrapper = mountBlock({ ...mock, linkLabel: '' });
    expect(wrapper.find('a').exists()).toBe(false);
  });

  it('has no transition or animation class anywhere in the block, outside the package Link', () => {
    // The header `Link` renders `variant="standalone" arrow` (spec → Composition), and
    // `@eldrajs/ui`'s own `Link` owns a `motion-reduce:`-gated `transition-[translate]` on its
    // arrow glyph — the ordinary hover affordance every other `arrow` link in this starter carries
    // (`feature-grid`, `split-content`, `footer`), not motion this block introduces. The spec's own
    // "No motion in this block" (Acceptance criteria) is about the timeline content itself
    // (markers, connectors, numbers) never animating — checked here by excluding the link and its
    // children, the one part of the DOM the package itself, not this block, owns.
    const wrapper = mountBlock(mock);
    for (const element of wrapper.element.querySelectorAll('*')) {
      if (element.closest('a') !== null) continue;
      for (const className of element.classList) {
        expect(className.startsWith('transition-')).toBe(false);
        expect(className.startsWith('animate-')).toBe(false);
      }
    }
  });

  describe('empty items', () => {
    it('renders nothing live when items is empty', () => {
      const wrapper = mountBlock({ ...mock, items: [] });
      expect(wrapper.find('section').exists()).toBe(false);
      expect(wrapper.text()).toBe('');
    });

    it('shows heading and item hints in the editor when items is empty, with no axe violations', async () => {
      const wrapper = mountBlock({ ...mock, heading: '', items: [] }, { editing: true });
      expect(wrapper.find('section').exists()).toBe(true);
      expect(wrapper.text()).toContain('Add a heading');
      expect(wrapper.text()).toContain('Add a step');
      expect(wrapper.findAll('li')).toHaveLength(1);
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
