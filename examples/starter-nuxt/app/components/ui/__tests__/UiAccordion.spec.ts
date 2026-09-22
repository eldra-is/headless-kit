// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { axe } from '../../../../test/support/axe';
import { describe, expect, it } from 'vitest';
import UiAccordion from '../UiAccordion.vue';
import UiAccordionItem from '../UiAccordionItem.vue';

// Per the HTML spec, a <details> click toggles its `open` attribute
// synchronously but fires the `toggle` event via a queued task — real
// browsers do this too, not just jsdom — so this component's own
// `single`-mode sibling-closing logic (which runs from the `toggle`
// listener) only takes effect after that task runs, one tick later than
// `trigger('click')`'s own `await nextTick()` covers. Assertions on the
// clicked item's own `open` attribute don't need this (jsdom sets it
// synchronously); only assertions on a *different* item's resulting state
// do.
async function flushToggle() {
  await new Promise((resolve) => setTimeout(resolve));
  await nextTick();
}

function mountFaq(single: boolean) {
  const Harness = defineComponent({
    components: { UiAccordion, UiAccordionItem },
    setup() {
      return () =>
        h(UiAccordion, { single }, () => [
          h(UiAccordionItem, { title: 'Question one' }, () => 'Answer one'),
          h(UiAccordionItem, { title: 'Question two' }, () => 'Answer two'),
        ]);
    },
  });
  return mount(Harness);
}

describe('UiAccordion', () => {
  it('wraps its items in a bordered list', () => {
    const wrapper = mountFaq(false);
    expect(wrapper.findAll('details')).toHaveLength(2);
  });

  it('lets multiple items stay open by default (single is false)', async () => {
    const wrapper = mountFaq(false);
    const summaries = wrapper.findAll('summary');
    await summaries[0]!.trigger('click');
    await summaries[1]!.trigger('click');
    const details = wrapper.findAll('details');
    expect(details[0]!.attributes('open')).toBe('');
    expect(details[1]!.attributes('open')).toBe('');
  });

  it('closes the other item when single is true and a new one opens', async () => {
    const wrapper = mountFaq(true);
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

  it('has no axe violations with an item open in single mode', async () => {
    const wrapper = mountFaq(true);
    await wrapper.findAll('summary')[0]!.trigger('click');
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
