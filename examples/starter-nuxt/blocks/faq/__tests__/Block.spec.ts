// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { axe } from '../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import Block from '../Block.vue';
import mock from '../mock.json';
import { mountOptions } from '../../../test/support/mountBlock';

// Per the HTML spec (and `UiAccordion.spec.ts`'s own note): a `<details>`
// click toggles its `open` attribute synchronously, but fires the `toggle`
// event — which drives `single` mode's sibling-closing — via a queued task,
// one tick later.
async function flushToggle() {
  await new Promise((resolve) => setTimeout(resolve));
  await nextTick();
}

describe('faq block', () => {
  it('renders the mock content', async () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    expect(wrapper.text()).toContain(mock.heading);
    for (const item of mock.items) expect(wrapper.text()).toContain(item.question);
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it('renders each answer as rich text', () => {
    const wrapper = mount(Block, mountOptions({ entry: { id: 'e1', data: mock } }));
    const roots = wrapper.findAll('[data-eldra-rich-text]');
    expect(roots).toHaveLength(mock.items.length);
    expect(roots[0]!.attributes('data-eldra-field')).toBe('items.0.answer');
    expect(roots[0]!.attributes('data-eldra-entry')).toBe('e1');
    expect(wrapper.text()).toContain('Orders ship within two business days');
  });

  it('closes the other question when single is true and a new one opens', async () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, single: true } } })
    );
    const summaries = wrapper.findAll('summary');
    const details = wrapper.findAll('details');

    await summaries[0]!.trigger('click');
    await flushToggle();
    expect(details[0]!.attributes('open')).toBe('');
    expect(details[1]!.attributes('open')).toBeUndefined();

    await summaries[1]!.trigger('click');
    await flushToggle();
    expect(details[0]!.attributes('open')).toBeUndefined();
    expect(details[1]!.attributes('open')).toBe('');
  });

  it('lets more than one question stay open when single is false', async () => {
    const wrapper = mount(
      Block,
      mountOptions({ entry: { id: 'e1', data: { ...mock, single: false } } })
    );
    const summaries = wrapper.findAll('summary');
    await summaries[0]!.trigger('click');
    await summaries[1]!.trigger('click');
    const details = wrapper.findAll('details');
    expect(details[0]!.attributes('open')).toBe('');
    expect(details[1]!.attributes('open')).toBe('');
  });
});
