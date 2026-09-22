import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain JS module, shared with scripts/previews.mjs so the
// hash written to .eldra/previews.json and the hash checked here can never
// drift apart; see previewHash.mjs's own comment.
import { hashBlock, listBlockIds } from '../scripts/previewHash.mjs';

const rootDir = fileURLToPath(new URL('..', import.meta.url));

describe('block previews', () => {
  const recorded: Record<string, string> = JSON.parse(
    readFileSync(new URL('../.eldra/previews.json', import.meta.url), 'utf8')
  );
  const ids: string[] = listBlockIds(rootDir);

  it('has a recorded hash for every block', () => {
    expect(Object.keys(recorded).sort()).toEqual(ids);
  });

  it.each(ids)('preview for %s is current', (id) => {
    const current = hashBlock(rootDir, id);
    expect(
      recorded[id],
      `preview for ${id} is stale — run pnpm --filter starter-nuxt previews`
    ).toBe(current);
  });
});
