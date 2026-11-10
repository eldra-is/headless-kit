import { computed as vueComputed, getCurrentInstance, inject } from 'vue';
import { ELDRA_SCOPE_KEY } from '../composables/useEldraScope';

/*
  Kept apart from scopedClass.ts so a composable that only needs `computed` (useMessages, which the
  vue-i18n entry ships) does not pull in tailwind-merge.
*/
export const NO_HOLD = Symbol('no-hold');
let held: string | undefined | typeof NO_HOLD = NO_HOLD;

/** The scope a running getter holds, or `NO_HOLD` outside one. */
export const heldScope = () => held;

/**
 * Vue's `computed` for this package's sources, holding the scope its component had at setup while
 * the getter runs. Vue 3.5 re-runs a dirty computed while it decides whether a component must
 * re-render, before the render starts, when there is no current instance; without this an open
 * Select's or a shown Tooltip's class came out unprefixed.
 */
export const computed = ((getterOrOptions: unknown, debug?: unknown) => {
  const scope = getCurrentInstance() ? inject(ELDRA_SCOPE_KEY, undefined) : undefined;
  const hold =
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      const previous = held;
      held = scope;
      try {
        return fn(...args);
      } finally {
        held = previous;
      }
    };
  const options =
    typeof getterOrOptions === 'function'
      ? hold(getterOrOptions as () => unknown)
      : {
          ...(getterOrOptions as { get: () => unknown; set: (v: unknown) => void }),
          get: hold((getterOrOptions as { get: () => unknown }).get),
        };
  return (vueComputed as (o: unknown, d?: unknown) => unknown)(options, debug);
}) as typeof vueComputed;
