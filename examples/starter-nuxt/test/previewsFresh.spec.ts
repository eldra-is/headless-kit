import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  /**
   * Each preview exists twice: `blocks/<id>/preview.png` is the source `scripts/previews.mjs`
   * writes, and `.eldra/previews/<id>.png` is the copy `@eldrajs/vite-plugin-theme`'s scan makes of
   * it on every theme build — the one Studio actually reads. The hashes above cannot see the second
   * one: they hash a block's *sources*, never the image, so a commit can carry a current hash, a
   * current `preview.png`, and a mirror still showing whatever the blocks rendered the last time a
   * build happened to run. That shipped once, advertising prices the theme no longer rendered, and
   * nothing in the suite noticed. The images are bytes from the same file, so equality is exact.
   */
  it.each(ids)('mirror for %s matches the block’s own preview.png', (id) => {
    const source = join(rootDir, 'blocks', id, 'preview.png');
    const mirror = join(rootDir, '.eldra', 'previews', `${id}.png`);
    expect(existsSync(source), `blocks/${id}/preview.png is missing`).toBe(true);
    expect(existsSync(mirror), `.eldra/previews/${id}.png is missing — run a theme build`).toBe(
      true
    );

    const digest = (path: string): string =>
      createHash('sha256').update(readFileSync(path)).digest('hex');
    expect(
      digest(mirror),
      `.eldra/previews/${id}.png is not the current blocks/${id}/preview.png — ` +
        'run pnpm --filter starter-nuxt previews, then a theme build (nuxi prepare) to refresh it'
    ).toBe(digest(source));
  });
});
