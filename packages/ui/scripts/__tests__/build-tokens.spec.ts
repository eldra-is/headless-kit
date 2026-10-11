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
  opacity: { 'revalidating-opacity': { $type: 'number', $value: 0.9 } },
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
    '--eldra-revalidating-opacity: 0.9;',
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
  it('renders a token set that omits a whole group', () => {
    const partial = structuredClone(tokens);
    delete (partial as { zIndex?: unknown }).zIndex;
    delete (partial as { easing?: unknown }).easing;
    const rendered = renderTokensCss(partial);
    expect(rendered).toContain('--eldra-color-primary: #24201c;');
    expect(rendered).not.toContain('--eldra-z-');
    expect(rendered).not.toContain('cubic-bezier');
  });
});

/**
 * A malformed token used to serialise the string `undefined` into the stylesheet.
 * `--eldra-color-primary: undefined;` is valid CSS syntax, so neither the Tailwind build nor the
 * browser complained — the variable simply resolved to nothing everywhere it was used. Each case
 * below must fail the build instead, naming the path in tokens.json.
 */
describe('renderTokensCss refuses a malformed token', () => {
  it('names the token that has no $value', () => {
    const broken = structuredClone(tokens);
    delete (broken.color.primary as { $value?: string }).$value;
    expect(() => renderTokensCss(broken)).toThrow('tokens.json: color.primary is missing $value');
  });
  it('names a group whose key carries its own prefix', () => {
    const broken = structuredClone(tokens);
    delete (broken.space['space-5'] as { $value?: string }).$value;
    expect(() => renderTokensCss(broken)).toThrow('tokens.json: space.space-5 is missing $value');
  });
  it.each(['fontFamily', 'fontSize', 'lineHeight', 'fontWeight'])(
    'names a typography token missing %s',
    (field) => {
      const broken = structuredClone(tokens);
      delete (broken.font.style['body-sm'].$value as Record<string, unknown>)[field];
      expect(() => renderTokensCss(broken)).toThrow(
        `tokens.json: font.style.body-sm is missing ${field}`
      );
    }
  );
  it('names a typography token whose $value is missing entirely', () => {
    const broken = structuredClone(tokens);
    delete (broken.font.style['body-sm'] as { $value?: unknown }).$value;
    expect(() => renderTokensCss(broken)).toThrow(
      'tokens.json: font.style.body-sm is missing $value'
    );
  });
  it('names a typography token whose fontFamily alias resolves to nothing', () => {
    const broken = structuredClone(tokens);
    broken.font.style['body-sm'].$value.fontFamily = '{font.family.heading}';
    expect(() => renderTokensCss(broken)).toThrow(
      'tokens.json: font.style.body-sm references the unknown token {font.family.heading}'
    );
  });
  it.each([
    ['too few numbers', [0.2, 0]],
    ['too many numbers', [0.2, 0, 0, 1, 1]],
    ['a non-number', [0.2, 0, 0, '1']],
    ['not an array', '0.2, 0, 0, 1'],
  ])('names an easing token with %s', (_case, value) => {
    const broken = structuredClone(tokens);
    (broken.easing['ease-out'] as { $value: unknown }).$value = value;
    expect(() => renderTokensCss(broken)).toThrow(
      'tokens.json: easing.ease-out must be four numbers for a cubic-bezier'
    );
  });
});
