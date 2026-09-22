import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const publicDemoDir = fileURLToPath(new URL('../public/demo', import.meta.url));

const expectedNames = [
  'hero',
  'product-1',
  'product-2',
  'product-3',
  'product-4',
  'product-5',
  'product-6',
  'avatar-1',
  'avatar-2',
  'avatar-3',
  'avatar-4',
  'gallery-1',
  'gallery-2',
  'gallery-3',
  'gallery-4',
  'gallery-5',
  'gallery-6',
  'logo',
  'feature-1',
  'feature-2',
  'feature-3',
  'feature-4',
];

describe('demo images', () => {
  it.each(expectedNames)('%s.svg exists and parses as SVG', (name) => {
    const path = join(publicDemoDir, `${name}.svg`);
    expect(existsSync(path), path).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content.trimStart().startsWith('<svg')).toBe(true);
  });
});
