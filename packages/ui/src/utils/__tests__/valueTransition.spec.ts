import { describe, expect, it } from 'vitest';
import { VALUE_FADE, type ValueTransitionProps } from '../valueTransition';

const CLASS_KEYS = [
  'enterFromClass',
  'enterActiveClass',
  'enterToClass',
  'leaveFromClass',
  'leaveActiveClass',
  'leaveToClass',
] as const satisfies readonly (keyof ValueTransitionProps)[];

function tokens(props: ValueTransitionProps): string[] {
  return CLASS_KEYS.flatMap((key) => props[key].split(/\s+/).filter(Boolean));
}

describe('VALUE_FADE', () => {
  it('fades one value out before the next one in', () => {
    // `out-in`, not the default simultaneous mode: two copies of a price in the DOM at once are
    // two prices in the accessibility tree.
    expect(VALUE_FADE.mode).toBe('out-in');
    expect(VALUE_FADE.enterFromClass).toBe('motion-safe:opacity-0');
    expect(VALUE_FADE.leaveToClass).toBe('motion-safe:opacity-0');
    for (const key of ['enterActiveClass', 'leaveActiveClass'] as const) {
      expect(VALUE_FADE[key], key).toContain('motion-safe:transition-opacity');
      // The duration and the easing are the package's tokens, never a literal.
      expect(VALUE_FADE[key], key).toContain('motion-safe:duration-base');
      expect(VALUE_FADE[key], key).toContain('motion-safe:ease-out');
    }
  });

  /**
   * Under `prefers-reduced-motion: reduce` the transition must apply *nothing* — not a transition
   * property, not an opacity change — so a changed value is simply there. Every class being
   * `motion-safe:`-gated is what guarantees that, and the gate is CSS rather than a `matchMedia`
   * read so it stays right for a visitor who changes the setting without a re-render.
   */
  it('gates every class it applies behind motion-safe', () => {
    const names = tokens(VALUE_FADE);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name, name).toMatch(/^motion-safe:/);
    }
  });

  /**
   * Vue falls back to its own `v-enter-to` / `v-leave-from` names for any class prop left
   * `undefined`, and those would be ungated classes on the element that no stylesheet here
   * defines. The two end states are empty strings for exactly that reason, so this checks the
   * props are *present* rather than merely falsy.
   */
  it('names all six classes, so no v-* default is ever applied', () => {
    for (const key of CLASS_KEYS) {
      expect(typeof VALUE_FADE[key], key).toBe('string');
    }
    expect(VALUE_FADE.enterToClass).toBe('');
    expect(VALUE_FADE.leaveFromClass).toBe('');
  });
});
