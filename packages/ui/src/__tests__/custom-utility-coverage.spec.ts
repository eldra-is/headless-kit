import { readFileSync } from 'node:fs';
// happy-dom's global `URL` refuses the `file:` scheme that `import.meta.url` is here; Node's own
// `URL` under another name resolves it (the same workaround `focus-transition.spec.ts` and
// `source-scan.spec.ts` document).
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cx } from '../utils/cx';

/**
 * `src/utils/cx.ts` extends `tailwind-merge` with a class group for every custom `@utility` this
 * package declares, which is what lets a consumer's `classes.root: 'rounded-full'` replace
 * `eldra-link-radius` instead of landing beside it (see the merge-aware `cx` change and its own
 * doc comment). Nothing enforced that the two files stay in sync: `eldra-link-radius` shipped with
 * an `@utility` rule but no class group, so `cx('eldra-link-radius', 'eldra-link-radius')` kept
 * both instead of collapsing to one — a duplicate that only showed up as a slightly longer `class`
 * attribute, never a test failure.
 *
 * This spec parses every `@utility <name>` out of `tailwind.css` and calls `cx(name, name)` for
 * each: an unregistered utility keeps both copies (two tokens), a registered one — whether in its
 * own group or folded into a stock one — collapses to one. That is a general enough probe to catch
 * the next utility someone adds to `tailwind.css` and forgets to register here, regardless of
 * which group it belongs in.
 */
const tailwindCssPath = fileURLToPath(new NodeURL('../styles/tailwind.css', import.meta.url));
const source = readFileSync(tailwindCssPath, 'utf8');
const utilityNames = [...source.matchAll(/^@utility\s+([\w-]+)\s*\{/gm)].map((match) => match[1]);

describe('every custom @utility is covered by the cx() merge config', () => {
  it('finds the utilities to check', () => {
    expect(utilityNames.length).toBeGreaterThan(10);
  });

  it.each(utilityNames)('cx(%s, %s) collapses to one token', (name) => {
    expect(cx(name, name)).toBe(name);
  });
});
