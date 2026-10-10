// @vitest-environment jsdom
//
// `useEditing` calls `useEldra()` (`@eldrajs/theme-vue`), which needs an
// active Vue component instance — mounted the same way `test/useUiId.spec.ts`
// exercises a bare composable, via a throwaway host component.
import { mount } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { ELDRA_KEY, createEldraPreviewState } from '@eldrajs/theme-vue';
import { useEditing } from '../app/composables/useEditing';

function contextWith(overrides: { active: boolean; mode: 'preview' | 'edit' }): unknown {
  return {
    client: {},
    designTokens: reactive({ colors: {}, containers: {} }),
    preview: Object.assign(createEldraPreviewState(), overrides),
  };
}

function mountEditing(provide?: Record<symbol, unknown>): boolean {
  let result!: boolean;
  const Host = defineComponent({
    setup() {
      result = useEditing().value;
      return () => null;
    },
  });
  mount(Host, provide === undefined ? {} : { global: { provide } });
  return result;
}

describe('useEditing', () => {
  it('is false with no Eldra context', () => {
    expect(mountEditing()).toBe(false);
  });

  it('is false when the preview bridge is active but read-only (preview mode)', () => {
    const provide = { [ELDRA_KEY]: contextWith({ active: true, mode: 'preview' }) };
    expect(mountEditing(provide)).toBe(false);
  });

  it('is true only once the preview bridge is active and in edit mode', () => {
    const provide = { [ELDRA_KEY]: contextWith({ active: true, mode: 'edit' }) };
    expect(mountEditing(provide)).toBe(true);
  });

  it('is false when in edit mode but the preview bridge is not active', () => {
    // Guards against a `mode === 'edit'` check alone: a stale/default context
    // whose `mode` happens to be 'edit' before `preview.active` flips true
    // (e.g. very early in the bridge handshake) must not show editor hints.
    const provide = { [ELDRA_KEY]: contextWith({ active: false, mode: 'edit' }) };
    expect(mountEditing(provide)).toBe(false);
  });
});
