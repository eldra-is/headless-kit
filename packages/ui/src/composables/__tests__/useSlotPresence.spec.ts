import { afterEach, describe, expect, it } from 'vitest';
import { computed, defineComponent, h, nextTick, ref, useSlots } from 'vue';
import { mountWith } from '../../test/mount';
import { useSlotPresence } from '../useSlotPresence';

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * Renders what a *derived* value says about the slots — a `computed` over the composable, which is
 * the shape every consumer uses and the shape a plain `computed(() => slots.x)` gets wrong.
 */
const Probe = defineComponent({
  setup() {
    const slots = useSlots();
    const present = useSlotPresence(slots, ['first', 'second'] as const);
    const summary = computed(() =>
      [present.value.first ? 'first' : '-', present.value.second ? 'second' : '-'].join(' ')
    );
    return () => h('output', { 'data-testid': 'summary' }, summary.value);
  },
});

function host(slots: { value: { first: boolean; second: boolean } }) {
  return defineComponent({
    setup() {
      return () =>
        h(Probe, null, {
          ...(slots.value.first ? { first: () => 'a' } : {}),
          ...(slots.value.second ? { second: () => 'b' } : {}),
        });
    },
  });
}

describe('useSlotPresence', () => {
  it('reports the slots present at mount', () => {
    const slots = ref({ first: true, second: false });
    const wrapper = mountWith(host(slots));
    expect(wrapper.find('[data-testid="summary"]').text()).toBe('first -');
    wrapper.unmount();
  });

  it('follows a slot that appears and disappears, through a derived computed', async () => {
    const slots = ref({ first: false, second: false });
    const wrapper = mountWith(host(slots));
    const summary = () => wrapper.find('[data-testid="summary"]').text();
    expect(summary()).toBe('- -');

    slots.value = { first: true, second: false };
    await nextTick();
    expect(summary()).toBe('first -');

    slots.value = { first: true, second: true };
    await nextTick();
    expect(summary()).toBe('first second');

    slots.value = { first: false, second: true };
    await nextTick();
    expect(summary()).toBe('- second');
    wrapper.unmount();
  });

  it('keeps the same object while nothing changes, so a re-render costs nothing', async () => {
    const slots = ref({ first: true, second: false });
    const other = ref(0);
    const seen: Array<Record<string, boolean>> = [];
    const Watcher = defineComponent({
      setup() {
        const present = useSlotPresence(useSlots(), ['first'] as const);
        return () => {
          seen.push(present.value);
          return h('output', String(other.value));
        };
      },
    });
    const Host = defineComponent({
      setup: () => () => h(Watcher, null, slots.value.first ? { first: () => 'a' } : {}),
    });
    const wrapper = mountWith(Host);

    other.value = 1;
    await nextTick();
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);

    slots.value = { first: false, second: false };
    await nextTick();
    expect(seen[2]).not.toBe(seen[0]);
    wrapper.unmount();
  });
});
