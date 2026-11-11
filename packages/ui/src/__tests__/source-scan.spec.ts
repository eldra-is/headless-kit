import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
// happy-dom replaces the global `URL` with one that refuses the `file:` scheme, which is what
// `import.meta.url` is here. Node's own `URL` under another name resolves it.
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isBuilt, itFailsWithoutDist } from '../test/built';

/**
 * A consumer who runs Tailwind themselves follows the recipe `dist/tailwind.css`'s own header
 * gives: Tailwind, then `@eldrajs/ui/tailwind.css` for the tokens and utilities on their own markup,
 * then the prebuilt `@eldrajs/ui/components.css` for the components. Every class a component renders
 * carries the `eldra:` prefix and is compiled into that prebuilt file, so nothing in the consumer's
 * build has to scan the package's JavaScript for class strings — and nothing may: a scan of
 * `dist/` would emit an unprefixed duplicate of every utility a component's doc comment names.
 *
 * This spec compiles exactly what that consumer's stylesheet says, against the built `dist/`, and
 * asserts the components' own rules come out the other end, with no `@source` and no candidates of
 * the package's own.
 */
const packageRoot = fileURLToPath(new NodeURL('../../', import.meta.url));
const distDir = `${packageRoot}dist/`;
const built = isBuilt(`${distDir}tailwind.css`, `${distDir}components.css`, `${distDir}index.js`);

const CONSUMER_CSS =
  "@import 'tailwindcss';\n@import '@eldrajs/ui/tailwind.css';\n@import '@eldrajs/ui/components.css';";

/** A consumer's whole compiled stylesheet: their own `candidates` plus the package's prebuilt CSS. */
async function consumerCss(candidates: string[] = []) {
  const { compile } = await import('@tailwindcss/node');
  // The base is the package root rather than `dist/` — a consumer's stylesheet sits next to their
  // own package.json — and the bare specifiers resolve through the package's `exports` map, so
  // this is also a check that both stylesheets are exported.
  const compiler = await compile(CONSUMER_CSS, { base: packageRoot, onDependency() {} });
  return { compiler, css: compiler.build(candidates) };
}

describe('consumer Tailwind build', () => {
  it.runIf(built)(
    'emits the components own utilities from the prebuilt components.css, with no source scan',
    async () => {
      const { compiler, css } = await consumerCss();

      // No `@source` reaches the consumer's build: the components need no scan of `dist/`.
      expect(compiler.sources).toEqual([]);

      // Button's fill and height, prefixed, with no candidate of the package's own.
      expect(css).toContain('.eldra\\:bg-primary {');
      expect(css).toContain('.eldra\\:control-h {');
      expect(css).toContain('.eldra\\:whitespace-nowrap {');
      // FormLayout's two-column breakpoint. A container-query variant whose `--container-*` key
      // is missing is dropped silently by Tailwind — the class ships, no rule is emitted, and the
      // form simply never pairs its fields — so the emitted condition is asserted, not the class.
      // The prebuilt file is lowered, so either spelling of the range is accepted.
      expect(css).toMatch(/@container \((?:width >= |min-width: )36rem\)/);
      expect(css).toMatch(/@container (?:\(width < |not \(min-width: )36rem\)/);

      // A field's boundary and the line that completes its 2px error state are one measurement
      // in two places: the border, and the ring's resting band, as wide as the border and
      // against its outer edge. Both read `--eldra-field-border-width`, so a consumer who sets it
      // thickens both. The resting values do not inherit, so a focusable element inside a field
      // (a tag's remove button) never draws the field's error line.
      const fieldBorder = css.slice(css.indexOf('.eldra\\:eldra-field-border {'));
      expect(fieldBorder.slice(0, 120)).toContain('var(--eldra-field-border-width, 1px)');
      const invalid = css.slice(
        css.indexOf('.eldra\\:eldra-field-invalid {'),
        css.indexOf('.eldra\\:eldra-field-invalid {') + 300
      );
      expect(invalid).toContain('--eldra-focus-rest-width: var(--eldra-field-border-width, 1px)');
      expect(invalid).toContain('--eldra-focus-rest-color: var(--eldra-color-danger)');
      expect(invalid).toContain('--eldra-focus-rest-forced: var(--eldra-field-border-width, 1px)');
      for (const name of ['width', 'offset', 'color', 'forced']) {
        expect(css).toMatch(
          new RegExp(`@property --eldra-focus-rest-${name} \\{[^}]*inherits: false`)
        );
      }
    }
  );

  it.runIf(built)("gives a consumer's own markup the package's unprefixed utilities", async () => {
    const { css } = await consumerCss(['bg-primary', 'control-h', 'eldra-focus']);
    expect(css).toContain('.bg-primary {');
    expect(css).toContain('.control-h {');
    expect(css).toContain('.eldra-focus {');
  });

  /**
   * A `Carousel`'s slides-per-view has to survive a *consumer's* Tailwind build, which is a
   * stronger requirement than surviving this package's own Storybook (bug, fixed 2026-09-27 — see
   * `carouselPerViewStyle`'s own comment in `useCarousel.ts`, the README's Deviations entry and the
   * CHANGELOG).
   *
   * `Carousel.vue` used to set `--eldra-carousel-per-view` through interpolated Tailwind
   * arbitrary-property classes (`` `[--eldra-carousel-per-view:${n}]` ``, plus `@tablet:`/
   * `@content:` steps). Tailwind has no runtime — it scans source *text* for class names — and an
   * interpolated value is never in that text, so the build emitted no rule for any of the
   * three, `eldra-carousel-slide`'s width formula fell back to its own `1`, and every carousel in
   * the built starter rendered one full-width slide.
   *
   * The values now arrive as an inline style (asserted per breakpoint in the component's own
   * spec), and the *breakpoints* are static CSS: the `eldra-carousel-track` utility. This is the
   * consumer-side half — a real compile of what a consumer's stylesheet says, against `dist` —
   * proving both container-query steps reach the stylesheet. Against the old code the two
   * `--eldra-carousel-per-view:` declarations below are simply absent, so this fails.
   */
  it.runIf(built)('emits the carousel per-view container-query steps for a consumer', async () => {
    const { css } = await consumerCss();

    // The compiler keeps the source's own line breaks, so every comparison here is on collapsed
    // whitespace — the same shape the field-border assertions above use.
    const flat = (value: string) => value.replace(/\s+/g, ' ');

    // The base step, outside any query.
    const base = flat(css.slice(css.indexOf('.eldra\\:eldra-carousel-track {')).slice(0, 200));
    expect(base).toContain('--eldra-carousel-per-view: var(--eldra-carousel-per-view-base, 1)');

    // ...and one step per breakpoint, each inside a real `@container` rule with a literal length
    // (a `@container` condition may not hold a `var()`; see `theme.css`'s own header).
    for (const [width, property] of [
      ['48rem', '--eldra-carousel-per-view-md'],
      ['64rem', '--eldra-carousel-per-view-lg'],
    ] as const) {
      const step = new RegExp(
        String.raw`@container \((?:width >= |min-width: )${width}\) \{ \.eldra\\:eldra-carousel-track \{ --eldra-carousel-per-view: var\( ?${property}`
      );
      expect(flat(css), `the ${width} carousel step is not in the compiled stylesheet`).toMatch(
        step
      );
    }

    // The slide's own width formula still reads the one resolved variable, not the three inputs.
    const slide = flat(css.slice(css.indexOf('.eldra\\:eldra-carousel-slide {')).slice(0, 300));
    expect(slide).toContain('var(--eldra-carousel-per-view, 1)');
  });

  /**
   * The pills tab list's focus-ring reservation has to survive a *consumer's* build too, and it is
   * the same trap the carousel fell into one directive earlier: the five utilities that hold the
   * ring open are arbitrary values over the ring tokens
   * (`eldra:px-[calc(var(--eldra-focus-offset)_+_var(--eldra-focus-width))]` and its four
   * siblings), so assembling any of those names at runtime from a shared constant would leave the
   * stylesheet with no rule at all — and nothing that measures the rendered page could tell,
   * because a harness that compiles the *class names it found in the markup* emits them either way.
   * This compiles what a consumer's own stylesheet says, against `dist/`, and asserts the five
   * declarations come out of it.
   *
   * Two of them (`padding-block`/`margin-block`) are also what `Carousel`'s track writes, so they
   * would survive here on the carousel's spelling alone; the inline three are `Tabs`' own, and
   * against an interpolated version they are simply absent.
   */
  it.runIf(built)('emits the tab list ring reservation for a consumer', async () => {
    const css = (await consumerCss()).css.replace(/\s+/g, ' ');
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
      const carriesItself = own.includes('eldra:cursor-pointer');
      const carriesThroughImport = localImportSpecifiers(own)
        .map((specifier) => resolveLocalImport(file, specifier))
        .filter((resolved): resolved is string => resolved !== undefined)
        .some((resolved) => readFileSync(resolved, 'utf8').includes('eldra:cursor-pointer'));
      expect(carriesItself || carriesThroughImport).toBe(true);
    }
  );
});
