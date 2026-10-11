// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import { mountOptions } from '../../../test/support/mountBlock';
import Block from '../Block.vue';
import mock from '../mock.json';

/** Rich text has no media fields, so — like `faq`/`stats` — there is no `preview.json` to merge on
 *  top of `mock.json`: `mock.json` itself is the block's one full ("merged") content fixture. */
const merged = mock;

/** The genuinely minimal fixture: only the fields the block requires (`body`) plus the two other
 *  required selects, no heading — this is also the spec's own "no-heading example" copy,
 *  normalised to Northwind's own Portland/Oregon facts (`global-constraints.md`). */
const bare = {
  alignment: 'left',
  container: 'narrow',
  body: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Every piece is designed in Oregon and made by one of four family-run workshops. We price fairly all year and repair what we sell.',
          },
        ],
      },
    ],
  },
};

function docWithHeadingLevels(levels: number[]): Record<string, unknown> {
  return {
    type: 'doc',
    content: levels.map((level) => ({
      type: 'heading',
      attrs: { level },
      content: [{ type: 'text', text: `Heading at level ${level}` }],
    })),
  };
}

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

describe('rich-text block', () => {
  it('renders the full mock.json content with no axe violations', async () => {
    const wrapper = mountBlock(merged);
    expect(wrapper.text()).toContain(merged.heading);
    expect(wrapper.text()).toContain('Northwind started in 2014');
    expect(wrapper.text()).toContain('our makers');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders the bare, required-fields-only content with no axe violations', async () => {
    const wrapper = mountBlock(bare);
    expect(wrapper.text()).toContain('Every piece is designed in Oregon');
    expect(wrapper.find('h2').exists()).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each([
    ['left', 'narrow'],
    ['left', 'content'],
    ['center', 'narrow'],
    ['center', 'content'],
  ] as const)(
    'renders alignment=%s container=%s with no axe violations',
    async (alignment, container) => {
      const wrapper = mountBlock({ ...mock, alignment, container });
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('with a heading, the root is a <section> labelled by the h2', () => {
    const wrapper = mountBlock(mock);
    const section = wrapper.get('section');
    const heading = wrapper.get('h2');
    expect(section.attributes('aria-labelledby')).toBe(heading.attributes('id'));
    expect(heading.text()).toBe(mock.heading);
  });

  it('without a heading, there is no <section> landmark at all', () => {
    const { heading: _omit, ...withoutHeading } = mock;
    const wrapper = mountBlock(withoutHeading);
    expect(wrapper.find('section').exists()).toBe(false);
    expect(wrapper.find('section[aria-labelledby]').exists()).toBe(false);
    expect(wrapper.find('h2').exists()).toBe(false);
    // Still renders the body — just with no landmark wrapping it.
    expect(wrapper.text()).toContain('Northwind started in 2014');
  });

  it('body headings render as h3/h4, never h1/h2, regardless of authored level', () => {
    const wrapper = mountBlock({ ...mock, body: docWithHeadingLevels([1, 2, 3, 4, 6]) });
    const richText = wrapper.get('[data-eldra-rich-text]');
    expect(richText.findAll('h1')).toHaveLength(0);
    expect(richText.findAll('h2')).toHaveLength(0);
    expect(richText.findAll('h3')).toHaveLength(3); // levels 1, 2 and 3 all floor to h3
    expect(richText.findAll('h4')).toHaveLength(1); // level 4 stays h4
    expect(richText.findAll('h6')).toHaveLength(1); // level 6 stays h6 (above the floor)
  });

  it('does not mutate the entry data when flooring heading levels', () => {
    const data = { ...mock, body: docWithHeadingLevels([1, 2]) };
    mountBlock(data);
    expect((data.body.content[0] as { attrs: { level: number } }).attrs.level).toBe(1);
    expect((data.body.content[1] as { attrs: { level: number } }).attrs.level).toBe(2);
  });

  it('center adds prose-eldra-center to the rich text, with a code block still under it', () => {
    const body = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Care, not replacement' }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'npm run mend' }] },
      ],
    };
    const wrapper = mountBlock({ ...mock, alignment: 'center', body });
    const richText = wrapper.get('[data-eldra-rich-text]');
    expect(richText.classes()).toContain('prose-eldra-center');
    const pre = wrapper.get('pre');
    // The CSS rule that keeps code left-aligned in the centred variant
    // (`.prose-eldra-center :where(pre)`) only matches when `pre` sits under that class — proven
    // here structurally, since jsdom does not apply the stylesheet itself.
    expect(pre.element.closest('.prose-eldra-center')).not.toBeNull();
  });

  it('left + content carries the split grid classes; left + narrow does not', () => {
    const split = mountBlock({ ...mock, alignment: 'left', container: 'content' });
    const splitColumns = split.get('h2').element.parentElement!;
    expect(splitColumns.className).toContain('@content:grid-cols-[5fr_7fr]');
    expect(splitColumns.className).toContain('@content:gap-16');

    const stacked = mountBlock({ ...mock, alignment: 'left', container: 'narrow' });
    const stackedColumns = stacked.get('h2').element.parentElement!;
    expect(stackedColumns.className).not.toContain('grid-cols-[5fr_7fr]');
  });

  it('renders links inside the shared rich-text typography, which underlines them', () => {
    const wrapper = mountBlock(mock);
    const link = wrapper.get('[data-eldra-rich-text] a');
    expect(link.attributes('href')).toBe('/pages/makers');
    // `.prose-eldra :where(a)` (app/assets/main.css) is what draws the underline — proven here by
    // structural containment, the same way `center adds prose-eldra-center...` above proves the
    // left-aligned-code rule's reach.
    expect(link.element.closest('.prose-eldra')).not.toBeNull();
  });

  it('renders nothing live with an empty body — not even the section root', () => {
    const wrapper = mountBlock({ ...mock, body: { type: 'doc', content: [] } });
    expect(wrapper.find('section').exists()).toBe(false);
    expect(wrapper.find('div').exists()).toBe(false);
    expect(wrapper.text()).toBe('');
  });

  it('shows heading and body hints only in the editor when both are empty, with no axe violations', async () => {
    const data = { ...mock, heading: '', body: { type: 'doc', content: [] } };
    const live = mountBlock(data);
    expect(live.find('section').exists()).toBe(false);
    expect(live.text()).toBe('');

    const editing = mountBlock(data, { editing: true });
    expect(editing.text()).toContain('Add a heading');
    expect(editing.text()).toContain('Optional');
    expect(editing.text()).toContain('Start writing');
    expect(editing.text()).toContain('Type / for headings, lists, quotes and links.');
    expect(await axe(editing.element)).toHaveNoViolations();
  });

  it('defaults alignment to left and container to narrow when unset', () => {
    const { alignment: _a, container: _c, ...rest } = mock;
    const wrapper = mountBlock(rest);
    const columns = wrapper.get('h2').element.parentElement!;
    // left + narrow (the defaults): stacked, never the split grid.
    expect(columns.className).not.toContain('grid-cols-[5fr_7fr]');
    expect(columns.className).not.toContain('text-center');
  });
});
