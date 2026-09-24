import { describe, expect, it } from 'vitest';
import { renderTokensCss } from '../build-tokens.mjs';

const tokens = {
  color: {
    primary: { $type: 'color', $value: '#24201c' },
    'focus-inner': { $type: 'color', $value: '#ffffff' },
  },
  font: {
    family: { body: { $type: 'fontFamily', $value: '"Instrument Sans", sans-serif' } },
    style: {
      'body-sm': {
        $type: 'typography',
        $value: {
          fontFamily: '{font.family.body}',
          fontSize: '0.875rem',
          lineHeight: '1.5',
          fontWeight: 400,
        },
      },
    },
  },
  space: { 'space-5': { $type: 'dimension', $value: '1.25rem' } },
  radius: { 'radius-md': { $type: 'dimension', $value: '0.5rem' } },
  shadow: { 'shadow-md': { $value: '0 12px 32px -8px rgba(28, 25, 23, 0.18)' } },
  layout: {
    'control-height': { $type: 'dimension', $value: '2.5rem' },
    'section-md': { $value: 'clamp(3rem, 2rem + 4vw, 6rem)' },
  },
  duration: { 'duration-base': { $type: 'duration', $value: '200ms' } },
  easing: { 'ease-out': { $type: 'cubicBezier', $value: [0.2, 0, 0, 1] } },
  zIndex: { 'z-dialog': { $type: 'number', $value: 50 } },
};

describe('renderTokensCss', () => {
  const css = renderTokensCss(tokens);
  it.each([
    '--eldra-color-primary: #24201c;',
    '--eldra-color-focus-inner: #ffffff;',
    '--eldra-font-body: "Instrument Sans", sans-serif;',
    '--eldra-text-body-sm-family: var(--eldra-font-body);',
    '--eldra-text-body-sm-size: 0.875rem;',
    '--eldra-text-body-sm-line: 1.5;',
    '--eldra-text-body-sm-weight: 400;',
    '--eldra-text-body-sm-tracking: 0;',
    '--eldra-space-5: 1.25rem;',
    '--eldra-radius-md: 0.5rem;',
    '--eldra-shadow-md: 0 12px 32px -8px rgba(28, 25, 23, 0.18);',
    '--eldra-control-height: 2.5rem;',
    '--eldra-section-md: clamp(3rem, 2rem + 4vw, 6rem);',
    '--eldra-duration-base: 200ms;',
    '--eldra-ease-out: cubic-bezier(0.2, 0, 0, 1);',
    '--eldra-z-dialog: 50;',
  ])('emits %s', (line) => expect(css).toContain(line));
  it('zeroes every duration under reduced motion', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{\s*--eldra-duration-base: 0ms;/
    );
  });
  it('is deterministic and ends with a newline', () => {
    expect(renderTokensCss(tokens)).toBe(css);
    expect(css.endsWith('\n')).toBe(true);
  });
});
