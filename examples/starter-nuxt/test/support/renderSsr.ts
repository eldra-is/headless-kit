import { createSSRApp, defineComponent, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
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

function applyProvides(app: ReturnType<typeof createSSRApp>): void {
  const { global } = mountOptions({ entry: { id: '', data: {} } });
  for (const key of Reflect.ownKeys(global.provide) as symbol[]) {
    app.provide(key, global.provide[key]);
  }
  // Blocks hand `app/components/EldraRouterLink.vue` to `@eldrajs/ui` for same-site destinations,
  // and that component's template writes the `<NuxtLink>` tag — a name only a registered component
  // resolves. Same stub `mountOptions` registers for a client mount.
  app.component('NuxtLink', (global.components as { NuxtLink: Component }).NuxtLink);
}

/** Server-renders one block with its merged mock data, the way a real page renders it. */
export async function renderBlockToString(
  component: Component,
  entry: { id: string; data: Record<string, unknown> }
): Promise<string> {
  const app = createSSRApp(defineComponent({ setup: () => () => h(component, { entry }) }));
  applyProvides(app);
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
