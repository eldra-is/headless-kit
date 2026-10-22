import { readFileSync } from 'node:fs';
// happy-dom's global `URL` refuses the `file:` scheme; Node's own resolves it.
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { withoutPreflight } from '../components-css.mjs';

const RESET = fileURLToPath(new NodeURL('../../src/styles/components-reset.css', import.meta.url));
const SCOPE = ':where([data-eldra-ui], [data-eldra-ui] [data-part])';

function selectors(css: string): string[] {
  const lists = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)];
  return lists.flatMap(([, list]) => {
    const out = [''];
    let depth = 0;
    for (const char of list!) {
      depth += char === '(' ? 1 : char === ')' ? -1 : 0;
      if (char === ',' && depth === 0) out.push('');
      else out[out.length - 1] += char;
    }
    return out.map((selector) => selector.trim());
  });
}

function withoutParentheses(text: string): string {
  let previous;
  do {
    previous = text;
    text = text.replace(/\([^()]*\)/g, '');
  } while (text !== previous);
  return text;
}

const STYLE = [
  '@layer theme {',
  '  :root {',
  '    --font-sans: system-ui;',
  '  }',
  '}',
  '',
  '@layer base {',
  '  *, :after, :before {',
  '    margin: 0;',
  '  }',
  '',
  '  ol, ul, menu {',
  '    list-style: none;',
  '  }',
  '}',
  '',
  '@layer components;',
  '',
  '@layer utilities {',
  '  .flex {',
  '    display: flex;',
  '  }',
  '}',
  '',
].join('\n');

describe('withoutPreflight', () => {
  it('replaces the base layer and keeps everything around it byte for byte', () => {
    const out = withoutPreflight(STYLE, ':where([data-part]) { margin: 0; }\n');
    expect(out).not.toContain('ol, ul, menu');
    expect(out).toContain('@layer base {\n:where([data-part]) { margin: 0; }\n}\n');
    expect(out.slice(0, out.indexOf('@layer base'))).toBe(
      STYLE.slice(0, STYLE.indexOf('@layer base'))
    );
    expect(out.slice(out.indexOf('@layer components;'))).toBe(
      STYLE.slice(STYLE.indexOf('@layer components;'))
    );
  });

  it('keeps the layer order: theme, base, components, utilities', () => {
    const out = withoutPreflight(STYLE, '');
    const order = [...out.matchAll(/^@layer (\w+)/gm)].map((match) => match[1]);
    expect(order).toEqual(['theme', 'base', 'components', 'utilities']);
  });

  it('fails loudly when the compiled stylesheet has no base layer', () => {
    expect(() => withoutPreflight(STYLE.replace('@layer base {', '@layer other {'), '')).toThrow(
      /exactly one top-level `@layer base`/
    );
  });

  it("scopes every rule of the reset to Eldra's components and nothing beside them", () => {
    const all = selectors(readFileSync(RESET, 'utf8'));
    expect(all.length).toBeGreaterThan(20);
    const unscoped = all.filter(
      (selector) =>
        !selector.startsWith(SCOPE) ||
        /[\s>+~]/.test(withoutParentheses(selector.slice(SCOPE.length)))
    );
    expect(unscoped).toEqual([]);
  });

  it('fails loudly when the base layer appears twice', () => {
    const twice = `${STYLE}\n@layer base {\n  a {\n    color: inherit;\n  }\n}\n`;
    expect(() => withoutPreflight(twice, '')).toThrow(/exactly one top-level `@layer base`/);
  });
});
