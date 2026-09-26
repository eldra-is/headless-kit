// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

describe('testimonials block', () => {
  it('renders the mock content', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.heading);
    for (const item of mock.items) expect(wrapper.text()).toContain(item.author);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['grid', 'carousel'] as const)(
    'renders the %s variant with no axe violations',
    async (variant) => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...mock, variant } } })
      );
      expect(wrapper.findAll('blockquote')).toHaveLength(mock.items.length);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('renders initials derived from the author name when no avatar is set, and is axe clean', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    for (const item of mock.items) {
      const [first, second] = item.author.split(' ');
      const expected = `${first!.charAt(0)}${second!.charAt(0)}`.toUpperCase();
      expect(wrapper.text()).toContain(expected);
    }
    expect(wrapper.find('img').exists()).toBe(false);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('prefers the avatar image over initials when avatar media is set', () => {
    const data = { ...mock, items: [{ ...mock.items[0], avatar: { url: '/demo/avatar-1.svg' } }] };
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data } }));
    expect(wrapper.find('img').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('FB');
  });

  it('applies the full radius to the avatar frame, in both the grid and carousel layouts', () => {
    const data = { ...mock, items: [{ ...mock.items[0], avatar: { url: '/demo/avatar-1.svg' } }] };
    for (const variant of ['grid', 'carousel'] as const) {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...data, variant } } })
      );
      expect(wrapper.get('[data-part="frame"]').classes()).toContain('rounded-full');
    }
  });

  it('renders without an author instead of crashing (a freshly-placed block seeds a blank item)', async () => {
    const data = { ...mock, items: [{ quote: undefined, author: undefined, role: undefined }] };
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data } }));
    expect(wrapper.text()).toContain(mock.heading);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders a rating only for items that declare one', () => {
    const data = {
      ...mock,
      items: [
        { quote: 'Great.', author: 'A', rating: 5 },
        { quote: 'Also great.', author: 'B' },
      ],
    };
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data } }));
    expect(wrapper.findAll('[role="img"]')).toHaveLength(1);
  });

  it('labels the carousel region with the block heading and shows the initial slide counter', async () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'carousel' } } })
    );
    // `Carousel`'s root is a `<section>` named by `ariaLabel` — an *implicit* ARIA `region` role
    // (a named `<section>`), not an explicit `role` attribute, so this selects on the attribute
    // `Carousel` actually renders instead.
    const region = wrapper.get('section[aria-roledescription="carousel"]');
    expect(region.attributes('aria-roledescription')).toBe('carousel');
    expect(region.attributes('aria-label')).toBe(mock.heading);
    // `useCarousel`'s own slide count is set from `onMounted`, a reactive update Vue only flushes
    // to the DOM on the next tick — the same reason the package's own Carousel spec always awaits
    // a tick before reading rendered index/count state.
    await nextTick();
    // `@eldrajs/ui`'s `Carousel` own counter format: "n / total" (its `useMessages` default).
    expect(wrapper.text()).toContain(`1 / ${mock.items.length}`);
  });

  it('steps the slide with next/previous buttons', async () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'carousel' } } })
    );
    await nextTick();
    // The arrows are `Carousel`'s own icon-only buttons — no visible text, so found by their
    // accessible name (`@eldrajs/ui`'s default English messages: "Next slide"/"Previous slide").
    const buttons = wrapper.findAll('button');
    const next = buttons.find((button) => button.attributes('aria-label') === 'Next slide')!;
    await next.trigger('click');
    expect(wrapper.text()).toContain(`2 / ${mock.items.length}`);
    const previous = buttons.find(
      (button) => button.attributes('aria-label') === 'Previous slide'
    )!;
    await previous.trigger('click');
    expect(wrapper.text()).toContain(`1 / ${mock.items.length}`);
  });

  it('steps the slide with ArrowRight/ArrowLeft on the track', async () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'carousel' } } })
    );
    const track = wrapper.get('[tabindex="0"]');
    await track.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.text()).toContain(`2 / ${mock.items.length}`);
    await track.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.text()).toContain(`1 / ${mock.items.length}`);
  });
});
