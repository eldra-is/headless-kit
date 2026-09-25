import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
// happy-dom's global `URL` refuses the `file:` scheme that `import.meta.url` is here; Node's own
// `URL` under another name resolves it (the same workaround `source-scan.spec.ts` documents).
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `eldra-focus` and `eldra-focus-inset` own the transition list of the element they sit on.
 *
 * The defect this guards: `transition` is a single shorthand property, so a component that also
 * carried `transition-[background-color,…] duration-fast` emitted a later rule in the same cascade
 * layer that replaced the ring's `outline-width` and `box-shadow` entries outright. The ring still
 * drew — it just snapped to full size instead of growing in over `duration-base`, which is exactly
 * the kind of regression nobody sees in a still screenshot or an axe run. `src/styles/tailwind.css`
 * now declares every animated property inside the two focus utilities, and this spec keeps
 * components from putting a second `transition` shorthand beside them.
 */
const componentsDir = fileURLToPath(new NodeURL('../components/', import.meta.url));
const distDir = fileURLToPath(new NodeURL('../../dist/', import.meta.url));
const built = existsSync(`${distDir}tailwind.css`) && existsSync(`${distDir}index.js`);

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
        .filter((list) => /(?:^|\s)eldra-focus(?:-always|-inset)?(?:\s|$)/.test(list))
        .filter((list) => OWNED.test(list));
      expect(offenders).toEqual([]);
    }
  );

  it.runIf(built)('compiles a focus ring whose transition grows the outline in', async () => {
    const { compile } = await import('@tailwindcss/node');
    const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';`, {
      base: distDir,
      onDependency() {},
    });
    const css = compiler.build(['eldra-focus', 'eldra-focus-inset', 'eldra-focus-proxy']);

    for (const utility of ['.eldra-focus', '.eldra-focus-inset']) {
      const start = css.indexOf(`${utility} {`);
      expect(start, `${utility} is not in the compiled stylesheet`).toBeGreaterThan(-1);
      const rule = css.slice(start, css.indexOf('\n  }', start));
      // The ring itself, at duration-base.
      expect(rule).toContain('outline-width var(--eldra-duration-base)');
      expect(rule).toContain('box-shadow var(--eldra-duration-base)');
      // ...and the colour and press changes a control makes, at duration-fast, in the same
      // shorthand — which is the whole point: one declaration, so nothing can replace half of it.
      expect(rule).toContain('background-color var(--eldra-duration-fast)');
      expect(rule).toContain('translate var(--eldra-duration-fast)');
      // Reduced motion is handled by the utility, so components need no `motion-reduce:` class.
      expect(rule).toContain('prefers-reduced-motion: reduce');
    }

    // Proxy focus (a Checkbox's hidden input inside its drawn box) is a *modifier*: it must add a
    // `:has(:focus-visible)` rule and nothing else, so `eldra-focus` beside it keeps owning the
    // ring, the transition and the reduced-motion rule. A `@utility` whose nested selector failed
    // to compile would leave a box that never shows a focus ring, silently.
    const proxyStart = css.indexOf('.eldra-focus-proxy');
    expect(proxyStart, 'eldra-focus-proxy is not in the compiled stylesheet').toBeGreaterThan(-1);
    const proxy = css.slice(proxyStart, css.indexOf('\n  }', proxyStart));
    expect(proxy.startsWith('.eldra-focus-proxy:has(:focus-visible) {')).toBe(true);
    expect(proxy).toContain('outline-width: var(--eldra-focus-width)');
    expect(proxy).toContain('box-shadow: 0 0 0 var(--eldra-focus-offset)');
    expect(proxy).not.toContain('transition');
    // ...and the forced-colours half, which `eldra-focus`'s own rule cannot cover: that one is
    // keyed to this element's `:focus-visible`, which never happens on a box that is not focusable.
    expect(css).toContain('@media (forced-colors: active)');
  });

  it.skipIf(built)('needs a build first: run `pnpm --filter @eldrajs/ui build`', () => {
    expect(built).toBe(false);
  });
});
