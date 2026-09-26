import { readFileSync } from 'node:fs';
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
