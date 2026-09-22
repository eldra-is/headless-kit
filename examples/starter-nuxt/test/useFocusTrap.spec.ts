// @vitest-environment jsdom
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { useFocusTrap } from '../app/composables/useFocusTrap';

function mountTrap() {
  const containerRef = ref<HTMLElement | null>(null);
  let trap!: ReturnType<typeof useFocusTrap>;
  const Host = defineComponent({
    setup() {
      trap = useFocusTrap(containerRef);
      return () =>
        h('div', { ref: containerRef }, [
          h('button', { id: 'first' }, 'First'),
          h('button', { id: 'second' }, 'Second'),
          h('button', { id: 'third' }, 'Third'),
        ]);
    },
  });
  const wrapper = mount(Host, { attachTo: document.body });
  return { wrapper, trap };
}

describe('useFocusTrap', () => {
  it('focuses the first focusable element on activate', () => {
    const { trap, wrapper } = mountTrap();
    trap.activate();
    expect(document.activeElement?.id).toBe('first');
    wrapper.unmount();
  });

  it('wraps Tab from the last element back to the first', () => {
    const { trap, wrapper } = mountTrap();
    trap.activate();
    (document.getElementById('third') as HTMLElement).focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    );
    expect(document.activeElement?.id).toBe('first');
    wrapper.unmount();
  });

  it('wraps Shift+Tab from the first element back to the last', () => {
    const { trap, wrapper } = mountTrap();
    trap.activate();
    expect(document.activeElement?.id).toBe('first');
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    );
    expect(document.activeElement?.id).toBe('third');
    wrapper.unmount();
  });

  it('restores focus to the previously focused element on deactivate', () => {
    const trigger = document.createElement('button');
    trigger.id = 'trigger';
    document.body.appendChild(trigger);
    trigger.focus();

    const { trap, wrapper } = mountTrap();
    trap.activate();
    expect(document.activeElement?.id).toBe('first');

    trap.deactivate();
    expect(document.activeElement?.id).toBe('trigger');

    wrapper.unmount();
    trigger.remove();
  });

  it('does nothing on a second activate() while already active', () => {
    const { trap, wrapper } = mountTrap();
    trap.activate();
    (document.getElementById('second') as HTMLElement).focus();
    trap.activate();
    // Still focused on 'second' — a second activate() did not re-focus 'first'.
    expect(document.activeElement?.id).toBe('second');
    wrapper.unmount();
  });
});
