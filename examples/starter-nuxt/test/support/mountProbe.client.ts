import { defineNuxtPlugin } from 'nuxt/app';

/**
 * Test-only instrumentation: `prerenderRefresh.browser.spec.ts` copies this file into the generated
 * site's `app/plugins/` before it builds it. It lives under `test/support/`, and the starter has no
 * such plugin of its own — so `eldra-theme init` does copy this file (it copies the whole starter,
 * `test/` included) but copies it **inert**, where no Nuxt build ever looks at it. Nothing a
 * customer ships contains it; only this spec's tmpdir copy has it installed.
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
 *
 * It also exposes `__eldraPush`, which drives the router from outside the page. A spec can click
 * its way to every destination the site links to; it cannot click its way to one the site has no
 * link for, and "an unknown route is answered without asking the gateway" is exactly a destination
 * of that kind.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const created: Record<string, number> = {};
  const mounted: Record<string, number> = {};
  const probe = window as unknown as {
    __eldraCreated: Record<string, number>;
    __eldraMounted: Record<string, number>;
    __eldraPush: (path: string) => Promise<unknown>;
  };
  probe.__eldraCreated = created;
  probe.__eldraMounted = mounted;
  // A client-side navigation the page carries no link to — an unknown route. A spec cannot click
  // its way to one, and driving the router from outside is the only way to exercise what a static
  // build must answer without the gateway.
  probe.__eldraPush = (path) => nuxtApp.$router.push(path);

  const countInto = (counts: Record<string, number>, instance: Record<string, unknown>): void => {
    const entry = instance.entry;
    if (typeof entry !== 'object' || entry === null) return;
    const { id, schemaApiId } = entry as {
      id?: unknown;
      schemaApiId?: unknown;
    };
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
