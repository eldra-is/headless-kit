import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { THEME_ICONS } from '../app/icons';

/**
 * `app/icons.ts` decides which Tabler icons the theme ships, and `useEldraIcon` renders nothing for
 * a name that is not in it. That is the right behaviour for an icon an editor typed — but it is a
 * silent blank for an icon the *theme itself* asks for, which is exactly how a missing icon reaches
 * a live store unnoticed. So every icon name written into the theme is checked against the map
 * here.
 *
 * Three kinds of name are collected:
 *  - source (`blocks/**`, `app/**`): the literal names inside an `<EldraIcon>` tag's `name`/`:name`
 *    (a ternary counts — both branches are literals), `useEldraIcon('…')`, `iconComponent('…')` and
 *    an `icon: '…'` property.
 *  - content (`blocks/<id>/mock.json`, `blocks/<id>/preview.json`): every `icon` value, i.e. what an
 *    author sees the moment the block is inserted.
 *  - `blocks/<id>/block.json`: the block's own icon and any icon default it declares.
 *
 * A name a block computes rather than writes (`footer`'s social network → icon map,
 * `order-status`'s payment brands) is out of reach of any regex, so those are typed
 * `ThemeIconName` instead and `pnpm typecheck` is what proves them.
 */

const root = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (entry.endsWith('.vue') || entry.endsWith('.ts')) out.push(path);
  }
  return out;
}

function jsonFiles(pattern: 'mock.json' | 'preview.json' | 'block.json'): string[] {
  const blocks = join(root, 'blocks');
  return readdirSync(blocks)
    .map((block) => join(blocks, block, pattern))
    .filter((path) => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    });
}

const TAG = /<EldraIcon\b[^>]*?(:?)name="([^"]*)"/gs;
const LITERAL = /'([a-z0-9][a-z0-9-]*)'|"([a-z0-9][a-z0-9-]*)"/g;
const CALL = /(?:useEldraIcon|iconComponent)\(\s*['"]([a-z0-9][a-z0-9-]*)['"]/g;
const PROPERTY = /\bicon:\s*['"]([a-z0-9][a-z0-9-]*)['"]/g;

/** Every icon name the theme's own source asks for, keyed by the file that asks for it. */
function namesInSource(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const file of [...sourceFiles(join(root, 'blocks')), ...sourceFiles(join(root, 'app'))]) {
    const text = readFileSync(file, 'utf8');
    const names = new Set<string>();
    for (const [, bound, attribute] of text.matchAll(TAG)) {
      // A plain `name="lock"` is the icon itself. A bound `:name` is an expression: take its
      // string literals (`cond ? 'check' : 'minus'`) and nothing else, so a variable holding a
      // computed name is left to the type checker.
      if (bound === '') names.add(attribute!);
      else for (const match of attribute!.matchAll(LITERAL)) names.add((match[1] ?? match[2])!);
    }
    for (const [, name] of text.matchAll(CALL)) names.add(name!);
    for (const [, name] of text.matchAll(PROPERTY)) names.add(name!);
    if (names.size > 0) found.set(file.slice(root.length), names);
  }
  return found;
}

/** Every string under an `icon` key, however deeply nested. */
function iconValues(node: unknown, key = '', out = new Set<string>()): Set<string> {
  if (typeof node === 'string') {
    if (key.toLowerCase().endsWith('icon')) out.add(node);
  } else if (Array.isArray(node)) {
    for (const item of node) iconValues(item, key, out);
  } else if (node !== null && typeof node === 'object') {
    for (const [childKey, value] of Object.entries(node)) iconValues(value, childKey, out);
  }
  return out;
}

function namesInJson(
  pattern: 'mock.json' | 'preview.json' | 'block.json'
): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const file of jsonFiles(pattern)) {
    const names = iconValues(JSON.parse(readFileSync(file, 'utf8')));
    if (names.size > 0) found.set(file.slice(root.length), names);
  }
  return found;
}

function missing(found: Map<string, Set<string>>): string[] {
  const problems: string[] = [];
  for (const [file, names] of found) {
    for (const name of names) {
      if (!(name in THEME_ICONS)) problems.push(`${file}: ${name}`);
    }
  }
  return problems.sort();
}

describe('theme icons', () => {
  it('bundles every icon the theme’s own source renders', () => {
    const found = namesInSource();
    // A scan that silently found nothing would pass for the wrong reason.
    expect(found.size).toBeGreaterThan(15);
    expect(missing(found)).toEqual([]);
  });

  it('bundles every icon a block seeds into an entry', () => {
    const found = new Map([...namesInJson('mock.json'), ...namesInJson('preview.json')]);
    expect(found.size).toBeGreaterThan(0);
    expect(missing(found)).toEqual([]);
  });

  it('bundles every icon a block manifest names', () => {
    const found = namesInJson('block.json');
    expect(found.size).toBeGreaterThan(0);
    expect(missing(found)).toEqual([]);
  });

  it('inlines each icon ready to be styled by the text around it', () => {
    // `@eldrajs/ui`'s `Icon` owns the size and the colour, so the file's own 24×24 and its literal
    // stroke colour are removed on the way into the map.
    for (const [name, svg] of Object.entries(THEME_ICONS)) {
      expect(svg, name).toContain('<svg');
      expect(svg, name).toContain('stroke="currentColor"');
      expect(svg, name).not.toMatch(/\s(width|height)="24"/);
      expect(svg, name).toBe(svg.trim());
    }
  });
});
