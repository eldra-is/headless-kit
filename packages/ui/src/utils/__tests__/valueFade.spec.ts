import { afterEach, describe, expect, it, vi } from 'vitest';
import { giveMotionTokens, recordAnimations, stubReducedMotion } from '../../test/motion';
import { fadeInChangedValue } from '../valueFade';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function span(tokens: { duration?: string; easing?: string } | null = {}): HTMLElement {
  const el = document.createElement('span');
  document.body.append(el);
  if (tokens) giveMotionTokens(el, tokens.duration ?? '200ms', tokens.easing ?? 'ease-out');
  return el;
}

describe('fadeInChangedValue', () => {
  it('fades the element from transparent to its own settled opacity', () => {
    const played = recordAnimations();
    const el = span();
    expect(fadeInChangedValue(el)).not.toBeNull();
    expect(played.calls).toHaveLength(1);
    // Enter only. There is no leave half to write here: the element already holds the new value,
    // and fading anything out would mean showing the stale one.
    expect(played.calls[0]!.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(played.calls[0]!.el).toBe(el);
  });

  /** Duration and easing are the element's own tokens, never a literal — so a consumer who
   *  overrides `--eldra-duration-base` or `--eldra-ease-out` changes this animation with them. */
  it('reads the duration and easing off the element', () => {
    const played = recordAnimations();
    fadeInChangedValue(span({ duration: '0.4s', easing: 'cubic-bezier(0.2, 0, 0, 1)' }));
    expect(played.calls[0]!.options.duration).toBe(400);
    expect(played.calls[0]!.options.easing).toBe('cubic-bezier(0.2, 0, 0, 1)');
  });

  it('falls back to a plain ease when only the easing token is missing', () => {
    const played = recordAnimations();
    const el = span(null);
    (el as HTMLElement).style.setProperty('--eldra-duration-base', '200ms');
    fadeInChangedValue(el);
    expect(played.calls[0]!.options.easing).toBe('ease');
  });

  /**
   * Reduced motion, answered twice: the visitor's own setting and the zeroed duration token
   * (`tokens.css` zeroes every `--eldra-duration-*` under `prefers-reduced-motion: reduce`).
   * Either one alone skips the animation, so a consumer shipping their own token file still gets
   * the first and a browser that never reports the setting still gets the second.
   */
  it.each([
    ['the visitor asked for reduced motion', { duration: '200ms' }, true],
    ['the duration token is zeroed', { duration: '0ms' }, false],
    ['the duration token is a negative time', { duration: '-200ms' }, false],
    ['the duration token is not a time at all', { duration: 'fast' }, false],
  ])('plays nothing when %s', (_case, tokens, reduce) => {
    const played = recordAnimations();
    if (reduce) stubReducedMotion();
    expect(fadeInChangedValue(span(tokens))).toBeNull();
    expect(played.calls).toHaveLength(0);
  });

  /** No stylesheet at all (a unit test, a server-rendered string): nothing is guessed. */
  it('plays nothing when no token resolves', () => {
    const played = recordAnimations();
    expect(fadeInChangedValue(span(null))).toBeNull();
    expect(played.calls).toHaveLength(0);
  });

  it('tolerates a missing element and an engine with no Element.animate', () => {
    expect(fadeInChangedValue(null)).toBeNull();
    expect(fadeInChangedValue(undefined)).toBeNull();
    const el = span();
    (el as unknown as { animate: undefined }).animate = undefined;
    expect(fadeInChangedValue(el)).toBeNull();
  });
});
