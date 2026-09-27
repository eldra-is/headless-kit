import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compile } from '@tailwindcss/node';

/**
 * `app/assets/main.css` is the theme's whole Tailwind root, and since it moved
 * onto `@eldrajs/ui`'s Tailwind entry it inherits that file's `@theme` — which
 * *resets* whole namespaces (`--color-*`, `--spacing-*`, `--radius-*`,
 * `--shadow-*`) before naming the design tokens. A class that no longer has a
 * theme key behind it does not fail anything: Tailwind emits no rule, ships no
 * error, and the element simply loses that property. `backdrop:bg-black/50` on
 * `UiDialog` did exactly that — the lightbox and the mobile drawer opened over
 * a transparent page — and nothing in the suite noticed.
 *
 * So this spec compiles the real stylesheet, the way a consumer's build does,
 * and asserts the rules the theme depends on actually come out. It hands the
 * compiler an explicit candidate list rather than running the scanner: the
 * question here is "does this class produce a rule in this build", not "is the
 * class somewhere in the source".
 */
const assetsDir = fileURLToPath(new URL('../app/assets/', import.meta.url));
const mainCss = readFileSync(`${assetsDir}main.css`, 'utf8');

async function build(candidates: string[]): Promise<string> {
  // `base` is main.css's own directory, so `@import 'tailwindcss'` and
  // `@import '@eldrajs/ui/tailwind.css'` resolve out of node_modules exactly as
  // they do under `@tailwindcss/vite` — which is also a check that the package
  // exports that path at all.
  const compiler = await compile(mainCss, { base: assetsDir, onDependency() {} });
  return compiler.build(candidates);
}

describe('main.css', () => {
  it('emits the dialog backdrop from the overlay token', async () => {
    const css = await build(['backdrop:bg-overlay']);
    expect(css).toContain('::backdrop');
    expect(css).toContain('var(--color-overlay)');
  });

  // The other half of the same fact: the class this replaced is dead in this
  // build. If a future theme change restores a `black` colour key this test
  // fails, which is the moment to re-read the comment above rather than to
  // start writing `bg-black/50` again.
  it('emits nothing for bg-black, which the package theme resets away', async () => {
    const css = await build(['bg-black/50']);
    expect(css).not.toContain('bg-black');
  });

  // The package's own utilities and its colour/type scale, proving the
  // `@import '@eldrajs/ui/tailwind.css'` half of the file is live: these exist
  // only because that import brought the `@theme` block and the `@utility`
  // rules with it.
  it('emits the package utilities and token colours the blocks use', async () => {
    const css = await build([
      'eldra-focus',
      'control-h',
      'text-body',
      'bg-primary',
      'text-primary-contrast',
      'border-border-strong',
      'rounded-lg',
      'shadow-md',
    ]);
    for (const rule of [
      '.eldra-focus',
      '.control-h',
      '.text-body',
      '.bg-primary',
      '.text-primary-contrast',
      '.border-border-strong',
      '.rounded-lg',
      '.shadow-md',
    ]) {
      expect(css).toContain(rule);
    }
    expect(css).toContain('var(--eldra-color-primary)');
  });

  // `Container`/`Section` (task 6) replaced this file's own `.eldra-container[data-size]` rules
  // and the `--spacing-section`/`-lg` `@theme` keys: max-width and gutters now come from the
  // package's `eldra-container-*` utilities and `--eldra-gutter-*`, and padding-block from `--eldra-section-*`
  // directly on `Section`'s own `pt-*`/`pb-*` classes — nothing left for `main.css` to declare.
  // This proves the classes those two components emit still compile through this file's own
  // import chain, the same way the assertion above proves the rest of the package's utilities do.
  it('emits the layout primitives Container and Section use, through this file', async () => {
    const css = await build([
      'eldra-container-narrow',
      'eldra-container-content',
      'eldra-container-wide',
      'pt-[var(--eldra-section-md)]',
    ]);
    expect(css).toContain('var(--eldra-container-narrow)');
    expect(css).toContain('var(--eldra-container-content)');
    expect(css).toContain('var(--eldra-container-wide)');
    expect(css).toContain('padding-top: var(--eldra-section-md)');
  });
});
