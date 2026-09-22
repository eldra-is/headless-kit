// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

describe('gallery block', () => {
  it('renders the mock content', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.heading);
    expect(wrapper.findAll('img')).toHaveLength(mock.images.length);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it.each(['grid', 'masonry', 'carousel'] as const)(
    'renders the %s variant with no axe violations',
    async (variant) => {
      const wrapper = mount(
        Block,
        mountOptions({ entry: { id: 'e1', data: { ...mock, variant } } })
      );
      expect(wrapper.findAll('img')).toHaveLength(mock.images.length);
      expect(await axe(wrapper.element)).toHaveNoViolations();
    }
  );

  it('renders plain (non-interactive) thumbnails when lightbox is disabled', () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, lightbox: false } } })
    );
    expect(wrapper.findAll('button')).toHaveLength(0);
    expect(wrapper.find('dialog').exists()).toBe(false);
  });

  it('opens the lightbox on a thumbnail click and shows the clicked image with a counter', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    const thumbnails = wrapper.findAll('button');
    await thumbnails[1]!.trigger('click');
    await nextTick();

    const dialog = wrapper.get('dialog');
    expect(dialog.attributes('open')).toBe('');
    expect(wrapper.text()).toContain(`2 of ${mock.images.length}`);
  });

  it('steps forward and back inside the lightbox', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    await wrapper.findAll('button')[0]!.trigger('click');
    await nextTick();

    const dialog = wrapper.get('dialog');
    await dialog
      .findAll('button')
      .find((button) => button.text() === 'Next')!
      .trigger('click');
    expect(wrapper.text()).toContain('2 of');
    await dialog
      .findAll('button')
      .find((button) => button.text() === 'Previous')!
      .trigger('click');
    expect(wrapper.text()).toContain('1 of');
  });

  it('closes the lightbox via the dialog close button', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    await wrapper.findAll('button')[0]!.trigger('click');
    await nextTick();
    expect(wrapper.get('dialog').attributes('open')).toBe('');

    const dialog = wrapper.get('dialog');
    await dialog.findAll('button')[0]!.trigger('click');
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
  });

  it('steps the carousel track with ArrowRight/ArrowLeft', async () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, variant: 'carousel' } } })
    );
    const track = wrapper.get('[tabindex="0"]');
    await track.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.text()).toContain(`Slide 2 of ${mock.images.length}`);
  });
});
