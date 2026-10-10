// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { ELDRA_KEY } from '@eldrajs/theme-vue';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';

/** `mock.json` is Studio's insert seed (no media); `preview.json` is the demo-imagery overlay a
 *  story/preview merges on top of it — same shallow-merge shape `testimonials`'s own test uses. */
const withMedia = { ...mock, ...preview };

/** The genuinely minimal fixture: only the fields the block requires. */
const bare = {
  heading: mock.heading,
  people: [{ name: 'A. Baker', role: 'Team member' }],
};

const SECTION_BACKGROUNDS = ['none', 'surface', 'surface-strong'] as const;

/** The injected fetcher still resolves through a promise; flush one microtask/macrotask turn
 *  before asserting on icon markup — the same wait `feature-grid`'s own spec uses. */
async function flushIcons(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
}

function mountBlock(data: Record<string, unknown>, options: { editing?: boolean } = {}) {
  const base = mountOptions({ entry: { id: 'e1', data } });
  const opts = {
    ...base,
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

/** The outer people grid is the first `<ul>` in the block (a person's own icon-link row is a
 *  second, nested `<ul>`) — its direct `<li>` children are the people. */
function personItems(wrapper: ReturnType<typeof mountBlock>): Element[] {
  const grid = wrapper.findAll('ul')[0]!;
  return Array.from(grid.element.querySelectorAll(':scope > li'));
}

describe('team block', () => {
  it('renders the full (mock + preview) content with no axe violations', async () => {
    const wrapper = mountBlock(withMedia);
    expect(wrapper.text()).toContain(withMedia.heading);
    expect(wrapper.text()).toContain(withMedia.intro);
    for (const person of withMedia.people) expect(wrapper.text()).toContain(person.name);
    await flushIcons();
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders no header link when linkHref is empty, even with linkLabel set — the seeded state', () => {
    const wrapper = mountBlock(mock);
    expect(wrapper.text()).not.toContain(mock.linkLabel);
    // Each person's own social links still render — only the header's own link is gated.
    const personLinkCount = mock.people.flatMap((p) => p.links ?? []).length;
    expect(wrapper.findAll('a')).toHaveLength(personLinkCount);
  });

  it('renders the bare, required-fields-only content with no axe violations', async () => {
    const wrapper = mountBlock(bare);
    expect(wrapper.text()).toContain(bare.heading);
    expect(wrapper.text()).toContain(bare.people[0]!.name);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(SECTION_BACKGROUNDS)(
    'renders sectionBackground "%s" with no axe violations',
    async (sectionBackground) => {
      const wrapper = mountBlock({ ...withMedia, sectionBackground });
      await flushIcons();
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('defaults sectionBackground to none when unset', () => {
    const { sectionBackground: _omit, ...withoutBackground } = mock;
    const wrapper = mountBlock(withoutBackground);
    expect(wrapper.get('section').attributes('data-section-bg')).toBe('none');
  });

  it('people are a <ul> of <li> with each name as an <h3> under the block’s own <h2>', () => {
    const wrapper = mountBlock(mock);
    const heading = wrapper.get('h2');
    const grid = wrapper.findAll('ul')[0]!;
    expect(
      heading.element.compareDocumentPosition(grid.element) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    const names = wrapper.findAll('h3').map((h) => h.text());
    expect(names).toEqual(mock.people.map((person) => person.name));
  });

  it("names every icon link with the person's name, and keeps the icon itself aria-hidden", async () => {
    const wrapper = mountBlock(mock);
    await flushIcons();
    for (const person of mock.people) {
      for (const link of person.links ?? []) {
        const anchor = wrapper.get(`a[href="${link.href}"]`);
        expect(anchor.attributes('aria-label')).toContain(person.name);
        expect(anchor.get('svg').attributes('aria-hidden')).toBe('true');
      }
    }
  });

  it('defaults photo alt to "Portrait of {name}", and an explicit altText wins', () => {
    const wrapper = mountBlock(withMedia);
    const firstPerson = withMedia.people[0]!;
    const firstImg = wrapper.findAll('img')[0]!;
    expect(firstImg.attributes('alt')).toBe(`Portrait of ${firstPerson.name}`);

    const customAlt = 'Ingrid at the market stall, laughing';
    const overridden = {
      ...withMedia,
      people: withMedia.people.map((person, index) =>
        index === 0 ? { ...person, photo: { ...person.photo, altText: customAlt } } : person
      ),
    };
    const overriddenWrapper = mountBlock(overridden);
    expect(overriddenWrapper.findAll('img')[0]!.attributes('alt')).toBe(customAlt);
  });

  it('with no photos every item carries the top-rule class, and nothing renders an <img>', () => {
    const wrapper = mountBlock(mock);
    expect(wrapper.find('img').exists()).toBe(false);
    const items = personItems(wrapper);
    expect(items).toHaveLength(mock.people.length);
    for (const item of items) {
      expect(item.classList.contains('border-t')).toBe(true);
      expect(item.classList.contains('pt-4')).toBe(true);
    }
  });

  it('caps a single person’s grid at 18rem', () => {
    const wrapper = mountBlock({ ...mock, people: [mock.people[0]] });
    const grid = wrapper.findAll('ul')[0]!;
    expect(grid.classes()).toEqual(expect.arrayContaining(['mx-auto', 'max-w-[18rem]']));
  });

  it('does not cap the grid when there is more than one person', () => {
    const wrapper = mountBlock(mock);
    const grid = wrapper.findAll('ul')[0]!;
    expect(grid.classes()).not.toContain('max-w-[18rem]');
  });

  it('renders 12 people as 12 list items', () => {
    const people = Array.from({ length: 12 }, (_, index) => ({
      name: `Person ${index + 1}`,
      role: 'Team member',
    }));
    const wrapper = mountBlock({ ...mock, people });
    expect(personItems(wrapper)).toHaveLength(12);
    expect(wrapper.findAll('h3')).toHaveLength(12);
  });

  describe('empty people', () => {
    it('renders nothing live when people is empty', () => {
      const wrapper = mountBlock({ ...mock, people: [] });
      expect(wrapper.find('section').exists()).toBe(false);
      expect(wrapper.text()).toBe('');
    });

    it('shows heading and person hints in the editor when people is empty, with no axe violations', async () => {
      const wrapper = mountBlock({ ...mock, heading: '', people: [] }, { editing: true });
      expect(wrapper.find('section').exists()).toBe(true);
      expect(wrapper.text()).toContain('Add a heading');
      expect(wrapper.text()).toContain('Add a person');
      expect(await axe(wrapper.element)).toHaveNoViolations();
    });

    it('shows an editor-only hint for a still-empty person, and renders it live as nothing', async () => {
      const data = { ...mock, people: [{ name: '', role: '' }] };
      const live = mountBlock(data);
      expect(live.find('section').exists()).toBe(false);

      const editing = mountBlock(data, { editing: true });
      expect(editing.text()).toContain('Add a person');
      expect(await axe(editing.element)).toHaveNoViolations();
    });
  });

  describe('keyboard path', () => {
    it('Tab reaches the header link, then each person’s links, in reading order', () => {
      const linkHref = '/pages/makers';
      const wrapper = mountBlock({ ...mock, linkHref });
      const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'));
      const expected = [
        linkHref,
        ...mock.people.flatMap((person) => (person.links ?? []).map((link) => link.href)),
      ];
      expect(hrefs).toEqual(expected);
      // Nothing anywhere in the block carries an explicit tabindex, so nothing is pulled out of
      // or reordered within the natural document tab order.
      expect(wrapper.findAll('[tabindex]')).toHaveLength(0);
    });
  });

  it('skips a link whose type is outside the option set instead of failing the render', async () => {
    const people = [
      {
        ...mock.people[0]!,
        links: [
          { type: 'myspace', href: 'https://myspace.example/ingrid' },
          { type: 'email', href: 'mailto:ingrid@northwind.example' },
        ],
      },
    ];
    const wrapper = mountBlock({ ...mock, people });
    expect(wrapper.findAll('li a')).toHaveLength(1);
    expect(wrapper.find('li a').attributes('href')).toBe('mailto:ingrid@northwind.example');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
