import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { provideEldraScope } from '../../composables/useEldraScope';
import { cx as publicCx, partClass as publicPartClass } from '../cx';
import { computed, cx, kit, partClass, useKitClass } from '../scopedClass';

/** Runs `read` in the setup of a component below `provideEldraScope()` (or none), and returns it. */
function inComponent<T>(read: () => T, scope?: string): T {
  let value: T | undefined;
  const Child = defineComponent({
    setup() {
      value = read();
      return () => h('div');
    },
  });
  const Root = defineComponent({
    setup() {
      if (scope) provideEldraScope(scope);
      return () => h(Child);
    },
  });
  mount(Root).unmount();
  return value as T;
}

describe('the scoped class helpers, without a scope', () => {
  it('give exactly what the public cx and partClass give', () => {
    const classes = { root: 'px-6 ui:w-full' };
    const out = inComponent(() => ({
      cx: cx('px-4', 'px-2 text-sm', false, { block: true }),
      part: partClass('px-4 w-fit', classes, 'root'),
      kit: kit('size-4 shrink-0'),
    }));
    expect(out.cx).toBe(publicCx('px-4', 'px-2 text-sm', false, { block: true }));
    expect(out.part).toBe(publicPartClass('px-4 w-fit', classes, 'root'));
    expect(out.kit).toBe('size-4 shrink-0');
  });
});

describe('the scoped class helpers, below provideEldraScope()', () => {
  const scoped = <T>(read: () => T) => inComponent(read, 'studio');

  it("prefix the kit's own classes, merged as before", () => {
    expect(scoped(() => cx('px-4', 'px-2 text-sm'))).toBe('eldra:px-2 eldra:text-sm');
    expect(scoped(() => kit('size-4 shrink-0'))).toBe('eldra:size-4 eldra:shrink-0');
  });

  it('merge an already prefixed class by its plain name', () => {
    expect(scoped(() => cx(cx('px-4'), 'px-2'))).toBe('eldra:px-2');
    expect(scoped(() => kit(kit('size-4')))).toBe('eldra:size-4');
  });

  it("keep the consumer's classes as written, so the consumer's CSS styles them", () => {
    expect(scoped(() => partClass('w-fit px-4', { root: 'ui:w-full mt-4' }, 'root'))).toBe(
      'eldra:w-fit eldra:px-4 ui:w-full mt-4'
    );
  });

  it('let a consumer class replace the kit class it conflicts with', () => {
    expect(scoped(() => partClass('w-fit px-4', { root: 'w-full' }, 'root'))).toBe(
      'eldra:px-4 w-full'
    );
  });

  it("treat a prefixed override as the kit's own: one component passing classes to another", () => {
    const fromParent = scoped(() => kit('w-full'));
    expect(scoped(() => partClass('w-fit', { root: fromParent }, 'root'))).toBe('eldra:w-full');
  });

  it('leave group and peer markers unprefixed', () => {
    expect(scoped(() => cx('group/section group peer/box px-4'))).toBe(
      'group/section group peer/box eldra:px-4'
    );
  });

  it('bind useKitClass to the scope at setup, for classList writes outside any render', () => {
    expect(scoped(() => useKitClass())('eldra-carousel-slide')).toBe('eldra:eldra-carousel-slide');
    expect(inComponent(() => useKitClass())('eldra-carousel-slide')).toBe('eldra-carousel-slide');
  });

  /**
   * Vue 3.5 re-runs a dirty computed while it decides whether to re-render, before the render
   * starts, when there is no current instance. A class computed that read the scope at that moment
   * came out unprefixed after the first change: an open Select's trigger, a shown Tooltip.
   */
  it('keeps a class computed prefixed after the state it reads changes', async () => {
    const open = ref(false);
    const Child = defineComponent({
      setup() {
        const cls = computed(() => cx('px-4', open.value ? 'bg-text' : 'bg-surface'));
        return () => h('div', { id: 'x', class: cls.value });
      },
    });
    const Root = defineComponent({
      setup() {
        provideEldraScope('studio');
        return () => h(Child);
      },
    });
    const wrapper = mount(Root);
    expect(wrapper.get('#x').classes()).toEqual(['eldra:px-4', 'eldra:bg-surface']);
    open.value = true;
    await nextTick();
    expect(wrapper.get('#x').classes()).toEqual(['eldra:px-4', 'eldra:bg-text']);
    wrapper.unmount();
  });
});
