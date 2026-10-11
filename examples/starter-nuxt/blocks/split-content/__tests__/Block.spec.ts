// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { axe } from '../../../test/support/axe';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

// `mock.json` is exactly what Studio seeds on insert (no media — Core's write-side media
// validator rejects a fixture-shaped object there); `preview.json` overlays the two rows with the
// demo studio/mill imagery `scripts/generate-stories.mjs`'s `Default` story merges onto it.
const withImage = { ...mock, ...preview };

const START_WITH = ['image-left', 'image-right'] as const;

/** Spec "Split content" → "Default content (Northwind Goods)": the text-only row example, used
 *  here (not in `mock.json`/`preview.json`, which only ever carry the two studio/mill rows) to
 *  exercise the "no image" state with real spec copy instead of invented placeholder text. */
const textOnlyRow = {
  heading: 'We mend what we make',
  text: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Moth hole or chipped glaze? Send it back and we repair it free, however old it is. Around 400 pieces come home to us each year.',
          },
        ],
      },
    ],
  },
  linkLabel: 'Start a repair',
  href: '/pages/repairs',
};

describe('split-content block', () => {
  it('renders the bare mock content and passes axe', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.rows[0]!.heading);
    expect(wrapper.text()).toContain(mock.rows[1]!.heading);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the merged preview content (with images) and passes axe', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImage } }));
    expect(wrapper.findAll('img')).toHaveLength(withImage.rows.length);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(START_WITH)('passes axe with startWith set to %s', async (startWith) => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...withImage, startWith } } })
    );
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  /**
   * Every `@tablet:`/`@content:` class in this block measures against the nearest `@container`
   * ancestor — `Section`'s own root carries it (see `Section.vue`). Asserted directly so a future
   * change that swaps the root away from `Section` fails loudly instead of silently keeping the
   * block at its mobile layout at every width.
   */
  it('the block root is a Section (a query container)', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImage } }));
    expect(wrapper.get('section').classes()).toContain('@container');
  });

  it('renders rows as an ordered role=list, one h2 heading per row', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImage } }));
    const list = wrapper.get('ol[role="list"]');
    const items = list.findAll('li');
    expect(items).toHaveLength(withImage.rows.length);
    const headings = list.findAll('h2');
    expect(headings).toHaveLength(withImage.rows.length);
    headings.forEach((heading, index) => {
      expect(heading.text()).toBe(withImage.rows[index]!.heading);
    });
  });

  it.each(START_WITH)(
    'keeps image before text in DOM order for every row, whichever side is visual (startWith=%s)',
    (startWith) => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...withImage, startWith } } })
      );
      const items = wrapper.findAll('li');
      expect(items).toHaveLength(withImage.rows.length);
      items.forEach((item) => {
        const first = item.element.children[0] as HTMLElement;
        expect(first.querySelector('img')).not.toBeNull();
      });
    }
  );

  it('alternates the grid column order per row: odd rows take the startWith side, even rows the opposite', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...withImage, startWith: 'image-left' } } })
    );
    const items = wrapper.findAll('li');
    // Row 1 (index 0, image-left): the image's own 7fr column comes first, no order override.
    expect(items[0]!.classes()).toContain('@tablet:grid-cols-[7fr_5fr]');
    expect(items[0]!.get('[data-part="root"]').classes()).not.toContain('@tablet:order-2');
    // Row 2 (index 1, image-right): the text's 5fr column comes first; the image (still first in
    // the DOM) is pushed to the second, 7fr track with `order`.
    expect(items[1]!.classes()).toContain('@tablet:grid-cols-[5fr_7fr]');
    expect(items[1]!.get('[data-part="root"]').classes()).toContain('@tablet:order-2');
  });

  it('a row with no image renders no <img>, stays single column, and gives its text a 40rem max width', () => {
    const wrapper = mount(
      Block,
      mountOptions({
        entry: { id: 'e1', data: { startWith: 'image-left', rows: [textOnlyRow] } },
      })
    );
    const item = wrapper.get('li');
    expect(item.find('img').exists()).toBe(false);
    expect(item.classes().some((c) => c.startsWith('@tablet:grid-cols'))).toBe(false);
    expect(item.element.children).toHaveLength(1);
    expect((item.element.children[0] as HTMLElement).className).toContain('max-w-[40rem]');
  });

  it('renders six items for a full six-row list', () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      ...withImage.rows[0]!,
      heading: `Row ${index + 1}`,
    }));
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { startWith: 'image-left', rows } } })
    );
    expect(wrapper.findAll('li')).toHaveLength(6);
  });

  it('every row link is reachable in source order', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImage } }));
    const links = wrapper.element.querySelectorAll('a[href]');
    expect(Array.from(links).map((link) => link.textContent?.trim())).toEqual(
      withImage.rows.map((row) => row.linkLabel)
    );
    expect(Array.from(links).map((link) => link.getAttribute('href'))).toEqual(
      withImage.rows.map((row) => row.href)
    );
  });

  it("a row link is a real <a href>, so Tab and Enter are the platform's own way to reach and activate it", () => {
    const wrapper = mount(Block, {
      ...mountOptions({ entry: { id: 'e1', data: withImage } }),
      attachTo: document.body,
    });
    const link = wrapper.get('a[href]').element as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('tabindex')).toBeNull();
    link.focus();
    expect(document.activeElement).toBe(link);
    wrapper.unmount();
  });

  it('renders a row link with no safe href as no link at all, dropping straight to nothing focusable there', () => {
    const rows = [{ ...withImage.rows[0]!, href: 'javascript:alert(1)' }];
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { startWith: 'image-left', rows } } })
    );
    expect(wrapper.find('a[href]').exists()).toBe(false);
  });

  it('renders the row text as rich-text paragraphs, with an inline link that stays a real, focusable <a>', () => {
    const rows = [
      {
        heading: 'Care',
        text: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Read our ' },
                {
                  type: 'text',
                  text: 'care guide',
                  marks: [{ type: 'link', attrs: { href: '/pages/care' } }],
                },
                { type: 'text', text: ' before the first wash.' },
              ],
            },
          ],
        },
      },
    ];
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { startWith: 'image-left', rows } } })
    );
    const richText = wrapper.get('.prose-eldra');
    const paragraph = richText.get('p');
    const link = paragraph.get('a');
    expect(link.attributes('href')).toBe('/pages/care');
    expect(link.text()).toBe('care guide');
  });

  it('carries the framing marker attributes on a rendered row image', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'row-1', data: { ...withImage, startWith: 'image-left' } } })
    );
    const img = wrapper.get('img');
    expect(img.attributes('data-eldra-framing')).toBe('rows.0.image');
    expect(img.attributes('data-eldra-framing-entry')).toBe('row-1');
  });

  it('applies the xl radius to every row image frame', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: withImage } }));
    for (const frame of wrapper.findAll('[data-part="frame"]')) {
      expect(frame.classes()).toContain('rounded-xl');
    }
  });
});
