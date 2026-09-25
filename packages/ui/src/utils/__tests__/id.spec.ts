import { describe, expect, it } from 'vitest';
import { defineComponent, ref } from 'vue';
import { mountWith } from '../../test/mount';
import { useUiId } from '../id';

const Probe = defineComponent({
  props: { explicit: { type: String, default: undefined } },
  setup(props) {
    const id = useUiId('input', () => props.explicit);
    return { id };
  },
  template: '<i :id="id" />',
});

describe('useUiId', () => {
  it('generates an id namespaced with eldra- and the prefix', () => {
    const wrapper = mountWith(Probe);
    expect(wrapper.vm.id).toMatch(/^eldra-input-/);
    wrapper.unmount();
  });

  it('generates a different id for every instance in one app', () => {
    const wrapper = mountWith(
      defineComponent({ components: { Probe }, template: '<p><Probe /><Probe /></p>' })
    );
    const ids = wrapper.findAll('i').map((node) => node.attributes('id'));
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    wrapper.unmount();
  });

  it('keeps the generated id stable across re-renders', async () => {
    const wrapper = mountWith(Probe);
    const first = wrapper.vm.id;
    await wrapper.setProps({ explicit: undefined });
    expect(wrapper.vm.id).toBe(first);
    wrapper.unmount();
  });

  it('uses an explicit id when one is given', () => {
    const wrapper = mountWith(Probe, { props: { explicit: 'email' } });
    expect(wrapper.vm.id).toBe('email');
    wrapper.unmount();
  });

  it('tracks a reactive explicit id', async () => {
    const explicit = ref<string | undefined>(undefined);
    const wrapper = mountWith(
      defineComponent({
        setup: () => ({ id: useUiId('field', explicit) }),
        template: '<i :id="id" />',
      })
    );
    expect(wrapper.vm.id).toMatch(/^eldra-field-/);
    explicit.value = 'chosen';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.id).toBe('chosen');
    wrapper.unmount();
  });

  it('accepts the prefix without further escaping and produces a valid HTML id', () => {
    const wrapper = mountWith(Probe);
    expect(wrapper.vm.id).toMatch(/^[A-Za-z][\w:.-]*$/);
    wrapper.unmount();
  });
});
