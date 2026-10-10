import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

// SF-1: the starter is a standalone copy (`eldra-theme init` copies this
// directory verbatim, with no sibling monorepo to fall back on), so every
// bare import it uses at dev/build/test time must resolve to its OWN
// package.json — not something that happens to be hoisted from the
// workspace root only inside this monorepo. This test proves that by
// statically scanning source for bare import specifiers and checking each
// one against the starter's own dependencies/devDependencies, rather than
// trusting node's resolution (which would happily find a root-only
// devDependency here and pass).

const rootDir = fileURLToPath(new URL('..', import.meta.url));

const SCAN_DIRS = ['app', 'blocks', 'scripts', '.storybook', 'stories', 'test'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue']);

// Specifiers that are always allowed: relative/absolute paths, Node
// builtins, and the runtime-only ids this package never lists as a
// dependency because they are supplied by the framework/build tooling
// rather than resolved from node_modules.
const ALWAYS_ALLOWED = new Set(['nuxt', 'vue', '#imports']);

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (SCAN_EXTENSIONS.has(name.slice(name.lastIndexOf('.')))) {
      files.push(full);
    }
  }
  return files;
}

// Matches a static import (with or without `from`, so side-effect imports
// count too), a re-export, and a dynamic import call. Deliberately does not
// require a trailing semicolon so multi-line import blocks match.
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)(?:[^'"\n;]*\bfrom)?\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]/g;

function extractSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[1] ?? match[2];
    if (spec) specifiers.push(spec);
  }
  return specifiers;
}

function packageNameOf(specifier: string): string {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function isDeclaredDependency(pkgName: string): boolean {
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  const peerDeps = (pkg as { peerDependencies?: Record<string, string> }).peerDependencies;
  return Boolean(deps?.[pkgName] || devDeps?.[pkgName] || peerDeps?.[pkgName]);
}

function isAllowed(specifier: string): boolean {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return true;
  if (specifier.startsWith('node:')) return true;
  if (specifier.startsWith('virtual:eldra/')) return true;
  if (ALWAYS_ALLOWED.has(specifier)) return true;
  return isDeclaredDependency(packageNameOf(specifier));
}

describe('starter dependencies', () => {
  const files = SCAN_DIRS.flatMap((dir) => listSourceFiles(join(rootDir, dir)));

  it('scans a non-trivial number of source files', () => {
    // Guards the test itself against a refactor silently emptying SCAN_DIRS.
    expect(files.length).toBeGreaterThan(20);
  });

  it('every bare import specifier resolves to a dependency declared in this package.json', () => {
    const unresolved: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of extractSpecifiers(source)) {
        if (!isAllowed(specifier)) {
          unresolved.push(`${file.slice(rootDir.length)} imports '${specifier}'`);
        }
      }
    }
    expect(
      unresolved,
      'these imports resolve only via the monorepo root, so a standalone copy of this starter ' +
        '(from `eldra-theme init`) would fail to install/build/test — add the package to this ' +
        "package.json's dependencies/devDependencies"
    ).toEqual([]);
  });
});
