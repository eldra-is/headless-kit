import { readFileSync } from 'node:fs';
// happy-dom's global `URL` refuses the `file:` scheme that `import.meta.url` is here; Node's own
// `URL` under another name resolves it (the same workaround `custom-utility-coverage.spec.ts` and
// `focus-transition.spec.ts` document).
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `tailwind.css`'s `@theme` block declares `--container-narrow`/`-content`/`-wide` as literal
 * lengths, not `var(--eldra-container-*)` (see that block's own comment): a container-query
 * condition cannot reference a custom property, so a `var()` there silently compiled every
 * `@narrow:`/`@content:`/`@wide:` variant in the package to nothing (bug, fixed 2026-09-27).
 *
 * `scripts/build-tokens.mjs` cannot generate this block for us — it only ever emits a
 * `var()`-holding `--eldra-*` custom property into `tokens.css`, never a literal into
 * `tailwind.css` — so the three numbers here are copied by hand from
 * `eldra-starter-spec/tokens.json`'s `layout.container-{narrow,content,wide}` tokens. This spec is
 * the guard `check:tokens` cannot be, at the source level rather than the built one: it reads both
 * files directly and fails the moment a future token change drifts them apart, without needing a
 * build first.
 */
const tailwindCssPath = fileURLToPath(new NodeURL('../styles/tailwind.css', import.meta.url));
const tokensPath = fileURLToPath(
  new NodeURL('../../../../eldra-starter-spec/tokens.json', import.meta.url)
);

const tailwindSource = readFileSync(tailwindCssPath, 'utf8');
const tokens = JSON.parse(readFileSync(tokensPath, 'utf8')) as {
  layout?: Record<string, { $value?: unknown }>;
};

const WIDTHS = ['narrow', 'content', 'wide'] as const;

describe('the @theme container-query breakpoint literals match tokens.json', () => {
  it.each(WIDTHS)('--container-%s is a literal equal to the matching layout token', (name) => {
    const match = new RegExp(`--container-${name}:\\s*([^;]+);`).exec(tailwindSource);
    expect(match, `--container-${name} is missing from tailwind.css's @theme block`).not.toBeNull();
    const literal = match![1].trim();

    // The exact defect this guards against: a `var()` here compiles the variant to nothing.
    expect(literal).not.toMatch(/var\(/);

    const tokenKey = `container-${name}`;
    const tokenValue = tokens.layout?.[tokenKey]?.$value;
    expect(
      tokenValue,
      `eldra-starter-spec/tokens.json is missing layout.${tokenKey}`
    ).toBeDefined();
    expect(literal).toBe(tokenValue);
  });

  // `--container-tablet` (48rem) and `--container-two-col` (36rem) are already literal and have no
  // layout-width token of their own (see tailwind.css's own comments on each) — nothing to compare
  // them against here, so they are deliberately outside this spec's scope.
});
