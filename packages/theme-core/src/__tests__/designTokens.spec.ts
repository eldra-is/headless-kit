import { describe, expect, it } from 'vitest';
import {
  DesignTokenValidationError,
  applyDesignTokenOverrides,
  designTokenRevisionHash,
  generateDesignTokenCss,
  generateTailwindThemeCss,
  normalizeColorSelection,
  normalizeThemeDesignTokens,
  resolveDesignTokenCatalog,
  type ThemeDesignTokens,
} from '../designTokens';

function theme(): ThemeDesignTokens {
  return normalizeThemeDesignTokens({
    colors: {
      accent: { label: 'Accent', value: '#aabbcc', group: 'Brand', allowSiteOverride: true },
      ink: { label: 'Ink', value: 'oklch(0.5 0.125 270 / 1)' },
    },
    containers: {
      narrow: {
        label: 'Narrow',
        maxWidth: '40rem',
        gutter: { normal: '2rem', mobile: '1rem' },
        allowSiteOverride: true,
      },
      content: { label: 'Content', maxWidth: '64rem', gutter: { normal: '2rem' } },
      wide: { label: 'Wide', maxWidth: '80rem', gutter: { normal: '2rem' } },
      full: { label: 'Full', maxWidth: 'none', gutter: { normal: '2rem' } },
    },
    allowCustomColors: true,
  });
}

describe('design tokens', () => {
  it('normalizes legacy colors and strict modern literals deterministically', () => {
    expect(normalizeThemeDesignTokens({ colors: { 'brand-primary': '#aabbcc' } })).toEqual({
      colors: { 'brand-primary': { label: 'Brand Primary', value: '#aabbcc' } },
      containers: {},
    });
    expect(theme().colors.ink?.value).toBe('oklch(0.5 0.125 270 / 1)');
    expect(designTokenRevisionHash(theme())).toHaveLength(64);
  });

  it.each([
    '#fff',
    '#AABBCC',
    'red',
    'var(--attack)',
    'oklch(1.1 0 0)',
    'oklch(0.5 0.6 0)',
    'oklch(0.5 0.1 360)',
    'oklch(0.5 0.1 1);color:red',
  ])('rejects unsafe color %s', (value) => {
    const input = theme();
    input.colors.accent = { label: 'Accent', value };
    expect(() => normalizeThemeDesignTokens(input)).toThrow(DesignTokenValidationError);
  });

  it('applies only permitted complete overrides and verifies a supplied resolved catalog', () => {
    const base = theme();
    const overrides = {
      colors: { accent: '#112233' },
      containers: {
        narrow: { maxWidth: '36rem', gutter: { normal: '1.5rem', mobile: '0.75rem' } },
      },
    };
    const resolved = applyDesignTokenOverrides(base, overrides);
    expect(resolved.colors.accent?.value).toBe('#112233');
    expect(resolved.containers.narrow?.gutter.mobile).toBe('0.75rem');
    expect(resolveDesignTokenCatalog({ revision: 2, theme: base, overrides, resolved })).toEqual({
      revision: 2,
      theme: base,
      overrides,
      resolved,
    });
    expect(() =>
      applyDesignTokenOverrides(base, { colors: { ink: '#000000' }, containers: {} })
    ).toThrow(/OVERRIDE_FORBIDDEN/);
  });

  it('emits sorted injection-safe generic and Tailwind v4 CSS', () => {
    const css = generateDesignTokenCss(theme());
    expect(css).toContain(':root{--eldra-color-accent:#aabbcc;--eldra-color-ink:oklch');
    expect(css).toContain('--eldra-container-narrow-gutter-mobile:1rem;');
    expect(generateTailwindThemeCss(theme())).toBe(
      '@theme static{--color-accent:var(--eldra-color-accent);--color-ink:var(--eldra-color-ink);}'
    );
    expect(() => generateDesignTokenCss(theme(), { scope: 'body{}' })).toThrow(/INVALID_VALUE/);
  });

  it('normalizes legacy selections only when both custom-color policies allow it', () => {
    expect(normalizeColorSelection('#aabbcc', theme(), { allowCustomColors: true })).toEqual({
      kind: 'custom',
      value: '#aabbcc',
    });
    expect(normalizeColorSelection({ kind: 'token', token: 'accent' }, theme())).toEqual({
      kind: 'token',
      token: 'accent',
    });
    expect(() => normalizeColorSelection('#aabbcc', theme())).toThrow(/OVERRIDE_FORBIDDEN/);
    expect(() => normalizeColorSelection({ kind: 'token', token: 'missing' }, theme())).toThrow(
      /TOKEN_NOT_FOUND/
    );
  });

  it('rejects unknown keys, prototype ids, missing presets, excess catalogs, and cycles', () => {
    const malicious = JSON.parse(
      '{"colors":{"__proto__":{"label":"x","value":"#000000"}},"containers":{}}'
    );
    expect(() => normalizeThemeDesignTokens(malicious)).toThrow(/INVALID_VALUE/);
    expect(() => normalizeThemeDesignTokens({ ...theme(), extra: true })).toThrow(/UNKNOWN_KEY/);
    expect(() => normalizeThemeDesignTokens({ colors: theme().colors, containers: {} })).toThrow(
      /REQUIRED/
    );
    const colors = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [
        `color-${index}`,
        { label: `Color ${index}`, value: '#000000' },
      ])
    );
    expect(() => normalizeThemeDesignTokens({ colors, containers: theme().containers })).toThrow(
      /LIMIT_EXCEEDED/
    );
    const cyclic: Record<string, unknown> = { colors: {}, containers: {} };
    cyclic.colors = cyclic;
    expect(() => normalizeThemeDesignTokens(cyclic)).toThrow(DesignTokenValidationError);
  });
});
