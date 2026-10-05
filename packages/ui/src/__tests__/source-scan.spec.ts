import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
      // `@container (width < 48rem)` (`@max-tablet`) is not asserted here: it was only ever
      // reached through `Button`'s touch-target growth, which the operator override removed (see
      // `Button.vue` and the README's Deviations) — nothing in the package emits it today, so
      // there is nothing here for the scanner to find. `--container-tablet` itself is unchanged in
      // `tailwind.css`, for a future component that needs the same 48rem edge.
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

  /**
   * A `Carousel`'s slides-per-view has to survive a *consumer's* Tailwind build, which is a
   * stronger requirement than surviving this package's own Storybook (bug, fixed 2026-09-27 — see
   * `carouselPerViewStyle`'s own comment in `useCarousel.ts`, the README's Deviations entry and the
   * CHANGELOG).
   *
   * `Carousel.vue` used to set `--eldra-carousel-per-view` through interpolated Tailwind
   * arbitrary-property classes (`` `[--eldra-carousel-per-view:${n}]` ``, plus `@tablet:`/
   * `@content:` steps). Tailwind has no runtime — it scans source *text* for class names — and an
   * interpolated value is never in that text, so a consumer's build emitted no rule for any of the
   * three, `eldra-carousel-slide`'s width formula fell back to its own `1`, and every carousel in
   * the built starter rendered one full-width slide (testimonials, product-carousel, the
   * `split-carousel` hero and the `carousel` gallery, all at once). Nothing caught it: the numbers
   * appear in the package's own Storybook because its `@source '../src'` happens to scan the very
   * `.vue` file whose *template literal* holds the pattern, so the fixed-number classes it also
   * mentions get emitted there.
   *
   * The values now arrive as an inline style (asserted per breakpoint in the component's own
   * spec), and the *breakpoints* are static CSS: the `eldra-carousel-track` utility. This is the
   * consumer-side half — a real compile of what a consumer's stylesheet says, against `dist` —
   * proving both container-query steps reach the stylesheet. Against the old code the two
   * `--eldra-carousel-per-view:` declarations below are simply absent, so this fails.
   */
  it.runIf(built)('emits the carousel per-view container-query steps for a consumer', async () => {
    const { compile } = await import('@tailwindcss/node');
    const compiler = await compile(`@import 'tailwindcss';\n@import '@eldrajs/ui/tailwind.css';`, {
      base: packageRoot,
      onDependency() {},
    });
    const css = compiler.build(['eldra-carousel-track', 'eldra-carousel-slide']);

    // The compiler keeps the source's own line breaks, so every comparison here is on collapsed
    // whitespace — the same shape the field-border assertions above use.
    const flat = (value: string) => value.replace(/\s+/g, ' ');

    // The base step, outside any query.
    const base = flat(css.slice(css.indexOf('.eldra-carousel-track {')).slice(0, 200));
    expect(base).toContain('--eldra-carousel-per-view: var(--eldra-carousel-per-view-base, 1)');

    // ...and one step per breakpoint, each inside a real `@container` rule with a literal length
    // (a `@container` condition may not hold a `var()`; see `tailwind.css`'s own header).
    for (const [width, property] of [
      ['48rem', '--eldra-carousel-per-view-md'],
      ['64rem', '--eldra-carousel-per-view-lg'],
    ] as const) {
      const start = css.indexOf(`@container (width >= ${width})`);
      expect(
        start,
        `@container (width >= ${width}) is not in the compiled stylesheet`
      ).toBeGreaterThan(-1);
      const block = flat(css.slice(start, css.indexOf('\n}\n', start)));
      expect(block).toContain(`--eldra-carousel-per-view: var( ${property}`);
    }

    // The slide's own width formula still reads the one resolved variable, not the three inputs.
    const slide = flat(css.slice(css.indexOf('.eldra-carousel-slide {')).slice(0, 300));
    expect(slide).toContain('var(--eldra-carousel-per-view, 1)');
  });

  /**
   * The pills tab list's focus-ring reservation has to survive a *consumer's* build too, and it is
   * the same trap the carousel fell into one directive earlier: the four utilities that hold the
   * ring open are arbitrary values over the ring tokens
   * (`px-[calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width))]` and its three siblings), so
   * assembling any of those names at runtime from a shared constant would leave a consumer's
   * stylesheet with no rule at all — and nothing that measures the rendered page could tell,
   * because a harness that compiles the *class names it found in the markup* emits them either way.
   * This compiles what a consumer's own stylesheet says, against `dist/`, and asserts the four
   * declarations come out of it.
   *
   * Two of them (`padding-block`/`margin-block`) are also what `Carousel`'s track writes, so they
   * would survive here on the carousel's spelling alone; the inline three are `Tabs`' own, and
   * against an interpolated version they are simply absent.
   */
  it.runIf(built)('emits the tab list ring reservation for a consumer', async () => {
    const { compile } = await import('@tailwindcss/node');
    const { Scanner } = await import('@tailwindcss/oxide');
    const compiler = await compile(`@import 'tailwindcss';\n@import '@eldrajs/ui/tailwind.css';`, {
      base: packageRoot,
      onDependency() {},
    });
    const scanner = new Scanner({ sources: compiler.sources });
    const css = compiler.build(scanner.scan()).replace(/\s+/g, ' ');
    const reach = 'calc(var(--eldra-focus-offset) + var(--eldra-focus-width))';
    for (const declaration of [
      `padding-block: ${reach}`,
      `margin-block: calc(${reach} * -1)`,
      `padding-inline: ${reach}`,
      `margin-inline: calc(${reach} * -1)`,
      `scroll-padding-inline: ${reach}`,
    ]) {
      expect(css, `${declaration} never reached a consumer stylesheet`).toContain(declaration);
    }
  });

  /**
   * The shipped stylesheet must hold no rule for a class nothing renders.
   *
   * `dist/style.css` is compiled from `src/` by Tailwind's own source scan, which reads the files
   * there rather than the class strings a component actually builds. So the `Button` doc comment
   * that named the 1px press translate it had replaced — in prose, explaining the decision — put a
   * real rule for that class into the stylesheet every consumer ships, for a class that is on no
   * element. It is a small rule, but it is a lie about what the package draws, and nothing else in
   * the suite could see it: every other assertion is about what a component renders, and this is
   * exactly the class nothing renders any more.
   *
   * The scan is wider than the component tree, which is the part that is easy to miss: automatic
   * source detection starts at the **package root**, so `README.md` and `CHANGELOG.md` feed it too
   * — and both named the old class while explaining the decision, which is what kept the rule alive
   * after the component comment was cleaned. Nothing under this package may write that class name
   * out, prose included; this assertion is what says so.
   */
  it.runIf(built)('ships no rule for the press movement the scale replaced', () => {
    const stylesheet = readFileSync(`${distDir}style.css`, 'utf8');
    // The pattern rather than the class name, for the same reason the Button's own spec uses one:
    // writing it here would put it back in the very stylesheet this asserts about.
    expect(stylesheet).not.toMatch(/active\\:-?(translate|top|mt)/);
  });

  // A missing `dist/` is a skip locally and a **failure** under `CI`; see `src/test/built.ts`.
  itFailsWithoutDist(built);
});

/**
 * Every enabled `<button>` in the package shows `cursor-pointer` (operator report, 2026-09-25;
 * recorded under Deviations in the README) rather than Tailwind v4 preflight's own
 * `button { cursor: default }`.
 *
 * The check is textual, so it has to follow the same seam the live components actually use:
 * `Input`, `SearchBar` and `UnitInput`'s clear buttons all draw `FIELD_CLEAR_BUTTON` from
 * `input/classes.ts` rather than writing the token in their own file, so a component "carries"
 * `cursor-pointer` when its own `<script>` has the token *or* a relative import it names does, one
 * hop out — `UnitInput.vue`'s drag handle is `cursor-ns-resize` and nothing else in that file
 * spells `cursor-pointer`, but the clear button beside it imports `FIELD_CLEAR_BUTTON`, so the file
 * passes.
 */
const componentsRoot = fileURLToPath(new NodeURL('../components/', import.meta.url));

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === '__tests__' ? [] : vueFiles(path);
    }
    return path.endsWith('.vue') ? [path] : [];
  });
}

/** Comments are prose, not markup: a doc comment that merely *mentions* `<button>` (a `<label
 *  for>` "cannot name a `<button>` trigger", say) must not count as the file rendering one. */
function stripComments(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/<!--[\s\S]*?-->/g, ' ')
    .replaceAll(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/** Every relative `import … from '…'` specifier a `<script>` block names. */
function localImportSpecifiers(source: string): string[] {
  return [...source.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)].map((match) => match[1] as string);
}

/** Resolves a relative specifier to a readable file, trying the extensions this package's own
 *  imports always use. `undefined` for anything that does not resolve to a real file. */
function resolveLocalImport(fromFile: string, specifier: string): string | undefined {
  const base = join(dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.vue`, join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* not this candidate — try the next extension */
    }
  }
  return undefined;
}

describe('every enabled <button> is cursor-pointer', () => {
  const files = vueFiles(componentsRoot);

  it('finds the components to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  const withButton = files.filter((file) =>
    stripComments(readFileSync(file, 'utf8')).includes('<button')
  );

  it('finds at least one component that renders a <button>', () => {
    expect(withButton.length).toBeGreaterThan(0);
  });

  it.each(withButton.map((file) => [file.slice(componentsRoot.length), file]))(
    '%s carries cursor-pointer, on the file itself or a local import it names',
    (_name, file) => {
      const own = readFileSync(file, 'utf8');
      const carriesItself = own.includes('cursor-pointer');
      const carriesThroughImport = localImportSpecifiers(own)
        .map((specifier) => resolveLocalImport(file, specifier))
        .filter((resolved): resolved is string => resolved !== undefined)
        .some((resolved) => readFileSync(resolved, 'utf8').includes('cursor-pointer'));
      expect(carriesItself || carriesThroughImport).toBe(true);
    }
  );
});
