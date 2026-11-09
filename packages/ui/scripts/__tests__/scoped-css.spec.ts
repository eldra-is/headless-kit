import { readFileSync } from 'node:fs';
// happy-dom's global `URL` refuses the `file:` scheme; Node's own resolves it.
import { fileURLToPath, URL as NodeURL } from 'node:url';
import postcss, { type AtRule, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';
import { isBuilt, itFailsWithoutDist } from '../../src/test/built';
import { SCOPE_PRELUDE, scopeCss } from '../scoped-css.mjs';

const IN_SCOPE = ':where(:scope, :scope *)';
const EVERY_ROOT = ':where([data-eldra-scope])';
const OUTERMOST_ROOT = ':where([data-eldra-scope]:not([data-eldra-scope] *))';

const FIXTURE = `/*! license */
@layer properties {
  @supports (-moz-orient: inline) {
    *, :before, ::backdrop { --tw-shadow: 0 0 #0000; }
  }
}
@layer theme {
  :root, :host {
    --color-text: var(--eldra-color-text);
    --spacing: .25rem;
    --animate-spin: spin 1s linear infinite;
  }
}
@layer base {
  :where([data-eldra-ui]) { margin: 0; }
  .reset > a { color: inherit; }
}
@layer components;
@layer utilities {
  .p-4 { padding: calc(var(--spacing) * 4); }
  .text-text { color: var(--color-text, var(--fallback-color)); }
  .mix { background: color-mix(in oklab, var(--color-text) 20%, transparent); }
  .fade { transition-property: --tw-shadow, --my-progress; }
  .animate-spin { animation: var(--animate-spin); }
  .spin-name { animation-name: spin; }
  .before\\:x:before { content: ''; }
  .placeholder\\:x::placeholder:hover { color: red; }
  .group:hover .group-hover\\:x { color: blue; }
  @media (hover: hover) { .hover\\:x:hover { color: green; } }
  @container (width >= 40rem) { .\\@wide\\:p-4 { padding: calc(var(--spacing) * 4); } }
  @property --my-progress { syntax: "<number>"; inherits: false; initial-value: 0; }
}
:root { --eldra-color-text: #111; --eldra-focus-offset: 2px; }
@media (prefers-reduced-motion: reduce) { :root { --eldra-duration-fast: 0s; } }
@keyframes spin { to { rotate: 360deg; } }
@keyframes eldra-pulse { to { opacity: 1; } }
[data-a] + [data-b] { padding-top: 0; }
`;

const out = scopeCss(FIXTURE);
const sheet = postcss.parse(out);
const scope = sheet.nodes.find(
  (node): node is AtRule => node.type === 'atrule' && node.name === 'scope'
)!;
const rules = (root: { walkRules: (cb: (rule: Rule) => void) => void }) => {
  const all: Rule[] = [];
  root.walkRules((rule) => {
    if (rule.parent?.type !== 'atrule' || (rule.parent as AtRule).name !== 'keyframes')
      all.push(rule);
  });
  return all;
};
const selectorsInScope = rules(scope).flatMap((rule) => rule.selectors);

describe('scopeCss on a fixture', () => {
  it('wraps every style rule in the one scope, after the hoisted rules and the roots', () => {
    expect(scope.params).toBe(SCOPE_PRELUDE);
    expect(sheet.nodes.at(-1)).toBe(scope);
    const outside = sheet.nodes.filter((node) => node !== scope && node.type !== 'comment');
    expect(
      outside.map((node) =>
        node.type === 'atrule' ? `@${node.name} ${node.params}` : (node as Rule).selector
      )
    ).toEqual([
      '@property --eldra-tw-my-progress',
      '@keyframes eldra-tw-spin',
      '@keyframes eldra-pulse',
      EVERY_ROOT,
      OUTERMOST_ROOT,
      '@media (prefers-reduced-motion: reduce)',
    ]);
  });

  it('keeps the license comment first', () => {
    expect(out.startsWith('/*! license */')).toBe(true);
  });

  it('moves the theme onto every scope root and the token defaults onto the outermost one', () => {
    const every = sheet.nodes.find(
      (node): node is Rule => node.type === 'rule' && node.selector === EVERY_ROOT
    )!;
    expect(every.toString()).toContain('--eldra-tw-color-text: var(--eldra-color-text)');
    expect(every.toString()).toContain('--eldra-tw-spacing: .25rem');
    expect(every.toString()).not.toContain('--eldra-color-text:');
    const outermost = sheet.nodes.find(
      (node): node is Rule => node.type === 'rule' && node.selector === OUTERMOST_ROOT
    )!;
    expect(outermost.toString()).toContain('--eldra-color-text: #111');
    expect(outermost.toString()).not.toContain('--eldra-tw-');
    expect(out).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*:where\(\[data-eldra-scope\]:not\(\[data-eldra-scope\] \*\)\) \{\s*--eldra-duration-fast: 0s/
    );
    expect(out).not.toMatch(/:root|:host|\bhtml\b/);
  });

  it('renames theme variables in declarations, var() reads, fallbacks, calc() and color-mix()', () => {
    expect(out).toContain('padding: calc(var(--eldra-tw-spacing) * 4)');
    expect(out).toContain('color: var(--eldra-tw-color-text, var(--eldra-tw-fallback-color))');
    expect(out).toContain('color-mix(in oklab, var(--eldra-tw-color-text) 20%, transparent)');
    expect(out).toContain('transition-property: --tw-shadow, --eldra-tw-my-progress');
    expect(out).toContain('--tw-shadow: 0 0 #0000');
  });

  it('renames keyframes outside eldra-* with their animation and --animate-* references', () => {
    expect(out).toContain('--eldra-tw-animate-spin: eldra-tw-spin 1s linear infinite');
    expect(out).toContain('animation: var(--eldra-tw-animate-spin)');
    expect(out).toContain('animation-name: eldra-tw-spin');
    expect(out).toMatch(/@keyframes eldra-pulse/);
    expect(out).not.toMatch(/@keyframes spin\b/);
  });

  it('flattens the layers in order, lower layers at zero specificity', () => {
    expect(out).not.toContain('@layer');
    const order = [
      ':where(*)',
      ':where(:where([data-eldra-ui]))',
      ':where(.reset > a)',
      '.p-4',
      '[data-a] + [data-b]',
    ].map((selector) => selectorsInScope.findIndex((s) => s.startsWith(selector)));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('puts the scope test on the subject, before a pseudo-element, and keeps the rest', () => {
    expect(selectorsInScope).toEqual(
      expect.arrayContaining([
        `:where(*)${IN_SCOPE}`,
        `${IN_SCOPE}:before`,
        `${IN_SCOPE}::backdrop`,
        `.p-4${IN_SCOPE}`,
        `.before\\:x${IN_SCOPE}:before`,
        `.placeholder\\:x${IN_SCOPE}::placeholder:hover`,
        `.group:hover .group-hover\\:x${IN_SCOPE}`,
        `.hover\\:x:hover${IN_SCOPE}`,
        `.\\@wide\\:p-4${IN_SCOPE}`,
        `[data-a] + [data-b]${IN_SCOPE}`,
      ])
    );
    expect(selectorsInScope.filter((s) => !s.includes(IN_SCOPE))).toEqual([]);
    expect(out).toMatch(/@media \(hover: hover\) \{\s*\.hover/);
    expect(out).toMatch(/@container \(width >= 40rem\)/);
  });
});

describe('scopeCss refuses what it cannot keep', () => {
  const failing: Array<[string, string, RegExp]> = [
    [
      'a layer inside a conditional rule',
      '@media print { @layer x { a { color: red } } }',
      /@layer/,
    ],
    ['a nested layer', '@layer a { @layer b { a { color: red } } }', /@layer/],
    ['an anonymous layer', '@layer { a { color: red } }', /unsupported layer/],
    [
      'keyframes inside a media query',
      '@media print { @keyframes x { to { opacity: 1 } } }',
      /@keyframes/,
    ],
    ['an import', "@import 'x.css';", /@import/],
    ['a root beside another selector', ':root, .dark { --x: 1 }', /mixes a root/],
    ['a root inside a selector', ':root .dark { --x: 1 }', /mixes a root/],
    ['nesting', '.a { color: red; .b { color: blue } }', /nested rule/],
    [
      'an important a later layer also sets',
      '@layer a { [hidden] { display: none !important } } @layer b { .flex { display: flex !important } }',
      /display !important/,
    ],
    [
      'an unlayered rule less specific than a top-layer one',
      '@layer utilities { .a.b { color: red } } .c { color: blue }',
      /unlayered `\.c` would lose `color`/,
    ],
  ];
  it.each(failing)('fails on %s', (_name, css, message) => {
    expect(() => scopeCss(css)).toThrow(message);
  });
});

const dist = fileURLToPath(new NodeURL('../../dist/', import.meta.url));
const built = isBuilt(`${dist}components.css`, `${dist}scoped.css`);

describe('dist/scoped.css', () => {
  itFailsWithoutDist(built);
  const read = () => readFileSync(`${dist}scoped.css`, 'utf8');

  it.runIf(built)('is scopeCss of components.css', () => {
    expect(read()).toBe(scopeCss(readFileSync(`${dist}components.css`, 'utf8')));
  });

  it.runIf(built)('declares and reads no custom property outside --eldra-* and --tw-*', () => {
    const names = new Set<string>();
    const sheet = postcss.parse(read());
    sheet.walkDecls((decl) =>
      [decl.prop, decl.value].forEach((text) =>
        text.match(/--[\w-]+/g)?.forEach((n) => names.add(n))
      )
    );
    sheet.walkAtRules('property', (rule) => void names.add(rule.params));
    expect(names.size).toBeGreaterThan(100);
    expect([...names].filter((name) => !/^--(eldra|tw)-/.test(name))).toEqual([]);
    expect(names).toContain('--eldra-tw-color-text');
    expect(names).toContain('--eldra-tw-spacing');
  });

  it.runIf(built)(
    'has no root selector and no layer, and every style rule inside the scope',
    () => {
      const css = read();
      expect(css).not.toMatch(/:root|:host|\bhtml\b|@layer/);
      const sheet = postcss.parse(css);
      const scopes = sheet.nodes.filter((node) => node.type === 'atrule' && node.name === 'scope');
      expect(scopes).toHaveLength(1);
      const inScope = (rule: Rule) => {
        for (let node = rule.parent as AtRule | undefined; node; node = node.parent as AtRule)
          if (node.type === 'atrule' && node.name === 'scope') return true;
        return false;
      };
      const outside = rules(sheet).filter((rule) => !inScope(rule));
      expect([...new Set(outside.map((rule) => rule.selector))].sort()).toEqual(
        [EVERY_ROOT, OUTERMOST_ROOT].sort()
      );
      const inside = rules(scopes[0] as AtRule).flatMap((rule) => rule.selectors);
      expect(inside.length).toBeGreaterThan(1000);
      expect(inside.filter((selector) => !selector.includes(IN_SCOPE))).toEqual([]);
    }
  );

  it.runIf(built)(
    'names every keyframes in the eldra namespace, and animates only with those',
    () => {
      const css = read();
      const keyframes = [...css.matchAll(/@keyframes ([\w-]+)/g)].map((match) => match[1]!);
      expect(keyframes).toContain('eldra-tw-spin');
      expect(keyframes.filter((name) => !name.startsWith('eldra-'))).toEqual([]);
      const used = [...css.matchAll(/(?:animation(?:-name)?|--eldra-tw-animate-[\w-]+):([^;]+);/g)]
        .flatMap((match) => match[1]!.replace(/var\([^)]*\)/g, '').match(/[a-z][\w-]*/g) ?? [])
        .filter((word) => word.startsWith('eldra') || word === 'spin' || word === 'pulse');
      expect(used.filter((word) => !word.startsWith('eldra-'))).toEqual([]);
      expect(used.length).toBeGreaterThan(5);
      expect(used.filter((word) => !keyframes.includes(word))).toEqual([]);
    }
  );
});
