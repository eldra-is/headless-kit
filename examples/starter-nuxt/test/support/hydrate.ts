import { createSSRApp, defineComponent, h, type App, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { mountOptions } from './mountBlock';

/**
 * Server-render a block and then **hydrate that exact markup** with a second app, the way a
 * prerendered page reaches a visitor's browser. `renderSsr.ts` renders the server half in the node
 * environment to prove a block touches no `window`; this file is the other half and needs a DOM, so
 * a spec importing it runs under jsdom.
 *
 * What it exists to catch: a block whose first *client* render differs from the server's. On a
 * prerendered page the storefront result is not in the same state on both sides — `gateway.ts`'s
 * `createGatewayResult` sets `loading = true` synchronously, fills `data` from the hydration payload
 * in the same turn, and only clears `loading` after `await handle.settled` — so any presentation a
 * block derives from `loading`, `pending` or `revalidating` is live during hydration and dead during
 * the render it has to match. Vue patches the difference and logs a hydration warning; a visitor
 * sees the block repaint.
 *
 * Both halves are compared after a round trip through the DOM parser, because
 * `container.innerHTML` re-serialises what the parser made of the server's string (quoting, empty
 * attributes, void elements) and a raw string comparison would fail on that alone.
 */
export interface BlockEntry {
  id: string;
  data: Record<string, unknown>;
}

function createBlockApp(
  component: Component,
  entry: BlockEntry,
  provides: Record<symbol, unknown>
): App {
  const app = createSSRApp(defineComponent({ setup: () => () => h(component, { entry }) }));
  const { global } = mountOptions({ entry: { id: '', data: {} } });
  const merged: Record<symbol, unknown> = { ...global.provide, ...provides };
  for (const key of Reflect.ownKeys(merged) as symbol[]) app.provide(key, merged[key]);
  // Blocks hand `app/components/EldraRouterLink.vue` to `@eldrajs/ui` for same-site destinations,
  // and that component's template writes the `<NuxtLink>` tag — a name only a registered component
  // resolves. Same stub `mountOptions` registers for a client mount.
  app.component('NuxtLink', (global.components as { NuxtLink: Component }).NuxtLink);
  return app;
}

/** The server's half: the HTML a prerendered page would ship. */
export async function renderBlockHtml(
  component: Component,
  entry: BlockEntry,
  provides: Record<symbol, unknown> = {}
): Promise<string> {
  return renderToString(createBlockApp(component, entry, provides));
}

export interface HydrationRun {
  /** The DOM immediately after hydration, before any tick — the browser's *first* paint. */
  firstPaint: string;
  /** What the same markup looks like parsed and re-serialised without hydrating: the target. */
  expected: string;
  /** Vue's own console output during the mount; a mismatch shows up here. */
  warnings: string[];
  container: HTMLElement;
  unmount(): void;
}

export function hydrateBlock(
  component: Component,
  entry: BlockEntry,
  html: string,
  provides: Record<symbol, unknown> = {}
): HydrationRun {
  const baseline = document.createElement('div');
  baseline.innerHTML = html;

  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  const warnings: string[] = [];
  const record =
    (original: (...args: unknown[]) => void) =>
    (...args: unknown[]): void => {
      warnings.push(args.map((arg) => String(arg)).join(' '));
      void original;
    };
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = record(originalWarn) as typeof console.warn;
  console.error = record(originalError) as typeof console.error;

  let app: App;
  try {
    app = createBlockApp(component, entry, provides);
    // `createSSRApp` + a container that already has content is a hydration, not a fresh mount.
    app.mount(container);
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }

  return {
    firstPaint: container.innerHTML,
    expected: baseline.innerHTML,
    warnings,
    container,
    unmount: () => {
      app.unmount();
      container.remove();
    },
  };
}

/** The hydration-mismatch subset of `warnings` — the ones this file exists to fail on. */
export function hydrationWarnings(run: HydrationRun): string[] {
  return run.warnings.filter((warning) => /hydration/i.test(warning));
}
