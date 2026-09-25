import { describe, expect, it } from 'vitest';
import * as ui from '../index';
import { componentNames } from '../componentNames';

/**
 * `componentNames` is hand-maintained (see its own doc comment for why), which means nothing
 * forces it to track `src/index.ts` as components are added, renamed or removed. This spec is that
 * force: it imports the real root entry and compares its component keys against the list, so a
 * component that lands in `index.ts` without a matching `componentNames` entry — or a name that
 * lingers in `componentNames` after its component is renamed or removed — fails here instead of
 * silently going unresolved (or wrongly resolved) by `EldraUiResolver`.
 *
 * A component's compiled default export is an object (a Vue SFC compiles to one, whether it is
 * `<script setup>` or an options object) with a `render` and/or `setup` function on it; every other
 * value export from the root entry is a plain function, a symbol, a message object, or a
 * lowercase-named export, so filtering on "uppercase key, object value with render/setup" finds
 * exactly the components and nothing else. Proven by mutation: temporarily removing a component
 * from `componentNames` turns this spec red for that one name while leaving the others green, and
 * temporarily adding a fake key to `componentNames` does the same in the other direction.
 */
function isComponent(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { render?: unknown; setup?: unknown };
  return typeof candidate.render === 'function' || typeof candidate.setup === 'function';
}

describe('componentNames matches src/index.ts', () => {
  const exportedComponentNames = Object.keys(ui)
    .filter((key) => /^[A-Z]/.test(key))
    .filter((key) => isComponent((ui as Record<string, unknown>)[key]));

  it('finds the components to check', () => {
    expect(exportedComponentNames.length).toBeGreaterThan(10);
  });

  it('has exactly the components src/index.ts exports, no more and no fewer', () => {
    expect([...componentNames].sort()).toEqual(exportedComponentNames.sort());
  });
});
