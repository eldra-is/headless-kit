import { existsSync } from 'node:fs';
// happy-dom replaces the global `URL` with one that refuses the `file:` scheme, which is what
// `import.meta.url` is here. Node's own `URL` under another name resolves it.
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';

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
const distDir = fileURLToPath(new NodeURL('../../dist/', import.meta.url));
const built = existsSync(`${distDir}tailwind.css`) && existsSync(`${distDir}index.js`);

describe('consumer Tailwind build', () => {
  it.runIf(built)(
    'emits the components own utilities from dist, which @source ./ scans',
    async () => {
      const { compile } = await import('@tailwindcss/node');
      const { Scanner } = await import('@tailwindcss/oxide');

      // What a consumer's main.css says, verbatim. The bare specifier resolves through the
      // package's `exports` map, so this is also a check that `./tailwind.css` is exported.
      const compiler = await compile(
        `@import 'tailwindcss';\n@import '@eldrajs/ui/tailwind.css';`,
        {
          base: distDir,
          onDependency() {},
        }
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
    }
  );

  it.skipIf(built)('needs a build first: run `pnpm --filter @eldrajs/ui build`', () => {
    expect(built).toBe(false);
  });
});
