// @vitest-environment jsdom
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { useUiId } from '../app/composables/useUiId';

function mountId(): string {
  let id!: string;
  const Host = defineComponent({
    setup() {
      id = useUiId();
      return () => h('div');
    },
  });
  mount(Host);
  return id;
}

describe('useUiId', () => {
  it('returns a non-empty string', () => {
    expect(mountId()).toBeTruthy();
  });

  it('returns a different id for each call within the same app', () => {
    // Vue's underlying `useId()` counter is scoped per Vue app instance and resets for
    // a new one (each `mount()` below creates its own app), so two
    // *separate* `mount()` calls would both legitimately return the first
    // id — uniqueness only holds within one running app, which is what
    // actually matters (two primitives on the same page never collide).
    const ids: string[] = [];
    const Host = defineComponent({
      setup() {
        ids.push(useUiId(), useUiId());
        return () => h('div');
      },
    });
    mount(Host);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
