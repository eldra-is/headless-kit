import { defineNuxtPlugin } from 'nuxt/app';

/**
 * Test-only instrumentation, never shipped: `prerenderRefresh.browser.spec.ts` copies this file
 * into the generated site's `app/plugins/` before it builds it. The starter carries no such
 * plugin, so nothing `eldra-theme init` scaffolds and nothing a customer builds contains it.
 *
 * It counts how many times each **block component instance** is created and mounted in the
 * browser, keyed by the entry it was handed. A request log cannot tell a second render of one
 * block apart from a second block asking the same question; an instance counter can, which is what
 * makes it the right instrument for "is this block subtree being built twice across hydration?".
 *
 * Creations and mounts are counted separately, and the creation count is the one that matters. A
 * block's storefront reads are created in `setup`, so a second *creation* is a second round of
 * reads even when that instance never reaches the DOM — and it does not: the page Nuxt throws away
 * mid-hydration is a `<Suspense>` branch discarded before its `mounted` hooks flush, which is why
 * the defect this spec guards showed up as two identical request bursts with every block still
 * mounted exactly once.
 *
 * A global mixin is the cheapest hook that sees every component, including the lazily imported
 * block chunks that land after `app:mounted`. Every component carrying an entry-shaped `entry`
 * prop is recorded (the block components, and any part a block hands its entry to), so the spec
 * can pick the ones it means by component name rather than trusting this file's guess.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const created: Record<string, number> = {};
  const mounted: Record<string, number> = {};
  const probe = window as unknown as {
    __eldraCreated: Record<string, number>;
    __eldraMounted: Record<string, number>;
  };
  probe.__eldraCreated = created;
  probe.__eldraMounted = mounted;

  const countInto = (counts: Record<string, number>, instance: Record<string, unknown>): void => {
    const entry = instance.entry;
    if (typeof entry !== 'object' || entry === null) return;
    const { id, schemaApiId } = entry as { id?: unknown; schemaApiId?: unknown };
    if (typeof id !== 'string') return;
    const options = instance.$options as { __name?: string; name?: string };
    const name = options.__name ?? options.name ?? 'anonymous';
    const key = `${name}|${typeof schemaApiId === 'string' ? schemaApiId : '?'}|${id}`;
    counts[key] = (counts[key] ?? 0) + 1;
  };

  nuxtApp.vueApp.mixin({
    created(this: Record<string, unknown>) {
      countInto(created, this);
    },
    mounted(this: Record<string, unknown>) {
      countInto(mounted, this);
    },
  });
});
