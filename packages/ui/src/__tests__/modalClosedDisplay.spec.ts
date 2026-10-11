// happy-dom's global `URL` refuses the `file:` scheme that `import.meta.url` is here; Node's own
// `URL` under another name resolves it (the same workaround `focus-transition.spec.ts` and
// `source-scan.spec.ts` document).
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isBuilt, itFailsWithoutDist } from '../test/built';

/**
 * The built-CSS half of the "closed dialogs render nothing" fix (see `src/test/modal.ts`'s own doc
 * comment for the full mechanism) — every modal root's `hidden open:<value>` pair, compiled,
 * actually behaves the way the unit-level class-list assertions assume it does. Both values this
 * package actually ships are covered: `open:flex` (`Drawer`/`SearchModal`) and `open:block`
 * (`Dialog`/`Lightbox` — see `Dialog.vue`'s own rootClass comment for why those two deliberately
 * do not use `open:flex`).
 *
 * `hidden`/`flex`/`block`/`open:*` are stock Tailwind utilities, not this package's own `@utility`
 * declarations, so `custom-utility-coverage.spec.ts`'s scan of `@utility <name> {` never sees them —
 * this is the dedicated guard for exactly this pair instead.
 */
const distDir = fileURLToPath(new NodeURL('../../dist/', import.meta.url));
const built = isBuilt(`${distDir}tailwind.css`, `${distDir}index.js`);

describe('a closed modal root has no box: the compiled hidden/open:<value> pair', () => {
  it.runIf(built).each(['flex', 'block'] as const)(
    'hidden always sets display: none; open:%s only wins once [open] is back',
    async (value) => {
      const { compile } = await import('@tailwindcss/node');
      const compiler = await compile(`@import 'tailwindcss';\n@import './tailwind.css';`, {
        base: distDir,
        onDependency() {},
      });
      const css = compiler.build(['hidden', `open:${value}`]);

      // `hidden` matches unconditionally — no attribute selector, so it always applies regardless of
      // the `open` attribute. This is what makes a closed dialog (no `open`) disappear.
      const hiddenStart = css.indexOf('.hidden {');
      expect(hiddenStart, '.hidden is not in the compiled stylesheet').toBeGreaterThan(-1);
      const hiddenRule = css.slice(hiddenStart, css.indexOf('}', hiddenStart));
      expect(hiddenRule).toContain('display: none');

      // `open:<value>` only matches with the `open` attribute present — Tailwind v4's `open:`
      // variant compiles to `:is([open], :popover-open, :open)`, so `[open]` is one of three ways
      // this rule can match, never the only one.
      const openStart = css.indexOf(`.open\\:${value}`);
      expect(openStart, `.open\\:${value} is not in the compiled stylesheet`).toBeGreaterThan(-1);
      const openRule = css.slice(openStart, css.indexOf('}', openStart));
      expect(openRule).toContain('[open]');
      expect(openRule).toContain(`display: ${value}`);

      // The specificity claim this whole fix depends on: `.open\:<value>:is(...)` is a class plus a
      // pseudo-class-equivalent selector (two "class" components), `.hidden` alone is one — so once
      // both match (the dialog is open), `open:<value>` wins regardless of source order, and once
      // only `hidden` matches (the dialog is closed), there is nothing to lose to.
      const openSelector = openRule.slice(0, openRule.indexOf('{')).trim();
      const classComponents = openSelector.match(/\.[\w\\:-]+|:[\w-]+(?:\([^)]*\))?/g) ?? [];
      expect(classComponents.length).toBeGreaterThan(1);
    }
  );

  // A missing `dist/` is a skip locally and a **failure** under `CI`; see `src/test/built.ts`.
  itFailsWithoutDist(built);
});
