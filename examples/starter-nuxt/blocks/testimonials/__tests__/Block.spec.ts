// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
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

  it('labels the carousel region and shows the initial slide counter', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'carousel' } } })
    );
    const region = wrapper.get('[role="region"]');
    expect(region.attributes('aria-roledescription')).toBe('carousel');
    expect(region.attributes('aria-labelledby')).toBeTruthy();
    expect(wrapper.text()).toContain(`Slide 1 of ${mock.items.length}`);
  });

  it('steps the slide with next/previous buttons', async () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'carousel' } } })
    );
    const buttons = wrapper.findAll('button');
    const next = buttons.find((button) => button.text() === 'Next')!;
    await next.trigger('click');
    expect(wrapper.text()).toContain('Slide 2');
    const previous = buttons.find((button) => button.text() === 'Previous')!;
    await previous.trigger('click');
    expect(wrapper.text()).toContain('Slide 1');
  });

  it('steps the slide with ArrowRight/ArrowLeft on the track', async () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'carousel' } } })
    );
    const track = wrapper.get('[tabindex="0"]');
    await track.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.text()).toContain('Slide 2');
    await track.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.text()).toContain('Slide 1');
  });
});
