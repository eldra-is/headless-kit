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

/**
 * A boolean model, defaulted the *wrong* way (`false`, not `undefined`) — the exact shape
 * `Dialog`/`Drawer`/`Lightbox` shipped before this fix (final review M2). Kept beside `BoolFixed`
 * below so a regression to the literal-`false` default anywhere in this package's components is
 * exactly the failure these two tests would themselves report if the check they assert were
 * inlined into a component's own `withDefaults` call.
 */
const BoolBuggy = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const model = useControllableModel<boolean>(props, emit, () => false);
    return { model, set: (value: boolean) => (model.value = value) };
  },
  template: '<i>{{ model }}</i>',
});

/** The fix: `default: undefined`, with the same `() => false` fallback supplying the uncontrolled
 *  starting value the literal default used to (incorrectly) provide. */
const BoolFixed = defineComponent({
  props: { modelValue: { type: Boolean, default: undefined } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const model = useControllableModel<boolean>(props, emit, () => false);
    return { model, set: (value: boolean) => (model.value = value) };
  },
  template: '<i>{{ model }}</i>',
});

describe('useControllableModel — the modelValue: false trap (final review M2)', () => {
  it('a literal false default is never treated as uncontrolled: an internal write is silently swallowed', async () => {
    const wrapper = mountWith(BoolBuggy);
    wrapper.vm.set(true);
    await nextTick();
    // The component believes it is controlled (its own `false` default is never `undefined`), so
    // the write never reaches `internal` and the getter keeps reading the prop — permanently false.
    expect(wrapper.vm.model).toBe(false);
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
    wrapper.unmount();
  });

  it('an undefined default is genuinely uncontrolled: an internal write takes effect', async () => {
    const wrapper = mountWith(BoolFixed);
    wrapper.vm.set(true);
    await nextTick();
    expect(wrapper.vm.model).toBe(true);
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
    wrapper.unmount();
  });
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

  it('keeps the last controlled value when the prop stops being defined', async () => {
    const wrapper = mountWith(Probe, { props: { modelValue: 'outer' } });
    await wrapper.setProps({ modelValue: 'changed' });
    await wrapper.setProps({ modelValue: undefined });
    expect(wrapper.vm.model).toBe('changed');
    expect(wrapper.text()).toBe('changed');
    wrapper.unmount();
  });

  it('goes on managing itself after the prop stops being defined', async () => {
    const wrapper = mountWith(Probe, { props: { modelValue: 'outer' } });
    await wrapper.setProps({ modelValue: undefined });
    wrapper.vm.set('inner');
    await nextTick();
    expect(wrapper.vm.model).toBe('inner');
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
