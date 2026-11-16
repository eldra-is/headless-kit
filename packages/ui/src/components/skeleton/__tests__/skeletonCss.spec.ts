// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compileKitCss } from '../../../test/kitCss';

const rule = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} is not in the compiled stylesheet`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n  }', start));
};

describe('the skeleton stylesheet', () => {
  it('sizes the text and title rows from variables with the spec numbers as defaults', async () => {
    const css = await compileKitCss([
      'eldra:eldra-skeleton-text',
      'eldra:eldra-skeleton-title',
      'eldra:eldra-skeleton-box',
    ]);
    const text = rule(css, '.eldra\\:eldra-skeleton-text');
    expect(text).toContain('height: var(--eldra-skeleton-line-height, 0.875rem)');
    expect(text).toContain('margin-block: var(--eldra-skeleton-line-gap, 0.3rem)');
    expect(rule(css, '.eldra\\:eldra-skeleton-title')).toContain(
      'height: var(--eldra-skeleton-title-height, 1.5rem)'
    );
    expect(rule(css, '.eldra\\:eldra-skeleton-box')).toContain(
      'height: var(--eldra-skeleton-box-height, 1rem)'
    );
  });

  it('sweeps the glare for the first 1.8s of a 3s cycle, eased at both ends, then rests', async () => {
    const css = await compileKitCss(['eldra:eldra-skeleton']);
    const shape = rule(css, '.eldra\\:eldra-skeleton');
    expect(shape).toContain('var(--eldra-skeleton-color, var(--eldra-color-surface-strong))');
    expect(shape).toContain(
      'animation: eldra-shimmer var(--eldra-skeleton-duration, 3s) var(--eldra-ease-in-out) infinite'
    );
    expect(shape).toContain('--eldra-skeleton-highlight');
    const frames = css.slice(css.indexOf('@keyframes eldra-shimmer'));
    expect(frames.slice(0, 200)).toMatch(/60%,\s*100%\s*\{\s*transform: translateX\(100%\)/);
  });
});
