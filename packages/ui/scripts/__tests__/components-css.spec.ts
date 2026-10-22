import { describe, expect, it } from 'vitest';
import { withoutPreflight } from '../components-css.mjs';

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

  it('fails loudly when the base layer appears twice', () => {
    const twice = `${STYLE}\n@layer base {\n  a {\n    color: inherit;\n  }\n}\n`;
    expect(() => withoutPreflight(twice, '')).toThrow(/exactly one top-level `@layer base`/);
  });
});
