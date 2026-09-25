import { describe, expect, it } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { mountWith } from '../../test/mount';
import { useControllableModel } from '../useControllableModel';

const Probe = defineComponent({
  props: { modelValue: { type: String, default: undefined } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const model = useControllableModel<string>(props, emit, () => 'fallback');
    return { model, set: (value: string) => (model.value = value) };
  },
  template: '<i>{{ model }}</i>',
});

describe('useControllableModel', () => {
  it('starts at the fallback when uncontrolled', () => {
    const wrapper = mountWith(Probe);
    expect(wrapper.vm.model).toBe('fallback');
    wrapper.unmount();
  });

  it('starts at the prop when controlled', () => {
    const wrapper = mountWith(Probe, { props: { modelValue: 'outer' } });
    expect(wrapper.vm.model).toBe('outer');
    wrapper.unmount();
  });

  it('mutates internal state and emits when uncontrolled', async () => {
    const wrapper = mountWith(Probe);
    wrapper.vm.set('inner');
    await nextTick();
    expect(wrapper.vm.model).toBe('inner');
    expect(wrapper.text()).toBe('inner');
    expect(wrapper.emitted('update:modelValue')).toEqual([['inner']]);
    wrapper.unmount();
  });

  it('emits without changing the rendered value when controlled', async () => {
    const wrapper = mountWith(Probe, { props: { modelValue: 'outer' } });
    wrapper.vm.set('attempted');
    await nextTick();
    expect(wrapper.vm.model).toBe('outer');
    expect(wrapper.text()).toBe('outer');
    expect(wrapper.emitted('update:modelValue')).toEqual([['attempted']]);
    wrapper.unmount();
  });

  it('follows the prop once the parent accepts the emitted value', async () => {
    const wrapper = mountWith(Probe, { props: { modelValue: 'outer' } });
    wrapper.vm.set('attempted');
    await wrapper.setProps({ modelValue: 'attempted' });
    expect(wrapper.vm.model).toBe('attempted');
    wrapper.unmount();
  });

  it('becomes controlled when the prop stops being undefined', async () => {
    const wrapper = mountWith(Probe);
    wrapper.vm.set('inner');
    await nextTick();
    await wrapper.setProps({ modelValue: 'outer' });
    expect(wrapper.vm.model).toBe('outer');
    wrapper.unmount();
  });

  it('calls the fallback once, not on every read', () => {
    let calls = 0;
    const Counted = defineComponent({
      props: { modelValue: { type: String, default: undefined } },
      emits: ['update:modelValue'],
      setup(props, { emit }) {
        const model = useControllableModel<string>(props, emit, () => {
          calls += 1;
          return 'fallback';
        });
        return { model };
      },
      template: '<i>{{ model }}{{ model }}</i>',
    });
    const wrapper = mountWith(Counted);
    expect(wrapper.vm.model).toBe('fallback');
    expect(calls).toBe(1);
    wrapper.unmount();
  });
});
