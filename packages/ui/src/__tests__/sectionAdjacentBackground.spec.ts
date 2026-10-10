import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isBuilt, itFailsWithoutDist } from '../test/built';

/**
 * Spec "Container and section" → Do/Don't: "Do alternate none and surface between neighbouring
 * blocks instead of adding divider lines" — two adjacent `Section`s with the same background must
 * read as one continuous band, which means the second one's top padding has to disappear. That
 * rule lives in `tailwind.css` as plain, unlayered CSS (see its own comment, "Container and
 * section"), specifically so it beats `Section`'s own `pt-*` utility regardless of specificity or
 * source order. This spec compiles the real stylesheet and proves the override actually wins,
 * mirroring `focus-transition.spec.ts`'s compile-and-inspect technique.
 */
const distDir = fileURLToPath(new NodeURL('../../dist/', import.meta.url));
const built = isBuilt(`${distDir}tailwind.css`, `${distDir}index.js`);

/**
 * Strips `/* ... *\/` comments, the same way `custom-utility-coverage.spec.ts` and
 * `focus-transition.spec.ts` do — so a brace mentioned in prose (this very file's tailwind.css
 * comments describe CSS rules with `{ }` in them) can never be mistaken for a real block boundary.
 */
function stripComments(css: string): string {
  return css.replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * True when `index` falls inside the body of some `@layer` at-rule (any name, any nesting depth) —
 * a real brace-depth scan, not a substring guess, so a mutation that wraps the sibling rule in
 * `@layer utilities { ... }` is actually caught: proven by mutation (temporarily wrapping the rule
 * in `@layer utilities { ... }` in `tailwind.css` and rebuilding turns this spec red).
 *
 * Every `{` opens a block; it is an `@layer` block when the nearest unclosed at-rule/selector text
 * immediately before it starts with `@layer`. A stack of booleans (one per open brace: "this block
 * is a layer") answers the question for `index` by checking whether any entry below the current
 * depth is `true`.
 */
function isInsideLayerAt(css: string, index: number): boolean {
  const layerStack: boolean[] = [];
  let lastStop = 0; // index just after the previous `{`/`}`/`;`
  for (let i = 0; i < index; i++) {
    const ch = css[i];
    if (ch === '{') {
      const header = css.slice(lastStop, i).trim();
      layerStack.push(header.startsWith('@layer'));
      lastStop = i + 1;
    } else if (ch === '}') {
      layerStack.pop();
      lastStop = i + 1;
    } else if (ch === ';') {
      lastStop = i + 1;
    }
  }
  return layerStack.some(Boolean);
}

describe('adjacent same-background Sections drop the top padding', () => {
  it.runIf(built)('the sibling rule is unlayered, so it beats a layered pt-* utility', async () => {
    const { compile } = await import('@tailwindcss/node');
    const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';`, {
      base: distDir,
      onDependency() {},
    });
    const rawCss = compiler.build(['pt-[var(--eldra-section-md)]']);
    const css = stripComments(rawCss);

    // The utility itself still compiles, inside @layer utilities, unmodified.
    expect(css).toMatch(/@layer utilities\s*\{\s*\.pt-\\\[var\\\(--eldra-section-md\\\)\\\]\s*\{/);
    const utilityStart = css.indexOf('.pt-\\[var\\(--eldra-section-md\\)\\]');
    expect(utilityStart, 'pt-[var(--eldra-section-md)] did not compile').toBeGreaterThan(-1);
    expect(isInsideLayerAt(css, utilityStart)).toBe(true);

    // The five sibling pairs exist, and — the actual guard — the rule sits outside every
    // `@layer`, proven by the brace-depth scan above rather than a substring guess. A rule nested
    // inside a `@layer` block (however that layer is named) would lose to the utility whenever
    // they disagreed, because Tailwind's own utilities always outrank an *earlier*-declared layer,
    // and a layer with no explicit order (as a plain `@layer utilities { ... }` mutation would be)
    // is ordered by first appearance — either way, layering the rule breaks the override.
    for (const value of ['none', 'surface', 'surface-strong', 'primary', 'accent']) {
      const selector = `[data-section-bg='${value}'] + [data-section-bg='${value}']`;
      expect(css).toContain(selector);
    }

    const ruleStart = css.indexOf("[data-section-bg='none']");
    expect(ruleStart, 'the sibling rule is not in the compiled stylesheet').toBeGreaterThan(-1);
    const ruleBlock = css.slice(ruleStart, css.indexOf('}', ruleStart) + 1);
    expect(ruleBlock).toContain('padding-top: 0');
    expect(isInsideLayerAt(css, ruleStart)).toBe(false);
  });

  // A missing `dist/` is a skip locally and a **failure** under `CI`; see `src/test/built.ts`.
  itFailsWithoutDist(built);
});
