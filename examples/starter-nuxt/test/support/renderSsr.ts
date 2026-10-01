import { createSSRApp, defineComponent, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import AppShell from '../../app/app.vue';
import { mountOptions } from './mountBlock';
import { renderPageFixtureRegions, type PageFixture } from '../../stories/support/pageBlocks';

/**
 * Server rendering, with the same `EldraContext`/messages/locale/currency/storefront wiring
 * `mountBlock.ts`'s `mountOptions` gives a client mount — the whole point being that this runs
 * under Vitest's *node* environment, where there is no `window` and no `document` at all.
 *
 * `nuxi generate` and every SSR request render blocks exactly this way, and nothing in the test
 * suite used to: `test/starter.spec.ts`'s `nuxi generate` run has no gateway credentials, so it only
 * ever renders the not-found shell and no block is server-rendered by it. That is how three
 * unguarded `watchEffect`s in `blocks/navigation/Block.vue` — the one block every page carries —
 * could touch `window`/`document` with every gate green (a `flush: 'pre'` effect with no callback
 * runs its body immediately, during `setup()`, on the server too). `test/pages/ssr.spec.ts` is the
 * spec that closes it.
 *
 * A spec importing this must run in the node environment (no environment docblock at all — node is
 * `vitest.config.ts`'s default), or the guards it exercises are trivially satisfied by jsdom's
 * globals and it proves nothing. Note that Vitest reads that pragma out of a file's leading
 * comments, so a spec must not even mention it in prose.
 */

function applyProvides(
  app: ReturnType<typeof createSSRApp>,
  overrides: Record<symbol, unknown> = {}
): void {
  const { global } = mountOptions({ entry: { id: '', data: {} } });
  const provide = { ...global.provide, ...overrides };
  for (const key of Reflect.ownKeys(provide) as symbol[]) {
    app.provide(key, provide[key]);
  }
  // Blocks hand `app/components/EldraRouterLink.vue` to `@eldrajs/ui` for same-site destinations,
  // and that component's template writes the `<NuxtLink>` tag — a name only a registered component
  // resolves. Same stub `mountOptions` registers for a client mount.
  app.component('NuxtLink', (global.components as { NuxtLink: Component }).NuxtLink);
}

/**
 * Server-renders one block with its merged mock data, the way a real page renders it.
 *
 * `provides` replaces individual injections for a spec that needs one of them to be something
 * else — `STOREFRONT_KEY`, for the gateway storefront a prerender actually runs against
 * (`test/prerenderCommerce.spec.ts`), rather than the demo catalogue every other spec wants.
 */
export async function renderBlockToString(
  component: Component,
  entry: { id: string; data: Record<string, unknown> },
  provides: Record<symbol, unknown> = {}
): Promise<string> {
  const app = createSSRApp(defineComponent({ setup: () => () => h(component, { entry }) }));
  applyProvides(app, provides);
  return renderToString(app);
}

/**
 * Server-renders the app shell (`app/app.vue`) itself, with `page` standing in for `<NuxtPage>`.
 *
 * It is the only way a spec sees what the theme puts into *every* prerendered page regardless of
 * what an author composed — the skip link, the one cart drawer the shell hosts, the toast region —
 * and therefore the only way to prove that a `drawer`-variant `cart` block on the page adds no
 * second `<dialog>` to the generated HTML. `app.vue` reads `eldraRouteKey` as a Nuxt auto-import;
 * server-side that resolves to `undefined` and `<NuxtPage>`'s stand-in simply ignores the key.
 */
export async function renderShellToString(
  page: Component,
  provides: Record<symbol, unknown> = {}
): Promise<string> {
  const app = createSSRApp(AppShell);
  applyProvides(app, provides);
  app.component('NuxtPage', page);
  return renderToString(app);
}

/** Server-renders a whole page fixture, in the same three landmark regions the route renders. */
export async function renderPageToString(fixture: PageFixture): Promise<string> {
  const app = createSSRApp(
    defineComponent({ setup: () => () => renderPageFixtureRegions(fixture, 'renderPageToString') })
  );
  applyProvides(app);
  return renderToString(app);
}
