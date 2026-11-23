// @vitest-environment jsdom
/**
 * A draft preview session's veil drops only after the head has rendered (`previewSessionHead.ts`,
 * WS-1358): unhead's client writes the head in a `setTimeout(0)` after an entry changes, so the
 * veil waits for Vue's render and then for that one.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { afterHeadRendered } from '../src/runtime/previewSessionHead';
import { PREVIEW_SESSION_DRAFT_TIMEOUT_MS } from '../src/runtime/previewSession';

// Nuxt's own head manager, the one a theme's app runs (`@unhead/vue/client`, through `nuxt`).
const fromNuxt = createRequire(createRequire(import.meta.url).resolve('nuxt/package.json'));
const { createHead } = (await import(
  /* @vite-ignore */ pathToFileURL(fromNuxt.resolve('@unhead/vue/client')).href
)) as { createHead: () => { push(input: { title: string }): unknown } };

describe('afterHeadRendered', () => {
  it('resolves after a head change unhead queued is in the document', async () => {
    document.head.innerHTML = '<title>Pinned</title>';
    const head = createHead();
    head.push({ title: 'Pinned' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const order: string[] = [];
    // The draft's head arrives with the draft's render, just before the veil would drop.
    head.push({ title: 'Draft' });
    await afterHeadRendered(head, async () => {
      await nextTick();
      order.push(`after the render: ${document.title}`);
    });
    order.push(`when the veil drops: ${document.title}`);
    expect(order).toEqual(['after the render: Pinned', 'when the veil drops: Draft']);
  });

  it('does not wait for a head render that is not coming', async () => {
    const hook = vi.fn(() => () => undefined);
    const later = vi.fn((fn: () => void) => fn());
    await afterHeadRendered({ hooks: { hook } }, () => Promise.resolve(), later);
    expect(hook).toHaveBeenCalledWith('dom:rendered', expect.any(Function));
    expect(later).toHaveBeenCalledTimes(1);
  });

  it('resolves on dom:rendered and unhooks', async () => {
    let rendered: (() => void) | undefined;
    const off = vi.fn();
    const pending = afterHeadRendered(
      {
        hooks: {
          hook: (_name, fn) => {
            rendered = fn;
            return off;
          },
        },
      },
      () => Promise.resolve(),
      () => undefined
    );
    await Promise.resolve();
    await Promise.resolve();
    rendered?.();
    await pending;
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('works without a head manager', async () => {
    await expect(afterHeadRendered(undefined, () => Promise.resolve())).resolves.toBeUndefined();
    expect(PREVIEW_SESSION_DRAFT_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
