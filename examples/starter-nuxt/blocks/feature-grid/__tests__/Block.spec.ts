// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import preview from '../preview.json';
import { mountOptions } from '../../../test/support/mountBlock';
import { ICON_FETCHER_KEY, type IconFetcher } from '../../../app/composables/iconFetcher';
import { tablerIconSvg } from '../../../server/utils/tablerIcon';

// `mock.json` is the seed Studio writes on insert — its items carry no
// `image` (see task-9b-live-report.md, Finding 2); `preview.json` is the
// demo-imagery overlay `scripts/generate-stories.mjs`'s `Default` story
// merges onto it (a full `items` replacement, since the overlay contract
// merges shallowly).
const withImages = { ...mock, ...preview };

// `feature-grid` items may use a Tabler icon (`EldraIcon`) instead of an image;
// provide the same synchronous, network-free fetcher stub `eldraIcon.spec.ts`
// uses (see `useEldraIcon.ts`), merged onto `mountOptions()`'s own provide
// map so the shared Eldra context still comes through too.
const stubFetcher: IconFetcher = async (name) => tablerIconSvg(name);

function mountWithIcons(entry: { id: string; data: Record<string, unknown> }) {
  const base = mountOptions({ entry });
  return {
    ...base,
    global: {
      ...base.global,
      provide: { ...base.global.provide, [ICON_FETCHER_KEY]: stubFetcher },
    },
  };
}

describe('feature-grid block', () => {
  it('renders the bare mock.json content, no images yet (the freshly-inserted state)', async () => {
    const wrapper = mount(Block, mountWithIcons({ id: 'e1', data: mock }));
    expect(wrapper.text()).toContain(mock.heading);
    for (const item of mock.items) expect(wrapper.text()).toContain(item.title);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders each item image once preview.json overlays them', async () => {
    const wrapper = mount(Block, mountWithIcons({ id: 'e1', data: withImages }));
    expect(wrapper.findAll('img')).toHaveLength(withImages.items.length);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['cards', 'plain'] as const)(
    'renders the %s variant with no axe violations, from the bare mock.json (regression net for a freshly-inserted block)',
    async (variant) => {
      const wrapper = mount(Block, mountWithIcons({ id: 'e1', data: { ...mock, variant } }));
      expect(wrapper.findAll('h3')).toHaveLength(mock.items.length);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('renders an icon instead of an image when the item declares one', async () => {
    const data = {
      ...mock,
      items: [{ icon: 'bolt', title: 'Fast checkout', body: 'Pay in one click.' }],
    };
    const wrapper = mount(Block, mountWithIcons({ id: 'e1', data }));
    await new Promise((resolve) => setTimeout(resolve));
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('wraps an item with an href in a link, and others in a plain container', () => {
    const data = {
      ...mock,
      items: [
        { title: 'Linked', body: 'Has a link.', href: '/shop' },
        { title: 'Unlinked', body: 'No link.' },
      ],
    };
    const wrapper = mount(Block, mountWithIcons({ id: 'e1', data }));
    expect(wrapper.get('a[href="/shop"]').text()).toContain('Linked');
    expect(wrapper.findAll('a')).toHaveLength(1);
  });
});
