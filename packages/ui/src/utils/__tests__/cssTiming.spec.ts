import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCssDurationMs, prefersReducedMotion, readCssVar } from '../cssTiming';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('parseCssDurationMs', () => {
  it.each([
    ['200ms', 200],
    ['0.4s', 400],
    ['1s', 1000],
    ['16.5ms', 16.5],
  ])('reads %s as %s milliseconds', (raw, expected) => {
    expect(parseCssDurationMs(raw)).toBe(expected);
  });

  /**
   * Everything that is not a positive time is `null`, and a caller treats `null` as "do not
   * animate" rather than "animate for 0ms": `0ms` is what `tokens.css` writes under
   * `prefers-reduced-motion: reduce`, and an unset variable is what a page with no stylesheet
   * loaded produces. Neither may become a guessed default.
   */
  it.each(['', '0ms', '0s', '-200ms', 'fast', '200', '200 ms', 'var(--eldra-duration-base)'])(
    'refuses %o',
    (raw) => {
      expect(parseCssDurationMs(raw)).toBeNull();
    }
  );
});

describe('readCssVar', () => {
  it('reads a custom property off the element', () => {
    const el = document.createElement('div');
    el.style.setProperty('--eldra-duration-base', '250ms');
    document.body.append(el);
    expect(readCssVar(el, '--eldra-duration-base')).toBe('250ms');
  });

  it('is empty for a property nothing sets', () => {
    const el = document.createElement('div');
    document.body.append(el);
    expect(readCssVar(el, '--eldra-duration-base')).toBe('');
  });

  /** An engine with no `getComputedStyle` reads as "no token", never as a throw: this runs inside
   *  a component's watcher, where a throw would take the render down with it. */
  it('is empty where there is no style engine at all', () => {
    const el = document.createElement('div');
    vi.stubGlobal('getComputedStyle', undefined);
    expect(readCssVar(el, '--eldra-duration-base')).toBe('');
    vi.unstubAllGlobals();
  });
});

describe('prefersReducedMotion', () => {
  it('reports the media query', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as unknown as MediaQueryList);
    expect(prefersReducedMotion()).toBe(true);
  });

  /**
   * Asked every time, never remembered: a visitor can turn the setting on or off while the page is
   * open, and the next value change has to see the new answer. (Caching the first one is the
   * mistake a `const prefersReduced = prefersReducedMotion()` at module scope would make.)
   */
  it('answers again on every call when the setting changes mid-session', () => {
    let reduce = false;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      () => ({ matches: reduce }) as unknown as MediaQueryList
    );
    expect(prefersReducedMotion()).toBe(false);
    reduce = true;
    expect(prefersReducedMotion()).toBe(true);
    reduce = false;
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
    vi.unstubAllGlobals();
  });
});
