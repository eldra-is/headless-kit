import { mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { EldraClient } from '@eldrajs/theme-core';
import { createEldraLocaleState, provideEldra, type EldraLocaleState } from '../context';
import { useEldraLocale } from '../useEldraLocale';

function mountWithLocale(fill?: (state: EldraLocaleState) => void): EldraLocaleState {
  let seen!: EldraLocaleState;
  const Child = defineComponent({
    setup() {
      seen = useEldraLocale();
      return () => h('div', seen.active ?? 'none');
    },
  });
  mount(
    defineComponent({
      setup() {
        const context = provideEldra({ client: {} as EldraClient });
        fill?.(context.locales!);
        return () => h(Child);
      },
    })
  );
  return seen;
}

describe('useEldraLocale', () => {
  it('answers the one-unprefixed-site answer outside a themed app', () => {
    // A block reads this unconditionally — a Storybook story and a single-locale site must give it
    // the same shape, or every block would need a branch for "is there a locale state at all".
    let state!: EldraLocaleState;
    mount(
      defineComponent({
        setup() {
          state = useEldraLocale();
          return () => h('div');
        },
      })
    );
    expect(state.active).toBeNull();
    expect(state.defaultLocale).toBeNull();
    expect(state.supported).toEqual([]);
    expect(state.path('/cart')).toBe('/cart');
    expect(state.switchPath('is-IS')).toBe('/');
    expect(() => state.select('is-IS')).not.toThrow();
  });

  it('reads the state the provider filled in', () => {
    const state = mountWithLocale((locales) => {
      locales.active = 'is-IS';
      locales.defaultLocale = 'en-US';
      locales.supported = ['en-US', 'is-IS'];
    });
    expect(state.active).toBe('is-IS');
    expect(state.supported).toEqual(['en-US', 'is-IS']);
  });

  it('is reactive, so a language change re-renders what reads it', async () => {
    let locales!: EldraLocaleState;
    const Child = defineComponent({
      setup() {
        const state = useEldraLocale();
        return () => h('div', state.active ?? 'none');
      },
    });
    const wrapper = mount(
      defineComponent({
        setup() {
          const context = provideEldra({ client: {} as EldraClient });
          locales = context.locales!;
          return () => h(Child);
        },
      })
    );

    expect(wrapper.text()).toBe('none');
    locales.active = 'is-IS';
    await nextTick();
    expect(wrapper.text()).toBe('is-IS');
  });

  it('gives every fresh context the inert state rather than leaving the key absent', () => {
    expect(createEldraLocaleState()).toEqual({
      active: null,
      defaultLocale: null,
      supported: [],
      name: expect.any(Function),
      path: expect.any(Function),
      switchPath: expect.any(Function),
      select: expect.any(Function),
    });
    // The tag, not `Intl.DisplayNames`: this state serves no locales, so nothing asks it — and a
    // renderer-dependent answer has no business in the shape a story and a test share.
    expect(createEldraLocaleState().name('is-IS')).toBe('is-IS');
  });
});
