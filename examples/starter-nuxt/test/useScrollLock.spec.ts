// @vitest-environment jsdom
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { useScrollLock } from '../app/composables/useScrollLock';

function mountLock(initial: boolean) {
  const active = ref(initial);
  const Host = defineComponent({
    setup() {
      useScrollLock(active);
      return () => h('div');
    },
  });
  const wrapper = mount(Host);
  return { wrapper, active };
}

describe('useScrollLock', () => {
  it('does nothing while inactive', () => {
    document.documentElement.style.overflow = '';
    mountLock(false);
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('sets overflow: hidden when active', () => {
    document.documentElement.style.overflow = '';
    mountLock(true);
    expect(document.documentElement.style.overflow).toBe('hidden');
  });

  it('restores the previous overflow value when deactivated', async () => {
    document.documentElement.style.overflow = 'scroll';
    const { active } = mountLock(true);
    expect(document.documentElement.style.overflow).toBe('hidden');
    active.value = false;
    await Promise.resolve();
    await Promise.resolve();
    expect(document.documentElement.style.overflow).toBe('scroll');
  });

  it('unlocks on unmount', () => {
    document.documentElement.style.overflow = '';
    const { wrapper } = mountLock(true);
    expect(document.documentElement.style.overflow).toBe('hidden');
    wrapper.unmount();
    expect(document.documentElement.style.overflow).toBe('');
  });
});
