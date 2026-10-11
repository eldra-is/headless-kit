import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `src/index.ts`'s `export type { ... } from '...'` blocks are meant to read in one alphabetical
 * order — both the names *within* each block, and the blocks themselves, ordered by their own
 * first name (see the file's own comment above the "Component types" section). Nothing enforced
 * either half of that before this spec: `componentNames.spec.ts` sorts both sides of its own
 * comparison, which (M16) is exactly why a `componentNames` entry out of order, and an
 * out-of-order type-export block (the `Price`/`ProductCard`/`QuantityStepper` block once landed
 * after `Section`'s, though `P` sorts before `R`/`S`), both shipped unnoticed.
 *
 * This parses the real `src/index.ts` source rather than re-typing its export list, so it catches
 * drift the way `componentNames.spec.ts` catches a missing/renamed component export.
 */

const indexPath = fileURLToPath(new NodeURL('../index.ts', import.meta.url));
const source = readFileSync(indexPath, 'utf8');

// Each `export type { A, B, C } from '...'` block, single- or multi-line. None of this package's
// type-export blocks nest braces, so a non-greedy `[^}]+` is a safe, simple match.
const blockPattern = /export type \{([^}]+)\} from '([^']+)';/g;

interface Block {
  source: string;
  names: string[];
}

function parseBlocks(): Block[] {
  const blocks: Block[] = [];
  for (const match of source.matchAll(blockPattern)) {
    const names = (match[1] as string)
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      // A `type X` re-export names the type only for sorting purposes — none occur in this file's
      // "Component types" section today, but this keeps the parse correct if one is ever added.
      .map((name) => name.replace(/^type\s+/, ''));
    blocks.push({ source: match[2] as string, names });
  }
  return blocks;
}

describe('src/index.ts export type blocks are alphabetical', () => {
  const blocks = parseBlocks();

  it('finds blocks to check', () => {
    expect(blocks.length).toBeGreaterThan(10);
  });

  it.each(blocks.map((block) => [block.source, block] as const))(
    '%s exports its names in alphabetical order',
    (_source, block) => {
      expect(block.names).toEqual([...block.names].sort());
    }
  );

  it('orders the blocks themselves by their own first exported name', () => {
    const firstNames = blocks.map((block) => block.names[0] as string);
    expect(firstNames).toEqual([...firstNames].sort());
  });
});

// Each `export { default as X } from '...';` component-value-export line.
const valueExportPattern = /export \{ default as (\w+) \} from '([^']+)';/g;

function parseValueExports(): string[] {
  return [...source.matchAll(valueExportPattern)].map((match) => match[1] as string);
}

/**
 * M1: the file's own header comment claims the component value-export list (`export { default as
 * X } from …`) is alphabetical, but nothing checked it — `componentNames.spec.ts` compares against
 * `componentNames`, sorting *both* sides, so an inversion here (`Popover` before `Pagination`,
 * `Tooltip` before `Toast`/`Toaster`) never failed anything. A module namespace object's own keys
 * are always alphabetical regardless of declaration order (`Object.keys(ui)` in that spec proves
 * nothing about *this* file's source order), so this is a pure readability/convention guard, not a
 * runtime-behaviour one — checked directly against the parsed source instead.
 */
describe('src/index.ts component value-exports are alphabetical', () => {
  const names = parseValueExports();

  it('finds component value-exports to check', () => {
    expect(names.length).toBeGreaterThan(10);
  });

  it('lists them in alphabetical order', () => {
    expect(names).toEqual([...names].sort());
  });
});

/**
 * Final review I3: `Toast`/`Toaster` were the one component directory with a `types.ts` and no
 * matching `export type { … } from './components/toast/types'` block — every other directory had
 * one, so nothing before this caught the gap. Rather than guard `toast` by name (fixing today's
 * miss without stopping the next one), this walks every `src/components/*` directory that has a
 * `types.ts` and asserts a block sourcing exactly that path exists somewhere in `index.ts`.
 * `select` is exempt from "one block per directory" only in the sense that it is still checked —
 * `MultiSelect` and `Select` share one file and one block, which is what the block-source scan
 * below already finds.
 */
describe("src/index.ts re-exports every component directory's types.ts", () => {
  const componentsDir = fileURLToPath(new NodeURL('../components/', import.meta.url));
  const dirs = readdirSync(componentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(`${componentsDir}${name}/types.ts`))
    .sort();

  it('finds component directories with a types.ts to check', () => {
    expect(dirs.length).toBeGreaterThan(10);
  });

  it.each(dirs)('components/%s/types.ts is re-exported from a type block', (dir) => {
    const expectedSource = `./components/${dir}/types`;
    const hasBlock = parseBlocks().some((block) => block.source === expectedSource);
    expect(
      hasBlock,
      `src/index.ts has no "export type { … } from '${expectedSource}';" block`
    ).toBe(true);
  });
});
