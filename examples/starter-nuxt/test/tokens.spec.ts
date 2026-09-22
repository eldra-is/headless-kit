import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const tokensPath = fileURLToPath(new URL('../tokens.json', import.meta.url));

interface ColorToken {
  label: string;
  value: string;
  group?: string;
  allowSiteOverride?: boolean;
}

interface TokensFile {
  colors: Record<string, ColorToken>;
  containers: Record<string, unknown>;
  allowCustomColors?: boolean;
}

const tokens = JSON.parse(readFileSync(tokensPath, 'utf8')) as TokensFile;

const expectedIds = [
  'background',
  'surface',
  'surface-strong',
  'border',
  'text',
  'muted',
  'primary',
  'primary-contrast',
  'accent',
  'accent-contrast',
  'success',
  'warning',
  'danger',
];

// WCAG 2.x relative luminance / contrast ratio, computed from hex literals.
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function tokenValue(id: string): string {
  const token = tokens.colors[id];
  if (!token) throw new Error(`missing token ${id}`);
  return token.value;
}

describe('design tokens', () => {
  it('defines exactly the 13 expected color ids', () => {
    expect(Object.keys(tokens.colors).sort()).toEqual([...expectedIds].sort());
  });

  it.each([
    ['text', 'background', 7],
    ['muted', 'background', 4.5],
    ['primary-contrast', 'primary', 4.5],
    ['accent-contrast', 'accent', 4.5],
    ['text', 'surface', 7],
    ['text', 'surface-strong', 4.5],
  ] as const)('%s on %s has contrast >= %s', (foreground, background, min) => {
    const ratio = contrastRatio(tokenValue(foreground), tokenValue(background));
    expect(ratio).toBeGreaterThanOrEqual(min);
  });
});
