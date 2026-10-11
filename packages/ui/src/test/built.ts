import { existsSync } from 'node:fs';
import { it } from 'vitest';

/** True when every listed file exists — that is, when the package has been built. */
export function isBuilt(...files: string[]): boolean {
  return files.every((file) => existsSync(file));
}

const HOW = 'run `pnpm --filter @eldrajs/ui build` before `test`';

/**
 * The "no `dist/`" branch of a built-artifact guard.
 *
 * `dist/` is git-ignored, so a contributor running `pnpm --filter @eldrajs/ui test` on a clean
 * checkout has none, and the guards that read the built artifact cannot run. Locally that is a
 * skip: the message says what to run. **In CI it is a failure.** The root `check` runs `build`
 * before `test`, so a missing `dist/` there means the build did not happen and the strongest
 * guards on this package — the `@source './'` scan, the focus-ring compile and the `vee-validate`
 * isolation of the built entry — just went vacuous while the run stayed green. A guard that can
 * disappear without anyone noticing is not a guard.
 *
 * Call it inside the same `describe` as the `it.runIf(built)` specs. It registers nothing when the
 * package is built.
 */
export function itFailsWithoutDist(built: boolean): void {
  if (built) return;
  if (process.env.CI) {
    it('has a built dist/ to read, which CI must always have', () => {
      throw new Error(
        `dist/ is missing, so this file's built-artifact guards did not run: ${HOW}.`
      );
    });
    return;
  }
  it.skip(`needs a build first — ${HOW}`, () => {});
}
