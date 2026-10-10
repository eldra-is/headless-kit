import { describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { mountWith } from '../../test/mount';
import { enUS } from '../../messages/en-US';
import { MESSAGES_KEY, provideEldraUiMessages, useMessages } from '../useMessages';
import type { UiMessages } from '../useMessages';

const Consumer = defineComponent({
  props: { override: { type: Object, default: undefined } },
  setup(props) {
    const messages = useMessages(() => props.override as Partial<UiMessages> | undefined);
    return { messages };
  },
  template: '<i />',
});

function provider(messages: Partial<UiMessages>) {
  return defineComponent({
    props: { override: { type: Object, default: undefined } },
    setup(props) {
      provideEldraUiMessages(messages);
      return () => h(Consumer, { override: props.override });
    },
  });
}

describe('useMessages', () => {
  it('falls back to the en-US defaults', () => {
    const wrapper = mountWith(Consumer);
    expect(wrapper.vm.messages.close).toBe(enUS.close);
    expect(wrapper.vm.messages.moreSelected(3)).toBe(enUS.moreSelected(3));
    wrapper.unmount();
  });

  it('lets provided messages win over the defaults', () => {
    const wrapper = mountWith(provider({ close: 'Loka' }));
    const consumer = wrapper.findComponent(Consumer);
    expect(consumer.vm.messages.close).toBe('Loka');
    expect(consumer.vm.messages.clear).toBe(enUS.clear);
    wrapper.unmount();
  });

  it('lets an override win over provided messages and the defaults', () => {
    const wrapper = mountWith(provider({ close: 'Loka', clear: 'Hreinsa' }), {
      props: { override: { close: 'Dismiss' } },
    });
    const consumer = wrapper.findComponent(Consumer);
    expect(consumer.vm.messages.close).toBe('Dismiss');
    expect(consumer.vm.messages.clear).toBe('Hreinsa');
    expect(consumer.vm.messages.search).toBe(enUS.search);
    wrapper.unmount();
  });

  it('ignores explicitly undefined keys in an override instead of erasing the default', () => {
    const wrapper = mountWith(Consumer, { props: { override: { close: undefined } } });
    expect(wrapper.vm.messages.close).toBe(enUS.close);
    wrapper.unmount();
  });

  it('is reactive to a changing override', async () => {
    const override = ref<Partial<UiMessages> | undefined>(undefined);
    const wrapper = mountWith(
      defineComponent({
        setup: () => ({ messages: useMessages(override) }),
        template: '<i />',
      })
    );
    expect(wrapper.vm.messages.close).toBe(enUS.close);
    override.value = { close: 'Loka' };
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.messages.close).toBe('Loka');
    wrapper.unmount();
  });

  it('can be provided app-wide with MESSAGES_KEY instead of the helper', () => {
    const wrapper = mountWith(Consumer, {
      global: { provide: { [MESSAGES_KEY as unknown as symbol]: { close: 'Loka' } } },
    });
    expect(wrapper.vm.messages.close).toBe('Loka');
    wrapper.unmount();
  });

  it('keeps function messages callable after merging', () => {
    const wrapper = mountWith(provider({ removeTag: (label: string) => `Fjarlægja ${label}` }));
    const consumer = wrapper.findComponent(Consumer);
    expect(consumer.vm.messages.removeTag('Blátt')).toBe('Fjarlægja Blátt');
    expect(consumer.vm.messages.counter(1, 3)).toBe(enUS.counter(1, 3));
    wrapper.unmount();
  });
});
