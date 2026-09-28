import { createSSRApp, defineComponent, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { mountOptions } from './mountBlock';
import { renderPageFixtureRegions, type PageFixture } from '../../stories/support/pageBlocks';

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
