import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const publicDemoDir = fileURLToPath(new URL('../public/demo', import.meta.url));

const expectedNames = [
  'hero',
  'hero-wide',
  'hero-slide-1',
  'hero-slide-2',
  'hero-slide-3',
  'hero-slide-4',
  'product-1',
  'product-2',
  'product-3',
  'product-4',
  'product-5',
  'product-6',
  'product-7',
  'product-8',
  'product-9',
  'product-10',
  'product-11',
  'product-12',
  'product-square-1',
  'product-square-2',
  'product-square-3',
  'product-square-4',
  'product-square-5',
  'product-square-6',
  'collection-1',
  'collection-2',
  'split-1',
  'split-2',
  'split-3',
  'split-4',
  'feature-1',
  'feature-2',
  'feature-3',
  'feature-4',
  'gallery-1',
  'gallery-2',
  'gallery-3',
  'gallery-4',
  'gallery-5',
  'gallery-6',
  'gallery-7',
  'gallery-8',
  'team-1',
  'team-2',
  'team-3',
  'team-4',
  'logo',
  'logo-1',
  'logo-2',
  'logo-3',
  'logo-4',
  'logo-5',
  'logo-6',
  'logo-7',
  'logo-8',
  'avatar-1',
  'avatar-2',
  'avatar-3',
  'avatar-4',
  'avatar-5',
  'avatar-6',
  'avatar-7',
  'avatar-8',
  'article-cover',
  'article-figure',
  'quote-portrait',
  'poster',
  'map',
  'cta-split',
];

describe('demo images', () => {
  it.each(expectedNames)('%s.svg exists and parses as SVG', (name) => {
    const path = join(publicDemoDir, `${name}.svg`);
    expect(existsSync(path), path).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content.trimStart().startsWith('<svg')).toBe(true);
  });

  // Catches the other direction of drift: a name renamed or dropped from
  // `scripts/demo-images.mjs`'s manifest (or from `expectedNames` above)
  // without updating the other, which would otherwise leave a stale SVG on
  // disk that nothing asserts on any more.
  it('has no SVG in public/demo that is not in expectedNames', () => {
    const actual = readdirSync(publicDemoDir)
      .filter((file) => file.endsWith('.svg'))
      .map((file) => file.replace(/\.svg$/, ''))
      .sort();
    expect(actual).toEqual([...expectedNames].sort());
  });
});
