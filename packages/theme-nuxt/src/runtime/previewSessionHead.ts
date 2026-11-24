/**
 * The veil of a draft preview session drops only once the head shows the draft too (WS-1358).
 *
 * `@unhead/vue`'s client writes the document head in a `setTimeout(0)` after an entry changes
 * (`createHead`'s debounced renderer, `dist/client.mjs`), not in Vue's render. Dropped right after
 * `nextTick()`, the veil could uncover a frame whose `<title>`, description and Open Graph tags
 * are still the pinned build's. This waits for Vue's render, then for the head's: unhead's
 * `dom:rendered` when a render is queued, and in any case a timer queued after it — a timer of the
 * same delay runs after the one unhead queued first, and when no head change is pending there is
 * no render to wait for.
 */

/** The part of an unhead instance this uses. */
export interface HeadRenderHooks {
  hooks?: {
    hook(name: 'dom:rendered', fn: () => void): (() => void) | void;
  };
}

export async function afterHeadRendered(
  head: HeadRenderHooks | undefined,
  tick: () => Promise<unknown>,
  later: (fn: () => void) => void = (fn) => {
    setTimeout(fn, 0);
  }
): Promise<void> {
  await tick();
  await new Promise<void>((resolve) => {
    let done = false;
    const unhook: Array<() => void> = [];
    const finish = (): void => {
      if (done) return;
      done = true;
      for (const off of unhook) off();
      resolve();
    };
    const off = head?.hooks?.hook('dom:rendered', finish);
    if (typeof off === 'function') unhook.push(off);
    later(finish);
  });
}
