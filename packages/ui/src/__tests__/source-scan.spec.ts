import { resolve } from 'node:path';
// happy-dom replaces the global `URL` with one that refuses the `file:` scheme, which is what
// `import.meta.url` is here. Node's own `URL` under another name resolves it.
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isBuilt, itFailsWithoutDist } from '../test/built';

/**
 * `dist/tailwind.css` ends with `@source './'`, which is the whole reason a consumer who runs
 * Tailwind themselves sees the components styled: their build has to scan the package's *compiled*
 * JavaScript for class strings, because the source `.vue` files are not in the tarball.
 *
 * Nothing else in the repo proves that. The package's own Storybook build reads `src` through an
 * explicit `@source '../src'` in `.storybook/preview.css`, and `style.css` is compiled from source
 * too — so `@source './'` could resolve against the wrong directory, or be dropped for a gitignored
 * one (`dist` is in `.gitignore`), and every check would still pass while every consumer got a
 * button with no background.
 *
 * This spec is the missing proof: it compiles exactly what a consumer's stylesheet says, against
 * the built `dist/`, and asserts the Button's own utilities come out the other end.
 */
const packageRoot = fileURLToPath(new NodeURL('../../', import.meta.url));
const distDir = `${packageRoot}dist/`;
const built = isBuilt(`${distDir}tailwind.css`, `${distDir}index.js`);

describe('consumer Tailwind build', () => {
  it.runIf(built)(
    'emits the components own utilities from dist, which @source ./ scans',
    async () => {
      const { compile } = await import('@tailwindcss/node');
      const { Scanner } = await import('@tailwindcss/oxide');

      // What a consumer's main.css says, verbatim. The bare specifier resolves through the
      // package's `exports` map, so this is also a check that `./tailwind.css` is exported. The
      // base is the package root rather than `dist/` — a consumer's stylesheet sits next to their
      // own package.json, nowhere near ours — so nothing here can quietly resolve `@source './'`
      // against the directory that happens to hold the answer.
      const compiler = await compile(
        `@import 'tailwindcss';\n@import '@eldrajs/ui/tailwind.css';`,
        {
          base: packageRoot,
          onDependency() {},
        }
      );

      // The scan has to land on `dist`, not on `src`. Tailwind reports a source as the declaring
      // CSS file's directory plus the directive's own relative pattern, so both halves are
      // checked: `@source '../src'` would still produce a fully styled stylesheet here (the class
      // strings are in the source too) and ship a consumer nothing at all.
      expect(compiler.sources).toHaveLength(1);
      const source = compiler.sources[0];
      expect(source?.base.replaceAll('\\', '/')).toMatch(/\/dist$/);
      expect(resolve(source?.base ?? '', source?.pattern ?? '').replaceAll('\\', '/')).toMatch(
        /\/dist$/
      );

      // `compile()` only records the `@source` directives; the integration (here, us) runs the
      // scanner over them, exactly as @tailwindcss/vite does.
      const scanner = new Scanner({ sources: compiler.sources });
      const candidates = scanner.scan();
      const css = compiler.build(candidates);

      // Button's fill, from `dist/index.js` and nowhere else.
      expect(candidates).toContain('bg-primary');
      expect(css).toContain('.bg-primary {');
      // ...and the parts that only exist because the scan found the whole component, not one string.
      expect(css).toContain('.control-h {');
      expect(css).toContain('@container (width < 48rem)');
      expect(css).toContain('.whitespace-nowrap {');
      // FormLayout's two-column breakpoint. A container-query variant whose `--container-*` key
      // is missing is dropped silently by Tailwind — the class ships, no rule is emitted, and the
      // form simply never pairs its fields — so the emitted condition is asserted, not the class.
      expect(css).toContain('@container (width >= 36rem)');
      expect(css).toContain('@container (width < 36rem)');

      // A field's boundary and the inset line that completes its 2px error state are one
      // measurement in two places, and the line is inset by exactly the border's own width — so a
      // border hard-wired to 1px while the line read a variable would come apart the moment a
      // consumer set that variable. Both now read `--eldra-field-border-width`, and the line's
      // corner follows the *field's* radius rather than always `radius-md`, so an Input with
      // `--eldra-input-radius` set does not round its border one way and its error line another.
      const fieldBorder = css.slice(css.indexOf('.eldra-field-border {'));
      expect(fieldBorder.slice(0, 120)).toContain('var(--eldra-field-border-width, 1px)');
      const invalid = css.slice(
        css.indexOf('.eldra-field-invalid'),
        css.indexOf('.eldra-field-invalid') + 600
      );
      expect(invalid).toContain('var(--eldra-field-border-width, 1px)');

      // The radius is declared as `--eldra-field-invalid-radius` and then read by the `calc()`,
      // rather than written inline, so a consumer's PostCSS pass never sees a `calc()` with a
      // two-deep `var()` fallback in it (postcss-calc's grammar cannot parse one and warns on
      // every build). Substitution makes the two spellings identical, and this is the proof:
      // inlining the declared value back into the `calc()` reproduces the original expression
      // exactly, so the computed value is unchanged.
      // The compiler keeps the source's own line breaks, so compare on collapsed whitespace.
      const flat = (value: string | undefined) =>
        value?.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
      const declared = flat(/--eldra-field-invalid-radius:\s*([^;]+);/.exec(invalid)?.[1]);
      expect(declared).toBe(
        'var(--eldra-field-radius, var(--eldra-input-radius, var(--eldra-radius-md)))'
      );
      const radius = flat(/border-radius:\s*(calc\([^;]+\));/.exec(invalid)?.[1]);
      expect(radius).toBe(
        'calc(var(--eldra-field-invalid-radius) - var(--eldra-field-border-width, 1px))'
      );
      expect(radius?.replace('var(--eldra-field-invalid-radius)', declared as string)).toBe(
        'calc(var(--eldra-field-radius, var(--eldra-input-radius, var(--eldra-radius-md))) - var(--eldra-field-border-width, 1px))'
      );
    }
  );

  // A missing `dist/` is a skip locally and a **failure** under `CI`; see `src/test/built.ts`.
  itFailsWithoutDist(built);
});
