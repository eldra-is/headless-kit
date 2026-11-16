import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
// happy-dom's global `URL` refuses the `file:` scheme that `import.meta.url` is here; Node's own
// `URL` under another name resolves it (the same workaround `source-scan.spec.ts` documents).
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileKitCss } from '../test/kitCss';

/**
 * `eldra-focus` and `eldra-focus-inset` own the transition list of the element they sit on.
 *
 * The defect this guards: `transition` is a single shorthand property, so a component that also
 * carried `transition-[background-color,…] duration-fast` emitted a later rule in the same cascade
 * layer that replaced the ring's `outline-width` and `box-shadow` entries outright. The ring still
 * drew — it just snapped to full size instead of growing in over `duration-base`, which is exactly
 * the kind of regression nobody sees in a still screenshot or an axe run. `src/styles/utilities.css`
 * now declares every animated property inside the two focus utilities, and this spec keeps
 * components from putting a second `transition` shorthand beside them.
 */
const componentsDir = fileURLToPath(new NodeURL('../components/', import.meta.url));

/**
 * Every file under `src/components` that can build a class list: the `.vue` components and the
 * `.ts` modules some of them keep their class builders in (`select/panelParts.ts`, which holds the
 * select panel's parts for both `Select` and `MultiSelect` — the search field's inset ring among
 * them). Specs and stories are excluded: both name these classes in prose without drawing
 * anything.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === '__tests__' ? [] : sourceFiles(path);
    }
    if (path.endsWith('.vue')) return [path];
    return path.endsWith('.ts') && !path.endsWith('.stories.ts') ? [path] : [];
  });
}

/** Comments are prose about classes, not classes. */
function stripComments(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/<!--[\s\S]*?-->/g, ' ')
    .replaceAll(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const STRING = String.raw`'[^'\n]*'|"[^"\n]*"|\`[^\`]*\``;
/** A run of string literals joined by `+` — how every component builds a class list. */
const CONCATENATION = new RegExp(String.raw`(?:${STRING})(?:\s*\+\s*(?:${STRING}))*`, 'g');
/** `[ 'a', 'b' ].join(' ')` — the other shape (ButtonGroup's attached classes). */
const JOINED_ARRAY = /\[[^[\]]*\]\s*\.join\(/g;

/**
 * Every class list a component builds, as one string per element: `+`-concatenated literals
 * collapsed into one, and `[...].join(' ')` arrays collapsed into one.
 */
function classLists(source: string): string[] {
  const clean = stripComments(source);
  const lists = [...clean.matchAll(JOINED_ARRAY)].map((match) => match[0]);
  lists.push(...(clean.match(CONCATENATION) ?? []));
  return lists.map((list) => list.replaceAll(/['"`]/g, ' ').replaceAll(/[+,]/g, ' '));
}

/** `transition-[…]`, `duration-fast`, `motion-reduce:transition-none`, … but not `duration:`. */
const OWNED = /(?:^|\s)(?:[\w@[\]./-]+:)*(transition|duration)-\S*/;

describe('the focus ring owns its element transitions', () => {
  const files = sourceFiles(componentsDir);

  it('finds the components to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [file.slice(componentsDir.length), file]))(
    '%s puts no transition utility on an element that carries eldra-focus',
    (_name, file) => {
      const offenders = classLists(readFileSync(file, 'utf8'))
        .filter((list) => /(?:^|\s)eldra:eldra-focus(?:-always|-inset)?(?:\s|$)/.test(list))
        .filter((list) => OWNED.test(list));
      expect(offenders).toEqual([]);
    }
  );

  it('draws the inset ring against the edge, with its gap inside it', () => {
    const source = readFileSync(
      fileURLToPath(new NodeURL('../styles/utilities.css', import.meta.url)),
      'utf8'
    );
    for (const name of ['eldra-focus-inset', 'eldra-focus-inset-always']) {
      const start = source.indexOf(`@utility ${name} {`);
      const rule = source.slice(start, source.indexOf('\n}', start));
      const ring = rule.indexOf('var(--eldra-color-focus)');
      const gap = rule.indexOf('var(--eldra-color-focus-inner)');
      expect(ring, name).toBeGreaterThan(-1);
      // The first shadow is painted on top: the ring's own band at the edge, the gap colour under it.
      expect(ring, name).toBeLessThan(gap);
    }
  });

  it('compiles a focus ring that fades in at full size', async () => {
    const css = await compileKitCss([
      'eldra:eldra-focus',
      'eldra:eldra-focus-inset',
      'eldra:eldra-focus-proxy',
    ]);

    // `--eldra-focus-alpha` has to be a *registered* custom property, or it is an uninterpolatable
    // token string and the fade is a jump — which looks exactly like the geometry animation this
    // replaced, so nothing else here would notice.
    expect(css).toMatch(
      /@property --eldra-focus-alpha \{[^}]*syntax:\s*'<number>'[^}]*initial-value:\s*0[^}]*\}/
    );

    for (const utility of ['.eldra\\:eldra-focus', '.eldra\\:eldra-focus-inset']) {
      const start = css.indexOf(`${utility} {`);
      expect(start, `${utility} is not in the compiled stylesheet`).toBeGreaterThan(-1);
      const rule = css.slice(start, css.indexOf('\n  }', start));

      // The ring arrives by fading its alpha over duration-base...
      expect(rule).toContain('--eldra-focus-alpha var(--eldra-duration-base)');
      // ...never by animating its geometry. A browser paints `outline-width` and a `box-shadow`
      // spread at whole device pixels, so a 2px growth has two or three frames however long the
      // transition runs and reads as a stutter. This is the assertion that keeps it gone.
      expect(rule).not.toContain('outline-width var(--eldra-duration');
      expect(rule).not.toContain('box-shadow var(--eldra-duration');

      // The outer ring's colour, and its position, follow that one alpha: it rests as a 1px band
      // against the border (a field's error line, transparent elsewhere) and moves out past the
      // infill on focus. Its edges are box-shadow spreads, which a browser draws at fractional
      // sizes, so the move is continuous; an outline would step at whole device pixels.
      expect(rule).toContain('--eldra-focus-alpha: 0');
      if (utility === '.eldra\\:eldra-focus') {
        expect(rule).toContain('--eldra-focus-from-width: var(--eldra-focus-rest-width, 1px)');
        expect(rule).toContain('--eldra-focus-from-offset: var(--eldra-focus-rest-offset, 0px)');
        expect(rule).toMatch(/--eldra-focus-gap: calc\(/);
        expect(rule).toMatch(/--eldra-focus-reach: calc\(/);
        expect(rule).toMatch(/--tw-ring-offset-shadow:\s*0 0 0 var\(--eldra-focus-gap\)/);
        expect(rule).toMatch(/--tw-ring-shadow:\s*0 0 0 var\(--eldra-focus-reach\)/);
        expect(rule).toMatch(/0 0 0 var\(--eldra-focus-reach\)/);
        expect(rule).not.toMatch(/outline-(width|offset): calc\(/);
      } else {
        expect(rule).toContain('calc(var(--eldra-focus-offset) + var(--eldra-focus-width))');
      }
      expect(rule).toContain('calc(var(--eldra-focus-alpha) * 100%)');
      expect(rule).toContain('--eldra-focus-alpha: 1');

      // Tailwind compiles a plain fallback for engines with no `color-mix`, using the mix's first
      // colour. Written `transparent` first, that fallback is the *resting* state; the other way
      // round it is a permanent ring painted around every control. This pins the ordering.
      expect(rule).toMatch(/--tw-(ring-offset|inset-ring)-shadow:[^;]*transparent[^;]*;/);

      // The ring lives in Tailwind's ring variables and `box-shadow` is exactly the list Tailwind's
      // `shadow-*` utilities write, so a consumer's `shadow-*` on the element keeps the ring.
      expect(rule).toMatch(
        /box-shadow:\s*var\(--tw-inset-shadow, 0 0 #0000\),\s*var\(--tw-inset-ring-shadow, 0 0 #0000\),\s*var\(--tw-ring-offset-shadow, 0 0 #0000\),\s*var\(--tw-ring-shadow, 0 0 #0000\),\s*var\(--tw-shadow, 0 0 #0000\);/
      );
      expect(rule).toContain('@supports not (color: color-mix(in srgb, red, red))');

      // ...and the colour and press changes a control makes, in the same shorthand — which is the
      // whole point: one declaration, so nothing can replace half of it. Colours fade over
      // duration-base, eased at both ends (at duration-fast ease-out a colour reads as a switch);
      // the press stays duration-fast ease-out, so it still feels immediate.
      expect(rule).toContain(
        'background-color var(--eldra-duration-base) var(--eldra-ease-in-out)'
      );
      expect(rule).toContain('border-color var(--eldra-duration-base) var(--eldra-ease-in-out)');
      expect(rule).toContain('translate var(--eldra-duration-fast)');
      // The Button's press is `active:scale-[0.98]`, and Tailwind v4 compiles `scale-*` to the
      // independent `scale` property rather than to a `transform` shorthand — so `scale` has to be
      // in this list by name or the press lands instantly. A `transform` entry would not cover it.
      expect(rule).toContain('scale var(--eldra-duration-fast)');
      // Reduced motion is handled by the utility, so components need no `motion-reduce:` class.
      expect(rule).toContain('prefers-reduced-motion: reduce');
    }

    // The ring stays on while a popover is open (a Select/MultiSelect trigger, which a pointer
    // press leaves focused but not `:focus-visible`). Another *modifier*: it may only turn the
    // alpha on, keyed to the element's own `aria-expanded`, and must carry no transition and no
    // ring of its own, or `eldra-focus` beside it stops owning them.
    const openCss = await compileKitCss(['eldra:eldra-focus-open']);
    const openStart = openCss.indexOf('.eldra\\:eldra-focus-open');
    expect(openStart, 'eldra-focus-open is not in the compiled stylesheet').toBeGreaterThan(-1);
    const open = openCss.slice(openStart, openCss.indexOf('\n  }', openStart));
    expect(open.startsWith(".eldra\\:eldra-focus-open[aria-expanded='true'] {")).toBe(true);
    expect(open).toContain('--eldra-focus-alpha: 1');
    expect(open).not.toContain('transition');
    // ...and the forced-colours half, which `eldra-focus`'s own rule cannot cover for the same
    // reason it cannot cover the proxy's: that rule is keyed to `:focus-visible`.
    expect(openCss).toContain('@media (forced-colors: active)');
    expect(openCss).toContain('outline-color: Highlight');

    // Proxy focus (a Checkbox's hidden input inside its drawn box) is a *modifier*: it must add a
    // `:has(:focus-visible)` rule and nothing else, so `eldra-focus` beside it keeps owning the
    // ring, the transition and the reduced-motion rule. A `@utility` whose nested selector failed
    // to compile would leave a box that never shows a focus ring, silently.
    const proxyStart = css.indexOf('.eldra\\:eldra-focus-proxy');
    expect(proxyStart, 'eldra-focus-proxy is not in the compiled stylesheet').toBeGreaterThan(-1);
    const proxy = css.slice(proxyStart, css.indexOf('\n  }', proxyStart));
    expect(proxy.startsWith('.eldra\\:eldra-focus-proxy:has(:focus-visible) {')).toBe(true);
    expect(proxy).toContain('--eldra-focus-alpha: 1');
    expect(proxy).not.toContain('transition');
    // ...and the forced-colours half, which `eldra-focus`'s own rule cannot cover: that one is
    // keyed to this element's `:focus-visible`, which never happens on a box that is not
    // focusable. Forced colours drop `box-shadow` entirely, so the ring there is the `outline`,
    // switched on at full width with no animation — the system Highlight colour is not ours to
    // fade.
    expect(css).toContain('@media (forced-colors: active)');
    expect(css).toContain('outline-width: var(--eldra-focus-width)');
    expect(css).toContain('outline-color: Highlight');
  });
});
