import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isBuilt, itFailsWithoutDist } from '../test/built';

/**
 * The built-CSS half of the `@content:`/`@wide:`/`@narrow:` container-query fix (see
 * `tailwind.css`'s `@theme` block, and `containerQueryLiterals.spec.ts` for the source-level
 * half). With `--container-content`/`-wide` as `var(--eldra-container-*)` (the shipped bug), these
 * two variants — and `@narrow:`, `--container-narrow` — compiled to nothing at all: no error, no
 * rule, just silence, which is how `Container`'s own `@content:px-[var(--eldra-gutter-desktop)]`
 * desktop gutter, and every starter block's `@content:` layout, never engaged.
 *
 * This compiles the real, built stylesheet — the same `@tailwindcss/node` compile-and-inspect
 * technique `sectionAdjacentBackground.spec.ts` and `modalClosedDisplay.spec.ts` use — and proves
 * both breakpoints now emit a real `@container` rule. `Container`'s own gutter utility is the
 * natural carrier for the 64rem edge; nothing in this package uses `@wide:` yet (recorded in
 * `tailwind.css`'s own `--container-tablet` comment as the shape a future component might), so the
 * 80rem edge is proven directly against a synthetic utility instead.
 */
const distDir = fileURLToPath(new NodeURL('../../dist/', import.meta.url));
const built = isBuilt(`${distDir}tailwind.css`, `${distDir}index.js`);

describe('the @content/@wide/@narrow container-query breakpoints actually compile', () => {
  it.runIf(built)(
    "Container's own desktop gutter rule sits inside a real 64rem container query",
    async () => {
      const { compile } = await import('@tailwindcss/node');
      const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';`, {
        base: distDir,
        onDependency() {},
      });
      const css = compiler.build(['@content:px-[var(--eldra-gutter-desktop)]']);

      const queryStart = css.indexOf('@container (width >= 64rem)');
      expect(
        queryStart,
        '@container (width >= 64rem) is not in the compiled stylesheet'
      ).toBeGreaterThan(-1);
      const queryBlock = css.slice(queryStart, css.indexOf('\n}', queryStart));
      expect(queryBlock).toContain('padding-inline: var(--eldra-gutter-desktop)');
    }
  );

  it.runIf(built)('the 80rem @wide edge compiles, even with no consumer of it yet', async () => {
    const { compile } = await import('@tailwindcss/node');
    const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';`, {
      base: distDir,
      onDependency() {},
    });
    const css = compiler.build(['@wide:hidden']);

    const queryStart = css.indexOf('@container (width >= 80rem)');
    expect(
      queryStart,
      '@container (width >= 80rem) is not in the compiled stylesheet'
    ).toBeGreaterThan(-1);
    const queryBlock = css.slice(queryStart, css.indexOf('\n}', queryStart));
    expect(queryBlock).toContain('display: none');
  });

  it.runIf(built)('the 40rem @narrow edge compiles too', async () => {
    const { compile } = await import('@tailwindcss/node');
    const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';`, {
      base: distDir,
      onDependency() {},
    });
    const css = compiler.build(['@narrow:hidden']);

    expect(css).toContain('@container (width >= 40rem)');
  });

  it.runIf(built)("Container's own width utilities read the var(), not a literal", async () => {
    const { compile } = await import('@tailwindcss/node');
    const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';`, {
      base: distDir,
      onDependency() {},
    });
    const css = compiler.build([
      'eldra-container-narrow',
      'eldra-container-content',
      'eldra-container-wide',
    ]);

    for (const name of ['narrow', 'content', 'wide']) {
      const start = css.indexOf(`.eldra-container-${name} {`);
      expect(start, `.eldra-container-${name} is not in the compiled stylesheet`).toBeGreaterThan(
        -1
      );
      const rule = css.slice(start, css.indexOf('}', start));
      expect(rule).toContain(`max-width: var(--eldra-container-${name})`);
    }
  });

  // A missing `dist/` is a skip locally and a **failure** under `CI`; see `src/test/built.ts`.
  itFailsWithoutDist(built);
});
